import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { JOBS, STEP, createGame, distance, interact, stepGame, subject, vehicleSpeed } from './game.js'
import { createScene, drawMap } from './scene.js'
import { copy } from './copy.js'
import './MidnightDispatch.css'

const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'])
const INITIAL_UI = { phase: 'ready', time: 180, job: 0, cash: 0, health: 100, speed: 0, heat: 0, driving: false, nearby: true, distance: 64, notice: 'welcome', delivery: 0 }

function TouchButton({ code, onTouch, children, ...props }) {
  const release = (e) => onTouch(e.pointerId, null)
  return <button type="button" {...props}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onTouch(e.pointerId, code) }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onContextMenu={(e) => e.preventDefault()}>{children}</button>
}

function createAudio() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext
  if (!AudioEngine) return null
  const context = new AudioEngine()
  const gain = context.createGain()
  const oscillator = context.createOscillator()
  const filter = context.createBiquadFilter()
  oscillator.type = 'sawtooth'
  filter.type = 'lowpass'
  filter.frequency.value = 220
  gain.gain.value = 0
  oscillator.connect(filter).connect(gain).connect(context.destination)
  oscillator.start()
  return {
    resume: () => context.resume().catch(() => {}),
    update(s, enabled) {
      const on = enabled && s.phase === 'playing' && s.driving
      gain.gain.setTargetAtTime(on ? 0.028 : 0, context.currentTime, 0.1)
      oscillator.frequency.setTargetAtTime(34 + Math.abs(s.car.speed) * 2.6, context.currentTime, 0.1)
    },
    dispose() { oscillator.stop(); context.close().catch(() => {}) },
  }
}

export default function MidnightDispatch() {
  const { lang } = useLang()
  const t = copy[lang] || copy.en
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const rootRef = useRef(null)
  const apiRef = useRef(null)
  const [ui, setUi] = useState(INITIAL_UI)
  const [sound, setSound] = useState(false)
  const [calm, setCalm] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const settings = useRef({ sound: false, calm })
  const [help, setHelp] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let game = createGame()
    let view
    try { view = createScene(hostRef.current, game) }
    catch {
      // Keep the Lab exit and retry action available when WebGL cannot initialize.
      queueMicrotask(() => setFailed(true))
      return
    }
    const keys = new Set()
    const touches = new Map()
    const input = { x: 0, y: 0, brake: false }
    let raf = 0, last = 0, accumulator = 0, lastHud = 0
    let audio = null
    let frames = 0, fps = 0, fpsStart = 0
    const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

    const updateHud = () => {
      const job = JOBS[game.job]
      setUi({
        phase: game.phase, time: Math.ceil(game.time), job: game.job, cash: game.cash,
        health: Math.ceil(game.car.health), speed: Math.round(vehicleSpeed(game.car) * 3.6),
        heat: Math.ceil(game.heat), driving: game.driving, nearby: distance(game.player, game.car) <= 6,
        distance: job ? Math.round(distance(subject(game), job)) : 0,
        notice: game.noticeTime > 0 || game.phase === 'ready' ? game.notice : '', delivery: game.delivery,
      })
      if (mapRef.current) drawMap(mapRef.current, game)
    }
    const clear = () => { keys.clear(); touches.clear(); input.x = input.y = 0; input.brake = false }
    const pause = () => {
      if (game.phase === 'playing') {
        game.phase = 'paused'
        clear()
        audio?.update(game, false)
        updateHud()
      }
    }
    const command = (action) => {
      if (action === 'start' || action === 'restart') {
        game = createGame()
        game.phase = 'playing'
        game.noticeTime = 5
        clear()
      } else if (action === 'pause') pause()
      else if (action === 'resume' && game.phase === 'paused') game.phase = 'playing'
      else if (action === 'interact') interact(game)
      if (action !== 'pause') rootRef.current?.focus({ preventScroll: true })
      audio?.resume()
      updateHud()
    }
    const onKeyDown = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, a')) return
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      if (MOVEMENT.has(e.code)) { e.preventDefault(); keys.add(e.code) }
      if (e.repeat) return
      if (e.code === 'KeyE') { e.preventDefault(); command('interact') }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault()
        setHelp(false)
        command(game.phase === 'playing' ? 'pause' : 'resume')
      }
    }
    const onKeyUp = (e) => keys.delete(e.code)
    const onHidden = () => { if (document.hidden) pause() }
    const lostContext = (e) => {
      e.preventDefault()
      pause()
      setFailed(true)
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = (e) => { settings.current.calm = e.matches; setCalm(e.matches) }
    media.addEventListener('change', onMotion)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onHidden)
    view.renderer.domElement.addEventListener('webglcontextlost', lostContext)
    apiRef.current = {
      command,
      touch(id, code) { if (code) touches.set(id, code); else touches.delete(id) },
      sound(enabled) {
        settings.current.sound = enabled
        try {
          if (enabled && !audio) audio = createAudio()
          if (enabled) audio?.resume()
        } catch { /* Audio is optional; the game remains playable. */ }
      },
    }
    if (debug) window.__midnight = { state: () => structuredClone(game), metrics: () => ({ fps, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }) }

    const frame = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : STEP
      last = now
      const down = (code) => {
        if (keys.has(code)) return true
        for (const pressed of touches.values()) if (pressed === code) return true
        return false
      }
      input.x = Number(down('KeyD') || down('ArrowRight')) - Number(down('KeyA') || down('ArrowLeft'))
      input.y = Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown'))
      input.brake = down('Space')
      if (game.phase === 'playing') {
        accumulator += dt
        while (accumulator >= STEP) { stepGame(game, input); accumulator -= STEP }
      } else accumulator = 0
      if (game.phase !== 'playing') clear()
      // An inactive game does not keep repainting an unchanged city at 60 fps.
      if (game.phase === 'playing' || now - lastHud >= 100) view.render(game, dt, settings.current.calm)
      audio?.update(game, settings.current.sound)
      if (now - lastHud >= 100) { updateHud(); lastHud = now }
      frames++
      if (now - fpsStart >= 1000) { fps = Math.round(frames * 1000 / (now - fpsStart)); fpsStart = now; frames = 0 }
      raf = requestAnimationFrame(frame)
    }
    updateHud()
    raf = requestAnimationFrame(frame)
    return () => {
      apiRef.current = null
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onHidden)
      media.removeEventListener('change', onMotion)
      view.renderer.domElement.removeEventListener('webglcontextlost', lostContext)
      audio?.dispose()
      view.dispose()
      if (debug) delete window.__midnight
    }
  }, [])

  const command = (name) => apiRef.current?.command(name)
  const touch = (id, code) => apiRef.current?.touch(id, code)
  const clock = `${Math.floor(ui.time / 60).toString().padStart(2, '0')}:${(ui.time % 60).toString().padStart(2, '0')}`
  const overlay = ui.phase !== 'playing'
  const finished = ui.phase === 'won' || ui.phase === 'lost'
  const canInteract = ui.driving ? ui.speed < 15 : ui.nearby
  const interactionLabel = ui.driving ? ui.speed < 15 ? t.exit : t.stop : ui.nearby ? t.interact : t.nearby

  return (
    <main className={`midnight${calm ? ' midnight--calm' : ''}`} ref={rootRef} tabIndex={-1} data-phase={ui.phase} data-driving={ui.driving} aria-label="Midnight Dispatch">
      <div className="midnight-scene" ref={hostRef} />
      <div className="midnight-vignette" aria-hidden="true" />
      <header className="md-topline">
        <span className="md-wordmark">MIDNIGHT<span>DISPATCH</span></span>
        <span className="md-district"><i />{t.district}</span>
        <div className="md-utilities">
          <button type="button" onClick={() => { setHelp(!help); if (!help) command('pause') }} aria-label={help ? t.close : t.help}>?</button>
          <button type="button" onClick={() => command(ui.phase === 'playing' ? 'pause' : 'resume')} disabled={ui.phase === 'ready' || finished} aria-label={ui.phase === 'paused' ? t.resume : t.pause}>{ui.phase === 'paused' ? '▶' : 'Ⅱ'}</button>
        </div>
      </header>

      <section className="md-dispatch" aria-label={t.dispatch}>
        <div className="md-eyebrow"><i />{t.dispatch}<span>{String(Math.min(ui.job + 1, 3)).padStart(2, '0')} / 03</span></div>
        <h2>{ui.driving ? JOBS[ui.job]?.name || t.won : t.objective}</h2>
        <p>{ui.driving ? t.deliver : `${t.controls} · E ${t.enter}`}</p>
        <div className="md-job-footer"><span>◇ {ui.distance} m</span><span>+$ {JOBS[ui.job]?.reward.toLocaleString() || '—'}</span></div>
        {ui.delivery > 0 && <div className="md-delivery" role="progressbar" aria-label={t.progress} aria-valuenow={Math.round(ui.delivery / 0.8 * 100)} aria-valuemin={0} aria-valuemax={100} style={{ '--progress': `${ui.delivery / 0.8 * 100}%` }} />}
      </section>

      <aside className="md-stats">
        <div><span>{t.cash}</span><strong className="md-cash">${ui.cash.toLocaleString().padStart(5, '0')}</strong></div>
        <div><span>{t.time}</span><strong className={ui.time < 30 ? 'md-danger' : ''}>{clock}</strong></div>
        <div className="md-heat"><span>{t.heat}</span><strong aria-label={`${t.heat} ${ui.heat} / 3`}>{[1, 2, 3].map((n) => <i key={n} className={ui.heat >= n ? 'is-hot' : ''}>◆</i>)}</strong></div>
      </aside>

      <aside className="md-map">
        <div className="md-map-label"><span>SECTOR 04</span><span>↑ {t.north}</span></div>
        <canvas width={270} height={270} ref={mapRef} role="img" aria-label={t.map} />
        <div className="md-map-footer"><i /> {ui.driving ? t.driving : t.onFoot}</div>
      </aside>

      <div className="md-toast" role="status" aria-live="polite">{!overlay && ui.notice ? t.notices[ui.notice] : ''}</div>

      <aside className="md-vehicle">
        <span className="md-eyebrow">{ui.driving ? 'COUPE / RWD' : t.onFoot}</span>
        <div className="md-speed"><strong>{String(ui.speed).padStart(3, '0')}</strong><span>KM/H</span></div>
        <div className="md-integrity"><span>{t.integrity}</span><span>{ui.health}%</span></div>
        <meter min="0" max="100" low="30" value={ui.health} aria-label={t.integrity} />
      </aside>

      {!overlay && <div className="md-bottom">
        <span><kbd>W A S D</kbd> {t.move}</span><span><kbd>SPACE</kbd> {t.brake}</span>
        <button type="button" className="md-interact" onClick={() => command('interact')} disabled={!canInteract}><kbd>E</kbd> {interactionLabel}</button>
      </div>}

      {!overlay && <div className="md-touch">
        <div className="md-pad">
          <TouchButton className="md-up" aria-label={lang === 'ko' ? '전진' : 'Forward'} code="KeyW" onTouch={touch}>↑</TouchButton>
          <TouchButton className="md-left" aria-label={lang === 'ko' ? '왼쪽' : 'Left'} code="KeyA" onTouch={touch}>←</TouchButton>
          <TouchButton className="md-down" aria-label={lang === 'ko' ? '후진' : 'Reverse'} code="KeyS" onTouch={touch}>↓</TouchButton>
          <TouchButton className="md-right" aria-label={lang === 'ko' ? '오른쪽' : 'Right'} code="KeyD" onTouch={touch}>→</TouchButton>
        </div>
        <div className="md-touch-actions">
          <button type="button" className="md-touch-enter" onClick={() => command('interact')} disabled={!canInteract}>{interactionLabel}</button>
          <TouchButton aria-label={t.brake} code="Space" onTouch={touch}>{ui.driving ? 'BRAKE' : 'RUN'}</TouchButton>
        </div>
      </div>}

      {(overlay || help || failed) && <div className="md-overlay">
        <section className="md-intro" aria-labelledby="md-title">
          <p className="md-eyebrow">{t.edition}</p>
          <span className="md-intro-index" aria-hidden="true">{finished ? ui.phase === 'won' ? '✓' : '×' : '04'}</span>
          <h1 id="md-title">{failed ? 'WEBGL UNAVAILABLE' : help ? t.help : ui.phase === 'ready' ? <>MIDNIGHT<br /><em>DISPATCH.</em></> : ui.phase === 'paused' ? t.paused : ui.phase === 'won' ? t.won : t.lost}</h1>
          <p className="md-subtitle">{failed ? t.error : ui.phase === 'ready' ? t.subtitle : finished ? ui.phase === 'won' ? t.wonHint : t.lostHint : t.pauseHint}</p>
          {ui.phase === 'ready' && !failed && <p className="md-intro-copy">{t.intro}</p>}
          {finished && <div className="md-results"><span>{t.deliveries}<strong>{ui.job} / 3</strong></span><span>{t.cash}<strong>${ui.cash.toLocaleString()}</strong></span></div>}
          {!finished && !failed && <div className="md-keyguide"><span><kbd>W A S D</kbd>{t.move}</span><span><kbd>E</kbd>{t.enter}</span><span><kbd>SPACE</kbd>{t.brake}</span></div>}
          <div className="md-preferences">
            <label><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); apiRef.current?.sound(e.target.checked) }} />{t.sound}</label>
            <label><input type="checkbox" checked={calm} onChange={(e) => { settings.current.calm = e.target.checked; setCalm(e.target.checked) }} />{t.motion}</label>
          </div>
          <button type="button" className="md-start" onClick={() => {
            if (failed) { window.location.reload(); return }
            setHelp(false)
            command(ui.phase === 'ready' ? 'start' : finished ? 'restart' : 'resume')
          }}>{failed ? t.retry : ui.phase === 'ready' ? t.start : finished ? t.restart : t.resume}<span>↗</span></button>
          {ui.phase === 'paused' && !failed && <button type="button" className="md-restart" onClick={() => { setHelp(false); command('restart') }}>{t.restart}</button>}
          <p className="md-original">ORIGINAL CITY · TOP-DOWN 3D · SINGLE PLAYER</p>
        </section>
      </div>}
    </main>
  )
}
