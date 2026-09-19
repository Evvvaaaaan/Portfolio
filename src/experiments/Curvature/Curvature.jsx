import { useEffect, useMemo, useRef, useState } from 'react'
import { createCurvatureScene } from './scene.js'
import { DEFAULTS, PRESETS, SOLAR_RADIUS_KM, WORLD_UNIT_KM, horizonRadius, criticalImpact, clockRate, tracePhoton } from './physics.js'
import './Curvature.css'

function Range({ name, label, value, unit, min, max, step, onChange, disabled }) {
  return <label className="cv-range">
    <span className="cv-range-top"><span>{label}</span><output>{value}<small>{unit}</small></output></span>
    <input type="range" aria-label={name} min={min} max={max} step={step} value={value} disabled={disabled}
      style={{ '--range-fill': `${(value - min) / (max - min) * 100}%` }} onChange={(event) => onChange(Number(event.target.value))} />
    <span className="cv-range-limits"><span>{min} {unit}</span><span>{max} {unit}</span></span>
  </label>
}

function Clock({ rate, paused, speed }) {
  const ref = useRef(null)
  const phase = useRef({ far: 0, near: 0 })
  useEffect(() => {
    if (paused) return
    let id, last = null
    const frame = (now) => {
      if (last !== null) {
        const step = Math.min(now - last, 50) * 0.0001 * speed
        phase.current.far += step
        phase.current.near += step * rate
      }
      last = now
      const hand = ref.current
      if (hand) {
        hand.style.setProperty('--far-angle', `${phase.current.far * 360}deg`)
        hand.style.setProperty('--near-angle', `${phase.current.near * 360}deg`)
      }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [rate, paused, speed])
  return <div className="cv-clocks" ref={ref} aria-hidden="true">
    <div className="cv-clock cv-clock-far"><i /><span>∞</span></div>
    <div className="cv-clock cv-clock-near"><i /><span>r</span></div>
  </div>
}

function FlatDiagram({ ray, rs, reference, impact, grid, bundle }) {
  const paths = useMemo(() => (bundle ? [-4, -3, -2, -1, 0, 1, 2, 3, 4] : [0]).map((offset) => {
    const result = offset === 0 ? ray : tracePhoton(rs, impact + offset * 0.62)
    return { offset, outcome: result.outcome, path: result.points.map(([x, z], index) => `${index ? 'L' : 'M'}${x.toFixed(3)},${(-z).toFixed(3)}`).join(' ') }
  }), [ray, rs, impact, bundle])
  return <svg className="cv-fallback-diagram" viewBox="-24 -16 48 32" role="img" aria-label="빛의 계산 경로를 나타낸 2D 좌표 투영">
    <defs><pattern id="cv-fallback-grid" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M2 0H0V2" fill="none" stroke="#33514f" strokeWidth=".025" /></pattern></defs>
    {grid && <rect x="-24" y="-16" width="48" height="32" fill="url(#cv-fallback-grid)" />}
    {reference && <path d={`M-22 ${-impact}H22`} stroke="#88959b" strokeDasharray=".3 .3" strokeWidth=".06" />}
    {rs > 0 && <><circle r={1.5 * rs} fill="none" stroke="#745537" strokeWidth=".035" strokeDasharray=".15 .15" /><circle r={rs} fill="#030607" stroke="#eeb174" strokeWidth=".07" /></>}
    {paths.map(({ offset, path, outcome }) => <path key={offset} className="cv-fallback-ray" d={path} stroke={offset === 0 ? '#f3c894' : outcome === 'captured' ? '#e49661' : '#8fcdc3'} opacity={offset === 0 ? 1 : 0.35} fill="none" strokeWidth={offset === 0 ? '.09' : '.05'} />)}
  </svg>
}

export default function Curvature() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, reference: false, paused: matchMedia('(prefers-reduced-motion: reduce)').matches }))
  const [view, setView] = useState('perspective')
  const [failed, setFailed] = useState(false)
  const [shots, setShots] = useState(1)
  const hostRef = useRef(null), sceneRef = useRef(null)
  const rs = horizonRadius(settings.mass)
  const ray = useMemo(() => tracePhoton(rs, settings.impact / WORLD_UNIT_KM), [rs, settings.impact])
  const rate = clockRate(rs, settings.observer * rs)
  const escaped = ray.outcome === 'escaped'
  const change = (key, value) => setSettings((old) => ({ ...old, [key]: value }))

  useEffect(() => {
    if (failed) return
    let active = true
    const fail = () => { if (active) setFailed(true) }
    try { sceneRef.current = createCurvatureScene(hostRef.current, fail) }
    catch { queueMicrotask(fail) }
    return () => { active = false; sceneRef.current?.dispose(); sceneRef.current = null }
  }, [failed])

  useEffect(() => { sceneRef.current?.setParameters(settings) }, [settings, failed])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { if (media.matches) setSettings((old) => ({ ...old, paused: true })) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function chooseView(next) { setView(next); sceneRef.current?.setView(next) }
  function reset() {
    setSettings({ ...DEFAULTS, reference: false, paused: matchMedia('(prefers-reduced-motion: reduce)').matches })
    chooseView('perspective')
    sceneRef.current?.restart()
    setShots(1)
  }

  return <main className="curvature" data-lenis-prevent data-renderer={failed ? '2d' : '3d'} data-outcome={ray.outcome}>
    <header className="cv-header">
      <a className="cv-brand" href="#curvature" onClick={(event) => { event.preventDefault(); reset() }} aria-label="Curvature 초기화"><span className="cv-brand-mark" aria-hidden="true">◉</span> CURVATURE<span className="cv-brand-lab"> / LAB</span></a>
      <span className="cv-header-note">A FIELD GUIDE TO BENT SPACE</span>
      <span className="cv-live"><i className={settings.paused || failed ? 'paused' : ''} />{failed ? '2D MODEL' : settings.paused ? 'PAUSED' : 'LIVE SIMULATION'}</span>
    </header>

    <div className="cv-workspace">
      <section className="cv-field" aria-label="시공간 관측 화면">
        <div className="cv-scene" ref={hostRef} />
        {failed && <FlatDiagram ray={ray} rs={rs} impact={settings.impact / WORLD_UNIT_KM} reference={settings.reference} grid={settings.grid} bundle={settings.bundle} />}
        <div className="cv-field-heading">
          <p className="cv-eyebrow"><span /> EXPERIMENT 024 <i> / </i> GENERAL RELATIVITY</p>
          <h1>Space is<br /><em>not a straight line.</em></h1>
          <p className="cv-intro">질량이 공간을 바꾸고, 공간이 빛의 길을 바꿉니다.<br />눈에 보이지 않는 곡률을 직접 실험해 보세요.</p>
        </div>
        <div className="cv-view-control" role="group" aria-label="관측 시점">
          <button type="button" aria-pressed={view === 'perspective'} disabled={failed} onClick={() => chooseView('perspective')}>3D 공간</button>
          <button type="button" aria-pressed={view === 'top'} disabled={failed} onClick={() => chooseView('top')}>위에서 보기</button>
        </div>
        <div className="cv-field-coordinate" aria-hidden="true">SCHWARZSCHILD FIELD<br /><span>Gμν = 8πG/c⁴ Tμν</span></div>
        {failed && <p className="cv-fallback-notice" role="status">3D 렌더링을 사용할 수 없어 계산된 경로를 2D로 표시합니다.</p>}
        <div className="cv-field-bottom">
          <div className="cv-legend"><span><i className="cv-key-ray" />선택한 빛의 경로</span><span><i className="cv-key-space" />공간 단면</span><span><i className="cv-key-observer" />관측자</span></div>
          <p>{failed ? '좌표 투영 · 광선 계산은 동일하게 유지됩니다' : '드래그하여 회전 · 스크롤하여 확대'}</p>
        </div>
        <div className="cv-readouts">
          <div><span>EVENT HORIZON</span><strong>{(settings.mass * SOLAR_RADIUS_KM).toFixed(2)}<small>km</small></strong><p>사건의 지평선 반지름</p></div>
          <div><span>DEFLECTION</span><strong data-testid="cv-deflection">{ray.deflection === null ? '—' : ray.deflection.toFixed(1)}<small>{ray.deflection !== null ? '°' : ''}</small></strong><p>{escaped ? '멀리서 측정한 총 편향각' : '포획된 빛은 출사각이 없습니다'}</p></div>
          <div><span>RAY OUTCOME</span><strong className={escaped ? 'cv-escaped' : 'cv-captured'}>{escaped ? 'ESCAPE' : ray.outcome === 'captured' ? 'CAPTURE' : 'UNRESOLVED'}</strong><p>{escaped ? '중력장을 벗어나는 경로' : ray.outcome === 'captured' ? '사건의 지평선에 도달' : '계산 범위 내에서 미결정'}</p></div>
        </div>
      </section>

      <aside className="cv-panel" aria-label="시뮬레이션 설정">
        <div className="cv-panel-heading"><div><span className="cv-eyebrow">THE OBSERVATORY</span><h2>공간을 바꿔보세요.</h2></div><button type="button" className="cv-reset" onClick={reset} aria-label="실험 초기화" title="실험 초기화">↺</button></div>
        <section className="cv-control-section">
          <h3><span>01</span> 실험 프리셋</h3>
          <div className="cv-presets">{PRESETS.map((preset) => <button type="button" key={preset.id}
            aria-pressed={settings.mass === preset.mass && settings.impact === preset.impact}
            onClick={() => setSettings((old) => ({ ...old, mass: preset.mass, impact: preset.impact }))}>
            <span>{preset.name}<i>↗</i></span><small>{preset.note}</small>
          </button>)}</div>
        </section>
        <section className="cv-control-section">
          <h3><span>02</span> 중력과 빛</h3>
          <Range name="중심 질량" label="중심 질량" value={settings.mass} unit="M☉" min={0} max={25} step={1} onChange={(value) => change('mass', value)} />
          <Range name="빛의 입사 거리" label="빛의 입사 거리 b" value={settings.impact} unit="km" min={30} max={280} step={1} onChange={(value) => change('impact', value)} />
          <p className="cv-threshold">현재 포획 경계 <span>b ≈ {(criticalImpact(rs) * WORLD_UNIT_KM).toFixed(1)} km</span></p>
        </section>
        <section className="cv-control-section cv-time-section">
          <h3><span>03</span> 같은 순간, 다른 시간</h3>
          <Range name="관측 거리" label="관측 거리" value={settings.observer} unit="rₛ" min={1.1} max={6} step={0.1} disabled={settings.mass === 0} onChange={(value) => change('observer', value)} />
          <div className="cv-time-readout"><Clock rate={rate} paused={settings.paused || failed} speed={settings.speed} /><div><strong data-testid="cv-clock-rate">{rate.toFixed(3)}<small>×</small></strong><p>멀리 떨어진 시계 대비</p></div></div>
          <p className="cv-time-caption">멀리서 1초가 흐를 때, 정지 관측자의 시계는 {rate.toFixed(3)}초 흐릅니다.</p>
        </section>
        <section className="cv-control-section cv-display-section">
          <h3><span>04</span> 관측 도구</h3>
          <div className="cv-toggles">{[['grid', '공간 격자'], ['bundle', '광선 묶음'], ['reference', '직선과 비교']].map(([key, label]) => <button type="button" key={key} aria-pressed={settings[key]} onClick={() => change(key, !settings[key])}><i />{label}</button>)}</div>
          <div className="cv-playback"><button type="button" className="cv-play" disabled={failed} aria-label={settings.paused ? '시뮬레이션 재생' : '시뮬레이션 일시정지'} onClick={() => change('paused', !settings.paused)}><span aria-hidden="true">{settings.paused ? '▶' : 'Ⅱ'}</span>{settings.paused ? '재생' : '일시정지'}</button>
            <label>속도<select aria-label="재생 속도" disabled={failed} value={settings.speed} onChange={(event) => change('speed', Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
          </div>
          <button type="button" className="cv-launch" disabled={failed} onClick={() => { sceneRef.current?.restart(); change('paused', false); setShots((n) => n + 1) }}><span>광선 다시 발사</span><span aria-hidden="true">↗</span></button>
          <span className="cv-shot">RAY EXPERIMENT / {String(shots).padStart(3, '0')}</span>
        </section>
        <details className="cv-model-notes"><summary>이 시뮬레이션은 무엇을 보여주나요?<span>＋</span></summary>
          <p>회전하지 않는 구대칭 질량의 슈바르츠실트 모형입니다. 빛의 경로는 u″ + u = 3rₛu²/2를 수치 적분합니다. M☉는 태양 질량, rₛ는 사건의 지평선 반지름입니다.</p>
          <p>격자는 공간의 2차원 단면을 높이 방향으로 압축한 설명용 도형입니다. 실제 공간에 아래쪽 구멍이 있는 것은 아니며, 빛이 천 위에서 굴러가는 모형도 아닙니다. 광선의 이동 속도와 시계 회전은 설명용 재생 속도입니다. 실제 광행 시간·회전 블랙홀·강착 원반 영상은 계산하지 않습니다.</p>
          <p>시간 비율 √(1−rₛ/r)은 무한히 먼 시계와 정지 관측자를 비교합니다. 입사 거리는 무한 원방 기준이며, 점선은 중력이 없는 좌표 경로입니다.</p>
          <div><a href="https://edu.itp.phys.ethz.ch/hs08/gr/GRE_Notes_Cedzich.pdf" target="_blank" rel="noreferrer">ETH Zürich · 경로 방정식 ↗</a><a href="https://www.physics.unlv.edu/~jeffery/astro/black_hole/black_hole_schwarzschild_flamm_paraboloid_4.html" target="_blank" rel="noreferrer">UNLV · 공간 단면의 의미 ↗</a></div>
        </details>
      </aside>
    </div>
    <footer className="cv-footer"><span>CURVATURE <i>—</i> AN INTERACTIVE FIELD STUDY</span><span>SCHWARZSCHILD · RK4 <i>/</i> EDUCATIONAL MODEL</span></footer>
  </main>
}
