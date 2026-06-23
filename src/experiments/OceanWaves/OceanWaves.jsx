import { useEffect, useRef } from 'react'
import '../shared/exp.css'

export default function OceanWaves() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let W = 0, H = 0
    let ripples = []
    let spray = []
    let lastRipple = 0

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const horizonY = () => H * 0.52

    const addRipple = (x, amp) => {
      ripples.push({ x, born: performance.now() * 0.001, amp })
      if (ripples.length > 24) ripples.shift()
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      const y = e.clientY - r.top
      const now = performance.now()
      if (y > horizonY() && now - lastRipple > 90) {
        lastRipple = now
        addRipple(e.clientX - r.left, 5)
      }
    }
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (y <= horizonY()) return
      addRipple(x, 22)
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
        const s = Math.random() * 5 + 2
        spray.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 1,
          r: Math.random() * 2 + 0.6,
        })
      }
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)

    // 물결 간섭: 퍼져나가며 감쇠하는 가우시안 파동
    const rippleAt = (x, time, depth) => {
      let sum = 0
      for (const rp of ripples) {
        const age = time - rp.born
        if (age > 4) continue
        const sigma = 50 + age * 130
        const d = x - rp.x
        sum += rp.amp *
          Math.sin(age * 7 - Math.abs(d) * 0.03) *
          Math.exp(-(d * d) / (2 * sigma * sigma)) *
          Math.exp(-age * 1.4) * depth
      }
      return sum
    }

    const LAYERS = [
      { amp: 6,  speed: 0.5, freq: 0.008, color: '#16314f', depth: 0.35 },
      { amp: 9,  speed: 0.8, freq: 0.011, color: '#102540', depth: 0.6 },
      { amp: 13, speed: 1.1, freq: 0.014, color: '#0a1a30', depth: 0.85 },
      { amp: 17, speed: 1.5, freq: 0.018, color: '#050f1f', depth: 1.1 },
    ]

    const tick = (now) => {
      const t = now * 0.001
      const hy = horizonY()

      // 황혼의 하늘
      const sky = ctx.createLinearGradient(0, 0, 0, hy)
      sky.addColorStop(0, '#0b1026')
      sky.addColorStop(0.62, '#2a3158')
      sky.addColorStop(0.92, '#9c5a3c')
      sky.addColorStop(1, '#d98a4f')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, hy + 1)

      // 지는 해
      const sunX = W * 0.62
      const sun = ctx.createRadialGradient(sunX, hy - 8, 2, sunX, hy - 8, 64)
      sun.addColorStop(0, 'rgba(255,226,170,0.95)')
      sun.addColorStop(0.3, 'rgba(255,180,100,0.55)')
      sun.addColorStop(1, 'rgba(255,150,70,0)')
      ctx.fillStyle = sun
      ctx.fillRect(sunX - 64, hy - 72, 128, 72)

      // 바다 기본면
      const sea = ctx.createLinearGradient(0, hy, 0, H)
      sea.addColorStop(0, '#3d3050')
      sea.addColorStop(0.25, '#1c3050')
      sea.addColorStop(1, '#040b18')
      ctx.fillStyle = sea
      ctx.fillRect(0, hy, W, H - hy)

      // 햇빛 반사 기둥 (잔물결 따라 일렁임)
      ctx.globalCompositeOperation = 'lighter'
      for (let y = hy + 4; y < H; y += 5) {
        const k = (y - hy) / (H - hy)
        const flicker = Math.sin(t * 3 + y * 0.22) * 0.5 + 0.5
        const w = 12 + k * 60
        const jitter = Math.sin(y * 0.6 + t * 2) * k * 18
        ctx.fillStyle = `rgba(255,190,110,${(1 - k) * 0.10 * (0.4 + flicker * 0.6)})`
        ctx.fillRect(sunX - w / 2 + jitter, y, w, 2.4)
      }
      ctx.globalCompositeOperation = 'source-over'

      // 파도 레이어: 사인파 중첩 + 물결 간섭
      LAYERS.forEach((L, li) => {
        const baseY = hy + 14 + li * ((H - hy) / 4.6)
        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let x = 0; x <= W; x += 4) {
          const y = baseY +
            Math.sin(x * L.freq + t * L.speed) * L.amp +
            Math.sin(x * L.freq * 2.3 - t * L.speed * 1.4 + li * 2) * L.amp * 0.45 +
            Math.sin(x * L.freq * 0.43 + t * L.speed * 0.7 + li) * L.amp * 0.7 +
            rippleAt(x, t, L.depth)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(W, H)
        ctx.closePath()
        ctx.fillStyle = L.color
        ctx.fill()
        // 물마루 거품선
        ctx.strokeStyle = `rgba(190,220,255,${0.05 + li * 0.02})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      })

      // 물보라
      spray = spray.filter(p => p.life > 0.05)
      for (const p of spray) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.22
        p.life *= 0.95
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220,235,255,${p.life * 0.8})`
        ctx.fill()
      }

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
      <span className="exp-hint">물 위를 스치면 물결이 일어납니다 · 클릭하면 물보라가 튑니다</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
