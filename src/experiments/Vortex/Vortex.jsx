import { useEffect, useRef } from 'react'
import '../shared/exp.css'

export default function Vortex() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let particles = []
    let raf
    let W = 0, H = 0
    let dir = 1
    const center = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }

    const spawn = (p = {}) => ({
      a: Math.random() * Math.PI * 2,
      r: (Math.min(W, H) * 0.5) * (0.55 + Math.random() * 0.6),
      sp: 0.6 + Math.random() * 0.9,
      size: Math.random() * 1.6 + 0.4,
      ...p,
    })

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      center.x = target.x = W / 2
      center.y = target.y = H / 2
      particles = Array.from({ length: 750 }, () => spawn())
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      target.x = e.clientX - r.left
      target.y = e.clientY - r.top
    }
    const onClick = () => { dir *= -1 }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)

    const tick = (now) => {
      const t = now * 0.02
      ctx.fillStyle = 'rgba(7,5,15,0.14)'
      ctx.fillRect(0, 0, W, H)

      center.x += (target.x - center.x) * 0.04
      center.y += (target.y - center.y) * 0.04

      ctx.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        // 각속도는 반지름에 반비례 — 소용돌이 안쪽일수록 빠르게 회전
        p.a += (90 / (p.r + 45)) * p.sp * 0.45 * dir
        p.r -= 0.30 * p.sp
        if (p.r < 5) {
          Object.assign(p, spawn({ r: Math.min(W, H) * 0.5 * (0.7 + Math.random() * 0.5) }))
          p.px = undefined
        }
        const x = center.x + Math.cos(p.a) * p.r * 1.12
        const y = center.y + Math.sin(p.a) * p.r * 0.88
        const hue = ((p.a * 57.3) * 0.5 + t + 220) % 360
        const fade = Math.min(1, p.r / 60)
        // 모션 스트릭: 직전 위치에서 현재 위치로 선을 그어 회전 흐름을 보이게
        if (p.px !== undefined) {
          ctx.strokeStyle = `hsla(${hue},85%,${58 + (1 - fade) * 22}%,${0.5 + (1 - fade) * 0.4})`
          ctx.lineWidth = p.size
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.px, p.py)
          ctx.lineTo(x, y)
          ctx.stroke()
        }
        p.px = x
        p.py = y
      }

      // 중심핵의 빛
      const core = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 70)
      core.addColorStop(0, 'rgba(200,180,255,0.20)')
      core.addColorStop(1, 'rgba(200,180,255,0)')
      ctx.fillStyle = core
      ctx.fillRect(center.x - 70, center.y - 70, 140, 140)
      ctx.globalCompositeOperation = 'source-over'

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <div className="exp-wrap">
      <span className="exp-hint">마우스로 소용돌이를 끌고 다니세요 · 클릭하면 회전이 반전됩니다</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
