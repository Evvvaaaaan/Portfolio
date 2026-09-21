export const LIMIT = 236
export const ROADS = Array.from({ length: 9 }, (_, i) => (i - 4) * 56)
export const DISTRICTS = [
  { id: 'neon', name: 'NEON QUARTER', ko: '네온 쿼터', color: '#c48ddd', ground: '#343548', building: '#524264', x: -112, z: -112 },
  { id: 'desert', name: 'DUST COUNTY', ko: '더스트 카운티', color: '#eab878', ground: '#80634d', building: '#ad8265', x: 112, z: -112 },
  { id: 'harbor', name: 'IRON HARBOR', ko: '아이언 항구', color: '#77bbb8', ground: '#394e54', building: '#42626a', x: -112, z: 112 },
  { id: 'coast', name: 'PALM COAST', ko: '팜 코스트', color: '#97ce9c', ground: '#647264', building: '#bdaf96', x: 112, z: 112 },
]
export const districtAt = (p) => DISTRICTS[(p.z < 0 ? 0 : 2) + (p.x < 0 ? 0 : 1)]
export const SERVICES = [
  { id: 'garage', name: 'AFTER HOURS CUSTOMS', ko: '애프터 아워스 차고', x: -8, z: 0, color: '#edc579', icon: 'G' },
  { id: 'armory', name: 'NIGHT OWL SUPPLY', ko: '나이트 아울 무기점', x: 0, z: -32, color: '#ed9d9a', icon: 'A' },
  { id: 'safehouse', name: 'THE HIDEOUT', ko: '은신처', x: 0, z: 32, color: '#9fd9c1', icon: 'H' },
  { id: 'garage-east', type: 'garage', name: 'COAST MOTORS', ko: '코스트 모터스', x: 168, z: 112, color: '#edc579', icon: 'G' },
  { id: 'armory-north', type: 'armory', name: 'DUST SUPPLY', ko: '더스트 무기점', x: 112, z: -168, color: '#ed9d9a', icon: 'A' },
]
export const JOBS = [
  { x: 0, z: -48, name: 'NIGHT MARKET', ko: '야시장', reward: 600 },
  { x: 56, z: -56, name: 'RADIO STATION', ko: '라디오 방송국', reward: 850 },
  { x: 56, z: 56, name: 'SOUTH GARAGE', ko: '남부 차고', reward: 1200 },
  { x: -168, z: 112, name: 'CONTAINER TERMINAL', ko: '컨테이너 터미널', reward: 1050 },
  { x: 168, z: -168, name: 'DESERT MOTEL', ko: '사막 모텔', reward: 1400 },
  { x: 168, z: 168, name: 'PALM BOARDWALK', ko: '팜 해안 산책로', reward: 1500 },
  { x: -168, z: -168, name: 'NEON ARCADE', ko: '네온 아케이드', reward: 1250 },
]
export const STASHES = ROADS.slice(1, -1).flatMap((x, i) => [
  { id: `n${i}`, x, z: -224 }, { id: `s${i}`, x, z: 224 },
])

export function createCity() {
  let seed = 2077
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const buildings = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = -196 + col * 56, cz = -196 + row * 56
      const district = districtAt({ x: cx, z: cz })
      for (let i = 0; i < 4; i++) {
        buildings.push({ x: cx + (i % 2 ? 10 : -10), z: cz + (i < 2 ? -10 : 10),
          w: 15 + random() * 3, d: 15 + random() * 3,
          h: district.id === 'desert' ? 3 + random() * 5 : district.id === 'harbor' ? 4 + random() * 6 : 5 + random() * 14,
          tint: Math.floor(random() * 4), district: district.id, color: district.building,
        })
      }
    }
  }
  return buildings
}
export const BUILDINGS = createCity()
const blocks = new Map()
for (const b of BUILDINGS) {
  const key = `${Math.floor((b.x + 224) / 56)},${Math.floor((b.z + 224) / 56)}`
  if (!blocks.has(key)) blocks.set(key, [])
  blocks.get(key).push(b)
}
export function isBlocked(x, z, radius = 0.7) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) + radius > LIMIT || Math.abs(z) + radius > LIMIT) return true
  const col = Math.floor((x + 224) / 56), row = Math.floor((z + 224) / 56)
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (blocks.get(`${col + dx},${row + dz}`)?.some((b) => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius)) return true
  }
  return false
}
