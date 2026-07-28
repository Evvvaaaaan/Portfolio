import { useState } from 'react'
import { useLang } from '../../context/LangContext'
import { classifyRenderer } from './classifyRenderer.js'
import './HardwareAccelNotice.css'

const DISMISS_KEY = 'hwAccelNoticeDismissed'

function getGLContext(canvas) {
  try {
    return (
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    )
  } catch {
    return null
  }
}

// 실제 WebGL 컨텍스트를 만들어 GPU 가속 여부를 판별한다.
// - WebGL 자체가 없거나 소프트웨어 렌더러로 "확실히" 판별될 때만 경고한다.
// - 렌더러 문자열을 못 가져오면(마스킹 등) 조용히 넘어가 오탐을 피한다.
function detectHardwareAccel() {
  if (typeof document === 'undefined') return { warn: false }
  const gl = getGLContext(document.createElement('canvas'))

  // WebGL을 아예 못 얻으면 가속이 꺼졌거나 미지원 — 안내 대상.
  if (!gl) return { warn: true }

  let renderer = ''
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''
  } catch {
    renderer = ''
  }

  // 컨텍스트 정리 (전역 WebGL 컨텍스트 한도를 잡아먹지 않도록).
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* no-op */
  }

  return { warn: classifyRenderer(renderer) === 'software' }
}

// 최초 렌더에서 한 번만 판별한다: 세션 내 이미 닫았으면 숨기고,
// 소프트웨어 렌더링이 감지될 때만 노출한다.
function computeInitialVisible() {
  try {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return false
  } catch {
    /* no-op */
  }
  return detectHardwareAccel().warn
}

export default function HardwareAccelNotice() {
  const { t } = useLang()
  const [visible, setVisible] = useState(computeInitialVisible)

  if (!visible) return null

  const copy = t.hwAccel

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* no-op */
    }
    setVisible(false)
  }

  return (
    <div className="hw-accel-notice" role="status" aria-live="polite">
      <div className="hw-accel-notice__icon" aria-hidden="true">⚠</div>
      <div className="hw-accel-notice__text">
        <strong className="hw-accel-notice__title">{copy.title}</strong>
        <p className="hw-accel-notice__body">{copy.body}</p>
      </div>
      <button
        type="button"
        className="hw-accel-notice__close"
        onClick={dismiss}
        aria-label={copy.close}
      >
        {copy.close}
      </button>
    </div>
  )
}
