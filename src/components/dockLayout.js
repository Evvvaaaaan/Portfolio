// 도킹 패널 표시 스타일 (순수). 기존 슬라이드덱의 scale-zoom/blur를
// 대체한다 — 전환의 "이동감"은 이제 3D 카메라가 담당하므로 DOM은
// 가볍게 페이드+드리프트만 한다.
const HIDE_AT = 0.6
const INTERACT_WITHIN = 0.25
const DRIFT_PX = 60

export function computeDockStyle(progress, idx, reduced = false) {
  const offset = progress - idx
  const abs = Math.abs(offset)
  if (abs >= HIDE_AT) return { visible: false }
  const fade = 1 - abs / HIDE_AT
  const translateY = reduced ? 0 : -offset * DRIFT_PX || 0
  return {
    visible: true,
    // 페이드를 앞당겨(1.6배) 정착 구간에서는 확실한 opacity 1.
    opacity: Math.min(1, fade * 1.6),
    translateY,
    pointerEvents: abs < INTERACT_WITHIN ? 'auto' : 'none',
  }
}
