import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'

const MODES = [
  { id: 'calm', label: 'Calm', rate: 0.018 },
  { id: 'shower', label: 'Shower', rate: 0.06 },
  { id: 'storm', label: 'Storm', rate: 0.16 },
]

export default function MeteorShower() {
  const canvasRef = useRef()
  const rateRef = useRef(MODES[1].rate)
  const [mode, setMode] = useState('shower')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let meteors = []
    let sparks = []
    let stars = []
    let raf
    let W = 0, H = 0

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      stars = Array.from({ length: Math.floor((W * H) / 9000) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1 + 0.3,
        a: Math.random() * 0.5 + 0.15,
      }))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const spawnMeteor = (x, y) => {
      meteors.push({
        x: x ?? Math.random() * W * 0.9 - W * 0.15,
        y: y ?? -30,
        vx: 2.5 + Math.random() * 3.5,
        vy: 1.5 + Math.random() * 2,
        size: 1.6 + Math.random() * 2.6,
        hue: 16 + Math.random() * 22,
      })
    }

    const burst = (x, y, size, hue) => {
      const n = Math.floor(8 + size * 5)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const s = Math.random() * 3.5 + 0.5
        sparks.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.5,
          life: 1,
          r: Math.random() * 1.8 + 0.5,
          hue: hue + Math.random() * 25,
        })
      }
    }

    const onClick = (e) => {
      const r = canvas.getBoundingClientRect()
      spawnMeteor(e.clientX - r.left - 110, e.clientY - r.top - 70)
    }
    canvas.addEventListener('click', onClick)

    const G = 0.045

    const tick = () => {
      ctx.fillStyle = 'rgba(5,4,9,0.26)'
      ctx.fillRect(0, 0, W, H)

      for (const s of stars) {
        ctx.fillStyle = `rgba(200,210,235,${s.a})`
        ctx.fillRect(s.x, s.y, s.r, s.r)
      }

      if (Math.random() < rateRef.current) spawnMeteor()

      ctx.globalCompositeOperation = 'lighter'

      meteors = meteors.filter(m => m.size > 0.45 && m.y < H + 60 && m.x < W + 60)
      for (const m of meteors) {
        m.vy += G                      // 중력 가속
        m.x += m.vx
        m.y += m.vy
        const sp = Math.hypot(m.vx, m.vy)
        m.size -= 0.0035 * sp          // 대기 마찰로 질량 소실 (ablation)

        // 마찰열 불꽃 떨어뜨리기
        if (Math.random() < 0.5) {
          sparks.push({
            x: m.x, y: m.y,
            vx: m.vx * 0.25 + (Math.random() - 0.5) * 1.2,
            vy: m.vy * 0.25 + (Math.random() - 0.5) * 1.2,
            life: 0.8,
            r: Math.random() * 1.4 + 0.4,
            hue: m.hue + 10,
          })
        }

        const k = 9 * m.size
        const tx = m.x - m.vx * k / sp * 2.2
        const ty = m.y - m.vy * k / sp * 2.2
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty)
        g.addColorStop(0, `hsla(${m.hue + 30},100%,88%,0.95)`)
        g.addColorStop(0.3, `hsla(${m.hue},95%,60%,0.6)`)
        g.addColorStop(1, `hsla(${m.hue - 8},90%,45%,0)`)
        ctx.strokeStyle = g
        ctx.lineWidth = m.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()

        // 다 타버리면 폭발
        if (m.size <= 0.45) burst(m.x, m.y, 3, m.hue)
      }

      sparks = sparks.filter(p => p.life > 0.03)
      for (const p of sparks) {
        p.x += p.vx
        p.y += p.vy
        p.vy += G * 0.6
        p.life *= 0.94
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue},95%,65%,${p.life})`
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <div className="exp-wrap">
      <span className="exp-hint">클릭하면 유성이 떨어집니다 · 중력과 대기 마찰의 물리</span>
      <canvas ref={canvasRef} />
      <div className="exp-controls">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`exp-btn${mode === m.id ? ' active' : ''}`}
            onClick={() => { setMode(m.id); rateRef.current = m.rate }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
