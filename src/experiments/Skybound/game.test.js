import { describe, it, expect } from 'vitest'
import { STEP, SPAWN, GATES, TIME_LIMIT, createFlight, stepFlight, gateCrossing, terrainHeight, angleDifference, flightTelemetry, clamp } from './game.js'

const playing = (mode) => ({ ...createFlight(mode), phase: 'playing' })
const fly = (s, input, seconds) => { for (let i = 0; i < seconds / STEP; i++) stepFlight(s, input) }

describe('Skybound flight game', () => {
  it('starts safely airborne without moving before takeoff', () => {
    const s = createFlight()
    stepFlight(s, { pitch: 1 })
    expect(s.position).toEqual(SPAWN)
    expect(s.elapsed).toBe(0)
    expect(s.position.y).toBeGreaterThan(terrainHeight(s.position.x, s.position.z) + 20)
  })
  it('allows the first two rings to be reached on the initial heading', () => {
    const s = playing()
    fly(s, {}, 10)
    expect(s.gate).toBe(2)
    expect(s.score).toBeGreaterThan(300)
  })
  it('climbs, banks and returns to level when controls are released', () => {
    const s = playing('free')
    fly(s, { pitch: 1, bank: 1 }, 2)
    expect(s.position.y).toBeGreaterThan(SPAWN.y + 30)
    expect(s.position.x).toBeGreaterThan(10)
    expect(s.roll).toBeGreaterThan(0.8)
    fly(s, {}, 2)
    expect(Math.abs(s.roll)).toBeLessThan(0.01)
    expect(Math.abs(s.pitch)).toBeLessThan(0.01)
  })
  it('changes airspeed with throttle and brakes', () => {
    const fast = playing('free'), slow = playing('free')
    fly(fast, { throttle: 1 }, 3)
    fly(slow, { brake: true }, 3)
    expect(fast.speed).toBeGreaterThan(slow.speed + 35)
    expect(fast.throttle).toBe(1)
  })
  it('counts only a forward passage through the aperture', () => {
    const g = GATES[0]
    expect(gateCrossing({ x: 0, y: g.y, z: g.z + 100 }, { x: 0, y: g.y, z: g.z - 100 }, g)).toBe(0)
    expect(gateCrossing({ x: 0, y: g.y, z: g.z - 10 }, { x: 0, y: g.y, z: g.z + 10 }, g)).toBeNull()
    expect(gateCrossing({ x: 50, y: g.y, z: g.z + 10 }, { x: 50, y: g.y, z: g.z - 10 }, g)).toBeNull()
  })
  it('does not award points for passing later checkpoints out of order', () => {
    const s = playing()
    s.position = { ...GATES[1], z: GATES[1].z + 1 }
    fly(s, {}, 0.1)
    expect(s.gate).toBe(0)
    expect(s.score).toBe(0)
  })
  it('freezes the entire flight while paused', () => {
    const s = playing()
    s.phase = 'paused'
    const before = structuredClone(s)
    fly(s, { bank: 1, pitch: 1 }, 2)
    expect(s).toEqual(before)
  })
  it('ends on water / terrain impact and can start fresh', () => {
    const water = playing('free')
    fly(water, { pitch: -1 }, 8)
    expect(water.phase).toBe('crashed')
    const land = playing('free')
    land.position = { x: 370, z: -350, y: 10 }
    stepFlight(land)
    expect(land.phase).toBe('crashed')
    expect(land.reason).toBe('terrain')
    expect(createFlight().position).toEqual(SPAWN)
  })
  it('times out only in checkpoint mode', () => {
    const s = playing(), free = playing('free')
    s.time = 0.001
    free.time = 0.001
    stepFlight(s)
    stepFlight(free)
    expect(s.reason).toBe('timeout')
    expect(free.phase).toBe('playing')
    expect(createFlight().time).toBe(TIME_LIMIT)
  })
  it('behaves consistently across fixed-step frequencies', () => {
    const a = playing('free'), b = playing('free')
    for (let i = 0; i < 240; i++) stepFlight(a, { bank: 0.4, pitch: 0.2 }, 1 / 120)
    for (let i = 0; i < 120; i++) stepFlight(b, { bank: 0.4, pitch: 0.2 }, 1 / 60)
    expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z)).toBeLessThan(1)
  })
  it('makes all eight gates reachable through flight inputs without teleporting', () => {
    const s = playing()
    for (let i = 0; i < 120 * 120 && s.phase === 'playing'; i++) {
      const gate = GATES[s.gate]
      const dx = gate.x - s.position.x, dz = gate.z - s.position.z
      const error = angleDifference(Math.atan2(dx, -dz), s.heading)
      const pitch = clamp((gate.y - s.position.y) / Math.max(80, Math.hypot(dx, dz)) * 2.5, -1, 1)
      stepFlight(s, { bank: clamp(error * 2.8, -1, 1), pitch })
    }
    expect(s.phase).toBe('won')
    expect(s.gate).toBe(8)
    expect(s.score).toBeGreaterThanOrEqual(800)
    expect(flightTelemetry(s).distance).toBe(0)
  })
})
