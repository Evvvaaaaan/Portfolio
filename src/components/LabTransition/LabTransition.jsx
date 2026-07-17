import { useEffect, useRef, useState } from 'react'
import './LabTransition.css'

const CLOSE_MS = 700
const NAV_BUFFER_MS = 150
const TEXT_IN_MS = 1200
const TEXT_HOLD_MS = 900
const TEXT_OUT_MS = 400
const OPEN_MS = 700

// Lab 이동 시 블랙홀에 빨려들어가는 듯한 화면 전환. 확장된 검은 원이 화면을
// 완전히 덮은 순간 실제 라우트를 바꾸고("onNavigate"), 도착 문구를 천천히
// 보여준 뒤 다시 열리며 Lab 페이지를 드러낸다.
export default function LabTransition({ origin, onNavigate, onDone }) {
  const [expanded, setExpanded] = useState(false)
  const [showText, setShowText] = useState(false)

  // onNavigate/onDone은 부모(Navbar)가 매 렌더 새 인라인 함수로 넘긴다.
  // 아래 타이머 예약은 마운트 시 단 한 번만 돌아야 하므로, 최신 콜백은
  // ref로 읽고 effect 의존성에는 넣지 않는다 — 그렇지 않으면 부모가
  // 리렌더될 때마다(네비게이션으로 인한 리렌더 포함) 전체 시퀀스가
  // 리셋되어 "도착" 상태에서 멈춘 것처럼 보인다.
  const callbacksRef = useRef({ onNavigate, onDone })
  callbacksRef.current = { onNavigate, onDone }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const timers = [
      setTimeout(() => callbacksRef.current.onNavigate(), CLOSE_MS),
      setTimeout(() => setShowText(true), CLOSE_MS + NAV_BUFFER_MS),
      setTimeout(() => setShowText(false), CLOSE_MS + NAV_BUFFER_MS + TEXT_IN_MS + TEXT_HOLD_MS),
      setTimeout(
        () => setExpanded(false),
        CLOSE_MS + NAV_BUFFER_MS + TEXT_IN_MS + TEXT_HOLD_MS + TEXT_OUT_MS,
      ),
      setTimeout(
        () => callbacksRef.current.onDone(),
        CLOSE_MS + NAV_BUFFER_MS + TEXT_IN_MS + TEXT_HOLD_MS + TEXT_OUT_MS + OPEN_MS,
      ),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const originStyle = {
    '--origin-x': origin ? `${origin.x}px` : '50%',
    '--origin-y': origin ? `${origin.y}px` : '50%',
  }

  return (
    <div className={`labtransition-overlay ${expanded ? 'is-expanded' : ''}`} style={originStyle}>
      <div className="labtransition-ring-scale">
        <div className="labtransition-ring-spin" />
      </div>
      <div className="labtransition-hole" />
      <p className={`labtransition-text ${showText ? 'labtransition-text--in' : ''}`}>
        Lab에 도착하였습니다.
      </p>
    </div>
  )
}
