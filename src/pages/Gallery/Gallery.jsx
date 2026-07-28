import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { experiments } from '../../experiments/index.js'
import { useLang } from '../../context/LangContext'
import SkyCanvas from './SkyCanvas.jsx'
import useLookAround from './useLookAround.js'
import { activeIndex, panelAngle, panelGeometry, yawForIndex } from './ring.js'
import { computeDescent, landedState } from './descent.js'
import './Gallery.css'

const ARRIVED_HOLD_MS = 1800

function useViewport() {
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setVw(window.innerWidth)
    window.addEventListener('resize', fn, { passive: true })
    return () => window.removeEventListener('resize', fn)
  }, [])
  return vw
}

export default function Gallery() {
  const { t } = useLang()
  const navigate = useNavigate()
  const n = experiments.length
  const vw = useViewport()
  const geo = useMemo(() => panelGeometry(vw, n), [vw, n])

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const [landed, setLanded] = useState(reducedMotion)
  const [showArrived, setShowArrived] = useState(false)
  const [active, setActive] = useState(0)

  const skyRef = useRef(null)
  const ringRef = useRef(null)
  const stageRef = useRef(null)

  const look = useLookAround(n, { enabled: landed, reducedMotion })
  const { orientationRef, tick } = look

  // 하강 + 시선을 한 프레임 안에서 함께 갱신한다. 배경과 패널이 서로 다른
  // 루프에 있으면 빠른 회전에서 어긋나 보인다.
  useEffect(() => {
    let raf
    let last = performance.now()
    const start = performance.now()
    let landedFired = false

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dtSec = Math.min(0.05, (now - last) / 1000)
      last = now

      const d = reducedMotion ? landedState() : computeDescent(now - start)
      if (d.done && !landedFired) {
        landedFired = true
        setLanded(true)
        setShowArrived(true)
      }

      tick(dtSec)
      const o = orientationRef.current

      // 착지 전에는 회전 입력이 잠겨 있으므로 흔들림만 얹는다.
      const shakeX = d.shake ? (Math.random() - 0.5) * d.shake * 1.6 : 0
      const shakeY = d.shake ? (Math.random() - 0.5) * d.shake * 1.6 : 0

      skyRef.current?.setUniforms({
        timeSec: (now - start) / 1000,
        yawDeg: o.yaw + shakeX,
        pitchDeg: o.pitch + shakeY,
        altitude: d.altitude,
        velocity: d.velocity,
        fovDeg: d.fovDeg,
        plasma: d.plasma,
      })
      skyRef.current?.render()

      // 링은 회전만 한다. 패널이 translateZ(-radius)로 이미 물러나 있고
      // .lab-scene의 perspective가 원근을 만든다 — 여기서 translateZ를 더하면
      // 패널이 원근 평면 앞으로 튀어나와 배율이 뒤집힌다.
      const ring = ringRef.current
      if (ring) {
        ring.style.transform =
          `rotateX(${(o.pitch + shakeY).toFixed(3)}deg) rotateY(${(-o.yaw).toFixed(3)}deg)`
        ring.style.opacity = String(d.panelReveal)
      }

      const next = activeIndex(n, o.yaw)
      setActive((prev) => (prev === next ? prev : next))
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [n, reducedMotion, tick, orientationRef])

  // 착지 문구는 잠깐 떴다 사라진다. 문구를 띄우는 쪽은 하강 루프의
  // landedFired 분기가 맡고, 여기서는 사라지는 타이머만 소유한다.
  useEffect(() => {
    if (!landed) return
    const id = setTimeout(() => setShowArrived(false), ARRIVED_HOLD_MS)
    return () => clearTimeout(id)
  }, [landed])

  const openPanel = useCallback((idx) => {
    navigate(`/gallery/${experiments[idx].id}`)
  }, [navigate])

  // 선택은 패널의 onClick이 아니라 씬의 pointerup에서 위임 처리한다.
  // onPointerDown에서 setPointerCapture를 걸기 때문에 이후 포인터 이벤트가
  // 씬으로 향하고, 자식 패널의 click이 오지 않을 수 있다 — 기존 캐러셀도
  // 같은 이유로 pointerup + closest()를 썼다.
  //
  // 정면 패널만 진입시킨다. 옆 패널을 누르면 그쪽으로 돌기만 한다 — 실수로
  // 작품이 열리지 않게 하려는 의도적인 동작이다.
  const onScenePointerUp = useCallback((e) => {
    look.handlers.onPointerUp(e)
    if (!landed || look.wasDrag()) return
    const el = e.target?.closest?.('.carousel-card')
    if (!el) return
    const idx = Number(el.dataset.idx)
    if (Number.isNaN(idx)) return
    if (idx === active) openPanel(idx)
    else look.snapToYaw(yawForIndex(orientationRef.current.yaw, n, idx))
  }, [landed, active, look, openPanel, orientationRef, n])

  const onKeyDown = useCallback((e) => {
    if (!landed) return
    if (e.key === 'ArrowRight') { e.preventDefault(); look.stepBy(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); look.stepBy(-1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); look.nudgePitch(-4) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); look.nudgePitch(4) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(active) }
  }, [landed, look, active, openPanel])

  return (
    <section className="gallery-page">
      <SkyCanvas ref={skyRef} />

      <div className="lab-stage" ref={stageRef} data-landed={landed ? 'true' : 'false'}>
        <div className="gallery-header">
          <span className="gallery-eyebrow">{t.lab.eyebrow}</span>
          <h1 className="gallery-title">{t.lab.title}</h1>
          <p className="gallery-desc">{landed ? t.lab.hint : t.lab.descending}</p>
        </div>

        <div
          className="lab-scene"
          style={{ perspective: `${geo.perspective}px` }}
          tabIndex={0}
          role="listbox"
          aria-label={t.lab.title}
          onKeyDown={onKeyDown}
          {...look.handlers}
          onPointerUp={onScenePointerUp}
        >
          <div className="lab-ring" ref={ringRef} style={{ opacity: 0 }}>
            {experiments.map((exp, i) => {
              const hasRing = exp.planet === 'saturn' || exp.planet === 'uranus'
              return (
                <div
                  key={exp.id}
                  data-idx={i}
                  data-id={exp.id}
                  role="option"
                  aria-selected={i === active}
                  className={`carousel-card planet-${exp.planet}${i === active ? ' active' : ''}`}
                  style={{
                    width: `${geo.width}px`,
                    height: `${geo.height}px`,
                    marginLeft: `${-geo.width / 2}px`,
                    marginTop: `${-geo.height / 2}px`,
                    transform: `rotateY(${panelAngle(i, n)}deg) translateZ(${-geo.radius}px)`,
                    '--exp-color': exp.color,
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
            <button className="carousel-arrow" onClick={() => look.stepBy(-1)} aria-label={t.lab.prev}>←</button>
            <div className="carousel-info">
              <span className="carousel-active-num">{String(active + 1).padStart(2, '0')}</span>
              <span className="carousel-slash">/</span>
              <span className="carousel-total">{String(n).padStart(2, '0')}</span>
            </div>
            <button className="carousel-arrow" onClick={() => look.stepBy(1)} aria-label={t.lab.next}>→</button>
          </div>
          <div className="carousel-progress">
            <span style={{ width: `${((active + 1) / n) * 100}%` }} />
          </div>
        </div>
      </div>

      {showArrived && <p className="lab-arrived">{t.lab.arrived}</p>}
    </section>
  )
}
