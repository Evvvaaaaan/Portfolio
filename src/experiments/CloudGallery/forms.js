// 조각 형태 생성기. three.js를 import하지 않는 순수 계산이라 WebGL 없이
// 단위 테스트할 수 있다 (cloudPath.js / sculptures.js와 같은 규칙).
//
// 목표는 "고른 도형 14개"가 아니라 "한 작가의 연작처럼 보이는 서로 다른 14개"다.
// 그래서 형태를 실험 id에서 결정론적으로 파생시킨다. 호 위에서는 활성 작품
// 하나만 크게 잡히고 나머지는 작게 보이므로, 파라미터 범위는 표면 디테일이
// 아니라 **실루엣**이 벌어지는 방향으로 잡았다.

function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32 — 시드 하나로 재현 가능한 난수열
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp = (r, lo, hi) => lo + r * (hi - lo)
const pick = (r, arr) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]

// Gielis 슈퍼포뮬러. m이 실루엣의 각(角) 개수를, n1이 부풀거나 오목한 정도를
// 지배한다. n1이 아주 작으면 r이 발산하므로 상한을 둔다.
export const MAX_RADIUS = 4

export function superRadius({ m, n1, n2, n3 }, angle) {
  const t = (m * angle) / 4
  const s =
    Math.pow(Math.abs(Math.cos(t)), n2) + Math.pow(Math.abs(Math.sin(t)), n3)
  if (!(s > 1e-9)) return MAX_RADIUS
  const r = Math.pow(s, -1 / n1)
  return Number.isFinite(r) ? Math.min(r, MAX_RADIUS) : MAX_RADIUS
}

// 두 슈퍼포뮬러의 구면곱(spherical product). 극이 Y축에 오도록 두어
// 조각이 세워진 자세가 된다.
export function superPoint({ lat, lon }, theta, phi) {
  const r1 = superRadius(lat, theta)
  const r2 = superRadius(lon, phi)
  const cosPhi = Math.cos(phi)
  return [
    r1 * Math.cos(theta) * r2 * cosPhi,
    r2 * Math.sin(phi),
    r1 * Math.sin(theta) * r2 * cosPhi,
  ]
}

function superParams(rand) {
  const band = () => ({
    m: pick(rand(), [3, 4, 5, 6, 7, 8, 10, 12]),
    n1: lerp(rand(), 0.3, 1.4),
    n2: lerp(rand(), 0.4, 2.6),
    n3: lerp(rand(), 0.4, 2.6),
  })
  return { lat: band(), lon: band() }
}

// 매듭은 실루엣에 '구멍'을 만든다 — 덩어리형 슈퍼포뮬러와 가장 크게 갈리는
// 축이라 투어를 따라 규칙적으로 섞는다.
const KNOTS = [
  [2, 3], [3, 4], [3, 5], [2, 5], [4, 3], [5, 3], [2, 7],
]

function knotParams(rand) {
  const [p, q] = pick(rand(), KNOTS)
  return { p, q, tube: lerp(rand(), 0.18, 0.42) }
}

// 형태가 달라도 전부 같은 축을 같은 속도로 돌면 한 무리로 보인다.
function spinFor(rand) {
  const axis = [lerp(rand(), -0.35, 0.35), 1, lerp(rand(), -0.35, 0.35)]
  const len = Math.hypot(axis[0], axis[1], axis[2])
  return {
    axis: [axis[0] / len, axis[1] / len, axis[2] / len],
    speed: lerp(rand(), 0.06, 0.26) * (rand() < 0.5 ? -1 : 1),
  }
}

// id는 파라미터를, 투어상의 위치는 계열을 정한다. 계열을 위치로 정해야
// 구멍 뚫린 형태와 덩어리 형태가 몰리지 않고 번갈아 나온다.
export function formFor(id, index) {
  const rand = rng(hash32(id))
  const family = index % 3 === 1 ? 'knot' : 'super'
  return {
    family,
    params: family === 'knot' ? knotParams(rand) : superParams(rand),
    spin: spinFor(rand),
  }
}

// 슈퍼포뮬러는 파라미터에 따라 크기가 크게 달라진다. 14개가 비슷한 덩치로
// 읽혀야 하므로 샘플링해 최대 반경을 재고, 호출부에서 그 값으로 정규화한다.
export function maxExtent(params, segU = 48, segV = 24) {
  let max = 0
  for (let i = 0; i <= segU; i++) {
    const theta = -Math.PI + (i / segU) * Math.PI * 2
    for (let j = 0; j <= segV; j++) {
      const phi = -Math.PI / 2 + (j / segV) * Math.PI
      const [x, y, z] = superPoint(params, theta, phi)
      max = Math.max(max, Math.hypot(x, y, z))
    }
  }
  return max || 1
}
