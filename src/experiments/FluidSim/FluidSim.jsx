import { useEffect, useRef } from 'react'
import '../shared/exp.css'

const N = 128
const SIZE = N * N
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function sample(arr, x, y) {
  x = clamp(x, 0, N-1); y = clamp(y, 0, N-1)
  const x0 = Math.floor(x), x1 = Math.min(x0+1, N-1)
  const y0 = Math.floor(y), y1 = Math.min(y0+1, N-1)
  const tx = x-x0, ty = y-y0
  return arr[x0+y0*N]*(1-tx)*(1-ty) + arr[x1+y0*N]*tx*(1-ty) +
         arr[x0+y1*N]*(1-tx)*ty     + arr[x1+y1*N]*tx*ty
}

function advect(src, dst, vx, vy, dt) {
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = i + j*N
      dst[idx] = sample(src, i - vx[idx]*dt, j - vy[idx]*dt)
    }
  }
}

export default function FluidSim() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const offscreen = document.createElement('canvas')
    offscreen.width = N; offscreen.height = N
    const offCtx = offscreen.getContext('2d')
    const imgData = offCtx.createImageData(N, N)

    const vx = new Float32Array(SIZE), vy = new Float32Array(SIZE)
    const vx0 = new Float32Array(SIZE), vy0 = new Float32Array(SIZE)
    const r = new Float32Array(SIZE), g = new Float32Array(SIZE), b = new Float32Array(SIZE)
    const r0 = new Float32Array(SIZE), g0 = new Float32Array(SIZE), b0 = new Float32Array(SIZE)

    let raf, hue = 0
    const mouse = { x: -1, y: -1, px: -1, py: -1, down: false }

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const toGrid = (cx, cy) => ({
      x: (cx / canvas.offsetWidth) * N,
      y: (cy / canvas.offsetHeight) * N,
    })

    const onMove = (cx, cy) => {
      const g = toGrid(cx, cy)
      mouse.px = mouse.x; mouse.py = mouse.y
      mouse.x = g.x; mouse.y = g.y
    }

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect()
      onMove(e.clientX - rect.left, e.clientY - rect.top)
    })
    canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      onMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top)
    }, { passive: false })

    const tick = () => {
      const dt = 16

      // Add dye and velocity from mouse
      if (mouse.x >= 0 && mouse.x < N && mouse.y >= 0 && mouse.y < N) {
        hue = (hue + 1.2) % 360
        const cx = Math.floor(mouse.x), cy = Math.floor(mouse.y)
        const hr = hue / 360, hs = 0.9, hv = 1.0
        // HSV to RGB
        const hi = Math.floor(hr * 6), hf = hr * 6 - hi
        const hp = hv*(1-hs), hq = hv*(1-hf*hs), ht = hv*(1-(1-hf)*hs)
        const [cr, cg, cb] = [[hv,ht,hp],[hq,hv,hp],[hp,hv,ht],[hp,hq,hv],[ht,hp,hv],[hv,hp,hq]][hi%6]

        const rad = 4
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (dx*dx+dy*dy > rad*rad) continue
            const nx = cx+dx, ny = cy+dy
            if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue
            const idx = nx + ny*N
            const str = 1 - Math.sqrt(dx*dx+dy*dy)/rad
            r[idx] += cr * str * 1.5
            g[idx] += cg * str * 1.5
            b[idx] += cb * str * 1.5
            vx[idx] += (mouse.x - mouse.px) * str * 0.8
            vy[idx] += (mouse.y - mouse.py) * str * 0.8
          }
        }
      }

      // Advect velocity
      advect(vx, vx0, vx, vy, dt); advect(vy, vy0, vx, vy, dt)
      vx.set(vx0); vy.set(vy0)

      // Advect density
      advect(r, r0, vx, vy, dt); advect(g, g0, vx, vy, dt); advect(b, b0, vx, vy, dt)
      r.set(r0); g.set(g0); b.set(b0)

      // Decay
      for (let i = 0; i < SIZE; i++) {
        vx[i] *= 0.992; vy[i] *= 0.992
        r[i] *= 0.985; g[i] *= 0.985; b[i] *= 0.985
      }

      // Render
      for (let i = 0; i < SIZE; i++) {
        imgData.data[i*4]   = Math.min(255, r[i] * 255)
        imgData.data[i*4+1] = Math.min(255, g[i] * 255)
        imgData.data[i*4+2] = Math.min(255, b[i] * 255)
        imgData.data[i*4+3] = 255
      }
      offCtx.putImageData(imgData, 0, 0)

      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)

      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div className="exp-wrap">
      <span className="exp-hint">마우스를 그어보세요</span>
      <canvas ref={canvasRef} style={{ background: '#0a0a0f' }} />
    </div>
  )
}
