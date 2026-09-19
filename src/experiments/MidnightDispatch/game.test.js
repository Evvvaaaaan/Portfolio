import { describe, expect, it } from 'vitest'
import { BUILDINGS, JOBS, LIMIT, STEP, createCity, createGame, interact, isBlocked, stepGame } from './game.js'

const playing = () => Object.assign(createGame(), { phase: 'playing' })
const advance = (s, input, seconds) => { for (let i = 0; i < seconds / STEP; i++) stepGame(s, input) }

describe('Midnight Dispatch', () => {
  it('generates a repeatable city with reachable spawn and delivery zones', () => {
    expect(createCity()).toEqual(BUILDINGS)
    for (const spot of [...JOBS, createGame().car, createGame().player]) expect(isBlocked(spot.x, spot.z, 2.2)).toBe(false)
  })

  it('does not advance before starting, while paused, or after finishing', () => {
    for (const phase of ['ready', 'paused', 'won', 'lost']) {
      const s = Object.assign(createGame(), { phase })
      const before = structuredClone(s)
      advance(s, { y: 1 }, 1)
      interact(s)
      expect(s).toEqual(before)
    }
  })

  it('normalizes diagonal walking and blocks buildings and map boundaries', () => {
    const s = playing()
    const origin = { ...s.player }
    advance(s, { x: 1, y: 1 }, 0.2)
    expect(Math.hypot(s.player.x - origin.x, s.player.z - origin.z)).toBeCloseTo(1.2, 5)
    s.player.x = 0
    s.player.z = -18
    advance(s, { x: 1 }, 5)
    expect(s.player.x).toBeLessThan(10)
    expect(isBlocked(s.player.x, s.player.z)).toBe(false)
    s.player.x = LIMIT - 1
    s.player.z = 0
    advance(s, { x: 1 }, 5)
    expect(s.player.x).toBeLessThan(LIMIT)
  })

  it('requires proximity to enter and low speed to exit', () => {
    const s = playing()
    s.player.x = -50
    interact(s)
    expect(s.driving).toBe(false)
    s.player.x = -7
    interact(s)
    expect(s.driving).toBe(true)
    advance(s, { y: 1 }, 1)
    expect(s.car.z).toBeLessThan(10)
    interact(s)
    expect(s.driving).toBe(true)
    advance(s, { brake: true }, 2)
    interact(s)
    expect(s.driving).toBe(false)
    expect(isBlocked(s.player.x, s.player.z)).toBe(false)
  })

  it('handles opposite/invalid axes without NaN and bounds long frames', () => {
    const s = playing()
    interact(s)
    stepGame(s, { x: Infinity, y: NaN }, 10)
    expect(s.time).toBeCloseTo(180 - 1 / 30)
    expect(s.car.x).toBe(-3)
    expect(s.car.z).toBe(16)
    advance(s, { x: 0, y: 0 }, 1)
    expect(s.car.speed).toBeCloseTo(0)
  })

  it('uses actual sliding velocity for exit and delivery, not the engine target', () => {
    const s = playing()
    interact(s)
    Object.assign(s.car, { x: JOBS[0].x, z: JOBS[0].z, speed: 0, vx: 0, vz: -16 })
    interact(s)
    expect(s.driving).toBe(true)
    stepGame(s, { brake: true })
    expect(s.delivery).toBe(0)
  })

  it('collides with buildings without tunneling', () => {
    const s = playing()
    interact(s)
    s.car.z = -28
    s.car.heading = Math.PI / 2
    advance(s, { y: 1 }, 3)
    expect(isBlocked(s.car.x, s.car.z, 2.2)).toBe(false)
    expect(s.car.x).toBeLessThan(12)
    expect(s.car.health).toBeLessThan(100)
  })

  it('requires a stopped vehicle, completes three drops, and restarts cleanly', () => {
    const s = playing()
    s.player.x = JOBS[0].x
    s.player.z = JOBS[0].z
    advance(s, {}, 1)
    expect(s.job).toBe(0)
    s.driving = true
    s.traffic = []
    for (const job of JOBS) {
      Object.assign(s.car, job, { speed: 0, vx: 0, vz: 0 })
      advance(s, {}, 1)
    }
    expect(s.phase).toBe('won')
    expect(s.cash).toBe(2650)
    expect(s.job).toBe(3)
    expect(createGame().job).toBe(0)
    expect(createGame().car.health).toBe(100)
  })

  it('has reachable failure states for both the clock and the vehicle', () => {
    const timed = playing()
    timed.time = STEP / 2
    stepGame(timed)
    expect(timed.phase).toBe('lost')
    const wrecked = playing()
    wrecked.car.health = 0
    stepGame(wrecked)
    expect(wrecked.phase).toBe('lost')
  })

  it('keeps patrols on roads during pursuit and rewards creating distance', () => {
    const s = playing()
    s.heat = 2
    advance(s, {}, 10)
    for (const car of s.police) expect(isBlocked(car.x, car.z, 2.2)).toBe(false)
    expect(s.heat).toBeLessThan(2)
  })

  it('replays the same controls deterministically', () => {
    const a = playing(), b = playing()
    for (const s of [a, b]) {
      interact(s)
      advance(s, { y: 1 }, 2)
      advance(s, { x: 1, y: 1 }, 1)
      advance(s, { brake: true }, 1)
    }
    expect(a).toEqual(b)
  })
})
