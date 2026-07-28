// Lab 360° 파노라마의 기하: 패널 14개가 원통 위에 균등 배치되고, 관람자는
// 원점에서 회전만 한다. 여기 있는 함수는 전부 순수 함수 — 각도 단위는 도이며
// 셰이더에 넘길 때만 라디안으로 바꾼다.

export const PITCH_LIMIT_DEG = 25

// (-180, 180] 로 정규화. -180은 180으로 접어 경계에서 부호가 튀지 않게 한다.
export function wrapDeg(deg) {
  const m = ((deg % 360) + 360) % 360
  return m > 180 ? m - 360 : m === 0 ? 0 : m
}

export function clampPitch(deg) {
  return Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, deg))
}

export function panelAngle(index, count) {
  return (360 / count) * index
}

// 시선(yaw)에서 패널까지의 부호 있는 최단 각도차. 0이면 정면.
export function signedOffset(index, count, yawDeg) {
  return wrapDeg(panelAngle(index, count) - yawDeg)
}

export function activeIndex(count, yawDeg) {
  const step = 360 / count
  const raw = Math.round(yawDeg / step)
  return ((raw % count) + count) % count
}

// 화살표/방향키용. yaw를 되감지 않고 누적해 회전이 최단 경로로 이어지게 한다.
export function stepYaw(yawDeg, count, dir) {
  const step = 360 / count
  return (Math.round(yawDeg / step) + dir) * step
}

// 임의의 패널을 정면으로 가져오는 yaw. 누적 회전수를 유지한 채 최단 방향을
// 고른다 — 그러지 않으면 여러 바퀴 돈 뒤 패널을 누를 때 링이 통째로 되감긴다.
export function yawForIndex(yawDeg, count, index) {
  const step = 360 / count
  const current = Math.round(yawDeg / step)
  let delta = (((index - current) % count) + count) % count
  if (delta > count / 2) delta -= count
  return (current + delta) * step
}

// 패널 크기와 링 반지름. 반지름은 원주가 패널 폭 합의 1.25배 이상이 되도록
// 잡아 이웃 패널이 겹치지 않게 한다.
export function panelGeometry(vw, count) {
  const width = Math.round(Math.min(vw * 0.62, 760))
  const height = Math.round(width * 0.62)
  const radius = Math.round((count * width * 1.25) / (2 * Math.PI))
  return { width, height, radius, perspective: radius * 2 }
}
