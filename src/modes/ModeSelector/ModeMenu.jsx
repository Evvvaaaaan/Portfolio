import { useEffect, useRef, useState } from 'react'
import { useMode } from '../ModeContext.jsx'
import { modes } from '../registry.js'
import './ModeMenu.css'

// onPick: 모드를 고른 뒤 호출된다. 이 메뉴는 사이트 메뉴 오버레이 안에 있고,
// 모드는 화면 전체를 바꾸는 동작이라 고르는 즉시 오버레이를 닫아야 결과가 보인다.
export default function ModeMenu({ onPick }) {
  const { modeId, setModeId, exitMode } = useMode()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const activeMode = modes.find((m) => m.id === modeId)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (id) => {
    setOpen(false)
    if (id === null) exitMode()
    else setModeId(id)
    onPick?.()
  }

  return (
    <div className="mode-menu" ref={rootRef}>
      <button
        type="button"
        className={`nav-icon-btn mode-menu-btn ${modeId ? 'mode-menu-btn--active' : ''}`}
        style={activeMode ? { '--mode-color': activeMode.color } : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mode"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
        <span className="nav-icon-btn-label">Mode</span>
      </button>
      {open && (
        <div className="mode-menu-panel" role="menu" aria-label="Lab modes">
          <button type="button" role="menuitem"
            className={`mode-menu-item ${modeId === null ? 'mode-menu-item--on' : ''}`}
            onClick={() => pick(null)}>
            <strong>Normal</strong>
            <span>The portfolio, as intended.</span>
          </button>
          {modes.map((m) => (
            <button key={m.id} type="button" role="menuitem"
              className={`mode-menu-item ${modeId === m.id ? 'mode-menu-item--on' : ''}`}
              style={{ '--mode-color': m.color }}
              onClick={() => pick(m.id)}>
              <strong>{m.title}</strong>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
