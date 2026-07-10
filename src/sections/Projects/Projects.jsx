import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import { projects } from '../../data/projects.js'
import './Projects.css'

export default function Projects() {
  const { t } = useLang()
  const sectionRef = useScrollReveal()
  const trackRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const detectActive = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let closest = 0
    let minDist = Infinity
    Array.from(track.children).forEach((el, i) => {
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
      if (d < minDist) { minDist = d; closest = i }
    })
    setActiveIdx(closest)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    detectActive()
    track.addEventListener('scroll', detectActive, { passive: true })
    return () => track.removeEventListener('scroll', detectActive)
  }, [detectActive])

  const scrollToIdx = useCallback((idx) => {
    const track = trackRef.current
    if (!track) return
    const slide = track.children[idx]
    if (!slide) return
    const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2
    track.scrollTo({ left, behavior: 'smooth' })
  }, [])

  const prev = () => scrollToIdx(Math.max(0, activeIdx - 1))
  const next = () => scrollToIdx(Math.min(projects.length - 1, activeIdx + 1))

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
  }

  return (
    <section className="projects section" id="projects" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <p className="section-label fade-up">{t.projects.label}</p>
          <h2 className="section-title fade-up delay-1">{t.projects.title}</h2>
          <p className="section-sub fade-up delay-2">{t.projects.sub}</p>
        </div>
      </div>

      <div className="gallery-wrap fade-up delay-3">
        {/* Edge fades */}
        <div className="gallery-fade gallery-fade-l" aria-hidden="true" />
        <div className="gallery-fade gallery-fade-r" aria-hidden="true" />

        {/* Nav arrows */}
        <button
          className="gallery-arrow gallery-arrow-prev"
          onClick={prev}
          disabled={activeIdx === 0}
          aria-label="Previous project"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          className="gallery-arrow gallery-arrow-next"
          onClick={next}
          disabled={activeIdx === projects.length - 1}
          aria-label="Next project"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Scrollable track */}
        <div
          ref={trackRef}
          className="gallery-track"
          role="region"
          aria-label={t.projects.title}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {projects.map((p, i) => (
            <div
              key={p.id}
              className={`gallery-slide ${i === activeIdx ? 'active' : ''}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${projects.length}: ${p.title}`}
              onClick={() => i !== activeIdx && scrollToIdx(i)}
            >
              <GalleryCard project={p} active={i === activeIdx} />
            </div>
          ))}
        </div>

        {/* Dot indicators */}
        <div className="gallery-dots" role="group" aria-label="Project navigation">
          {projects.map((p, i) => (
            <button
              key={p.id}
              className={`gallery-dot ${i === activeIdx ? 'active' : ''}`}
              onClick={() => scrollToIdx(i)}
              aria-label={p.title}
              aria-current={i === activeIdx ? 'true' : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

const DEMO_QUERY = '갤럭시 버즈'
const DEMO_ITEMS = [
  { id: 1, name: '갤럭시 버즈 프로', loc: '강남역 3번 출구', status: 'lost', match: true },
  { id: 2, name: '블루투스 이어폰', loc: '역삼동 카페', status: 'found', match: false },
]

function FindXPreview({ active }) {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    if (!active) {
      setQuery('')
      setPhase('idle')
      return
    }

    let cancelled = false
    const sleep = ms => new Promise(r => setTimeout(r, ms))

    async function cycle() {
      while (!cancelled) {
        setQuery('')
        setPhase('typing')
        for (let i = 1; i <= DEMO_QUERY.length; i++) {
          if (cancelled) return
          setQuery(DEMO_QUERY.slice(0, i))
          await sleep(120)
        }
        await sleep(400)
        if (cancelled) return
        setPhase('results')
        await sleep(800)
        if (cancelled) return
        setPhase('matched')
        await sleep(2500)
        if (cancelled) return
        setPhase('idle')
        await sleep(500)
      }
    }

    const t = setTimeout(() => { if (!cancelled) cycle() }, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [active])

  const showResults = phase === 'results' || phase === 'matched'
  const showMatch = phase === 'matched'

  return (
    <div className="findx-preview">
      <div className="findx-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span className="findx-query">
          {query || <span className="findx-placeholder">분실물을 검색하세요</span>}
          {phase === 'typing' && <span className="findx-cursor" />}
        </span>
      </div>

      <div className="findx-list">
        {DEMO_ITEMS.map((item, i) => (
          <div
            key={item.id}
            className={`findx-item${showResults ? ' in' : ''}${showMatch && item.match ? ' match' : ''}`}
            style={{ transitionDelay: showResults ? `${i * 0.12}s` : '0s' }}
          >
            <span className={`findx-tag ${item.status}`}>
              {item.status === 'lost' ? '분실' : '습득'}
            </span>
            <div className="findx-item-body">
              <span className="findx-item-name">{item.name}</span>
              <span className="findx-item-loc">{item.loc}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`findx-badge${showMatch ? ' in' : ''}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        1건 매칭됨
      </div>
    </div>
  )
}

const TAB_LABELS = { overview: '개요', stack: '기술스택', results: '성과' }

const CHART_CANDLES = [
  { h: 38, bodyH: 20, bodyTop: 10, dir: 'up' },
  { h: 26, bodyH: 14, bodyTop: 6,  dir: 'down' },
  { h: 46, bodyH: 26, bodyTop: 10, dir: 'up' },
  { h: 22, bodyH: 12, bodyTop: 5,  dir: 'down' },
  { h: 42, bodyH: 24, bodyTop: 9,  dir: 'up' },
]

function CandlePreview({ active }) {
  const [phase, setPhase] = useState('idle')
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (!active) { setPhase('idle'); setStreak(0); return }

    let cancelled = false
    const sleep = ms => new Promise(r => setTimeout(r, ms))

    async function run() {
      while (!cancelled) {
        setStreak(0)
        setPhase('chart')
        await sleep(1000)
        if (cancelled) return

        for (let i = 1; i <= 3; i++) {
          if (cancelled) return
          setPhase('predicting')
          await sleep(700)
          if (cancelled) return
          setPhase('hit')
          setStreak(i)
          await sleep(1200)
          if (cancelled) return
          if (i < 3) { setPhase('chart'); await sleep(600) }
          if (cancelled) return
        }

        setPhase('prize')
        await sleep(2200)
        if (cancelled) return
        setPhase('idle')
        await sleep(400)
      }
    }

    const t = setTimeout(() => { if (!cancelled) run() }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [active])

  const chartOn   = phase !== 'idle'
  const predictOn = phase === 'predicting' || phase === 'hit'
  const hitOn     = phase === 'hit'
  const prizeOn   = phase === 'prize'

  return (
    <div className="candle-preview">
      <div className="candle-chart">
        {CHART_CANDLES.map((c, i) => (
          <div
            key={i}
            className={`c-bar ${c.dir}${chartOn ? ' in' : ''}`}
            style={{ height: c.h, transitionDelay: `${i * 0.07}s` }}
          >
            <div className="c-wick" />
            <div className="c-body" style={{ height: c.bodyH, top: c.bodyTop }} />
          </div>
        ))}
        <div
          className={`c-bar up${chartOn ? ' in' : ''}${predictOn ? ' predicting' : ''}${hitOn ? ' confirmed' : ''}`}
          style={{ height: 50, transitionDelay: '0.35s' }}
        >
          <div className="c-wick" />
          <div className="c-body" style={{ height: 30, top: 10 }} />
        </div>
      </div>

      <div className={`candle-predict-row${predictOn ? ' in' : ''}`}>
        <span className="candle-label">AI 예측</span>
        <span className="candle-badge">↑ 상승</span>
      </div>

      <div className={`candle-result-row${hitOn ? ' in' : ''}`}>
        <div className="candle-hit">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          적중!
        </div>
        <div className="candle-streak">{streak}연승</div>
      </div>

      <div className={`candle-prize${prizeOn ? ' in' : ''}`}>
        <span>🏆</span>
        <span>10연승 달성 시 상금 지급</span>
      </div>
    </div>
  )
}

function GalleryCard({ project, active }) {
  const [tab, setTab] = useState('overview')
  const navigate = useNavigate()

  useEffect(() => {
    if (!active) setTab('overview')
  }, [active])

  const handleCardClick = () => {
    if (active && project.slug) {
      navigate(`/projects/${project.slug}`)
    }
  }

  const handlePointerMove = (e) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const xc = (x / rect.width) - 0.5
    const yc = (y / rect.height) - 0.5

    const rotateX = yc * -12 
    const rotateY = xc * 12  

    const px = (x / rect.width) * 100
    const py = (y / rect.height) * 100

    const bgx = 50 + xc * 40
    const bgy = 50 + yc * 40

    const angle = 120 + xc * 30

    card.style.setProperty('--rotate-x', `${rotateX}deg`)
    card.style.setProperty('--rotate-y', `${rotateY}deg`)
    card.style.setProperty('--mouse-x', `${px}%`)
    card.style.setProperty('--mouse-y', `${py}%`)
    card.style.setProperty('--bg-x', `${bgx}%`)
    card.style.setProperty('--bg-y', `${bgy}%`)
    card.style.setProperty('--glare-angle', `${angle}deg`)
    card.style.setProperty('--glare-opacity', '1')
    card.style.setProperty('--scale', '1.02')
  }

  const handlePointerLeave = (e) => {
    const card = e.currentTarget
    card.style.setProperty('--rotate-x', '0deg')
    card.style.setProperty('--rotate-y', '0deg')
    card.style.setProperty('--glare-opacity', '0')
    card.style.setProperty('--scale', '1')
  }

  const showTabs = active && project.tabs

  return (
    <article
      className={`gcard${active && project.slug ? ' gcard--clickable' : ''}`}
      style={{ '--card-accent': project.accent }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleCardClick}
    >
      <div className="gcard-preview">
        <div className="gcard-preview-chrome">
          <span className="gcard-dot-r" />
          <span className="gcard-dot-y" />
          <span className="gcard-dot-g" />
          <div className="gcard-url-bar" />
        </div>
        {project.type === 'findx' ? (
          <FindXPreview active={active} />
        ) : project.type === 'candle' ? (
          <CandlePreview active={active} />
        ) : (
          <div className="gcard-preview-body">
            <div className="gcard-mock-nav">
              <div className="gcard-mock-logo" />
              <div className="gcard-mock-links">
                <span /><span /><span />
              </div>
            </div>
            <div className="gcard-mock-hero">
              <div className="gcard-mock-h1" />
              <div className="gcard-mock-h1 short" />
              <div className="gcard-mock-p" />
              <div className="gcard-mock-p short" />
              <div className="gcard-mock-btn" />
            </div>
            <div className="gcard-mock-grid">
              <div /><div /><div />
            </div>
          </div>
        )}
        <div className="gcard-preview-glow" aria-hidden="true" />
      </div>

      <div className="gcard-info">
        <div className="gcard-head">
          <span className="gcard-category">{project.category}</span>
          <div className="gcard-links">
            <a href={project.github} target="_blank" rel="noreferrer" aria-label={`${project.title} GitHub`} onClick={(e) => e.stopPropagation()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a href={project.link} target="_blank" rel="noreferrer" aria-label={`${project.title} live demo`} onClick={(e) => e.stopPropagation()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        <h3 className="gcard-title">{project.title}</h3>

        {showTabs ? (
          <>
            <div className="gcard-tabs" role="tablist">
              {Object.keys(TAB_LABELS).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  className={`gcard-tab ${tab === key ? 'active' : ''}`}
                  onClick={() => setTab(key)}
                >
                  {TAB_LABELS[key]}
                </button>
              ))}
            </div>
            <div className="gcard-tab-panel" role="tabpanel">
              {tab === 'stack' ? (
                <ul className="gcard-tags" aria-label="Technologies">
                  {project.tabs.stack.map((t) => (
                    <li key={t} className="tag">{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="gcard-desc">{project.tabs[tab]}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="gcard-desc">{project.desc}</p>
            <ul className="gcard-tags" aria-label="Technologies">
              {project.tags.map((tag) => (
                <li key={tag} className="tag">{tag}</li>
              ))}
            </ul>
          </>
        )}

        {active && project.slug && (
          <button className="gcard-detail-btn" onClick={handleCardClick}>
            자세히 보기
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        )}
      </div>
    </article>
  )
}
