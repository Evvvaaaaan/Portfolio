import * as THREE from 'three'
import { BUILDINGS, JOBS, ROADS, subject } from './game.js'

const PALETTE = ['#3c4955', '#4e435a', '#37555b', '#5c514b']
const CAR_COLORS = ['#d17e68', '#93ada1', '#b9b5cc', '#527b9b']

export function createScene(host, initial) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor('#101c29')
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'midnight-canvas'
  renderer.domElement.setAttribute('aria-label', 'Midnight Dispatch — interactive 3D city')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-80, 80, 50, -50, 0.1, 400)
  const resources = new Set()
  const track = (item) => { resources.add(item); return item }
  const cube = track(new THREE.BoxGeometry(1, 1, 1))
  const matte = track(new THREE.MeshLambertMaterial({ color: '#ffffff' }))
  const glow = track(new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  scene.add(new THREE.HemisphereLight('#bcd4f5', '#283449', 2.1))
  const moon = new THREE.DirectionalLight('#cfdfec', 1.8)
  moon.position.set(-60, 100, 40)
  scene.add(moon)

  const solid = [], luminous = []
  const box = (list, x, y, z, w, h, d, color) => list.push({ x, y, z, w, h, d, color })
  box(solid, 0, -0.6, 0, 274, 1, 274, '#182730')
  box(solid, 0, -0.07, 0, 251, 0.1, 251, '#29353d')
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()

  function instances(items, material) {
    const mesh = new THREE.InstancedMesh(cube, material, items.length)
    items.forEach((part, i) => {
      transform.position.set(part.x, part.y, part.z)
      transform.rotation.set(0, 0, 0)
      transform.scale.set(part.w, part.h, part.d)
      transform.updateMatrix()
      mesh.setMatrixAt(i, transform.matrix)
      mesh.setColorAt(i, tint.set(part.color))
    })
    mesh.computeBoundingSphere()
    scene.add(mesh)
    track(mesh)
    return mesh
  }

  // Sidewalks, lane markings, zebra crossings and lamps establish the road grid.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = -84 + col * 56, z = -84 + row * 56
      box(solid, x, 0.09, z, 43, 0.35, 43, '#677175')
      box(solid, x, 0.28, z, 40.8, 0.1, 40.8, '#465259')
    }
  }
  for (const road of ROADS) {
    for (let p = -120; p <= 120; p += 7) {
      if (ROADS.some((r) => Math.abs(p - r) < 10)) continue
      box(solid, road - 0.35, 0.02, p, 0.18, 0.04, 3, '#bca970')
      box(solid, road + 0.35, 0.02, p, 0.18, 0.04, 3, '#bca970')
      box(solid, p, 0.02, road - 0.35, 3, 0.04, 0.18, '#bca970')
      box(solid, p, 0.02, road + 0.35, 3, 0.04, 0.18, '#bca970')
    }
    for (const cross of ROADS) {
      for (let j = -4; j <= 4; j += 2) {
        for (const sign of [-1, 1]) {
          box(solid, road + j, 0.03, cross + sign * 10, 1.05, 0.04, 3.1, '#9ba7a4')
          box(solid, road + sign * 10, 0.03, cross + j, 3.1, 0.04, 1.05, '#9ba7a4')
        }
      }
      box(solid, road + 8.8, 2.8, cross + 9, 0.24, 5.6, 0.24, '#1a2a32')
      box(luminous, road + 8.8, 5.7, cross + 8.4, 0.7, 0.2, 1.4, '#ffe3a0')
      box(solid, road + 8.8, 0.015, cross + 7, 3, 0.02, 4, '#494b3d')
    }
  }

  BUILDINGS.forEach((b, index) => {
    box(solid, b.x + b.h * 0.16, 0.35, b.z - b.h * 0.14, b.w + 1.1, 0.06, b.d + 1.1, '#27333d')
    box(solid, b.x, b.h / 2 + 0.4, b.z, b.w, b.h, b.d, PALETTE[b.tint])
    box(solid, b.x, b.h + 0.55, b.z, b.w + 0.6, 0.35, b.d + 0.6, '#788285')
    box(solid, b.x, b.h + 0.76, b.z, b.w - 1, 0.12, b.d - 1, '#485963')
    // Rooftop air conditioners, vents and parapets, visible from the steep camera.
    for (let v = 0; v < 3; v++) {
      box(solid, b.x - 4 + v * 3, b.h + 1.2, b.z + 2, 2, 0.9, 2.6, '#869192')
      box(solid, b.x - 4 + v * 3, b.h + 1.7, b.z + 2, 1.3, 0.08, 1.8, '#35424a')
    }
    box(solid, b.x + 3, b.h + 1.5, b.z - 4, 4, 1.5, 3, '#64737a')
    if (index % 4 === 0) {
      box(luminous, b.x, b.h + 0.85, b.z - b.d / 2, b.w, 0.16, 0.2, '#6edfc9')
      box(luminous, b.x - b.w / 2, b.h + 0.85, b.z, 0.2, 0.16, b.d, '#6edfc9')
    }
    for (let floor = 2; floor < b.h - 1; floor += 2.6) {
      for (let window = -5; window <= 5; window += 2.5) {
        const color = (Math.round(floor * 5 + window) + index) % 3 ? '#b6b39a' : '#405363'
        box(luminous, b.x + window, floor, b.z + b.d / 2 + 0.03, 1.1, 1.1, 0.07, color)
        box(luminous, b.x + b.w / 2 + 0.03, floor, b.z + window, 0.07, 1.1, 1.1, color)
        box(luminous, b.x + window, floor, b.z - b.d / 2 - 0.03, 1.1, 1.1, 0.07, color)
      }
    }
  })
  // The city boundary reads as a quay, with containers and a lit perimeter.
  for (let p = -120; p <= 120; p += 10) {
    box(solid, p, 0.4, 127, 8, 1, 2, '#727477')
    box(solid, -127, 0.4, p, 2, 1, 8, '#727477')
    box(luminous, p, 1.05, 127, 1, 0.1, 0.3, '#e4b268')
    box(solid, 131, 1.6, p, 5, 3, 8, p % 20 ? '#894d49' : '#397474')
  }
  instances(solid, matte)
  instances(luminous, glow)

  function sign(text, x, z, color, width = 13) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#152631'
    ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.strokeRect(6, 6, 500, 116)
    ctx.fillStyle = color
    ctx.font = 'bold 46px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 66)
    const texture = track(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(width, width / 4)), track(new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 19, z)
    scene.add(mesh)
  }
  sign('AFTER HOURS', -18, -17, '#f5ba70', 16)
  sign('RADIO 88.4', 76, -74, '#9ce3d0')
  sign('NIGHT MARKET', -20, -75, '#df95b2', 17)
  sign('AUTO SERVICE', 76, 77, '#a6dbcc', 16)

  // All moving cars share three instanced draws, including lights and glass.
  const parts = [
    { x: 0, y: 0.65, z: 0, w: 2.05, h: 0.6, d: 4.5, color: 'body' },
    { x: 0, y: 1.2, z: 0.25, w: 1.75, h: 0.6, d: 2.4, color: 'body' },
    { x: 0, y: 1.53, z: 0.32, w: 1.58, h: 0.12, d: 1.3, color: 'body' },
    { x: -1.03, y: 0.43, z: -1.3, w: 0.27, h: 0.65, d: 0.9, color: '#111b26' },
    { x: 1.03, y: 0.43, z: -1.3, w: 0.27, h: 0.65, d: 0.9, color: '#111b26' },
    { x: -1.03, y: 0.43, z: 1.3, w: 0.27, h: 0.65, d: 0.9, color: '#111b26' },
    { x: 1.03, y: 0.43, z: 1.3, w: 0.27, h: 0.65, d: 0.9, color: '#111b26' },
    { x: 0, y: 1.4, z: -0.72, w: 1.57, h: 0.14, d: 0.65, color: '#273b4c' },
    { x: 0, y: 1.4, z: 1.17, w: 1.57, h: 0.14, d: 0.45, color: '#273b4c' },
  ]
  const cars = [initial.car, ...initial.traffic, ...initial.police]
  const bodies = new THREE.InstancedMesh(cube, matte, cars.length * parts.length)
  const lights = new THREE.InstancedMesh(cube, glow, cars.length * 4 + 4)
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  bodies.frustumCulled = lights.frustumCulled = false
  scene.add(bodies, lights)
  track(bodies)
  track(lights)

  function carPart(mesh, index, car, part, color) {
    const cos = Math.cos(car.heading), sin = Math.sin(car.heading)
    transform.position.set(car.x + part.x * cos - part.z * sin, part.y, car.z + part.x * sin + part.z * cos)
    transform.rotation.set(0, -car.heading, 0)
    transform.scale.set(part.w, part.h, part.d)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
    mesh.setColorAt(index, tint.set(color))
  }

  const person = new THREE.Group()
  function limb(w, h, d, color, x, y, z) {
    const mesh = new THREE.Mesh(cube, track(new THREE.MeshLambertMaterial({ color })))
    mesh.scale.set(w, h, d)
    mesh.position.set(x, y, z)
    person.add(mesh)
    return mesh
  }
  limb(0.8, 0.8, 0.45, '#f6c86b', 0, 1.25, 0)
  limb(0.46, 0.45, 0.45, '#debd9f', 0, 1.95, -0.05)
  limb(0.5, 0.2, 0.5, '#192b35', 0, 2.2, -0.05)
  const leftLeg = limb(0.27, 0.8, 0.3, '#1f3547', -0.23, 0.45, 0)
  const rightLeg = limb(0.27, 0.8, 0.3, '#1f3547', 0.23, 0.45, 0)
  limb(0.25, 0.7, 0.3, '#cfaa69', -0.54, 1.15, 0)
  limb(0.25, 0.7, 0.3, '#cfaa69', 0.54, 1.15, 0)
  scene.add(person)

  const ringGeo = track(new THREE.RingGeometry(5.7, 6, 64))
  const marker = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: '#8df2cd', side: THREE.DoubleSide })))
  marker.rotation.x = -Math.PI / 2
  scene.add(marker)
  const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 1.5, 15, 8, 1, true)), track(new THREE.MeshBasicMaterial({ color: '#8df2cd', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })))
  scene.add(beam)
  const diamond = new THREE.Mesh(track(new THREE.OctahedronGeometry(1.2)), track(new THREE.MeshBasicMaterial({ color: '#a5ffda' })))
  scene.add(diamond)
  const playerRing = new THREE.Mesh(track(new THREE.RingGeometry(1.4, 1.65, 32)), track(new THREE.MeshBasicMaterial({ color: '#f3cc73', depthTest: false, transparent: true, opacity: 0.85 })))
  playerRing.rotation.x = -Math.PI / 2
  playerRing.renderOrder = 3
  scene.add(playerRing)

  const headlightMat = track(new THREE.MeshBasicMaterial({ color: '#ffe4a3', transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide }))
  const headlight = new THREE.Mesh(track(new THREE.CircleGeometry(1, 24, -Math.PI / 5, Math.PI * 2 / 5)), headlightMat)
  headlight.rotation.x = -Math.PI / 2
  headlight.scale.set(13, 7, 1)
  scene.add(headlight)

  const target = new THREE.Vector3(-1, 0, 10)
  const eye = new THREE.Vector3()
  let halfHeight = 43
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    halfHeight = w < 650 ? 40 : 43
    camera.left = -halfHeight * w / h
    camera.right = halfHeight * w / h
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  return {
    renderer,
    render(s, dt, calm = false) {
      const p = subject(s)
      const ahead = s.driving ? s.car.speed * 0.23 : 0
      eye.set(p.x + Math.sin(p.heading) * ahead, 0, p.z - Math.cos(p.heading) * ahead)
      target.lerp(eye, calm ? 1 : 1 - Math.exp(-5 * dt))
      camera.position.set(target.x, 110, target.z + 53)
      camera.lookAt(target.x, 0, target.z)
      const zoom = s.driving && !calm ? 0.98 - Math.abs(s.car.speed) * 0.003 : 1
      if (Math.abs(camera.zoom - zoom) > 0.001) {
        camera.zoom += (zoom - camera.zoom) * 0.05
        camera.updateProjectionMatrix()
      }
      person.visible = !s.driving
      person.position.set(s.player.x, 0.3, s.player.z)
      person.rotation.y = -s.player.heading
      leftLeg.rotation.x = s.player.moving && s.phase === 'playing' ? Math.sin(s.elapsed * 15) * 0.65 : 0
      rightLeg.rotation.x = -leftLeg.rotation.x
      playerRing.position.set(p.x, 0.35, p.z)
      playerRing.scale.setScalar(s.driving ? 1.8 : 1)
      cars[0] = s.car
      for (let i = 0; i < s.traffic.length; i++) cars[i + 1] = s.traffic[i]
      for (let i = 0; i < s.police.length; i++) cars[i + 1 + s.traffic.length] = s.police[i]
      let lightIndex = 0
      cars.forEach((car, i) => {
        const police = i > s.traffic.length
        const color = i === 0 ? '#e9bb56' : police ? '#d1dce2' : CAR_COLORS[car.color]
        parts.forEach((part, j) => carPart(bodies, i * parts.length + j, car, part, part.color === 'body' ? color : part.color))
        for (const side of [-1, 1]) {
          carPart(lights, lightIndex++, car, { x: side * 0.72, y: 0.8, z: -2.28, w: 0.5, h: 0.24, d: 0.12 }, '#fff1c0')
          carPart(lights, lightIndex++, car, { x: side * 0.72, y: 0.8, z: 2.28, w: 0.5, h: 0.24, d: 0.12 }, '#ee725f')
        }
        if (police) {
          for (const side of [-1, 1]) {
            const lit = s.heat > 0 && (calm || Math.sin(s.elapsed * 7) * side > 0)
            carPart(lights, lightIndex++, car, { x: side * 0.45, y: 1.7, z: 0, w: 0.8, h: 0.2, d: 0.6 }, lit ? (side < 0 ? '#ef7c74' : '#78beed') : '#495763')
          }
        }
      })
      bodies.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true
      bodies.instanceColor.needsUpdate = lights.instanceColor.needsUpdate = true
      const job = JOBS[s.job]
      marker.visible = beam.visible = diamond.visible = Boolean(job)
      if (job) {
        marker.position.set(job.x, 0.08, job.z)
        marker.scale.setScalar(calm ? 1 : 1 + Math.sin(s.elapsed * 3) * 0.04)
        beam.position.set(job.x, 7.5, job.z)
        diamond.position.set(job.x, 5 + (calm ? 0 : Math.sin(s.elapsed * 2) * 0.5), job.z)
        diamond.rotation.y = calm ? 0 : s.elapsed * 0.6
      }
      headlight.position.set(s.car.x + Math.sin(s.car.heading) * 2, 0.07, s.car.z - Math.cos(s.car.heading) * 2)
      headlight.rotation.z = Math.PI / 2 - s.car.heading
      renderer.render(scene, camera)
    },
    dispose() {
      observer.disconnect()
      for (const resource of resources) resource.dispose?.()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

export function drawMap(canvas, s) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = canvas.width
  const scale = size / 270
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#101e29'
  ctx.fillRect(0, 0, size, size)
  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.scale(scale, scale)
  ctx.strokeStyle = '#475764'
  ctx.lineWidth = 8
  for (const r of ROADS) {
    ctx.beginPath()
    ctx.moveTo(-123, r); ctx.lineTo(123, r)
    ctx.moveTo(r, -123); ctx.lineTo(r, 123)
    ctx.stroke()
  }
  ctx.fillStyle = '#293d49'
  for (const b of BUILDINGS) ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d)
  const job = JOBS[s.job]
  if (job) {
    const p = subject(s)
    ctx.strokeStyle = '#77dab1'
    ctx.lineWidth = 1.6
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(p.x, p.z)
    // Via the nearest intersection; this is a road-following route, not a line through buildings.
    const rx = Math.round(p.x / 56) * 56, rz = Math.round(p.z / 56) * 56
    if (Math.abs(p.x - rx) < Math.abs(p.z - rz)) { ctx.lineTo(rx, p.z); ctx.lineTo(rx, rz) }
    else { ctx.lineTo(p.x, rz); ctx.lineTo(rx, rz) }
    ctx.lineTo(job.x, rz)
    ctx.lineTo(job.x, job.z)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#a5ffda'
    ctx.fillRect(job.x - 4, job.z - 4, 8, 8)
  }
  if (s.heat > 0) {
    ctx.fillStyle = '#ea8b8b'
    for (const p of s.police) { ctx.beginPath(); ctx.arc(p.x, p.z, 3, 0, Math.PI * 2); ctx.fill() }
  }
  if (!s.driving) {
    ctx.fillStyle = '#f3c46c'
    ctx.fillRect(s.car.x - 2, s.car.z - 3, 4, 6)
  }
  const p = subject(s)
  ctx.translate(p.x, p.z)
  ctx.rotate(p.heading)
  ctx.fillStyle = '#ffd881'
  ctx.strokeStyle = '#14232c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.restore()
}
