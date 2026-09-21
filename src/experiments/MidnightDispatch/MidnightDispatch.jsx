import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { JOBS, STEP, createGame, distance, interact, stepGame, subject, vehicleSpeed, missionTarget, nearbyService, nearestVehicle, purchase, serviceAction, acceptContract, reload, cycleWeapon, recover, isBlocked } from './game.js'
import { readCareer, saveCareer, rankFor, VEHICLES, WEAPONS, CONTRACTS } from './progress.js'
import { districtAt } from './world.js'
import { createScene, drawMap } from './scene.js'
import CityPanel from './CityPanel.jsx'
import { copy } from './copy.js'
import './MidnightDispatch.css'

const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyF'])
function snapshot(s) {
  const target = missionTarget(s), service = nearbyService(s), nearbyCar = nearestVehicle(s)
  return {
    phase: s.phase, job: s.job, cash: s.cash, health: Math.ceil(s.car.health), speed: Math.round(vehicleSpeed(s.car) * 3.6),
    heat: Math.ceil(s.heat), hidden: s.hidden, busted: s.busted, driving: s.driving, nearby: Boolean(nearestVehicle(s)),
    service: service && distance(subject(s), service) < 7 && (!nearbyCar || distance(s.player, nearbyCar) > 4) ? service : null, distance: target ? Math.round(distance(subject(s), target)) : 0,
    target, position: { ...subject(s) }, district: districtAt(subject(s)), notice: s.noticeTime > 0 || s.phase === 'ready' ? s.notice : '', delivery: s.delivery,
    panel: s.panel, xp: s.xp, completed: s.completed, earned: s.earned, cars: [...s.cars], carId: s.carId, model: s.car.model,
    weapons: structuredClone(s.weapons), weapon: s.weapon, reloading: s.reloading, hp: Math.ceil(s.player.health), armor: Math.ceil(s.player.armor),
    found: [...s.found], theme: s.theme, mission: structuredClone(s.mission), enemies: s.enemies.filter((e) => e.health > 0).length,
    nextReward: JOBS[s.job % JOBS.length].reward + Math.min(600, Math.floor(s.job / JOBS.length) * 100), mapState: s.panel === 'map' ? structuredClone(s) : null,
  }
}
const INITIAL_UI = snapshot(createGame())

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
    let career = null, saveFailed = false
    try { career = readCareer(window.localStorage) } catch { saveFailed = true }
    const game = createGame(career)
    let view
    try { view = createScene(hostRef.current, game) }
    catch {
      // Keep the Lab exit and retry action available when WebGL cannot initialize.
      queueMicrotask(() => setFailed(true))
      return
    }
    const keys = new Set()
    const touches = new Map()
    const input = { x: 0, y: 0, brake: false, fire: false, aim: null }
    let pointerDown = false, pointerAim = null, savedRevision = -1, lastSave = 0
    let raf = 0, last = 0, accumulator = 0, lastHud = 0
    let audio = null
    let frames = 0, fps = 0, fpsStart = 0
    const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

    const updateHud = () => {
      setUi({ ...snapshot(game), saveFailed })
      if (mapRef.current) drawMap(mapRef.current, game)
    }
    const persist = () => {
      if (game.phase === 'ready') return
      try { saveFailed = !saveCareer(game, window.localStorage) } catch { saveFailed = true }
      savedRevision = game.revision
    }
    const clear = () => { keys.clear(); touches.clear(); input.x = input.y = 0; input.brake = input.fire = pointerDown = false; input.aim = pointerAim = null }
    const pause = () => {
      if (game.phase === 'playing') {
        game.phase = 'paused'
        game.panel = null
        clear()
        persist()
        audio?.update(game, false)
        updateHud()
      }
    }
    const command = (action, value) => {
      if (action === 'start' && game.phase === 'ready') {
        game.phase = 'playing'
        game.noticeTime = 5
        clear()
      } else if (action === 'pause') pause()
      else if (action === 'resume' && game.phase === 'paused') game.phase = 'playing'
      else if (action === 'interact') interact(game)
      else if (action === 'recover') recover(game)
      else if (action === 'reload') reload(game)
      else if (action === 'cycle') cycleWeapon(game)
      else if (action === 'panel' && game.phase === 'playing') game.panel = value
      else if (action === 'close') game.panel = null
      else if (action === 'buyCar') purchase(game, 'car', value)
      else if (action === 'buyWeapon') purchase(game, 'weapon', value)
      else if (action === 'service') serviceAction(game, value)
      else if (action === 'contract') acceptContract(game, value)
      else if (action === 'waypoint' && game.phase === 'playing') { game.waypoint = { ...value }; game.panel = null }
      else if (action === 'theme' && ['night', 'sunset', 'rain'].includes(value)) { game.theme = value; game.revision++ }
      clear()
      persist()
      if (action !== 'pause' && !game.panel) rootRef.current?.focus({ preventScroll: true })
      audio?.resume()
      updateHud()
    }
    const onKeyDown = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, a')) return
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      if (MOVEMENT.has(e.code)) { e.preventDefault(); keys.add(e.code) }
      if (e.repeat) return
      if (e.code === 'KeyB' || e.code === 'KeyM') { e.preventDefault(); command(game.panel ? 'close' : 'panel', e.code === 'KeyM' ? 'map' : 'contracts') }
      if (e.code === 'KeyR') { e.preventDefault(); command('reload') }
      if (e.code === 'KeyQ') { e.preventDefault(); command('cycle') }
      if (e.code === 'KeyE') { e.preventDefault(); command('interact') }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault()
        setHelp(false)
        command(game.panel ? 'close' : game.phase === 'playing' ? 'pause' : 'resume')
      }
    }
    const onKeyUp = (e) => keys.delete(e.code)
    const onHidden = () => { if (document.hidden) pause() }
    const onPointerDown = (e) => { if (e.button === 0 && e.pointerType !== 'touch' && game.phase === 'playing' && !game.panel) { pointerDown = true; pointerAim = view.aim(e.clientX, e.clientY) } }
    const onPointerMove = (e) => { if (pointerDown) pointerAim = view.aim(e.clientX, e.clientY) }
    const onPointerUp = () => { pointerDown = false; pointerAim = null }
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
    window.addEventListener('pagehide', persist)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('visibilitychange', onHidden)
    view.renderer.domElement.addEventListener('webglcontextlost', lostContext)
    view.renderer.domElement.addEventListener('pointerdown', onPointerDown)
    view.renderer.domElement.addEventListener('pointermove', onPointerMove)
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
    if (debug) window.__midnight = {
      state: () => structuredClone(game), metrics: () => ({ fps, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }),
      travel(x, z) { if (!isBlocked(x, z, 3)) { Object.assign(subject(game), { x, z, vx: 0, vz: 0, speed: 0 }); updateHud() } },
    }

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
      input.fire = down('KeyF') || pointerDown
      input.aim = pointerAim
      if (game.phase === 'playing' && !game.panel) {
        accumulator += dt
        while (accumulator >= STEP) { stepGame(game, input); accumulator -= STEP }
      } else accumulator = 0
      if (game.phase !== 'playing' || game.panel) clear()
      // An inactive game does not keep repainting an unchanged city at 60 fps.
      if ((game.phase === 'playing' && !game.panel) || now - lastHud >= 100) view.render(game, dt, settings.current.calm)
      audio?.update(game, settings.current.sound && !game.panel)
      if (now - lastSave > 1500 && savedRevision !== game.revision) { persist(); lastSave = now }
      if (now - lastHud >= 100) { updateHud(); lastHud = now }
      frames++
      if (now - fpsStart >= 1000) { fps = Math.round(frames * 1000 / (now - fpsStart)); fpsStart = now; frames = 0 }
      raf = requestAnimationFrame(frame)
    }
    updateHud()
    raf = requestAnimationFrame(frame)
    return () => {
      apiRef.current = null
      persist()
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', pause)
      window.removeEventListener('pagehide', persist)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('visibilitychange', onHidden)
      media.removeEventListener('change', onMotion)
      view.renderer.domElement.removeEventListener('webglcontextlost', lostContext)
      view.renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      view.renderer.domElement.removeEventListener('pointermove', onPointerMove)
      audio?.dispose()
      view.dispose()
      if (debug) delete window.__midnight
    }
  }, [])

  const command = (name, value) => apiRef.current?.command(name, value)
  const touch = (id, code) => apiRef.current?.touch(id, code)
  const ko = lang === 'ko'
  const overlay = ui.phase !== 'playing' || Boolean(ui.panel)
  const finished = ui.phase === 'lost'
  const canInteract = ui.driving ? ui.speed < 15 : ui.nearby || ui.service
  const interactionLabel = ui.driving ? ui.speed < 15 ? t.exit : t.stop : ui.service ? (ko ? '상점 열기' : 'Open shop') : ui.nearby ? t.interact : t.nearby
  const contract = CONTRACTS.find((c) => c.id === ui.mission.type)
  const car = VEHICLES.find((v) => v.id === ui.model) || VEHICLES[0]
  const weapon = WEAPONS.find((w) => w.id === ui.weapon)
  const ammo = ui.weapons[ui.weapon]
  const objective = ui.target?.name ? (ko ? ui.target.ko || ui.target.name : ui.target.name) : ko ? contract.ko : contract.name

  return (
    <main className={`midnight${calm ? ' midnight--calm' : ''}`} ref={rootRef} tabIndex={-1} data-phase={ui.phase} data-driving={ui.driving} aria-label="Midnight Dispatch">
      <div className="midnight-scene" ref={hostRef} />
      <div className="midnight-vignette" aria-hidden="true" />
      <header className="md-topline">
        <span className="md-wordmark">MIDNIGHT<span>DISPATCH</span></span>
        <span className="md-district"><i style={{ background: ui.district.color }} />{ko ? ui.district.ko : ui.district.name} · {ui.theme.toUpperCase()}</span>
        <div className="md-utilities">
          <button type="button" className="md-network-button" onClick={() => command(ui.panel ? 'close' : 'panel', 'contracts')} disabled={ui.phase !== 'playing'} aria-label={ko ? '도시 네트워크 열기' : 'Open city network'}>☷</button>
          <button type="button" onClick={() => { setHelp(!help); if (!help) command('pause') }} aria-label={help ? t.close : t.help}>?</button>
          <button type="button" onClick={() => command(ui.phase === 'playing' ? 'pause' : 'resume')} disabled={ui.phase === 'ready' || finished} aria-label={ui.phase === 'paused' ? t.resume : t.pause}>{ui.phase === 'paused' ? '▶' : 'Ⅱ'}</button>
        </div>
      </header>

      <section className="md-dispatch" aria-label={t.dispatch}>
        <div className="md-eyebrow"><i />{t.dispatch}<span>#{String(ui.completed + 1).padStart(3, '0')}</span></div>
        <h2>{objective}</h2>
        <p>{ui.mission.type === 'bounty' ? (ko ? `남은 조직원 ${ui.enemies}명 · 하차 후 F로 사격` : `${ui.enemies} targets · Exit car, F to fire`) : ui.mission.type === 'escape' ? (ko ? '추격을 따돌려 수배를 해제하세요.' : 'Break line of sight and lose your wanted level.') : ui.mission.type === 'race' ? (ko ? `체크포인트 ${ui.mission.stage} / 4 · 출발 지점에서 타이머 시작` : `Checkpoint ${ui.mission.stage} / 4 · Timer starts at the grid`) : ui.driving ? t.deliver : `${t.controls} · E ${t.enter}`}</p>
        <div className="md-job-footer"><span>◇ {ui.distance} m {ui.mission.time !== null ? ` · ${Math.ceil(ui.mission.time)}s` : ''}</span><span>+$ {ui.mission.reward.toLocaleString()}</span></div>
        <div className={`md-shop-guide${ui.service ? ' is-nearby' : ''}`}>
          {ui.service
            ? <><b>{ui.service.icon} {ko ? ui.service.ko : ui.service.name}</b><span>{ko ? '도착 · 정차 후 B에서 구매' : 'Arrived · stop, then buy with B'}</span></>
            : <><b>{ko ? '상점 표식' : 'SHOP MARKERS'}</b><span>{ko ? 'G 차고 · A 무기점 · B에서 길 안내' : 'G garage · A armory · GPS in B'}</span></>}
        </div>
        <button type="button" className="md-contract-link" disabled={ui.phase !== 'playing'} onClick={() => command('panel', 'contracts')}>{ko ? '의뢰 · 상점 · 지도' : 'JOBS · SHOPS · MAP'} <span>B ↗</span></button>
        {ui.delivery > 0 && <div className="md-delivery" role="progressbar" aria-label={t.progress} aria-valuenow={Math.round(ui.delivery / 0.8 * 100)} aria-valuemin={0} aria-valuemax={100} style={{ '--progress': `${ui.delivery / 0.8 * 100}%` }} />}
      </section>

      <aside className="md-stats">
        <div><span>{t.cash}</span><strong className="md-cash">${ui.cash.toLocaleString().padStart(5, '0')}</strong></div>
        <div><span>{ko ? '명성' : 'REPUTATION'}</span><strong>{String(rankFor(ui.xp)).padStart(2, '0')}<small> / 05</small></strong></div>
        <div className="md-heat"><span>{ui.heat > 0 && ui.hidden > 5 ? (ko ? '수색 중' : 'SEARCHING') : t.heat}</span><strong aria-label={`${t.heat} ${ui.heat} / 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={ui.heat >= n ? 'is-hot' : ''}>★</i>)}</strong></div>
      </aside>

      <aside className="md-map">
        <div className="md-map-label"><span>4 DISTRICTS / FREE ROAM</span><span>↑ {t.north}</span></div>
        <button type="button" aria-label={ko ? '도시 지도 열기' : 'Open city map'} disabled={ui.phase !== 'playing'} onClick={() => command('panel', 'map')}><canvas width={320} height={320} ref={mapRef} role="img" aria-label={t.map} /></button>
        <div className="md-map-footer"><span>{ko ? 'G 차고 · A 무기점' : 'G GARAGE · A ARMORY'}</span><span>M ↗</span></div>
      </aside>

      <div className="md-toast" role="status" aria-live="polite">{!overlay && ui.notice ? t.notices[ui.notice] : ''}</div>

      <aside className="md-vehicle">
        <span className="md-eyebrow">{ui.driving ? car.name : weapon ? weapon.name : t.onFoot}</span>
        {ui.driving ? <div className="md-speed"><strong>{String(ui.speed).padStart(3, '0')}</strong><span>KM/H</span></div> : <div className="md-ammo"><strong>{ammo ? ui.reloading > 0 ? '···' : ammo.loaded : '—'}</strong><span>{ammo ? `/ ${ammo.reserve}` : ko ? '총기 미보유' : 'UNARMED'}</span></div>}
        <div className="md-integrity"><span>{ui.driving ? t.integrity : ko ? '체력' : 'HEALTH'}</span><span>{ui.driving ? ui.health : ui.hp}%</span></div>
        <meter min="0" max="100" low="30" value={ui.driving ? ui.health : ui.hp} aria-label={ui.driving ? t.integrity : ko ? '체력' : 'Health'} />
        <div className="md-integrity"><span>{ko ? '방탄복' : 'ARMOR'}</span><span>{ui.armor}%</span></div>
        {ui.busted > 0 && <p className="md-arrest">{ko ? '체포 위험 · 이동하세요' : 'BUSTED IN'} {Math.max(0, 3 - ui.busted).toFixed(1)}s</p>}
      </aside>

      {!overlay && <div className="md-bottom">
        <span><kbd>W A S D</kbd> {t.move}</span><span><kbd>SPACE</kbd> {t.brake}</span><span><kbd>F / CLICK</kbd> {ko ? '사격' : 'Fire'}</span><span><kbd>R</kbd> {ko ? '장전' : 'Reload'} <kbd>Q</kbd> {ko ? '무기 변경' : 'Switch'}</span>
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
          {!ui.driving && ui.weapon && <div className="md-touch-combat"><TouchButton aria-label={ko ? '사격' : 'Fire weapon'} code="KeyF" onTouch={touch}>⊕</TouchButton><button type="button" aria-label={ko ? '장전' : 'Reload'} onClick={() => command('reload')}>R</button><button type="button" aria-label={ko ? '무기 변경' : 'Switch weapon'} onClick={() => command('cycle')}>Q</button></div>}
          <button type="button" className="md-touch-enter" onClick={() => command('interact')} disabled={!canInteract}>{interactionLabel}</button>
          <TouchButton aria-label={t.brake} code="Space" onTouch={touch}>{ui.driving ? 'BRAKE' : 'RUN'}</TouchButton>
        </div>
      </div>}

      {ui.panel && !failed && <CityPanel ui={{ ...ui, panelNotice: ui.notice ? t.notices[ui.notice] : '' }} lang={lang} command={command} />}

      {(ui.phase !== 'playing' || help || failed) && <div className="md-overlay">
        <section className="md-intro" aria-labelledby="md-title">
          <p className="md-eyebrow">{t.edition}</p>
          <span className="md-intro-index" aria-hidden="true">{finished ? '×' : '04'}</span>
          <h1 id="md-title">{failed ? 'WEBGL UNAVAILABLE' : help ? t.help : ui.phase === 'ready' ? <>MIDNIGHT<br /><em>DISPATCH.</em></> : ui.phase === 'paused' ? t.paused : t.lost}</h1>
          <p className="md-subtitle">{failed ? t.error : ui.phase === 'ready' ? t.subtitle : finished ? t.lostHint : t.pauseHint}</p>
          {ui.phase === 'ready' && !failed && <p className="md-intro-copy">{t.intro}</p>}
          {finished && <div className="md-results"><span>{t.deliveries}<strong>{ui.completed}</strong></span><span>{t.cash}<strong>${ui.cash.toLocaleString()}</strong></span></div>}
          {!finished && !failed && <div className="md-keyguide"><span><kbd>W A S D</kbd>{t.move} · SPACE {t.brake}</span><span><kbd>E</kbd>{t.enter}</span><span><kbd>F / CLICK</kbd>{ko ? '사격 · R 장전 · Q 무기 변경' : 'Fire · R reload · Q switch weapon'}</span><span><kbd>B / M</kbd>{ko ? '의뢰·상점 / 도시 지도' : 'Jobs & shops / city map'}</span></div>}
          {ui.phase === 'ready' && <div className="md-save-note">{ui.completed || ui.cars.length > 1 || ui.weapon ? (ko ? `저장된 기록 · $${ui.cash.toLocaleString()} · 명성 ${rankFor(ui.xp)}` : `SAVED CAREER · $${ui.cash.toLocaleString()} · RANK ${rankFor(ui.xp)}`) : (ko ? '4개 구역 · 5종 의뢰 · 끝나지 않는 자유 주행' : '4 DISTRICTS · 5 JOB TYPES · ENDLESS FREE ROAM')}</div>}
          <div className="md-preferences">
            <label><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); apiRef.current?.sound(e.target.checked) }} />{t.sound}</label>
            <label><input type="checkbox" checked={calm} onChange={(e) => { settings.current.calm = e.target.checked; setCalm(e.target.checked) }} />{t.motion}</label>
          </div>
          <button type="button" className="md-start" onClick={() => {
            if (failed) { window.location.reload(); return }
            setHelp(false)
            command(ui.phase === 'ready' ? 'start' : finished ? 'recover' : 'resume')
          }}>{failed ? t.retry : ui.phase === 'ready' ? t.start : finished ? t.restart : t.resume}<span aria-hidden="true">↗</span></button>
          <p className="md-original">ORIGINAL CITY · TOP-DOWN 3D · {ui.saveFailed ? 'SAVE UNAVAILABLE' : 'LOCAL AUTO-SAVE'}</p>
        </section>
      </div>}
    </main>
  )
}
