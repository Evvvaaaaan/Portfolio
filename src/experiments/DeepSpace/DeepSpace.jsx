import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

// 부드러운 원형 점 텍스처
function makeDotTexture(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

// 성운 텍스처: 색 번짐이 있는 큰 라디얼 블롭
function makeNebulaTexture(hue) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  for (let i = 0; i < 5; i++) {
    const x = 128 + (Math.random() - 0.5) * 110
    const y = 128 + (Math.random() - 0.5) * 110
    const r = 50 + Math.random() * 75
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `hsla(${hue + (Math.random() - 0.5) * 40},75%,62%,0.16)`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  }
  return new THREE.CanvasTexture(c)
}

// 항성 온도 분포를 흉내낸 색
function starColor(rng) {
  const r = rng()
  if (r < 0.55) return [1, 1, 1]
  if (r < 0.75) return [0.72, 0.82, 1]
  if (r < 0.92) return [1, 0.92, 0.72]
  return [1, 0.68, 0.55]
}

export default function DeepSpace() {
  const wrapRef = useRef()

  useEffect(() => {
    const wrap = wrapRef.current
    let raf

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x000005, 0.0009)
    const camera = new THREE.PerspectiveCamera(62, wrap.clientWidth / wrap.clientHeight, 0.1, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x010104)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    const dotTex = makeDotTexture()
    const disposables = [dotTex]

    // 별 층: 멀수록 작고 흐리게 — 시점이 돌 때 시차로 깊이감이 생김
    const makeLayer = (count, rMin, rMax, size, opacity, bandRatio = 0) => {
      const pos = new Float32Array(count * 3)
      const col = new Float32Array(count * 3)
      const band = new THREE.Vector3(0.35, 1, 0.18).normalize() // 은하수 평면 법선
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3(
          Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
        ).normalize()
        // 일부 별은 은하수 띠 평면 근처로 끌어모음
        if (i < count * bandRatio) {
          const d = v.dot(band)
          v.addScaledVector(band, -d * 0.92).normalize()
        }
        v.multiplyScalar(rMin + Math.random() * (rMax - rMin))
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z
        const [cr, cg, cb] = starColor(Math.random)
        const lum = 0.55 + Math.random() * 0.45
        col[i * 3] = cr * lum; col[i * 3 + 1] = cg * lum; col[i * 3 + 2] = cb * lum
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const mat = new THREE.PointsMaterial({
        map: dotTex, size, vertexColors: true, transparent: true, opacity,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      })
      disposables.push(geo, mat)
      const pts = new THREE.Points(geo, mat)
      scene.add(pts)
      return mat
    }

    makeLayer(4200, 260, 520, 1.5, 0.8, 0.5)
    makeLayer(2200, 130, 270, 1.9, 0.85, 0.35)
    const nearMat = makeLayer(700, 60, 140, 2.6, 0.95)

    // 성운들
    const nebulaHues = [215, 255, 280, 305, 190, 330]
    for (let i = 0; i < 13; i++) {
      const tex = makeNebulaTexture(nebulaHues[i % nebulaHues.length])
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.10 + Math.random() * 0.12,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
      disposables.push(tex, mat)
      const sp = new THREE.Sprite(mat)
      const v = new THREE.Vector3(
        Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
      ).normalize().multiplyScalar(180 + Math.random() * 260)
      sp.position.copy(v)
      sp.scale.setScalar(120 + Math.random() * 220)
      scene.add(sp)
    }

    // 시점 회전 (yaw/pitch) + 관성, 휠로 전진/후진
    let yaw = 0, pitch = 0, vyaw = 0, vpitch = 0
    let dragging = false, px = 0, py = 0
    let lastInteract = 0
    const el = renderer.domElement
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY; lastInteract = performance.now() }
    const onMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - px, dy = e.clientY - py
      px = e.clientX; py = e.clientY
      vyaw = dx * 0.0022
      vpitch = dy * 0.0022
      yaw -= vyaw
      pitch -= vpitch
      lastInteract = performance.now()
    }
    const onUp = () => { dragging = false }
    const onWheel = (e) => {
      e.preventDefault()
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      camera.position.addScaledVector(dir, -e.deltaY * 0.06)
      if (camera.position.length() > 220) camera.position.setLength(220)
      lastInteract = performance.now()
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const tick = (now) => {
      const t = now * 0.001

      if (!dragging) {
        // 관성 감쇠 + 유휴 시 느린 드리프트
        yaw -= vyaw
        pitch -= vpitch
        vyaw *= 0.95
        vpitch *= 0.95
        if (now - lastInteract > 3000) yaw += 0.00045
      }
      pitch = Math.max(-1.45, Math.min(1.45, pitch))
      camera.rotation.set(pitch, yaw, 0, 'YXZ')

      // 가까운 별이 미세하게 깜빡임
      nearMat.opacity = 0.85 + Math.sin(t * 1.7) * 0.1

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      scene.traverse(o => { if (o.geometry) o.geometry.dispose() })
      disposables.forEach(d => d.dispose())
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">드래그로 우주를 둘러보세요 · 휠로 더 깊이 들어갈 수 있습니다</span>
    </div>
  )
}
