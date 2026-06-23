import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { experiments } from '../../experiments/index.js'
import './Gallery.css'

function useViewport() {
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setVw(window.innerWidth)
    window.addEventListener('resize', fn, { passive: true })
    return () => window.removeEventListener('resize', fn)
  }, [])
  return vw
}

// 미술관 전시 벽: 크고 넓은 작품 패널이 좌우로 늘어선 코버플로우
function getLayout(vw) {
  if (vw < 480) return { cardW: Math.round(vw * 0.8),  lean: 26, depth: 110, spacingK: 0.78 }
  if (vw < 768) return { cardW: Math.round(vw * 0.68), lean: 28, depth: 150, spacingK: 0.68 }
  return { cardW: Math.min(Math.round(vw * 0.5), 700), lean: 30, depth: 190, spacingK: 0.6 }
}

export default function Gallery() {
  const n = experiments.length
  const vw = useViewport()
  const { cardW, lean, depth, spacingK } = getLayout(vw)
  const cardH = Math.round(cardW * 0.58)
  const spacing = cardW * spacingK

  const navigate = useNavigate()
  const posRef = useRef(0)
  const [pos, setPos] = useState(0)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 })
  const dragRef = useRef({ active: false, startX: 0, startPos: 0 })
  const rafRef = useRef(null)
  const snapTimerRef = useRef(null)
  const hoverRef = useRef(false)
  const lastInteractRef = useRef(0)

  const mod = (v) => ((v % n) + n) % n
  const activeIdx = mod(Math.round(pos))

  // 유휴 시 전시장을 천천히 거니는 자동 이동
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let id
    const loop = () => {
      id = requestAnimationFrame(loop)
      if (document.hidden || dragRef.current.active || hoverRef.current) return
      if (performance.now() - lastInteractRef.current < 3000) return
      posRef.current += 0.0016
      setPos(posRef.current)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  const snapTo = (target) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const tick = () => {
      const diff = target - posRef.current
      if (Math.abs(diff) < 0.002) {
        posRef.current = target
        setPos(target)
        return
      }
      posRef.current += diff * 0.13
      setPos(posRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const scheduleSnap = () => {
    clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      snapTo(Math.round(posRef.current))
    }, 80)
  }

  const signedOffset = (i, p) => {
    let off = ((i - p) % n + n) % n
    if (off > n / 2) off -= n
    return off
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    clearTimeout(snapTimerRef.current)
    lastInteractRef.current = performance.now()
    dragRef.current = { active: true, startX: e.clientX, startPos: posRef.current, moved: false }
  }

  const onPointerMove = (e) => {
    lastInteractRef.current = performance.now()
    const rect = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width - 0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ rx: -ny * 7, ry: nx * 9 })

    const activeCardEl = e.currentTarget.querySelector('.carousel-card.active')
    if (activeCardEl) {
      const cardRect = activeCardEl.getBoundingClientRect()
      const x = e.clientX - cardRect.left
      const y = e.clientY - cardRect.top

      const xc = (x / cardRect.width) - 0.5
      const yc = (y / cardRect.height) - 0.5

      const px = (x / cardRect.width) * 100
      const py = (y / cardRect.height) * 100

      const bgx = 50 + xc * 40
      const bgy = 50 + yc * 40

      const angle = 120 + xc * 30

      activeCardEl.style.setProperty('--mouse-x', `${px}%`)
      activeCardEl.style.setProperty('--mouse-y', `${py}%`)
      activeCardEl.style.setProperty('--bg-x', `${bgx}%`)
      activeCardEl.style.setProperty('--bg-y', `${bgy}%`)
      activeCardEl.style.setProperty('--glare-angle', `${angle}deg`)
      activeCardEl.style.setProperty('--glare-opacity', '1')
    }

    if (!dragRef.current.active) return
    const delta = e.clientX - dragRef.current.startX
    if (Math.abs(delta) > 6) dragRef.current.moved = true
    posRef.current = dragRef.current.startPos - delta / spacing
    setPos(posRef.current)
  }

  const onPointerUp = (e) => {
    if (!dragRef.current.active) return
    lastInteractRef.current = performance.now()
    const { moved } = dragRef.current
    dragRef.current.active = false
    if (!moved) {
      const cardEl = e.target?.closest?.('.carousel-card')
      if (cardEl) {
        const i = +cardEl.dataset.idx
        const off = signedOffset(i, posRef.current)
        if (Math.abs(off) < 0.5) navigate(`/gallery/${experiments[activeIdx].id}`)
        else snapTo(Math.round(posRef.current + off))
      }
      return
    }
    scheduleSnap()
  }

  const onWheel = (e) => {
    e.preventDefault()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    lastInteractRef.current = performance.now()
    posRef.current += (e.deltaX + e.deltaY) * 0.0024
    setPos(posRef.current)
    scheduleSnap()
  }

  const rotate = (dir) => {
    lastInteractRef.current = performance.now()
    snapTo(Math.round(posRef.current) + dir)
  }

  return (
    <section className="gallery-page">
      <div className="gallery-header">
        <span className="gallery-eyebrow">interactive lab — exhibition</span>
        <h1 className="gallery-title">Experiments</h1>
        <p className="gallery-desc">드래그하거나 스크롤하며 전시장을 거닐어보세요</p>
      </div>

      <div
        className="carousel-scene"
        style={{ perspective: '1500px' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerEnter={() => { hoverRef.current = true }}
        onPointerLeave={(e) => {
          hoverRef.current = false
          setTilt({ rx: 0, ry: 0 })
          const activeCardEl = e.currentTarget.querySelector('.carousel-card.active')
          if (activeCardEl) {
            activeCardEl.style.setProperty('--glare-opacity', '0')
          }
          onPointerUp(e)
        }}
        onWheel={onWheel}
      >
        <div
          className="carousel-track"
          style={{ width: `${cardW}px`, height: `${cardH}px` }}
        >
          {experiments.map((exp, i) => {
            const off = signedOffset(i, pos)
            const a = Math.abs(off)
            const isFront = a < 0.5
            const hasRing = exp.planet === 'saturn' || exp.planet === 'uranus'
            const hidden = a > 3.2

            return (
              <div
                key={exp.id}
                data-idx={i}
                className={`carousel-card planet-${exp.planet}${isFront ? ' active' : ''}`}
                style={{
                  width: `${cardW}px`,
                  height: `${cardH}px`,
                  transform:
                    `translateX(${(off * spacing).toFixed(2)}px)` +
                    ` translateZ(${(-Math.min(a, 2.8) * depth).toFixed(2)}px)` +
                    ` rotateY(${(-Math.max(-1.6, Math.min(1.6, off)) * lean).toFixed(2)}deg)` +
                    (isFront ? ` rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` : ''),
                  opacity: hidden ? 0 : 1 - Math.max(0, a - 0.5) * 0.2,
                  zIndex: 100 - Math.round(a * 10),
                  pointerEvents: hidden ? 'none' : 'auto',
                  '--exp-color': exp.color,
                  cursor: isFront ? 'pointer' : 'grab',
                }}
              >
                <div className="card-bg" />
                <div className="card-glow" />
                <div className="planet-surface">
                  {exp.planet === 'jupiter'  && <div className="planet-spot" />}
                  {exp.planet === 'earth'    && <div className="planet-land" />}
                  {exp.planet === 'neptune'  && <div className="planet-dark-spot" />}
                  {(exp.planet === 'mercury' || exp.planet === 'moon') && <div className="planet-craters" />}
                  {exp.planet === 'mars'     && <div className="planet-polar-cap" />}
                  {exp.planet === 'sun'      && <div className="planet-corona" />}
                  {exp.planet === 'moon'     && <div className="planet-moon-shadow" />}
                </div>
                {hasRing && <div className="planet-ring" />}
                <div className="exhibit-meta">
                  <span className="exhibit-num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="exhibit-text">
                    <span className="exhibit-title">{exp.title}</span>
                    <span className="exhibit-tags">{exp.tags.slice(0, 2).join(' · ')}</span>
                  </div>
                </div>
                <div className="card-symbol">
                  <span className="card-symbol-glyph">{exp.symbol}</span>
                </div>
                <div className="card-dim" />
              </div>
            )
          })}
        </div>
      </div>

      <div className="carousel-cta">
        <div className="carousel-nav">
          <button className="carousel-arrow" onClick={() => rotate(-1)} aria-label="Previous">←</button>
          <div className="carousel-info">
            <span className="carousel-active-num">{String(activeIdx + 1).padStart(2, '0')}</span>
            <span className="carousel-slash">/</span>
            <span className="carousel-total">{String(n).padStart(2, '0')}</span>
          </div>
          <button className="carousel-arrow" onClick={() => rotate(1)} aria-label="Next">→</button>
        </div>
        <div className="carousel-progress">
          <span style={{ width: `${((activeIdx + 1) / n) * 100}%` }} />
        </div>
        <button
          className="carousel-open-btn"
          onClick={() => navigate(`/gallery/${experiments[activeIdx].id}`)}
        >
          Open — {experiments[activeIdx].title}
        </button>
      </div>
    </section>
  )
}
