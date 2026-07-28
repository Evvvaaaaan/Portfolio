import { describe, it, expect } from 'vitest'
import { SCULPTURES } from './sculptures'
import { formFor, superPoint, superRadius, maxExtent, MAX_RADIUS } from './forms'

const forms = SCULPTURES.map((s, i) => formFor(s.id, i))

describe('formFor', () => {
  it('is deterministic for the same id and position', () => {
    expect(formFor('ink-flow', 3)).toEqual(formFor('ink-flow', 3))
  })

  it('gives different ids different shapes', () => {
    const keys = forms.map((f) => JSON.stringify(f.params))
    expect(new Set(keys).size).toBe(forms.length)
  })

  it('interleaves hole-punched knots with solid masses', () => {
    const families = forms.map((f) => f.family)
    expect(families).toContain('knot')
    expect(families).toContain('super')
    // 같은 계열이 세 번 연속 나오면 투어가 한 무리처럼 보인다
    for (let i = 2; i < families.length; i++) {
      const run = families[i] === families[i - 1] && families[i] === families[i - 2]
      expect(run).toBe(false)
    }
  })

  it('varies the spin axis and speed so shapes do not move as one', () => {
    const speeds = new Set(forms.map((f) => f.spin.speed.toFixed(4)))
    expect(speeds.size).toBe(forms.length)
    for (const f of forms) {
      expect(Math.hypot(...f.spin.axis)).toBeCloseTo(1, 6)
      expect(Math.abs(f.spin.speed)).toBeGreaterThan(0)
    }
  })
})

describe('superRadius', () => {
  it('stays finite and bounded across the domain', () => {
    for (const f of forms.filter((x) => x.family === 'super')) {
      for (let i = 0; i <= 360; i++) {
        const a = -Math.PI + (i / 360) * Math.PI * 2
        const r = superRadius(f.params.lat, a)
        expect(Number.isFinite(r)).toBe(true)
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(MAX_RADIUS)
      }
    }
  })
})

describe('superPoint / maxExtent', () => {
  it('produces finite vertices for every generated shape', () => {
    for (const f of forms.filter((x) => x.family === 'super')) {
      for (let i = 0; i <= 32; i++) {
        for (let j = 0; j <= 16; j++) {
          const theta = -Math.PI + (i / 32) * Math.PI * 2
          const phi = -Math.PI / 2 + (j / 16) * Math.PI
          for (const v of superPoint(f.params, theta, phi)) {
            expect(Number.isFinite(v)).toBe(true)
          }
        }
      }
    }
  })

  it('reports a positive extent usable for size normalisation', () => {
    for (const f of forms.filter((x) => x.family === 'super')) {
      expect(maxExtent(f.params)).toBeGreaterThan(0)
    }
  })
})
