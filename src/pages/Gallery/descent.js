// 우주 → 성층권 진입 타임라인. 속도감이 목적이므로 등속이 아니라
// "급가속 → 순항 → 급제동"으로 짠다. 체감 속도는 속도값 자체가 아니라
// 변화율에서 나오기 때문에, 짧고 급하게 멈추는 쪽이 길고 균일한 쪽보다
// 훨씬 빠르게 느껴진다.
//
// altitude는 velocity를 실제로 적분해 얻는다 — 두 값을 따로 정의하면
// 하늘이 움직이는 속도와 별 스트릭 길이가 어긋나 보인다.

export const DESCENT_DURATION_MS = 3200

export const ACCEL_END = 0.25          // 가속이 끝나는 진행도
export const BRAKE_START = 0.72        // 제동이 시작되는 진행도
export const PANEL_REVEAL_START = 0.66 // 패널이 드러나기 시작하는 진행도

const PLASMA_START = 0.35
const PLASMA_SPAN = 0.55
const SETTLE_START = 0.86
const SETTLE_DEPTH = 0.045             // 착지 시 지나치는 깊이

// v(p): 0..1. 가속은 제곱, 순항은 1, 제동은 5제곱 감쇠.
function velocityAt(p) {
  if (p <= 0) return 0
  if (p < ACCEL_END) {
    const t = p / ACCEL_END
    return t * t
  }
  if (p < BRAKE_START) return 1
  if (p >= 1) return 0
  const u = 1 - (p - BRAKE_START) / (1 - BRAKE_START)
  return u * u * u * u * u
}

// ∫v dp 를 구간별 닫힌 형태로. 전체 적분값으로 나눠 0..1로 정규화한다.
const TOTAL_DISTANCE =
  ACCEL_END / 3 + (BRAKE_START - ACCEL_END) + (1 - BRAKE_START) / 6

function distanceAt(p) {
  if (p <= 0) return 0
  if (p >= 1) return TOTAL_DISTANCE
  if (p < ACCEL_END) return (p * p * p) / (3 * ACCEL_END * ACCEL_END)
  const accel = ACCEL_END / 3
  if (p < BRAKE_START) return accel + (p - ACCEL_END)
  const cruise = BRAKE_START - ACCEL_END
  const u = 1 - (p - BRAKE_START) / (1 - BRAKE_START)
  return accel + cruise + ((1 - BRAKE_START) / 6) * (1 - u ** 6)
}

// 0에서 1로 올랐다 0으로 떨어지는 반주기 사인 범프.
function bump(p, start, span) {
  if (p <= start || p >= start + span) return 0
  return Math.sin(Math.PI * ((p - start) / span))
}

export function computeDescent(elapsedMs) {
  const progress = Math.max(0, Math.min(1, elapsedMs / DESCENT_DURATION_MS))
  const velocity = velocityAt(progress)

  // 착지 순간 살짝 지나쳤다 되돌아오는 정착. "멈췄다"를 몸으로 느끼게 한다.
  const settle = bump(progress, SETTLE_START, 1 - SETTLE_START) * SETTLE_DEPTH
  const altitude = 1 - distanceAt(progress) / TOTAL_DISTANCE - settle

  const plasma = bump(progress, PLASMA_START, PLASMA_SPAN)
  const panelReveal =
    progress <= PANEL_REVEAL_START
      ? 0
      : (progress - PANEL_REVEAL_START) / (1 - PANEL_REVEAL_START)

  return {
    progress,
    velocity,
    altitude,
    fovDeg: 75 + velocity * 45,
    plasma,
    shake: plasma * plasma * 0.55,
    panelReveal,
    done: elapsedMs >= DESCENT_DURATION_MS,
  }
}

export function landedState() {
  return computeDescent(DESCENT_DURATION_MS)
}
