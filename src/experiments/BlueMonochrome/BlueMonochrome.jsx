import { useEffect, useRef, useState, useCallback } from 'react'
import './BlueMonochrome.css'

function rnd(a, b) { return a + Math.random() * (b - a) }

const ARTWORKS = [
  {
    id: 'ikb79', title: 'IKB 79', year: '1959',
    hint: '마우스를 움직여 빛의 깊이를 탐색하세요',
  },
  {
    id: 'ant82', title: 'ANT 82', year: '1960',
    hint: '클릭해서 인체의 흔적을 남겨보세요',
  },
  {
    id: 're20', title: 'RE 20', year: '1961',
    hint: '마우스로 스펀지의 질감을 느껴보세요',
  },
  {
    id: 'rp4', title: 'RP 4', year: '1961',
    hint: '클릭해서 빛의 반사를 만들어보세요',
  },
]

/* ── Render functions ── */

function renderIKB79(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.45, H * 0.38, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75)
  g.addColorStop(0, '#1a4db8')
  g.addColorStop(0.5, '#002FA7')
  g.addColorStop(1, '#001260')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Fine paint grain
  ctx.save()
  ctx.globalAlpha = 0.022
  for (let i = 0; i < 14000; i++) {
    const v = rnd(80, 255)
    ctx.fillStyle = `rgb(${(v * 0.3) | 0},${(v * 0.55) | 0},${v | 0})`
    ctx.fillRect(rnd(0, W), rnd(0, H), 1.2, 1.2)
  }
  ctx.restore()

  // Vignette
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.18, W * 0.5, H * 0.5, H * 0.88)
  vg.addColorStop(0, 'transparent')
  vg.addColorStop(1, 'rgba(0,0,28,0.58)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)
}

function renderANT82(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.4, H * 0.35, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8)
  g.addColorStop(0, '#1a52c8')
  g.addColorStop(0.6, '#0033b8')
  g.addColorStop(1, '#001370')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const sc = H / 700

  // Gestural brush strokes
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = '#000e42'
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = rnd(6, 28)
    ctx.lineCap = 'round'
    ctx.beginPath()
    const x = rnd(W * 0.08, W * 0.92)
    const y = rnd(H * 0.12, H * 0.88)
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(
      x + rnd(-70, 70), y + rnd(-25, 25),
      x + rnd(-70, 70), y + rnd(-25, 25),
      x + rnd(-110, 110), y + rnd(10, 90),
    )
    ctx.stroke()
  }
  ctx.restore()

  // Body impressions
  function impression(cx, cy) {
    ctx.save()
    ctx.fillStyle = '#000d3e'
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.ellipse(cx + rnd(-6, 6) * sc, cy - 82 * sc, 23 * sc, 28 * sc, rnd(-0.15, 0.15), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.64
    ctx.beginPath()
    ctx.ellipse(cx, cy + 15 * sc, 40 * sc, 68 * sc, rnd(-0.1, 0.1), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = '#000e42'
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      ctx.lineWidth = rnd(2.5, 6) * sc
      ctx.beginPath()
      const sx = cx + rnd(-40, 40) * sc
      const sy = cy + rnd(30, 70) * sc
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + rnd(-6, 6) * sc, sy + rnd(35, 110) * sc)
      ctx.stroke()
    }
    ctx.restore()
  }

  impression(W * 0.32, H * 0.52)
  impression(W * 0.65, H * 0.50)
}

function renderRE20(ctx, W, H) {
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
  bg.addColorStop(0, '#001a60')
  bg.addColorStop(1, '#000830')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  for (let i = 0; i < 34; i++) {
    const x = rnd(W * 0.04, W * 0.96)
    const y = rnd(H * 0.04, H * 0.96)
    const r = rnd(14, 88)

    // Drop shadow
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#000020'
    ctx.beginPath()
    ctx.ellipse(x + r * 0.22, y + r * 0.28, r * 0.88, r * 0.82, 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Sponge body
    const sg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.08, x, y, r)
    sg.addColorStop(0, '#3a7ad4')
    sg.addColorStop(0.45, '#002FA7')
    sg.addColorStop(0.82, '#001878')
    sg.addColorStop(1, '#000d50')
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    // Specular highlight
    ctx.save()
    ctx.globalAlpha = 0.22
    const hg = ctx.createRadialGradient(x - r * 0.38, y - r * 0.38, 0, x - r * 0.2, y - r * 0.2, r * 0.55)
    hg.addColorStop(0, 'rgba(210,228,255,1)')
    hg.addColorStop(1, 'transparent')
    ctx.fillStyle = hg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Pores
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = 'rgba(0,5,40,0.9)'
    for (let j = 0; j < 10; j++) {
      ctx.beginPath()
      ctx.arc(x + rnd(-r * 0.7, r * 0.7), y + rnd(-r * 0.7, r * 0.7), rnd(1.5, 5.5), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // Center glow
  const cg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.min(W, H) * 0.45)
  cg.addColorStop(0, 'rgba(20,70,190,0.22)')
  cg.addColorStop(1, 'transparent')
  ctx.fillStyle = cg
  ctx.fillRect(0, 0, W, H)
}

function renderRP4(ctx, W, H) {
  ctx.fillStyle = '#000d3a'
  ctx.fillRect(0, 0, W, H)

  const margin = Math.min(W, H) * 0.07
  const cols = 7, rows = 5
  const cw = (W - margin * 2) / cols
  const ch = (H - margin * 2) / rows
  const gap = 5

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + col * cw
      const y = margin + row * ch
      const w = cw - gap
      const h = ch - gap
      const d = 0.25 + rnd(0, 0.75)

      // Drop shadow
      ctx.fillStyle = `rgba(0,5,30,${d * 0.55})`
      ctx.fillRect(x + 5, y + 5, w, h)

      // Face gradient (top-left lit)
      const fg = ctx.createLinearGradient(x, y, x + w * 0.7, y + h * 0.7)
      fg.addColorStop(0, `rgba(${(40 + d * 55) | 0},${(95 + d * 75) | 0},240,${0.7 + d * 0.3})`)
      fg.addColorStop(1, `rgba(0,${(25 + d * 28) | 0},${(125 + d * 40) | 0},${0.85 + d * 0.15})`)
      ctx.fillStyle = fg
      ctx.fillRect(x, y, w, h)

      // Top/left highlight
      ctx.fillStyle = `rgba(110,165,255,${d * 0.38})`
      ctx.fillRect(x, y, w, 2)
      ctx.fillRect(x, y, 2, h)

      // Bottom/right shadow
      ctx.fillStyle = `rgba(0,0,28,${d * 0.55})`
      ctx.fillRect(x, y + h - 2, w, 2)
      ctx.fillRect(x + w - 2, y, 2, h)
    }
  }

  // Vignette
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.22, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
  vg.addColorStop(0, 'transparent')
  vg.addColorStop(1, 'rgba(0,0,22,0.7)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)
}

const RENDERS = [renderIKB79, renderANT82, renderRE20, renderRP4]

/* ── Component ── */

export default function BlueMonochrome() {
  const baseRef = useRef(null)
  const overlayRef = useRef(null)
  const ripplesRef = useRef([])
  const rafRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [hint, setHint] = useState(true)

  const art = ARTWORKS[activeIdx]

  // Canvas setup
  const setup = useCallback((idx) => {
    const base = baseRef.current
    const overlay = overlayRef.current
    if (!base || !overlay) return
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth
    const H = window.innerHeight

    ;[base, overlay].forEach((c) => {
      c.width = W * dpr
      c.height = H * dpr
      c.style.width = `${W}px`
      c.style.height = `${H}px`
    })

    const ctx = base.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    RENDERS[idx](ctx, W, H)

    const octx = overlay.getContext('2d')
    octx.setTransform(dpr, 0, 0, dpr, 0, 0)
    octx.clearRect(0, 0, W, H)
  }, [])

  useEffect(() => {
    ripplesRef.current = []
    setHint(true)
    setup(activeIdx)

    const onResize = () => setup(activeIdx)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeIdx, setup])

  // Auto-hide hint
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 3500)
    return () => clearTimeout(t)
  }, [activeIdx])

  // Ripple animation loop
  useEffect(() => {
    let alive = true

    const tick = () => {
      if (!alive) return
      const overlay = overlayRef.current
      if (!overlay) { rafRef.current = requestAnimationFrame(tick); return }

      const dpr = window.devicePixelRatio || 1
      const W = overlay.width / dpr
      const H = overlay.height / dpr
      const ctx = overlay.getContext('2d')

      ctx.clearRect(0, 0, W, H)

      ripplesRef.current = ripplesRef.current.filter((r) => r.a > 0.006)
      for (const r of ripplesRef.current) {
        const rg = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.r)
        rg.addColorStop(0, `rgba(140,190,255,${r.a})`)
        rg.addColorStop(0.4, `rgba(70,140,240,${r.a * 0.42})`)
        rg.addColorStop(1, 'transparent')
        ctx.fillStyle = rg
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
        ctx.fill()
        r.r += 3.5
        r.a *= 0.952
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // Interaction handlers
  const onMouseMove = useCallback((e) => {
    if (Math.random() < 0.1) {
      ripplesRef.current.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.38 })
    }
  }, [])

  const onTouchMove = useCallback((e) => {
    const touch = e.touches[0]
    if (Math.random() < 0.18) {
      ripplesRef.current.push({ x: touch.clientX, y: touch.clientY, r: 8, a: 0.35 })
    }
  }, [])

  const onClick = useCallback((e) => {
    setHint(false)
    ripplesRef.current.push({ x: e.clientX, y: e.clientY, r: 14, a: 0.78 })

    // ANT 82: click leaves a persistent body-print impression
    if (activeIdx === 1) {
      const base = baseRef.current
      const ctx = base.getContext('2d')
      const sc = window.innerHeight / 700
      ctx.save()
      ctx.fillStyle = '#000d3e'
      ctx.globalAlpha = 0.48
      ctx.beginPath()
      ctx.ellipse(e.clientX, e.clientY, rnd(18, 36) * sc, rnd(28, 56) * sc, rnd(-0.3, 0.3), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#000e42'
      ctx.lineWidth = rnd(2, 5) * sc
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.33
      ctx.beginPath()
      ctx.moveTo(e.clientX, e.clientY + 14 * sc)
      ctx.lineTo(e.clientX + rnd(-5, 5) * sc, e.clientY + 14 * sc + rnd(32, 85) * sc)
      ctx.stroke()
      ctx.restore()
    }
  }, [activeIdx])

  const prev = () => setActiveIdx((i) => Math.max(0, i - 1))
  const next = () => setActiveIdx((i) => Math.min(ARTWORKS.length - 1, i + 1))

  return (
    <div className="klein-wrap">
      <canvas ref={baseRef} className="klein-canvas klein-base" aria-hidden="true" />
      <canvas
        ref={overlayRef}
        className="klein-canvas klein-overlay"
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onClick={onClick}
        style={{ touchAction: 'none' }}
        role="img"
        aria-label={`${art.title} — Yves Klein, ${art.year}`}
      />

      <div className="klein-ui">
        <button
          className="klein-arrow"
          onClick={prev}
          disabled={activeIdx === 0}
          aria-label="이전 작품"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="klein-center">
          <div className="klein-info">
            <span className="klein-title">{art.title}</span>
            <span className="klein-artist">Yves Klein · {art.year}</span>
          </div>
          <div className="klein-dots" role="group" aria-label="작품 선택">
            {ARTWORKS.map((a, i) => (
              <button
                key={a.id}
                className={`klein-dot${i === activeIdx ? ' active' : ''}`}
                onClick={() => setActiveIdx(i)}
                aria-label={a.title}
                aria-current={i === activeIdx ? 'true' : undefined}
              />
            ))}
          </div>
        </div>

        <button
          className="klein-arrow"
          onClick={next}
          disabled={activeIdx === ARTWORKS.length - 1}
          aria-label="다음 작품"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {hint && (
        <p className="klein-hint" aria-live="polite">{art.hint}</p>
      )}
    </div>
  )
}
