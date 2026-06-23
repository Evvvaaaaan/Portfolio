import { useEffect, useRef } from 'react'
import '../shared/exp.css'

// Minimal Perlin-style value noise
function makeNoise() {
  const perm = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]]
  }
  const p = [...perm, ...perm]
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (t, a, b) => a + t * (b - a)
  const grad = (h, x, y) => { const u = h<2?x:y, v = h<2?y:x; return ((h&1)?-u:u)+((h&2)?-v:v) }

  return (x, y) => {
    const X = Math.floor(x)&255, Y = Math.floor(y)&255
    const xf = x-Math.floor(x), yf = y-Math.floor(y)
    const u = fade(xf), v = fade(yf)
    const a = p[X]+Y, b = p[X+1]+Y
    return lerp(v, lerp(u, grad(p[a]&3,xf,yf), grad(p[b]&3,xf-1,yf)),
                   lerp(u, grad(p[a+1]&3,xf,yf-1), grad(p[b+1]&3,xf-1,yf-1)))
  }
}

export default function GenerativeArt() {
  const canvasRef = useRef()
  const generateRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current

    const generate = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#0a0a0f'
      ctx.fillRect(0, 0, W, H)

      const noise = makeNoise()
      const scale = 0.003
      const baseHue = Math.random() * 360
      const numLines = Math.floor(W * H / 1200)

      for (let i = 0; i < numLines; i++) {
        let x = Math.random() * W
        let y = Math.random() * H
        const hue = baseHue + (i / numLines) * 100

        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.strokeStyle = `hsla(${hue},70%,60%,0.3)`
        ctx.lineWidth = 1

        for (let step = 0; step < 250; step++) {
          const angle = noise(x * scale, y * scale) * Math.PI * 4
          x += Math.cos(angle) * 2
          y += Math.sin(angle) * 2
          if (x < 0 || x > W || y < 0 || y > H) break
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }

    generateRef.current = generate
    const ro = new ResizeObserver(generate)
    ro.observe(canvas)
    generate()

    return () => ro.disconnect()
  }, [])

  return (
    <div className="exp-wrap">
      <canvas ref={canvasRef} />
      <div className="exp-controls">
        <button className="exp-btn active" onClick={() => generateRef.current?.()}>다시 생성</button>
      </div>
    </div>
  )
}
