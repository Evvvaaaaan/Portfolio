import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { samplePath, stopT } from './cloudPath'
import { SCULPTURES, layout, waypoints } from './sculptures'
import { CLOUD_FRAG } from './clouds.glsl'
import '../shared/exp.css'
import './CloudGallery.css'

const SUN_DIR = new THREE.Vector3(0.6, 0.7, 0.35).normalize()

function buildGeometry(form) {
  switch (form) {
    case 'torusKnot': return new THREE.TorusKnotGeometry(1.2, 0.38, 220, 32)
    case 'crystal':   return new THREE.IcosahedronGeometry(1.6, 0)
    case 'wave':      return new THREE.TorusGeometry(1.3, 0.45, 32, 220)
    case 'sphere':    return new THREE.SphereGeometry(1.5, 96, 96)
    default:          return new THREE.IcosahedronGeometry(1.4, 1)
  }
}

function buildMaterial(kind) {
  switch (kind) {
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.05,
        transmission: 1, thickness: 1.5, ior: 1.45, clearcoat: 1,
      })
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 1, roughness: 0.34, flatShading: true })
    case 'marble':
      return new THREE.MeshStandardMaterial({ color: 0xf1ece4, metalness: 0, roughness: 0.5 })
    case 'chrome':
      return new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 })
    default:
      return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 })
  }
}

export default function CloudGallery() {
  const mountRef = useRef(null)
  const laidRef = useRef(layout(SCULPTURES, { spacing: 16, height: 0 }))
  const [stopIdx, setStopIdx] = useState(0)
  const targetStopRef = useRef(0)

  // keep the render loop's target in sync with UI state
  useEffect(() => { targetStopRef.current = stopIdx }, [stopIdx])

  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const laid = laidRef.current
    const wps = waypoints(laid, { back: 8, up: 2.6, side: 4.5 })
    const count = laid.length

    // ── renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    const narrow = mount.clientWidth < 720
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow ? 1.1 : 1.5))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.insertBefore(renderer.domElement, mount.firstChild)

    // ── environment (reflections) ──
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)

    const scene = new THREE.Scene()
    scene.environment = envRT.texture
    const cam = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 300)

    // ── background quad (sky + clouds) ──
    const bgUniforms = {
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uCamRight: { value: new THREE.Vector3() },
      uCamUp: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
      uTanFov: { value: Math.tan((50 / 2) * Math.PI / 180) },
      uAspect: { value: 1 },
      uSunDir: { value: SUN_DIR.clone() },
    }
    const bgMat = new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
      fragmentShader: CLOUD_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat)
    bgQuad.renderOrder = -1
    bgQuad.frustumCulled = false
    scene.add(bgQuad)

    // ── key light so metals/marble read directional ──
    const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2)
    sunLight.position.copy(SUN_DIR).multiplyScalar(20)
    scene.add(sunLight)
    scene.add(new THREE.AmbientLight(0x334455, 0.4))

    // ── sculptures ──
    const geoms = []
    const mats = []
    const meshes = laid.map((s) => {
      const g = buildGeometry(s.form)
      const m = buildMaterial(s.material)
      geoms.push(g)
      mats.push(m)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(s.position[0], s.position[1], s.position[2])
      scene.add(mesh)
      return mesh
    })

    // ── postprocessing ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, cam))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight), 0.35, 0.6, 0.85,
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const setSize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      composer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      const buf = renderer.getDrawingBufferSize(new THREE.Vector2())
      bgUniforms.uRes.value.copy(buf)
      bgUniforms.uAspect.value = w / h
    }
    setSize()

    // ── input: advance / retreat tour stop ──
    const clampStop = (i) => Math.max(0, Math.min(count - 1, i))
    const onWheel = (e) => {
      e.preventDefault()
      targetStopRef.current = clampStop(targetStopRef.current + (e.deltaY > 0 ? 1 : -1))
      setStopIdx(targetStopRef.current)
    }
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        targetStopRef.current = clampStop(targetStopRef.current + 1)
        setStopIdx(targetStopRef.current)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        targetStopRef.current = clampStop(targetStopRef.current - 1)
        setStopIdx(targetStopRef.current)
      }
    }
    let touchY = null
    const onTouchStart = (e) => { touchY = e.touches[0].clientY }
    const onTouchEnd = (e) => {
      if (touchY == null) return
      const dy = e.changedTouches[0].clientY - touchY
      if (Math.abs(dy) > 40) {
        targetStopRef.current = clampStop(targetStopRef.current + (dy < 0 ? 1 : -1))
        setStopIdx(targetStopRef.current)
      }
      touchY = null
    }
    mount.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    mount.addEventListener('touchstart', onTouchStart, { passive: true })
    mount.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('resize', setSize)

    // ── loop ──
    let progress = 0
    let raf = 0
    let running = true
    const right = new THREE.Vector3()
    const upv = new THREE.Vector3()
    const fwd = new THREE.Vector3()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const time = performance.now() / 1000
      const targetT = stopT(targetStopRef.current, count)
      progress += (targetT - progress) * 0.06

      const s = samplePath(wps, progress)
      cam.position.set(s.position[0], s.position[1], s.position[2])
      cam.lookAt(s.lookAt[0], s.lookAt[1], s.lookAt[2])

      // feed camera basis to the cloud shader
      cam.matrixWorld.extractBasis(right, upv, fwd)
      bgUniforms.uCamPos.value.copy(cam.position)
      bgUniforms.uCamRight.value.copy(right)
      bgUniforms.uCamUp.value.copy(upv)
      bgUniforms.uCamFwd.value.copy(fwd.clone().negate()) // camera looks down -Z
      bgUniforms.uTime.value = reduced ? 8 : time

      for (const mesh of meshes) mesh.rotation.y = reduced ? 0.4 : time * 0.15

      composer.render()
    }
    loop()

    const onVis = () => { running = !document.hidden }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', setSize)
      window.removeEventListener('keydown', onKey)
      mount.removeEventListener('wheel', onWheel)
      mount.removeEventListener('touchstart', onTouchStart)
      mount.removeEventListener('touchend', onTouchEnd)
      geoms.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      bgQuad.geometry.dispose()
      bgMat.dispose()
      envRT.dispose()
      pmrem.dispose()
      composer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  const laid = laidRef.current
  const current = laid[stopIdx]

  return (
    <div className="cloud-gallery" ref={mountRef}>
      <div className="cg-info">
        <span className="cg-label">{current.label}</span>
        <span className="cg-caption">{current.caption}</span>
      </div>
      <div className="cg-dots">
        {laid.map((s, i) => (
          <span key={s.id} className={`cg-dot${i === stopIdx ? ' active' : ''}`} />
        ))}
      </div>
      <p className="cg-hint">스크롤 / ↑↓ — 다음 작품</p>
    </div>
  )
}
