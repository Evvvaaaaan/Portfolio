import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './GrowingTree.css'

const SPECIES = [
  { id: 'oak',    name: '참나무',   depth: 8, spread: 0.55, ratio: 0.73, droop: 0,    trunk: 0.16, crook: 0.11, leafShape: 'round',   defaultColor: 'green' },
  { id: 'cherry', name: '벚나무',   depth: 7, spread: 0.74, ratio: 0.70, droop: -0.04, trunk: 0.14, crook: 0.17, leafShape: 'blossom', defaultColor: 'pink' },
  { id: 'maple',  name: '단풍나무', depth: 8, spread: 0.63, ratio: 0.71, droop: 0,    trunk: 0.15, crook: 0.13, leafShape: 'round',   defaultColor: 'autumn' },
  { id: 'willow', name: '버드나무', depth: 7, spread: 0.34, ratio: 0.80, droop: 0.34, trunk: 0.18, crook: 0.07, leafShape: 'slender', defaultColor: 'spring' },
]

const GROUNDS = [
  { id: 'fertile', name: '비옥한 흙', growMul: 1.15, scale: 1.0,  depthMod: 0,  crookMul: 1.0, color: '#241b12' },
  { id: 'sand',    name: '모래',     growMul: 0.85, scale: 0.8,  depthMod: -1, crookMul: 1.4, color: '#3a3023' },
  { id: 'rock',    name: '바위',     growMul: 0.6,  scale: 0.62, depthMod: -2, crookMul: 2.1, color: '#23262b' },
]

const WEATHERS = [
  { id: 'clear', name: '맑음', windBase: 4,  growMul: 1.0 },
  { id: 'rain',  name: '비',   windBase: 10, growMul: 1.35 },
  { id: 'snow',  name: '눈',   windBase: 7,  growMul: 0.55 },
]

const LEAF_COLORS = [
  { id: 'spring', name: '연두', c: '#a8d271' },
  { id: 'green',  name: '초록', c: '#5f9e4d' },
  { id: 'autumn', name: '주황', c: '#e0813f' },
  { id: 'crimson', name: '진홍', c: '#cd4b38' },
  { id: 'gold',   name: '금빛', c: '#e3b54c' },
  { id: 'pink',   name: '벚꽃', c: '#f2a9c4' },
]

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

export default function GrowingTree() {
  const canvasRef = useRef()
  const [species, setSpecies] = useState('oak')
  const [ground, setGround] = useState('fertile')
  const [weather, setWeather] = useState('clear')
  const [leafColor, setLeafColor] = useState('green')
  const [wind, setWind] = useState(22)
  const optsRef = useRef({ species: 'oak', ground: 'fertile', weather: 'clear', leafColor: 'green', wind: 22 })
  const apiRef = useRef({})

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let W = 0, H = 0
    let tree = null
    let G = 0
    let flying = []
    let grounded = []
    let drops = []
    let flakes = []
    let grass = []
    let pebbles = []
    let snowAmt = 0
    let barkColors = []
    const SEG = 4

    const groundY = () => H * 0.82

    // ── 절차적 나무 골격 생성 ──
    const buildTree = (sp, gr, rng) => {
      const maxD = Math.max(3, sp.depth + gr.depthMod)
      const dur = 1.45 / maxD
      const build = (depth, relAngle, len, attachT, startG) => {
        const segs = []
        for (let s = 0; s < SEG; s++) {
          segs.push((rng() - 0.5) * sp.crook * gr.crookMul + sp.droop * 0.3 * (depth / maxD))
        }
        const b = {
          depth, relAngle, len, attachT, startG, segs, dur,
          phase: rng() * 6.283,
          flex: Math.pow(depth / maxD, 2.2) * 0.0028 + 0.00015,
          children: [], leaves: [],
        }
        if (depth < maxD) {
          const n = 2 + (depth < 3 && rng() < 0.55 ? 1 : 0)
          for (let i = 0; i < n; i++) {
            const side = i === 1 ? -1 : i === 0 ? 1 : (rng() < 0.5 ? 1 : -1)
            const ang = i === 0 && depth < 2
              ? (rng() - 0.5) * sp.spread * 0.5            // 줄기를 잇는 가지
              : side * sp.spread * (0.45 + rng() * 0.75)
            const t = depth === 0 ? 0.55 + rng() * 0.43 : 0.45 + rng() * 0.53
            b.children.push(build(
              depth + 1, ang,
              len * sp.ratio * (0.68 + rng() * 0.45),
              t, startG + dur * (0.35 + t * 0.55)
            ))
          }
        }
        if (depth >= maxD - 1 || (depth === maxD - 2 && rng() < 0.55)) {
          const n = 2 + Math.floor(rng() * 3)
          for (let i = 0; i < n; i++) {
            b.leaves.push({
              t: 0.35 + rng() * 0.65,
              size: 2.1 + rng() * 2.6,
              ang: (rng() - 0.5) * 1.8,
              phase: rng() * 6.283,
              shade: (rng() - 0.5) * 18,
              attached: true,
            })
          }
        }
        return b
      }
      const lean = (rng() - 0.5) * 0.1 + (gr.id === 'rock' ? (rng() - 0.5) * 0.34 : 0)
      barkColors = []
      for (let d = 0; d <= maxD; d++) {
        const k = d / maxD
        barkColors.push(`rgb(${Math.round(56 + k * 52)},${Math.round(43 + k * 40)},${Math.round(33 + k * 32)})`)
      }
      return { root: build(0, lean, H * sp.trunk * gr.scale, 0, 0), maxD }
    }

    const plant = () => {
      const o = optsRef.current
      const sp = SPECIES.find(s => s.id === o.species)
      const gr = GROUNDS.find(g => g.id === o.ground)
      const rng = mulberry32((Math.random() * 1e9) | 0)
      tree = buildTree(sp, gr, rng)
      G = 0
      flying = []
      grounded = []
      grass = Array.from({ length: 56 }, () => ({
        x: W * 0.5 + (Math.random() - 0.5) * W * 0.7,
        h: 5 + Math.random() * 10,
        ph: Math.random() * 6.283,
      }))
      pebbles = Array.from({ length: 7 }, () => ({
        x: W * 0.5 + (Math.random() - 0.5) * W * 0.5,
        w: 8 + Math.random() * 26,
        h: 4 + Math.random() * 9,
      }))
    }
    apiRef.current.replant = plant

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.offsetWidth
      H = canvas.offsetHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      plant()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ── 매 프레임 가지 재귀 드로잉: 바람에 의한 휨은 깊이(유연성)에 비례 ──
    const leafBuf = []
    let windNow = 0
    let detachP = 0
    let matur = 0

    const drawBranch = (b, x, y, parentAng) => {
      const local = (G - b.startG) / b.dur
      if (local <= 0) return
      const eased = local >= 1 ? 1 : 1 - Math.pow(1 - local, 2.1)
      const w0 = Math.max(0.6, Math.pow(tree.maxD - b.depth + 1, 1.5) * 0.5 * matur)
      const sway = windNow * b.flex * (Math.sin(performance.now() * 0.0016 + b.phase) + 0.45 * Math.sin(performance.now() * 0.0037 + b.phase * 1.7))
      let ang = parentAng + b.relAngle + sway
      const segLen = (b.len * eased) / SEG
      let px = x, py = y
      const pxs = [x], pys = [y], angs = [ang]
      ctx.strokeStyle = barkColors[b.depth]
      for (let s = 0; s < SEG; s++) {
        ang += b.segs[s] + sway * 0.5
        const nx = px + Math.cos(ang) * segLen
        const ny = py + Math.sin(ang) * segLen
        ctx.lineWidth = Math.max(0.5, w0 * (1 - (s / SEG) * 0.45))
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(nx, ny)
        ctx.stroke()
        px = nx; py = ny
        pxs.push(nx); pys.push(ny); angs.push(ang)
      }
      for (const c of b.children) {
        const i = Math.round(c.attachT * SEG)
        drawBranch(c, pxs[i], pys[i], angs[i])
      }
      for (const lf of b.leaves) {
        if (!lf.attached) continue
        if (eased < lf.t) continue
        const i = Math.round(lf.t * SEG)
        const lx = pxs[i], ly = pys[i]
        if (detachP > 0 && Math.random() < detachP) {
          lf.attached = false
          flying.push({
            x: lx, y: ly,
            vx: windNow * 0.18 + (Math.random() - 0.5) * 1.4,
            vy: -0.4 * Math.random(),
            rot: Math.random() * 6.283,
            vr: (Math.random() - 0.5) * 0.24,
            size: lf.size, shade: lf.shade,
          })
          continue
        }
        leafBuf.push({
          x: lx, y: ly,
          rot: angs[i] + lf.ang + windNow * 0.004 * Math.sin(performance.now() * 0.003 + lf.phase),
          size: lf.size * (0.3 + matur * 0.7),
          shade: lf.shade,
        })
      }
    }

    const drawLeaf = (l, shape, h, s, lum, alpha = 0.92) => {
      ctx.fillStyle = `hsla(${h},${s}%,${Math.max(8, Math.min(88, lum + l.shade))}%,${alpha})`
      ctx.beginPath()
      if (shape === 'blossom') {
        ctx.arc(l.x, l.y, l.size * 0.62, 0, 6.283)
      } else if (shape === 'slender') {
        ctx.ellipse(l.x, l.y, l.size * 0.34, l.size * 1.5, l.rot, 0, 6.283)
      } else {
        ctx.ellipse(l.x, l.y, l.size, l.size * 0.62, l.rot, 0, 6.283)
      }
      ctx.fill()
    }

    const SKY = {
      clear: ['#0a0e1c', '#141a2c', '#1a2030'],
      rain: ['#080b12', '#0e131d', '#121722'],
      snow: ['#0c1018', '#161c28', '#1d2433'],
    }

    let lastT = performance.now()

    const tick = () => {
      const o = optsRef.current
      const sp = SPECIES.find(x => x.id === o.species)
      const gr = GROUNDS.find(x => x.id === o.ground)
      const wt = WEATHERS.find(x => x.id === o.weather)
      const palette = LEAF_COLORS.find(c => c.id === o.leafColor) || LEAF_COLORS[1]
      const [lh, ls, ll] = hexToHsl(palette.c)
      const now = performance.now()
      const dt = Math.min((now - lastT) / 1000, 0.25)
      lastT = now
      const t = now * 0.001
      const gy = groundY()

      // 바람: 슬라이더 + 날씨 기본값 + 돌풍(저주파 노이즈)
      const gust = 0.55 + 0.45 * Math.sin(t * 0.4) * Math.sin(t * 0.97 + 2)
      windNow = (o.wind * 0.32 + wt.windBase) * (0.55 + gust)
      detachP = Math.max(0, windNow - 16) * 0.00014 + (wt.id === 'snow' ? 0.00035 : 0)
      matur = Math.min(1, 0.18 + G * 0.7)

      // 성장: 시간 기반(프레임 드랍과 무관) — 날씨/지면이 속도를 결정
      if (G < 1.45) G += dt * 0.11 * wt.growMul * gr.growMul

      // 하늘
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      const [c0, c1, c2] = SKY[wt.id]
      sky.addColorStop(0, c0)
      sky.addColorStop(0.6, c1)
      sky.addColorStop(1, c2)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // 달 (맑음)
      if (wt.id === 'clear') {
        const mg = ctx.createRadialGradient(W * 0.76, H * 0.18, 4, W * 0.76, H * 0.18, 70)
        mg.addColorStop(0, 'rgba(235,238,250,0.85)')
        mg.addColorStop(0.12, 'rgba(225,230,248,0.5)')
        mg.addColorStop(1, 'rgba(220,228,250,0)')
        ctx.fillStyle = mg
        ctx.fillRect(W * 0.76 - 70, H * 0.18 - 70, 140, 140)
      }

      // 지면
      const gd = ctx.createLinearGradient(0, gy, 0, H)
      gd.addColorStop(0, gr.color)
      gd.addColorStop(1, '#07080b')
      ctx.fillStyle = gd
      ctx.fillRect(0, gy, W, H - gy)
      if (gr.id === 'rock') {
        ctx.fillStyle = 'rgba(150,158,170,0.12)'
        for (const p of pebbles) {
          ctx.beginPath()
          ctx.ellipse(p.x, gy + 3, p.w, p.h, 0, Math.PI, 0)
          ctx.fill()
        }
      }
      if (gr.id === 'sand') {
        ctx.fillStyle = 'rgba(220,195,150,0.07)'
        for (let i = 0; i < 40; i++) {
          ctx.fillRect((i * 97.3) % W, gy + 6 + ((i * 53.7) % (H - gy - 10)), 2, 1)
        }
      }
      // 풀 (비옥한 흙): 바람에 같이 흔들림
      if (gr.id === 'fertile') {
        ctx.strokeStyle = 'rgba(112,158,92,0.35)'
        ctx.lineWidth = 1
        for (const g of grass) {
          const s = windNow * 0.14 + Math.sin(t * 2 + g.ph) * 1.3
          ctx.beginPath()
          ctx.moveTo(g.x, gy + 2)
          ctx.quadraticCurveTo(g.x + s * 0.5, gy - g.h * 0.6, g.x + s * 1.4, gy - g.h)
          ctx.stroke()
        }
      }
      // 쌓인 눈
      snowAmt = Math.max(0, Math.min(1, snowAmt + (wt.id === 'snow' ? 0.0006 : -0.0012)))
      if (snowAmt > 0.01) {
        ctx.fillStyle = `rgba(225,232,245,${snowAmt * 0.34})`
        ctx.fillRect(0, gy, W, H - gy)
        ctx.fillStyle = `rgba(235,240,252,${snowAmt * 0.55})`
        ctx.fillRect(0, gy - 1.5, W, 3)
      }

      // 땅에 떨어진 잎
      grounded = grounded.filter(l => l.fade > 0.02)
      for (const l of grounded) {
        l.fade -= 0.0012
        drawLeaf(l, sp.leafShape, lh, ls * 0.7, ll - 8, l.fade * 0.7)
      }

      // 나무
      leafBuf.length = 0
      ctx.lineCap = 'round'
      if (tree) drawBranch(tree.root, W * 0.5, gy + 2, -Math.PI / 2)
      for (const l of leafBuf) drawLeaf(l, sp.leafShape, lh, ls, ll)

      // 날아가는 잎: 바람 항력 + 중력 + 펄럭임(양력)
      flying = flying.filter(l => !l.done)
      if (flying.length > 380) flying.splice(0, flying.length - 380)
      for (const l of flying) {
        l.vx += (windNow * 0.14 - l.vx) * 0.035 + (Math.random() - 0.5) * 0.3
        l.vy += 0.05 - Math.abs(Math.sin(t * 2.4 + l.rot)) * 0.034
        l.x += l.vx
        l.y += l.vy
        l.rot += l.vr + l.vx * 0.006
        if (l.y >= gy + 2 + Math.random() * 8) {
          l.done = true
          if (grounded.length < 320) grounded.push({ x: l.x, y: Math.min(l.y, gy + 9), rot: l.rot, size: l.size, shade: l.shade, fade: 1 })
          continue
        }
        if (l.x > W + 40) l.done = true
        drawLeaf(l, sp.leafShape, lh, ls, ll)
      }

      // 비 / 눈
      if (wt.id === 'rain') {
        if (drops.length < 130) drops.push({ x: Math.random() * (W + 200) - 150, y: -10, sp: 8 + Math.random() * 5 })
        ctx.strokeStyle = 'rgba(150,180,220,0.28)'
        ctx.lineWidth = 1
        drops = drops.filter(d => d.y < gy)
        for (const d of drops) {
          d.x += windNow * 0.07
          d.y += d.sp
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x + windNow * 0.1, d.y + d.sp * 1.4)
          ctx.stroke()
        }
      } else drops.length = 0
      if (wt.id === 'snow') {
        if (flakes.length < 120) flakes.push({ x: Math.random() * (W + 100) - 50, y: -8, sp: 0.5 + Math.random() * 1.1, ph: Math.random() * 6.283, r: 0.8 + Math.random() * 1.6 })
        ctx.fillStyle = 'rgba(235,240,250,0.75)'
        flakes = flakes.filter(f => f.y < gy + 4)
        for (const f of flakes) {
          f.x += Math.sin(t * 1.4 + f.ph) * 0.5 + windNow * 0.035
          f.y += f.sp
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.r, 0, 6.283)
          ctx.fill()
        }
      } else flakes.length = 0

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const set = (key, setter) => (val) => {
    setter(val)
    optsRef.current[key] = val
    if (key === 'species') {
      const def = SPECIES.find(s => s.id === val).defaultColor
      setLeafColor(def)
      optsRef.current.leafColor = def
      apiRef.current.replant?.()
    }
    if (key === 'ground') apiRef.current.replant?.()
  }

  return (
    <div className="exp-wrap">
      <span className="exp-hint">날씨·지면·바람을 바꿔보세요 · 바람이 강해지면 잎이 날아갑니다</span>
      <canvas ref={canvasRef} />

      <div className="gt-panel">
        <div className="gt-row">
          <span className="gt-label">수종</span>
          <div className="gt-seg">
            {SPECIES.map(s => (
              <button key={s.id} className={species === s.id ? 'on' : ''} onClick={() => set('species', setSpecies)(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="gt-row">
          <span className="gt-label">잎 색</span>
          <div className="gt-dots">
            {LEAF_COLORS.map(c => (
              <button
                key={c.id}
                className={`gt-dot${leafColor === c.id ? ' on' : ''}`}
                style={{ background: c.c }}
                title={c.name}
                onClick={() => set('leafColor', setLeafColor)(c.id)}
              />
            ))}
          </div>
        </div>

        <div className="gt-row">
          <span className="gt-label">날씨</span>
          <div className="gt-seg">
            {WEATHERS.map(w => (
              <button key={w.id} className={weather === w.id ? 'on' : ''} onClick={() => set('weather', setWeather)(w.id)}>
                {w.name}
              </button>
            ))}
          </div>
        </div>

        <div className="gt-row">
          <span className="gt-label">지면</span>
          <div className="gt-seg">
            {GROUNDS.map(g => (
              <button key={g.id} className={ground === g.id ? 'on' : ''} onClick={() => set('ground', setGround)(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        </div>

        <div className="gt-row">
          <span className="gt-label">바람 <em className="gt-val">{(wind * 0.1).toFixed(1)} m/s</em></span>
          <input
            type="range" min="0" max="100" value={wind} className="exp-range"
            onChange={e => set('wind', setWind)(+e.target.value)}
          />
        </div>

        <button className="gt-replant" onClick={() => apiRef.current.replant?.()}>↺ 다시 심기</button>
      </div>
    </div>
  )
}
