import { describe, it, expect } from 'vitest'
import { samplePath, stopT } from './cloudPath'

const wp = [
  { position: [0, 0, 0], lookAt: [0, 0, 1] },
  { position: [0, 2, 10], lookAt: [0, 2, 11] },
  { position: [0, 0, 20], lookAt: [0, 0, 21] },
]

describe('samplePath', () => {
  it('passes through the first waypoint at t=0', () => {
    const s = samplePath(wp, 0)
    expect(s.position).toEqual([0, 0, 0])
    expect(s.lookAt).toEqual([0, 0, 1])
  })

  it('passes through the last waypoint at t=1', () => {
    const s = samplePath(wp, 1)
    expect(s.position[2]).toBeCloseTo(20, 6)
    expect(s.lookAt[2]).toBeCloseTo(21, 6)
  })

  it('is continuous (small dt → small move)', () => {
    const a = samplePath(wp, 0.5)
    const b = samplePath(wp, 0.51)
    const d = Math.hypot(
      a.position[0] - b.position[0],
      a.position[1] - b.position[1],
      a.position[2] - b.position[2],
    )
    expect(d).toBeLessThan(1)
  })

  it('clamps t outside [0,1]', () => {
    expect(samplePath(wp, -1).position).toEqual([0, 0, 0])
    expect(samplePath(wp, 2).position[2]).toBeCloseTo(20, 6)
  })
})

describe('stopT', () => {
  it('maps endpoints to 0 and 1', () => {
    expect(stopT(0, 4)).toBe(0)
    expect(stopT(3, 4)).toBe(1)
  })

  it('is monotonically increasing', () => {
    const ts = [0, 1, 2, 3].map((i) => stopT(i, 4))
    expect(ts).toEqual([0, 1 / 3, 2 / 3, 1])
  })

  it('returns 0 for a single stop', () => {
    expect(stopT(0, 1)).toBe(0)
  })
})
