import { describe, it, expect } from 'vitest'
import { computeSectionTint, SECTION_TINTS } from './sectionTint.js'

describe('computeSectionTint', () => {
  it('섹션 경계에 정지해 있으면 그 섹션의 색을 그대로 반환한다', () => {
    expect(computeSectionTint(0, 800)).toEqual(SECTION_TINTS[0])
    expect(computeSectionTint(800, 800)).toEqual(SECTION_TINTS[1])
    expect(computeSectionTint(1600, 800)).toEqual(SECTION_TINTS[2])
  })

  it('전환 중간점에서 두 섹션 색의 중간값을 반환한다', () => {
    const [r, g, b] = computeSectionTint(400, 800)
    expect(r).toBeCloseTo((SECTION_TINTS[0][0] + SECTION_TINTS[1][0]) / 2, 5)
    expect(g).toBeCloseTo((SECTION_TINTS[0][1] + SECTION_TINTS[1][1]) / 2, 5)
    expect(b).toBeCloseTo((SECTION_TINTS[0][2] + SECTION_TINTS[1][2]) / 2, 5)
  })

  it('마지막 섹션을 넘어서면 마지막 색으로 클램프된다', () => {
    expect(computeSectionTint(800 * 99, 800)).toEqual(
      SECTION_TINTS[SECTION_TINTS.length - 1]
    )
  })

  it('음수 스크롤(iOS 바운스)에서는 첫 색으로 클램프된다', () => {
    expect(computeSectionTint(-100, 800)).toEqual(SECTION_TINTS[0])
  })

  it('viewportHeight가 0이면 첫 색을 반환한다 (0 나눗셈 방지)', () => {
    expect(computeSectionTint(500, 0)).toEqual(SECTION_TINTS[0])
  })
})
