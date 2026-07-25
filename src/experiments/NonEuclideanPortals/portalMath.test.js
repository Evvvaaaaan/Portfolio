import { describe, it, expect } from 'vitest'
import { Vector3, Matrix4 } from 'three'
import { portalMatrix, relativePortalMatrix, crossedPortal } from './portalMath.js'

describe('portalMatrix', () => {
  it('places the portal at its position with yaw rotation', () => {
    const m = portalMatrix(new Vector3(2, 0, -3), Math.PI / 2)
    const pos = new Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBeCloseTo(2, 5)
    expect(pos.z).toBeCloseTo(-3, 5)
    // +z local axis rotated by +90° about y points toward +x
    const zAxis = new Vector3(0, 0, 1).transformDirection(m)
    expect(zAxis.x).toBeCloseTo(1, 5)
    expect(zAxis.z).toBeCloseTo(0, 5)
  })
})

describe('relativePortalMatrix', () => {
  it('a point at the entry portal center maps to the exit portal center', () => {
    const entry = portalMatrix(new Vector3(0, 0, 0), 0)
    const exit = portalMatrix(new Vector3(10, 0, 5), 0)
    const rel = relativePortalMatrix(entry, exit)
    const mapped = new Vector3(0, 0, 0).applyMatrix4(rel)
    expect(mapped.x).toBeCloseTo(10, 5)
    expect(mapped.z).toBeCloseTo(5, 5)
  })

  it('applies a 180° flip: a point just behind entry (just crossed through) lands just in front of exit', () => {
    const entry = portalMatrix(new Vector3(0, 0, 0), 0)   // front = +z
    const exit = portalMatrix(new Vector3(10, 0, 0), 0)   // front = +z
    const rel = relativePortalMatrix(entry, exit)
    // 1 unit behind entry (local -z: where you land immediately after crossing the front face)
    const p = new Vector3(0, 0, -1).applyMatrix4(rel)
    // after 180° flip it should be 1 unit in FRONT of exit (world +z), so you emerge moving away from it
    expect(p.x).toBeCloseTo(10, 5)
    expect(p.z).toBeCloseTo(1, 5)
  })
})

describe('crossedPortal', () => {
  const entry = portalMatrix(new Vector3(0, 0, 0), 0) // front +z, plane at z=0
  it('true when moving front-to-back through the quad', () => {
    const prev = new Vector3(0, 1.6, 0.3)
    const next = new Vector3(0, 1.6, -0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(true)
  })
  it('false when the crossing point is outside the quad width', () => {
    const prev = new Vector3(5, 1.6, 0.3)
    const next = new Vector3(5, 1.6, -0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
  it('false when moving back-to-front (wrong direction)', () => {
    const prev = new Vector3(0, 1.6, -0.3)
    const next = new Vector3(0, 1.6, 0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
  it('false when both points are on the same side', () => {
    const prev = new Vector3(0, 1.6, 0.3)
    const next = new Vector3(0, 1.6, 0.1)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
})
