// 섹션 전환 구간 진행도를 0→1→0 포물선 세기로 변환한다.
// frac=0(섹션에 정지) → intensity=0, frac=0.5(두 섹션 사이 중간) → intensity=1(최고 속도).
export function computeTransitionIntensity(scrollY, viewportHeight) {
  if (viewportHeight <= 0) return 0
  const progress = scrollY / viewportHeight
  const frac = progress - Math.floor(progress)
  return 4 * frac * (1 - frac)
}
