import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { STOPS, coordinates, stopProgress } from './journey.js'
import { createJourneyScene } from './scene.js'
import './EarthJourney.css'

const INITIAL = { progress: 0, index: 0, phase: 'orbit', height: 10500000, lat: 24, lon: -15, tiles: 'loading', attribution: '', visibleTiles: 0 }

function GlobeIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13" /><ellipse cx="16" cy="16" rx="6" ry="13" /><path d="M3 16h26M5 9h22M5 23h22" /></svg>
}

export default function EarthJourney() {
  const { lang, setLang } = useLang()
  const ko = lang === 'ko'
  const scrollRef = useRef(null)
  const mountRef = useRef(null)
  const apiRef = useRef(null)
  const [ui, setUi] = useState(INITIAL)
  const [inspect, setInspect] = useState(false)
  const [failure, setFailure] = useState(false)
  const [revision, setRevision] = useState(0)
  const [calm, setCalm] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const settingsRef = useRef({ calm })
  const stop = STOPS[ui.index]
  const intro = ui.phase === 'orbit'
  const arrived = ui.phase === 'arrived' && ui.tiles === 'ready' && ui.height < 10000
  const offline = ui.tiles === 'unavailable'
  const text = (kr, en) => ko ? kr : en

  useEffect(() => { settingsRef.current.calm = calm }, [calm])

  useEffect(() => {
    let scene
    try {
      scene = createJourneyScene(mountRef.current, scrollRef.current, settingsRef.current, setUi, () => setFailure(true))
      apiRef.current = scene
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => { scene?.dispose(); apiRef.current = null }
  }, [revision])

  const travelTo = (progress) => {
    setInspect(false)
    apiRef.current?.inspect(false)
    const scroller = scrollRef.current
    scroller.scrollTo({ top: (scroller.scrollHeight - scroller.clientHeight) * progress / STOPS.length, behavior: calm ? 'instant' : 'smooth' })
  }

  const toggleInspect = () => {
    const next = !inspect
    setInspect(next)
    apiRef.current?.inspect(next)
  }

  const retry = () => {
    setFailure(false)
    setInspect(false)
    setUi(INITIAL)
    setRevision((value) => value + 1)
  }

  return (
    <div className={`ej-scroll${inspect ? ' ej-inspecting' : ''}${calm ? ' ej-calm' : ''}`} ref={scrollRef}
      tabIndex={0} aria-label={text('스크롤로 지구 여행', 'Scroll to explore Earth')} data-lenis-prevent>
      <div className="ej-track">
        <main className="ej-stage" data-phase={ui.phase === 'arrived' && !arrived ? 'approach' : ui.phase} data-destination={intro ? 'earth' : stop.id}
          data-visible-tiles={ui.visibleTiles} data-tiles={ui.tiles}>
          <div className="ej-canvas" ref={mountRef} aria-label={text('지구와 랜드마크의 3D 지도', '3D map of Earth and its landmarks')} />
          <div className="ej-vignette" />

          <header className="ej-header">
            <a className="ej-wordmark" href="#earth" onClick={(event) => { event.preventDefault(); travelTo(0) }} aria-label={text('Terra 처음으로', 'Terra home')}><GlobeIcon /><span>TERRA<span className="ej-wordmark-dot">.</span></span></a>
            <span className="ej-edition">A JOURNEY THROUGH OUR WORLD <span>— VOL. 001</span></span>
            <div className="ej-header-actions">
              <button type="button" onClick={() => setLang(ko ? 'en' : 'ko')} aria-label={text('영어로 보기', 'Switch to Korean')}>{ko ? 'EN' : 'KO'}</button>
              <button className="ej-motion" type="button" aria-pressed={calm} onClick={() => setCalm(!calm)} title={text('이동 효과 줄이기', 'Reduce motion')}>{calm ? '◉' : '◎'}<span>{text('모션', 'Motion')}</span></button>
            </div>
          </header>

          <div className="ej-coordinates"><span className="ej-live-dot" />{intro ? 'SOL SYSTEM / PLANET 03' : coordinates(ui.lat, ui.lon)}</div>

          <section className={`ej-story ${intro ? 'ej-story-intro' : 'ej-story-stop'}`} aria-live="polite" aria-atomic="true">
            <p className="ej-eyebrow">{intro ? 'AN INTERACTIVE EARTH EXPERIENCE' : `${String(ui.index + 1).padStart(2, '0')} / ${stop.country}`}</p>
            <h1 key={intro ? 'earth' : stop.id}>{intro ? <>One planet.<br /><em>Endless wonder.</em></> : <>{ko ? stop.ko : stop.name}<span className="ej-place-city">{stop.city}</span></>}</h1>
            <p className="ej-description">{intro
              ? text('우주에서 바라본 푸른 행성, 그리고 그 위에 남겨진 우리의 이야기. 스크롤을 따라 세상의 경이로운 장소로 떠나보세요.', 'A pale blue world. A thousand human stories. Drift from orbit to extraordinary places, one scroll at a time.')
              : ko ? stop.textKo : stop.text}</p>
            {intro ? <button className="ej-begin" type="button" onClick={() => travelTo(stopProgress(0))}>{text('여행 시작하기', 'Begin the journey')}<span>↘</span></button>
              : <div className="ej-place-details"><div><span>{text('완공', 'COMPLETED')}</span><strong>{stop.year}</strong></div><div><span>{text('장소의 이야기', 'FIELD NOTES')}</span><strong>{ko ? stop.detailKo : stop.detail}</strong></div></div>}
          </section>

          <aside className="ej-altimeter" aria-label={text('현재 고도', 'Current altitude')}>
            <span>ALTITUDE</span><strong>{ui.height >= 10000 ? `${Math.round(ui.height / 1000).toLocaleString()} km` : `${Math.round(ui.height).toLocaleString()} m`}</strong>
            <div className="ej-altimeter-rule" /><span>{intro ? 'LOWER TO DISCOVER' : arrived ? 'A CLOSER PERSPECTIVE' : 'IN TRANSIT'}</span>
          </aside>

          {!intro && <div className="ej-explore">
            <span className="ej-travel-status"><span className="ej-live-dot" />{inspect ? text('드래그로 회전 · 스크롤로 확대', 'Drag to orbit · scroll to zoom') : arrived ? text('도착했습니다', 'You have arrived') : offline ? text('지구본으로 위치 안내 중', 'Showing the location on Earth') : ui.tiles === 'loading' ? text('지도를 준비하며 이동 중', 'Travelling while the map loads') : text('다음 풍경으로 비행 중', 'Flying to your next perspective')}</span>
            {arrived && !failure && <button type="button" onClick={toggleInspect} aria-pressed={inspect}>{inspect ? text('스크롤 여행으로 복귀', 'Return to the journey') : text('이곳 둘러보기', 'Explore this place')}<span>{inspect ? '↙' : '↗'}</span></button>}
          </div>}

          <footer className="ej-footer">
            <div className="ej-footer-top"><span>{text('여행의 경로', 'THE ITINERARY')}</span><span>{String(intro ? 0 : ui.index + 1).padStart(2, '0')} <i>/</i> 05</span></div>
            <nav className="ej-itinerary" aria-label={text('랜드마크 이동', 'Landmark destinations')}>
              {STOPS.map((item, index) => <button type="button" key={item.id} onClick={() => travelTo(stopProgress(index))}
                aria-current={!intro && ui.index === index ? 'step' : undefined} aria-label={`${item.city} — ${ko ? item.ko : item.name}`}>
                <span className="ej-stop-line"><span style={{ transform: `scaleX(${Math.max(0, Math.min(1, ui.progress - index))})` }} /></span>
                <span className="ej-stop-number">{String(index + 1).padStart(2, '0')}</span><span className="ej-stop-city">{item.city}</span><span className="ej-stop-arrow">↗</span>
              </button>)}
            </nav>
            <div className="ej-footer-bottom"><span className="ej-scroll-hint">{inspect ? 'DRAG TO LOOK AROUND' : text('↓ 스크롤하여 여행 · ↑ 되돌아가기', '↓ SCROLL TO TRAVEL · ↑ TO RETURN')}</span><button type="button" onClick={() => travelTo(0)}>{text('지구로 돌아가기', 'Back to Earth')} ↗</button></div>
          </footer>

          <div className="ej-attribution"><span>{ui.visibleTiles > 0 ? 'Google Maps' : 'Earth imagery · Solar System Scope / Three.js'}</span>{ui.attribution && <span>{ui.attribution}</span>}</div>
          {!intro && !failure && (ui.tiles === 'loading' || offline) && <div className="ej-notice" role="status">
            {offline ? text('3D 지도를 연결할 수 없습니다. 현재 지구본으로 위치를 안내합니다.', '3D imagery is unavailable. Showing the location on the globe.') : text('주변의 3D 지형을 불러오는 중…', 'Bringing the landscape into focus…')}
            {offline && <button type="button" onClick={retry}>{text('다시 연결', 'Reconnect')}</button>}
          </div>}
          {failure && <div className="ej-failure" role="alert"><GlobeIcon /><h2>{text('3D 화면을 시작할 수 없습니다', 'The 3D view is unavailable')}</h2><p>{text('브라우저의 하드웨어 가속을 확인한 뒤 다시 시도해 주세요.', 'Check that hardware acceleration is enabled, then try again.')}</p><button type="button" onClick={retry}>{text('다시 시도', 'Try again')}</button></div>}
        </main>
      </div>
    </div>
  )
}
