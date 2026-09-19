import { Vector3, MathUtils } from 'three'
import { WGS84_ELLIPSOID, WGS84_RADIUS } from '3d-tiles-renderer'

export const STOPS = [
  {
    id: 'paris', city: 'Paris', country: 'FRANCE', name: 'Eiffel Tower', ko: '에펠탑',
    lat: 48.85837, lon: 2.29448, elevation: 180, height: 480, back: 820, bearing: 235,
    year: '1889', detail: 'Iron, light & the Seine', detailKo: '철과 빛, 그리고 센강',
    text: 'Above the rooftops of Paris, a lattice of iron becomes a symbol. Follow the Seine to the tower that changed the city’s horizon.',
    textKo: '파리의 지붕 위로 철의 격자가 하나의 상징이 됩니다. 센강을 따라, 도시의 지평선을 바꾼 에펠탑으로 다가갑니다.',
  },
  {
    id: 'rome', city: 'Rome', country: 'ITALY', name: 'The Colosseum', ko: '콜로세움',
    lat: 41.89021, lon: 12.49223, elevation: 65, height: 270, back: 430, bearing: 150,
    year: '80 CE', detail: 'An echo of an empire', detailKo: '돌에 새겨진 제국의 시간',
    text: 'An oval of weathered stone holds nearly two thousand years of stories. Circle its arches and discover the scale of ancient Rome.',
    textKo: '빛바랜 타원형의 돌벽에 약 2천 년의 이야기가 남아 있습니다. 아치 사이를 돌며 고대 로마의 거대한 스케일을 마주합니다.',
  },
  {
    id: 'new-york', city: 'New York', country: 'UNITED STATES', name: 'Statue of Liberty', ko: '자유의 여신상',
    lat: 40.68925, lon: -74.0445, elevation: 65, height: 240, back: 480, bearing: 135,
    year: '1886', detail: 'A welcome across the water', detailKo: '바다를 건너온 이들을 향해',
    text: 'At the edge of the Atlantic, a copper figure lifts her torch. The harbor opens around her, with Manhattan rising in the distance.',
    textKo: '대서양을 마주한 구리빛 조각상이 횃불을 높이 듭니다. 항구 너머로 맨해튼이 솟아오르고, 발아래로 작은 섬이 펼쳐집니다.',
  },
  {
    id: 'rio', city: 'Rio de Janeiro', country: 'BRAZIL', name: 'Christ the Redeemer', ko: '리우 예수상',
    lat: -22.95191, lon: -43.21049, elevation: 745, height: 160, back: 350, bearing: 95,
    year: '1931', detail: 'Between mountains & ocean', detailKo: '산과 바다 사이에 서서',
    text: 'High above the city, outstretched arms meet the clouds. Forested peaks, dense neighborhoods and the Atlantic share a single horizon.',
    textKo: '도시 위로 높이 펼쳐진 두 팔이 구름과 만납니다. 숲으로 덮인 봉우리와 빽빽한 거리, 대서양이 하나의 지평선에 담깁니다.',
  },
  {
    id: 'sydney', city: 'Sydney', country: 'AUSTRALIA', name: 'Sydney Opera House', ko: '시드니 오페라하우스',
    lat: -33.85678, lon: 151.2153, elevation: 40, height: 220, back: 460, bearing: 45,
    year: '1973', detail: 'Sails cast in concrete', detailKo: '콘크리트로 펼친 하얀 돛',
    text: 'White shells catch the light at the water’s edge. Our journey ends where architecture, sky and the harbor seem to flow into one another.',
    textKo: '물가에 펼쳐진 하얀 지붕이 빛을 받아 반짝입니다. 건축과 하늘, 항구가 서로에게 스며드는 곳에서 여행을 마칩니다.',
  },
]

export const clamp = (value, min = 0, max = 1) => MathUtils.clamp(value, min, max)
const smooth = (t) => { const x = clamp(t); return x * x * (3 - 2 * x) }
const radians = MathUtils.degToRad
const ORIGIN = { lat: 24, lon: -15, height: WGS84_RADIUS * 2.05, back: 0, elevation: 0, bearing: 0 }

export function direction(lat, lon) {
  const a = radians(lat), b = radians(lon)
  return new Vector3(Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a))
}

// Interpolate on the surface, never along a chord through the Earth.
export function greatCircle(from, to, t) {
  const angle = Math.acos(clamp(from.dot(to), -1, 1))
  if (angle < 0.00001) return from.clone()
  return from.clone().multiplyScalar(Math.sin((1 - t) * angle))
    .addScaledVector(to, Math.sin(t * angle)).divideScalar(Math.sin(angle)).normalize()
}

export function journeyFrame(progress, { overview = false, narrow = false, minimumHeight = 0 } = {}) {
  const p = clamp(progress, 0, STOPS.length)
  const index = Math.min(Math.floor(p), STOPS.length - 1)
  const local = p - index
  const from = index === 0 ? ORIGIN : STOPS[index - 1]
  const to = STOPS[index]
  const travel = smooth(local / 0.84)
  const a = direction(from.lat, from.lon), b = direction(to.lat, to.lon)
  const normal = greatCircle(a, b, travel)
  const lat = Math.asin(clamp(normal.z, -1, 1)), lon = Math.atan2(normal.y, normal.x)
  const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0)
  const north = new Vector3().crossVectors(normal, east).normalize()
  const angle = Math.acos(clamp(a.dot(b), -1, 1))
  const peak = Math.max(WGS84_RADIUS * 0.25, angle * WGS84_RADIUS * 0.75)
  let height = Math.exp(MathUtils.lerp(Math.log(from.height), Math.log(to.height), travel))
  if (index > 0) height *= Math.exp(Math.sin(Math.PI * travel) * Math.log(peak / Math.sqrt(from.height * to.height)))
  height = Math.max(height, minimumHeight, overview ? WGS84_RADIUS * 0.45 : 0)
  const near = 1 - smooth((height - 3000) / 200000)
  const focus = WGS84_ELLIPSOID.getCartographicToPosition(lat, lon, MathUtils.lerp(from.elevation, to.elevation, travel), new Vector3())
  const bearing = radians(MathUtils.lerp(from.bearing, to.bearing, travel))
  const tangent = north.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing))
  const back = MathUtils.lerp(from.back, to.back, travel) * (narrow ? 1.3 : 1)
  const position = focus.clone().addScaledVector(normal, height).addScaledVector(tangent, back)
  const target = focus.clone().multiplyScalar(index === 0 ? smooth(travel * 2) : 1)
  const up = north.clone().multiplyScalar(1 - near).addScaledVector(normal, near).normalize()
  return {
    position, target, up, height, lat: MathUtils.radToDeg(lat), lon: MathUtils.radToDeg(lon),
    index, progress: p, near, phase: p < 0.025 ? 'orbit' : local < 0.84 ? 'flight' : 'arrived',
    stop: to, viewOffset: 0.09 + 0.1 * (1 - smooth(p / 0.3)),
  }
}

export function stopProgress(index) { return clamp(index + 0.94, 0, STOPS.length) }

export function coordinates(lat, lon) {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}  /  ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`
}
