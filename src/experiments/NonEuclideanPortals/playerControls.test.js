import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { resolveMove, moveVector } from './playerControls.js'

const wall = [{ min: [-5, 2.7], max: [5, 3.3] }] // a wall slab near z=3

describe('resolveMove', () => {
  it('passes through open space unchanged', () => {
    const out = resolveMove(new Vector3(0, 1.6, 0), new Vector3(0, 0, 1), wall)
    expect(out.z).toBeCloseTo(1, 5)
  })
  it('stops the player before entering a wall from the front', () => {
    const out = resolveMove(new Vector3(0, 1.6, 2), new Vector3(0, 0, 1), wall, 0.35)
    // wall front face at z=2.7, minus radius 0.35 → clamp near z≈2.35
    expect(out.z).toBeLessThan(2.7)
    expect(out.z).toBeGreaterThan(2)
  })
  it('slides along a wall: blocked z but free x', () => {
    const out = resolveMove(new Vector3(0, 1.6, 2.5), new Vector3(1, 0, 1), wall, 0.35)
    expect(out.x).toBeCloseTo(1, 5)     // x movement preserved
    expect(out.z).toBeLessThan(2.7)     // z movement blocked
  })
})

describe('moveVector', () => {
  it('forward with yaw=0 moves toward -z', () => {
    const d = moveVector(0, { f: true, b: false, l: false, r: false }, 1)
    expect(d.z).toBeCloseTo(-1, 5)
    expect(d.x).toBeCloseTo(0, 5)
  })
  it('strafe right with yaw=0 moves toward +x', () => {
    const d = moveVector(0, { f: false, b: false, l: false, r: true }, 1)
    expect(d.x).toBeCloseTo(1, 5)
  })
})
