import { describe, expect, it } from 'vitest'
import { WGS84_ELLIPSOID } from '3d-tiles-renderer'
import { Vector3 } from 'three'
import { STOPS, journeyFrame, stopProgress, coordinates } from './journey.js'

describe('the Earth journey camera', () => {
  it('lands at the geographic location of each landmark', () => {
    STOPS.forEach((stop, index) => {
      const frame = journeyFrame(stopProgress(index))
      const expected = WGS84_ELLIPSOID.getCartographicToPosition(stop.lat * Math.PI / 180, stop.lon * Math.PI / 180, stop.elevation, new Vector3())
      expect(frame.target.distanceTo(expected)).toBeLessThan(0.001)
      expect(frame.phase).toBe('arrived')
      expect(frame.height).toBeCloseTo(stop.height)
    })
  })

  it('keeps the entire intercontinental flight above the ellipsoid', () => {
    const radius = WGS84_ELLIPSOID.radius
    for (let p = 0; p <= STOPS.length; p += 0.002) {
      const { position, target, up, height } = journeyFrame(p)
      expect([...position, ...target, ...up, height].every(Number.isFinite)).toBe(true)
      expect(position.clone().divide(radius).length()).toBeGreaterThan(1)
      expect(up.length()).toBeCloseTo(1)
      expect(position.distanceTo(target)).toBeGreaterThan(100)
    }
  })

  it('does not jump at a boundary between destinations', () => {
    for (let index = 1; index < STOPS.length; index++) {
      const before = journeyFrame(index - 0.0000001)
      const after = journeyFrame(index)
      expect(before.position.distanceTo(after.position)).toBeLessThan(0.01)
      expect(before.target.distanceTo(after.target)).toBeLessThan(0.01)
      expect(before.up.distanceTo(after.up)).toBeLessThan(0.001)
    }
  })

  it('reverses the same path and clamps beyond either end', () => {
    const samples = [0, 0.3, 0.9, 1.4, 2.8, 4.7, 5]
    const positions = samples.map((p) => journeyFrame(p).position.toArray())
    expect([...samples].reverse().map((p) => journeyFrame(p).position.toArray())).toEqual([...positions].reverse())
    expect(journeyFrame(-1).position).toEqual(journeyFrame(0).position)
    expect(journeyFrame(9).position).toEqual(journeyFrame(5).position)
  })

  it('keeps an honest globe overview when imagery is unavailable', () => {
    const frame = journeyFrame(stopProgress(0), { overview: true })
    expect(frame.height).toBeGreaterThan(1000000)
    expect(frame.lat).toBeCloseTo(STOPS[0].lat)
  })

  it('labels southern and western coordinates correctly', () => {
    expect(coordinates(-22.95191, -43.21049)).toBe('22.9519° S  /  43.2105° W')
  })

  it('blends from a readable globe overview to the loaded ground continuously', () => {
    const distant = journeyFrame(0.94, { minimumHeight: 2870162 })
    const halfway = journeyFrame(0.94, { minimumHeight: 30000 })
    const ground = journeyFrame(0.94, { minimumHeight: 1 })
    expect(distant.height).toBeGreaterThan(1000000)
    expect(halfway.height).toBeGreaterThan(ground.height)
    expect(halfway.height).toBeLessThan(distant.height)
    expect(ground.height).toBeCloseTo(STOPS[0].height)
    const before = journeyFrame(0.025 - 0.00001)
    const after = journeyFrame(0.025 + 0.00001)
    expect(Math.abs(after.viewOffset - before.viewOffset)).toBeLessThan(0.0001)
  })
})
