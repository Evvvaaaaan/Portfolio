import { useCallback, useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './SeismicEcho.css'

// 지난 30일 지구의 맥박 — USGS 지진 데이터 시간 리플레이

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
const QUAKE_KEY = 'seismic-echo:v1'
const QUAKE_TTL = 60 * 60 * 1000
const COAST_KEY = 'coast:v1'
const COAST_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_coastline.geojson'
const REPLAY_SEC = 90

async function fetchQuakes() {
  const cached = sessionStorage.getItem(QUAKE_KEY)
  if (cached) {
    const { t, quakes } = JSON.parse(cached)
    if (Date.now() - t < QUAKE_TTL) return quakes
  }
  const r = await fetch(USGS_URL)
  if (!r.ok) throw new Error(`usgs ${r.status}`)
  const geo = await r.json()
  const quakes = geo.features
    .map((f) => ({
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      mag: f.properties.mag ?? 0,
      time: f.properties.time,
      place: f.properties.place ?? 'unknown',
    }))
    .filter((q) => q.mag >= 2.5)
    .sort((a, b) => a.time - b.time)
  try {
    sessionStorage.setItem(QUAKE_KEY, JSON.stringify({ t: Date.now(), quakes }))
  } catch { /* 캐시 실패는 무시 */ }
  return quakes
}

async function fetchCoast() {
  const cached = sessionStorage.getItem(COAST_KEY)
  if (cached) return JSON.parse(cached)
  const r = await fetch(COAST_URL)
  if (!r.ok) throw new Error(`coast ${r.status}`)
  const geo = await r.json()
  const lines = []
  for (const f of geo.features) {
    const g = f.geometry
    if (g.type === 'LineString') lines.push(g.coordinates)
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates)
  }
  try {
    sessionStorage.setItem(COAST_KEY, JSON.stringify(lines))
  } catch { /* 캐시 실패는 무시 */ }
  return lines
}

const magColor = (m, a) => {
  if (m < 4) return `rgba(56, 189, 248, ${a})`
  if (m < 5.5) return `rgba(250, 204, 21, ${a})`
  if (m < 6.5) return `rgba(251, 146, 60, ${a})`
  return `rgba(239, 68, 68, ${a})`
}

const fmtDate = (ms) =>
  new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function SeismicEcho() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const scrubRef = useRef(null)
  const clockRef = useRef(null)
  const dataRef = useRef({ quakes: null, coast: null })
  const playheadRef = useRef({ t: 0, playing: true })
  const [status, setStatus] = useState('loading')
  const [maxQuake, setMaxQuake] = useState(null)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const load = useCallback(() => {
    Promise.allSettled([fetchQuakes(), fetchCoast()]).then(([quakes, coast]) => {
      if (quakes.status === 'rejected' || quakes.value.length === 0) {
        setStatus('error')
        return
      }
      dataRef.current.quakes = quakes.value
      dataRef.current.coast = coast.status === 'fulfilled' ? coast.value : null
      setMaxQuake(quakes.value.reduce((a, b) => (b.mag > a.mag ? b : a)))
      setStatus('ready')
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (status !== 'ready') return undefined
    const wrap = wrapRef.current
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const { quakes, coast } = dataRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio, 2)

    const t0 = quakes[0].time
    const t1 = quakes[quakes.length - 1].time
    const span = Math.max(t1 - t0, 1)
    const playhead = playheadRef.current
    playhead.t = 0
    playhead.playing = !reduced

    let W = 0
    let H = 0
    let mapX = 0
    let mapY = 0
    let mapW = 0
    let mapH = 0
    const project = (lon, lat) => [mapX + ((lon + 180) / 360) * mapW, mapY + ((90 - lat) / 180) * mapH]

    const resize = () => {
      W = wrap.clientWidth
      H = wrap.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const pad = 32
      const availW = W - pad * 2
      const availH = H - pad * 2 - 60
      if (availW / availH > 2) {
        mapH = availH
        mapW = mapH * 2
      } else {
        mapW = availW
        mapH = mapW / 2
      }
      mapX = (W - mapW) / 2
      mapY = (H - 60 - mapH) / 2
    }
    resize()
    window.addEventListener('resize', resize)

    const RIPPLE_SEC = 2.6
    let raf = 0
    let running = true
    let last = performance.now()
    let count = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (playhead.playing) {
        playhead.t = (playhead.t + dt / REPLAY_SEC) % 1
      }
      const vt = t0 + playhead.t * span

      ctx.fillStyle = '#05070c'
      ctx.fillRect(0, 0, W, H)

      // 해안선
      if (coast) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const line of coast) {
          for (let i = 0; i < line.length; i++) {
            const [x, y] = project(line[i][0], line[i][1])
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      // 지진: 이미 지난 것은 잔광 점, 최근 RIPPLE_SEC(가상시간)는 파문
      count = 0
      const rippleSpan = (RIPPLE_SEC / REPLAY_SEC) * span
      for (const q of quakes) {
        if (q.time > vt) break
        count++
        const [x, y] = project(q.lon, q.lat)
        const age = vt - q.time
        if (age < rippleSpan) {
          const k = age / rippleSpan
          const rMax = q.mag * q.mag * 1.6
          const r = 2 + k * rMax
          ctx.strokeStyle = magColor(q.mag, (1 - k) * 0.9)
          ctx.lineWidth = q.mag >= 6 ? 2 : 1.2
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.stroke()
          if (q.mag >= 6) {
            ctx.beginPath()
            ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        ctx.fillStyle = magColor(q.mag, Math.min(0.08 + q.mag * 0.02, 0.3))
        ctx.beginPath()
        ctx.arc(x, y, Math.max(q.mag - 1.6, 0.8), 0, Math.PI * 2)
        ctx.fill()
      }

      // 스크러버/시계 갱신
      if (scrubRef.current) scrubRef.current.value = String(playhead.t * 1000)
      if (clockRef.current) clockRef.current.textContent = `${fmtDate(vt)} · 누적 ${count}건`
    }
    loop()

    const onVis = () => {
      running = !document.hidden
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [status])

  const jumpTo = (frac) => {
    playheadRef.current.t = Math.max(0, Math.min(0.999, frac))
  }

  return (
    <div className="seismic-echo" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {status === 'loading' && (
        <div className="se-status">
          <div className="se-spinner" />
          USGS 지진 데이터를 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div className="se-status">
          지진 데이터를 불러오지 못했습니다.
          <button type="button" onClick={() => { setStatus('loading'); load() }}>다시 시도</button>
        </div>
      )}
      {status === 'ready' && (
        <>
          {maxQuake && (
            <button
              type="button"
              className="se-max"
              onClick={() => {
                const { quakes } = dataRef.current
                const t0 = quakes[0].time
                const span = Math.max(quakes[quakes.length - 1].time - t0, 1)
                jumpTo((maxQuake.time - t0) / span - 0.01)
              }}
            >
              최대 규모 M{maxQuake.mag.toFixed(1)}
              <span>{maxQuake.place}</span>
            </button>
          )}
          <div className="se-bar">
            <button
              type="button"
              className="se-play"
              aria-label={paused ? '재생' : '일시정지'}
              onClick={() => {
                playheadRef.current.playing = paused
                setPaused(!paused)
              }}
            >
              {paused ? '▶' : '⏸'}
            </button>
            <input
              ref={scrubRef}
              type="range"
              min="0"
              max="1000"
              defaultValue="0"
              aria-label="타임라인"
              onPointerDown={() => {
                playheadRef.current.playing = false
              }}
              onPointerUp={() => {
                playheadRef.current.playing = !paused
              }}
              onChange={(e) => jumpTo(Number(e.target.value) / 1000)}
            />
            <span className="se-clock" ref={clockRef} />
          </div>
        </>
      )}
    </div>
  )
}
