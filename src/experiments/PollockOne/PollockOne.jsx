import { useEffect, useRef, useState, useCallback } from 'react'
import './PollockOne.css'

function rnd(min, max) { return min + Math.random() * (max - min) }

/* ── Pollock palette ── */
const PALETTE = [
  { label: 'Black', color: '#100e08' },
  { label: 'White', color: '#f0e8d8' },
  { label: 'Brown', color: '#5e3218' },
  { label: 'Teal',  color: '#1e4a3e' },
  { label: 'Sand',  color: '#b89050' },
]

/* ── Klein artworks ── */
const KLEIN_ARTWORKS = [
  { id: 'ikb79', title: 'IKB 79',  year: '1959', hint: '마우스를 움직여 빛의 깊이를 탐색하세요' },
  { id: 'ant82', title: 'ANT 82', year: '1960', hint: '클릭해서 인체의 흔적을 남겨보세요' },
  { id: 're20',  title: 'RE 20',  year: '1961', hint: '마우스로 질감을 느껴보세요' },
  { id: 'rp4',   title: 'RP 4',   year: '1961', hint: '클릭해서 빛의 반사를 만드세요' },
]

/* ── Pollock generator ── */
function generatePollock(ctx, W, H) {
  ctx.save()
  ctx.fillStyle = '#d4c9b0'
  ctx.fillRect(0, 0, W, H)

  const layers = [
    { color: '#100e08', alpha: 0.92, paths: 38, lw: [0.5, 4.5] },
    { color: '#f0e8d8', alpha: 0.75, paths: 15, lw: [1.5, 5.5] },
    { color: '#5e3218', alpha: 0.65, paths: 13, lw: [0.5, 3.2] },
    { color: '#1e4a3e', alpha: 0.55, paths: 7,  lw: [0.5, 2.5] },
    { color: '#100e08', alpha: 0.85, paths: 28, lw: [0.5, 3.5] },
    { color: '#b89050', alpha: 0.45, paths: 10, lw: [1, 4] },
  ]

  for (const layer of layers) {
    ctx.strokeStyle = layer.color
    ctx.globalAlpha = layer.alpha
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let p = 0; p < layer.paths; p++) {
      ctx.lineWidth = rnd(layer.lw[0], layer.lw[1])
      ctx.beginPath()
      let x = rnd(0, W), y = rnd(0, H)
      ctx.moveTo(x, y)
      let vx = rnd(-28, 28), vy = rnd(-14, 14) + 2
      const steps = 80 + Math.floor(rnd(0, 240))
      for (let s = 0; s < steps; s++) {
        vx += rnd(-5, 5); vy += rnd(-5, 5)
        vx *= 0.93; vy *= 0.93
        x += vx; y += vy
        ctx.lineTo(x, y)
        if (Math.random() < 0.04) {
          ctx.stroke(); ctx.beginPath()
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2, d = rnd(2, 16)
            ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
          }
          ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y)
        }
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

/* ── Klein renders ── */
function renderIKB79(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.45, H * 0.38, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75)
  g.addColorStop(0, '#1a4db8'); g.addColorStop(0.5, '#002FA7'); g.addColorStop(1, '#001260')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = 0.022
  for (let i = 0; i < 14000; i++) {
    const v = rnd(80, 255)
    ctx.fillStyle = `rgb(${(v * 0.3) | 0},${(v * 0.55) | 0},${v | 0})`
    ctx.fillRect(rnd(0, W), rnd(0, H), 1.2, 1.2)
  }
  ctx.restore()
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.18, W * 0.5, H * 0.5, H * 0.88)
  vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,28,0.58)')
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)
}

function renderANT82(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.4, H * 0.35, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8)
  g.addColorStop(0, '#1a52c8'); g.addColorStop(0.6, '#0033b8'); g.addColorStop(1, '#001370')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const sc = H / 700
  ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = '#000e42'
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = rnd(6, 28); ctx.lineCap = 'round'; ctx.beginPath()
    const x = rnd(W * 0.08, W * 0.92), y = rnd(H * 0.12, H * 0.88)
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + rnd(-70, 70), y + rnd(-25, 25), x + rnd(-70, 70), y + rnd(-25, 25), x + rnd(-110, 110), y + rnd(10, 90))
    ctx.stroke()
  }
  ctx.restore()
  function impression(cx, cy) {
    ctx.save(); ctx.fillStyle = '#000d3e'
    ctx.globalAlpha = 0.6
    ctx.beginPath(); ctx.ellipse(cx + rnd(-6, 6) * sc, cy - 82 * sc, 23 * sc, 28 * sc, rnd(-0.15, 0.15), 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.64
    ctx.beginPath(); ctx.ellipse(cx, cy + 15 * sc, 40 * sc, 68 * sc, rnd(-0.1, 0.1), 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.4; ctx.strokeStyle = '#000e42'; ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      ctx.lineWidth = rnd(2.5, 6) * sc; ctx.beginPath()
      const sx = cx + rnd(-40, 40) * sc, sy = cy + rnd(30, 70) * sc
      ctx.moveTo(sx, sy); ctx.lineTo(sx + rnd(-6, 6) * sc, sy + rnd(35, 110) * sc); ctx.stroke()
    }
    ctx.restore()
  }
  impression(W * 0.32, H * 0.52); impression(W * 0.65, H * 0.50)
}

function renderRE20(ctx, W, H) {
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
  bg.addColorStop(0, '#001a60'); bg.addColorStop(1, '#000830')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 34; i++) {
    const x = rnd(W * 0.04, W * 0.96), y = rnd(H * 0.04, H * 0.96), r = rnd(14, 88)
    ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#000020'
    ctx.beginPath(); ctx.ellipse(x + r * 0.22, y + r * 0.28, r * 0.88, r * 0.82, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    const sg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.08, x, y, r)
    sg.addColorStop(0, '#3a7ad4'); sg.addColorStop(0.45, '#002FA7'); sg.addColorStop(0.82, '#001878'); sg.addColorStop(1, '#000d50')
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.globalAlpha = 0.22
    const hg = ctx.createRadialGradient(x - r * 0.38, y - r * 0.38, 0, x - r * 0.2, y - r * 0.2, r * 0.55)
    hg.addColorStop(0, 'rgba(210,228,255,1)'); hg.addColorStop(1, 'transparent')
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip()
    ctx.globalAlpha = 0.28; ctx.fillStyle = 'rgba(0,5,40,0.9)'
    for (let j = 0; j < 10; j++) {
      ctx.beginPath(); ctx.arc(x + rnd(-r * 0.7, r * 0.7), y + rnd(-r * 0.7, r * 0.7), rnd(1.5, 5.5), 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  const cg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.min(W, H) * 0.45)
  cg.addColorStop(0, 'rgba(20,70,190,0.22)'); cg.addColorStop(1, 'transparent')
  ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H)
}

function renderRP4(ctx, W, H) {
  ctx.fillStyle = '#000d3a'; ctx.fillRect(0, 0, W, H)
  const margin = Math.min(W, H) * 0.07, cols = 7, rows = 5
  const cw = (W - margin * 2) / cols, ch = (H - margin * 2) / rows, gap = 5
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + col * cw, y = margin + row * ch, w = cw - gap, h = ch - gap, d = 0.25 + rnd(0, 0.75)
      ctx.fillStyle = `rgba(0,5,30,${d * 0.55})`; ctx.fillRect(x + 5, y + 5, w, h)
      const fg = ctx.createLinearGradient(x, y, x + w * 0.7, y + h * 0.7)
      fg.addColorStop(0, `rgba(${(40 + d * 55) | 0},${(95 + d * 75) | 0},240,${0.7 + d * 0.3})`)
      fg.addColorStop(1, `rgba(0,${(25 + d * 28) | 0},${(125 + d * 40) | 0},${0.85 + d * 0.15})`)
      ctx.fillStyle = fg; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = `rgba(110,165,255,${d * 0.38})`; ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y, 2, h)
      ctx.fillStyle = `rgba(0,0,28,${d * 0.55})`; ctx.fillRect(x, y + h - 2, w, 2); ctx.fillRect(x + w - 2, y, 2, h)
    }
  }
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.22, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
  vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,22,0.7)')
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)
}

const KLEIN_RENDERS = [renderIKB79, renderANT82, renderRE20, renderRP4]

/* ── Component ── */
export default function PollockOne() {
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const ripplesRef = useRef([])
  const rafRef     = useRef(null)

  const [mode, setMode]               = useState('pollock')
  const [kleinIdx, setKleinIdx]       = useState(0)
  const [visible, setVisible]         = useState(true)
  const [activeColor, setActiveColor] = useState(PALETTE[0].color)
  const [hint, setHint]               = useState(true)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (mode === 'pollock') {
      generatePollock(ctx, W, H)
    } else {
      KLEIN_RENDERS[kleinIdx](ctx, W, H)
      const overlay = overlayRef.current
      if (overlay) {
        overlay.width = W * dpr; overlay.height = H * dpr
        overlay.style.width = `${W}px`; overlay.style.height = `${H}px`
        const octx = overlay.getContext('2d')
        octx.setTransform(dpr, 0, 0, dpr, 0, 0)
        octx.clearRect(0, 0, W, H)
      }
    }
  }, [mode, kleinIdx])

  useEffect(() => {
    initCanvas()
    window.addEventListener('resize', initCanvas)
    return () => window.removeEventListener('resize', initCanvas)
  }, [initCanvas])

  // Auto-hide hint
  useEffect(() => {
    setHint(true)
    const t = setTimeout(() => setHint(false), 3200)
    return () => clearTimeout(t)
  }, [mode, kleinIdx])

  // Klein ripple animation loop
  useEffect(() => {
    if (mode !== 'klein') { ripplesRef.current = []; return }
    let alive = true
    const tick = () => {
      if (!alive) return
      const overlay = overlayRef.current
      if (!overlay) { rafRef.current = requestAnimationFrame(tick); return }
      const dpr = window.devicePixelRatio || 1
      const W = overlay.width / dpr, H = overlay.height / dpr
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, W, H)
      ripplesRef.current = ripplesRef.current.filter(r => r.a > 0.006)
      for (const r of ripplesRef.current) {
        const rg = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.r)
        rg.addColorStop(0, `rgba(140,190,255,${r.a})`)
        rg.addColorStop(0.4, `rgba(70,140,240,${r.a * 0.42})`)
        rg.addColorStop(1, 'transparent')
        ctx.fillStyle = rg
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill()
        r.r += 3.5; r.a *= 0.952
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(rafRef.current) }
  }, [mode])

  // Fade-crossfade to new artwork
  const switchTo = useCallback((newMode, newIdx = 0) => {
    setVisible(false)
    setTimeout(() => {
      setMode(newMode)
      setKleinIdx(newIdx)
      ripplesRef.current = []
      setTimeout(() => setVisible(true), 40)
    }, 280)
  }, [])

  /* ── Pollock interactions ── */
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const drawSplatter = (x, y) => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = activeColor; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8
    const n = 10 + Math.floor(Math.random() * 14)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(4, 48)
      ctx.lineWidth = rnd(0.5, 3.5)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const onPollockClick = (e) => {
    if (hint) setHint(false)
    const pos = getPos(e)
    drawSplatter(pos.x, pos.y)
  }

  /* ── Klein interactions ── */
  const onKleinMouseMove = useCallback((e) => {
    if (Math.random() < 0.1) ripplesRef.current.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.38 })
  }, [])

  const onKleinClick = useCallback((e) => {
    setHint(false)
    ripplesRef.current.push({ x: e.clientX, y: e.clientY, r: 14, a: 0.78 })
    if (kleinIdx === 1) {
      const ctx = canvasRef.current.getContext('2d')
      const sc = window.innerHeight / 700
      ctx.save()
      ctx.fillStyle = '#000d3e'; ctx.globalAlpha = 0.48
      ctx.beginPath(); ctx.ellipse(e.clientX, e.clientY, rnd(18, 36) * sc, rnd(28, 56) * sc, rnd(-0.3, 0.3), 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#000e42'; ctx.lineWidth = rnd(2, 5) * sc; ctx.lineCap = 'round'; ctx.globalAlpha = 0.33
      ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY + 14 * sc); ctx.lineTo(e.clientX + rnd(-5, 5) * sc, e.clientY + 14 * sc + rnd(32, 85) * sc); ctx.stroke()
      ctx.restore()
    }
  }, [kleinIdx])

  const art = KLEIN_ARTWORKS[kleinIdx]

  return (
    <div className="pollock-wrap">
      {/* Canvas layers */}
      <div className={`pollock-canvas-wrap${visible ? '' : ' fading'}`}>
        <canvas
          ref={canvasRef}
          className="pollock-canvas"
          style={{ cursor: mode === 'pollock' ? 'crosshair' : 'default' }}
          onClick={mode === 'pollock' ? onPollockClick : undefined}
        />
        {mode === 'klein' && (
          <canvas
            ref={overlayRef}
            className="pollock-canvas pollock-overlay"
            onMouseMove={onKleinMouseMove}
            onClick={onKleinClick}
            style={{ touchAction: 'none' }}
          />
        )}
      </div>

      {/* Bottom UI — Pollock */}
      {mode === 'pollock' && (
        <div className="pollock-ui">
          <div className="pollock-info">
            <span className="pollock-artwork">One: Number 31</span>
            <span className="pollock-artist">Jackson Pollock, 1950</span>
          </div>
          <div className="pollock-divider" />
          <div className="pollock-palette">
            {PALETTE.map((p) => (
              <button
                key={p.color}
                className={`pollock-swatch${activeColor === p.color ? ' active' : ''}`}
                style={{ '--sw': p.color }}
                onClick={() => setActiveColor(p.color)}
                title={p.label}
              />
            ))}
          </div>
          <button className="pollock-regen" onClick={initCanvas} title="Regenerate">↺</button>
          <div className="pollock-divider" />
          <button className="pollock-next-btn" onClick={() => switchTo('klein', 0)}>
            다음 →
          </button>
        </div>
      )}

      {/* Bottom UI — Klein */}
      {mode === 'klein' && (
        <div className="pollock-ui klein-ui">
          <button className="klein-prev-btn" onClick={() => switchTo('pollock')}>← 이전</button>
          <div className="pollock-divider" />
          <button
            className="klein-arr"
            onClick={() => switchTo('klein', Math.max(0, kleinIdx - 1))}
            disabled={kleinIdx === 0}
            aria-label="이전 작품"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="pollock-info">
            <span className="pollock-artwork">{art.title}</span>
            <span className="pollock-artist">Yves Klein, {art.year}</span>
          </div>
          <div className="klein-dots">
            {KLEIN_ARTWORKS.map((a, i) => (
              <button
                key={a.id}
                className={`klein-dot${i === kleinIdx ? ' active' : ''}`}
                onClick={() => switchTo('klein', i)}
                aria-label={a.title}
                aria-current={i === kleinIdx ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            className="klein-arr"
            onClick={() => switchTo('klein', Math.min(KLEIN_ARTWORKS.length - 1, kleinIdx + 1))}
            disabled={kleinIdx === KLEIN_ARTWORKS.length - 1}
            aria-label="다음 작품"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      )}

      {hint && (
        <p className="pollock-hint">
          {mode === 'pollock' ? '클릭해서 물감을 튀겨보세요' : art.hint}
        </p>
      )}
    </div>
  )
}
