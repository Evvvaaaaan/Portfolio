import { describe, it, expect } from 'vitest'
import { SCULPTURES, layout, waypoints } from './sculptures'

describe('SCULPTURES', () => {
  it('has at least 3 sculptures with required fields', () => {
    expect(SCULPTURES.length).toBeGreaterThanOrEqual(3)
    for (const s of SCULPTURES) {
      expect(s.id).toBeTruthy()
      expect(s.form).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.caption).toBeTruthy()
      expect(s.material).toBeTruthy()
    }
  })

  it('has unique ids', () => {
    const ids = new Set(SCULPTURES.map((s) => s.id))
    expect(ids.size).toBe(SCULPTURES.length)
  })
})

describe('layout', () => {
  it('preserves count and adds position + tourStop', () => {
    const out = layout(SCULPTURES, { spacing: 14, height: 0 })
    expect(out.length).toBe(SCULPTURES.length)
    expect(out[0].tourStop).toBe(0)
    expect(out[out.length - 1].tourStop).toBe(1)
  })

  it('spaces sculptures evenly along +Z', () => {
    const out = layout(SCULPTURES, { spacing: 10, height: 2 })
    expect(out[0].position).toEqual([0, 2, 0])
    expect(out[1].position).toEqual([0, 2, 10])
    // monotonically increasing z
    for (let i = 1; i < out.length; i++) {
      expect(out[i].position[2]).toBeGreaterThan(out[i - 1].position[2])
    }
  })
})

describe('waypoints', () => {
  it('produces one waypoint per sculpture that looks at it', () => {
    const laid = layout(SCULPTURES, { spacing: 14 })
    const wps = waypoints(laid, { back: 7, up: 2.5, side: 4 })
    expect(wps.length).toBe(laid.length)
    expect(wps[0].lookAt).toEqual(laid[0].position)
    // camera pulled back on -Z relative to its sculpture
    expect(wps[0].position[2]).toBeLessThan(laid[0].position[2])
  })
})
