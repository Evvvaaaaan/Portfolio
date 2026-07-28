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

describe('layout (arc)', () => {
  it('keeps every sculpture at the same height', () => {
    const out = layout(SCULPTURES, { spacing: 16, height: 3, shape: 'arc' })
    expect(out.length).toBe(SCULPTURES.length)
    for (const s of out) expect(s.position[1]).toBe(3)
  })

  it('spaces neighbours evenly along the arc', () => {
    const out = layout(SCULPTURES, { spacing: 16, shape: 'arc', sweep: 200 })
    const gaps = out.slice(1).map((s, i) => {
      const p = out[i].position
      return Math.hypot(s.position[0] - p[0], s.position[1] - p[1], s.position[2] - p[2])
    })
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
  })

  it('opens symmetrically about +Z so the ends mirror each other', () => {
    const out = layout(SCULPTURES, { spacing: 16, shape: 'arc', sweep: 200 })
    const first = out[0].position
    const last = out[out.length - 1].position
    expect(first[0]).toBeCloseTo(-last[0], 6)
    expect(first[2]).toBeCloseTo(last[2], 6)
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

  it('offsets on a straight tour exactly as the world-axis version did', () => {
    const laid = layout(SCULPTURES, { spacing: 14, height: 1 })
    const wps = waypoints(laid, { back: 7, up: 2.5, side: 4 })
    wps.forEach((w, i) => {
      const p = laid[i].position
      expect(w.position[0]).toBeCloseTo(p[0] - 4, 6)
      expect(w.position[1]).toBeCloseTo(p[1] + 2.5, 6)
      expect(w.position[2]).toBeCloseTo(p[2] - 7, 6)
    })
  })

  // back/up/side are applied along mutually orthogonal axes (path tangent,
  // world up, and their cross product), so the camera sits the same distance
  // from its subject whatever shape the tour is — that is what the old
  // world-axis implementation lost as soon as the path curved.
  it('keeps a constant framing distance on a curved tour', () => {
    const expected = Math.hypot(8, 2.6, 4.5)
    for (const shape of ['line', 'arc']) {
      const laid = layout(SCULPTURES, { spacing: 16, shape, sweep: 200 })
      const wps = waypoints(laid, { back: 8, up: 2.6, side: 4.5 })
      wps.forEach((w, i) => {
        const p = laid[i].position
        const d = Math.hypot(w.position[0] - p[0], w.position[1] - p[1], w.position[2] - p[2])
        expect(d).toBeCloseTo(expected, 6)
      })
    }
  })
})
