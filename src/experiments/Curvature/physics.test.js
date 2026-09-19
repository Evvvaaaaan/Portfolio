import { describe, it, expect } from 'vitest'
import { tracePhoton, surfaceHeight, clockRate, criticalImpact, horizonRadius, WORLD_UNIT_KM, PRESETS } from './physics.js'

describe('Curvature — Schwarzschild model', () => {
  it('recovers a straight ray and a flat sheet without mass', () => {
    const ray = tracePhoton(0, 4)
    expect(ray.outcome).toBe('escaped')
    expect(ray.deflection).toBe(0)
    expect(ray.points.every((p) => p[1] === 4)).toBe(true)
    expect(surfaceHeight(1, 0)).toBe(0)
    expect(clockRate(0, 0)).toBe(1)
  })
  it('recovers weak-field deflection 2 r_s / b', () => {
    const ray = tracePhoton(0.01, 5)
    expect(ray.deflection * Math.PI / 180).toBeCloseTo(0.004, 4)
  })
  it('captures rays below the critical impact and lets those above escape', () => {
    for (const rs of [0.3, 1, 2.5]) {
      const critical = criticalImpact(rs)
      expect(tracePhoton(rs, critical * 0.995).outcome).toBe('captured')
      expect(tracePhoton(rs, critical * 1.005).outcome).toBe('escaped')
    }
  })
  it('bends more strongly when mass increases or impact decreases', () => {
    expect(tracePhoton(1, 4).deflection).toBeGreaterThan(tracePhoton(0.5, 4).deflection)
    expect(tracePhoton(1, 4).deflection).toBeGreaterThan(tracePhoton(1, 6).deflection)
  })
  it('mirrors rays on opposite sides of the source', () => {
    const a = tracePhoton(1, 4), b = tracePhoton(1, -4)
    expect(a.deflection).toBe(b.deflection)
    expect(a.points.length).toBe(b.points.length)
    a.points.forEach((p, i) => { expect(p[0]).toBe(b.points[i][0]); expect(p[1]).toBe(-b.points[i][1]) })
  })
  it('converges when the integration step is halved', () => {
    expect(tracePhoton(1, 2.61).deflection).toBeCloseTo(tracePhoton(1, 2.61, { step: 0.0015 }).deflection, 3)
  })
  it('produces finite paths, including a head-on ray', () => {
    for (const impact of [0, 0.01, 1, 2.599, 5, 10]) {
      const ray = tracePhoton(1, impact)
      expect(ray.points.length).toBeGreaterThan(0)
      expect(ray.points.flat().every(Number.isFinite)).toBe(true)
      expect(ray.outcome).not.toBe('unresolved')
    }
  })
  it('uses the stationary observer clock ratio to infinity', () => {
    expect(clockRate(1, 1)).toBe(0)
    expect(clockRate(1, 3)).toBeCloseTo(Math.sqrt(2 / 3))
    expect(clockRate(1, 10)).toBeGreaterThan(clockRate(1, 2))
  })
  it('makes the spatial section deeper toward the horizon', () => {
    expect(surfaceHeight(1, 1)).toBeLessThan(surfaceHeight(5, 1))
    expect(surfaceHeight(22, 1)).toBe(0)
  })
  it('keeps each preset consistent with its stated experiment', () => {
    const paths = PRESETS.map((p) => tracePhoton(horizonRadius(p.mass), p.impact / WORLD_UNIT_KM))
    expect(paths.map((p) => p.outcome)).toEqual(['escaped', 'escaped', 'escaped', 'captured'])
    expect(paths[2].deflection).toBeGreaterThan(180)
  })
})
