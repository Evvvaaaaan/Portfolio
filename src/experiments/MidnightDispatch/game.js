export const STEP = 1 / 60
export const LIMIT = 124
export const ROADS = [-112, -56, 0, 56, 112]
export const JOBS = [
  { x: 0, z: -48, name: 'NIGHT MARKET', reward: 600 },
  { x: 56, z: -56, name: 'RADIO STATION', reward: 850 },
  { x: 56, z: 56, name: 'SOUTH GARAGE', reward: 1200 },
]

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const axis = (n) => Number.isFinite(n) ? clamp(n, -1, 1) : 0
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const subject = (s) => s.driving ? s.car : s.player
export const vehicleSpeed = (car) => Math.hypot(car.vx, car.vz)

export function createCity() {
  let seed = 2077
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const buildings = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = -84 + col * 56, cz = -84 + row * 56
      for (let i = 0; i < 4; i++) {
        buildings.push({
          x: cx + (i % 2 ? 10 : -10), z: cz + (i < 2 ? -10 : 10),
          w: 15 + random() * 3, d: 15 + random() * 3,
          h: 5 + random() * 12, tint: Math.floor(random() * 4),
        })
      }
    }
  }
  return buildings
}

export const BUILDINGS = createCity()

export function isBlocked(x, z, radius = 0.7) {
  if (Math.abs(x) + radius > LIMIT || Math.abs(z) + radius > LIMIT) return true
  return BUILDINGS.some((b) => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius)
}

export function createGame() {
  const state = {
    phase: 'ready', time: 180, elapsed: 0, driving: false,
    player: { x: -7, z: 16, heading: 0, moving: false },
    car: { x: -3, z: 16, heading: 0, speed: 0, vx: 0, vz: 0, health: 100 },
    job: 0, delivery: 0, cash: 0, heat: 0, cooldown: 0, notice: 'welcome', noticeTime: 0,
    traffic: Array.from({ length: 12 }, (_, i) => ({
      x: 0, z: 0, heading: 0, progress: i * 37 + 22,
      left: -112 + (i % 3) * 56, top: -112 + Math.floor(i / 3) * 56,
      speed: 8 + i % 4, color: i % 4,
    })),
    police: [
      { x: -112, z: 56, tx: -112, tz: 0, heading: 0 },
      { x: 112, z: -112, tx: 56, tz: -112, heading: -Math.PI / 2 },
    ],
  }
  updateTraffic(state, 0)
  return state
}

function notify(s, message) {
  s.notice = message
  s.noticeTime = 3
}

export function interact(s) {
  if (s.phase !== 'playing') return
  if (!s.driving) {
    if (distance(s.player, s.car) > 6) return notify(s, 'closer')
    s.driving = true
    return notify(s, 'drive')
  }
  if (vehicleSpeed(s.car) > 4) return notify(s, 'stopFirst')
  for (const side of [-1, 1]) {
    const x = s.car.x + Math.cos(s.car.heading) * side * 3.4
    const z = s.car.z + Math.sin(s.car.heading) * side * 3.4
    if (!isBlocked(x, z)) {
      s.player.x = x
      s.player.z = z
      s.car.speed = s.car.vx = s.car.vz = 0
      s.driving = false
      return notify(s, 'onFoot')
    }
  }
  notify(s, 'blockedExit')
}

function move(body, dx, dz, radius) {
  let hit = false
  if (!isBlocked(body.x + dx, body.z, radius)) body.x += dx
  else hit = true
  if (!isBlocked(body.x, body.z + dz, radius)) body.z += dz
  else hit = true
  return hit
}

function damage(s, amount) {
  if (s.cooldown > 0) return
  s.car.health = Math.max(0, s.car.health - amount)
  s.cooldown = 0.75
  notify(s, 'collision')
}

function updateTraffic(s, dt) {
  for (const car of s.traffic) {
    car.progress = (car.progress + car.speed * dt) % 224
    const p = car.progress, l = car.left + 3, t = car.top + 3
    if (p < 56) { car.x = l + p; car.z = t; car.heading = Math.PI / 2 }
    else if (p < 112) { car.x = l + 56; car.z = t + p - 56; car.heading = Math.PI }
    else if (p < 168) { car.x = l + 168 - p; car.z = t + 56; car.heading = -Math.PI / 2 }
    else { car.x = l; car.z = t + 224 - p; car.heading = 0 }
    if (s.driving && distance(car, s.car) < 3.4 && s.cooldown <= 0) {
      damage(s, 7 + Math.abs(s.car.speed) * 0.18)
      s.heat = Math.min(3, s.heat + 0.85)
      s.car.speed *= -0.25
      s.car.vx *= -0.3
      s.car.vz *= -0.3
    }
  }
}

function updatePolice(s, dt) {
  if (s.heat < 0.1) return
  const target = subject(s)
  for (const car of s.police) {
    const dx = car.tx - car.x, dz = car.tz - car.z, d = Math.hypot(dx, dz)
    const travel = (12 + s.heat * 2) * dt
    if (d <= travel) {
      car.x = car.tx
      car.z = car.tz
      // Pursuit stays on the road graph, never taking shortcuts through buildings.
      const gx = Math.round(target.x / 56) * 56, gz = Math.round(target.z / 56) * 56
      if (Math.abs(gx - car.x) > Math.abs(gz - car.z)) car.tx = clamp(car.x + Math.sign(gx - car.x) * 56, -112, 112)
      else car.tz = clamp(car.z + Math.sign(gz - car.z) * 56, -112, 112)
    } else {
      car.x += dx / d * travel
      car.z += dz / d * travel
      car.heading = Math.atan2(dx, -dz)
    }
    if (s.driving && distance(car, s.car) < 4) damage(s, 6)
  }
  if (s.police.every((car) => distance(car, target) > 30)) s.heat = Math.max(0, s.heat - dt * 0.035)
}

export function stepGame(s, input = {}, dt = STEP) {
  if (s.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, 1 / 30)
  s.time = Math.max(0, s.time - dt)
  s.elapsed += dt
  s.cooldown = Math.max(0, s.cooldown - dt)
  s.noticeTime = Math.max(0, s.noticeTime - dt)
  const x = axis(input.x), y = axis(input.y)
  if (s.driving) {
    const c = s.car
    if (y) c.speed += y * (c.speed * y < 0 ? 44 : 23) * dt
    else c.speed *= Math.exp(-1.1 * dt)
    c.speed = clamp(c.speed, -13, 34)
    if (input.brake) c.speed *= Math.exp(-3.4 * dt)
    c.heading += x * Math.sign(c.speed) * Math.min(Math.abs(c.speed) / 8, 1) * (input.brake ? 2.8 : 1.75) * dt
    const grip = 1 - Math.exp(-(input.brake ? 3 : 11) * dt)
    c.vx += (Math.sin(c.heading) * c.speed - c.vx) * grip
    c.vz += (-Math.cos(c.heading) * c.speed - c.vz) * grip
    if (move(c, c.vx * dt, c.vz * dt, 2.2)) {
      if (Math.abs(c.speed) > 6) damage(s, Math.min(22, Math.abs(c.speed) * 0.55))
      c.speed *= -0.22
      c.vx *= -0.22
      c.vz *= -0.22
    }
  } else {
    const length = Math.hypot(x, y)
    s.player.moving = length > 0
    if (length) {
      const speed = input.brake ? 10 : 6
      move(s.player, x / length * speed * dt, -y / length * speed * dt, 0.7)
      s.player.heading = Math.atan2(x, y)
    }
  }
  updateTraffic(s, dt)
  updatePolice(s, dt)
  const job = JOBS[s.job]
  if (job && s.driving && distance(s.car, job) < 8 && vehicleSpeed(s.car) < 5) {
    s.delivery += dt
    if (s.delivery >= 0.8) {
      s.cash += job.reward
      s.job++
      s.delivery = 0
      s.car.health = Math.min(100, s.car.health + 15)
      s.time += 20
      s.heat = Math.min(3, s.heat + 1)
      notify(s, 'delivered')
      if (s.job === JOBS.length) s.phase = 'won'
    }
  } else s.delivery = 0
  if (s.car.health <= 0 || s.time <= 0) s.phase = 'lost'
}
