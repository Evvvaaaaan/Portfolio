// 오토파일럿 투어 스케줄 (순수 — 타이머·DOM·Lenis 미의존).
// 정거장마다 "이동(leg) → 정차(dwell)" 한 세트를 재생한다. 스펙이 못박은
// 30초는 6개 정거장 × 5초에서 나온다.
export const TOUR_LEG_MS = 3000
export const TOUR_DWELL_MS = 2000
export const TOUR_STEP_MS = TOUR_LEG_MS + TOUR_DWELL_MS
export const TOUR_TOTAL_MS = 30000

// reduced-motion에서는 카메라 이동을 단순 컷으로 대체한다(스펙 5.4).
// 정차 시간은 그대로 남겨 각 섹션을 읽을 시간은 뺏지 않는다.
function legFor(reduced) {
  return reduced ? 0 : TOUR_LEG_MS
}

export function buildTourSchedule({ stationCount = 6, reduced = false } = {}) {
  const legMs = legFor(reduced)
  const stepMs = legMs + TOUR_DWELL_MS
  return Array.from({ length: stationCount }, (_, i) => ({
    stationIndex: i,
    startMs: i * stepMs,
    legMs,
    dwellMs: TOUR_DWELL_MS,
  }))
}

export function tourTotalMs({ stationCount = 6, reduced = false } = {}) {
  return stationCount * (legFor(reduced) + TOUR_DWELL_MS)
}
