import { describe, it, expect } from 'vitest'
import { collectTargets, MAX_BODIES } from './snapshot.js'

function fakeEl(x, y, w, h) {
  return {
    getBoundingClientRect: () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }),
    contains: () => false,
  }
}

const doc = (els) => ({ querySelectorAll: () => els })

describe('collectTargets', () => {
  it('filters tiny and off-screen elements', () => {
    const els = [
      fakeEl(0, 10, 100, 40),      // 화면 안 — 포함
      fakeEl(0, 10, 4, 4),         // 너무 작음 — 제외
      fakeEl(0, 2000, 100, 40),    // 뷰포트 아래 — 제외
      fakeEl(0, -100, 100, 40),    // 뷰포트 위 — 제외
    ]
    const out = collectTargets(doc(els), 800)
    expect(out).toHaveLength(1)
    expect(out[0].rect).toEqual({ x: 0, y: 10, w: 100, h: 40 })
  })

  it('skips children of already-collected elements', () => {
    const parent = fakeEl(0, 0, 300, 300)
    const child = fakeEl(10, 10, 50, 50)
    parent.contains = (el) => el === child
    const out = collectTargets(doc([parent, child]), 800)
    expect(out).toHaveLength(1)
  })

  it('caps at MAX_BODIES, keeping largest first', () => {
    const els = Array.from({ length: MAX_BODIES + 20 }, (_, i) => fakeEl(0, 1, 10 + i, 10))
    const out = collectTargets(doc(els), 800)
    expect(out).toHaveLength(MAX_BODIES)
    expect(out[0].rect.w).toBeGreaterThan(out.at(-1).rect.w)
  })
})
