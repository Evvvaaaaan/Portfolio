import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { samplePath, stopT } from './cloudPath'
import { SCULPTURES, layout, waypoints } from './sculptures'
import { formFor, superPoint, maxExtent } from './forms'
import { sunAt } from './sun'
import { CLOUD_FRAG } from './clouds.glsl'
import '../shared/exp.css'
import './CloudGallery.css'


// 배치 프로토타입 스위치: ?layout=arc&sweep=200&side=-4.5 로 눈으로 비교한다.
// side가 음수면 카메라가 호 안쪽에 서서 작품들이 둘러싸는 구도가 된다.
const PARAMS = new URLSearchParams(window.location.search)
const SHAPE = PARAMS.get('layout') === 'arc' ? 'arc' : 'line'
const SWEEP = Number(PARAMS.get('sweep')) || 200
const SIDE = PARAMS.has('side') ? Number(PARAMS.get('side')) : 4.5
const BLOOM = PARAMS.has('bloom') ? Number(PARAMS.get('bloom')) : 0.35
const LAID = layout(SCULPTURES, { spacing: 16, height: 0, shape: SHAPE, sweep: SWEEP })

// 슈퍼포뮬러 표면을 격자로 샘플링해 BufferGeometry로 굽는다. 14개가 비슷한
// 덩치로 읽히도록 최대 반경으로 정규화한다. 프로토타입이라 감기 방향을 따지지
// 않고 DoubleSide로 그린다 — 실루엣만 보면 되는 단계라서.
function buildSuperGeometry(params, target = 1.6) {
  const segU = 128
  const segV = 64
  const scale = target / maxExtent(params)
  const positions = new Float32Array((segU + 1) * (segV + 1) * 3)

  for (let i = 0; i <= segU; i++) {
    const theta = -Math.PI + (i / segU) * Math.PI * 2
    for (let j = 0; j <= segV; j++) {
      const phi = -Math.PI / 2 + (j / segV) * Math.PI
      const [x, y, z] = superPoint(params, theta, phi)
      const k = (i * (segV + 1) + j) * 3
      positions[k] = x * scale
      positions[k + 1] = y * scale
      positions[k + 2] = z * scale
    }
  }

  const indices = []
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j
      const b = a + 1
      const c = (i + 1) * (segV + 1) + j
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildGeometry(form) {
  if (form.family === 'knot') {
    const { p, q, tube } = form.params
    return new THREE.TorusKnotGeometry(1.15, 1.15 * tube, 240, 32, p, q)
  }
  return buildSuperGeometry(form.params)
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
  const [stopIdx, setStopIdx] = useState(0)
  const targetStopRef = useRef(0)

  // keep the render loop's target in sync with UI state
  useEffect(() => { targetStopRef.current = stopIdx }, [stopIdx])

  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const laid = LAID
    const wps = waypoints(laid, { back: 8, up: 2.6, side: SIDE })
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
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
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
    // 방향·색·세기 모두 투어 진행도에 따라 매 프레임 갱신된다 (loop 참조).
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2)
    scene.add(sunLight)
    scene.add(new THREE.AmbientLight(0x334455, 0.4))

    // ── sculptures ──
    const geoms = []
    const mats = []
    const meshes = laid.map((s, i) => {
      const form = formFor(s.id, i)
      const g = buildGeometry(form)
      const m = buildMaterial(s.material)
      if (form.family === 'super') m.side = THREE.DoubleSide
      geoms.push(g)
      mats.push(m)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(s.position[0], s.position[1], s.position[2])
      scene.add(mesh)
      return { mesh, spin: form.spin }
    })

    // ── postprocessing ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, cam))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight), BLOOM, 0.6, 0.85,
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
    const spinAxis = new THREE.Vector3()
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

      // 태양을 투어에 연동: 새벽의 낮고 따뜻한 빛에서 정오를 지나 황혼까지.
      // 조명과 하늘이 같은 값을 쓰므로 둘이 어긋나지 않는다.
      const sky = sunAt(progress)
      bgUniforms.uSunDir.value.set(sky.dir[0], sky.dir[1], sky.dir[2])
      bgUniforms.uSunColor.value.setRGB(sky.color[0], sky.color[1], sky.color[2])
      sunLight.position.set(sky.dir[0], sky.dir[1], sky.dir[2]).multiplyScalar(20)
      sunLight.color.setRGB(sky.color[0], sky.color[1], sky.color[2])
      sunLight.intensity = sky.intensity

      for (const { mesh, spin } of meshes) {
        spinAxis.set(spin.axis[0], spin.axis[1], spin.axis[2])
        mesh.quaternion.setFromAxisAngle(spinAxis, reduced ? 0.4 : time * spin.speed)
      }

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

  const laid = LAID
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
      <p className="cg-hint">
        스크롤 / ↑↓ — 다음 작품 · layout={SHAPE}
        {SHAPE === 'arc' && ` sweep=${SWEEP}° side=${SIDE}`}
      </p>
    </div>
  )
}
