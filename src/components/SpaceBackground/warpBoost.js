// Lab 진입 워프 부스트: 스크롤 워프 최대치(1.0)를 넘는 세기로 카메라가
// 별필드를 관통하며 "우주로 완전히 빨려들어가는" 정점을 만든다.
// LabTransition이 requestWarpBoost()로 시작을 요청하면 SpaceBackground가
// 이 타임라인으로 intensity를 직접 구동한다. 부스트는 라우트 변경과
// 무관하게 끝까지 재생된다 (갤러리 도착 후 자연 감속).

export const WARP_BOOST_EVENT = 'space-warp:boost'
export const BOOST_CHARGE_MS = 800
export const BOOST_PEAK_MS = 200
export const BOOST_RELEASE_MS = 700
export const BOOST_PEAK_INTENSITY = 1.4

// 가속: ease-in-cubic (점점 빨라지며 빨려듦), 해제: ease-out-cubic.
export function computeBoostIntensity(elapsedMs) {
  if (elapsedMs < BOOST_CHARGE_MS) {
    const t = Math.max(0, elapsedMs) / BOOST_CHARGE_MS
    return { intensity: BOOST_PEAK_INTENSITY * t * t * t, phase: 'charging' }
  }
  const afterCharge = elapsedMs - BOOST_CHARGE_MS
  if (afterCharge < BOOST_PEAK_MS) {
    return { intensity: BOOST_PEAK_INTENSITY, phase: 'peak' }
  }
  const afterPeak = afterCharge - BOOST_PEAK_MS
  if (afterPeak < BOOST_RELEASE_MS) {
    const remain = 1 - afterPeak / BOOST_RELEASE_MS
    return { intensity: BOOST_PEAK_INTENSITY * remain * remain * remain, phase: 'release' }
  }
  return { intensity: 0, phase: 'done' }
}

export function requestWarpBoost() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WARP_BOOST_EVENT))
  }
}
