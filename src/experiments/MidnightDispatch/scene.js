import * as THREE from 'three'
import { BUILDINGS, ROADS, subject, missionTarget } from './game.js'
import { DISTRICTS, SERVICES, STASHES, LIMIT, districtAt } from './world.js'
import { VEHICLES } from './progress.js'

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
  const sky = new THREE.HemisphereLight('#bcd4f5', '#283449', 2.1)
  scene.add(sky)
  const moon = new THREE.DirectionalLight('#cfdfec', 1.8)
  moon.position.set(-60, 100, 40)
  scene.add(moon)

  const solid = [], luminous = []
  const box = (list, x, y, z, w, h, d, color) => list.push({ x, y, z, w, h, d, color })
  box(solid, 0, -1.2, 0, 620, 1, 620, '#183c4b')
  box(solid, 0, -0.6, 0, 490, 1, 490, '#182730')
  box(solid, 0, -0.07, 0, 474, 0.1, 474, '#29353d')
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
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = -196 + col * 56, z = -196 + row * 56
      box(solid, x, 0.09, z, 43, 0.35, 43, '#677175')
      box(solid, x, 0.28, z, 40.8, 0.1, 40.8, districtAt({ x, z }).ground)
    }
  }
  for (const road of ROADS) {
    for (let p = -232; p <= 232; p += 7) {
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
    box(solid, b.x, b.h / 2 + 0.4, b.z, b.w, b.h, b.d, b.color)
    box(solid, b.x, b.h + 0.55, b.z, b.w + 0.6, 0.35, b.d + 0.6, '#788285')
    box(solid, b.x, b.h + 0.76, b.z, b.w - 1, 0.12, b.d - 1, '#485963')
    // Rooftop air conditioners, vents and parapets, visible from the steep camera.
    for (let v = 0; v < 3; v++) {
      box(solid, b.x - 4 + v * 3, b.h + 1.2, b.z + 2, 2, 0.9, 2.6, '#869192')
      box(solid, b.x - 4 + v * 3, b.h + 1.7, b.z + 2, 1.3, 0.08, 1.8, '#35424a')
    }
    box(solid, b.x + 3, b.h + 1.5, b.z - 4, 4, 1.5, 3, '#64737a')
    if (index % 4 === 0) {
      const color = DISTRICTS.find((d) => d.id === b.district).color
      box(luminous, b.x, b.h + 0.85, b.z - b.d / 2, b.w, 0.16, 0.2, color)
      box(luminous, b.x - b.w / 2, b.h + 0.85, b.z, 0.2, 0.16, b.d, color)
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
  for (let p = -232; p <= 232; p += 10) {
    box(solid, p, 0.4, 239, 8, 1, 2, '#727477')
    box(solid, -239, 0.4, p, 2, 1, 8, '#727477')
    box(luminous, p, 1.05, 239, 1, 0.1, 0.3, '#e4b268')
    if (p < 0) box(solid, p, 1.6, 245, 8, 3, 5, p % 20 ? '#894d49' : '#397474')
  }
  // The four districts share navigable streets but have distinct silhouettes and landmarks.
  for (const b of BUILDINGS.filter((_, i) => i % 4 === 0)) {
    if (b.district === 'harbor') {
      box(solid, b.x, b.h + 6, b.z, 0.8, 12, 0.8, '#d49b57')
      box(solid, b.x + 5, b.h + 11, b.z, 13, 0.65, 0.65, '#d49b57')
    } else if (b.district === 'coast') {
      const x = b.x - 10, z = b.z
      box(solid, x, 3, z, 0.7, 6, 0.7, '#9a7d57')
      box(solid, x, 6, z, 7, 0.4, 1.5, '#669971')
      box(solid, x, 6.1, z, 1.5, 0.4, 7, '#76aa7d')
    } else if (b.district === 'desert') {
      box(solid, b.x - 10, 1.6, b.z, 0.9, 3.2, 0.9, '#769478')
      box(solid, b.x - 9, 2, b.z, 2.3, 0.65, 0.7, '#769478')
    }
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
  for (const d of DISTRICTS) sign(d.name, d.x + 20, d.z + 20, d.color, 25)
  for (const p of SERVICES) {
    // A lettered marker makes the shop type readable before the player reaches its ring.
    sign(`${p.icon} · ${p.type || p.id}`.toUpperCase(), p.x, p.z, p.color, 18)
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(5, 5.4, 32)), track(new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide })))
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.12, p.z); scene.add(ring)
  }

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
  const bodies = new THREE.InstancedMesh(cube, matte, 40 * parts.length)
  const lights = new THREE.InstancedMesh(cube, glow, 40 * 6)
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  bodies.frustumCulled = lights.frustumCulled = false
  scene.add(bodies, lights)
  track(bodies)
  track(lights)

  function carPart(mesh, index, car, part, color) {
    const spec = VEHICLES.find((v) => v.id === car.model) || VEHICLES[0]
    const cos = Math.cos(car.heading), sin = Math.sin(car.heading)
    transform.position.set(car.x + part.x * spec.width * cos - part.z * spec.length * sin, part.y, car.z + part.x * spec.width * sin + part.z * spec.length * cos)
    transform.rotation.set(0, -car.heading, 0)
    transform.scale.set(part.w * spec.width, part.h * (car.model === 'sentinel' ? 1.25 : 1), part.d * spec.length)
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
  const gun = limb(0.2, 0.22, 1.2, '#b9c7ca', 0.5, 1.25, -0.8)
  scene.add(person)

  const enemies = new THREE.InstancedMesh(cube, matte, 12)
  const tracers = new THREE.InstancedMesh(cube, glow, 32)
  const stashes = new THREE.InstancedMesh(cube, glow, STASHES.length)
  const rain = new THREE.InstancedMesh(cube, track(new THREE.MeshBasicMaterial({ color: '#9ebec8', transparent: true, opacity: 0.35 })), 180)
  for (const mesh of [enemies, tracers, stashes, rain]) { mesh.frustumCulled = false; scene.add(mesh); track(mesh) }
  const setBox = (mesh, i, x, y, z, w, h, d, color, rotation = 0) => {
    transform.position.set(x, y, z); transform.rotation.set(0, rotation, 0); transform.scale.set(w, h, d); transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix); if (color) mesh.setColorAt(i, tint.set(color))
  }
  const raycaster = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimPoint = new THREE.Vector3()

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
    aim(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), camera)
      return raycaster.ray.intersectPlane(ground, aimPoint) ? { x: aimPoint.x, z: aimPoint.z } : null
    },
    render(s, dt, calm = false) {
      const p = subject(s)
      const sunset = s.theme === 'sunset', wet = s.theme === 'rain'
      sky.color.set(sunset ? '#ffe3bb' : '#bcd4f5')
      sky.intensity = sunset ? 3 : wet ? 1.4 : 1.9 + Math.sin(s.elapsed / 90) * 0.2
      moon.color.set(sunset ? '#ffbd81' : '#cfdfec')
      renderer.setClearColor(sunset ? '#9b8375' : wet ? '#162b38' : '#101c29')
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
      gun.visible = Boolean(s.weapon)
      person.position.set(s.player.x, 0.3, s.player.z)
      person.rotation.y = -s.player.heading
      leftLeg.rotation.x = s.player.moving && s.phase === 'playing' ? Math.sin(s.elapsed * 15) * 0.65 : 0
      rightLeg.rotation.x = -leftLeg.rotation.x
      playerRing.position.set(p.x, 0.35, p.z)
      playerRing.scale.setScalar(s.driving ? 1.8 : 1)
      cars.length = 0
      cars.push(s.car, ...s.parked, ...s.traffic.filter((c) => c.disabled <= 0), ...s.police.filter((c) => c.disabled <= 0))
      let lightIndex = 0
      cars.forEach((car, i) => {
        const police = s.police.includes(car)
        const color = police ? '#d1dce2' : s.traffic.includes(car) ? CAR_COLORS[car.color] : (VEHICLES.find((v) => v.id === car.model) || VEHICLES[0]).color
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
      bodies.count = cars.length * parts.length; lights.count = lightIndex
      bodies.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true
      bodies.instanceColor.needsUpdate = lights.instanceColor.needsUpdate = true
      let ei = 0
      for (const e of s.enemies.filter((e) => e.health > 0)) {
        setBox(enemies, ei++, e.x, 1.15, e.z, 1, 1.8, 0.6, '#cb6674', -e.heading)
        setBox(enemies, ei++, e.x, 2.2, e.z, 0.6, 0.5, 0.6, '#d9b496')
        setBox(enemies, ei++, e.x, 3, e.z, e.health / 90 * 2, 0.15, 0.25, '#ed927e')
      }
      enemies.count = ei
      tracers.count = Math.min(32, s.shots.length)
      s.shots.slice(0, 32).forEach((shot, i) => setBox(tracers, i, (shot.x + shot.tx) / 2, 1.3, (shot.z + shot.tz) / 2, 0.09, 0.08, Math.hypot(shot.tx - shot.x, shot.tz - shot.z), shot.hostile ? '#ff8f81' : '#ffdf94', Math.atan2(shot.tx - shot.x, shot.tz - shot.z)))
      const remaining = STASHES.filter((c) => !s.found.includes(c.id))
      stashes.count = remaining.length
      remaining.forEach((c, i) => setBox(stashes, i, c.x, 1.1, c.z, 1.3, 1.3, 1.3, '#f3cc73', calm ? 0 : s.elapsed * 0.6))
      rain.visible = wet && !calm
      if (rain.visible) for (let i = 0; i < 180; i++) setBox(rain, i, p.x + (i * 17 % 110) - 55, 24 - (s.elapsed * 21 + i * 7) % 24, p.z + (i * 31 % 100) - 50, 0.035, 1.3, 0.035)
      for (const mesh of [enemies, tracers, stashes, rain]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true }
      const job = missionTarget(s)
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
  const scale = size / (LIMIT * 2 + 24)
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
    ctx.moveTo(-LIMIT, r); ctx.lineTo(LIMIT, r)
    ctx.moveTo(r, -LIMIT); ctx.lineTo(r, LIMIT)
    ctx.stroke()
  }
  for (const b of BUILDINGS) { ctx.fillStyle = b.color; ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d) }
  for (const stash of STASHES) if (!s.found.includes(stash.id)) { ctx.fillStyle = '#eec16d'; ctx.fillRect(stash.x - 2, stash.z - 2, 4, 4) }
  for (const service of SERVICES) {
    ctx.fillStyle = '#10202a'; ctx.fillRect(service.x - 9, service.z - 9, 18, 18)
    ctx.fillStyle = service.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(service.icon, service.x, service.z + 5)
  }
  for (const enemy of s.enemies) if (enemy.health > 0) { ctx.fillStyle = '#ed8b83'; ctx.fillRect(enemy.x - 3, enemy.z - 3, 6, 6) }
  const job = missionTarget(s)
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
