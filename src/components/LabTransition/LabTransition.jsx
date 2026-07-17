import { useEffect, useRef, useState } from 'react'
import './LabTransition.css'
import {
  requestWarpBoost,
  BOOST_CHARGE_MS,
  BOOST_PEAK_MS,
  BOOST_RELEASE_MS,
} from '../SpaceBackground/warpBoost.js'

const FLASH_LEAD_MS = 150
const TEXT_HOLD_MS = 900
const TEXT_OUT_MS = 400
const REDUCED_NAV_MS = 250
const REDUCED_DONE_MS = 800

// Lab 이동: 배경 우주 워프가 최대로 가속(부스트)하며 페이지 콘텐츠가
// 카메라를 지나쳐 사라지고, 정점의 화이트 플래시 순간 라우트를 바꾼 뒤
// 워프가 풀리며 갤러리가 드러난다. origin prop은 시각적으로 더 이상
// 쓰지 않지만 Navbar 계약 유지를 위해 시그니처에 남긴다.
// eslint-disable-next-line no-unused-vars
export default function LabTransition({ origin, onNavigate, onDone }) {
  const [flash, setFlash] = useState(false)
  const [showText, setShowText] = useState(false)

  // onNavigate/onDone은 부모(Navbar)가 매 렌더 새 인라인 함수로 넘긴다.
  // 타이머 예약은 마운트 시 한 번만 돌아야 하므로 최신 콜백은 ref로 읽는다.
  const callbacksRef = useRef({ onNavigate, onDone })
  // eslint-disable-next-line react-hooks/refs
  callbacksRef.current = { onNavigate, onDone }

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reducedMotion) {
      // 부스트 없이 어두운 오버레이 + 문구만 짧게.
      const timers = [
        setTimeout(() => callbacksRef.current.onNavigate(), REDUCED_NAV_MS),
        setTimeout(() => setShowText(true), REDUCED_NAV_MS),
        setTimeout(() => setShowText(false), REDUCED_NAV_MS + TEXT_HOLD_MS),
        setTimeout(
          () => callbacksRef.current.onDone(),
          REDUCED_DONE_MS + TEXT_HOLD_MS,
        ),
      ]
      return () => timers.forEach(clearTimeout)
    }

    requestWarpBoost()
    document.body.classList.add('warp-exit')

    const navAt = BOOST_CHARGE_MS + BOOST_PEAK_MS / 2
    const timers = [
      setTimeout(() => setFlash(true), BOOST_CHARGE_MS - FLASH_LEAD_MS),
      setTimeout(() => {
        callbacksRef.current.onNavigate()
        document.body.classList.remove('warp-exit')
      }, navAt),
      setTimeout(() => setFlash(false), BOOST_CHARGE_MS + BOOST_PEAK_MS),
      setTimeout(() => setShowText(true), BOOST_CHARGE_MS + BOOST_PEAK_MS),
      setTimeout(
        () => setShowText(false),
        BOOST_CHARGE_MS + BOOST_PEAK_MS + TEXT_HOLD_MS,
      ),
      setTimeout(
        () => callbacksRef.current.onDone(),
        BOOST_CHARGE_MS + BOOST_PEAK_MS + BOOST_RELEASE_MS + TEXT_HOLD_MS + TEXT_OUT_MS,
      ),
    ]
    return () => {
      timers.forEach(clearTimeout)
      document.body.classList.remove('warp-exit')
    }
    // reducedMotion은 마운트 시점 판정 고정 — 의도적으로 deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`labtransition-overlay ${reducedMotion ? 'labtransition-overlay--reduced' : ''}`}
    >
      <div className={`labtransition-flash ${flash ? 'labtransition-flash--on' : ''}`} />
      <p className={`labtransition-text ${showText ? 'labtransition-text--in' : ''}`}>
        Lab에 도착하였습니다.
      </p>
    </div>
  )
}
