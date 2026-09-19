import * as THREE from 'three'
import { GATES, ISLANDS, terrainHeight } from './game.js'
import { createCockpit } from './cockpit.js'
import { loadFlightAssets } from './assets.js'

export function createFlightScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6))
  renderer.setClearColor('#c8dfe1')
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.className = 'sb-canvas'
  canvas.setAttribute('aria-label', '비행기와 해안 지형을 보여주는 3D 비행 게임')
  host.appendChild(canvas)
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#c8dfe1', 950, 3600)
  const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 11000)
  scene.add(camera)
  const resources = new Set()
  let disposed = false, invalidated = true
  const own = (resource) => { if (disposed) resource.dispose(); else resources.add(resource); return resource }
  const material = (color, options = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options }))
  const cream = material('#f3e9d2'), orange = material('#d87742'), charcoal = material('#37484a'), dark = material('#172e35')
  const cube = own(new THREE.BoxGeometry(1, 1, 1))
  const ball = own(new THREE.SphereGeometry(1, 16, 10))
  const mesh = (geometry, mat, parent = scene) => { const object = new THREE.Mesh(geometry, mat); parent.add(object); return object }
  const box = (parent, mat, x, y, z, w, h, d) => {
    const object = mesh(cube, mat, parent)
    object.position.set(x, y, z)
    object.scale.set(w, h, d)
    return object
  }
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#72938b', .8))
  const sun = new THREE.DirectionalLight('#fff1cf', 2.6)
  sun.position.set(-550, 600, -400)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 })
  sun.shadow.normalBias = .035
  sun.shadow.bias = -.0001
  scene.add(sun, sun.target)
  own(sun.shadow)
  const sunOffset = new THREE.Vector3(-.55, .6, -.4).normalize().multiplyScalar(35)

  const sky = mesh(own(new THREE.SphereGeometry(7000, 24, 16)), own(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vPosition; void main(){ vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vPosition; void main(){
      vec3 direction=normalize(vPosition);
      float height=max(0.,direction.y);
      vec3 color=mix(vec3(.85,.9,.85),vec3(.25,.52,.69),pow(height,.55));
      float solar=max(0.,dot(direction,normalize(vec3(-.55,.6,-.4))));
      color+=vec3(.55,.38,.14)*pow(solar,64.) + vec3(.6,.52,.36)*pow(solar,1600.);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  })))

  const coastData = new Uint8Array(256 * 256)
  for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) {
    coastData[z * 256 + x] = Math.round(Math.max(0, Math.min(1, (terrainHeight((x / 255 - .5) * 4800, (z / 255 - .5) * 4800 - 250) + 3) / 23)) * 255)
  }
  const coast = own(new THREE.DataTexture(coastData, 256, 256, THREE.RedFormat))
  coast.minFilter = THREE.LinearFilter; coast.magFilter = THREE.LinearFilter; coast.needsUpdate = true
  const waterMaterial = own(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCoast: { value: coast }, uSky: { value: null }, uHasSky: { value: false } },
    vertexShader: 'varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.); }',
    fragmentShader: `uniform float uTime; uniform sampler2D uCoast; uniform sampler2D uSky; uniform bool uHasSky; varying vec3 vWorld;
    #include <common>
    void main(){
      vec2 p=vWorld.xz;
      vec2 q=p+vec2(sin(p.y*.014)*14.,sin(p.x*.017)*9.);
      float waves=sin(q.x*.65+q.y*.31+uTime*.8)*sin(q.y*.82-q.x*.24+uTime*.6);
      float detail=sin(p.x*1.27-p.y*1.18+uTime*1.4);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float waveFade=1.-smoothstep(.8,5.,footprint);
      vec3 normal=normalize(vec3((waves*.025+detail*.012)*waveFade,1.,detail*.016*waveFade));
      vec3 eye=normalize(cameraPosition-vWorld);
      float reflection=pow(max(0.,dot(reflect(-normalize(vec3(-.55,.6,-.4)),normal),eye)),180.);
      float shore=texture2D(uCoast,(p+vec2(0.,250.))/4800.+.5).r;
      float shallows=smoothstep(.001,.14,shore);
      float foam=smoothstep(.10,.13,shore)*(1.-smoothstep(.15,.20,shore));
      foam*=smoothstep(.1,.8,sin(shore*160.-uTime*1.8)+waves*.25);
      float far=1.-exp(-length(vWorld-cameraPosition)/1900.);
      vec3 color=mix(vec3(.075,.33,.41),vec3(.25,.66,.61),shallows);
      color+=vec3(.002,.006,.008)*waves*waveFade+vec3(.55,.48,.31)*reflection;
      if(uHasSky){
        vec3 skyReflection=texture2D(uSky,equirectUv(reflect(-eye,normal))).rgb*.85;
        float fresnel=.06+.65*pow(1.-max(0.,dot(normal,eye)),5.);
        color=mix(color,skyReflection,fresnel);
      }
      color=mix(color,vec3(.78,.87,.77),foam*.5);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.784,.875,.882),far);
    }`,
  }))
  const water = mesh(own(new THREE.PlaneGeometry(18000, 18000)), waterMaterial)
  water.rotation.x = -Math.PI / 2

  const terrain = own(new THREE.PlaneGeometry(4800, 4800, 240, 240))
  terrain.rotateX(-Math.PI / 2)
  const positions = terrain.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const sand = new THREE.Color('#e0cf9e'), grass = new THREE.Color('#6c8b65'), rock = new THREE.Color('#929b8c'), tint = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) - 250
    const height = terrainHeight(x, z)
    positions.setXYZ(i, x, height, z)
    terrain.attributes.uv.setXY(i, x / 15, -z / 15)
    tint.copy(height < 8 ? sand : height < 65 ? grass : rock)
    tint.multiplyScalar(0.90 + 0.12 * Math.sin(x * 0.037 + z * 0.017))
    colors.set([tint.r, tint.g, tint.b], i * 3)
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  terrain.computeVertexNormals()
  const terrainMaterial = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  mesh(terrain, terrainMaterial)

  let seed = 8117
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const dummy = new THREE.Object3D()
  const trees = []
  for (let i = 0; i < 2000 && trees.length < 390; i++) {
    const island = ISLANDS[i % ISLANDS.length]
    const x = island.x + (random() - 0.5) * island.rx * 1.8
    const z = island.z + (random() - 0.5) * island.rz * 1.8
    const y = terrainHeight(x, z)
    if (y > 10 && y < 135) trees.push({ x, y, z, size: 5 + random() * 7 })
  }
  const foliage = new THREE.InstancedMesh(own(new THREE.ConeGeometry(1, 1, 5)), material('#476e5f', { flatShading: true }), trees.length)
  const trunks = new THREE.InstancedMesh(cube, material('#8a8266'), trees.length)
  trees.forEach((tree, i) => {
    dummy.position.set(tree.x, tree.y + tree.size * 0.6, tree.z)
    dummy.scale.set(tree.size * 0.45, tree.size, tree.size * 0.45)
    dummy.updateMatrix()
    foliage.setMatrixAt(i, dummy.matrix)
    foliage.setColorAt(i, tint.setHSL(0.40, 0.19 + random() * 0.13, 0.29 + random() * 0.11))
    dummy.position.y = tree.y + tree.size * 0.2
    dummy.scale.set(0.6, tree.size * 0.5, 0.6)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
  })
  scene.add(foliage, trunks)
  resources.add(foliage); resources.add(trunks)

  const cloudGeometry = own(new THREE.IcosahedronGeometry(1, 2))
  const clouds = new THREE.InstancedMesh(cloudGeometry, material('#f6f2e5'), 105)
  for (let i = 0; i < 105; i++) {
    const group = Math.floor(i / 5)
    const x = Math.sin(group * 7.1) * 2400, z = Math.cos(group * 4.7) * 2600 - 400
    dummy.position.set(x + (i % 5 - 2) * 38, 350 + Math.sin(group) * 85 + random() * 18, z + random() * 45)
    dummy.scale.set(38 + random() * 30, 15 + random() * 15, 28 + random() * 30)
    dummy.updateMatrix()
    clouds.setMatrixAt(i, dummy.matrix)
  }
  scene.add(clouds); resources.add(clouds)

  // A small coastal airstrip gives the starting area a recognisable landmark.
  const asphalt = material('#65777a'), stripe = material('#e8e6cd')
  box(scene, asphalt, -220, 10.15, 190, 22, 0.25, 185)
  for (let i = 0; i < 12; i++) box(scene, stripe, -220, 10.3, 112 + i * 14, 0.8, 0.04, 7)
  for (const z of [104, 276]) for (let i = -3; i <= 3; i++) box(scene, stripe, -220 + i * 2.6, 10.3, z, 1.4, 0.04, 9)
  const hangar = material('#bbc6b6')
  box(scene, hangar, -260, 16, 180, 29, 12, 36)
  box(scene, charcoal, -244.9, 14.5, 180, 0.2, 8, 25)
  box(scene, orange, -260, 22.3, 180, 32, 0.6, 39)

  // A lighthouse and a clustered coastal village give the route scale.
  const lighthouse = new THREE.Group()
  lighthouse.position.set(170, terrainHeight(170, -390), -390)
  scene.add(lighthouse)
  mesh(own(new THREE.CylinderGeometry(3.2, 4.8, 28, 16)), cream, lighthouse).position.y = 14
  mesh(own(new THREE.CylinderGeometry(3.7, 3.7, 4, 16)), orange, lighthouse).position.y = 23
  mesh(own(new THREE.CylinderGeometry(5, 5, .6, 16)), charcoal, lighthouse).position.y = 29
  mesh(own(new THREE.CylinderGeometry(3, 3, 4, 12)), material('#abc8bf', { metalness: .4, roughness: .2 }), lighthouse).position.y = 31
  mesh(own(new THREE.ConeGeometry(4.5, 3, 12)), orange, lighthouse).position.y = 34.5
  const homes = new THREE.InstancedMesh(cube, cream, 24)
  const roofs = new THREE.InstancedMesh(own(new THREE.ConeGeometry(1, 1, 4)), material('#b76f49'), 24)
  for (let i = 0; i < 24; i++) {
    const x = 435 + i % 6 * 15, z = -170 + Math.floor(i / 6) * 16
    const height = 4 + random() * 3, y = terrainHeight(x, z)
    dummy.position.set(x, y + height / 2, z); dummy.scale.set(9, height, 8); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
    homes.setMatrixAt(i, dummy.matrix)
    dummy.position.y = y + height + 2; dummy.scale.set(8, 4, 7); dummy.rotation.y = Math.PI / 4; dummy.updateMatrix()
    roofs.setMatrixAt(i, dummy.matrix)
  }
  scene.add(homes, roofs); resources.add(homes); resources.add(roofs)

  const plane = new THREE.Group()
  scene.add(plane)
  const profile = [[0.06, -5], [0.56, -4.5], [0.82, -3.5], [0.78, -1], [0.62, 1.2], [0.28, 3.3], [0.06, 4.8]].map(([r, y]) => new THREE.Vector2(r, y))
  const fuselage = mesh(own(new THREE.LatheGeometry(profile, 20)), cream, plane)
  fuselage.rotation.x = Math.PI / 2
  const cowling = mesh(own(new THREE.SphereGeometry(0.68, 16, 12)), orange, plane)
  cowling.position.set(0, 0, -4.15)
  cowling.scale.z = 1.25
  const canopy = mesh(ball, material('#537c83', { metalness: 0.2, roughness: 0.15 }), plane)
  canopy.position.set(0, 0.64, -1.5)
  canopy.scale.set(0.68, 0.67, 1.55)
  box(plane, cream, 0, 1.18, -1.3, 0.09, 0.09, 2.5)
  box(plane, orange, -0.69, 0.12, 0.8, 0.06, 0.16, 4)
  box(plane, orange, 0.69, 0.12, 0.8, 0.06, 0.16, 4)

  function wing(points, mat, x, y, z) {
    const shape = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)))
    const geometry = own(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.06, bevelThickness: 0.05 }))
    geometry.rotateX(Math.PI / 2)
    const object = mesh(geometry, mat, plane)
    object.position.set(x, y, z)
    return object
  }
  wing([[-7.4, -0.1], [-7.1, -1.05], [-1, -1.8], [1, -1.8], [7.1, -1.05], [7.4, -0.1], [7, 0.9], [1, 1], [-1, 1], [-7, 0.9]], cream, 0, 0.2, -0.3)
  for (const side of [-1, 1]) {
    box(plane, orange, side * 6.7, 0.2, -0.45, 0.85, 0.2, 1.65)
    box(plane, charcoal, side * 3.4, 0.22, 0.67, 4.4, 0.05, 0.09)
    const light = mesh(ball, own(new THREE.MeshBasicMaterial({ color: side < 0 ? '#e88a68' : '#a3d4a7' })), plane)
    light.position.set(side * 7.25, 0.25, 0)
    light.scale.setScalar(0.11)
  }
  wing([[-2.6, 0], [-2.3, -0.75], [0, -1.1], [2.3, -0.75], [2.6, 0], [2.2, 0.55], [-2.2, 0.55]], orange, 0, 0.3, 3.55)
  const fin = wing([[0, 0], [1.9, 0.3], [1.5, 1.4], [0, 1.6]], cream, 0, 0.2, 3)
  fin.rotation.z = Math.PI / 2
  const propeller = new THREE.Group()
  propeller.position.z = -5.02
  plane.add(propeller)
  box(propeller, charcoal, 0, 0, 0, 0.19, 3.3, 0.08)
  box(propeller, charcoal, 0, 0, 0, 3.3, 0.19, 0.08)
  const spinner = mesh(ball, orange, propeller)
  spinner.scale.set(0.22, 0.22, 0.44)
  spinner.position.z = -0.15
  for (const side of [-1, 1]) {
    const strut = box(plane, charcoal, side * 1.1, -0.8, 0.6, 0.09, 1.25, 0.09)
    strut.rotation.z = side * 0.3
    const wheel = mesh(own(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 12)), dark, plane)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(side * 1.3, -1.4, 0.6)
  }
  const fallback = new THREE.Group()
  fallback.add(...plane.children)
  plane.add(fallback)

  const gateGeometry = own(new THREE.TorusGeometry(1, 0.024, 8, 96))
  const gates = GATES.map((gate) => {
    const group = new THREE.Group()
    group.position.set(gate.x, gate.y, gate.z)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(gate.normal.x, gate.normal.y, gate.normal.z))
    const ringMaterial = own(new THREE.MeshBasicMaterial({ color: '#ffc973', transparent: true, opacity: 0.96 }))
    const ring = mesh(gateGeometry, ringMaterial, group)
    ring.scale.setScalar(gate.radius)
    const center = mesh(own(new THREE.RingGeometry(0.97, 1, 72)), own(new THREE.MeshBasicMaterial({ color: '#fff1ce', transparent: true, opacity: 0.18, side: THREE.DoubleSide })), group)
    center.scale.setScalar(gate.radius * 1.18)
    scene.add(group)
    return { group, ringMaterial, center }
  })

  const trails = [-1, 1].map(() => {
    const array = new Float32Array(80 * 3)
    const geometry = own(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3).setUsage(THREE.DynamicDrawUsage))
    const line = new THREE.Line(geometry, own(new THREE.LineBasicMaterial({ color: '#f2f5df', transparent: true, opacity: 0.24 })))
    line.frustumCulled = false
    scene.add(line)
    return { array, geometry, line, initialized: false }
  })
  const desired = new THREE.Vector3(), target = new THREE.Vector3(), tip = new THREE.Vector3(), forward = new THREE.Vector3()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const cockpit = createCockpit(camera, own)
  const assets = loadFlightAssets({ scene, renderer, own, isDisposed: () => disposed, invalidate: () => { invalidated = true }, aircraft: plane, fallback, sky, clouds, terrainMaterial, waterMaterial })
  let first = true, lastMode = '', lastGate = -1

  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    cockpit.resize(camera.aspect)
    invalidated = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()

  return {
    renderer,
    get needsRender() { return invalidated },
    get loadingAssets() { return assets.aircraft === 'loading' || assets.lighting === 'loading' || assets.terrain === 'loading' },
    assetState() { return { ...assets } },
    cameraState() { return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), aircraftQuaternion: plane.quaternion.toArray(), cockpitVisible: cockpit.group.visible, fov: camera.fov } },
    reset() { first = true; trails.forEach((trail) => { trail.initialized = false }) },
    render(state, dt, { view, calm }) {
      const p = state.position
      plane.position.set(p.x, p.y, p.z)
      plane.rotation.set(state.pitch, -state.heading, -state.roll, 'YXZ')
      plane.updateMatrixWorld()
      sun.position.copy(plane.position).add(sunOffset)
      sun.target.position.copy(plane.position)
      const ready = state.phase === 'ready'
      const mode = ready ? 'ready' : view
      const pilot = mode === 'cockpit'
      plane.visible = mode === 'chase' || ready
      cockpit.group.visible = pilot
      if (pilot) cockpit.update(state, calm)
      const fov = pilot ? 68 : 58
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
      propeller.rotation.z = state.elapsed * (calm ? 8 : 75)
      if (mode === 'ready') {
        desired.set(p.x + 20, p.y + 7, p.z + 22)
        target.set(p.x, p.y, p.z - 2)
      } else if (pilot) {
        desired.set(0, 1.12, -1.15).applyMatrix4(plane.matrixWorld)
      } else if (mode === 'nose') {
        desired.set(0, 1.2, -3.2).applyMatrix4(plane.matrixWorld)
        target.set(0, 0.8, -150).applyMatrix4(plane.matrixWorld)
      } else {
        forward.set(Math.sin(state.heading), 0, -Math.cos(state.heading))
        desired.set(p.x - forward.x * 30, p.y + 8.2, p.z - forward.z * 30)
        target.set(p.x + forward.x * 45, p.y + Math.sin(state.pitch) * 22, p.z + forward.z * 45)
      }
      if (first || mode !== lastMode || calm || pilot) camera.position.copy(desired)
      else camera.position.lerp(desired, 1 - Math.exp(-5.5 * dt))
      if (pilot) {
        camera.quaternion.copy(plane.quaternion)
        // Calm mode levels the horizon without adding positional camera lag.
        if (calm) camera.rotation.set(state.pitch, -state.heading, 0, 'YXZ')
      } else {
        camera.up.copy(worldUp)
        if (mode === 'nose' && !calm) camera.up.applyQuaternion(plane.quaternion)
        camera.lookAt(target)
      }
      first = false
      lastMode = mode
      sky.position.copy(camera.position)
      waterMaterial.uniforms.uTime.value = calm ? 0 : state.elapsed

      if (lastGate !== state.gate || state.phase === 'ready') {
        gates.forEach((gate, i) => {
          gate.ringMaterial.color.set(i === state.gate ? '#ffd28b' : '#ddf4e4')
          gate.ringMaterial.opacity = i === state.gate ? 1 : 0.38
          gate.center.visible = i === state.gate
        })
        lastGate = state.gate
      }
      gates.forEach((gate, i) => { gate.group.visible = state.mode === 'course' && i >= state.gate && i <= state.gate + 2 })
      trails.forEach((trail, index) => {
        trail.line.visible = !ready && !calm && view === 'chase'
        if (state.phase !== 'playing') return
        tip.set(index ? 7.2 : -7.2, 0.18, 0.8).applyMatrix4(plane.matrixWorld)
        if (!trail.initialized) { for (let i = 0; i < 80; i++) trail.array.set([tip.x, tip.y, tip.z], i * 3); trail.initialized = true }
        trail.array.copyWithin(3, 0, trail.array.length - 3)
        trail.array.set([tip.x, tip.y, tip.z], 0)
        trail.geometry.attributes.position.needsUpdate = true
      })
      renderer.render(scene, camera)
      invalidated = false
      canvas.dataset.assets = Object.values(assets).includes('loading') ? 'loading' : Object.values(assets).includes('fallback') ? 'fallback' : 'ready'
      canvas.dataset.phase = state.phase
      canvas.dataset.position = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`
      canvas.dataset.view = view
    },
    dispose() {
      disposed = true
      resizeObserver.disconnect()
      scene.environment = null
      scene.background = null
      for (const resource of resources) resource.dispose()
      resources.clear()
      renderer.dispose()
      canvas.remove()
    },
  }
}
