export const SAVE_KEY = 'midnight-dispatch-career-v1'
export const WEAPONS = [
  { id: 'pistol', name: 'SIDEKICK .45', ko: '사이드킥 권총', price: 450, rank: 1, damage: 34, range: 42, magazine: 12, interval: 0.3, reload: 1.1, pellets: 1 },
  { id: 'smg', name: 'NEON SMG', ko: '네온 기관단총', price: 1800, rank: 2, damage: 18, range: 38, magazine: 28, interval: 0.09, reload: 1.6, pellets: 1 },
  { id: 'shotgun', name: 'STREET SWEEPER', ko: '스트리트 산탄총', price: 2400, rank: 3, damage: 23, range: 25, magazine: 6, interval: 0.8, reload: 1.9, pellets: 5 },
]
export const VEHICLES = [
  { id: 'coupe', name: 'YELLOWLINE', ko: '옐로라인 쿠페', price: 0, rank: 1, speed: 34, acceleration: 23, handling: 1.75, armor: 1, color: '#e9bb56', width: 1, length: 1 },
  { id: 'runner', name: 'HARBOR RUNNER', ko: '하버 러너', price: 1600, rank: 1, speed: 43, acceleration: 30, handling: 2.1, armor: 1.15, color: '#80d4c1', width: 0.94, length: 0.92 },
  { id: 'comet', name: 'COMET GT', ko: '코멧 GT', price: 4200, rank: 2, speed: 58, acceleration: 39, handling: 2.2, armor: 0.85, color: '#e68aab', width: 1.08, length: 1.12 },
  { id: 'courier', name: 'CITY COURIER', ko: '시티 쿠리어', price: 2200, rank: 1, speed: 38, acceleration: 27, handling: 1.8, armor: 1.7, color: '#d28d62', width: 1.08, length: 1.18 },
  { id: 'trailhawk', name: 'TRAILHAWK 4X4', ko: '트레일호크 4X4', price: 4800, rank: 2, speed: 45, acceleration: 29, handling: 1.58, armor: 2.2, color: '#b7a56b', width: 1.17, length: 1.2 },
  { id: 'viper', name: 'NEON VIPER', ko: '네온 바이퍼', price: 5600, rank: 2, speed: 66, acceleration: 47, handling: 2.42, armor: 0.72, color: '#b180e2', width: 0.91, length: 1.06 },
  { id: 'executive', name: 'EXECUTIVE 88', ko: '이그제큐티브 88', price: 6800, rank: 3, speed: 52, acceleration: 34, handling: 1.72, armor: 1.9, color: '#708da5', width: 1.14, length: 1.3 },
  { id: 'sentinel', name: 'SENTINEL', ko: '센티넬 장갑차', price: 7000, rank: 3, speed: 39, acceleration: 24, handling: 1.45, armor: 2.5, color: '#a6b4c7', width: 1.15, length: 1.16 },
  { id: 'interceptor', name: 'NIGHT INTERCEPTOR', ko: '나이트 인터셉터', price: 9200, rank: 3, speed: 72, acceleration: 50, handling: 2.25, armor: 1.05, color: '#c4d6dd', width: 1.02, length: 1.14 },
  { id: 'phantom', name: 'PHANTOM R', ko: '팬텀 R', price: 12000, rank: 4, speed: 79, acceleration: 57, handling: 2.58, armor: 0.8, color: '#ef786d', width: 0.96, length: 1.08 },
]
export const CONTRACTS = [
  { id: 'delivery', name: 'NIGHT COURIER', ko: '심야 배달', rank: 1, reward: 600, detail: 'Drive, park, get paid. New destinations every job.', detailKo: '목적지에 정차하면 보수 지급. 완료할 때마다 새 배달이 열립니다.' },
  { id: 'taxi', name: 'LAST TRAIN HOME', ko: '심야 택시', rank: 1, reward: 950, detail: 'Pick up a passenger and take them across the city.', detailKo: '승객을 태우고 목적지까지 안전하게 데려다주세요.' },
  { id: 'race', name: 'MIDNIGHT CIRCUIT', ko: '미드나이트 서킷', rank: 2, reward: 1700, detail: 'Four checkpoints. 85 seconds. Bring your best car.', detailKo: '85초 안에 체크포인트 4개를 통과하세요. 빠른 차가 유리합니다.' },
  { id: 'bounty', name: 'HARBOR CLEANUP', ko: '항구 소탕', rank: 2, reward: 2000, detail: 'Take out an armed crew. A purchased weapon is required.', detailKo: '무장 조직원 3명을 제압하세요. 구매한 총과 탄약이 필요합니다.' },
  { id: 'escape', name: 'GHOST DRIVER', ko: '고스트 드라이버', rank: 3, reward: 2400, detail: 'Lose a three-star pursuit without a respray.', detailKo: '도색이나 은신처 없이 수배 3단계를 따돌리세요.' },
]
export const rankFor = (xp) => 1 + [150, 450, 900, 1500].filter((n) => xp >= n).length
const integer = (n, max = 100000000) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0
export function readCareer(storage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY))
    if (!raw || raw.version !== 1) return null
    const cars = VEHICLES.filter((c) => c.id === 'coupe' || raw.cars?.includes?.(c.id)).map((c) => c.id)
    const weapons = {}
    for (const w of WEAPONS) if (raw.weapons?.[w.id] && typeof raw.weapons[w.id] === 'object') {
      weapons[w.id] = { loaded: integer(raw.weapons[w.id].loaded, w.magazine), reserve: integer(raw.weapons[w.id].reserve, 500) }
    }
    return { cash: integer(raw.cash), xp: integer(raw.xp), job: integer(raw.job), completed: integer(raw.completed),
      earned: integer(raw.earned), cars, carId: cars.includes(raw.carId) ? raw.carId : 'coupe', weapons,
      weapon: weapons[raw.weapon] ? raw.weapon : Object.keys(weapons)[0] || null,
      found: Array.isArray(raw.found) ? [...new Set(raw.found.filter((id) => typeof id === 'string' && /^[ns][0-6]$/.test(id)))] : [],
      theme: ['night', 'sunset', 'rain'].includes(raw.theme) ? raw.theme : 'night',
    }
  } catch { return null }
}
export function saveCareer(s, storage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, cash: s.cash, xp: s.xp, job: s.job,
      completed: s.completed, earned: s.earned, cars: s.cars, carId: s.carId, weapons: s.weapons,
      weapon: s.weapon, found: s.found, theme: s.theme }))
    return true
  } catch { return false }
}
