import { useEffect, useState } from 'react'
import { useMode } from '../ModeContext.jsx'
import { getLenis } from '../../hooks/useLenis'
import { ANNOTATIONS } from './annotations.js'
import './Inspect.css'

export default function Inspect() {
  const { exitMode } = useMode()
  const [idx, setIdx] = useState(0)
  const [box, setBox] = useState(null)
  const current = ANNOTATIONS[idx]

  // 현재 스텝 대상으로 스크롤하고, 하이라이트 박스를 요소 위치에 고정
  useEffect(() => {
    const el = document.querySelector(current.selector)
    let raf
    if (!el) {
      raf = requestAnimationFrame(() => setBox(null))
      return () => cancelAnimationFrame(raf)
    }
    // 네이티브 scrollTo는 Lenis가 되돌리므로 Lenis 인스턴스를 우선 사용
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(el, { duration: 0.8 })
    else el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const update = () => {
      const r = el.getBoundingClientRect()
      setBox({ x: r.left, y: r.top, w: r.width, h: r.height })
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [current])

  return (
    <>
      {box && (
        <div
          className="inspect-highlight"
          style={{
            transform: `translate(${box.x}px, ${box.y}px)`,
            width: `${box.w}px`,
            height: `${box.h}px`,
          }}
          aria-hidden="true"
        />
      )}
      <aside className="inspect-panel" aria-label="Inspect tour">
        <div className="inspect-tag">{current.tag}</div>
        <h3 className="inspect-title">{current.title}</h3>
        <p className="inspect-note">{current.note}</p>
        <div className="inspect-controls">
          <span className="inspect-step">{idx + 1} / {ANNOTATIONS.length}</span>
          <button type="button" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            Prev
          </button>
          <button type="button" disabled={idx === ANNOTATIONS.length - 1} onClick={() => setIdx((i) => i + 1)}>
            Next
          </button>
          <button type="button" onClick={exitMode}>Exit</button>
        </div>
      </aside>
    </>
  )
}
