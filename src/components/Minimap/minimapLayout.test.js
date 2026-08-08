import { describe, it, expect } from 'vitest'
import { PLANETS, planetPosition } from '../SpaceBackground/system.js'
import { STATIONS } from '../SpaceBackground/rail.js'
import {
  MAP_SIZE,
  WORLD_RADIUS,
  SUN_POINT,
  projectToMap,
  MAP_ORBITS,
  MAP_STATIONS,
  cameraMarker,
} from './minimapLayout.js'

const inside = (p) =>
  p.x >= 0 && p.x <= MAP_SIZE && p.y >= 0 && p.y <= MAP_SIZE

describe('projectToMap', () => {
  it('원점(항성)은 지도 정중앙이다', () => {
    expect(projectToMap([0, 0, 0])).toEqual({ x: 50, y: 50 })
    expect(SUN_POINT).toEqual({ x: 50, y: 50 })
  })

  it('월드 반경 끝이 지도 가장자리로 간다', () => {
    expect(projectToMap([WORLD_RADIUS, 0, 0]).x).toBeCloseTo(MAP_SIZE, 6)
    expect(projectToMap([0, 0, -WORLD_RADIUS]).y).toBeCloseTo(0, 6)
  })

  it('y(높이)는 무시한다 — 위에서 내려다본 XZ 평면 지도다', () => {
    expect(projectToMap([120, 0, -80])).toEqual(projectToMap([120, 999, -80]))
  })
})

describe('MAP_ORBITS', () => {
  it('행성 수만큼 있고 궤도 반지름 순으로 커진다', () => {
    expect(MAP_ORBITS).toHaveLength(PLANETS.length)
    const radii = MAP_ORBITS.map((o) => o.r)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
  })

  it('가장 바깥 궤도도 지도 안에 들어온다', () => {
    expect(Math.max(...MAP_ORBITS.map((o) => o.r))).toBeLessThan(MAP_SIZE / 2)
  })
})

describe('MAP_STATIONS', () => {
  it('항성(home) + 행성 4개 = 5개다 — footer는 대응하는 지형지물이 없어 버튼이 없다', () => {
    expect(MAP_STATIONS).toHaveLength(1 + PLANETS.length)
    expect(MAP_STATIONS.map((s) => s.id)).toEqual([
      'home',
      ...PLANETS.map((p) => p.id),
    ])
  })

  it('stationIndex가 STATIONS 순서와 일치한다 — 인덱스 하드코딩 금지', () => {
    for (const s of MAP_STATIONS) {
      expect(s.stationIndex).toBe(STATIONS.findIndex((st) => st.id === s.id))
      expect(s.stationIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('home은 정중앙, 행성은 각자 궤도 반지름만큼 떨어져 있다', () => {
    const home = MAP_STATIONS[0]
    expect({ x: home.x, y: home.y }).toEqual(SUN_POINT)
    for (const p of PLANETS) {
      const s = MAP_STATIONS.find((m) => m.id === p.id)
      const d = Math.hypot(s.x - SUN_POINT.x, s.y - SUN_POINT.y)
      expect(d).toBeCloseTo((p.orbitRadius * (MAP_SIZE / 2)) / WORLD_RADIUS, 6)
    }
  })

  it('색은 #rrggbb 6자리 문자열이다 — SVG fill에 그대로 들어간다', () => {
    for (const s of MAP_STATIONS) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('모든 버튼이 지도 안에 있다', () => {
    for (const s of MAP_STATIONS) expect(inside(s)).toBe(true)
  })
})

describe('cameraMarker', () => {
  it('progress=0은 home 정거장 카메라 위치를 투영한 점이다', () => {
    expect(cameraMarker(0)).toEqual(projectToMap(STATIONS[0].position))
  })

  it('마지막 정거장(footer)에서도 지도 밖으로 나가지 않는다 — WORLD_RADIUS를 이만큼 잡은 이유', () => {
    const last = cameraMarker(STATIONS.length - 1)
    expect(last).toEqual(projectToMap(STATIONS[STATIONS.length - 1].position))
    expect(inside(last)).toBe(true)
  })

  it('레일 전 구간에서 지도 밖으로 나가지 않는다', () => {
    for (let p = 0; p <= STATIONS.length - 1; p += 0.05) {
      expect(inside(cameraMarker(p))).toBe(true)
    }
  })

  it('reduced=true면 가장 가까운 정거장으로 스냅한다 (레일과 동일 계약)', () => {
    expect(cameraMarker(1.4, true)).toEqual(projectToMap(STATIONS[1].position))
    expect(cameraMarker(1.6, true)).toEqual(projectToMap(STATIONS[2].position))
  })
})
