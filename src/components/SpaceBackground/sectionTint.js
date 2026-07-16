// 스크롤 위치를 섹션별 배경 틴트(0~1 RGB)로 변환한다.
// 섹션에 머무를 때는 그 섹션의 색이 유지되고, 전환 구간에서
// smoothstep으로 다음 섹션 색으로 넘어간다 — "다른 좌표에 도착"한 느낌.
// App.jsx의 데스크톱 슬라이드덱(섹션당 정확히 100vh)에서만 의미가 있으므로
// 호출부(SpaceBackground)가 warpEnabled일 때만 사용한다.
export const SECTION_TINTS = [
  [0.039, 0.039, 0.059], // home     — 기본 우주색 (#0a0a0f)
  [0.031, 0.051, 0.106], // about    — 딥 블루
  [0.020, 0.067, 0.075], // skills   — 틸
  [0.067, 0.031, 0.098], // projects — 퍼플
  [0.086, 0.043, 0.051], // contact  — 웜 레드
  [0.024, 0.031, 0.055], // footer   — 다크 네이비
]

export function computeSectionTint(scrollY, viewportHeight, tints = SECTION_TINTS) {
  if (viewportHeight <= 0) return tints[0]
  const progress = Math.max(0, scrollY / viewportHeight)
  const last = tints.length - 1
  const idx = Math.min(Math.floor(progress), last)
  const next = Math.min(idx + 1, last)
  const frac = Math.min(progress - idx, 1)
  if (frac === 0 || idx === next) return tints[idx]
  const t = frac * frac * (3 - 2 * frac) // smoothstep — 경계에서 색이 잠시 머무름
  return [
    tints[idx][0] + (tints[next][0] - tints[idx][0]) * t,
    tints[idx][1] + (tints[next][1] - tints[idx][1]) * t,
    tints[idx][2] + (tints[next][2] - tints[idx][2]) * t,
  ]
}
