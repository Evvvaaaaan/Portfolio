import { useEffect, useRef } from 'react'
import '../shared/exp.css'

export default function ShootingStars() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let stars = []
    let meteors = []
    let raf
    let W = 0, H = 0
    let nextSpawn = 0
    const mouse = { x: 0.5, y: 0.5 }

    const makeStars = () => {
      stars = []
      const count = Math.floor((W * H) / 3600)
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          z: Math.random(),
          r: Math.random() * 1.3 + 0.3,
          tw: Math.random() * Math.PI * 2,
          ts: 0.015 + Math.random() * 0.04,
        })
      }
    }

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      makeStars()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const spawnMeteor = (x, y) => {
      const angle = (32 + Math.random() * 22) * (Math.PI / 180)
      const speed = 9 + Math.random() * 7
      meteors.push({
        x: x ?? Math.random() * W * 1.2 - W * 0.1,
        y: y ?? -20,
        vx: Math.cos(angle) * speed * (Math.random() < 0.18 ? -1 : 1),
        vy: Math.sin(angle) * speed,
        len: 90 + Math.random() * 130,
        life: 1,
        decay: 0.008 + Math.random() * 0.008,
      })
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) / r.width
      mouse.y = (e.clientY - r.top) / r.height
    }
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect()
      spawnMeteor(e.clientX - r.left, e.clientY - r.top)
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)

    const tick = (now) => {
      ctx.fillStyle = '#040409'
      ctx.fillRect(0, 0, W, H)

      // twinkling starfield with mouse parallax (depth z)
      const px = (mouse.x - 0.5) * 36
      const py = (mouse.y - 0.5) * 24
      for (const s of stars) {
        s.tw += s.ts
        const a = 0.25 + (Math.sin(s.tw) * 0.5 + 0.5) * 0.65
        const x = s.x - px * s.z
        const y = s.y - py * s.z
        ctx.beginPath()
        ctx.arc(x, y, s.r * (0.6 + s.z * 0.6), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226,232,240,${a * (0.4 + s.z * 0.6)})`
        ctx.fill()
        if (s.z > 0.85 && a > 0.7) {
          ctx.fillStyle = `rgba(180,210,255,${(a - 0.7) * 0.5})`
          ctx.fillRect(x - s.r * 4, y - 0.4, s.r * 8, 0.8)
          ctx.fillRect(x - 0.4, y - s.r * 4, 0.8, s.r * 8)
        }
      }

      if (now > nextSpawn) {
        spawnMeteor()
        nextSpawn = now + 700 + Math.random() * 2600
      }

      ctx.globalCompositeOperation = 'lighter'
      meteors = meteors.filter(m => m.life > 0 && m.x < W + 200 && m.y < H + 200)
      for (const m of meteors) {
        m.x += m.vx
        m.y += m.vy
        m.life -= m.decay
        const sp = Math.hypot(m.vx, m.vy)
        const tx = m.x - (m.vx / sp) * m.len
        const ty = m.y - (m.vy / sp) * m.len
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty)
        g.addColorStop(0, `rgba(255,255,255,${m.life})`)
        g.addColorStop(0.25, `rgba(165,200,255,${m.life * 0.55})`)
        g.addColorStop(1, 'rgba(120,160,255,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${m.life})`
        ctx.fill()
      }
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
      <span className="exp-hint">클릭하면 별똥별이 떨어집니다 · 마우스로 시차를 느껴보세요</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
