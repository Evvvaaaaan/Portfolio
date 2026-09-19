// Assisted arcade flight, not an aeronautical training model. Metres / seconds.
export const STEP = 1 / 120
export const TIME_LIMIT = 150
export const WORLD_LIMIT = 2800
export const SPAWN = { x: 0, y: 125, z: 240 }
export const ISLANDS = [
  { x: 370, z: -350, rx: 325, rz: 370, height: 175 },
  { x: -520, z: -680, rx: 300, rz: 240, height: 145 },
  { x: 750, z: -1400, rx: 430, rz: 290, height: 215 },
  { x: -580, z: 630, rx: 390, rz: 310, height: 155 },
  { x: 1390, z: 350, rx: 340, rz: 450, height: 190 },
]
export const GATES = [
  { x: 0, y: 125, z: -70, radius: 30, name: '첫 번째 바람' },
  { x: 0, y: 135, z: -350, radius: 32, name: '해안선' },
  { x: 160, y: 155, z: -670, radius: 35, name: '북쪽 곶' },
  { x: 470, y: 155, z: -870, radius: 36, name: '푸른 만' },
  { x: 800, y: 135, z: -690, radius: 38, name: '동쪽 바람' },
  { x: 910, y: 125, z: -270, radius: 38, name: '섬의 끝' },
  { x: 660, y: 125, z: 140, radius: 38, name: '귀환 항로' },
  { x: 280, y: 125, z: 320, radius: 38, name: '홈 스트레치' },
].map((gate, index, gates) => {
  const previous = gates[index - 1] || SPAWN
  const dx = gate.x - previous.x, dy = gate.y - previous.y, dz = gate.z - previous.z
  const length = Math.hypot(dx, dy, dz)
  return { ...gate, normal: { x: dx / length, y: dy / length, z: dz / length } }
})

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export function terrainHeight(x, z) {
  let height = -3
  for (const island of ISLANDS) {
    const nx = (x - island.x) / island.rx, nz = (z - island.z) / island.rz
    const r = Math.hypot(nx, nz)
    const edge = 1 + 0.075 * Math.sin(Math.atan2(nz, nx) * 5 + island.x)
    if (r >= edge) continue
    const profile = Math.pow(Math.max(0, 1 - r / edge), 1.55)
    const ridges = 1 + 0.19 * Math.sin(x * 0.022 + z * 0.013) * Math.cos(z * 0.027)
    height = Math.max(height, profile * island.height * ridges - 2)
  }
  // Flat-topped airfield island, shared by visual terrain and collision checks.
  const airfield = Math.hypot((x + 220) / 170, (z - 190) / 235)
  height = Math.max(height, Math.min(10, (1 - airfield) * 65))
  return height
}

export function createFlight(mode = 'course') {
  return {
    phase: 'ready', mode, position: { ...SPAWN }, heading: 0, pitch: 0, roll: 0,
    speed: 62, throttle: 0.58, elapsed: 0, time: TIME_LIMIT, gate: 0, score: 0,
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
  state.elapsed += dt
  if (state.mode === 'course') state.time = Math.max(0, state.time - dt)
  state.noticeTime = Math.max(0, state.noticeTime - dt)
  state.throttle = clamp(state.throttle + axis(input.throttle) * dt * 0.3, 0, 1)
  state.pitch += (pitch * 0.5 - state.pitch) * (1 - Math.exp(-3.3 * dt))
  state.roll += (bank * 0.98 - state.roll) * (1 - Math.exp(-4.2 * dt))
  const targetSpeed = input.brake ? 30 : 30 + state.throttle * 68
  state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-0.8 * dt)) - Math.sin(state.pitch) * 7 * dt
  state.speed = clamp(state.speed, 23, 105)
  state.heading = angleDifference(state.heading + Math.tan(state.roll) * 0.40 * dt, 0)
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
  if (Math.hypot(state.position.x, state.position.z) > WORLD_LIMIT || state.position.y > 1100) {
    state.phase = 'crashed'
    state.reason = 'boundary'
    return
  }
  if (state.mode === 'course' && state.time <= 0) { state.phase = 'crashed'; state.reason = 'timeout'; return }
  const gate = state.mode === 'course' ? GATES[state.gate] : null
  if (gate) {
    const crossing = gateCrossing(before, state.position, gate)
    if (crossing !== null) {
      state.gate++
      const points = 100 + Math.round((1 - crossing) * 100)
      state.score += points
      state.notice = crossing < 0.3 ? `PERFECT LINE +${points}` : `CHECKPOINT +${points}`
      state.noticeTime = 2
      if (state.gate === GATES.length) state.phase = 'won'
    }
  }
}

export function flightTelemetry(state) {
  const gate = GATES[state.gate]
  const target = state.mode === 'course' && gate
  return {
    phase: state.phase, mode: state.mode, speed: Math.round(state.speed * 3.6), altitude: Math.round(state.position.y),
    clearance: Math.round(state.clearance), throttle: Math.round(state.throttle * 100),
    heading: (Math.round(state.heading * 180 / Math.PI) + 360) % 360, roll: state.roll, pitch: state.pitch,
    time: Math.ceil(state.time), elapsed: state.elapsed, gate: state.gate, score: state.score, reason: state.reason,
    notice: state.noticeTime > 0 ? state.notice : '',
    distance: target ? Math.round(Math.hypot(gate.x - state.position.x, gate.y - state.position.y, gate.z - state.position.z)) : 0,
    bearing: target ? angleDifference(Math.atan2(gate.x - state.position.x, -(gate.z - state.position.z)), state.heading) * 180 / Math.PI : 0,
    x: state.position.x, z: state.position.z,
  }
}
