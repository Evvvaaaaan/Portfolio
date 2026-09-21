import { describe, expect, it } from 'vitest'
import { STEP, createGame, stepGame, interact, purchase, serviceAction, acceptContract, fire, reload, recover, isBlocked, vehicleSpeed } from './game.js'
import { BUILDINGS, JOBS, SERVICES, STASHES } from './world.js'
import { WEAPONS, VEHICLES, SAVE_KEY, readCareer, saveCareer, rankFor } from './progress.js'

const playing = () => Object.assign(createGame(), { phase: 'playing', traffic: [], police: [] })
const advance = (s, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepGame(s, input) }
const deliver = (s) => { s.driving = true; Object.assign(s.car, s.mission.points[s.mission.stage], { speed: 0, vx: 0, vz: 0 }); advance(s, 0.9) }
const shop = (s, id) => { s.driving = false; Object.assign(s.player, SERVICES.find((p) => p.id === id)) }
const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } }

describe('Midnight Dispatch career economy', () => {
  it('earns spendable cash and continues after an entire delivery circuit', () => {
    const s = playing()
    for (let i = 0; i < JOBS.length + 1; i++) deliver(s)
    expect(s.phase).toBe('playing')
    expect(s.completed).toBe(8)
    expect(s.cash).toBe(JOBS.reduce((sum, p) => sum + p.reward, 0) + JOBS[0].reward + 100)
    expect(s.mission.points[0]).toEqual(JOBS[1])
    expect(rankFor(s.xp)).toBe(3)
  })
  it('uses genuinely earned money for a gun, without duplicate charges or ammo exploits', () => {
    const s = playing(); deliver(s); shop(s, 'armory')
    expect(purchase(s, 'weapon', 'pistol')).toBe(true)
    expect(s.cash).toBe(150)
    expect(s.weapon).toBe('pistol')
    fire(s); expect(s.weapons.pistol.loaded).toBe(11)
    expect(purchase(s, 'weapon', 'pistol')).toBe(true)
    expect(s.cash).toBe(150)
    expect(s.weapons.pistol.loaded).toBe(11)
    expect(purchase(s, 'weapon', 'smg')).toBe(false)
  })
  it('blocks remote, unaffordable, locked, moving and invalid purchases atomically', () => {
    const s = playing()
    expect(purchase(s, 'weapon', 'pistol')).toBe(false)
    shop(s, 'armory'); expect(purchase(s, 'weapon', 'pistol')).toBe(false)
    s.cash = 5000; expect(purchase(s, 'weapon', 'smg')).toBe(false)
    expect(purchase(s, 'other', 'coupe')).toBe(false)
    expect(purchase(s, 'weapon', 'missing')).toBe(false)
    Object.assign(s.car, { x: 0, z: -32, vx: 10 }); s.driving = true
    expect(purchase(s, 'weapon', 'pistol')).toBe(false)
    expect(s.cash).toBe(5000); expect(s.weapons).toEqual({})
  })
  it('buys and equips cars, which can immediately be entered at the garage', () => {
    const s = playing(); for (let i = 0; i < 3; i++) deliver(s)
    shop(s, 'garage')
    expect(purchase(s, 'car', 'runner')).toBe(true)
    expect(s.cash).toBe(1050)
    expect(s.cars).toContain('runner')
    interact(s); expect(s.driving).toBe(true); expect(s.panel).toBeNull()
    expect(s.car.model).toBe('runner')
    expect(isBlocked(s.car.x, s.car.z, 2.6)).toBe(false)
  })

  it('offers a varied ten-car garage catalog while retaining the free starter coupe', () => {
    expect(VEHICLES).toHaveLength(10)
    expect(VEHICLES[0]).toMatchObject({ id: 'coupe', price: 0, rank: 1 })
    expect(new Set(VEHICLES.map((car) => car.id)).size).toBe(VEHICLES.length)
    expect(new Set(VEHICLES.map((car) => car.speed)).size).toBeGreaterThan(6)
    expect(Math.max(...VEHICLES.map((car) => car.rank))).toBe(4)
  })
  it('vehicle upgrades affect acceleration and maximum speed in the simulation', () => {
    const speeds = VEHICLES.slice(0, 3).map((car) => {
      const s = playing(); s.driving = true; Object.assign(s.car, { model: car.id, x: 0, z: 180 }); advance(s, 3, { y: 1 }); return vehicleSpeed(s.car)
    })
    expect(speeds[1]).toBeGreaterThan(speeds[0]); expect(speeds[2]).toBeGreaterThan(speeds[1])
  })
  it('persists the wallet, owned equipment, loaded ammo, ranks and discoveries', () => {
    const s = playing(); for (let i = 0; i < 3; i++) deliver(s)
    shop(s, 'armory'); purchase(s, 'weapon', 'pistol'); fire(s)
    shop(s, 'garage'); purchase(s, 'car', 'runner'); s.theme = 'rain'; s.found.push('n1')
    const disk = storage(); expect(saveCareer(s, disk)).toBe(true)
    const restored = createGame(readCareer(disk))
    for (const key of ['cash', 'weapons', 'weapon', 'cars', 'carId', 'xp', 'completed', 'earned', 'found', 'theme']) expect(restored[key]).toEqual(s[key])
    expect(restored.car.model).toBe('runner'); expect(restored.mission.points[0]).toEqual(JOBS[3])
  })
  it('handles missing, corrupt, old and blocked storage', () => {
    const disk = storage(); expect(readCareer(disk)).toBeNull()
    disk.setItem(SAVE_KEY, '{broken'); expect(readCareer(disk)).toBeNull()
    disk.setItem(SAVE_KEY, JSON.stringify({ version: 4 })); expect(readCareer(disk)).toBeNull()
    disk.setItem(SAVE_KEY, JSON.stringify({ version: 1, cash: -100, xp: 'NaN', carId: 'missing', weapons: { pistol: { loaded: 999, reserve: -50 } }, found: ['n1', 'n1', 'bad'] }))
    const loaded = readCareer(disk)
    expect(loaded.cash).toBe(0); expect(loaded.xp).toBe(0); expect(loaded.carId).toBe('coupe')
    expect(loaded.weapons.pistol).toEqual({ loaded: 12, reserve: 0 }); expect(loaded.found).toEqual(['n1'])
    expect(saveCareer(playing(), { setItem() { throw new Error('quota') } })).toBe(false)
  })
})

describe('Midnight Dispatch combat, contracts and world', () => {
  it('expands to 64 blocks and keeps every job, shop, stash and spawn reachable', () => {
    expect(BUILDINGS).toHaveLength(256)
    expect(new Set(BUILDINGS.map((b) => b.district)).size).toBe(4)
    for (const p of [...JOBS, ...SERVICES, ...STASHES, createGame().car, createGame().player]) expect(isBlocked(p.x, p.z, 2.6), JSON.stringify(p)).toBe(false)
  })
  it('shoots armed enemies, consumes ammo and reloads from a finite reserve', () => {
    const s = playing(); s.cash = 600; shop(s, 'armory'); purchase(s, 'weapon', 'pistol')
    s.enemies = [{ x: 0, z: -45, health: 90, cooldown: 100 }]
    advance(s, 1, { fire: true })
    expect(s.enemies[0].health).toBe(0); expect(s.weapons.pistol.loaded).toBeLessThan(12)
    const total = s.weapons.pistol.loaded + s.weapons.pistol.reserve
    reload(s); advance(s, 1.2)
    expect(s.weapons.pistol.loaded).toBe(12)
    expect(s.weapons.pistol.loaded + s.weapons.pistol.reserve).toBe(total)
    expect(s.heat).toBeGreaterThan(0)
  })
  it('stops projectiles and enemy attacks at solid buildings', () => {
    const s = playing(); s.cash = 600; shop(s, 'armory'); purchase(s, 'weapon', 'pistol')
    Object.assign(s.player, { x: 0, z: -28 })
    s.enemies = [{ x: 45, z: -28, health: 90, cooldown: 0 }]
    fire(s, s.enemies[0]); advance(s, 2)
    expect(s.enemies[0].health).toBe(90); expect(s.player.health).toBe(100)
    expect(s.shots).toEqual([])
  })
  it('does not fire while paused, browsing shops or inside a vehicle', () => {
    const s = playing(); s.cash = 600; shop(s, 'armory'); purchase(s, 'weapon', 'pistol')
    s.phase = 'paused'; fire(s); s.phase = 'playing'; s.panel = 'armory'; fire(s); s.panel = null; s.driving = true; fire(s)
    expect(s.weapons.pistol.loaded).toBe(12)
  })
  it('requires passenger pickup before paying the taxi reward', () => {
    const s = playing(); expect(acceptContract(s, 'taxi')).toBe(true)
    deliver(s); expect(s.cash).toBe(0); expect(s.mission.stage).toBe(1)
    deliver(s); expect(s.cash).toBe(950); expect(s.completed).toBe(1)
  })
  it('races start at the first gate, require all checkpoints and pay only once', () => {
    const s = playing(); s.xp = 150; acceptContract(s, 'race')
    expect(s.mission.time).toBeNull()
    const points = [...s.mission.points]; s.driving = true
    for (const p of points) { Object.assign(s.car, p, { vx: 0, vz: 0, speed: 0 }); stepGame(s) }
    expect(s.cash).toBe(1700); expect(s.mission.type).toBe('delivery')
    advance(s, 0.5); expect(s.cash).toBe(1700)
  })
  it('bounty jobs require a gun and pay when the armed crew is defeated', () => {
    const s = playing(); s.xp = 150
    expect(acceptContract(s, 'bounty')).toBe(false)
    s.cash = 600; shop(s, 'armory'); purchase(s, 'weapon', 'pistol'); acceptContract(s, 'bounty')
    Object.assign(s.player, { x: -168, z: 76 })
    for (let i = 0; i < 300 && s.mission.type === 'bounty'; i++) stepGame(s, { fire: true })
    // Advance toward the last crew member, beyond the pistol's initial reach.
    Object.assign(s.player, { x: -168, z: 106 }); advance(s, 5, { fire: true })
    expect(s.completed).toBe(1); expect(s.cash).toBe(2150)
  })
  it('escape contracts cannot be cashed out with a repair or rest', () => {
    const s = playing(); s.xp = 450; s.cash = 1000; acceptContract(s, 'escape')
    shop(s, 'garage'); expect(serviceAction(s, 'repair')).toBe(false)
    expect(s.cash).toBe(1000); expect(s.heat).toBe(3)
    advance(s, 20); expect(s.completed).toBe(1); expect(s.cash).toBe(3400)
  })
  it('collects each cash stash once, including after a reload', () => {
    const s = playing(); Object.assign(s.player, STASHES[0]); advance(s, 1)
    expect(s.cash).toBe(250); expect(s.found).toHaveLength(1)
    const disk = storage(); saveCareer(s, disk)
    const restored = Object.assign(createGame(readCareer(disk)), { phase: 'playing' })
    Object.assign(restored.player, STASHES[0]); advance(restored, 1)
    expect(restored.cash).toBe(250)
  })
  it('recovers without deleting the career or allowing a negative balance', () => {
    const s = playing(); s.cash = 80; s.xp = 150; s.cars.push('runner'); s.car.health = 0
    stepGame(s); expect(s.phase).toBe('lost'); recover(s)
    expect(s.phase).toBe('playing'); expect(s.cash).toBe(0); expect(s.xp).toBe(150)
    expect(s.cars).toContain('runner'); expect(s.car.health).toBe(100)
  })
  it('takes nearby traffic cars and preserves the previous ride', () => {
    const s = playing(); Object.assign(s.player, { x: 56, z: 0 })
    s.traffic = [{ x: 56, z: 1, model: 'runner', heading: 0, disabled: 0 }]
    interact(s); expect(s.driving).toBe(true); expect(s.heat).toBe(1)
    expect(s.car.model).toBe('runner'); expect(s.parked).toHaveLength(1); expect(s.traffic[0].disabled).toBe(30)
  })
  it('opening a menu freezes motion, bullets, enemies and mission timers', () => {
    const s = playing(); s.xp = 150; acceptContract(s, 'race'); s.panel = 'contracts'
    const before = structuredClone(s); advance(s, 1, { y: 1, fire: true })
    expect(s).toEqual(before)
  })
  it('all weapons and cars declare distinct, usable statistics', () => {
    expect(new Set(WEAPONS.map((w) => w.interval)).size).toBe(3)
    expect(VEHICLES.find((v) => v.id === 'sentinel').armor).toBeGreaterThan(VEHICLES[0].armor)
  })
})
