import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './VoiceBloom.css'

// 목소리가 정원이 됩니다 — 저음은 줄기, 고음은 꽃, 중음은 반딧불

const MAX_STEMS = 12
const PENTATONIC = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]

export default function VoiceBloom() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('idle') // idle | mic | demo
  const [micError, setMicError] = useState('')

  useEffect(() => {
    if (mode === 'idle') return undefined
    const wrap = wrapRef.current
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio, 2)
    let cancelled = false
    let audio = null
    let stream = null
    let raf = 0
    let running = true

    let W = 0
    let H = 0
    const resize = () => {
      W = wrap.clientWidth
      H = wrap.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    // 정원 상태
    const stems = Array.from({ length: MAX_STEMS }, (_, i) => ({
      baseX: ((i + 0.5) / MAX_STEMS + (Math.random() - 0.5) * 0.05),
      len: 0,
      maxLen: 0.38 + Math.random() * 0.3, // H 비율
      phase: Math.random() * Math.PI * 2,
      sway: 14 + Math.random() * 18,
      hueShift: Math.random(),
      cooldown: 0,
    }))
    const flowers = [] // {sx(비율), lenAt, size, hue, bloom}
    const flies = [] // {x, y, vx, vy, life}
    let vitality = 1
    let lastLoud = performance.now()

    const bands = { bass: 0, mid: 0, treble: 0 }
    let demoTimer = 0

    ;(async () => {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)()
        const analyser = audio.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.7

        if (mode === 'mic') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          audio.createMediaStreamSource(stream).connect(analyser)
        } else {
          // 내장 신스 — 베이스 랜덤워크 + 펜타토닉 멜로디
          const master = audio.createGain()
          master.gain.value = 0.12
          master.connect(analyser)
          master.connect(audio.destination)

          const bassOsc = audio.createOscillator()
          bassOsc.type = 'sine'
          bassOsc.frequency.value = 82
          const bassGain = audio.createGain()
          bassGain.gain.value = 0.5
          bassOsc.connect(bassGain).connect(master)
          bassOsc.start()

          const melOsc = audio.createOscillator()
          melOsc.type = 'square'
          const melGain = audio.createGain()
          melGain.gain.value = 0
          melOsc.connect(melGain).connect(master)
          melOsc.start()

          const schedule = () => {
            if (cancelled) return
            const t = audio.currentTime
            bassOsc.frequency.linearRampToValueAtTime(55 + Math.random() * 55, t + 0.8)
            if (Math.random() < 0.75) {
              melOsc.frequency.setValueAtTime(PENTATONIC[(Math.random() * PENTATONIC.length) | 0] * (Math.random() < 0.3 ? 2 : 1), t)
              melGain.gain.cancelScheduledValues(t)
              melGain.gain.setValueAtTime(0.001, t)
              melGain.gain.exponentialRampToValueAtTime(0.6, t + 0.04)
              melGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
            }
            demoTimer = setTimeout(schedule, 380 + Math.random() * 300)
          }
          schedule()
        }
        await audio.resume()

        const freq = new Uint8Array(analyser.frequencyBinCount)
        const binHz = audio.sampleRate / analyser.fftSize
        const bandAvg = (lo, hi) => {
          const i0 = Math.max(1, Math.round(lo / binHz))
          const i1 = Math.min(freq.length - 1, Math.round(hi / binHz))
          let s = 0
          for (let i = i0; i <= i1; i++) s += freq[i]
          return s / ((i1 - i0 + 1) * 255)
        }
        // 신스처럼 배음이 듬성한 선 스펙트럼은 평균이 희석되므로 피크를 함께 본다
        const bandPeak = (lo, hi) => {
          const i0 = Math.max(1, Math.round(lo / binHz))
          const i1 = Math.min(freq.length - 1, Math.round(hi / binHz))
          let m = 0
          for (let i = i0; i <= i1; i++) if (freq[i] > m) m = freq[i]
          return m / 255
        }
        const smooth = (prev, cur) => prev + (cur - prev) * (cur > prev ? 0.3 : 0.05)

        const loop = () => {
          raf = requestAnimationFrame(loop)
          if (!running) return
          analyser.getByteFrequencyData(freq)
          bands.bass = smooth(bands.bass, bandAvg(40, 250))
          bands.mid = smooth(bands.mid, Math.max(bandAvg(250, 2000), bandPeak(250, 2000) * 0.5))
          bands.treble = smooth(bands.treble, Math.max(bandAvg(1200, 8000), bandPeak(1200, 8000) * 0.72))
          const total = bands.bass + bands.mid + bands.treble
          const now = performance.now()
          if (total > 0.09) lastLoud = now

          // 3초 무음이면 시들고, 완전히 시들면 새 정원
          if (now - lastLoud > 3000) {
            vitality = Math.max(0, vitality - 0.006)
            if (vitality === 0 && total > 0.09) vitality = 0.01
          } else if (vitality < 1) {
            if (vitality < 0.05) {
              stems.forEach((s) => {
                s.len = 0
              })
              flowers.length = 0
            }
            vitality = Math.min(1, vitality + 0.02)
          }

          // 성장
          for (const s of stems) {
            s.len = Math.min(s.maxLen, s.len + bands.bass * 0.004)
            s.cooldown = Math.max(0, s.cooldown - 1)
          }
          if (bands.treble > 0.22) {
            const grown = stems.filter((s) => s.len > s.maxLen * 0.45 && s.cooldown === 0)
            if (grown.length) {
              const s = grown[(Math.random() * grown.length) | 0]
              s.cooldown = 50
              flowers.push({
                stem: s,
                at: 0.75 + Math.random() * 0.25,
                size: 10 + bands.treble * 44,
                petals: 5 + ((Math.random() * 4) | 0),
                hue: (300 + bands.mid * 240 + s.hueShift * 40) % 360,
                bloom: 0,
              })
            }
          }
          const targetFlies = Math.round(bands.mid * 40)
          while (flies.length < targetFlies) {
            flies.push({ x: Math.random() * W, y: H * (0.3 + Math.random() * 0.5), vx: 0, vy: 0, life: 1 })
          }

          // ── 그리기 ──
          const g = ctx.createLinearGradient(0, 0, 0, H)
          g.addColorStop(0, '#040608')
          g.addColorStop(0.75, '#0a0d12')
          g.addColorStop(1, '#12100c')
          ctx.fillStyle = g
          ctx.fillRect(0, 0, W, H)

          ctx.globalAlpha = 0.25 + vitality * 0.75
          const sway = Math.sin(now * 0.001)

          const stemPoint = (s, k) => {
            // k: 0(뿌리)→1(끝)
            const y = H - k * s.len * H
            const x = s.baseX * W + Math.sin(k * 4 + s.phase + sway * 0.6) * s.sway * k
            return [x, y]
          }

          for (const s of stems) {
            if (s.len < 0.01) continue
            ctx.strokeStyle = `hsl(${110 + s.hueShift * 40}, 45%, ${18 + bands.bass * 30}%)`
            ctx.lineWidth = 2.4 - s.len
            ctx.beginPath()
            for (let k = 0; k <= 1; k += 0.08) {
              const [x, y] = stemPoint(s, k)
              if (k === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.stroke()
            // 잎
            ctx.fillStyle = `hsla(${120 + s.hueShift * 30}, 40%, 26%, 0.8)`
            for (const lk of [0.35, 0.6]) {
              if (s.len > s.maxLen * lk) {
                const [x, y] = stemPoint(s, lk)
                ctx.beginPath()
                ctx.ellipse(x + 7, y, 9, 3.4, -0.5 + sway * 0.2, 0, Math.PI * 2)
                ctx.fill()
              }
            }
          }

          for (const f of flowers) {
            f.bloom = Math.min(1, f.bloom + 0.03)
            const [x, y] = stemPoint(f.stem, f.at * (f.stem.len / f.stem.maxLen))
            const r = f.size * f.bloom
            for (let i = 0; i < f.petals; i++) {
              const a = (i / f.petals) * Math.PI * 2 + sway * 0.15
              ctx.fillStyle = `hsla(${f.hue}, 75%, ${58 + f.bloom * 10}%, ${0.5 * f.bloom})`
              ctx.beginPath()
              ctx.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.5, r * 0.22, a, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.fillStyle = `hsla(${(f.hue + 60) % 360}, 85%, 70%, ${0.85 * f.bloom})`
            ctx.beginPath()
            ctx.arc(x, y, r * 0.18, 0, Math.PI * 2)
            ctx.fill()
          }

          for (let i = flies.length - 1; i >= 0; i--) {
            const fl = flies[i]
            fl.vx += (Math.random() - 0.5) * 0.12
            fl.vy += (Math.random() - 0.5) * 0.12 - 0.005
            fl.vx *= 0.97
            fl.vy *= 0.97
            fl.x += fl.vx
            fl.y += fl.vy
            fl.life -= 0.003
            if (fl.life <= 0 || flies.length > targetFlies + 6) {
              flies.splice(i, 1)
              continue
            }
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.004 + fl.x))
            ctx.fillStyle = `rgba(253, 230, 138, ${0.55 * tw * fl.life})`
            ctx.beginPath()
            ctx.arc(fl.x, fl.y, 1.6, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1

          // 3대역 미니 스펙트럼
          const bx = W / 2 - 60
          const labels = [
            ['bass', '#84cc16'],
            ['mid', '#fde68a'],
            ['treble', '#f472b6'],
          ]
          labels.forEach(([key, color], i) => {
            const v = bands[key]
            ctx.fillStyle = 'rgba(148, 163, 184, 0.15)'
            ctx.fillRect(bx + i * 44, H - 26, 32, 4)
            ctx.fillStyle = color
            ctx.fillRect(bx + i * 44, H - 26, 32 * Math.min(v * 1.6, 1), 4)
          })
        }
        loop()
      } catch (err) {
        if (!cancelled && mode === 'mic') {
          setMicError(err.name === 'NotAllowedError' ? '마이크 권한이 거부되어 데모 모드로 전환했습니다.' : '마이크를 사용할 수 없어 데모 모드로 전환했습니다.')
          setMode('demo')
        }
      }
    })()

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(demoTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
      stream?.getTracks().forEach((t) => t.stop())
      audio?.close()
    }
  }, [mode])

  return (
    <div className="voice-bloom" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {mode === 'idle' && (
        <div className="vb-overlay">
          <h2>Voice Bloom</h2>
          <p>
            목소리로 정원을 피우려면 마이크 권한이 필요합니다.
            <br />
            소리는 저장되지 않습니다.
          </p>
          <div className="vb-actions">
            <button type="button" className="vb-primary" onClick={() => setMode('mic')}>
              마이크 시작
            </button>
            <button type="button" onClick={() => setMode('demo')}>
              데모 연주 듣기
            </button>
          </div>
          <p className="vb-gesture-hint">낮은 음 — 줄기 성장 · 높은 음 — 개화 · 중간 음 — 반딧불</p>
        </div>
      )}
      {mode === 'demo' && <div className="vb-badge">데모 모드{micError ? ` — ${micError}` : ' — 내장 신스가 연주 중'}</div>}
      {mode === 'mic' && <div className="vb-badge">🎙 소리를 내보세요 — 낮은 음은 줄기, 높은 음은 꽃</div>}
    </div>
  )
}
