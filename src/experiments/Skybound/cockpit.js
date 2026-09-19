import * as THREE from 'three'
import { clamp } from './game.js'

// Camera-local interior: the landscape follows the aircraft attitude while the
// instruments stay fixed in the pilot's field of view. Geometry remains local;
// reflective trim shares the scene's HDR environment when it becomes available.
export function createCockpit(camera, own) {
  const cockpit = new THREE.Group()
  cockpit.name = 'pilot-cockpit'
  camera.add(cockpit)
  const panel = new THREE.Group()
  cockpit.add(panel)
  const alloy = own(new THREE.MeshStandardMaterial({ color: '#26383b', roughness: 0.42, metalness: 0.55 }))
  const rubber = own(new THREE.MeshStandardMaterial({ color: '#172427', roughness: 1 }))
  const ivory = own(new THREE.MeshPhysicalMaterial({ color: '#eeeee2', roughness: 0.34, metalness: 0.05, clearcoat: .65, clearcoatRoughness: .22 }))
  const copper = own(new THREE.MeshStandardMaterial({ color: '#a9352c', roughness: 0.35, metalness: 0.25 }))
  const cube = own(new THREE.BoxGeometry(1, 1, 1))
  const sphere = own(new THREE.SphereGeometry(1, 16, 12))
  function box(parent, material, position, scale) {
    const object = new THREE.Mesh(cube, material)
    object.position.set(...position); object.scale.set(...scale)
    parent.add(object)
    return object
  }
  function tube(parent, points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    const object = new THREE.Mesh(own(new THREE.TubeGeometry(curve, 24, radius, 6, false)), material)
    parent.add(object)
    return object
  }

  // Broad windshield with edge pillars, an upholstered coaming and real depth.
  tube(panel, [[-1.63, -.9, -1.25], [-1.32, -.43, -1.46], [-.8, -.36, -1.51], [.8, -.36, -1.51], [1.32, -.43, -1.46], [1.63, -.9, -1.25]], .062, rubber)
  for (const side of [-1, 1]) {
    tube(panel, [[side * 1.53, -.62, -1.5], [side * 1.65, .32, -1.9], [side * 1.55, 1.14, -2.1]], .045, ivory)
    tube(panel, [[side * 1.6, -.62, -1.51], [side * 1.72, .32, -1.91], [side * 1.62, 1.14, -2.11]], .012, rubber)
    box(panel, alloy, [side * 1.48, -.87, -.83], [.26, .72, 1.12])
  }
  tube(panel, [[-1.56, 1.12, -2.1], [0, 1.23, -2.25], [1.56, 1.12, -2.1]], .065, ivory)
  box(panel, alloy, [0, -.82, -1.58], [2.95, .81, .16])
  box(panel, rubber, [0, -1.24, -1.13], [3.05, .12, .75])

  // The hood and high-wing supports remain visible beyond the windshield, even though
  // the exterior canopy is hidden to avoid looking through an opaque shell.
  const hood = new THREE.Mesh(sphere, ivory)
  hood.position.set(0, -1.05, -4.8); hood.scale.set(.64, .55, 2.7)
  cockpit.add(hood)
  box(cockpit, copper, [0, -.508, -4.8], [.13, .012, 2.9])
  for (const side of [-1, 1]) {
    box(cockpit, ivory, [side * 3.2, 1.4, -.8], [4.7, .09, 1.55]).rotation.z = side * .025
    tube(cockpit, [[side * .85, -.85, -1.9], [side * 3.4, 1.4, -.95]], .035, ivory)
  }
  const propeller = new THREE.Mesh(own(new THREE.RingGeometry(.35, 1.5, 48)), own(new THREE.MeshBasicMaterial({ color: '#bfc9bc', transparent: true, opacity: .055, side: THREE.DoubleSide, depthWrite: false })))
  propeller.position.set(0, -1.05, -7.4)
  cockpit.add(propeller)

  const textureCanvas = document.createElement('canvas')
  textureCanvas.width = 1280; textureCanvas.height = 400
  const ctx = textureCanvas.getContext('2d')
  const texture = own(new THREE.CanvasTexture(textureCanvas))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 2
  const instruments = new THREE.Group()
  panel.add(instruments)
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(2.1, .656)), own(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })))
  face.position.set(0, -.68, -1.485)
  instruments.add(face)
  const bezel = own(new THREE.TorusGeometry(.176, .012, 6, 48))
  for (const x of [-.536, 0, .536]) {
    const ring = new THREE.Mesh(bezel, alloy)
    ring.position.set(x, -.67, -1.47)
    instruments.add(ring)
  }
  for (const x of [-1.32, 1.32]) for (const y of [-.48, -1.15]) {
    const rivet = new THREE.Mesh(sphere, ivory)
    rivet.position.set(x, y, -1.365); rivet.scale.set(.014, .014, .006)
    panel.add(rivet)
  }

  const yoke = new THREE.Group()
  yoke.position.set(0, -.81, -1.52)
  instruments.add(yoke)
  tube(yoke, [[-.28, .04, 0], [-.27, -.08, 0], [0, -.12, .03], [.27, -.08, 0], [.28, .04, 0]], .037, rubber)
  box(yoke, alloy, [0, -.10, -.13], [.10, .08, .32])
  box(yoke, copper, [0, -.1, .055], [.085, .055, .012])
  const throttle = new THREE.Group()
  throttle.position.set(1.23, -.85, -1.45)
  instruments.add(throttle)
  box(throttle, ivory, [0, .07, 0], [.02, .17, .02])
  const knob = new THREE.Mesh(sphere, copper)
  knob.scale.set(.055, .055, .055); knob.position.y = .16
  throttle.add(knob)

  function text(label, x, y, size = 15, color = '#b9c9bd') {
    ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.textAlign = 'center'
    ctx.fillText(label, x, y)
  }
  function dial(x, title, value, maximum, unit) {
    const y = 194, r = 104
    ctx.fillStyle = '#0b171b'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    for (let i = 0; i <= 24; i++) {
      const angle = (-225 + i * 270 / 24) * Math.PI / 180
      const length = i % 4 === 0 ? 13 : 6
      ctx.strokeStyle = i > 20 ? '#d29660' : '#91aaa6'; ctx.lineWidth = i % 4 === 0 ? 2 : 1
      ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * (r - 10), y + Math.sin(angle) * (r - 10))
      ctx.lineTo(x + Math.cos(angle) * (r - 10 - length), y + Math.sin(angle) * (r - 10 - length)); ctx.stroke()
      if (i % 4 === 0) text(String(Math.round(i / 24 * maximum)), x + Math.cos(angle) * 64, y + Math.sin(angle) * 64 + 4, 12)
    }
    const angle = (-225 + clamp(value / maximum, 0, 1) * 270) * Math.PI / 180
    ctx.strokeStyle = '#f0d5a2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * 77, y + Math.sin(angle) * 77); ctx.stroke()
    ctx.fillStyle = '#d8864e'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#203338'; ctx.fillRect(x - 37, y + 35, 74, 26)
    text(String(Math.round(value)).padStart(3, '0'), x, y + 55, 20, '#e8f0d3')
    text(unit, x, y + 81, 10)
    text(title, x, 59, 16)
  }
  let lastUpdate = -Infinity
  return {
    group: cockpit,
    resize(aspect) {
      const ratio = clamp(aspect / 1.65, .25, 1.25)
      panel.scale.x = ratio
      // Keep the dials circular on portrait screens; move the smaller panel
      // beneath the touch telemetry instead of stretching its face vertically.
      instruments.scale.y = ratio
      instruments.position.y = -.68 * (1 - ratio) - (aspect < .8 ? .12 : 0)
    },
    update(state, calm) {
      yoke.rotation.z = -state.roll * .7
      yoke.position.z = -1.52 + state.pitch * .12
      throttle.rotation.x = .4 - state.throttle * .8
      propeller.visible = !calm
      if (Math.abs(state.elapsed - lastUpdate) < .08) return
      lastUpdate = state.elapsed
      ctx.fillStyle = '#1b2b2f'; ctx.fillRect(0, 0, 1280, 400)
      ctx.strokeStyle = '#34494b'; ctx.lineWidth = 1
      for (let y = 0; y < 400; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke() }
      dial(313, 'AIRSPEED', state.speed * 3.6, 360, 'KM / H')
      dial(967, 'ALTITUDE', state.position.y, 1200, 'METRES')
      ctx.save(); ctx.beginPath(); ctx.arc(640, 194, 104, 0, Math.PI * 2); ctx.clip()
      ctx.translate(640, 194); ctx.rotate(state.roll); ctx.translate(0, state.pitch * 130)
      ctx.fillStyle = '#6999aa'; ctx.fillRect(-220, -350, 440, 350)
      ctx.fillStyle = '#a08760'; ctx.fillRect(-220, 0, 440, 350)
      ctx.strokeStyle = '#f1e6c7'; ctx.lineWidth = 2
      for (let i = -3; i <= 3; i++) {
        const w = i === 0 ? 210 : Math.abs(i) % 2 === 0 ? 26 : 15
        ctx.beginPath(); ctx.moveTo(-w, i * 22); ctx.lineTo(w, i * 22); ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = '#ffe1a0'; ctx.lineWidth = 4; ctx.beginPath()
      ctx.moveTo(577, 194); ctx.lineTo(614, 194); ctx.lineTo(614, 202)
      ctx.moveTo(703, 194); ctx.lineTo(666, 194); ctx.lineTo(666, 202); ctx.stroke()
      ctx.fillStyle = '#ffe1a0'; ctx.beginPath(); ctx.arc(640, 194, 3, 0, Math.PI * 2); ctx.fill()
      text('ATTITUDE', 640, 59, 16)
      text('SB–01', 88, 67, 18, '#e2d3b4'); text('COASTAL EXPLORER', 88, 87, 9)
      text('PWR', 1177, 148, 14); text(`${Math.round(state.throttle * 100)}%`, 1177, 180, 26, '#e7d5aa')
      text('HDG', 1177, 225, 14); text(`${String((Math.round(state.heading * 180 / Math.PI) + 360) % 360).padStart(3, '0')}°`, 1177, 254, 23, '#c8e6d0')
      text('AURELIA  /  118.70', 640, 335, 16, '#cae1cc')
      text('ASSISTED FLIGHT', 313, 335, 11); text(state.clearance < 32 ? 'LOW ALTITUDE' : 'ENGINE NORMAL', 967, 335, 11, state.clearance < 32 ? '#ffc086' : '#a6bcac')
      texture.needsUpdate = true
    },
  }
}
