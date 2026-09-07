// 프레임레이트 독립 지수 감쇠 (순수 모듈).
//
// `x += (target - x) * rate`는 프레임마다 같은 비율을 적용하므로 감쇠 속도가
// 화면 주사율을 그대로 탄다 — 120Hz ProMotion에서는 60Hz의 두 배로 빨리
// 수렴해, 같은 코드가 기기마다 다른 카메라 무게감을 만든다. 프레임이 한 번
// 길게 걸리면(셰이더 컴파일·탭 복귀) 그 프레임에도 한 스텝만 적용되므로
// 화면이 끊겼다가 계단식으로 따라붙는다.
//
// 여기서는 rate를 "60fps 한 프레임(16.67ms) 기준 비율"로 정의하고, 실제
// 프레임 간격에 해당하는 등가 계수를 돌려준다. rate=0.08, dt=33.3ms이면
// 0.08을 두 번 적용한 것과 같은 0.1536이 나온다.
export const REFERENCE_FRAME_MS = 1000 / 60

export function dampFactor(rate, dtMs, referenceMs = REFERENCE_FRAME_MS) {
  if (!(dtMs > 0) || !(rate > 0)) return 0
  if (rate >= 1) return 1
  return 1 - Math.pow(1 - rate, dtMs / referenceMs)
}
