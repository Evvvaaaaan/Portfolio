import { useEffect, useRef, useState } from 'react'
import { ROUTES, getRoute, STEP, createFlight, stepFlight, flightTelemetry, clamp } from './game.js'
import { BIOMES, ISLANDS, LANDMASSES, WORLD_LIMIT, WORLD_SIZE } from './world.js'
import { getAircraft } from './aircraft.js'
import { CHECKPOINT_GOLD, loadProgress, saveProgress, purchaseAircraft } from './progress.js'
import Hangar from './Hangar.jsx'
import { createFlightScene } from './scene.js'
import './Skybound.css'

const MOVEMENT = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Minus', 'Equal', 'Space'])
const reasons = { water: '수면과 충돌했습니다. 고도를 조금 더 높여 보세요.', terrain: '지형과 충돌했습니다. 산을 피해 선회하거나 상승하세요.', boundary: '비행 구역을 벗어났습니다. 지도 안쪽으로 선회하거나 고도를 낮춰 주세요.', timeout: '제한 시간이 끝났습니다. 다음 비행에서 코스를 이어가 보세요.' }
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const VIEWS = { cockpit: '일인칭 조종석', chase: '추적 시점', nose: '기수 시점' }

const bestKey = (route = 'coast', aircraft = 'trainer') => route === 'coast' && aircraft === 'trainer' ? 'skybound-best' : `skybound-best:${route}:${aircraft}`
function savedBest(route, aircraft) { try { const value = Number(localStorage.getItem(bestKey(route, aircraft))); return value > 0 && Number.isFinite(value) ? value : null } catch { return null } }

function TouchButton({ code, control, children, ...props }) {
  const release = (event) => control(event.pointerId, null)
  return <button type="button" {...props} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); control(event.pointerId, code) }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={(event) => event.preventDefault()}>{children}</button>
}

function FlightMap({ ui }) {
  const x = (n) => (n + WORLD_LIMIT) / WORLD_SIZE * 160
  const y = x
  const gates = getRoute(ui.route).gates
  return <div className="sb-map"><div className="sb-map-title"><span>FLIGHT PLAN</span><span>N ↑</span></div>
    <svg viewBox="0 0 160 160" role="img" aria-label="바다, 정글, 산맥, 평원과 체크포인트, 현재 비행기 위치를 표시한 지도">
      <defs><pattern id="sb-map-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d0e3db" strokeWidth=".3" /></pattern></defs>
      <rect width="160" height="160" fill="url(#sb-map-grid)" />
      <circle cx="80" cy="80" r="79" fill="none" stroke="#617d7944" strokeDasharray="2 3" />
      {[...ISLANDS, ...LANDMASSES].map((land, i) => <ellipse key={i} cx={x(land.x)} cy={y(land.z)} rx={land.rx / WORLD_SIZE * 160} ry={land.rz / WORLD_SIZE * 160} fill={BIOMES[land.biome || 'jungle'].color} opacity=".65" />)}
      <g className="sb-map-labels"><text x="37" y="67">JUNGLE</text><text x="87" y="36">ALPINE</text><text x="116" y="106">PLAINS</text><text x="55" y="123">OCEAN</text></g>
      {ui.mode === 'course' && <><polyline points={gates.map((gate) => `${x(gate.x)},${y(gate.z)}`).join(' ')} fill="none" stroke="#617d79" strokeWidth=".8" strokeDasharray="2 3" />{gates.map((gate, i) => <circle key={i} cx={x(gate.x)} cy={y(gate.z)} r={i === ui.gate ? 3.4 : 1.8} fill={i < ui.gate ? '#4d8171' : i === ui.gate ? '#dc9358' : '#eaf0d9'} stroke="#536f67" strokeWidth=".6" />)}</>}
      <g transform={`translate(${clamp(x(ui.x), 4, 156)} ${clamp(y(ui.z), 4, 156)}) rotate(${ui.heading})`}><path d="M0 -5L3.4 4L0 2L-3.4 4Z" fill="#274f51" stroke="#fff6da" strokeWidth="1" /></g>
    </svg>
    <span className="sb-map-caption">{BIOMES[ui.biome].name} · 14.4 KM</span>
  </div>
}

function engineAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext
  if (!Audio) return null
  const context = new Audio()
  const oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter()
  oscillator.type = 'sawtooth'
  filter.type = 'lowpass'
  filter.frequency.value = 170
  gain.gain.value = 0
  oscillator.connect(filter).connect(gain).connect(context.destination)
  oscillator.start()
  return {
    resume: () => context.resume().catch(() => {}),
    update(state, enabled) {
      gain.gain.setTargetAtTime(enabled && state.phase === 'playing' ? 0.025 : 0, context.currentTime, 0.1)
      oscillator.frequency.setTargetAtTime(24 + state.speed * 0.65, context.currentTime, 0.1)
    },
    dispose() { oscillator.stop(); context.close().catch(() => {}) },
  }
}

export default function Skybound() {
  const hostRef = useRef(null), rootRef = useRef(null), apiRef = useRef(null)
  const [ui, setUi] = useState(() => flightTelemetry(createFlight()))
  const [mode, setMode] = useState('course')
  const [routeId, setRouteId] = useState('coast')
  const [progress, setProgress] = useState(loadProgress)
  const [hangar, setHangar] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const progressRef = useRef(progress), routeChoice = useRef('coast')
  const [sound, setSound] = useState(false)
  const [view, setView] = useState('cockpit')
  const [calm, setCalm] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const [best, setBest] = useState(() => savedBest('coast', progress.selected))
  const settings = useRef({ view: 'cockpit', sound: false, calm })
  const choice = useRef('course')

  function updateProgress(next) {
    progressRef.current = next
    setProgress(next)
    setSaveFailed(!saveProgress(next))
  }

  useEffect(() => {
    let game = createFlight(choice.current, progressRef.current.selected, routeChoice.current)
    let scene
    try { scene = createFlightScene(hostRef.current) }
    catch { queueMicrotask(() => setFailed(true)); return }
    const keys = new Set(), touches = new Map()
    let frameId = 0, previous = 0, accumulator = 0, lastHud = 0, dirty = true, audio = null, stopped = false
    let fpsStart = 0, frameCount = 0, fps = 0, previousAssetsLoading = true
    const frameTimes = [], loadingFrameTimes = []
    const clear = () => { keys.clear(); touches.clear(); accumulator = 0 }
    const publish = () => setUi(flightTelemetry(game))
    const pause = () => {
      if (game.phase !== 'playing') return
      game.phase = 'paused'
      clear()
      audio?.update(game, false)
      publish()
      dirty = true
    }
    const command = (action) => {
      if (stopped) return
      if (action === 'start' || action === 'restart' || action === 'menu') {
        game = createFlight(choice.current, progressRef.current.selected, routeChoice.current)
        setHangar(false)
        game.phase = 'playing'
        if (action === 'menu') game.phase = 'ready'
        clear()
        scene.reset()
      } else if (action === 'pause') pause()
      else if (action === 'resume' && game.phase === 'paused') { clear(); game.phase = 'playing' }
      else if (action === 'view' || action.startsWith('view:')) {
        const views = Object.keys(VIEWS)
        settings.current.view = action === 'view' ? views[(views.indexOf(settings.current.view) + 1) % views.length] : action.slice(5)
        setView(settings.current.view)
      }
      dirty = true
      publish()
      audio?.resume()
      rootRef.current?.focus({ preventScroll: true })
    }
    const onDown = (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        event.preventDefault()
        if (!event.repeat) command(game.phase === 'playing' ? 'pause' : 'resume')
        return
      }
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, a')) return
      if (MOVEMENT.has(event.code)) { event.preventDefault(); keys.add(event.code) }
      if (event.repeat) return
      if (event.code === 'KeyC') command('view')
      if (event.code === 'KeyR') command('restart')
      if (event.code === 'Enter' && game.phase === 'ready') command('start')
    }
    const onUp = (event) => keys.delete(event.code)
    const onVisibility = () => {
      cancelAnimationFrame(frameId)
      previous = 0
      if (document.hidden) pause()
      else if (!stopped) frameId = requestAnimationFrame(frame)
    }
    const onLost = (event) => {
      event.preventDefault()
      pause()
      stopped = true
      cancelAnimationFrame(frameId)
      setFailed(true)
    }
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => { settings.current.calm = motion.matches; setCalm(motion.matches); dirty = true }
    const down = (code) => keys.has(code) || [...touches.values()].includes(code)
    function frame(now) {
      if (stopped || document.hidden) return
      frameId = requestAnimationFrame(frame)
      if (previous && game.phase === 'playing') {
        frameTimes.push(now - previous)
        if (frameTimes.length > 360) frameTimes.shift()
        if ((previousAssetsLoading || scene.loadingAssets) && loadingFrameTimes.length < 1200) loadingFrameTimes.push(now - previous)
      }
      previousAssetsLoading = scene.loadingAssets
      const dt = previous ? Math.min((now - previous) / 1000, 0.08) : STEP
      previous = now
      if (game.phase === 'playing') {
        const input = {
          pitch: Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown')),
          bank: Number(down('KeyD') || down('ArrowRight')) - Number(down('KeyA') || down('ArrowLeft')),
          throttle: Number(down('ShiftLeft') || down('ShiftRight') || down('Equal')) - Number(down('Minus')),
          brake: down('Space'),
        }
        accumulator += dt
        const previousGold = game.goldEarned
        while (accumulator >= STEP) { stepFlight(game, input, STEP); accumulator -= STEP }
        if (game.goldEarned > previousGold) updateProgress({ ...progressRef.current, gold: progressRef.current.gold + game.goldEarned - previousGold })
        if (game.phase === 'won') {
          const saved = savedBest(game.route, game.aircraft)
          if (!saved || game.elapsed < saved) {
            try { localStorage.setItem(bestKey(game.route, game.aircraft), String(game.elapsed)) } catch { /* Private browsing: keep the result for this visit. */ }
            setBest(game.elapsed)
          }
        }
        dirty = true
      }
      if (dirty || scene.needsRender) { scene.render(game, dt, settings.current); dirty = false }
      audio?.update(game, settings.current.sound)
      if (now - lastHud > 80) { publish(); lastHud = now }
      frameCount++
      if (now - fpsStart > 1000) { fps = frameCount / ((now - fpsStart) / 1000); fpsStart = now; frameCount = 0 }
    }
    apiRef.current = {
      command,
      selectMode(next) { if (game.phase === 'ready') { game.mode = next; dirty = true; publish() } },
      configure() {
        if (game.phase !== 'ready') return
        game = createFlight(choice.current, progressRef.current.selected, routeChoice.current)
        setBest(savedBest(game.route, game.aircraft))
        scene.reset(); dirty = true; publish()
      },
      touch(id, code) { if (code) touches.set(id, code); else touches.delete(id) },
      sound(enabled) {
        settings.current.sound = enabled
        try { if (enabled && !audio) audio = engineAudio(); if (enabled) audio?.resume() } catch { /* Flight remains available without audio. */ }
      },
      calm(next) { settings.current.calm = next; dirty = true },
    }
    const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug')
    if (debug) window.__skybound = {
      state: () => structuredClone(game),
      camera: () => scene.cameraState(),
      assets: () => scene.assetState(),
      metrics: () => {
        const sorted = [...frameTimes].sort((a, b) => a - b)
        const loading = [...loadingFrameTimes].sort((a, b) => a - b)
        return { fps, calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles, frameMs: { median: sorted[Math.floor(sorted.length * .5)] || 0, p95: sorted[Math.floor(sorted.length * .95)] || 0, max: sorted.at(-1) || 0, samples: sorted.length }, loadingFrameMs: { p95: loading[Math.floor(loading.length * .95)] || 0, max: loading.at(-1) || 0, samples: loading.length } }
      },
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onVisibility)
    motion.addEventListener('change', onMotion)
    scene.renderer.domElement.addEventListener('webglcontextlost', onLost)
    publish()
    frameId = requestAnimationFrame(frame)
    return () => {
      stopped = true
      cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onVisibility)
      motion.removeEventListener('change', onMotion)
      scene.renderer.domElement.removeEventListener('webglcontextlost', onLost)
      audio?.dispose()
      scene.dispose()
      apiRef.current = null
      if (debug) delete window.__skybound
    }
  }, [revision])

  const command = (action) => apiRef.current?.command(action)
  const touch = (id, code) => apiRef.current?.touch(id, code)
  const chooseMode = (next) => { choice.current = next; setMode(next); apiRef.current?.selectMode(next) }
  const chooseRoute = (next) => { routeChoice.current = next; setRouteId(next); apiRef.current?.configure() }
  const selectAircraft = (id) => {
    const current = progressRef.current
    const next = current.owned.includes(id) ? { ...current, selected: id } : purchaseAircraft(current, id)
    if (next === current) return
    updateProgress(next)
    apiRef.current?.configure()
  }
  const openHangar = () => { command('menu'); setHangar(true) }
  const route = getRoute(routeId), aircraft = getAircraft(progress.selected)
  const active = ui.phase === 'playing'
  const overlay = ui.phase !== 'playing' || failed

  return <main className={`skybound${calm ? ' sb-calm' : ''}`} ref={rootRef} tabIndex={0} aria-label="Skybound 비행 게임" data-lenis-prevent data-phase={ui.phase} data-gate={ui.gate} data-mode={ui.mode} data-view={view}>
    <div className="sb-scene" ref={hostRef} />
    <div className="sb-vignette" />
    <header className="sb-header"><span className="sb-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2 8 8 4v2l-8-2-1 6 3 2H8l3-2-1-6-8 2v-2l8-4z" fill="currentColor" /></svg>SKYBOUND<span>FLIGHT CLUB</span></span>
      <div className="sb-header-tools"><output className="sb-gold" aria-label="보유 골드">◈ {progress.gold.toLocaleString()} <span>G</span></output><button type="button" aria-label="엔진 소리" aria-pressed={sound} onClick={() => { const next = !sound; setSound(next); apiRef.current?.sound(next); rootRef.current?.focus({ preventScroll: true }) }}>{sound ? 'SOUND ON' : 'SOUND OFF'}</button><button type="button" aria-label="카메라 움직임 줄이기" aria-pressed={calm} onClick={() => { setCalm(!calm); apiRef.current?.calm(!calm); rootRef.current?.focus({ preventScroll: true }) }}>CALM {calm ? 'ON' : 'OFF'}</button>{active && <button type="button" className="sb-pause-button" aria-label="비행 일시정지" onClick={() => command('pause')}>Ⅱ</button>}</div>
    </header>
    {saveFailed && !hangar && <p className="sb-save-status" role="status">저장 공간을 사용할 수 없어 골드가 이번 접속 동안만 유지됩니다.</p>}

    {!overlay && <>
      <div className="sb-mission"><span className="sb-overline">{mode === 'course' ? `CHECKPOINT ${String(Math.min(route.gates.length, ui.gate + 1)).padStart(2, '0')} / ${String(route.gates.length).padStart(2, '0')}` : 'FREE FLIGHT'}</span><h2>{mode === 'course' ? route.gates[ui.gate]?.name : '당신만의 항로'}</h2><p>{mode === 'course' ? `다음 링까지 ${ui.distance} m` : `현재 ${BIOMES[ui.biome].name} · 지도에서 다음 지역을 찾아보세요`}</p></div>
      <div className="sb-clock"><span>{mode === 'course' ? 'TIME LEFT' : 'AIR TIME'}</span><strong>{formatTime(mode === 'course' ? ui.time : ui.elapsed)}</strong><small>{String(ui.score).padStart(4, '0')} PTS</small></div>
      <FlightMap ui={ui} />
      {mode === 'course' && <div className="sb-navigation"><span style={{ transform: `rotate(${ui.bearing}deg)` }}>↑</span><span>{Math.abs(ui.bearing) > 95 ? '링이 뒤에 있어요. 크게 선회하세요.' : ui.bearing > 10 ? '오른쪽으로 선회' : ui.bearing < -10 ? '왼쪽으로 선회' : '링의 중앙을 향해 비행하세요'}</span></div>}
      {ui.notice && <div className="sb-notice" role="status">{ui.notice}<span>+{CHECKPOINT_GOLD} GOLD · {saveFailed ? '이번 접속에 적립' : '저장 완료'}</span></div>}
      {ui.clearance < 32 && <div className="sb-warning" role="status">↑ 고도가 낮습니다 — 상승하세요</div>}
      {Math.hypot(ui.x, ui.z) > WORLD_LIMIT - 600 && <div className="sb-warning" role="status">비행 구역 경계입니다 — 지도 안쪽으로 선회하세요</div>}
    </>}

    <div className={`sb-instruments${overlay ? ' sb-instruments-preview' : ''}`}>
      <div className="sb-instrument"><span>AIRSPEED</span><strong>{ui.speed}<small>km/h</small></strong><div className="sb-ticks" /></div>
      <div className="sb-instrument"><span>ALTITUDE</span><strong>{ui.altitude}<small>m</small></strong><div className="sb-ticks" /></div>
      <div className="sb-attitude" aria-label={`기체 기울기 ${Math.round(ui.roll * 180 / Math.PI)}도`}><div className="sb-attitude-dial" style={{ transform: `rotate(${-ui.roll * 180 / Math.PI}deg)` }}><div style={{ transform: `translateY(${ui.pitch * 35}px)` }} /></div><span>─ • ─</span></div>
      <div className="sb-instrument sb-throttle"><span>THROTTLE</span><strong>{ui.throttle}<small>%</small></strong><div className="sb-throttle-track"><i style={{ width: `${ui.throttle}%` }} /></div></div>
    </div>
    {!overlay && <><button type="button" className="sb-view-button" onClick={() => command('view')} aria-label="카메라 시점 전환"><span>⌖</span>{VIEWS[view]}<kbd>C</kbd></button>
      {view === 'cockpit' && <div className="sb-pilot-label"><span>PILOT VIEW</span><i /> {aircraft.name} <b>{String(ui.heading).padStart(3, '0')}°</b></div>}
      <div className="sb-desktop-help"><span><kbd>W</kbd><kbd>S</kbd> 상승·하강</span><span><kbd>A</kbd><kbd>D</kbd> 선회</span><span><kbd>SHIFT</kbd> 가속</span><span><kbd>SPACE</kbd> 감속</span><span><kbd>P</kbd> 일시정지</span></div>
      <div className="sb-touch-controls"><div className="sb-dpad" role="group" aria-label="방향 조종"><TouchButton className="sb-touch-up" code="KeyW" control={touch} aria-label="상승">↑</TouchButton><TouchButton className="sb-touch-left" code="KeyA" control={touch} aria-label="왼쪽 선회">←</TouchButton><TouchButton className="sb-touch-right" code="KeyD" control={touch} aria-label="오른쪽 선회">→</TouchButton><TouchButton className="sb-touch-down" code="KeyS" control={touch} aria-label="하강">↓</TouchButton><span>FLY</span></div><div className="sb-touch-power"><TouchButton code="ShiftLeft" control={touch} aria-label="가속">＋<small>POWER</small></TouchButton><TouchButton code="Space" control={touch} aria-label="감속">−<small>BRAKE</small></TouchButton></div></div>
    </>}

    {overlay && <div className={`sb-overlay ${hangar && !failed ? 'sb-hangar-overlay' : ui.phase === 'ready' && !failed ? 'sb-intro-overlay' : ''}`}>{hangar && !failed ? <Hangar progress={progress} onSelect={selectAircraft} onClose={() => setHangar(false)} saveFailed={saveFailed} /> : <section className="sb-card">
      {failed ? <><span className="sb-overline">GRAPHICS UNAVAILABLE</span><h1>비행을 준비할 수 없어요.</h1><p>3D 그래픽 연결을 확인해 주세요. 하드웨어 가속을 지원하는 브라우저에서 다시 시도할 수 있습니다.</p><button type="button" className="sb-start" onClick={() => { setFailed(false); setRevision((n) => n + 1) }}>다시 연결하기 <span>↗</span></button></>
      : ui.phase === 'ready' ? <>
        <span className="sb-overline"><i /> A LITTLE PLANE. A WIDE OPEN WORLD.</span><h1>Find your<br /><em>own horizon.</em></h1>
        <p className="sb-intro-copy">바다에서 정글로, 설산 너머 평원까지.<br />나만의 비행기로 더 넓은 세상을 탐험하세요.</p>
        <div className="sb-mode-select" role="group" aria-label="비행 모드"><button type="button" aria-pressed={mode === 'course'} onClick={() => chooseMode('course')}><span>01 <strong>체크포인트</strong></span><small>{route.gates.length}개의 링 · 링마다 100 G</small></button><button type="button" aria-pressed={mode === 'free'} onClick={() => chooseMode('free')}><span>02 <strong>자유 비행</strong></span><small>시간 제한 없는 탐험</small></button></div>
        <div className="sb-route-select">{mode === 'course' ? <><label htmlFor="sb-route">비행 항로</label><select id="sb-route" value={routeId} onChange={(event) => chooseRoute(event.target.value)}>{ROUTES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.gates.length}개 링 · {formatTime(item.time)}</option>)}</select></> : <span>14.4km의 하늘 · 바다 / 정글 / 산맥 / 평원</span>}</div>
        <button type="button" className="sb-hangar-link" onClick={openHangar}><span>{aircraft.name} <small>보유 {progress.owned.length} / 4</small></span><span>격납고 · 기체 구매 ↗</span></button>
        <div className="sb-view-select" role="group" aria-label="시작 시점">{Object.entries(VIEWS).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => command(`view:${id}`)}>{label}</button>)}</div>
        <button type="button" className="sb-start" onClick={() => command('start')}>비행 시작하기 <span>↗</span></button>
        <div className="sb-intro-controls"><span><kbd>W S</kbd> 상승·하강</span><span><kbd>A D</kbd> 선회</span><span><kbd>C</kbd> 시점</span></div>
        <p className="sb-flight-note">이미 하늘에서 출발합니다. 손을 놓으면 기체가 수평으로 돌아옵니다.<br />키보드 또는 터치 조작 · 실제 조종 훈련용이 아닌 아케이드 게임</p>
      </> : ui.phase === 'paused' ? <><span className="sb-overline">FLIGHT ON HOLD</span><h1>잠시, 숨을 고르고.</h1><p>비행과 타이머가 멈췄습니다. 탭을 떠나거나 창의 포커스를 잃어도 자동으로 일시정지됩니다.</p><div className="sb-pause-controls"><span>W / ↑ 상승 · S / ↓ 하강</span><span>A D / ← → 선회 · Shift / + 가속</span><span>Space 감속 · − 추력 감소 · C 시점 전환</span><span>P / Esc 일시정지 · R 재시작</span></div><button type="button" className="sb-start" onClick={() => command('resume')}>비행 계속하기 <span>↗</span></button><button type="button" className="sb-secondary" onClick={() => command('restart')}>처음부터 다시 비행</button><button type="button" className="sb-secondary sb-return" onClick={openHangar}>격납고로 돌아가기</button></>
      : <><span className="sb-overline">{ui.phase === 'won' ? 'ROUTE COMPLETE' : 'FLIGHT ENDED'}</span><h1>{ui.phase === 'won' ? '멋진 비행이었어요.' : '다시 날아볼까요?'}</h1><p>{ui.phase === 'won' ? `${route.name}의 ${route.gates.length}개 링을 모두 통과했습니다. 획득한 골드로 새로운 비행기를 만나보세요.` : reasons[ui.reason]}</p><div className="sb-results"><div><span>SCORE</span><strong>{ui.score}</strong></div><div><span>FLIGHT TIME</span><strong>{formatTime(ui.elapsed)}</strong></div><div><span>CHECKPOINTS</span><strong>{ui.gate}<small>/ {route.gates.length}</small></strong></div><div><span>GOLD EARNED</span><strong>+{ui.goldEarned}<small>G</small></strong></div></div>{best && <p className="sb-best">PERSONAL BEST <span>{formatTime(best)}</span></p>}<button type="button" className="sb-start" onClick={() => command('restart')}>다시 비행하기 <span>↗</span></button><button type="button" className="sb-secondary" onClick={openHangar}>격납고 · 기체 구매</button></>}
      <a className="sb-asset-credits" href="/skybound/ATTRIBUTION.md" target="_blank" rel="noreferrer">3D 모델 · 환경 에셋 크레딧 ↗</a>
    </section>}{ui.phase === 'ready' && !failed && !hangar && <div className="sb-aircraft-label"><span>{aircraft.name.toUpperCase()}</span><strong>{aircraft.subtitle}</strong><p>{aircraft.handling} · 최고 {Math.round(aircraft.maxSpeed * 3.6)} km/h</p><i /></div>}</div>}
    <footer className="sb-footer"><span>AURELIA WORLD <i> / </i> OCEAN · JUNGLE · ALPINE · PLAINS</span><span>SKYBOUND — A FLIGHT EXPERIMENT</span></footer>
  </main>
}
