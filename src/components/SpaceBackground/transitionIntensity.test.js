import { describe, it, expect } from 'vitest'
import { computeTransitionIntensity } from './transitionIntensity.js'

describe('computeTransitionIntensity', () => {
  it('is 0 exactly at a section boundary', () => {
    expect(computeTransitionIntensity(0, 800)).toBe(0)
    expect(computeTransitionIntensity(800, 800)).toBe(0)
    expect(computeTransitionIntensity(1600, 800)).toBe(0)
  })

  it('peaks at 1 at the midpoint between two adjacent sections', () => {
    expect(computeTransitionIntensity(400, 800)).toBeCloseTo(1, 5)
    expect(computeTransitionIntensity(1200, 800)).toBeCloseTo(1, 5)
  })

  it('is symmetric around the midpoint', () => {
    const before = computeTransitionIntensity(200, 800)
    const after = computeTransitionIntensity(600, 800)
    expect(before).toBeCloseTo(after, 5)
    expect(before).toBeCloseTo(0.75, 5)
  })

  it('returns 0 when viewportHeight is 0 (avoids division by zero)', () => {
    expect(computeTransitionIntensity(500, 0)).toBe(0)
  })
})
