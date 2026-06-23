import { useEffect, useRef, useState } from 'react'
import './LiveWeatherMood.css'

const CITIES = {
  seoul:     { name: '서울 · Seoul',          lat: 37.5665, lon: 126.9780 },
  london:    { name: '런던 · London',         lat: 51.5072, lon: -0.1276  },
  ny:        { name: '뉴욕 · New York',       lat: 40.7128, lon: -74.0060 },
  reykjavik: { name: '레이캬비크 · Reykjavík', lat: 64.1466, lon: -21.9426 },
  singapore: { name: '싱가포르 · Singapore',   lat: 1.3521,  lon: 103.8198 },
}

const COPY = {
  clear_day:   ['맑음',    '구름 한 점 없이, 빛이 곧장 도착하는 한낮.'],
  clear_night: ['청명',    '구름 없는 밤. 별빛이 결을 따라 떨립니다.'],
  cloud_day:   ['흐림',    '구름이 빛을 한 겹 걸러내는 오후.'],
  cloud_night: ['흐린 밤', '두꺼운 구름 아래, 색이 가라앉은 밤.'],
  fog:         ['안개',    '안개가 도시를 한 겹 지웠습니다.'],
  rain:        ['비',      '비가 내립니다. 빗줄기가 화면의 밀도가 됩니다.'],
  storm:       ['폭우',    '천둥과 함께 쏟아지는 비. 가끔 하늘이 번쩍입니다.'],
  snow:        ['눈',      '눈이 천천히 내려앉습니다.'],
  windy:       ['강풍',    '바람이 거셉니다. 모든 결이 한 방향으로 흐릅니다.'],
}

const DEMO = {
  clear: { temperature_2m:24, relative_humidity_2m:38, is_day:1, precipitation:0,   snowfall:0,   weather_code:0,  cloud_cover:4,   wind_speed_10m:8,  wind_direction_10m:200 },
  cloud: { temperature_2m:17, relative_humidity_2m:60, is_day:1, precipitation:0,   snowfall:0,   weather_code:3,  cloud_cover:88,  wind_speed_10m:14, wind_direction_10m:250 },
  rain:  { temperature_2m:13, relative_humidity_2m:88, is_day:1, precipitation:3.2, snowfall:0,   weather_code:63, cloud_cover:96,  wind_speed_10m:18, wind_direction_10m:230 },
  storm: { temperature_2m:19, relative_humidity_2m:92, is_day:0, precipitation:9.5, snowfall:0,   weather_code:95, cloud_cover:100, wind_speed_10m:34, wind_direction_10m:210 },
  snow:  { temperature_2m:-3, relative_humidity_2m:84, is_day:1, precipitation:0,   snowfall:2.4, weather_code:73, cloud_cover:95,  wind_speed_10m:10, wind_direction_10m:300 },
  fog:   { temperature_2m:9,  relative_humidity_2m:97, is_day:1, precipitation:0,   snowfall:0,   weather_code:45, cloud_cover:80,  wind_speed_10m:5,  wind_direction_10m:180 },
  wind:  { temperature_2m:21, relative_humidity_2m:42, is_day:1, precipitation:0,   snowfall:0,   weather_code:1,  cloud_cover:25,  wind_speed_10m:42, wind_direction_10m:270 },
  night: { temperature_2m:16, relative_humidity_2m:55, is_day:0, precipitation:0,   snowfall:0,   weather_code:0,  cloud_cover:6,   wind_speed_10m:9,  wind_direction_10m:160 },
}

const MANUAL_OPTS = {
  wind:  [{ l:'무풍', v:2 }, { l:'미풍', v:12 }, { l:'강풍', v:28 }, { l:'폭풍', v:52 }],
  precip:[{ l:'없음', v:0 }, { l:'이슬비', v:0.8 }, { l:'비', v:3.5 }, { l:'폭우', v:9 }],
  cloud: [{ l:'맑음', v:3 }, { l:'구름', v:40 }, { l:'흐림', v:80 }, { l:'완전', v:98 }],
  hum:   [{ l:'건조', v:25 }, { l:'보통', v:55 }, { l:'습함', v:80 }, { l:'안개', v:97 }],
  temp:  [{ l:'한파', v:-8 }, { l:'서늘', v:10 }, { l:'쾌적', v:21 }, { l:'무더위', v:33 }],
  isDay: [{ l:'낮', v:1 }, { l:'밤', v:0 }],
}
const MANUAL_LABELS = { wind:'바람', precip:'강수', cloud:'구름', hum:'습도', temp:'온도', isDay:'시간' }

function buildCustomWeather(m) {
  const snowfall = m.temp < 2 && m.precip > 0 ? m.precip : 0
  const rain = m.temp < 2 ? 0 : m.precip
  let code
  if (m.temp < 2 && m.precip > 0) code = 73
  else if (m.precip >= 8) code = 95
  else if (m.precip >= 3) code = 63
  else if (m.precip > 0) code = 61
  else if (m.hum >= 95 && m.cloud >= 60) code = 45
  else if (m.cloud >= 80) code = 3
  else if (m.cloud >= 40) code = 2
  else if (m.wind >= 40) code = 1
  else code = 0
  return {
    temperature_2m: m.temp, relative_humidity_2m: m.hum,
    is_day: m.isDay, precipitation: rain, snowfall,
    weather_code: code, cloud_cover: m.cloud,
    wind_speed_10m: m.wind, wind_direction_10m: 220,
  }
}

function lerpFn(a, b, k) { return a + (b - a) * k }

function classify(code) {
  if (code === 0) return 'clear'
  if (code <= 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code >= 85 && code <= 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloud'
}

function tempToAccent(tempC) {
  const c = Math.max(-10, Math.min(35, tempC))
  if (c <= 10) { const k = (c + 10) / 20; return [0.78, 0.13, lerpFn(220, 150, k)] }
  const k = (c - 10) / 25; return [0.80, lerpFn(0.13, 0.17, k), lerpFn(80, 38, k)]
}

function moodFromWeather(c) {
  const cat = classify(c.weather_code)
  const isDay = c.is_day === 1
  const wind = c.wind_speed_10m
  const windInt = Math.max(0.08, Math.min(1, wind / 45))
  const windAng = (c.wind_direction_10m || 0) * Math.PI / 180 + Math.PI / 2
  const cloud = c.cloud_cover
  const hum = c.relative_humidity_2m
  const precip = c.precipitation
  const snowfall = c.snowfall
  const [accL, accC, accH] = tempToAccent(c.temperature_2m)

  let sky, ink, drv = { rain: 0, snow: 0, fog: 0, stars: 0, sun: 0, thunder: 0 }
  const cloudDarken = cloud / 100

  if (cat === 'clear') {
    if (isDay) { sky = [0.80, 0.07, 225, 0.90, 0.05, 95];  drv.sun = 0.9; ink = [0.20, 0.03, 250] }
    else       { sky = [0.16, 0.045, 265, 0.09, 0.03, 265]; drv.stars = 0.9; drv.sun = 0.18; ink = [0.95, 0.012, 250] }
  } else if (cat === 'cloud') {
    if (isDay) { sky = [lerpFn(0.78, 0.66, cloudDarken), 0.03, 235, lerpFn(0.84, 0.72, cloudDarken), 0.025, 170]; drv.sun = 0.4 * (1 - cloudDarken); ink = [0.22, 0.02, 250] }
    else       { sky = [0.20, 0.03, 260, 0.14, 0.025, 260]; drv.stars = 0.25 * (1 - cloudDarken); ink = [0.94, 0.012, 250] }
  } else if (cat === 'fog') {
    drv.fog = Math.max(0.5, hum / 100)
    if (isDay) { sky = [0.70, 0.012, 250, 0.76, 0.012, 250]; ink = [0.28, 0.015, 250] }
    else       { sky = [0.24, 0.02, 255, 0.19, 0.018, 255];  ink = [0.92, 0.012, 250] }
  } else if (cat === 'rain') {
    drv.rain = Math.max(0.25, Math.min(1, precip / 6 + 0.25))
    drv.fog = Math.min(0.4, hum / 250)
    if (isDay) { sky = [0.56, 0.03, 250, 0.62, 0.025, 245]; ink = [0.96, 0.012, 250] }
    else       { sky = [0.16, 0.03, 255, 0.11, 0.025, 255]; ink = [0.94, 0.012, 250] }
  } else if (cat === 'storm') {
    drv.rain = Math.max(0.7, Math.min(1, precip / 8 + 0.6))
    drv.thunder = 1; drv.fog = 0.2
    sky = isDay ? [0.40, 0.03, 260, 0.30, 0.03, 260] : [0.12, 0.03, 265, 0.08, 0.025, 265]
    ink = [0.95, 0.012, 250]
  } else if (cat === 'snow') {
    drv.snow = Math.max(0.35, Math.min(1, snowfall / 3 + precip / 4 + 0.35))
    if (isDay) { sky = [0.82, 0.012, 250, 0.88, 0.01, 250];  ink = [0.26, 0.015, 250] }
    else       { sky = [0.26, 0.02, 260, 0.20, 0.018, 260];  ink = [0.92, 0.012, 250] }
  }

  let key = cat + ((cat === 'clear' || cat === 'cloud') ? (isDay ? '_day' : '_night') : '')
  if ((cat === 'clear' || cat === 'cloud') && windInt > 0.62 && drv.rain === 0 && drv.snow === 0) key = 'windy'
  const [word, line] = COPY[key] || COPY[cat] || ['—', '']

  return {
    drivers: {
      skyTL: sky[0], skyTC: sky[1], skyTH: sky[2],
      skyBL: sky[3], skyBC: sky[4], skyBH: sky[5],
      inkL: ink[0], inkC: ink[1], inkH: ink[2],
      accL, accC, accH,
      rain: drv.rain, snow: drv.snow, fog: drv.fog,
      stars: drv.stars, sun: drv.sun, windInt, windAng, thunder: drv.thunder,
    },
    readout: {
      temp: Math.round(c.temperature_2m),
      wind: Math.round(wind),
      cloud: Math.round(cloud),
      hum: Math.round(hum),
      precip: precip > 0 ? precip.toFixed(1) : (snowfall > 0 ? snowfall.toFixed(1) : '0'),
      precipUnit: snowfall > 0 && precip === 0 ? 'cm' : 'mm',
      word, line,
    },
  }
}

export default function LiveWeatherMood() {
  const canvasRef    = useRef(null)
  const flashRef     = useRef(null)
  const wrapRef      = useRef(null)
  const animRef      = useRef(null)
  const timerRef     = useRef(null)
  const isManualRef  = useRef(false)

  const [manual, setManual] = useState({ wind:12, precip:0, cloud:3, hum:55, temp:21, isDay:1 })

  // All mutable animation state lives here
  const S = useRef({
    cur: {}, tgt: {},
    motes: [], drops: [], flakes: [], stars: [],
    W: 0, H: 0, dpr: 1, t: 0,
  })

  const [ui, setUi] = useState({
    city: '바깥을 읽는 중…', coord: '— · —', status: 'LIVE', pip: true,
    temp: '—', word: '—', line: '바깥의 공기를 읽는 중입니다.',
    wind: '—', rain: '—', cloud: '—', hum: '—',
    clock: '', active: '',
  })

  function fmtClock() {
    const d = new Date()
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }

  function applyMood(m) {
    Object.assign(S.current.tgt, m.drivers)
    const r = m.readout
    setUi(prev => ({
      ...prev,
      temp: String(r.temp),
      word: r.word,
      line: r.line,
      wind: r.wind + ' km/h',
      rain: r.precip + ' ' + r.precipUnit,
      cloud: r.cloud + '%',
      hum: r.hum + '%',
    }))
  }

  async function loadLive(lat, lon, name) {
    setUi(prev => ({ ...prev, status: 'LIVE', pip: true, city: name, coord: `${lat.toFixed(2)}, ${lon.toFixed(2)}` }))
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m`
      + `&timezone=auto`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('http ' + res.status)
      const j = await res.json()
      applyMood(moodFromWeather(j.current))
    } catch {
      setUi(prev => ({ ...prev, status: 'OFFLINE', pip: false, city: name + ' · 연결 실패' }))
      applyDemoMood('cloud')
    }
  }

  function startLive(lat, lon, name) {
    if (timerRef.current) clearInterval(timerRef.current)
    loadLive(lat, lon, name)
    timerRef.current = setInterval(() => loadLive(lat, lon, name), 5 * 60 * 1000)
  }

  function applyDemoMood(key) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    applyMood(moodFromWeather(DEMO[key]))
  }

  function handleCity(key) {
    isManualRef.current = false
    const c = CITIES[key]
    setUi(prev => ({ ...prev, active: 'city-' + key }))
    startLive(c.lat, c.lon, c.name)
  }

  function handleGeo() {
    isManualRef.current = false
    setUi(prev => ({ ...prev, active: 'geo', city: '내 위치 확인 중…' }))
    if (!navigator.geolocation) { startLive(CITIES.seoul.lat, CITIES.seoul.lon, '서울 · Seoul (기본)'); return }
    navigator.geolocation.getCurrentPosition(
      pos => startLive(pos.coords.latitude, pos.coords.longitude, '내 위치 · My location'),
      () => startLive(CITIES.seoul.lat, CITIES.seoul.lon, '서울 · Seoul (기본)'),
      { timeout: 7000 }
    )
  }

  function handleManualChange(key, value) {
    const next = { ...manual, [key]: value }
    setManual(next)
    isManualRef.current = true
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setUi(prev => ({ ...prev, active: 'manual', status: 'MANUAL', pip: false, city: '직접 조절 · Custom', coord: 'manual mode' }))
    applyMood(moodFromWeather(buildCustomWeather(next)))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const flash = flashRef.current
    const ctx = canvas.getContext('2d')
    const s = S.current

    // driver keys
    const DKEYS = ['skyTL','skyTC','skyTH','skyBL','skyBC','skyBH',
                   'inkL','inkC','inkH','accL','accC','accH',
                   'rain','snow','fog','stars','sun','windInt','windAng','thunder']
    DKEYS.forEach(k => { s.cur[k] = 0; s.tgt[k] = 0 })
    Object.assign(s.cur, {
      skyTL:.16, skyTC:.04, skyTH:265, skyBL:.10, skyBC:.03, skyBH:265,
      inkL:.95, inkC:.01, inkH:250, accL:.80, accC:.14, accH:70,
      rain:0, snow:0, fog:0, stars:.4, sun:0, windInt:.15, windAng:0.1, thunder:0
    })
    Object.assign(s.tgt, s.cur)

    function resize() {
      s.W = wrap.offsetWidth
      s.H = wrap.offsetHeight
      s.dpr = window.devicePixelRatio || 1
      canvas.width  = s.W * s.dpr
      canvas.height = s.H * s.dpr
      canvas.style.width  = s.W + 'px'
      canvas.style.height = s.H + 'px'
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
      initParticles()
    }

    function initParticles() {
      const { W, H } = s
      s.motes  = Array.from({ length: 160 }, () => ({ x: Math.random()*W, y: Math.random()*H, len: 8+Math.random()*26, z: 0.3+Math.random()*0.8, a: 0.04+Math.random()*0.12 }))
      s.drops  = Array.from({ length: 500 }, () => ({ x: Math.random()*W, y: Math.random()*H, len: 10+Math.random()*18, z: 0.4+Math.random()*0.9, off: Math.random() }))
      s.flakes = Array.from({ length: 300 }, () => ({ x: Math.random()*W, y: Math.random()*H, r: 1+Math.random()*2.4, z: 0.4+Math.random()*0.9, ph: Math.random()*Math.PI*2, off: Math.random() }))
      s.stars  = Array.from({ length: 160 }, () => ({ x: Math.random()*W, y: Math.random()*H*0.85, r: Math.random()*1.3+0.2, tw: Math.random()*Math.PI*2, a: 0.3+Math.random()*0.7 }))
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    function frame() {
      const { cur, tgt, W, H } = s
      s.t++
      const t = s.t
      for (const k of DKEYS) cur[k] = lerpFn(cur[k], tgt[k], 0.04)

      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, `oklch(${cur.skyTL} ${cur.skyTC} ${cur.skyTH})`)
      g.addColorStop(1, `oklch(${cur.skyBL} ${cur.skyBC} ${cur.skyBH})`)
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

      // sun / moon glow
      if (cur.sun > 0.01) {
        const sx = W*0.74, sy = H*0.30
        const rad = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W,H)*0.5)
        rad.addColorStop(0, `oklch(0.96 0.10 ${cur.accH} / ${cur.sun*0.55})`)
        rad.addColorStop(0.4, `oklch(0.9 0.06 ${cur.accH} / ${cur.sun*0.12})`)
        rad.addColorStop(1, `oklch(0.9 0.06 ${cur.accH} / 0)`)
        ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H)
      }

      // stars
      if (cur.stars > 0.01) {
        for (const st of s.stars) {
          st.tw += 0.02
          const tw = 0.5 + Math.abs(Math.sin(st.tw)) * 0.5
          ctx.fillStyle = `oklch(0.96 0.02 250 / ${cur.stars * st.a * tw})`
          ctx.fillRect(st.x, st.y, st.r, st.r)
        }
      }

      // wind texture
      const wAng = cur.windAng
      const wspd = 0.6 + cur.windInt * 9
      const dx = Math.cos(wAng), dy = Math.sin(wAng)
      ctx.lineCap = 'round'
      for (const m of s.motes) {
        m.x += dx*wspd*m.z; m.y += dy*wspd*m.z*0.5 + 0.15
        if (m.x > W+30) m.x = -30; if (m.x < -30) m.x = W+30
        if (m.y > H+30) m.y = -30; if (m.y < -30) m.y = H+30
        const L = m.len * (0.5 + cur.windInt * 1.8)
        ctx.strokeStyle = `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH} / ${m.a*(0.4+cur.windInt)})`
        ctx.lineWidth = 0.6 * m.z
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x-dx*L, m.y-dy*L); ctx.stroke()
      }

      // gust streaks
      if (cur.windInt > 0.5 && Math.random() < cur.windInt * 0.3) {
        const gy = Math.random() * H
        ctx.strokeStyle = `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH} / ${0.06*cur.windInt})`
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(-40, gy); ctx.lineTo(W+40, gy+dy*120); ctx.stroke()
      }

      // rain
      if (cur.rain > 0.01) {
        const n = Math.floor(cur.rain * s.drops.length)
        const slant = dx * cur.windInt * 6
        for (let i = 0; i < n; i++) {
          const d = s.drops[i]
          d.y += (12+d.z*10)*(0.6+cur.rain*0.8); d.x += slant*d.z
          if (d.y > H) { d.y = -20; d.x = Math.random()*W }
          if (d.x > W+20) d.x = -20; if (d.x < -20) d.x = W+20
          ctx.strokeStyle = `oklch(0.86 0.04 230 / ${(0.15+d.z*0.3)*Math.min(1,cur.rain*1.6)})`
          ctx.lineWidth = 0.5 + d.z * 1.0
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x-slant*0.5, d.y-d.len*(0.6+d.z*0.6)); ctx.stroke()
        }
      }

      // snow
      if (cur.snow > 0.01) {
        const n = Math.floor(cur.snow * s.flakes.length)
        for (let i = 0; i < n; i++) {
          const f = s.flakes[i]
          f.ph += 0.02; f.y += (0.6+f.z*1.4)*(0.7+cur.snow*0.6); f.x += Math.sin(f.ph)*0.6 + dx*cur.windInt*2.5
          if (f.y > H) { f.y = -10; f.x = Math.random()*W }
          if (f.x > W+10) f.x = -10; if (f.x < -10) f.x = W+10
          ctx.fillStyle = `oklch(0.97 0.01 250 / ${(0.4+f.z*0.5)*Math.min(1,cur.snow*1.5)})`
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r*f.z, 0, Math.PI*2); ctx.fill()
        }
      }

      // fog
      if (cur.fog > 0.01) {
        const breath = 0.5 + Math.sin(t * 0.01) * 0.5
        for (let i = 0; i < 3; i++) {
          const fy = H * (0.4 + i * 0.2)
          const fg = ctx.createLinearGradient(0, fy-120, 0, fy+120)
          const op = cur.fog * (0.12 + i*0.05) * (0.7 + breath*0.3)
          fg.addColorStop(0, `oklch(${cur.skyBL+0.08} 0.01 ${cur.skyBH} / 0)`)
          fg.addColorStop(0.5, `oklch(${cur.skyBL+0.1} 0.008 ${cur.skyBH} / ${op})`)
          fg.addColorStop(1, `oklch(${cur.skyBL+0.08} 0.01 ${cur.skyBH} / 0)`)
          ctx.fillStyle = fg; ctx.fillRect(0, fy-120, W, 240)
        }
      }

      // lightning
      if (cur.thunder > 0.5 && Math.random() < 0.006) {
        flash.style.transition = 'none'; flash.style.opacity = '0.85'
        setTimeout(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0' }, 60)
        setTimeout(() => {
          flash.style.transition = 'none'; flash.style.opacity = '0.5'
          setTimeout(() => { flash.style.transition = 'opacity .4s'; flash.style.opacity = '0' }, 50)
        }, 180)
      }

      // push CSS vars
      const root = wrap.style
      root.setProperty('--lw-ink',      `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH})`)
      root.setProperty('--lw-ink-soft', `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH} / 0.62)`)
      root.setProperty('--lw-ink-mute', `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH} / 0.40)`)
      root.setProperty('--lw-rule',     `oklch(${cur.inkL} ${cur.inkC} ${cur.inkH} / 0.18)`)
      root.setProperty('--lw-accent',   `oklch(${cur.accL} ${cur.accC} ${cur.accH})`)

      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)

    // clock
    setUi(prev => ({ ...prev, clock: fmtClock() }))
    const clockInterval = setInterval(() => setUi(prev => ({ ...prev, clock: fmtClock() })), 10000)

    // boot
    let done = false
    const fallback = () => {
      if (done) return; done = true
      setUi(prev => ({ ...prev, active: 'city-seoul' }))
      startLive(CITIES.seoul.lat, CITIES.seoul.lon, '서울 · Seoul')
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (done) return; done = true
          setUi(prev => ({ ...prev, active: 'geo' }))
          startLive(pos.coords.latitude, pos.coords.longitude, '내 위치 · My location')
        },
        () => fallback(),
        { timeout: 6000 }
      )
      setTimeout(fallback, 6500)
    } else fallback()

    return () => {
      cancelAnimationFrame(animRef.current)
      clearInterval(clockInterval)
      if (timerRef.current) clearInterval(timerRef.current)
      ro.disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isOn = (key) => ui.active === key ? 'lw-chip on' : 'lw-chip'

  return (
    <div className="lw-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="lw-sky" />
      <div ref={flashRef} className="lw-flash" />

      <div className="lw-stage">
        <header className="lw-head">
          <div className="lw-where">
            <span className="lw-city">{ui.city}</span>
            <span className="lw-coord">{ui.coord}</span>
          </div>
          <div className="lw-stat">
            {ui.pip && <span className="lw-pip" />}
            <span>{ui.status}</span>
            <span className="lw-clock">{ui.clock}</span>
          </div>
        </header>

        <section className="lw-center">
          <div className="lw-temp">
            <span className="lw-temp-n">{ui.temp}</span>
            <span className="lw-temp-deg">°</span>
          </div>
          <div className="lw-word">{ui.word}</div>
          <p className="lw-line">{ui.line}</p>
        </section>

        <footer className="lw-foot">
          <div className="lw-readings">
            <div className="lw-reading">
              <span className="lw-reading-k">바람 · Wind</span>
              <span className="lw-reading-v">{ui.wind}</span>
              <span className="lw-reading-drv">→ <b>텍스처</b> 의 결과 속도</span>
            </div>
            <div className="lw-reading">
              <span className="lw-reading-k">강수 · Precip</span>
              <span className="lw-reading-v">{ui.rain}</span>
              <span className="lw-reading-drv">→ <b>밀도</b> · 빗줄기의 수</span>
            </div>
            <div className="lw-reading">
              <span className="lw-reading-k">구름 · Cloud</span>
              <span className="lw-reading-v">{ui.cloud}</span>
              <span className="lw-reading-drv">→ <b>색조</b> 와 명도</span>
            </div>
            <div className="lw-reading">
              <span className="lw-reading-k">습도 · Humidity</span>
              <span className="lw-reading-v">{ui.hum}</span>
              <span className="lw-reading-drv">→ <b>안개</b> 의 두께</span>
            </div>
          </div>

          <div className="lw-controls">
            <div className="lw-chips">
              <span className="lw-glab">실제 도시</span>
              {Object.entries(CITIES).map(([key, c]) => (
                <button key={key} className={isOn('city-' + key)} onClick={() => handleCity(key)}>
                  {c.name.split(' · ')[0]}
                </button>
              ))}
              <button className={isOn('geo')} onClick={handleGeo}>내 위치</button>
            </div>
            <div className="lw-manual">
              {Object.entries(MANUAL_OPTS).map(([key, opts]) => (
                <div key={key} className="lw-manual-row">
                  <span className="lw-glab">{MANUAL_LABELS[key]}</span>
                  {opts.map(opt => (
                    <button
                      key={opt.v}
                      className={manual[key] === opt.v && ui.active === 'manual' ? 'lw-chip on' : 'lw-chip'}
                      onClick={() => handleManualChange(key, opt.v)}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
