// src/experiments/CosmicMirror/CosmicMirror.jsx
import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './CosmicMirror.css'
import { selectAnchors, faceCenter, readExpression, isBurst } from './faceMap.js'

// 웹캠 표정으로 별 초상을 그리는 실험 — MediaPipe FaceLandmarker + 마우스 폴백

const N = 3000
export const BURST_MS = 550
const BASE_STAR = [200, 210, 255] // 차가운 별빛
const WARM_STAR = [255, 214, 170] // 미소 시 따뜻한 색

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export default function CosmicMirror() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const overlayRef = useRef(null)

  const anchorsRef = useRef([]) // {x,y}[] 초상 목표점
  const centerRef = useRef({ x: 0, y: 0 }) // 버스트 원점
  const burstRef = useRef({ t0: 0 }) // 초신성 버스트
  const sceneRef = useRef({ warmth: 0, dim: 0 })

  const [mode, setMode] = useState('idle') // idle | camera | mouse
  const [camError, setCamError] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  // 파티클 엔진 — 모든 모드에서 배경으로 동작
  useEffect(() => {
    const wrap = wrapRef.current
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio, 2)
    let W = 0
    let H = 0
    const resize = () => {
      W = wrap.clientWidth
      H = wrap.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const parts = new Float32Array(N * 5) // x, y, vx, vy, blend
    for (let i = 0; i < N; i++) {
      parts[i * 5] = Math.random() * wrap.clientWidth
      parts[i * 5 + 1] = Math.random() * wrap.clientHeight
    }

    let raf = 0
    let running = true
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      ctx.fillStyle = 'rgba(4, 6, 14, 0.30)'
      ctx.fillRect(0, 0, W, H)

      const now = performance.now()
      const anchors = anchorsRef.current
      const center = centerRef.current
      const burst = burstRef.current
      const scene = sceneRef.current
      const bursting = burst.t0 > 0 && now - burst.t0 < BURST_MS
      const burstK = bursting ? 1 - (now - burst.t0) / BURST_MS : 0

      const warm = scene.warmth
      const cr = BASE_STAR[0] + (WARM_STAR[0] - BASE_STAR[0]) * warm
      const cg = BASE_STAR[1] + (WARM_STAR[1] - BASE_STAR[1]) * warm
      const cb = BASE_STAR[2] + (WARM_STAR[2] - BASE_STAR[2]) * warm
      const dimK = 1 - scene.dim * 0.6

      for (let i = 0; i < N; i++) {
        let x = parts[i * 5]
        let y = parts[i * 5 + 1]
        let vx = parts[i * 5 + 2]
        let vy = parts[i * 5 + 3]
        let blend = parts[i * 5 + 4] * 0.97

        // 은은한 유영
        vx += Math.sin(y * 0.01 + now * 0.0003) * 0.02
        vy += Math.cos(x * 0.011 + now * 0.00027) * 0.02

        // 가장 가까운 앵커로 인력 (초상 형성)
        if (anchors.length && !bursting) {
          let bx = 0
          let by = 0
          let best = 1e9
          for (const a of anchors) {
            const d2 = (a.x - x) ** 2 + (a.y - y) ** 2
            if (d2 < best) {
              best = d2
              bx = a.x
              by = a.y
            }
          }
          const dx = bx - x
          const dy = by - y
          const d = Math.hypot(dx, dy) + 1e-4
          const F = 260 / (d + 50)
          vx += (dx / d) * F
          vy += (dy / d) * F
          if (d < 90) blend = Math.min(1, blend + 0.08)
        }

        // 초신성 버스트 — 중심에서 바깥으로 밀어냄
        if (bursting) {
          const dx = x - center.x
          const dy = y - center.y
          const d = Math.hypot(dx, dy) + 1e-4
          const F = 14 * burstK
          vx += (dx / d) * F
          vy += (dy / d) * F
          blend = Math.min(1, blend + 0.05 * burstK)
        }

        vx *= 0.93
        vy *= 0.93
        x += vx
        y += vy
        if (x < 0) x += W
        if (x > W) x -= W
        if (y < 0) y += H
        if (y > H) y -= H

        parts[i * 5] = x
        parts[i * 5 + 1] = y
        parts[i * 5 + 2] = vx
        parts[i * 5 + 3] = vy
        parts[i * 5 + 4] = blend

        const k = blend
        const r = BASE_STAR[0] + (cr - BASE_STAR[0]) * k
        const g = BASE_STAR[1] + (cg - BASE_STAR[1]) * k
        const b = BASE_STAR[2] + (cb - BASE_STAR[2]) * k
        const alpha = (0.28 + blend * 0.5) * dimK
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`
        const s = 1.4 + blend * 0.8
        ctx.fillRect(x, y, s, s)
      }

      // 버스트 순간 중심 발광
      if (bursting) {
        const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 70 * burstK + 20)
        grad.addColorStop(0, `rgba(255, 240, 210, ${0.5 * burstK})`)
        grad.addColorStop(1, 'rgba(255, 240, 210, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(center.x, center.y, 70 * burstK + 20, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    loop()

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // 마우스 폴백 — 커서가 앵커, 클릭이 버스트
  useEffect(() => {
    if (mode !== 'mouse') return undefined
    const wrap = wrapRef.current
    const pos = (e) => {
      const r = wrap.getBoundingClientRect()
      const p = { x: e.clientX - r.left, y: e.clientY - r.top }
      anchorsRef.current = [p]
      centerRef.current = p
    }
    const onMove = (e) => pos(e)
    const onDown = (e) => {
      pos(e)
      burstRef.current = { t0: performance.now() }
    }
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerdown', onDown)
    return () => {
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerdown', onDown)
      anchorsRef.current = []
      sceneRef.current = { warmth: 0, dim: 0 }
    }
  }, [mode])

  // 카메라 + MediaPipe FaceLandmarker
  useEffect(() => {
    if (mode !== 'camera') return undefined
    let cancelled = false
    let landmarker = null
    let stream = null
    let raf = 0
    let bursting = false // jawOpen 디바운스
    const wrap = wrapRef.current
    const video = videoRef.current

    ;(async () => {
      try {
        const [{ FilesetResolver, FaceLandmarker }, media] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }),
        ])
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        video.srcObject = stream
        await video.play()
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        })
        if (cancelled) {
          landmarker.close()
          return
        }

        const octx = overlayRef.current?.getContext('2d')
        let lastT = -1
        const detect = () => {
          raf = requestAnimationFrame(detect)
          if (video.currentTime === lastT) return
          lastT = video.currentTime
          const res = landmarker.detectForVideo(video, performance.now())
          const W = wrap.clientWidth
          const H = wrap.clientHeight
          const lm = res.faceLandmarks?.[0]

          if (octx) {
            octx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
          }

          if (!lm) {
            anchorsRef.current = []
            sceneRef.current = { warmth: 0, dim: 0 }
            return
          }

          anchorsRef.current = selectAnchors(lm, W, H)
          centerRef.current = faceCenter(lm, W, H)

          const bs = res.faceBlendshapes?.[0]?.categories ?? []
          const expr = readExpression(bs)
          sceneRef.current = { warmth: Math.min(1, expr.smile * 1.4), dim: expr.blink }

          // 입을 벌리는 "순간"에만 버스트 (한 번 트리거 후 다물어야 재발동)
          if (isBurst(expr.jawOpen)) {
            if (!bursting) {
              bursting = true
              burstRef.current = { t0: performance.now() }
            }
          } else if (expr.jawOpen < 0.25) {
            bursting = false
          }

          if (octx) {
            const ow = overlayRef.current.width
            const oh = overlayRef.current.height
            octx.fillStyle = 'rgba(196, 181, 253, 0.9)'
            for (const pt of lm) {
              octx.beginPath()
              octx.arc((1 - pt.x) * ow, pt.y * oh, 1, 0, Math.PI * 2)
              octx.fill()
            }
          }
        }
        detect()
      } catch (err) {
        if (!cancelled) {
          setCamError(
            err.name === 'NotAllowedError'
              ? '카메라 권한이 거부되어 마우스 모드로 전환했습니다.'
              : '카메라를 사용할 수 없어 마우스 모드로 전환했습니다.',
          )
          setMode('mouse')
        }
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      anchorsRef.current = []
      sceneRef.current = { warmth: 0, dim: 0 }
    }
  }, [mode])

  return (
    <div className="cosmic-mirror" ref={wrapRef}>
      <canvas ref={canvasRef} className="cm-canvas" />

      {mode === 'idle' && (
        <div className="cm-overlay">
          <h2>Cosmic Mirror</h2>
          <p>
            표정으로 별 초상을 그리려면 카메라 권한이 필요합니다.
            <br />
            영상은 브라우저 밖으로 전송되지 않습니다.
          </p>
          <div className="cm-actions">
            <button type="button" className="cm-primary" onClick={() => setMode('camera')}>
              카메라 시작
            </button>
            <button type="button" onClick={() => setMode('mouse')}>
              마우스로 체험
            </button>
          </div>
          <p className="cm-hint">😮 입 벌리기 — 초신성 · 🙂 미소 — 따뜻한 성운 · 😌 깜빡임 — 별의 반짝임</p>
        </div>
      )}

      {mode === 'camera' && (
        <div className={`cm-preview${showPreview ? '' : ' hidden'}`}>
          <video ref={videoRef} muted playsInline />
          <canvas ref={overlayRef} width="160" height="120" />
          <button type="button" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? '카메라 숨기기' : '카메라 보기'}
          </button>
        </div>
      )}

      {mode === 'mouse' && (
        <div className="cm-badge">
          마우스 모드{camError ? ` — ${camError}` : ''} · 이동 — 별 모으기 · 클릭 — 초신성
        </div>
      )}
    </div>
  )
}
