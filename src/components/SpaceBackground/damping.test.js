import { describe, it, expect } from 'vitest'
import { dampFactor, REFERENCE_FRAME_MS } from './damping.js'

describe('dampFactor', () => {
  it('기준 프레임 간격에서는 rate를 그대로 돌려준다', () => {
    expect(dampFactor(0.08, REFERENCE_FRAME_MS)).toBeCloseTo(0.08, 12)
  })

  it('두 프레임치 간격은 rate를 두 번 적용한 것과 같다', () => {
    const twice = 1 - (1 - 0.08) * (1 - 0.08)
    expect(dampFactor(0.08, REFERENCE_FRAME_MS * 2)).toBeCloseTo(twice, 12)
  })

  it('절반 간격(120Hz)에서는 기준보다 덜 감쇠한다 — 주사율에 따라 무게감이 바뀌지 않는다', () => {
    const half = dampFactor(0.08, REFERENCE_FRAME_MS / 2)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(0.08)
    // 절반 계수를 두 번 적용하면 기준 한 번과 같아야 한다.
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(0.08, 12)
  })

  it('간격이 길어질수록 단조 증가하고 1을 넘지 않는다', () => {
    let prev = 0
    for (const dt of [1, 8, 16.7, 33, 50, 200, 5000]) {
      const k = dampFactor(0.08, dt)
      expect(k).toBeGreaterThan(prev)
      expect(k).toBeLessThanOrEqual(1)
      prev = k
    }
  })

  it('진행하지 않은 프레임(dt<=0)은 0을 돌려준다', () => {
    expect(dampFactor(0.08, 0)).toBe(0)
    expect(dampFactor(0.08, -5)).toBe(0)
  })

  it('rate가 0 이하면 감쇠하지 않고, 1 이상이면 즉시 따라붙는다', () => {
    expect(dampFactor(0, 16.7)).toBe(0)
    expect(dampFactor(-1, 16.7)).toBe(0)
    expect(dampFactor(1, 16.7)).toBe(1)
    expect(dampFactor(2, 16.7)).toBe(1)
  })
})
