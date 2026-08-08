import { useCallback, useEffect, useRef, useState } from 'react'
import { getLenis } from '../../hooks/useLenis'
import { STATIONS } from '../SpaceBackground/rail.js'
import { buildTourSchedule, tourTotalMs } from './autopilot.js'

// 사용자의 진짜 입력만 인터럽트로 친다. 'scroll'은 절대 넣으면 안 된다 —
// 오토파일럿 자신의 Lenis 애니메이션이 매 프레임 scroll을 쏘므로, 넣는 순간
// 투어가 시작하자마자 스스로를 멈춘다.
const INTERRUPT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']

export function useAutopilot(buttonRef) {
  const [running, setRunning] = useState(false)
  const timersRef = useRef([])

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current = []
  }, [])

  const stop = useCallback(() => {
    // 타이머가 하나라도 남아 있었다는 건 투어가 돌고 있었다는 뜻 — clearTimers로
    // 지우기 전에 미리 확인해 둔다. 마운트 직후처럼 애초에 아무 것도 예약된
    // 게 없을 때는 아래 pin을 건너뛴다: 안 그러면 스크롤이 하지도 않은 움직임을
    // 제자리로 "점프"시키는 부작용이 생긴다.
    const wasRunning = timersRef.current.length > 0
    clearTimers()
    // 예약된 타이머만 지우면 이미 진행 중이던 Lenis 스크롤 애니메이션은
    // 멈추지 않는다 — 다리 하나가 3초짜리라, Esc/Tab/클릭 등으로 멈춘 뒤에도
    // 화면이 최대 3초 더 미끄러진다. 지금 위치로 즉시 고정해 애니메이션을 끊는다.
    if (wasRunning) {
      getLenis()?.scrollTo(window.scrollY, { immediate: true })
    }
    setRunning(false)
  }, [clearTimers])

  const start = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const opts = { stationCount: STATIONS.length, reduced }
    clearTimers()
    setRunning(true)
    for (const step of buildTourSchedule(opts)) {
      timersRef.current.push(
        setTimeout(() => {
          // 카메라가 아니라 스크롤을 움직인다 — 레일·도킹 패널·네비바가 모두
          // 스크롤에 물려 있으므로 이것 하나로 전부 따라온다.
          const top = step.stationIndex * window.innerHeight
          const lenis = getLenis()
          if (lenis) {
            if (step.legMs > 0) lenis.scrollTo(top, { duration: step.legMs / 1000 })
            else lenis.scrollTo(top, { immediate: true })
          } else {
            window.scrollTo({ top, behavior: step.legMs > 0 ? 'smooth' : 'auto' })
          }
        }, step.startMs),
      )
    }
    timersRef.current.push(setTimeout(stop, tourTotalMs(opts)))
  }, [clearTimers, stop])

  useEffect(() => {
    if (!running) return
    // 투어를 시작시킨 바로 그 클릭의 pointerdown이 곧장 인터럽트로 잡히지
    // 않도록 다음 매크로태스크에 리스너를 건다. 그 뒤에도 토글 버튼 자신에서
    // 나온 입력은 무시한다 — 정지는 버튼의 onClick이 맡는다.
    let detach = () => {}
    const attachId = setTimeout(() => {
      const onInterrupt = (e) => {
        // 버튼 제외는 클릭으로 이어지는 입력(pointerdown/touchstart/keydown)에만
        // 적용한다 — 이 셋을 지나 그대로 두면 토글 버튼을 누르는 그 클릭이
        // stop()과 onClick의 start()를 동시에 발동시켜 토글이 깨진다. wheel은
        // 절대 클릭으로 이어지지 않으므로 커서가 버튼 위에 있어도 인터럽트로
        // 처리해야 한다.
        if (e.type !== 'wheel' && buttonRef.current?.contains(e.target)) return
        stop()
      }
      for (const type of INTERRUPT_EVENTS) {
        window.addEventListener(type, onInterrupt, { passive: true })
      }
      detach = () => {
        for (const type of INTERRUPT_EVENTS) {
          window.removeEventListener(type, onInterrupt)
        }
      }
    }, 0)
    return () => {
      clearTimeout(attachId)
      detach()
    }
  }, [running, stop, buttonRef])

  // 언마운트(라우트 이동 등)에서 예약된 스크롤이 살아남으면 다른 페이지를
  // 제멋대로 스크롤한다.
  useEffect(() => clearTimers, [clearTimers])

  return { running, start, stop }
}
