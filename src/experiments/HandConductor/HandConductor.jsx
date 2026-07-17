import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './HandConductor.css'

// 웹캠 손 제스처로 파티클을 지휘 — MediaPipe HandLandmarker + 마우스 폴백

const N = 3000
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const HAND_COLORS = { Left: [251, 146, 60], Right: [56, 189, 248] } // 미러 화면 기준

export default function HandConductor() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  // forces: [{x, y, mode: 'attract'|'pulse'|'pass', color, t0}]
  const forcesRef = useRef([])
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

    const parts = new Float32Array(N * 5) // x, y, vx, vy, hue-blend
    for (let i = 0; i < N; i++) {
      parts[i * 5] = Math.random() * wrap.clientWidth
      parts[i * 5 + 1] = Math.random() * wrap.clientHeight
    }

    let raf = 0
    let running = true
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      ctx.fillStyle = 'rgba(5, 7, 12, 0.28)'
      ctx.fillRect(0, 0, W, H)

      const now = performance.now()
      const forces = forcesRef.current

      for (let i = 0; i < N; i++) {
        let x = parts[i * 5]
        let y = parts[i * 5 + 1]
        let vx = parts[i * 5 + 2]
        let vy = parts[i * 5 + 3]
        let blend = parts[i * 5 + 4] * 0.985

        // 은은한 유영
        vx += Math.sin(y * 0.01 + now * 0.0003) * 0.02
        vy += Math.cos(x * 0.011 + now * 0.00027) * 0.02

        for (const f of forces) {
          const dx = f.x - x
          const dy = f.y - y
          const d = Math.hypot(dx, dy) + 1e-4
          if (f.mode === 'attract') {
            const F = 220 / (d + 40)
            vx += (dx / d) * F
            vy += (dy / d) * F
            if (d < 260) blend = Math.min(1, blend + 0.06)
          } else if (f.mode === 'pulse' && now - f.t0 < 400) {
            const F = 900 / (d + 30)
            vx -= (dx / d) * F * (1 - (now - f.t0) / 400)
            vy -= (dy / d) * F * (1 - (now - f.t0) / 400)
            if (d < 320) blend = Math.min(1, blend + 0.04)
          } else if (f.mode === 'pass' && d < 120) {
            vx -= (dx / d) * (120 - d) * 0.012
            vy -= (dy / d) * (120 - d) * 0.012
          }
        }

        vx *= 0.94
        vy *= 0.94
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

        let nearC = null
        if (blend > 0.02) {
          let best = 1e9
          for (const f of forces) {
            const d2 = (f.x - x) ** 2 + (f.y - y) ** 2
            if (d2 < best) {
              best = d2
              nearC = f.color
            }
          }
        }
        const c = nearC || [148, 163, 184]
        const k = blend
        const r = 148 + (c[0] - 148) * k
        const g = 163 + (c[1] - 163) * k
        const b = 184 + (c[2] - 184) * k
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.35 + blend * 0.45})`
        ctx.fillRect(x, y, 1.6, 1.6)
      }

      // 힘 지점 발광 커서
      for (const f of forces) {
        if (f.mode === 'pulse' && now - f.t0 > 400) continue
        const [r, g, b] = f.color
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26)
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.5)`)
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(f.x, f.y, 26, 0, Math.PI * 2)
        ctx.fill()
      }
      // 만료된 pulse 제거
      forcesRef.current = forces.filter((f) => f.mode !== 'pulse' || now - f.t0 < 400)
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

  // 마우스 폴백 입력
  useEffect(() => {
    if (mode !== 'mouse') return undefined
    const wrap = wrapRef.current
    const cur = { x: 0, y: 0, down: false }
    const pos = (e) => {
      const r = wrap.getBoundingClientRect()
      cur.x = e.clientX - r.left
      cur.y = e.clientY - r.top
    }
    const sync = () => {
      const keep = forcesRef.current.filter((f) => f.mode === 'pulse')
      keep.push({ x: cur.x, y: cur.y, mode: cur.down ? 'attract' : 'pass', color: HAND_COLORS.Left, t0: 0 })
      forcesRef.current = keep
    }
    const onMove = (e) => {
      pos(e)
      sync()
    }
    const onDown = (e) => {
      cur.down = true
      pos(e)
      sync()
    }
    const onUp = () => {
      cur.down = false
      forcesRef.current = [
        ...forcesRef.current.filter((f) => f.mode === 'pulse'),
        { x: cur.x, y: cur.y, mode: 'pulse', color: HAND_COLORS.Left, t0: performance.now() },
      ]
    }
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointerup', onUp)
    return () => {
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointerup', onUp)
      forcesRef.current = []
    }
  }, [mode])

  // 카메라 + MediaPipe
  useEffect(() => {
    if (mode !== 'camera') return undefined
    let cancelled = false
    let landmarker = null
    let stream = null
    let raf = 0
    const wrap = wrapRef.current
    const video = videoRef.current
    const spread = { Left: false, Right: false }

    ;(async () => {
      try {
        const [{ FilesetResolver, HandLandmarker }, media] = await Promise.all([
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
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        if (cancelled) return

        const octx = overlayRef.current?.getContext('2d')
        let lastT = -1
        const detect = () => {
          raf = requestAnimationFrame(detect)
          if (video.currentTime === lastT) return
          lastT = video.currentTime
          const res = landmarker.detectForVideo(video, performance.now())
          const W = wrap.clientWidth
          const H = wrap.clientHeight
          const keep = forcesRef.current.filter((f) => f.mode === 'pulse')

          if (octx) {
            octx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
          }

          res.landmarks?.forEach((lm, hi) => {
            const handed = res.handednesses?.[hi]?.[0]?.categoryName ?? 'Left'
            const color = HAND_COLORS[handed] ?? HAND_COLORS.Left
            const sx = (nx) => (1 - nx) * W // 미러
            const sy = (ny) => ny * H
            const pinchD = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
            const tips = [4, 8, 12, 16, 20]
            const spreadD = tips.reduce((s, t) => s + Math.hypot(lm[t].x - lm[0].x, lm[t].y - lm[0].y), 0) / 5
            const cx = sx((lm[0].x + lm[9].x) / 2)
            const cy = sy((lm[0].y + lm[9].y) / 2)

            if (pinchD < 0.06) {
              keep.push({ x: sx((lm[4].x + lm[8].x) / 2), y: sy((lm[4].y + lm[8].y) / 2), mode: 'attract', color, t0: 0 })
            } else if (spreadD > 0.28) {
              if (!spread[handed]) {
                spread[handed] = true
                keep.push({ x: cx, y: cy, mode: 'pulse', color, t0: performance.now() })
              }
              keep.push({ x: cx, y: cy, mode: 'pass', color, t0: 0 })
            } else {
              if (spreadD < 0.24) spread[handed] = false
              keep.push({ x: cx, y: cy, mode: 'pass', color, t0: 0 })
            }

            if (octx) {
              const ow = overlayRef.current.width
              const oh = overlayRef.current.height
              octx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`
              for (const pt of lm) {
                octx.beginPath()
                octx.arc((1 - pt.x) * ow, pt.y * oh, 2, 0, Math.PI * 2)
                octx.fill()
              }
            }
          })
          forcesRef.current = keep
        }
        detect()
      } catch (err) {
        if (!cancelled) {
          setCamError(err.name === 'NotAllowedError' ? '카메라 권한이 거부되어 마우스 모드로 전환했습니다.' : '카메라를 사용할 수 없어 마우스 모드로 전환했습니다.')
          setMode('mouse')
        }
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      forcesRef.current = []
    }
  }, [mode])

  return (
    <div className="hand-conductor" ref={wrapRef}>
      <canvas ref={canvasRef} className="hc-canvas" />

      {mode === 'idle' && (
        <div className="hc-overlay">
          <h2>Hand Conductor</h2>
          <p>
            손 제스처로 파티클을 지휘하려면 카메라 권한이 필요합니다.
            <br />
            영상은 브라우저 밖으로 전송되지 않습니다.
          </p>
          <div className="hc-actions">
            <button type="button" className="hc-primary" onClick={() => setMode('camera')}>
              카메라 시작
            </button>
            <button type="button" onClick={() => setMode('mouse')}>
              마우스로 체험
            </button>
          </div>
          <p className="hc-gesture-hint">🤏 핀치 — 끌어모으기 · 🖐 손바닥 펼치기 — 흩어버리기</p>
        </div>
      )}

      {mode === 'camera' && (
        <div className={`hc-preview${showPreview ? '' : ' hidden'}`}>
          <video ref={videoRef} muted playsInline />
          <canvas ref={overlayRef} width="160" height="120" />
          <button type="button" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? '카메라 숨기기' : '카메라 보기'}
          </button>
        </div>
      )}

      {mode === 'mouse' && (
        <div className="hc-badge">
          마우스 모드{camError ? ` — ${camError}` : ''} · 홀드 — 끌어모으기 · 릴리즈 — 흩어버리기
        </div>
      )}
    </div>
  )
}
