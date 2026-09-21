// Assisted arcade flight, not an aeronautical training model. Metres / seconds.
import { getAircraft } from './aircraft.js'
import { CHECKPOINT_GOLD } from './progress.js'
import { WORLD_LIMIT, terrainHeight, biomeAt } from './world.js'
export { WORLD_LIMIT, ISLANDS, terrainHeight } from './world.js'

export const STEP = 1 / 120
export const TIME_LIMIT = 150
export const SPAWN = { x: 0, y: 125, z: 240 }
export const GATES = [
  { x: 0, y: 125, z: -70, radius: 30, name: '첫 번째 바람' },
  { x: 0, y: 135, z: -350, radius: 32, name: '해안선' },
  { x: 160, y: 155, z: -670, radius: 35, name: '북쪽 곶' },
  { x: 470, y: 155, z: -870, radius: 36, name: '푸른 만' },
  { x: 800, y: 135, z: -690, radius: 38, name: '동쪽 바람' },
  { x: 910, y: 125, z: -270, radius: 38, name: '섬의 끝' },
  { x: 660, y: 125, z: 140, radius: 38, name: '귀환 항로' },
  { x: 280, y: 125, z: 320, radius: 38, name: '홈 스트레치' },
].map(orientGate)

function orientGate(gate, index, gates) {
  const previous = gates[index - 1] || SPAWN
  const dx = gate.x - previous.x, dy = gate.y - previous.y, dz = gate.z - previous.z
  const length = Math.hypot(dx, dy, dz)
  return { ...gate, normal: { x: dx / length, y: dy / length, z: dz / length } }
}

export const ROUTES = [
  { id: 'coast', name: '해안 항로', time: TIME_LIMIT, gates: GATES },
  { id: 'world', name: '월드 투어', time: 660, gates: [
    { x: 0, y: 150, z: -350, radius: 42, name: '바다에서 출발' },
    { x: -1400, y: 280, z: -1400, radius: 60, name: '정글의 입구' },
    { x: -3300, y: 400, z: -2100, radius: 65, name: '에메랄드 수관' },
    { x: -2400, y: 550, z: -3300, radius: 65, name: '숲 너머 능선' },
    { x: -300, y: 880, z: -4100, radius: 70, name: '알파인 고개' },
    { x: 1500, y: 950, z: -3500, radius: 70, name: '설산의 바람' },
    { x: 3200, y: 580, z: -2200, radius: 65, name: '동쪽 산자락' },
    { x: 4100, y: 320, z: -500, radius: 60, name: '대륙의 지평선' },
    { x: 4000, y: 260, z: 1400, radius: 60, name: '골든 평원' },
    { x: 2200, y: 220, z: 2800, radius: 60, name: '남쪽 초원' },
    { x: 400, y: 180, z: 1500, radius: 55, name: '다시 푸른 바다로' },
    { x: 0, y: 125, z: 400, radius: 50, name: '대륙 횡단의 끝' },
  ].map(orientGate) },
]
export const getRoute = (id) => ROUTES.find((route) => route.id === id) || ROUTES[0]

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export function createFlight(mode = 'course', aircraftId = 'trainer', routeId = 'coast') {
  const aircraft = getAircraft(aircraftId), route = getRoute(routeId)
  return {
    phase: 'ready', mode, aircraft: aircraft.id, route: route.id, position: { ...SPAWN }, heading: 0, pitch: 0, roll: 0,
    speed: aircraft.cruise, throttle: 0.58, elapsed: 0, time: route.time, gate: 0, score: 0, goldEarned: 0,
    notice: '', noticeTime: 0, reason: '', clearance: 125,
  }
}

// Test the swept segment against the gate plane, then its aperture. Being near
// a ring or crossing it backward is not a pass; fast flight cannot skip a gate.
export function gateCrossing(before, after, gate) {
  const n = gate.normal
  const distance = (p) => (p.x - gate.x) * n.x + (p.y - gate.y) * n.y + (p.z - gate.z) * n.z
  const a = distance(before), b = distance(after)
  if (a >= 0 || b < 0 || b <= a) return null
  const t = -a / (b - a)
  const x = before.x + (after.x - before.x) * t - gate.x
  const y = before.y + (after.y - before.y) * t - gate.y
  const z = before.z + (after.z - before.z) * t - gate.z
  const radius = Math.hypot(x, y, z)
  return radius <= gate.radius - 3 ? radius / gate.radius : null
}

export function stepFlight(state, input = {}, dt = STEP) {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, 1 / 30)
  const axis = (value) => Number.isFinite(value) ? clamp(value, -1, 1) : 0
  const pitch = axis(input.pitch), bank = axis(input.bank)
  const aircraft = getAircraft(state.aircraft), route = getRoute(state.route)
  state.elapsed += dt
  if (state.mode === 'course') state.time = Math.max(0, state.time - dt)
  state.noticeTime = Math.max(0, state.noticeTime - dt)
  state.throttle = clamp(state.throttle + axis(input.throttle) * dt * 0.3, 0, 1)
  state.pitch += (pitch * aircraft.climb - state.pitch) * (1 - Math.exp(-aircraft.response * dt))
  state.roll += (bank * 0.98 - state.roll) * (1 - Math.exp(-4.2 * dt))
  const targetSpeed = input.brake ? aircraft.minSpeed : aircraft.minSpeed + state.throttle * (aircraft.maxSpeed - aircraft.minSpeed)
  state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-0.8 * dt)) - Math.sin(state.pitch) * 7 * dt
  state.speed = clamp(state.speed, aircraft.minSpeed - 7, aircraft.maxSpeed + 7)
  state.heading = angleDifference(state.heading + Math.tan(state.roll) * aircraft.turn * dt, 0)
  const before = { ...state.position }
  const horizontal = Math.cos(state.pitch) * state.speed
  state.position.x += Math.sin(state.heading) * horizontal * dt
  state.position.z -= Math.cos(state.heading) * horizontal * dt
  state.position.y += (Math.sin(state.pitch) * state.speed - Math.max(0, 35 - state.speed) * 0.5) * dt
  state.clearance = state.position.y - Math.max(0, terrainHeight(state.position.x, state.position.z))

  if (state.clearance <= 2.5) {
    state.phase = 'crashed'
    state.reason = terrainHeight(state.position.x, state.position.z) > 0 ? 'terrain' : 'water'
    return
  }
  if (Math.hypot(state.position.x, state.position.z) > WORLD_LIMIT || state.position.y > 1600) {
    state.phase = 'crashed'
    state.reason = 'boundary'
    return
  }
  if (state.mode === 'course' && state.time <= 0) { state.phase = 'crashed'; state.reason = 'timeout'; return }
  const gate = state.mode === 'course' ? route.gates[state.gate] : null
  if (gate) {
    const crossing = gateCrossing(before, state.position, gate)
    if (crossing !== null) {
      state.gate++
      const points = 100 + Math.round((1 - crossing) * 100)
      state.score += points
      state.goldEarned += CHECKPOINT_GOLD
      state.notice = crossing < 0.3 ? `PERFECT LINE +${points}` : `CHECKPOINT +${points}`
      state.noticeTime = 2
      if (state.gate === route.gates.length) state.phase = 'won'
    }
  }
}

export function flightTelemetry(state) {
  const gate = getRoute(state.route).gates[state.gate]
  const target = state.mode === 'course' && gate
  return {
    phase: state.phase, mode: state.mode, aircraft: state.aircraft, route: state.route, biome: biomeAt(state.position.x, state.position.z), goldEarned: state.goldEarned,
    speed: Math.round(state.speed * 3.6), altitude: Math.round(state.position.y),
    clearance: Math.round(state.clearance), throttle: Math.round(state.throttle * 100),
    heading: (Math.round(state.heading * 180 / Math.PI) + 360) % 360, roll: state.roll, pitch: state.pitch,
    time: Math.ceil(state.time), elapsed: state.elapsed, gate: state.gate, score: state.score, reason: state.reason,
    notice: state.noticeTime > 0 ? state.notice : '',
    distance: target ? Math.round(Math.hypot(gate.x - state.position.x, gate.y - state.position.y, gate.z - state.position.z)) : 0,
    bearing: target ? angleDifference(Math.atan2(gate.x - state.position.x, -(gate.z - state.position.z)), state.heading) * 180 / Math.PI : 0,
    x: state.position.x, z: state.position.z,
  }
}
