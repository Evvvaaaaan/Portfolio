import { useEffect, useRef } from 'react'
import '../shared/exp.css'

const TAU = Math.PI * 2
const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const lerp = (a, b, t) => a + (b - a) * t
const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const rgb = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`
const rgba = ([r, g, b], a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`

// Time palettes: dawn → day → dusk → night (loops)
const PALETTES = [
  { // Dawn
    sky0: [255, 130, 90], sky1: [255, 195, 145],
    sunC: [255, 210, 100], sunG: [255, 140, 50],
    cloudC: [255, 235, 220], cloudS: [210, 155, 130],
    stars: 0,
  },
  { // Day
    sky0: [55, 125, 195], sky1: [169, 212, 234],
    sunC: [255, 248, 180], sunG: [255, 220, 100],
    cloudC: [255, 255, 255], cloudS: [200, 215, 225],
    stars: 0,
  },
  { // Dusk
    sky0: [75, 30, 100], sky1: [225, 90, 50],
    sunC: [255, 110, 40], sunG: [190, 50, 20],
    cloudC: [255, 195, 165], cloudS: [175, 90, 70],
    stars: 0,
  },
  { // Night
    sky0: [8, 8, 35], sky1: [18, 18, 55],
    sunC: [225, 225, 245], sunG: [90, 90, 155],
    cloudC: [70, 82, 115], cloudS: [45, 52, 78],
    stars: 1,
  },
]

function getPal(t) {
  const phase = ((t % 1) + 1) % 1
  const fi = phase * PALETTES.length
  const i = Math.floor(fi) % PALETTES.length
  const f = fi - Math.floor(fi)
  const a = PALETTES[i]
  const b = PALETTES[(i + 1) % PALETTES.length]
  return {
    sky0: lerpC(a.sky0, b.sky0, f),
    sky1: lerpC(a.sky1, b.sky1, f),
    sunC: lerpC(a.sunC, b.sunC, f),
    sunG: lerpC(a.sunG, b.sunG, f),
    cloudC: lerpC(a.cloudC, b.cloudC, f),
    cloudS: lerpC(a.cloudS, b.cloudS, f),
    stars: lerp(a.stars, b.stars, f),
  }
}

// Layer config: [speed, depthAlpha, yBand top%, yBand bot%]
const LAYERS = [
  { speed: 0.12, alpha: 0.45, yLo: 0.05, yHi: 0.50, scaleBase: 1.4 },
  { speed: 0.22, alpha: 0.72, yLo: 0.08, yHi: 0.58, scaleBase: 0.9 },
  { speed: 0.38, alpha: 0.90, yLo: 0.12, yHi: 0.62, scaleBase: 0.50 },
]

function makeCloud(W, H, layer, startOnScreen = true) {
  const lay = LAYERS[layer]
  const scale = rand(0.75, 1.35) * lay.scaleBase
  const puffCount = 5 + Math.floor(Math.random() * 5)
  const spread = 75 * scale
  const puffs = Array.from({ length: puffCount }, () => ({
    dx: rand(-spread, spread),
    dy: rand(-spread * 0.35, spread * 0.15),
    r: rand(28, 75) * scale,
    phase: Math.random() * TAU,
  }))

  return {
    x: startOnScreen ? rand(0, W) : rand(-220, -50),
    y: rand(H * lay.yLo, H * lay.yHi),
    vx: rand(lay.speed * 0.6, lay.speed * 1.4),
    vy: 0,
    puffs,
    scale,
    layer,
    alpha: 0,
    targetAlpha: rand(0.5, 0.88),
    seed: Math.random() * 1000,
    born: performance.now(),
  }
}

export default function DriftingClouds() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    let W = 0, H = 0
    let raf
    let time = 0.15          // 0=day start, cycles through palettes
    let lastNow = performance.now()
    let clouds = []
    let ripples = []

    const mouse = { x: -9999, y: -9999 }
    let dragVX = 0, dragVY = 0
    let isDown = false

    // Fixed star positions (normalised)
    const stars = Array.from({ length: 220 }, () => ({
      nx: Math.random(),
      ny: Math.random() * 0.68,
      r: rand(0.3, 1.6),
      twinkle: rand(0, TAU),
      speed: rand(0.0005, 0.002),
    }))

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      clouds = []
      clouds.push(...Array.from({ length: 3 }, () => makeCloud(W, H, 0, true)))
      clouds.push(...Array.from({ length: 5 }, () => makeCloud(W, H, 1, true)))
      clouds.push(...Array.from({ length: 4 }, () => makeCloud(W, H, 2, true)))
      // Pre-set alpha for clouds that start on screen
      clouds.forEach(c => { c.alpha = c.targetAlpha })
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    function drawSkyBodies(pal, now) {
      // Continuous arc: sun and moon on opposite sides
      const angle = time * TAU          // full rotation per cycle
      const sinA = Math.sin(angle)
      const cosA = Math.cos(angle)

      const sunX = W * 0.5 - cosA * W * 0.42
      const sunY = H * 0.62 - sinA * H * 0.68
      const moonX = W * 0.5 + cosA * W * 0.42
      const moonY = H * 0.62 + sinA * H * 0.68

      // Draw sun if above horizon
      if (sunY < H * 0.8 && sunY > -120) {
        const pulse = 1 + 0.04 * Math.sin(now * 0.0008)
        const gr = 80 * pulse
        const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, gr * 3)
        glow.addColorStop(0, rgba(pal.sunG, 0.45))
        glow.addColorStop(1, rgba(pal.sunG, 0))
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(sunX, sunY, gr * 3, 0, TAU); ctx.fill()

        const body = ctx.createRadialGradient(sunX - 15, sunY - 15, 0, sunX, sunY, gr * 0.95)
        body.addColorStop(0, rgba(pal.sunC, 1))
        body.addColorStop(1, rgba(pal.sunG, 0.85))
        ctx.fillStyle = body
        ctx.beginPath(); ctx.arc(sunX, sunY, gr * 0.95, 0, TAU); ctx.fill()
      }

      // Draw moon if above horizon
      if (moonY < H * 0.8 && moonY > -80) {
        const mr = 26
        const mglow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, mr * 3.5)
        mglow.addColorStop(0, rgba(pal.sunG, 0.3))
        mglow.addColorStop(1, rgba(pal.sunG, 0))
        ctx.fillStyle = mglow
        ctx.beginPath(); ctx.arc(moonX, moonY, mr * 3.5, 0, TAU); ctx.fill()

        ctx.fillStyle = rgba(pal.sunC, 0.95)
        ctx.beginPath(); ctx.arc(moonX, moonY, mr, 0, TAU); ctx.fill()
        // Crescent shadow
        ctx.fillStyle = rgba(pal.sky0, 0.88)
        ctx.beginPath(); ctx.arc(moonX + 9, moonY - 5, mr * 0.84, 0, TAU); ctx.fill()
      }
    }

    function drawCloud(c, pal, now) {
      const lay = LAYERS[c.layer]
      const breathe = 1 + 0.012 * Math.sin(now * 0.0006 + c.seed)
      ctx.save()

      // Shadow puffs
      ctx.globalAlpha = c.alpha * lay.alpha * 0.3
      for (const p of c.puffs) {
        const gx = c.x + p.dx * breathe
        const gy = c.y + p.dy * breathe + p.r * 0.38
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, p.r * breathe)
        grad.addColorStop(0, rgba(pal.cloudS, 0.9))
        grad.addColorStop(1, rgba(pal.cloudS, 0))
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(gx, gy, p.r * breathe, 0, TAU); ctx.fill()
      }

      // Cloud body puffs
      ctx.globalAlpha = c.alpha * lay.alpha
      for (const p of c.puffs) {
        const gx = c.x + p.dx * breathe
        const gy = c.y + p.dy * breathe
        const grad = ctx.createRadialGradient(gx, gy - p.r * 0.12, 0, gx, gy, p.r * breathe)
        grad.addColorStop(0, rgba(pal.cloudC, 0.96))
        grad.addColorStop(0.5, rgba(pal.cloudC, 0.72))
        grad.addColorStop(1, rgba(pal.cloudC, 0))
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(gx, gy, p.r * breathe, 0, TAU); ctx.fill()
      }

      ctx.restore()
    }

    function burst(x, y) {
      for (const c of clouds) {
        const dx = c.x - x, dy = c.y - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 420 && dist > 0) {
          const impulse = ((420 - dist) / 420) ** 2 * 9
          c.vx += (dx / dist) * impulse
          c.vy += (dy / dist) * impulse * 0.5
        }
      }
    }

    function spawnCloud(x, y) {
      if (y > H * 0.68 || clouds.length >= 18) return
      const yRatio = y / H
      const layer = yRatio < 0.25 ? 0 : yRatio < 0.45 ? 1 : 2
      const c = makeCloud(W, H, layer, false)
      c.x = x; c.y = y
      c.alpha = 0
      c.targetAlpha = rand(0.55, 0.85)
      c.fadeSpeed = 1.4   // faster fade-in than ambient clouds
      c.vx = rand(0.08, 0.4)
      clouds.push(c)
    }

    function tick(now) {
      const dt = Math.min((now - lastNow) / 1000, 0.05)
      lastNow = now

      time += dt * 0.006   // ~167s per full day cycle

      const pal = getPal(time)

      // Sky gradient
      const sg = ctx.createLinearGradient(0, 0, 0, H)
      sg.addColorStop(0, rgb(pal.sky0))
      sg.addColorStop(0.65, rgb(lerpC(pal.sky0, pal.sky1, 0.6)))
      sg.addColorStop(1, rgb(pal.sky1))
      ctx.fillStyle = sg
      ctx.fillRect(0, 0, W, H)

      // Stars
      if (pal.stars > 0.01) {
        ctx.save()
        for (const s of stars) {
          const tw = 0.4 + 0.6 * Math.sin(s.twinkle + now * s.speed)
          ctx.globalAlpha = pal.stars * tw
          ctx.fillStyle = 'white'
          ctx.beginPath()
          ctx.arc(s.nx * W, s.ny * H, s.r, 0, TAU)
          ctx.fill()
        }
        ctx.restore()
      }

      drawSkyBodies(pal, now)

      // Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        const age = (now - rp.born) / 700
        if (age > 1) { ripples.splice(i, 1); continue }
        ctx.save()
        ctx.globalAlpha = (1 - age) * 0.55
        ctx.strokeStyle = 'rgba(255,255,255,1)'
        ctx.lineWidth = 2 - age * 1.5
        ctx.beginPath()
        ctx.arc(rp.x, rp.y, age * 68, 0, TAU)
        ctx.stroke()
        ctx.restore()
      }

      // Sort clouds by layer (back to front)
      clouds.sort((a, b) => a.layer - b.layer)

      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i]

        // Fade in (spawned clouds use faster speed)
        if (c.alpha < c.targetAlpha) c.alpha = Math.min(c.targetAlpha, c.alpha + dt * (c.fadeSpeed ?? 0.4))

        // Mouse repulsion
        const dx = c.x - mouse.x
        const dy = c.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const repR = 180 + c.layer * 60
        if (dist < repR && dist > 0) {
          const str = ((repR - dist) / repR) ** 1.8 * 2.5
          c.vx += (dx / dist) * str * dt * 60
          c.vy += (dy / dist) * str * dt * 25
        }

        // Drag wind (sustained)
        if (isDown) {
          c.vx += dragVX * 0.008 * dt * 60
          c.vy += dragVY * 0.006 * dt * 60
        }

        // Approach base drift speed
        const lay = LAYERS[c.layer]
        const osc = Math.sin(now * 0.00028 + c.seed) * 0.04
        c.vx += (lay.speed + osc - c.vx) * 0.012
        c.vy += (0 - c.vy) * 0.035

        c.x += c.vx * dt * 60
        c.y += c.vy * dt * 60

        // Wrap horizontally, recycle from left
        if (c.x > W + 260) {
          c.x = -240
          c.y = rand(H * lay.yLo, H * lay.yHi)
          c.alpha = 0
        }
        // Vertical soft clamp
        const yLo = H * lay.yLo, yHi = H * lay.yHi
        if (c.y < yLo) c.vy += (yLo - c.y) * 0.005
        if (c.y > yHi) c.vy += (yHi - c.y) * 0.005

        drawCloud(c, pal, now)
      }

      // Horizon atmospheric haze
      const haze = ctx.createLinearGradient(0, H * 0.6, 0, H)
      haze.addColorStop(0, rgba(pal.sky1, 0))
      haze.addColorStop(1, rgba(pal.sky1, 0.55))
      ctx.fillStyle = haze
      ctx.fillRect(0, H * 0.6, W, H * 0.4)

      raf = requestAnimationFrame(tick)
    }

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      const nx = e.clientX - rect.left
      const ny = e.clientY - rect.top
      dragVX = (nx - mouse.x) * 0.9
      dragVY = (ny - mouse.y) * 0.9
      mouse.x = nx; mouse.y = ny
    }

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      ripples.push({ x, y, born: performance.now() })
      burst(x, y)
      spawnCloud(x, y)
    }

    const onDown = () => { isDown = true }
    const onUp   = () => { isDown = false; dragVX = 0; dragVY = 0 }

    const onWheel = (e) => { time += e.deltaY * 0.0004 }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mouseup', onUp)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: true })

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const t = e.touches[0]
      const nx = t.clientX - rect.left
      const ny = t.clientY - rect.top
      dragVX = (nx - mouse.x) * 0.9
      dragVY = (ny - mouse.y) * 0.9
      mouse.x = nx; mouse.y = ny
      isDown = true
    }, { passive: false })

    canvas.addEventListener('touchstart', (e) => {
      const rect = canvas.getBoundingClientRect()
      const t = e.touches[0]
      burst(t.clientX - rect.left, t.clientY - rect.top)
    })

    canvas.addEventListener('touchend', () => { isDown = false; dragVX = 0; dragVY = 0 })

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mouseup', onUp)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div className="exp-wrap" style={{ background: '#a9d4ea' }}>
      <span className="exp-hint">클릭해서 구름 만들기</span>
      <canvas ref={canvasRef} />
    </div>
  )
}
