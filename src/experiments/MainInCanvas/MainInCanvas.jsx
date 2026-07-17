import { useEffect, useRef } from 'react'
import '../shared/exp.css'
import './MainInCanvas.css'

const WAVE_STRIPS = Array.from({ length: 7 }, (_, idx) => idx)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export default function MainInCanvas() {
  const wrapRef = useRef(null)
  const dragRef = useRef({ active: false, x: 0, y: 0, rx: -6, ry: -12 })
  const fanRef = useRef({
    active: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    startFanX: 0,
    startFanY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
  })
  const rafRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    wrap.style.setProperty('--pointer-x', '52%')
    wrap.style.setProperty('--pointer-y', '42%')
    wrap.style.setProperty('--sheen-shift', '0px')
    wrap.style.setProperty('--fan-x', '0px')
    wrap.style.setProperty('--fan-y', '0px')

    const tick = (now) => {
      const t = now / 1000
      const fan = fanRef.current
      const sweep = Math.sin(t * 0.78)

      fan.vx *= fan.active ? 0.985 : 0.92
      fan.vy *= fan.active ? 0.985 : 0.92

      const rect = wrap.getBoundingClientRect()
      const fanNx = clamp(fan.x / Math.max(1, rect.width * 0.32), -1, 1)
      const fanNy = clamp(fan.y / Math.max(1, rect.height * 0.28), -1, 1)
      const moveSpeed = Math.min(1, Math.hypot(fan.vx, fan.vy) / 920)
      const moveAngle = moveSpeed > 0.02 ? Math.atan2(fan.vy, fan.vx) * 180 / Math.PI : 0
      const movementBias = moveSpeed * 18
      const aimAngle = -24 + sweep * 14 - fanNy * 16 - fanNx * 10
      const fanAngle = clamp(aimAngle + moveAngle * 0.22 + movementBias, -58, 28)
      const directHit = clamp(1 - Math.abs(fanAngle + 18) / 52 + (0.2 - Math.abs(fanNx) * 0.08), 0, 1)
      const gust = Math.max(
        0.18,
        Math.min(
          1,
          0.36 + directHit * 0.32 + moveSpeed * 0.34 + Math.sin(t * 2.35) * 0.12 + Math.sin(t * 7.4) * 0.08
        )
      )

      const movePushX = clamp(fan.vx / 90, -18, 18) * moveSpeed
      const movePushY = clamp(fan.vy / 120, -14, 14) * moveSpeed
      const directionPhase = fanAngle * 0.035 + moveAngle * 0.018
      const flutterA = (Math.sin(t * 5.2 + sweep * 1.2 + directionPhase) * 14 + movePushX * 0.8) * gust
      const flutterB = (Math.sin(t * 7.1 + 1.6 - directionPhase) * 9 + movePushY * 0.65) * gust
      const flutterC = (Math.sin(t * 3.4 - sweep * 0.8) * 1.2 + fanNx * 1.4 + moveSpeed * Math.sign(fan.vx || sweep) * 1.1) * gust
      const pushX = (-8 - directHit * 11 - fanNx * 6 + movePushX * 0.7 + Math.sin(t * 4.1) * 2.5) * gust
      const pushY = (Math.sin(t * 3.1 + 0.7) * 3.5 - directHit * 2 - fanNy * 4 + movePushY * 0.55) * gust

      wrap.style.setProperty('--fan-x', `${fan.x.toFixed(2)}px`)
      wrap.style.setProperty('--fan-y', `${fan.y.toFixed(2)}px`)
      wrap.style.setProperty('--fan-angle', `${fanAngle.toFixed(2)}deg`)
      wrap.style.setProperty('--gust', gust.toFixed(3))
      wrap.style.setProperty('--wave-opacity', (0.13 + gust * 0.16).toFixed(3))
      wrap.style.setProperty('--wave-opacity-strong', (0.18 + gust * 0.18).toFixed(3))
      wrap.style.setProperty('--stream-opacity', (0.22 + gust * 0.38).toFixed(3))
      wrap.style.setProperty('--flutter-a', `${flutterA.toFixed(2)}px`)
      wrap.style.setProperty('--flutter-b', `${flutterB.toFixed(2)}px`)
      wrap.style.setProperty('--flutter-a-soft', `${(flutterA * 0.42).toFixed(2)}px`)
      wrap.style.setProperty('--flutter-b-soft', `${(flutterB * 0.38).toFixed(2)}px`)
      wrap.style.setProperty('--flutter-a-neg', `${(-flutterA * 0.55).toFixed(2)}px`)
      wrap.style.setProperty('--flutter-b-neg', `${(-flutterB * 0.5).toFixed(2)}px`)
      wrap.style.setProperty('--frame-drift-x', `${(flutterA * 0.10).toFixed(2)}px`)
      wrap.style.setProperty('--frame-drift-y', `${(-flutterB * 0.08).toFixed(2)}px`)
      wrap.style.setProperty('--flutter-angle', `${flutterC.toFixed(2)}deg`)
      wrap.style.setProperty('--flutter-angle-neg', `${(-flutterC * 0.75).toFixed(2)}deg`)
      wrap.style.setProperty('--cloth-x', `${pushX.toFixed(2)}px`)
      wrap.style.setProperty('--cloth-y', `${pushY.toFixed(2)}px`)
      wrap.style.setProperty('--surface-rx', `${(dragRef.current.rx + flutterB * 0.035).toFixed(2)}deg`)
      wrap.style.setProperty('--surface-ry', `${(dragRef.current.ry + flutterA * 0.055).toFixed(2)}deg`)
      wrap.style.setProperty('--surface-rz', `${(-1.2 + flutterC * 0.45).toFixed(2)}deg`)

      const ltX = 3 + Math.sin(t * 4.2) * 0.45 * gust
      const rtY = 4 + Math.sin(t * 5.1 + 1.2) * 0.7 * gust
      const rightY = 84 + Math.sin(t * 6.2 + 0.3) * 2.3 * gust
      const foldOne = 93 + Math.sin(t * 5.7 + 2.1) * 3.2 * gust
      const valley = 89 + Math.sin(t * 6.9 + 0.8) * 2.5 * gust
      const foldTwo = 98 + Math.sin(t * 4.8 + 2.8) * 1.4 * gust
      const leftY = 88 + Math.sin(t * 5.4 + 1.7) * 2.4 * gust
      wrap.style.setProperty(
        '--cloth-clip',
        `polygon(${ltX.toFixed(2)}% 2%, 98% ${rtY.toFixed(2)}%, 97% ${rightY.toFixed(2)}%, 84% ${foldOne.toFixed(2)}%, 50% ${valley.toFixed(2)}%, 20% ${foldTwo.toFixed(2)}%, 2% ${leftY.toFixed(2)}%)`
      )

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const setRotation = (rx, ry) => {
    dragRef.current.rx = rx
    dragRef.current.ry = ry
  }

  const onPointerMove = (e) => {
    const wrap = wrapRef.current
    if (!wrap) return

    const rect = wrap.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    wrap.style.setProperty('--pointer-x', `${px}%`)
    wrap.style.setProperty('--pointer-y', `${py}%`)
    wrap.style.setProperty('--sheen-shift', `${((px - 50) * 1.2).toFixed(2)}px`)

    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setRotation(
      Math.max(-18, Math.min(12, dragRef.current.startRx - dy * 0.04)),
      Math.max(-34, Math.min(22, dragRef.current.startRy + dx * 0.05))
    )
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      rx: dragRef.current.rx,
      ry: dragRef.current.ry,
      startRx: dragRef.current.rx,
      startRy: dragRef.current.ry,
    }
  }

  const onPointerUp = () => {
    dragRef.current.active = false
  }

  const onFanPointerDown = (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const fan = fanRef.current
    fan.active = true
    fan.startX = e.clientX
    fan.startY = e.clientY
    fan.startFanX = fan.x
    fan.startFanY = fan.y
    fan.lastX = e.clientX
    fan.lastY = e.clientY
    fan.lastT = performance.now()
    fan.vx = 0
    fan.vy = 0
  }

  const onFanPointerMove = (e) => {
    const fan = fanRef.current
    if (!fan.active) return
    e.stopPropagation()

    const wrap = wrapRef.current
    const rect = wrap?.getBoundingClientRect()
    const maxX = rect ? rect.width * 0.34 : 360
    const maxY = rect ? rect.height * 0.24 : 220
    const nextX = clamp(fan.startFanX + e.clientX - fan.startX, -maxX, 96)
    const nextY = clamp(fan.startFanY + e.clientY - fan.startY, -maxY, maxY)
    const now = performance.now()
    const dt = Math.max(16, now - fan.lastT) / 1000

    fan.vx = (e.clientX - fan.lastX) / dt
    fan.vy = (e.clientY - fan.lastY) / dt
    fan.x = nextX
    fan.y = nextY
    fan.lastX = e.clientX
    fan.lastY = e.clientY
    fan.lastT = now
  }

  const onFanPointerUp = (e) => {
    e.stopPropagation()
    fanRef.current.active = false
  }

  return (
    <div
      ref={wrapRef}
      className="main-canvas-exp"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <aside className="main-canvas-notes" aria-hidden="true">
        <span className="notes-kicker">Projection rig</span>
        <p>Live route mounted on a soft projection surface.</p>
        <p>Airflow vector coupled to the lower fan sweep.</p>
        <span className="notes-pill">wind linked</span>
      </aside>

      <div className="main-canvas-stage">
        <div className="suspension-line suspension-line--top" />
        <div className="surface-clip surface-clip--left" />
        <div className="surface-clip surface-clip--right" />

        <div className="canvas-surface" aria-label="Main page preview in a 3D canvas surface">
          <div className="surface-inner">
            <iframe
              className="surface-frame"
              src="/"
              title="Evan portfolio main page"
              loading="eager"
            />
            <div className="surface-waves" aria-hidden="true">
              {WAVE_STRIPS.map((strip) => (
                <span key={strip} />
              ))}
            </div>
            <div className="surface-raster" />
            <div className="surface-sheen" />
          </div>
        </div>

        <div className="surface-reflection">
          <span />
        </div>

        <div className="wind-streams" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div
          className="studio-fan"
          aria-label="Move fan"
          role="button"
          tabIndex={0}
          onPointerDown={onFanPointerDown}
          onPointerMove={onFanPointerMove}
          onPointerUp={onFanPointerUp}
          onPointerCancel={onFanPointerUp}
        >
          <span className="fan-head">
            <span className="fan-blades" />
          </span>
          <span className="fan-yoke" />
          <span className="fan-stem" />
          <span className="fan-base" />
        </div>
      </div>

      <div className="main-canvas-caption" aria-hidden="true">
        <span>HTML surface</span>
        <strong>Portfolio main page</strong>
      </div>
    </div>
  )
}
