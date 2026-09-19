import { describe, expect, it } from 'vitest'
import { horizontalRadius, isStableScene } from './navigation'

const stable = { representation: 'closed-solids-v1', cameras: [{}], qualityGate: {
  status: 'passed', version: 1, nonManifoldEdges: 0, degenerateFaces: 0, furnitureOverlaps: 0,
  photoProjectedSurfaces: 0, inspectedViews: 39, cameraOutsideGeometry: true, exportRoundTrip: true,
} }

describe('spatial exploration range', () => {
  it('unlocks exactly 180 degrees only for validated closed solids', () => {
    expect(horizontalRadius(stable) * 2).toBe(Math.PI)
    expect(isStableScene(stable)).toBe(true)
  })
  it('blocks legacy sheets even if the old completion is marked ready', () => {
    expect(horizontalRadius({ sourceCount: 1, completion: { status: 'ready' } })).toBe(0)
    expect(isStableScene(null)).toBe(false)
    expect(isStableScene({})).toBe(false)
  })
  it('fails closed for every failed or missing quality check', () => {
    for (const key of Object.keys(stable.qualityGate)) {
      expect(isStableScene({ ...stable, qualityGate: { ...stable.qualityGate, [key]: undefined } })).toBe(false)
    }
    expect(isStableScene({ ...stable, qualityGate: { ...stable.qualityGate, nonManifoldEdges: 1 } })).toBe(false)
    expect(isStableScene({ ...stable, cameras: [] })).toBe(false)
  })
})
