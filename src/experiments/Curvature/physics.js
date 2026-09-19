// Schwarzschild null geodesics: u'' + u = 3 r_s u² / 2, u = 1/r.
// RK4 integrates from infinity: u(0) = 0, u'(0) = 1/|b|.
// Reference: ETH Zürich, General Relativity (Graf / Cedzich), null geodesics.
export const SOLAR_RADIUS_KM = 2.95325
export const WORLD_UNIT_KM = SOLAR_RADIUS_KM * 10
export const FIELD_RADIUS = 22
export const DEFAULTS = { mass: 10, impact: 110, observer: 3, speed: 1, grid: true, bundle: true }
export const PRESETS = [
  { id: 'gentle', name: '약한 중력', note: '빛의 작은 편향', mass: 3, impact: 200 },
  { id: 'lens', name: '중력 렌즈', note: '경로가 크게 휘는 순간', mass: 10, impact: 90 },
  { id: 'critical', name: '임계 궤적', note: '포획 경계 바로 바깥', mass: 10, impact: 77 },
  { id: 'capture', name: '빛의 포획', note: '돌아오지 못하는 경로', mass: 20, impact: 100 },
]

export function horizonRadius(mass) { return Math.max(0, mass) / 10 }
export function criticalImpact(rs) { return 1.5 * Math.sqrt(3) * rs }
export function clockRate(rs, radius) {
  return rs <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - rs / Math.max(radius, rs)))
}

// A vertically compressed Flamm embedding of a spatial slice, not a physical
// downward force. Photon trajectories are projected onto it for illustration.
export function surfaceHeight(radius, rs) {
  if (rs <= 0) return 0
  return 0.42 * (2 * Math.sqrt(rs * Math.max(0, radius - rs)) - 2 * Math.sqrt(rs * (FIELD_RADIUS - rs)))
}

export function tracePhoton(rs, impact, { step = 0.003, maxSteps = 12000 } = {}) {
  const sign = impact < 0 ? -1 : 1
  const b = Math.abs(impact)
  const points = []
  if (rs <= 0 || b < 0.00001) {
    const end = rs > 0 ? -rs : FIELD_RADIUS
    for (let i = 0; i <= 240; i++) points.push([-FIELD_RADIUS + (end + FIELD_RADIUS) * i / 240, impact])
    return { points, outcome: rs > 0 ? 'captured' : 'escaped', deflection: rs > 0 ? null : 0, closest: rs > 0 ? rs : b }
  }
  let u = 0, v = 1 / b, phi = 0, closest = Infinity
  const acceleration = (q) => -q + 1.5 * rs * q * q
  for (let i = 0; i < maxSteps; i++) {
    const oldU = u, oldPhi = phi
    const a = acceleration(u)
    const v2 = v + step * a / 2, u2 = u + step * v / 2
    const a2 = acceleration(u2)
    const v3 = v + step * a2 / 2, u3 = u + step * v2 / 2
    const a3 = acceleration(u3)
    const v4 = v + step * a3, u4 = u + step * v3
    u += step * (v + 2 * v2 + 2 * v3 + v4) / 6
    v += step * (a + 2 * a2 + 2 * a3 + acceleration(u4)) / 6
    phi += step
    if (u <= 0) {
      const exitPhi = oldPhi + step * oldU / (oldU - u)
      return { points, outcome: 'escaped', deflection: (exitPhi - Math.PI) * 180 / Math.PI, closest }
    }
    const radius = 1 / u
    closest = Math.min(closest, radius)
    if (radius <= FIELD_RADIUS) {
      const r = Math.max(rs, radius)
      points.push([-r * Math.cos(phi), sign * r * Math.sin(phi)])
    }
    if (radius <= rs) return { points, outcome: 'captured', deflection: null, closest: rs }
  }
  return { points, outcome: 'unresolved', deflection: null, closest }
}
