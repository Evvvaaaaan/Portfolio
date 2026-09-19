import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createMannequin, disposeObject, normalizeModel } from './model.js'

export function createFittingScene(host) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e9e6df')
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 30)
  camera.position.set(0.55, 1.18, 3.65)
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3
  renderer.domElement.className = 'fitting-canvas'
  renderer.domElement.tabIndex = 0
  renderer.domElement.setAttribute('aria-label', '3D fitting viewer. Drag to rotate. Scroll or pinch to zoom.')
  host.appendChild(renderer.domElement)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.98, 0)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 2
  controls.maxDistance = 5.5
  controls.minPolarAngle = 0.55
  controls.maxPolarAngle = 1.9
  controls.autoRotateSpeed = 1
  const environment = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(environment, 0.06)
  scene.environment = env.texture
  environment.dispose()
  pmrem.dispose()
  const key = new THREE.DirectionalLight('#fff2db', 3.5)
  key.position.set(-2, 4, 3)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -2.5
  key.shadow.camera.right = key.shadow.camera.top = 2.5
  key.shadow.normalBias = 0.018
  key.shadow.bias = -0.0002
  scene.add(key)
  const rim = new THREE.DirectionalLight('#d7e6f3', 2)
  rim.position.set(2, 2.5, -2)
  scene.add(rim, new THREE.HemisphereLight('#fff9ee', '#706a62', 0.6))
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 80), new THREE.MeshStandardMaterial({ color: '#e7e3da', roughness: 0.86 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.68, 0.07, 80), new THREE.MeshStandardMaterial({ color: '#eeebe4', roughness: 0.68 }))
  plinth.position.y = 0.035
  plinth.receiveShadow = plinth.castShadow = true
  scene.add(plinth)
  const modelSlot = new THREE.Group()
  modelSlot.position.y = 0.075
  scene.add(modelSlot)
  let model = createMannequin(), wireframe = false, disposed = false
  modelSlot.add(model)
  const manager = new THREE.LoadingManager()
  // Only embedded GLB resources can load. A user-supplied model cannot phone home.
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url
    throw new Error('EXTERNAL_MODEL_RESOURCE')
  })
  const loader = new GLTFLoader(manager)
  let loadVersion = 0
  const setWireframe = () => model.traverse((o) => {
    if (o.isMesh) for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.wireframe = wireframe
  })
  const replace = (next) => {
    modelSlot.remove(model)
    disposeObject(model)
    model = next
    modelSlot.add(model)
    setWireframe()
  }
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  let frame = 0, last = 0
  const tick = (now) => {
    if (disposed) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    controls.update(dt)
    renderer.render(scene, camera)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return {
    demo(outfit, color) { loadVersion++; replace(createMannequin(outfit, color)) },
    async load(buffer) {
      const version = ++loadVersion
      const gltf = await loader.parseAsync(buffer, '')
      if (disposed || version !== loadVersion) { disposeObject(gltf.scene); return false }
      try { replace(normalizeModel(gltf.scene)) }
      catch (error) { disposeObject(gltf.scene); throw error }
      return true
    },
    rotate(value) { controls.autoRotate = value },
    wireframe(value) { wireframe = value; setWireframe() },
    angle(value) {
      const distance = camera.position.distanceTo(controls.target)
      camera.position.set(Math.sin(value) * distance, 1.15, Math.cos(value) * distance)
      controls.update()
    },
    zoom(delta) {
      const offset = camera.position.clone().sub(controls.target)
      const distance = THREE.MathUtils.clamp(offset.length() + delta, controls.minDistance, controls.maxDistance)
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance))
      controls.update()
    },
    lighting(mode) {
      const warm = mode === 'warm', dark = mode === 'dark'
      scene.background.set(dark ? '#282e32' : warm ? '#e9ddc8' : '#e9e6df')
      floor.material.color.set(dark ? '#30373b' : warm ? '#d9ccb6' : '#e7e3da')
      key.color.set(warm ? '#ffd2a3' : '#fff2db')
      renderer.toneMappingExposure = dark ? 1.05 : 1.3
    },
    snapshot() { renderer.render(scene, camera); return new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png')) },
    getState() { return { camera: camera.position.toArray(), demo: Boolean(model.userData.demo), meshes: renderer.info.render.calls } },
    dispose() {
      disposed = true
      loadVersion++
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      disposeObject(model)
      disposeObject(floor)
      disposeObject(plinth)
      key.shadow.map?.dispose()
      env.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
