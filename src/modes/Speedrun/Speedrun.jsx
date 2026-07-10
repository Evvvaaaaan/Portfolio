import { useEffect, useRef, useState } from 'react'
import { MISSIONS, createRun, completeMission, formatMs, loadBest, saveBest } from './splits.js'
import './Speedrun.css'

export default function Speedrun() {
  const [run, setRun] = useState(() => createRun(performance.now()))
  const [best, setBest] = useState(loadBest)
  const timerRef = useRef(null)
  const runRef = useRef(run)
  runRef.current = run

  // 타이머는 rAF로 DOM에 직접 쓴다 — 프레임마다 리렌더하지 않기 위함
  useEffect(() => {
    let id
    const loop = () => {
      const r = runRef.current
      const ms = (r.finishedAt ?? performance.now()) - r.startedAt
      if (timerRef.current) timerRef.current.textContent = formatMs(ms)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const targets = MISSIONS.flatMap((m) =>
      [...document.querySelectorAll(m.selector)].map((el) => [m, el]),
    )
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const hit = targets.find(([, el]) => el === entry.target)
          if (hit) setRun((r) => completeMission(r, hit[0].id, performance.now()))
        }
      },
      { threshold: 0.4 },
    )
    targets.forEach(([, el]) => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (run.finishedAt == null) return
    const total = run.finishedAt - run.startedAt
    if (saveBest(total)) setBest(total)
  }, [run.finishedAt, run.startedAt])

  const restart = () => {
    window.scrollTo({ top: 0 })
    setRun(createRun(performance.now()))
  }

  return (
    <aside className="speedrun-panel" aria-label="Speedrun timer">
      <div className="speedrun-timer" ref={timerRef}>0:00.00</div>
      <ol className="speedrun-splits">
        {MISSIONS.map((m) => (
          <li key={m.id} className={run.splits[m.id] != null ? 'speedrun-split--done' : ''}>
            <span>{m.label}</span>
            <span>{run.splits[m.id] != null ? formatMs(run.splits[m.id]) : '—'}</span>
          </li>
        ))}
      </ol>
      <div className="speedrun-footer">
        {run.finishedAt != null && <strong className="speedrun-clear">CLEAR!</strong>}
        <span>best {best != null ? formatMs(best) : '—'}</span>
        <button type="button" onClick={restart}>restart</button>
      </div>
    </aside>
  )
}
