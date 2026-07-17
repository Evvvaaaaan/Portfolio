import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './PosterLab.css'

// 시드 하나 = 포스터 한 장 — 스위스 스타일 제너러티브 포스터 도구

const PW = 1400
const PH = 1980 // A 시리즈 비율(1:√2)

const PALETTES = [
  { name: '적 / 아이보리', bg: '#f4f1ea', fg: '#141414', accent: '#e63329' },
  { name: '청 / 크림', bg: '#f5efe0', fg: '#16324f', accent: '#2f6bff' },
  { name: '흑백', bg: '#f2f2f2', fg: '#0a0a0a', accent: '#8a8a8a' },
  { name: '형광 연두 / 흑', bg: '#0e0e0e', fg: '#f2f2ea', accent: '#c8f542' },
  { name: '코발트 / 오렌지', bg: '#10269c', fg: '#f4f1ea', accent: '#ff5b1f' },
]

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawPoster(cv, { seed, paletteIdx, density, title }) {
  const ctx = cv.getContext('2d')
  const rnd = mulberry32(seed)
  const pal = PALETTES[paletteIdx]
  const M = 90 // 여백
  const COLS = 12
  const colW = (PW - M * 2) / COLS
  const snap = (v) => M + Math.round((v - M) / colW) * colW

  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, PW, PH)

  const pick = () => {
    const r = rnd()
    if (r < 0.25) return 'circle'
    if (r < 0.5) return 'bar'
    if (r < 0.7) return 'stripes'
    if (r < 0.85) return 'halftone'
    return 'arc'
  }

  for (let i = 0; i < density; i++) {
    const kind = pick()
    const color = rnd() < 0.42 ? pal.accent : pal.fg
    const bleed = i < 2 // 처음 1~2개는 가장자리에 걸치게
    const cx = bleed ? (rnd() < 0.5 ? -colW : PW - colW) + rnd() * colW * 2 : snap(M + rnd() * (PW - M * 2))
    const cy = bleed ? rnd() * PH : snap(M + rnd() * (PH - M * 2 - 420))
    ctx.save()
    if (kind === 'circle') {
      const r = colW * (2 + Math.round(rnd() * 3))
      ctx.fillStyle = color
      ctx.globalAlpha = rnd() < 0.3 ? 0.85 : 1
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    } else if (kind === 'bar') {
      const len = colW * (4 + Math.round(rnd() * 6))
      const th = 26 + rnd() * 90
      const ang = [-Math.PI / 4, Math.PI / 4, -Math.PI / 6][Math.round(rnd() * 2)]
      ctx.translate(cx, cy)
      ctx.rotate(ang)
      ctx.fillStyle = color
      ctx.fillRect(-len / 2, -th / 2, len, th)
    } else if (kind === 'stripes') {
      const n = 4 + Math.round(rnd() * 5)
      const w = colW * (2 + Math.round(rnd() * 2))
      const gap = 18 + rnd() * 26
      ctx.fillStyle = color
      for (let s = 0; s < n; s++) {
        ctx.fillRect(cx, cy + s * gap, w, gap * 0.42)
      }
    } else if (kind === 'halftone') {
      const nx = 6 + Math.round(rnd() * 6)
      const ny = 6 + Math.round(rnd() * 6)
      const cell = 24 + rnd() * 18
      ctx.fillStyle = color
      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          const rr = cell * 0.14 * (1 + ((x + y) % 3))
          ctx.beginPath()
          ctx.arc(cx + x * cell, cy + y * cell, rr * 0.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else {
      const r = colW * (2.5 + rnd() * 3)
      ctx.strokeStyle = color
      ctx.lineWidth = 14 + rnd() * 26
      ctx.beginPath()
      ctx.arc(cx, cy, r, rnd() * Math.PI * 2, rnd() * Math.PI * 1.4 + 0.9)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 얇은 룰러 라인
  ctx.fillStyle = pal.fg
  const ruleY = snap(M + rnd() * (PH * 0.35))
  ctx.fillRect(M, ruleY, PW - M * 2, 4)
  if (rnd() < 0.6) ctx.fillRect(M, ruleY + 18, (PW - M * 2) * 0.5, 4)

  // 타이포그래피
  const text = (title || 'LAB·2026').toUpperCase()
  const rotated = rnd() < 0.35
  const fontSize = 120 + Math.round(rnd() * 130)
  ctx.fillStyle = pal.fg
  ctx.font = `900 ${fontSize}px Helvetica, Arial, sans-serif`
  ctx.textBaseline = 'alphabetic'
  if (rotated) {
    ctx.save()
    ctx.translate(M + fontSize * 0.85, PH - M)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  } else {
    ctx.fillText(text, M - 6, PH - M - 60)
  }
  ctx.font = '500 30px Helvetica, Arial, sans-serif'
  ctx.fillText(`POSTER Nº${String(seed).padStart(4, '0')}`, M, PH - M + 4)
  ctx.textAlign = 'right'
  ctx.fillText('EVAN — GENERATIVE SERIES', PW - M, PH - M + 4)
  ctx.textAlign = 'left'

  // 종이 질감 노이즈
  ctx.globalAlpha = 0.04
  ctx.fillStyle = pal.fg
  for (let i = 0; i < 26000; i++) {
    ctx.fillRect(rnd() * PW, rnd() * PH, 1.4, 1.4)
  }
  ctx.globalAlpha = 1
}

export default function PosterLab() {
  const canvasRef = useRef(null)
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999))
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [density, setDensity] = useState(8)
  const [title, setTitle] = useState('LAB·2026')

  useEffect(() => {
    drawPoster(canvasRef.current, { seed, paletteIdx, density, title })
  }, [seed, paletteIdx, density, title])

  const download = () => {
    canvasRef.current.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `poster-${seed}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="poster-lab">
      <div className="pl-stage">
        <canvas ref={canvasRef} width={PW} height={PH} />
      </div>
      <aside className="pl-panel">
        <h2>Poster Lab</h2>
        <p className="pl-sub">시드 숫자 하나가 포스터 한 장이 됩니다.</p>

        <label className="pl-field">
          시드
          <div className="pl-seed">
            <input
              type="number"
              min="1"
              max="9999"
              value={seed}
              onChange={(e) => setSeed(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
            />
            <button type="button" onClick={() => setSeed(1 + Math.floor(Math.random() * 9999))} aria-label="시드 셔플">
              🎲
            </button>
          </div>
        </label>

        <label className="pl-field">
          팔레트
          <select value={paletteIdx} onChange={(e) => setPaletteIdx(Number(e.target.value))}>
            {PALETTES.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="pl-field">
          밀도 — {density}
          <input type="range" min="4" max="14" value={density} onChange={(e) => setDensity(Number(e.target.value))} />
        </label>

        <label className="pl-field">
          타이틀
          <input type="text" maxLength="14" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <button type="button" className="pl-download" onClick={download}>
          PNG 내려받기
        </button>
      </aside>
    </div>
  )
}
