import { useEffect, useRef } from 'react'
import '../shared/exp.css'

export default function AuroraBorealis() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let W = 0, H = 0
    let stars = []
    let ridge = []
    let wind = 0
    const mouse = { x: 0.5, y: 0.4 }

    // value noise
    const perm = new Uint8Array(512)
    const base = Array.from({ length: 256 }, (_, i) => i)
    for (let i = 255; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[base[i], base[j]] = [base[j], base[i]]
    }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255]
    const hash = (x, y) => perm[(x + perm[y & 255]) & 255] / 255
    const fade = t => t * t * (3 - 2 * t)
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y)
      const xf = x - xi, yf = y - yi
      const a = hash(xi, yi), b = hash(xi + 1, yi)
      const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
      const u = fade(xf), v = fade(yf)
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    }

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      stars = Array.from({ length: Math.floor((W * H) / 5500) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.75,
        r: Math.random() * 1.2 + 0.3,
        tw: Math.random() * Math.PI * 2,
        ts: 0.01 + Math.random() * 0.03,
      }))
      ridge = []
      for (let x = 0; x <= W + 8; x += 8) {
        ridge.push(H * 0.86 + noise(x * 0.004, 7.7) * H * 0.12 - noise(x * 0.02, 3.3) * H * 0.04)
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) / r.width
      mouse.y = (e.clientY - r.top) / r.height
    }
    canvas.addEventListener('mousemove', onMove)

    const tick = (now) => {
      const t = now * 0.001

      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#01020a')
      sky.addColorStop(0.7, '#060d1d')
      sky.addColorStop(1, '#0a1426')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      for (const s of stars) {
        s.tw += s.ts
        ctx.fillStyle = `rgba(220,230,255,${0.2 + (Math.sin(s.tw) * 0.5 + 0.5) * 0.5})`
        ctx.fillRect(s.x, s.y, s.r, s.r)
      }

      // 태양풍: 마우스 x가 바람의 방향, y가 입자 에너지(세기)
      wind += ((mouse.x - 0.5) * 5 - wind) * 0.02
      const intensity = 0.55 + (1 - mouse.y) * 0.75

      ctx.globalCompositeOperation = 'lighter'
      for (let x = 0; x <= W; x += 5) {
        const n1 = noise(x * 0.0032 + wind + t * 0.05, t * 0.21)
        const n2 = noise(x * 0.010 - wind * 0.6, t * 0.13 + 50)
        const top = H * (0.08 + n1 * 0.24)
        const len = H * (0.20 + n2 * 0.40) * intensity
        const hue = 118 + n1 * 95 + n2 * 35
        const a = (0.07 + n2 * 0.20) * intensity
        const g = ctx.createLinearGradient(0, top, 0, top + len)
        g.addColorStop(0, `hsla(${hue + 65},85%,62%,0)`)
        g.addColorStop(0.6, `hsla(${hue},85%,56%,${a * 0.6})`)
        g.addColorStop(0.94, `hsla(${hue - 22},95%,62%,${a * 1.6})`)
        g.addColorStop(1, `hsla(${hue - 22},95%,70%,0)`)
        ctx.fillStyle = g
        ctx.fillRect(x, top, 5, len)
      }
      ctx.globalCompositeOperation = 'source-over'

      // 설산 능선 실루엣
      ctx.beginPath()
      ctx.moveTo(0, H)
      ridge.forEach((y, i) => ctx.lineTo(i * 8, y))
      ctx.lineTo(W, H)
      ctx.closePath()
      ctx.fillStyle = '#03050a'
      ctx.fill()

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <div className="exp-wrap">
      <span className="exp-hint">마우스 좌우로 태양풍의 방향을, 위아래로 세기를 바꿔보세요</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
