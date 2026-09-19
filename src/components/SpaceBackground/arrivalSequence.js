// 첫 로딩 "도착 시퀀스": 페이지가 고속 워프 상태(intensity=1)로 시작해
// 감속하며 Hero 별필드에 정착한다. SpaceBackground가 재생을 담당하며,
// 콘텐츠는 이 배경 연출과 무관하게 즉시 표시된다.
// 재생 조건 미충족 시에도 'skipped' 종결 이벤트를 쏜다.

export const ARRIVAL_DONE_EVENT = 'space-arrival:done'
export const ARRIVAL_HOLD_MS = 0
export const ARRIVAL_DURATION_MS = 350

// 0~HOLD: 최고 속도 유지, HOLD~DURATION: ease-out cubic으로 1→0 감속.
export function computeArrivalIntensity(elapsedMs) {
  if (elapsedMs < ARRIVAL_HOLD_MS) return { intensity: 1, done: false }
  if (elapsedMs >= ARRIVAL_DURATION_MS) return { intensity: 0, done: true }
  const t = (elapsedMs - ARRIVAL_HOLD_MS) / (ARRIVAL_DURATION_MS - ARRIVAL_HOLD_MS)
  const remain = 1 - t
  return { intensity: remain * remain * remain, done: false }
}

// 재생 조건: 메인 데스크톱(warpEnabled) + 모션 허용 + 페이지 상단.
// 스크롤 복원으로 중간에서 리로드된 경우(뷰포트 절반 이상)는 생략한다.
export function shouldPlayArrival({ warpEnabled, reducedMotion, scrollY, viewportHeight }) {
  if (!warpEnabled || reducedMotion) return false
  return scrollY < viewportHeight * 0.5
}

// 페이지 로드당 1회 상태 머신: pending → playing → done | pending → skipped.
let status = 'pending'

export function getArrivalStatus() {
  return status
}

export function beginArrival() {
  status = 'playing'
}

export function concludeArrival(finalStatus) {
  status = finalStatus
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ARRIVAL_DONE_EVENT))
  }
}

// 테스트 전용: 모듈 상태 초기화.
export function resetArrivalForTest() {
  status = 'pending'
}
