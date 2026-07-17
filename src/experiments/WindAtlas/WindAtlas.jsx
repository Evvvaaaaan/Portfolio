import { useCallback, useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './WindAtlas.css'

// 실시간 전 지구 바람 지도 — Open-Meteo 격자 샘플링 + 바이리니어 보간 + 입자 이류

const LATS = [] // -75 ~ 75, step 15 (11개)
for (let la = -75; la <= 75; la += 15) LATS.push(la)
const LONS = [] // -172.5 ~ 172.5, step 15 (24개)
for (let lo = -172.5; lo <= 172.5; lo += 15) LONS.push(lo)

const WIND_KEY = 'wind-atlas:v1'
const COAST_KEY = 'coast:v1'
const WIND_TTL = 60 * 60 * 1000
const COAST_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_coastline.geojson'

async function fetchWindGrid() {
  const cached = sessionStorage.getItem(WIND_KEY)
  if (cached) {
    const { t, grid } = JSON.parse(cached)
    if (Date.now() - t < WIND_TTL) return grid
  }
  const pairs = []
  for (const la of LATS) for (const lo of LONS) pairs.push([la, lo])
  const chunks = []
  for (let i = 0; i < pairs.length; i += 88) chunks.push(pairs.slice(i, i + 88))
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const lat = chunk.map((p) => p[0]).join(',')
      const lon = chunk.map((p) => p[1]).join(',')
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m`
      )
      if (!r.ok) throw new Error(`open-meteo ${r.status}`)
      const json = await r.json()
      return Array.isArray(json) ? json : [json]
    })
  )
  const flat = results.flat()
  // grid[latIdx][lonIdx] = [u, v] (km/h, 동쪽+/북쪽+ 성분 — 기상 풍향은 '불어오는' 방향)
  const grid = LATS.map((_, li) =>
    LONS.map((__, lj) => {
      const cur = flat[li * LONS.length + lj]?.current
      if (!cur) return [0, 0]
      const sp = cur.wind_speed_10m ?? 0
      const rad = ((cur.wind_direction_10m ?? 0) * Math.PI) / 180
      return [-sp * Math.sin(rad), -sp * Math.cos(rad)]
    })
  )
  try {
    sessionStorage.setItem(WIND_KEY, JSON.stringify({ t: Date.now(), grid }))
  } catch { /* 캐시 실패는 무시 */ }
  return grid
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

function sampleGrid(grid, lat, lon) {
  const fi = (lat + 75) / 15
  const fj = (lon + 172.5) / 15
  const i0 = Math.max(0, Math.min(LATS.length - 1, Math.floor(fi)))
  const i1 = Math.min(LATS.length - 1, i0 + 1)
  const j0raw = Math.floor(fj)
  const tj = fj - j0raw
  const j0 = ((j0raw % LONS.length) + LONS.length) % LONS.length
  const j1 = (j0 + 1) % LONS.length
  const ti = Math.max(0, Math.min(1, fi - i0))
  const a = grid[i0][j0]
  const b = grid[i0][j1]
  const c = grid[i1][j0]
  const d = grid[i1][j1]
  const u = (a[0] * (1 - tj) + b[0] * tj) * (1 - ti) + (c[0] * (1 - tj) + d[0] * tj) * ti
  const v = (a[1] * (1 - tj) + b[1] * tj) * (1 - ti) + (c[1] * (1 - tj) + d[1] * tj) * ti
  return [u, v]
}

const N_PARTICLES = 4000

export default function WindAtlas() {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const flowRef = useRef(null)
  const probeRef = useRef(null)
  const dataRef = useRef({ grid: null, coast: null })
  const [status, setStatus] = useState('loading')

  const load = useCallback(() => {
    Promise.allSettled([fetchWindGrid(), fetchCoast()]).then(([wind, coast]) => {
      if (wind.status === 'rejected') {
        setStatus('error')
        return
      }
      dataRef.current.grid = wind.value
      dataRef.current.coast = coast.status === 'fulfilled' ? coast.value : null
      setStatus('ready')
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (status !== 'ready') return undefined
    const wrap = wrapRef.current
    const mapCv = mapRef.current
    const flowCv = flowRef.current
    const { grid, coast } = dataRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio, 2)

    let W = 0
    let H = 0
    let mapX = 0
    let mapY = 0
    let mapW = 0
    let mapH = 0

    const project = (lon, lat) => [mapX + ((lon + 180) / 360) * mapW, mapY + ((90 - lat) / 180) * mapH]
    const unproject = (x, y) => [((x - mapX) / mapW) * 360 - 180, 90 - ((y - mapY) / mapH) * 180]

    const drawMap = () => {
      const ctx = mapCv.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#060a12'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.07)'
      ctx.lineWidth = 1
      for (let lo = -180; lo <= 180; lo += 30) {
        const [x] = project(lo, 0)
        ctx.beginPath()
        ctx.moveTo(x, mapY)
        ctx.lineTo(x, mapY + mapH)
        ctx.stroke()
      }
      for (let la = -60; la <= 60; la += 30) {
        const [, y] = project(0, la)
        ctx.beginPath()
        ctx.moveTo(mapX, y)
        ctx.lineTo(mapX + mapW, y)
        ctx.stroke()
      }
      if (coast) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
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
    }

    const resize = () => {
      W = wrap.clientWidth
      H = wrap.clientHeight
      for (const cv of [mapCv, flowCv]) {
        cv.width = Math.round(W * dpr)
        cv.height = Math.round(H * dpr)
      }
      const pad = 24
      const availW = W - pad * 2
      const availH = H - pad * 2
      if (availW / availH > 2) {
        mapH = availH
        mapW = mapH * 2
      } else {
        mapW = availW
        mapH = mapW / 2
      }
      mapX = (W - mapW) / 2
      mapY = (H - mapH) / 2
      drawMap()
      const fctx = flowCv.getContext('2d')
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fctx.clearRect(0, 0, W, H)
    }
    resize()
    window.addEventListener('resize', resize)

    const parts = new Float32Array(N_PARTICLES * 3) // x, y, life
    const spawn = (i) => {
      parts[i * 3] = mapX + Math.random() * mapW
      parts[i * 3 + 1] = mapY + Math.random() * mapH
      parts[i * 3 + 2] = 80 + Math.random() * 120
    }
    for (let i = 0; i < N_PARTICLES; i++) spawn(i)

    const speedColor = (sp) => {
      if (sp < 12) return 'rgba(20, 84, 78, 0.55)'
      if (sp < 25) return 'rgba(45, 152, 138, 0.6)'
      if (sp < 45) return 'rgba(94, 234, 212, 0.7)'
      return 'rgba(240, 253, 250, 0.85)'
    }

    const fctx = flowCv.getContext('2d')
    const speedK = reduced ? 0.012 : 0.035
    let raf = 0
    let running = true
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      fctx.globalCompositeOperation = 'destination-out'
      fctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
      fctx.fillRect(0, 0, W, H)
      fctx.globalCompositeOperation = 'source-over'
      fctx.lineWidth = 1.1

      for (let i = 0; i < N_PARTICLES; i++) {
        const x = parts[i * 3]
        const y = parts[i * 3 + 1]
        const [lon, lat] = unproject(x, y)
        const [u, v] = sampleGrid(grid, lat, lon)
        const nx = x + u * speedK
        const ny = y - v * speedK
        parts[i * 3 + 2] -= 1
        if (
          parts[i * 3 + 2] <= 0 ||
          nx < mapX || nx > mapX + mapW || ny < mapY || ny > mapY + mapH
        ) {
          spawn(i)
          continue
        }
        const sp = Math.hypot(u, v)
        fctx.strokeStyle = speedColor(sp)
        fctx.beginPath()
        fctx.moveTo(x, y)
        fctx.lineTo(nx, ny)
        fctx.stroke()
        parts[i * 3] = nx
        parts[i * 3 + 1] = ny
      }
    }
    loop()

    // 클릭 프로브
    let probeTimer = 0
    const onClick = (e) => {
      const rect = wrap.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < mapX || x > mapX + mapW || y < mapY || y > mapY + mapH) return
      const [lon, lat] = unproject(x, y)
      const [u, v] = sampleGrid(grid, lat, lon)
      const sp = Math.hypot(u, v)
      const deg = (Math.atan2(u, v) * 180) / Math.PI // 부는 방향(→)
      const compass = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]
      const el = probeRef.current
      el.innerHTML = `<strong>${sp.toFixed(1)} km/h</strong> ${compass}쪽으로<br /><span>${lat.toFixed(1)}°, ${lon.toFixed(1)}°</span>`
      el.style.left = `${Math.min(x + 14, W - 150)}px`
      el.style.top = `${Math.max(y - 14, 16)}px`
      el.classList.add('visible')
      clearTimeout(probeTimer)
      probeTimer = setTimeout(() => el.classList.remove('visible'), 4000)
    }
    wrap.addEventListener('click', onClick)

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(probeTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
      wrap.removeEventListener('click', onClick)
    }
  }, [status])

  return (
    <div className="wind-atlas" ref={wrapRef}>
      <canvas ref={mapRef} />
      <canvas ref={flowRef} />
      <div className="wa-probe" ref={probeRef} />
      {status === 'loading' && (
        <div className="wa-status">
          <div className="wa-spinner" />
          전 지구 바람 데이터를 수집하는 중…
        </div>
      )}
      {status === 'error' && (
        <div className="wa-status">
          바람 데이터를 불러오지 못했습니다.
          <button type="button" onClick={() => { setStatus('loading'); load() }}>다시 시도</button>
        </div>
      )}
      {status === 'ready' && <p className="wa-hint">클릭 — 그 지점의 바람 확인</p>}
    </div>
  )
}
