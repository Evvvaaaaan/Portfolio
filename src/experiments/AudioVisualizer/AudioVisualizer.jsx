import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'

export default function AudioVisualizer() {
  const canvasRef = useRef()
  const stateRef = useRef({ running: false, ctx: null, osc: null, analyser: null, raf: null, t: 0 })
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState('bars')
  const modeRef = useRef('bars')
  useEffect(() => { modeRef.current = mode }, [mode])

  const draw = (c, data, W, H, t) => {
    c.fillStyle = 'rgba(10,10,15,0.25)'
    c.fillRect(0, 0, W, H)
    const m = modeRef.current

    if (m === 'bars') {
      const bw = W / (data.length / 2)
      for (let i = 0; i < data.length / 2; i++) {
        const h = (data[i] / 255) * H * 0.85
        c.fillStyle = `hsl(${(i / (data.length / 2)) * 220 + 180},80%,60%)`
        c.fillRect(i * bw, H - h, bw - 1, h)
      }
    } else if (m === 'circle') {
      const cx = W/2, cy = H/2, r = Math.min(W, H) * 0.22
      c.beginPath()
      for (let i = 0; i <= data.length; i++) {
        const angle = (i / data.length) * Math.PI * 2 - Math.PI/2
        const amp = 1 + (data[i % data.length] / 255) * 0.8
        const x = cx + Math.cos(angle) * r * amp
        const y = cy + Math.sin(angle) * r * amp
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)
      }
      c.closePath()
      c.strokeStyle = `hsl(${200 + (t * 30) % 160},80%,60%)`
      c.lineWidth = 2
      c.stroke()
    } else {
      const step = W / data.length
      c.beginPath()
      for (let i = 0; i < data.length; i++) {
        const y = H/2 + ((data[i] - 128) / 128) * H * 0.4
        i === 0 ? c.moveTo(0, y) : c.lineTo(i * step, y)
      }
      c.strokeStyle = `hsl(${180 + (t * 20) % 120},80%,60%)`
      c.lineWidth = 2
      c.stroke()
    }
  }

  const start = async () => {
    const s = stateRef.current
    if (s.running) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512

    // Three oscillators for a richer sound
    const freqs = [110, 165, 220]
    const oscs = freqs.map(f => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sawtooth'
      o.frequency.value = f
      g.gain.value = 0.03
      o.connect(g)
      g.connect(analyser)
      o.start()
      return o
    })
    analyser.connect(ctx.destination)

    Object.assign(s, { running: true, ctx, oscs, analyser, t: 0 })
    setRunning(true)

    const canvas = canvasRef.current
    const c = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      s.t += 0.02
      oscs[0].frequency.value = 110 + Math.sin(s.t) * 60 + Math.sin(s.t * 2.7) * 30
      oscs[1].frequency.value = 165 + Math.sin(s.t * 1.3) * 45
      oscs[2].frequency.value = 220 + Math.cos(s.t * 0.7) * 55

      analyser.getByteFrequencyData(data)
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      canvas.width = W; canvas.height = H
      draw(c, data, W, H, s.t)
      s.raf = requestAnimationFrame(tick)
    }
    tick()
  }

  const stop = () => {
    const s = stateRef.current
    s.oscs?.forEach(o => { try { o.stop() } catch {} })
    s.ctx?.close()
    cancelAnimationFrame(s.raf)
    s.running = false
    setRunning(false)
  }

  useEffect(() => () => stop(), [])

  return (
    <div className="exp-wrap">
      {!running && <span className="exp-hint">시작을 눌러 시각화</span>}
      <canvas ref={canvasRef} />
      <div className="exp-controls">
        <button className="exp-btn" onClick={running ? stop : start}>{running ? '정지' : '시작'}</button>
        {['bars', 'circle', 'wave'].map(m => (
          <button key={m} className={`exp-btn${mode===m?' active':''}`} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
    </div>
  )
}
