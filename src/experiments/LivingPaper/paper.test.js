import { describe, expect, it } from 'vitest'
import { fitPaper, paperPoint, PAPER_WIDTH, PAPER_HEIGHT, PAPER_CORNERS } from './paper.js'

describe('paper geometry', () => {
  it('maps the entire flat sheet to the HTML border box for editing', () => {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.35, 0.62]]) {
      const p = paperPoint(u, v, 0, 100, 0, 0)
      expect(p[0]).toBeCloseTo(u * PAPER_WIDTH)
      expect(p[1]).toBeCloseTo(v * PAPER_HEIGHT)
      expect(p[2]).toBe(0)
    }
  })
  it('keeps the upper edge pinned while curling the lower corner toward the viewer', () => {
    expect(paperPoint(0, 0, 1.4, 0, 0, 0)).toEqual([0, 0, 0])
    const corner = paperPoint(1, 1, 1.4, 0, 0, 0)
    expect(corner[0]).toBeLessThan(PAPER_WIDTH)
    expect(corner[1]).toBeLessThan(PAPER_HEIGHT)
    expect(corner[2]).toBeGreaterThan(0)
  })
  it('fits the whole flat sheet into both a phone and a desktop stage', () => {
    for (const [width, height] of [[390, 475], [900, 800], [650, 570]]) {
      const fit = fitPaper(width, height)
      expect(fit.x).toBeGreaterThanOrEqual(32)
      expect(fit.y).toBeGreaterThanOrEqual(32)
      expect(fit.x + PAPER_WIDTH * fit.scale).toBeLessThanOrEqual(width - 32)
      expect(fit.y + PAPER_HEIGHT * fit.scale).toBeLessThanOrEqual(height - 32)
    }
  })
  it('bends each corner inward while keeping its opposite corner pinned', () => {
    PAPER_CORNERS.forEach(([u, v], i) => {
      const curls = [0, 0, 0, 0]
      curls[i] = 1.4
      const bent = paperPoint(u, v, curls, 0, 0, 0)
      const flat = [u * PAPER_WIDTH, v * PAPER_HEIGHT]
      const opposite = paperPoint(1 - u, 1 - v, curls, 0, 0, 0)
      expect(bent[2]).toBeGreaterThan(0)
      expect(Math.abs(bent[0] - PAPER_WIDTH / 2)).toBeLessThan(Math.abs(flat[0] - PAPER_WIDTH / 2))
      expect(Math.abs(bent[1] - PAPER_HEIGHT / 2)).toBeLessThan(Math.abs(flat[1] - PAPER_HEIGHT / 2))
      expect(opposite).toEqual([(1 - u) * PAPER_WIDTH, (1 - v) * PAPER_HEIGHT, 0])
    })
  })
  it('damps touch waves and removes all temporary deformation when flat for editing', () => {
    const ripples = [{ u: 0.5, v: 0.5, start: 0 }]
    const peak = paperPoint(0.5, 0.5, [0, 0, 0, 0], 0.1, 0, 1, ripples)
    const later = paperPoint(0.5, 0.5, [0, 0, 0, 0], 2, 0, 1, ripples)
    expect(Math.abs(peak[2])).toBeGreaterThan(10)
    expect(Math.abs(later[2])).toBeLessThan(0.1)
    expect(paperPoint(0.5, 0.5, [0, 0, 0, 0], 0.1, 0, 0, ripples, 1.6)).toEqual([240, 320, 0])
  })
  it('leaves room for all four resting handles on a narrow screen', () => {
    for (const width of [320, 390, 760]) {
      const fit = fitPaper(width, 475)
      for (const [u, v] of PAPER_CORNERS) {
        const [x, y] = paperPoint(u, v, [0.3, 0, 0, 0], 0, 0, 1)
        expect(fit.x + x * fit.scale - 19).toBeGreaterThanOrEqual(0)
        expect(fit.x + x * fit.scale + 19).toBeLessThanOrEqual(width)
        expect(fit.y + y * fit.scale - 19).toBeGreaterThanOrEqual(0)
        expect(fit.y + y * fit.scale + 19).toBeLessThanOrEqual(475)
      }
    }
  })
})
