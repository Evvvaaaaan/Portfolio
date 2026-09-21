import { describe, expect, it } from 'vitest'
import { AIRCRAFT, getAircraft } from './aircraft.js'
import { CHECKPOINT_GOLD, PROGRESS_KEY, loadProgress, newProgress, purchaseAircraft, saveProgress } from './progress.js'
import { GATES, ROUTES, SPAWN, STEP, angleDifference, clamp, createFlight, flightTelemetry, stepFlight } from './game.js'
import { BIOMES, LANDMASSES, WORLD_LIMIT, biomeAt, terrainHeight } from './world.js'

function storageWith(value = null) {
  const values = new Map([[PROGRESS_KEY, value]])
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, next) => values.set(key, next) }
}

function passGate(state, index = state.gate) {
  const gate = ROUTES.find((route) => route.id === state.route).gates[index]
  state.position = { x: gate.x - gate.normal.x, y: gate.y - gate.normal.y, z: gate.z - gate.normal.z }
  state.heading = Math.atan2(gate.normal.x, -gate.normal.z)
  state.pitch = Math.asin(gate.normal.y)
  for (let i = 0; i < 10; i++) stepFlight(state, { pitch: state.pitch / getAircraft(state.aircraft).climb }, STEP)
}

describe('saved hangar and checkpoint currency', () => {
  it('starts with one free plane and recovers from missing or corrupt saves', () => {
    for (const value of [null, '{bad', 'null', '[]', '{"gold":-10}', '{"gold":1.5}']) expect(loadProgress(storageWith(value))).toEqual(newProgress())
  })

  it('only restores known owned aircraft and a selection that is owned', () => {
    const saved = { gold: 120, owned: ['jet', 'jet', 'unknown'], selected: 'sailplane' }
    expect(loadProgress(storageWith(JSON.stringify(saved)))).toEqual({ gold: 120, owned: ['trainer', 'jet'], selected: 'trainer' })
    expect(loadProgress(storageWith('{"gold":120,"owned":"jet","selected":"jet"}')).owned).toEqual(['trainer'])
  })

  it('charges the exact price once and restores the purchase and selection', () => {
    const bought = purchaseAircraft({ ...newProgress(), gold: 400 }, 'bush')
    expect(bought).toEqual({ gold: 100, owned: ['trainer', 'bush'], selected: 'bush' })
    expect(purchaseAircraft(bought, 'bush')).toBe(bought)
    const storage = storageWith()
    expect(saveProgress(bought, storage)).toBe(true)
    expect(loadProgress(storage)).toEqual(bought)
  })

  it('rejects insufficient funds and unknown aircraft without spending', () => {
    const saved = { ...newProgress(), gold: 299 }
    expect(purchaseAircraft(saved, 'bush')).toBe(saved)
    expect(purchaseAircraft(saved, 'unknown')).toBe(saved)
    expect(saved.gold).toBe(299)
  })

  it('reports storage failure without breaking the in-memory progression', () => {
    const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }
    expect(loadProgress(storage)).toEqual(newProgress())
    expect(saveProgress({ ...newProgress(), gold: 100 }, storage)).toBe(false)
  })

  it('rewards a swept crossing once and keeps earned gold after a crash', () => {
    const state = createFlight(); state.phase = 'playing'
    passGate(state)
    expect(state.gate).toBe(1)
    expect(state.goldEarned).toBe(CHECKPOINT_GOLD)
    passGate(state, 0)
    expect(state.goldEarned).toBe(CHECKPOINT_GOLD)
    state.position.y = 0
    stepFlight(state)
    expect(state.phase).toBe('crashed')
    expect(state.goldEarned).toBe(CHECKPOINT_GOLD)
    expect(createFlight().goldEarned).toBe(0)
  })

  it('does not pay for a later gate, a missed ring, reverse travel, or free flight', () => {
    const later = createFlight(); later.phase = 'playing'; passGate(later, 1)
    expect(later.goldEarned).toBe(0)
    for (const [mode, x, heading] of [['course', GATES[0].radius + 5, 0], ['course', 0, Math.PI], ['free', 0, 0]]) {
      const state = createFlight(mode); state.phase = 'playing'
      state.position = { x, y: 125, z: GATES[0].z + (heading ? -1 : 1) }; state.heading = heading
      for (let i = 0; i < 10; i++) stepFlight(state)
      expect(state.goldEarned).toBe(0)
    }
  })

  it.each(ROUTES)('pays for every checkpoint in $name, including the finishing ring', (route) => {
    const state = createFlight('course', 'trainer', route.id); state.phase = 'playing'
    for (let index = 0; index < route.gates.length; index++) passGate(state)
    expect(state.phase).toBe('won')
    expect(state.goldEarned).toBe(route.gates.length * CHECKPOINT_GOLD)
    for (let i = 0; i < 100; i++) stepFlight(state)
    expect(state.goldEarned).toBe(route.gates.length * CHECKPOINT_GOLD)
  })
})

describe('aircraft and connected world', () => {
  it.each(AIRCRAFT)('$name can complete the world tour using flight controls', (aircraft) => {
    const state = createFlight('course', aircraft.id, 'world'); state.phase = 'playing'
    const route = ROUTES.find((item) => item.id === 'world')
    for (let frame = 0; frame < route.time * 60 && state.phase === 'playing'; frame++) {
      const gate = route.gates[state.gate], dx = gate.x - state.position.x, dz = gate.z - state.position.z
      const bearing = angleDifference(Math.atan2(dx, -dz), state.heading)
      const pitch = Math.atan2(gate.y - state.position.y, Math.hypot(dx, dz)) / aircraft.climb
      stepFlight(state, { bank: clamp(bearing * 2, -1, 1), pitch: clamp(pitch, -1, 1), brake: Math.abs(bearing) > 1 }, 1 / 60)
    }
    expect(state.phase).toBe('won')
    expect(state.goldEarned).toBe(1200)
  })

  it('uses the purchased aircraft performance in the actual flight simulation', () => {
    const speeds = AIRCRAFT.map((aircraft) => {
      const state = createFlight('free', aircraft.id); state.phase = 'playing'
      for (let i = 0; i < 1200; i++) stepFlight(state, { throttle: 1 })
      expect(state.phase).toBe('playing')
      expect(flightTelemetry(state).aircraft).toBe(aircraft.id)
      return state.speed
    })
    expect(speeds[3]).toBeGreaterThan(speeds[2])
    expect(speeds[2]).toBeGreaterThan(speeds[0])
    expect(speeds[0]).toBeGreaterThan(speeds[1])
  })

  it('has distinct land biomes and allows flying beyond the old 2.8km limit', () => {
    for (const land of LANDMASSES) {
      expect(terrainHeight(land.x, land.z)).toBeGreaterThan(60)
      expect(biomeAt(land.x, land.z)).toBe(land.biome)
    }
    const state = createFlight('free'); state.phase = 'playing'; state.position = { x: 0, y: 200, z: 4000 }
    stepFlight(state)
    expect(state.phase).toBe('playing')
    state.position.z = WORLD_LIMIT + 10
    stepFlight(state)
    expect(state.reason).toBe('boundary')
  })

  it('routes through all biomes and keeps every gate and its approach clear of terrain', () => {
    const world = ROUTES.find((route) => route.id === 'world')
    expect(new Set(world.gates.map((gate) => biomeAt(gate.x, gate.z)))).toEqual(new Set(Object.keys(BIOMES)))
    for (const route of ROUTES) {
      route.gates.forEach((gate, index) => {
        expect(Math.hypot(gate.x, gate.z) + gate.radius).toBeLessThan(WORLD_LIMIT)
        expect(gate.y - gate.radius - terrainHeight(gate.x, gate.z)).toBeGreaterThan(15)
        const start = route.gates[index - 1] || SPAWN
        for (let i = 0; i <= 30; i++) {
          const t = i / 30, x = start.x + (gate.x - start.x) * t, z = start.z + (gate.z - start.z) * t
          const altitude = start.y + (gate.y - start.y) * t
          expect(altitude - Math.max(0, terrainHeight(x, z)), `${route.id} approach to ${gate.name}`).toBeGreaterThan(25)
        }
      })
    }
  })
})
