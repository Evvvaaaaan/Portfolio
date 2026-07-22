import { describe, it, expect } from 'vitest'
import {
  ANCHOR_INDICES,
  selectAnchors,
  readExpression,
  isBurst,
  JAW_OPEN_BURST,
  faceCenter,
} from './faceMap.js'

// Build a fake 468-point landmark array where point i sits at x=i/1000, y=i/500.
const fakeLandmarks = Array.from({ length: 468 }, (_, i) => ({ x: i / 1000, y: i / 500 }))

describe('ANCHOR_INDICES', () => {
  it('is a non-empty list of in-range mesh indices', () => {
    expect(ANCHOR_INDICES.length).toBeGreaterThan(30)
    for (const i of ANCHOR_INDICES) {
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(468)
    }
    // no duplicates
    expect(new Set(ANCHOR_INDICES).size).toBe(ANCHOR_INDICES.length)
  })
})

describe('selectAnchors', () => {
  it('mirrors x and scales to pixels for every anchor index', () => {
    const pts = selectAnchors(fakeLandmarks, 200, 100)
    expect(pts.length).toBe(ANCHOR_INDICES.length)
    const first = ANCHOR_INDICES[0]
    expect(pts[0].x).toBeCloseTo((1 - first / 1000) * 200)
    expect(pts[0].y).toBeCloseTo((first / 500) * 100)
  })
})

describe('readExpression', () => {
  it('extracts jawOpen and averages the paired shapes', () => {
    const bs = [
      { categoryName: 'jawOpen', score: 0.8 },
      { categoryName: 'mouthSmileLeft', score: 0.4 },
      { categoryName: 'mouthSmileRight', score: 0.6 },
      { categoryName: 'eyeBlinkLeft', score: 0.2 },
      { categoryName: 'eyeBlinkRight', score: 0.0 },
    ]
    const e = readExpression(bs)
    expect(e.jawOpen).toBeCloseTo(0.8)
    expect(e.smile).toBeCloseTo(0.5)
    expect(e.blink).toBeCloseTo(0.1)
  })

  it('defaults missing categories to 0', () => {
    const e = readExpression([])
    expect(e).toEqual({ jawOpen: 0, smile: 0, blink: 0 })
  })
})

describe('isBurst', () => {
  it('fires only above the threshold', () => {
    expect(isBurst(JAW_OPEN_BURST + 0.01)).toBe(true)
    expect(isBurst(JAW_OPEN_BURST - 0.01)).toBe(false)
  })
})

describe('faceCenter', () => {
  it('returns the mirrored nose-tip pixel position', () => {
    const c = faceCenter(fakeLandmarks, 200, 100)
    expect(c.x).toBeCloseTo((1 - 1 / 1000) * 200)
    expect(c.y).toBeCloseTo((1 / 500) * 100)
  })
})
