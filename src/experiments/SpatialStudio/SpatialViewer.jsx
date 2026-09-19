import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { horizontalRadius, isStableScene } from './navigation'

export default function SpatialViewer({ base, metadata, mode, cameraIndex, resetKey, exploring, onReady, onError }) {
  const host = useRef(null)
  const control = useRef(null)
  const callbacks = useRef({ onReady, onError })
  const [error, setError] = useState('')
  useEffect(() => { callbacks.current = { onReady, onError } }, [onReady, onError])

  useEffect(() => {
    if (!base || !isStableScene(metadata) || !host.current) return
    const container = host.current
    let disposed = false
    let model
    let renderer
    const fail = message => { setError(message); callbacks.current.onError?.(message) }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      queueMicrotask(() => fail('3D를 표시할 수 없습니다. 브라우저의 하드웨어 가속을 켜 주세요.'))
      return
    }
    queueMicrotask(() => setError(''))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor('#eae7df', 1)
    renderer.domElement.setAttribute('aria-label', '사진에서 재구성한 3D 공간. 드래그로 시점 이동, 스크롤로 확대합니다.')
    renderer.domElement.setAttribute('tabindex', '0')
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#fff8eb', '#aaa18f', 2.3))
    const key = new THREE.DirectionalLight('#fff7e7', 3.5)
    key.position.set(-4, 9, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const span = Math.max(...metadata.roomSize) * .9
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: .5, far: 40 })
    key.shadow.normalBias = .025
    key.shadow.bias = -.00015
    scene.add(key)
    const fill = new THREE.DirectionalLight('#e4efff', 1)
    fill.position.set(5, 5, -4)
    scene.add(fill)
    const camera = new THREE.PerspectiveCamera(45, 1, .05, 150)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .09
    controls.rotateSpeed = .45
    controls.panSpeed = .3
    controls.zoomSpeed = .45
    controls.screenSpacePanning = true
    controls.enablePan = false
    const state = { renderer, camera, controls, scene, model: null, mode, metadata, cameraIndex, resetKey, exploring }
    control.current = state
    const setView = (index) => {
      const view = metadata.cameras[index] || metadata.cameras[0]
      // Consume pending drag inertia before placing a calibrated camera.
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
      controls.enableDamping = damping
      camera.position.fromArray(view.position)
      camera.up.fromArray(view.up)
      controls.target.fromArray(view.target)
      controls.minDistance = view.distance * .85
      controls.maxDistance = view.distance * 1.25
      camera.fov = view.fov
      camera.lookAt(controls.target)
      controls.update()
      const radius = horizontalRadius(metadata)
      controls.minAzimuthAngle = -radius
      controls.maxAzimuthAngle = radius
      controls.minPolarAngle = THREE.MathUtils.degToRad(48)
      controls.maxPolarAngle = THREE.MathUtils.degToRad(72)
      camera.updateProjectionMatrix()
    }
    state.setView = setView
    setView(cameraIndex)
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      const view = metadata.cameras[state.cameraIndex] || metadata.cameras[0]
      // Fit the source frustum to both portrait and landscape viewports.
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(view.fov / 2))
        * Math.max(1, view.aspect / camera.aspect)))
      camera.updateProjectionMatrix()
      state.render?.()
    }
    state.resize = resize
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const disposeModel = object => object?.traverse(child => {
      child.geometry?.dispose()
      for (const material of [child.material].flat().filter(Boolean)) {
        material.map?.dispose()
        material.dispose()
      }
    })
    const draco = new DRACOLoader().setDecoderPath('/spatial-draco/')
    const load = async () => {
      try {
        const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(`${base}/scene.glb`)
        if (disposed) { disposeModel(gltf.scene); return }
        model = gltf.scene
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
            for (const material of [child.material].flat()) material.side = THREE.FrontSide
          }
        })
        scene.add(model)
        state.model = model
        state.render?.()
        callbacks.current.onReady?.()
      } catch (failure) {
        if (!disposed && !model) fail(`공간을 불러오지 못했습니다. ${failure.message}`)
      }
    }
    load()
    const render = () => {
      if (disposed) return
      controls.enabled = state.exploring
      controls.update()
      if (model) {
        model.visible = state.mode !== 'photo'
        model.traverse(child => {
          if (child.isMesh) for (const material of [child.material].flat()) material.wireframe = state.mode === 'wireframe'
          const side = child.userData.cutaway
          if (side) child.visible = !((side === 'left' && camera.position.x < -.1)
            || (side === 'right' && camera.position.x > .1) || (side === 'back' && camera.position.z < -.1))
        })
      }
      renderer.render(scene, camera)
      container.dataset.camera = camera.position.toArray().map(n => n.toFixed(4)).join(',')
      container.dataset.renderer = 'closed-solids'
      container.dataset.range = String(Math.round(horizontalRadius(metadata) * 360 / Math.PI))
      container.dataset.yaw = THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()).toFixed(1)
      container.dataset.elevation = (90 - THREE.MathUtils.radToDeg(controls.getPolarAngle())).toFixed(1)
      container.dataset.distance = camera.position.distanceTo(controls.target).toFixed(4)
    }
    state.render = render
    renderer.setAnimationLoop(() => { if (!document.hidden) render() })
    return () => {
      disposed = true
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      disposeModel(model)
      draco.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      control.current = null
    }
  }, [base, metadata]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const state = control.current
    if (!state) return
    state.mode = mode
    state.exploring = exploring
    state.render()
  }, [mode, exploring])

  useEffect(() => {
    const state = control.current
    if (!state) return
    state.cameraIndex = cameraIndex
    state.resetKey = resetKey
    state.controls.minAzimuthAngle = -Infinity
    state.controls.maxAzimuthAngle = Infinity
    state.controls.minPolarAngle = 0
    state.controls.maxPolarAngle = Math.PI
    state.setView(cameraIndex)
    state.resize()
  }, [cameraIndex, resetKey])

  return <div className="sp-viewer" ref={host} data-testid="spatial-viewer">
    {error && <div className="sp-viewer-error" role="alert">{error}</div>}
  </div>
}
