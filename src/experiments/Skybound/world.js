export const WORLD_LIMIT = 7200
export const WORLD_SIZE = WORLD_LIMIT * 2
export const BIOMES = {
  ocean: { name: '오렐리아 해안', label: 'OCEAN', color: '#7ba6aa' },
  jungle: { name: '에메랄드 정글', label: 'JUNGLE', color: '#416e4b' },
  mountains: { name: '알파인 산맥', label: 'ALPINE', color: '#a4aca5' },
  plains: { name: '골든 평원', label: 'PLAINS', color: '#b3b16d' },
}
export const ISLANDS = [
  { x: 370, z: -350, rx: 325, rz: 370, height: 175 },
  { x: -520, z: -680, rx: 300, rz: 240, height: 145 },
  { x: 750, z: -1400, rx: 430, rz: 290, height: 215 },
  { x: -580, z: 630, rx: 390, rz: 310, height: 155 },
  { x: 1390, z: 350, rx: 340, rz: 450, height: 190 },
]
export const LANDMASSES = [
  { x: -3300, z: -900, rx: 2400, rz: 3300, height: 280, biome: 'jungle' },
  { x: 600, z: -3500, rx: 3000, rz: 1800, height: 880, biome: 'mountains' },
  { x: 2800, z: -1600, rx: 1900, rz: 1600, height: 330, biome: 'mountains' },
  { x: 3100, z: 1700, rx: 2400, rz: 3000, height: 120, biome: 'plains' },
]

function landHeight(land, x, z) {
  const nx = (x - land.x) / land.rx, nz = (z - land.z) / land.rz
  const r = Math.hypot(nx, nz)
  const edge = 1 + .055 * Math.sin(Math.atan2(nz, nx) * 5 + land.x)
  if (r >= edge) return -3
  const profile = Math.pow(Math.max(0, 1 - r / edge), land.biome === 'plains' ? .65 : 1.1)
  const ridges = land.biome === 'mountains'
    ? .78 + .22 * Math.sin(x * .004 + z * .002) * Math.cos(z * .005)
    : .94 + .06 * Math.sin(x * .006) * Math.cos(z * .007)
  return profile * land.height * ridges - 3
}

export function biomeAt(x, z) {
  let biome = 'ocean', height = 0
  for (const land of LANDMASSES) {
    const y = landHeight(land, x, z)
    if (y > height) { height = y; biome = land.biome }
  }
  return biome
}

// Rendering and flight collision use this same continuous surface.
export function terrainHeight(x, z) {
  let height = -3
  for (const island of ISLANDS) {
    const nx = (x - island.x) / island.rx, nz = (z - island.z) / island.rz
    const r = Math.hypot(nx, nz)
    const edge = 1 + .075 * Math.sin(Math.atan2(nz, nx) * 5 + island.x)
    if (r >= edge) continue
    const profile = Math.pow(Math.max(0, 1 - r / edge), 1.55)
    const ridges = 1 + .19 * Math.sin(x * .022 + z * .013) * Math.cos(z * .027)
    height = Math.max(height, profile * island.height * ridges - 2)
  }
  for (const land of LANDMASSES) height = Math.max(height, landHeight(land, x, z))
  const airfield = Math.hypot((x + 220) / 170, (z - 190) / 235)
  return Math.max(height, Math.min(10, (1 - airfield) * 65))
}
