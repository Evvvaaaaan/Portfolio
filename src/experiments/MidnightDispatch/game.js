import { JOBS, SERVICES, STASHES, isBlocked } from './world.js'
import { VEHICLES, WEAPONS, CONTRACTS, rankFor } from './progress.js'
export { LIMIT, ROADS, JOBS, BUILDINGS, createCity, isBlocked } from './world.js'
export const STEP = 1 / 60
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const axis = (n) => Number.isFinite(n) ? clamp(n, -1, 1) : 0
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const subject = (s) => s.driving ? s.car : s.player
export const vehicleSpeed = (car) => Math.hypot(car.vx, car.vz)
export const vehicleSpec = (s) => VEHICLES.find((c) => c.id === s.car.model) || VEHICLES[0]
export const currentWeapon = (s) => WEAPONS.find((w) => w.id === s.weapon)
export const missionTarget = (s) => s.waypoint || s.mission?.points[s.mission.stage] || null
export const nearbyService = (s, type) => SERVICES.find((p) => (!type || (p.type || p.id) === type) && distance(subject(s), p) < 13)
export function notify(s, message) { s.notice = message; s.noticeTime = 4 }
const carAt = (model, x = -3, z = 16) => ({ model, x, z, heading: 0, speed: 0, vx: 0, vz: 0, health: 100 })

export function createGame(career = null) {
  const state = {
    phase: 'ready', elapsed: 0, driving: false, panel: null,
    player: { x: -7, z: 16, heading: 0, moving: false, health: 100, armor: 0 },
    car: carAt(career?.carId || 'coupe'), carId: career?.carId || 'coupe', cars: career?.cars || ['coupe'],
    cash: career?.cash || 0, xp: career?.xp || 0, job: career?.job || 0, completed: career?.completed || 0,
    earned: career?.earned || 0, found: career?.found || [], weapons: career?.weapons || {}, weapon: career?.weapon || null,
    theme: career?.theme || 'night', heat: 0, hidden: 0, busted: 0, cooldown: 0, delivery: 0,
    fireCooldown: 0, reloading: 0, notice: 'welcome', noticeTime: 5, revision: 0, waypoint: null,
    mission: null, enemies: [], shots: [], parked: [],
    traffic: Array.from({ length: 28 }, (_, i) => ({
      x: 0, z: 0, heading: 0, progress: i * 37 + 22, model: i % 5 === 0 ? 'runner' : 'coupe',
      left: -224 + (i % 7) * 56, top: -224 + Math.floor(i / 7) * 112,
      speed: 8 + i % 4, color: i % 4, disabled: 0,
    })),
    police: Array.from({ length: 6 }, (_, i) => ({ x: i % 2 ? 224 : -224, z: -168 + Math.floor(i / 2) * 168,
      tx: i % 2 ? 224 : -224, tz: -112 + Math.floor(i / 2) * 112, heading: 0, health: 100, disabled: 0 })),
  }
  state.mission = deliveryMission(state)
  updateTraffic(state, 0)
  return state
}
function deliveryMission(s) {
  const point = JOBS[s.job % JOBS.length]
  return { type: 'delivery', stage: 0, points: [point], reward: point.reward + Math.min(600, Math.floor(s.job / JOBS.length) * 100), time: null }
}
function award(s, cash, xp) { s.cash += cash; s.earned += cash; s.xp += xp; s.revision++ }
function complete(s) {
  award(s, s.mission.reward, s.mission.type === 'delivery' ? 80 : 130)
  s.completed++; s.job++; s.delivery = 0; s.enemies = []; s.mission = deliveryMission(s)
  notify(s, 'delivered')
}
export function acceptContract(s, type) {
  if (s.phase !== 'playing') return false
  const contract = CONTRACTS.find((c) => c.id === type)
  if (!contract || rankFor(s.xp) < contract.rank) { notify(s, 'locked'); return false }
  if (type === 'bounty' && !s.weapon) { notify(s, 'needWeapon'); return false }
  s.enemies = []; s.delivery = 0; s.waypoint = null
  const destination = JOBS[(s.job + 3) % JOBS.length]
  s.mission = { type, reward: contract.reward, stage: 0, time: null, points: [] }
  if (type === 'delivery') s.mission = deliveryMission(s)
  if (type === 'taxi') s.mission.points = [{ x: -56, z: 0, name: 'STATION PICKUP', ko: '역 앞 승객' }, destination]
  if (type === 'race') {
    const p = subject(s), x = clamp(Math.round(p.x / 56) * 56, -168, 56), z = clamp(Math.round(p.z / 56) * 56, -168, 56)
    s.mission.points = [{ x, z }, { x, z: z - 56 }, { x: x + 112, z: z - 56 }, { x: x + 112, z: z + 56 }, { x, z: z + 56 }]
  }
  if (type === 'bounty') {
    s.mission.points = [{ x: -168, z: 112, name: 'HARBOR CREW', ko: '항구 조직원' }]
    s.enemies = [-18, 0, 18].map((offset, i) => ({ x: -168 + (i % 2 ? 4 : -4), z: 112 + offset, health: 90, cooldown: 1 + i * 0.4, heading: 0 }))
  }
  if (type === 'escape') {
    s.heat = 3; s.hidden = 0; s.mission.time = 90
    const p = subject(s), x = clamp(Math.round(p.x / 56) * 56, -168, 168), z = clamp(Math.round(p.z / 56) * 56, -168, 168)
    s.police.slice(0, 4).forEach((car, i) => Object.assign(car, { x: x + (i < 2 ? (i ? 56 : -56) : 0), z: z + (i >= 2 ? (i === 2 ? 56 : -56) : 0), tx: x, tz: z, disabled: 0, health: 100 }))
    notify(s, 'escapeStarted')
  }
  else notify(s, 'accepted')
  s.panel = null
  return true
}
export function nearestVehicle(s) {
  return [s.car, ...s.parked, ...s.traffic.filter((c) => c.disabled <= 0)]
    .filter((c) => distance(s.player, c) <= 6).sort((a, b) => distance(s.player, a) - distance(s.player, b))[0]
}
export function interact(s) {
  if (s.phase !== 'playing' || s.panel) return
  if (s.driving) {
    if (vehicleSpeed(s.car) > 4) return notify(s, 'stopFirst')
    for (const side of [-1, 1]) {
      const x = s.car.x + Math.cos(s.car.heading) * side * 3.4, z = s.car.z + Math.sin(s.car.heading) * side * 3.4
      if (!isBlocked(x, z)) { Object.assign(s.player, { x, z }); s.car.speed = s.car.vx = s.car.vz = 0; s.driving = false; return notify(s, 'onFoot') }
    }
    return notify(s, 'blockedExit')
  }
  const car = nearestVehicle(s)
  const service = nearbyService(s)
  if (service && distance(s.player, service) < 7 && (!car || distance(s.player, car) > 4)) { s.panel = service.type || service.id; return }
  if (!car) return notify(s, 'closer')
  if (car !== s.car) {
    const traffic = s.traffic.includes(car), old = s.car
    if (traffic) { car.disabled = 30; s.car = { ...carAt(car.model, car.x, car.z), heading: car.heading }; s.heat = Math.min(5, s.heat + 1); s.hidden = 0 }
    else { s.parked.splice(s.parked.indexOf(car), 1); s.car = car }
    s.parked.push(old)
    if (s.parked.length > 5) s.parked.shift()
    notify(s, traffic ? 'stolen' : 'drive')
  } else notify(s, 'drive')
  s.driving = true
}
function canShop(s, type) {
  if (s.phase !== 'playing') return false
  if (!nearbyService(s, type)) { notify(s, 'visitShop'); return false }
  if (s.driving && vehicleSpeed(s.car) > 4) { notify(s, 'stopFirst'); return false }
  return true
}
function pay(s, price) {
  if (s.cash < price) { notify(s, 'noCash'); return false }
  s.cash -= price; s.revision++; return true
}
export function purchase(s, type, id) {
  if (type !== 'weapon' && type !== 'car') return false
  if (!canShop(s, type === 'weapon' ? 'armory' : 'garage')) return false
  const item = (type === 'weapon' ? WEAPONS : VEHICLES).find((x) => x.id === id)
  if (!item || rankFor(s.xp) < item.rank) { notify(s, 'locked'); return false }
  const owned = type === 'weapon' ? Boolean(s.weapons[id]) : s.cars.includes(id)
  if (!owned && !pay(s, item.price)) return false
  if (type === 'weapon') {
    if (!owned) s.weapons[id] = { loaded: item.magazine, reserve: item.magazine * 3 }
    s.weapon = id; s.reloading = 0
  } else {
    const point = nearbyService(s, 'garage')
    if (!owned) s.cars.push(id)
    s.carId = id
    // Every garage has a reserved bay on the road, outside building collision boxes.
    s.car = carAt(id, point.x, point.z)
    if (!s.driving) { s.player.x = point.x + 3.4; s.player.z = point.z }
  }
  s.revision++; notify(s, owned ? 'equipped' : 'purchased'); return true
}
export function serviceAction(s, action) {
  const shop = action === 'ammo' || action === 'armor' ? 'armory' : action === 'rest' ? 'safehouse' : 'garage'
  if (!['ammo', 'armor', 'rest', 'repair'].includes(action) || !canShop(s, shop)) return false
  if (action === 'ammo') {
    const w = currentWeapon(s)
    if (!w) { notify(s, 'needWeapon'); return false }
    const ammo = s.weapons[w.id]
    if (ammo.reserve >= 500) return false
    if (!pay(s, 120)) return false
    ammo.reserve = Math.min(500, ammo.reserve + w.magazine * 4)
  } else if (action === 'armor') {
    if (s.player.armor >= 100 || !pay(s, 250)) return false
    s.player.armor = 100
  } else {
    if (s.mission.type === 'escape' && s.heat > 0) { notify(s, 'escapeOnly'); return false }
    if (action === 'repair' && !pay(s, 150)) return false
    s.car.health = 100; s.player.health = 100; s.heat = 0; s.hidden = 0; s.busted = 0
  }
  s.revision++; notify(s, 'serviced'); return true
}
export function reload(s) {
  const w = currentWeapon(s), ammo = w && s.weapons[w.id]
  if (s.phase !== 'playing' || s.panel || !ammo || s.reloading || ammo.loaded >= w.magazine || !ammo.reserve) return
  s.reloading = w.reload
}
export function cycleWeapon(s) {
  if (s.phase !== 'playing' || s.panel) return
  const ids = Object.keys(s.weapons)
  s.weapon = ids[(ids.indexOf(s.weapon) + 1) % ids.length] || null
  s.reloading = 0; s.revision++
}
function clearSight(a, b) {
  const d = distance(a, b)
  for (let t = 1; t < d; t += 1.5) if (isBlocked(a.x + (b.x - a.x) * t / d, a.z + (b.z - a.z) * t / d, 0.1)) return false
  return true
}
export function fire(s, aim) {
  if (s.phase !== 'playing' || s.panel || s.driving || s.fireCooldown > 0 || s.reloading > 0) return
  const w = currentWeapon(s), ammo = w && s.weapons[w.id]
  if (!ammo) { notify(s, 'needWeapon'); s.fireCooldown = 0.5; return }
  if (!ammo.loaded) { reload(s); if (!ammo.reserve) { notify(s, 'noAmmo'); s.fireCooldown = 0.5 } return }
  const targets = [...s.enemies.filter((e) => e.health > 0), ...(s.heat >= 1 ? s.police.filter((p) => p.disabled <= 0) : [])]
  const target = aim || targets.filter((e) => distance(s.player, e) < w.range && clearSight(s.player, e)).sort((a, b) => distance(s.player, a) - distance(s.player, b))[0]
  if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) s.player.heading = Math.atan2(target.x - s.player.x, s.player.z - target.z)
  ammo.loaded--; s.fireCooldown = w.interval; s.heat = Math.min(5, Math.max(1, s.heat) + 0.04); s.hidden = 0; s.revision++
  for (let i = 0; i < w.pellets; i++) {
    const heading = s.player.heading + (i - (w.pellets - 1) / 2) * 0.07
    let end = { x: s.player.x, z: s.player.z }
    for (let d = 1; d <= w.range; d += 0.8) {
      end = { x: s.player.x + Math.sin(heading) * d, z: s.player.z - Math.cos(heading) * d }
      if (isBlocked(end.x, end.z, 0.1)) break
      const hit = targets.find((e) => e.health > 0 && distance(end, e) < (s.police.includes(e) ? 2.2 : 1.25))
      if (hit) { hit.health = Math.max(0, hit.health - w.damage); if (!hit.health && s.police.includes(hit)) { hit.disabled = 12; s.heat = Math.min(5, s.heat + 1) } break }
    }
    s.shots.push({ x: s.player.x, z: s.player.z, tx: end.x, tz: end.z, life: 0.12, hostile: false })
  }
}
function move(body, dx, dz, radius) {
  let hit = false
  if (!isBlocked(body.x + dx, body.z, radius)) body.x += dx; else hit = true
  if (!isBlocked(body.x, body.z + dz, radius)) body.z += dz; else hit = true
  return hit
}
function damage(s, amount) {
  if (s.cooldown > 0) return
  if (s.driving) s.car.health = Math.max(0, s.car.health - amount / vehicleSpec(s).armor)
  else { const absorb = Math.min(s.player.armor, amount * 0.7); s.player.armor -= absorb; s.player.health = Math.max(0, s.player.health - amount + absorb) }
  s.cooldown = 0.6
}
function updateTraffic(s, dt) {
  for (const car of s.traffic) {
    if (car.disabled > 0) { car.disabled -= dt; continue }
    car.progress = (car.progress + car.speed * dt) % 224
    const p = car.progress, l = car.left + 3, t = car.top + 3
    if (p < 56) { car.x = l + p; car.z = t; car.heading = Math.PI / 2 }
    else if (p < 112) { car.x = l + 56; car.z = t + p - 56; car.heading = Math.PI }
    else if (p < 168) { car.x = l + 168 - p; car.z = t + 56; car.heading = -Math.PI / 2 }
    else { car.x = l; car.z = t + 224 - p; car.heading = 0 }
    if (s.driving && distance(car, s.car) < 3.4 && s.cooldown <= 0) {
      damage(s, 7 + Math.abs(s.car.speed) * 0.18); s.heat = Math.min(5, s.heat + 0.6); s.hidden = 0
      s.car.speed *= -0.25; s.car.vx *= -0.3; s.car.vz *= -0.3
      notify(s, 'collision')
    }
  }
}
function updatePolice(s, dt) {
  const target = subject(s)
  let seen = false, close = false
  for (const [i, car] of s.police.entries()) {
    if (car.disabled > 0) { car.disabled -= dt; if (car.disabled <= 0) car.health = 100; continue }
    if (s.heat < 0.1 || i >= Math.ceil(s.heat) + 1) continue
    const dx = car.tx - car.x, dz = car.tz - car.z, d = Math.hypot(dx, dz), travel = (13 + s.heat * 2) * dt
    if (d <= travel) {
      car.x = car.tx; car.z = car.tz
      const gx = clamp(Math.round(target.x / 56) * 56, -224, 224), gz = clamp(Math.round(target.z / 56) * 56, -224, 224)
      if (Math.abs(gx - car.x) > Math.abs(gz - car.z)) car.tx = clamp(car.x + Math.sign(gx - car.x) * 56, -224, 224)
      else car.tz = clamp(car.z + Math.sign(gz - car.z) * 56, -224, 224)
    } else { car.x += dx / d * travel; car.z += dz / d * travel; car.heading = Math.atan2(dx, -dz) }
    const dist = distance(car, target)
    if (dist < 38 && clearSight(car, target)) seen = true
    if (dist < 5) { close = true; if (s.driving) damage(s, 5) }
  }
  s.hidden = seen ? 0 : s.hidden + dt
  if (s.hidden > 5) s.heat = Math.max(0, s.heat - dt * 0.22)
  s.busted = close && (!s.driving || vehicleSpeed(s.car) < 3) ? s.busted + dt : Math.max(0, s.busted - dt * 2)
}
function updateCombat(s, dt) {
  const target = subject(s)
  for (const enemy of s.enemies) {
    if (enemy.health <= 0) continue
    enemy.cooldown -= dt
    if (distance(enemy, target) < 34 && clearSight(enemy, target)) {
      enemy.heading = Math.atan2(target.x - enemy.x, enemy.z - target.z)
      if (distance(enemy, target) > 14) move(enemy, Math.sin(enemy.heading) * dt * 2, -Math.cos(enemy.heading) * dt * 2, 0.7)
      if (enemy.cooldown <= 0) {
        enemy.cooldown = 1.3; damage(s, 9)
        s.shots.push({ x: enemy.x, z: enemy.z, tx: target.x, tz: target.z, life: 0.15, hostile: true })
      }
    }
  }
}
export function recover(s) {
  if (s.phase !== 'lost') return
  s.cash -= Math.min(s.cash, 200); s.revision++
  s.car = carAt(s.carId); Object.assign(s.player, { x: -7, z: 16, health: 100, armor: 0 })
  s.driving = false; s.heat = 0; s.hidden = 0; s.busted = 0; s.enemies = []; s.shots = []
  s.mission = deliveryMission(s); s.waypoint = null; s.delivery = 0; s.panel = null; s.phase = 'playing'
  s.reloading = 0; s.cooldown = 2; notify(s, 'recovered')
}
export function stepGame(s, input = {}, dt = STEP) {
  if (s.phase !== 'playing' || s.panel || !Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, 1 / 30); s.elapsed += dt
  s.cooldown = Math.max(0, s.cooldown - dt); s.noticeTime = Math.max(0, s.noticeTime - dt); s.fireCooldown = Math.max(0, s.fireCooldown - dt)
  s.shots = s.shots.filter((shot) => { shot.life -= dt; return shot.life > 0 })
  if (s.reloading > 0) {
    s.reloading = Math.max(0, s.reloading - dt)
    if (!s.reloading) { const w = currentWeapon(s), ammo = s.weapons[w.id], count = Math.min(w.magazine - ammo.loaded, ammo.reserve); ammo.loaded += count; ammo.reserve -= count; s.revision++ }
  }
  const x = axis(input.x), y = axis(input.y)
  if (s.driving) {
    const c = s.car, spec = vehicleSpec(s)
    if (y) c.speed += y * (c.speed * y < 0 ? 44 : spec.acceleration) * dt
    else c.speed *= Math.exp(-1.1 * dt)
    c.speed = clamp(c.speed, -13, spec.speed)
    if (input.brake) c.speed *= Math.exp(-3.4 * dt)
    c.heading += x * Math.sign(c.speed) * Math.min(Math.abs(c.speed) / 8, 1) * (input.brake ? 2.8 : spec.handling) * dt
    const grip = 1 - Math.exp(-(input.brake ? 3 : s.theme === 'rain' ? 7 : 11) * dt)
    c.vx += (Math.sin(c.heading) * c.speed - c.vx) * grip; c.vz += (-Math.cos(c.heading) * c.speed - c.vz) * grip
    if (move(c, c.vx * dt, c.vz * dt, 2.6)) {
      if (Math.abs(c.speed) > 6) { damage(s, Math.min(22, Math.abs(c.speed) * 0.55)); notify(s, 'collision') }
      c.speed *= -0.22; c.vx *= -0.22; c.vz *= -0.22
    }
  } else {
    const length = Math.hypot(x, y); s.player.moving = length > 0
    if (length) { const speed = input.brake ? 10 : 6; move(s.player, x / length * speed * dt, -y / length * speed * dt, 0.7); s.player.heading = Math.atan2(x, y) }
    if (input.fire) fire(s, input.aim)
  }
  updateTraffic(s, dt); updatePolice(s, dt); updateCombat(s, dt)
  if (s.player.health <= 0 || s.car.health <= 0 || s.busted >= 3) { s.phase = 'lost'; s.panel = null; return }
  if (s.waypoint && distance(subject(s), s.waypoint) < 8) { s.waypoint = null; notify(s, 'arrived') }
  for (const stash of STASHES) if (!s.found.includes(stash.id) && distance(subject(s), stash) < 4) {
    s.found.push(stash.id); award(s, 250, 25); notify(s, 'stash')
  }
  const m = s.mission, point = m.points[m.stage]
  if (m.time !== null) {
    m.time -= dt
    if (m.time <= 0) { s.mission = deliveryMission(s); s.delivery = 0; notify(s, 'contractFailed'); return }
  }
  if (m.type === 'bounty' && s.enemies.length && s.enemies.every((e) => e.health <= 0)) { complete(s); return }
  if (m.type === 'escape' && s.heat <= 0) { complete(s); return }
  if (!['delivery', 'taxi', 'race'].includes(m.type)) return
  if (point && s.driving && distance(s.car, point) < 8 && (m.type === 'race' || vehicleSpeed(s.car) < 5)) {
    s.delivery += dt
    if (s.delivery >= (m.type === 'race' ? 0.01 : 0.8)) {
      m.stage++; s.delivery = 0
      if (m.stage >= m.points.length) complete(s)
      else { if (m.type === 'race' && m.time === null) m.time = 85; notify(s, m.type === 'taxi' ? 'passenger' : 'checkpoint') }
    }
  } else s.delivery = 0
}
