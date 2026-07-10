import { Suspense, useEffect } from 'react'
import { useMode } from './ModeContext.jsx'
import { getMode } from './registry.js'
import ModeErrorBoundary from './ModeErrorBoundary.jsx'
import './modes.css'

export default function ModeLayer() {
  const { modeId, exitMode } = useMode()
  const mode = getMode(modeId)

  useEffect(() => {
    if (!mode) return
    const onKey = (e) => {
      if (e.key === 'Escape') exitMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, exitMode])

  if (!mode) return null
  const Comp = mode.component
  return (
    <>
      <ModeErrorBoundary onError={exitMode}>
        <Suspense fallback={null}>
          <Comp />
        </Suspense>
      </ModeErrorBoundary>
      <div className="mode-badge" style={{ '--mode-color': mode.color }}>
        <span className="mode-badge-dot" aria-hidden="true" />
        {mode.title}
        <button type="button" className="mode-badge-exit" onClick={exitMode} aria-label="Exit mode (Esc)">
          ✕
        </button>
      </div>
    </>
  )
}
