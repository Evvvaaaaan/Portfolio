import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FIELD_RADIUS, WORLD_UNIT_KM, horizonRadius, surfaceHeight, tracePhoton } from './physics.js'

const gridVertex = `
  varying vec2 vPosition;
  uniform float uRadius;
  void main() {
    vPosition = position.xy;
    float r = length(position.xy);
    float height = .84 * (sqrt(uRadius * max(0., r - uRadius)) - sqrt(uRadius * (22. - uRadius)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, height, position.y, 1.);
  }
`
const gridFragment = `
  varying vec2 vPosition;
  uniform float uRadius;
  void main() {
    float r = length(vPosition);
    if (r < uRadius || r > 22.) discard;
    vec2 p = vPosition;
    vec2 width = max(fwidth(p), vec2(.0001));
    vec2 cell = abs(fract(p - .5) - .5) / width;
    float grid = 1. - min(min(cell.x, cell.y), 1.);
    vec2 majorCell = abs(fract(p / 5. - .5) - .5) / (width / 5.);
    float major = 1. - min(min(majorCell.x, majorCell.y), 1.);
    float edge = 1. - smoothstep(15., 22., r);
    float well = exp(-max(0., r - uRadius) * .32) * min(uRadius, 1.);
    vec3 color = mix(vec3(.20, .49, .50), vec3(.88, .57, .29), well);
    float alpha = (.028 + grid * .30 + major * .20) * edge;
    gl_FragColor = vec4(color, alpha);
  }
`

function glowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, '#fff5d8')
  gradient.addColorStop(0.12, '#ffd49bcc')
  gradient.addColorStop(0.4, '#ee8d3c44')
  gradient.addColorStop(1, '#ee8d3c00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

export function createCurvatureScene(host, onFailure) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.setClearColor(0x080d10, 0)
  const canvas = renderer.domElement
  canvas.className = 'cv-canvas'
  canvas.setAttribute('aria-label', '드래그로 회전하고 스크롤로 확대하는 3D 공간 곡률')
  host.appendChild(canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.09
  controls.enablePan = false
  controls.minDistance = 12
  controls.maxDistance = 70
  controls.minPolarAngle = 0.025
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, -2, 0)

  const gridMaterial = new THREE.ShaderMaterial({
    vertexShader: gridVertex, fragmentShader: gridFragment,
    uniforms: { uRadius: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  })
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_RADIUS * 2, FIELD_RADIUS * 2, 160, 160), gridMaterial)
  scene.add(grid)

  // A sparse, deterministic background; no external textures or image requests.
  const stars = new Float32Array(480 * 3)
  for (let i = 0; i < 480; i++) {
    const a = i * 2.39996, y = 1 - (i + 0.5) / 240, r = Math.sqrt(1 - y * y)
    stars.set([65 * r * Math.cos(a), 65 * y, 65 * r * Math.sin(a)], i * 3)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3))
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x829594, size: 0.055, transparent: true, opacity: 0.45 })))

  const hole = new THREE.Group()
  const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 100), new THREE.MeshBasicMaterial({ color: 0x020405, side: THREE.DoubleSide }))
  disk.rotation.x = -Math.PI / 2
  hole.add(disk)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.022, 8, 140), new THREE.MeshBasicMaterial({ color: 0xffc483 }))
  rim.rotation.x = Math.PI / 2
  hole.add(rim)
  scene.add(hole)
  const photonRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, i) => {
    const angle = i / 160 * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
  })), new THREE.LineDashedMaterial({ color: 0xba8150, dashSize: 0.12, gapSize: 0.16, transparent: true, opacity: 0.65 }))
  photonRing.computeLineDistances()
  scene.add(photonRing)

  const texture = glowTexture()
  const observer = new THREE.Group()
  observer.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0x9ce7ce, wireframe: true })))
  const observerRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.013, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9ce7ce }))
  observerRing.rotation.x = Math.PI / 2
  observer.add(observerRing)
  scene.add(observer)

  const rayGroup = new THREE.Group(), reference = new THREE.Group()
  scene.add(rayGroup, reference)
  const paths = []
  let settings = null, modelKey = '', time = 0, lastTime = null, animationId = 0, disposed = false, failed = false, dirty = true

  function clearGroup(group) {
    for (const child of [...group.children]) {
      child.traverse((object) => { object.geometry?.dispose(); object.material?.dispose() })
      group.remove(child)
    }
  }

  function setParameters(next) {
    settings = next
    const rs = horizonRadius(next.mass)
    gridMaterial.uniforms.uRadius.value = rs
    grid.visible = next.grid
    reference.visible = next.reference
    hole.visible = photonRing.visible = rs > 0
    hole.scale.setScalar(Math.max(rs, 0.001))
    hole.position.y = surfaceHeight(rs, rs) + 0.025
    photonRing.scale.setScalar(1.5 * rs)
    photonRing.position.y = surfaceHeight(1.5 * rs, rs) + 0.03
    const observerRadius = next.observer * (rs > 0 ? rs : 1)
    observer.position.set(Math.cos(-0.8) * observerRadius, surfaceHeight(observerRadius, rs) + 0.2, Math.sin(-0.8) * observerRadius)
    const key = `${next.mass}/${next.impact}/${next.bundle}`
    if (key !== modelKey) {
      modelKey = key
      clearGroup(rayGroup)
      clearGroup(reference)
      paths.length = 0
      const offsets = next.bundle ? [-4, -3, -2, -1, 0, 1, 2, 3, 4] : [0]
      for (const offset of offsets) {
        const impact = next.impact / WORLD_UNIT_KM + offset * 0.62
        const result = tracePhoton(rs, impact)
        const points = result.points.map(([x, z]) => new THREE.Vector3(x, surfaceHeight(Math.hypot(x, z), rs) + 0.065, z))
        if (points.length < 2) continue
        const selected = offset === 0
        const color = selected ? 0xffdbac : result.outcome === 'captured' ? 0xe49661 : 0x8fcdc3
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: selected ? 0.95 : 0.29 }))
        rayGroup.add(line)
        const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        head.scale.setScalar(selected ? 0.8 : 0.48)
        rayGroup.add(head)
        const lengths = [0]
        for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
        paths.push({ points, lengths, head, offset: Math.abs(offset) * 1.3, total: lengths[lengths.length - 1] })
        if (selected) {
          const baseline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-FIELD_RADIUS, 0.08, impact), new THREE.Vector3(FIELD_RADIUS, 0.08, impact),
          ]), new THREE.LineDashedMaterial({ color: 0x99a3af, dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.6 }))
          baseline.computeLineDistances()
          reference.add(baseline)
        }
      }
      time = 0
    }
    canvas.dataset.mass = String(next.mass)
    canvas.dataset.impact = String(next.impact)
    dirty = true
  }

  function setView(view) {
    camera.position.set(...(view === 'top' ? [0.01, 41, 0.01] : [26, 21, 29]))
    controls.target.set(0, -2, 0)
    controls.update()
    dirty = true
  }
  setView('perspective')
  function resize() {
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    dirty = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()

  function tick(now) {
    if (disposed || failed || document.hidden) return
    animationId = requestAnimationFrame(tick)
    const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    const moved = controls.update()
    if (!settings) return
    if (!settings.paused) time += dt * settings.speed
    if (dirty || moved || !settings.paused) {
      for (const path of paths) {
        const distance = (time * 5 + path.offset) % path.total
        let lo = 0, hi = path.lengths.length - 1
        while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (path.lengths[mid] <= distance) lo = mid; else hi = mid }
        const amount = (distance - path.lengths[lo]) / Math.max(0.00001, path.lengths[hi] - path.lengths[lo])
        path.head.position.lerpVectors(path.points[lo], path.points[hi], amount)
      }
      observer.rotation.y = time * 0.3
      renderer.render(scene, camera)
      canvas.dataset.time = time.toFixed(3)
      canvas.dataset.camera = camera.position.toArray().map((n) => n.toFixed(2)).join(',')
      dirty = false
    }
  }
  function visibility() {
    cancelAnimationFrame(animationId)
    lastTime = null
    if (!document.hidden && !failed) animationId = requestAnimationFrame(tick)
  }
  function contextLost(event) {
    event.preventDefault()
    failed = true
    cancelAnimationFrame(animationId)
    onFailure()
  }
  document.addEventListener('visibilitychange', visibility)
  canvas.addEventListener('webglcontextlost', contextLost)
  animationId = requestAnimationFrame(tick)

  return {
    setParameters,
    setView,
    restart() { time = 0; dirty = true },
    dispose() {
      disposed = true
      cancelAnimationFrame(animationId)
      document.removeEventListener('visibilitychange', visibility)
      canvas.removeEventListener('webglcontextlost', contextLost)
      resizeObserver.disconnect()
      controls.dispose()
      scene.traverse((object) => { object.geometry?.dispose(); object.material?.dispose() })
      texture.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
