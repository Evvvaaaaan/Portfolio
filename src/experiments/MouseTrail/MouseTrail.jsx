import { useEffect, useRef } from 'react'
import '../shared/exp.css'

export default function MouseTrail() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let particles = []
    let raf

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const spawn = (x, y) => {
      for (let i = 0; i < 5; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3 - 1,
          life: 1,
          r: Math.random() * 12 + 4,
          hue: 200 + Math.random() * 80,
        })
      }
    }

    const getPos = (e, rect) => [e.clientX - rect.left, e.clientY - rect.top]

    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); spawn(...getPos(e, r)) })
    canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      spawn(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top)
    }, { passive: false })

    const tick = () => {
      ctx.fillStyle = 'rgba(10,10,15,0.15)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      particles = particles.filter(p => p.life > 0.02)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06
        p.life *= 0.93; p.r *= 0.97
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(0, p.r * p.life), 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue},80%,65%,${p.life})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div className="exp-wrap">
      <span className="exp-hint">마우스를 움직여보세요</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
