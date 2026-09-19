import { useEffect, useRef, useState } from 'react'
import { createPaperScene, supportsPaper } from './scene.js'
import { fitPaper, PAPER_CORNERS } from './paper.js'
import './LivingPaper.css'

const INITIAL_TITLE = 'A page with\na little life.'
const INITIAL_BODY = '어떤 생각은 종이 위에서 조금 더 오래 머뭅니다.\n\n오늘의 문장을 적어보세요. 모서리를 당기고, 바람을 더하고, 다시 펼쳐 읽을 수 있어요.'
const STOCKS = [
  { id: 'cotton', name: '코튼', note: 'WARM & SOFT', back: [0.93, 0.91, 0.86] },
  { id: 'blueprint', name: '블루프린트', note: 'IDEAS IN BLUE', back: [0.16, 0.31, 0.49] },
  { id: 'rose', name: '로즈', note: 'A SOFTER NOTE', back: [0.88, 0.7, 0.66] },
]
const CORNER_NAMES = ['오른쪽 아래', '왼쪽 아래', '왼쪽 위', '오른쪽 위']
const STAMPS = ['GOOD\nIDEA', 'a little\nwonder', '✳']

function Document({ title, body, onTitle, onBody, paperRef, stamps }) {
  return (
    <article className="lp-paper" ref={paperRef} drawable="" aria-label="나의 문서">
      <div className="lp-paper-top"><span>FIELD NOTES</span><span>NO. 001</span></div>
      <div className="lp-paper-rule" />
      <textarea className="lp-title-input" aria-label="문서 제목" value={title} onChange={onTitle} maxLength={70} rows={2} spellCheck={false} />
      <div className="lp-paper-illustration" aria-hidden="true">
        <span className="lp-paper-mark">✳</span>
        <span className="lp-paper-note">LEAVE A LITTLE<br />ROOM FOR WONDER.</span>
        <span className="lp-paper-orbit" />
        {STAMPS.slice(0, stamps).map((stamp, i) => <span className={`lp-stamp lp-stamp-${i}`} key={stamp}>{stamp}</span>)}
      </div>
      <textarea className="lp-body-input" aria-label="문서 본문" value={body} onChange={onBody} maxLength={600} spellCheck={false} />
      <footer className="lp-paper-footer"><span>A THOUGHT, GIVEN FORM.</span><span>01 — ∞</span></footer>
    </article>
  )
}

export default function LivingPaper() {
  const [support, setSupport] = useState(() => supportsPaper() ? 'loading' : 'fallback')
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mode, setMode] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'write' : 'touch')
  const [wind, setWind] = useState(18)
  const [title, setTitle] = useState(INITIAL_TITLE)
  const [body, setBody] = useState(INITIAL_BODY)
  const [stock, setStock] = useState(0)
  const [stamps, setStamps] = useState(0)
  const canvasRef = useRef(null), paperRef = useRef(null), handlesRef = useRef([]), sceneRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null), focusRef = useRef(false)
  const native = support !== 'fallback'
  const editing = !native || mode === 'write'

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { setReducedMotion(media.matches); if (media.matches) setMode('write') }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    if (!native) return
    let active = true
    try {
      sceneRef.current = createPaperScene(canvasRef.current, paperRef.current, handlesRef.current, {
        onReady: () => { if (active) setSupport('native') },
        onFailure: () => { if (active) setSupport('fallback') },
        onEditReady: () => {
          if (active && focusRef.current) {
            paperRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
            focusRef.current = false
          }
        },
      })
    } catch {
      queueMicrotask(() => { if (active) setSupport('fallback') })
    }
    return () => { active = false; sceneRef.current?.dispose(); sceneRef.current = null }
  }, [native])

  useEffect(() => { sceneRef.current?.setReducedMotion(reducedMotion) }, [reducedMotion])
  useEffect(() => { sceneRef.current?.setMode(mode) }, [mode])
  useEffect(() => { sceneRef.current?.setWind(wind / 100) }, [wind])
  useEffect(() => { sceneRef.current?.setStock(STOCKS[stock].back) }, [stock])

  useEffect(() => {
    if (native) return
    const stage = stageRef.current
    const resize = () => {
      const { width, height } = stage.getBoundingClientRect()
      stage.style.setProperty('--paper-scale', fitPaper(width, height).scale)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    resize()
    return () => observer.disconnect()
  }, [native])

  const chooseMode = (next) => {
    focusRef.current = next === 'write' && mode !== 'write'
    setMode(next)
    if (next === 'write' && (mode === 'write' || !native)) paperRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
  }
  const startDrag = (event, corner) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, corner, curl: sceneRef.current.grab(corner) }
  }
  const moveDrag = (event) => {
    const drag = dragRef.current
    if (drag) {
      const [cx, cy] = PAPER_CORNERS[drag.corner]
      const dx = (event.clientX - drag.x) * (cx ? -1 : 1)
      const dy = (event.clientY - drag.y) * (cy ? -1 : 1)
      const { width, height } = stageRef.current.getBoundingClientRect()
      sceneRef.current?.drag(drag.curl + (dx + dy) / (180 * fitPaper(width, height).scale))
    }
  }
  const endDrag = () => { dragRef.current = null; sceneRef.current?.release() }
  const cornerKey = (event, corner) => {
    if (!['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ' ', 'Enter'].includes(event.key)) return
    event.preventDefault()
    const [cx, cy] = PAPER_CORNERS[corner]
    const inward = [' ', 'Enter', cx ? 'ArrowLeft' : 'ArrowRight', cy ? 'ArrowUp' : 'ArrowDown'].includes(event.key)
    sceneRef.current?.nudge(inward ? 0.45 : -0.3, corner)
  }
  const moveLight = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    sceneRef.current?.moveLight(event.clientX - rect.left, event.clientY - rect.top)
  }
  const pokePaper = (event) => {
    if (editing || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    sceneRef.current?.poke(event.clientX - rect.left, event.clientY - rect.top)
  }
  const document = <Document title={title} body={body} onTitle={e => setTitle(e.target.value)} onBody={e => setBody(e.target.value)} paperRef={paperRef} stamps={stamps} />

  return (
    <main className="living-paper" data-support={support} data-mode={editing ? 'write' : 'touch'} data-material={STOCKS[stock].id}>
      <header className="lp-masthead"><span>EVAN / MATERIAL STUDIES</span><span className="lp-edition">VOL. 01 — LIVING PAPER</span></header>
      <div className="lp-workspace">
        <aside className="lp-intro">
          <p className="lp-eyebrow"><span /> AN EXPERIMENT IN FEELING</p>
          <h1>Living<br /><em>Paper.</em></h1>
          <p className="lp-description">작은 생각에,<br />{' '}손으로 만질 수 있는 형태를.</p>
          <div className="lp-materials" role="group" aria-label="종이 재질">
            <p className="lp-section-label">01 / CHOOSE YOUR PAPER</p>
            <div className="lp-stock-options">
              {STOCKS.map((item, i) => <button type="button" key={item.id} data-stock={item.id} aria-pressed={stock === i} aria-label={`${item.name} 종이`} onClick={() => setStock(i)}><span className="lp-stock-sample" aria-hidden="true"><i /><i /><i /><b>✳</b></span><span>{item.name}</span></button>)}
            </div>
            <p className="lp-stock-note">{STOCKS[stock].note}<span>120 G/M²</span></p>
          </div>
          <div className="lp-ink-tools">
            <span className="lp-section-label">02 / MAKE YOUR MARK</span>
            <div><button type="button" className="lp-stamp-button" onClick={() => setStamps(value => Math.min(3, value + 1))} disabled={stamps === 3}><span aria-hidden="true">✳</span> 도장 찍기</button><button type="button" className="lp-undo" aria-label="마지막 도장 지우기" disabled={!stamps} onClick={() => setStamps(value => Math.max(0, value - 1))}>↶</button><span className="lp-stamp-count" role="status" aria-label={`도장 ${stamps}개`}>{stamps} / 3</span></div>
          </div>
          <details className="lp-about">
            <summary>이 실험에 관하여 <span>↗</span></summary>
            <p>HTML로 쓴 문서를 캔버스에 그려 종이처럼 움직입니다. 글을 쓸 때는 종이가 평평하게 펼쳐집니다. 작성한 내용은 이 페이지를 떠나면 사라집니다.</p>
            <a href="https://github.com/WICG/html-in-canvas" target="_blank" rel="noreferrer">HTML-in-Canvas ↗</a>
            {support === 'fallback' && <p>종이 효과를 보려면 지원되는 Chrome에서 <code>chrome://flags/#canvas-draw-element</code>를 켜고 브라우저를 다시 시작하세요.</p>}
          </details>
        </aside>
        <section className="lp-studio" aria-label="종이 작업 공간">
          <div className="lp-studio-top"><span>{native ? 'PAPER / 001' : 'DOCUMENT / 001'}</span><span className="lp-status"><i />{support === 'loading' ? 'PREPARING' : native ? 'LIVE HTML' : 'READ & WRITE'}</span></div>
          <div ref={stageRef} className={`lp-stage${native ? '' : ' lp-stage-fallback'}`} onPointerMove={moveLight} onPointerLeave={() => sceneRef.current?.moveLight(null, null)}>
            <div className="lp-stage-guides" aria-hidden="true"><div className="lp-stage-orbit" /></div>
            <span className="lp-stage-caption" aria-hidden="true">FIG. 01 / A STUDY IN SOFTNESS</span>
            <div className="lp-shadow" aria-hidden="true" />
            {native ? <canvas ref={canvasRef} className="lp-canvas" layoutsubtree="" onPointerDown={pokePaper}>{document}</canvas> : <div className="lp-fallback-sheet">{document}</div>}
            {CORNER_NAMES.map((name, i) => <button key={name} ref={element => { handlesRef.current[i] = element }} type="button" className="lp-corner" data-corner={i} hidden={support !== 'native' || editing} aria-label={i === 0 ? '종이 모서리 당기기' : `${name} 모서리 당기기`} title={`${name} — 당기거나 방향키로 구부리기`} onPointerDown={event => startDrag(event, i)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={event => cornerKey(event, i)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 16-8-8M8 16V8h8" /></svg>
            </button>)}
            {support === 'loading' && <p className="lp-loading" role="status">종이를 펼치는 중…</p>}
          </div>
          <div className="lp-controls">
            <div className="lp-mode-switch" role="group" aria-label="종이 모드">
              <button type="button" aria-pressed={editing} onClick={() => chooseMode('write')}>글 쓰기 <span>↗</span></button>
              <button type="button" aria-pressed={!editing} disabled={support !== 'native'} onClick={() => chooseMode('touch')}>종이 만지기 <span>⌁</span></button>
            </div>
            <label className="lp-wind"><span>바람</span><input aria-label="바람 세기" type="range" min="0" max="100" value={wind} onChange={e => setWind(Number(e.target.value))} disabled={support !== 'native' || editing || reducedMotion} /><output>{wind.toString().padStart(2, '0')}</output></label>
            <button type="button" className="lp-flatten" onClick={() => chooseMode('write')} aria-label="종이 펴기">↺ <span>펴기</span></button>
          </div>
          <div className="lp-gestures" role="group" aria-label="종이 움직임">
            <button type="button" disabled={support !== 'native' || editing || reducedMotion} onClick={() => sceneRef.current?.blow()}><span aria-hidden="true">≋</span> 바람 불기</button>
            <button type="button" disabled={support !== 'native' || editing || reducedMotion} onClick={() => { const stage = stageRef.current; sceneRef.current?.poke(stage.clientWidth / 2, stage.clientHeight / 2) }}><span aria-hidden="true">◎</span> 톡 건드리기</button>
          </div>
          <p className="lp-hint" aria-live="polite">{support === 'fallback' ? '재질과 도장을 골라 문서를 꾸며보세요. 종이 움직임은 지원 브라우저에서 열립니다.' : editing ? '문장을 바꿔보세요. 당신의 생각이 그대로 종이가 됩니다.' : '네 모서리를 당기거나, 종이 위를 톡 건드려보세요.'}</p>
        </section>
      </div>
      <footer className="lp-colophon"><span>A DIGITAL OBJECT. A HUMAN GESTURE.</span><span>MADE TO BE TOUCHED <span aria-hidden="true">✳</span></span></footer>
    </main>
  )
}
