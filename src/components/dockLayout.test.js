import { describe, it, expect } from 'vitest'
import { computeDockStyle } from './dockLayout.js'

describe('computeDockStyle', () => {
  it('정거장 정착(offset=0)에서 완전 표시 + 인터랙션 가능', () => {
    const s = computeDockStyle(2, 2)
    expect(s.visible).toBe(true)
    expect(s.opacity).toBe(1)
    expect(s.translateY).toBe(0)
    expect(s.pointerEvents).toBe('auto')
  })

  it('전환 중(offset=±0.4)에는 페이드 + 인터랙션 차단', () => {
    for (const p of [1.6, 2.4]) {
      const s = computeDockStyle(p, 2)
      expect(s.visible).toBe(true)
      expect(s.opacity).toBeGreaterThan(0)
      expect(s.opacity).toBeLessThan(1)
      expect(s.pointerEvents).toBe('none')
    }
  })

  it('멀어지면(|offset|>=0.6) 숨긴다 — 슬라이드 DOM 6개가 전부 그려지는 낭비 방지', () => {
    expect(computeDockStyle(0, 2).visible).toBe(false)
    expect(computeDockStyle(4, 2).visible).toBe(false)
  })

  it('translateY는 스크롤 반대 방향으로 드리프트한다 (지나가는 창밖 풍경감)', () => {
    expect(computeDockStyle(1.8, 2).translateY).toBeGreaterThan(0)
    expect(computeDockStyle(2.2, 2).translateY).toBeLessThan(0)
  })

  it('reduced 모드는 이동 없이 페이드만 한다', () => {
    expect(computeDockStyle(1.8, 2, true).translateY).toBe(0)
  })
})
