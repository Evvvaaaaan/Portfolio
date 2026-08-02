import { describe, it, expect } from 'vitest'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'

describe('system 월드 레이아웃', () => {
  it('섹션 행성 4개가 about→contact 순서로 정의된다', () => {
    expect(PLANETS.map((p) => p.id)).toEqual(['about', 'skills', 'projects', 'contact'])
  })

  it('궤도 반지름은 순서대로 단조 증가한다 (카메라 레일이 안쪽→바깥쪽 항행)', () => {
    const radii = PLANETS.map((p) => p.orbitRadius)
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1])
  })

  it('planetPosition은 XZ 평면 위 궤도 반지름 거리의 결정적 좌표를 준다', () => {
    for (const p of PLANETS) {
      const [x, y, z] = planetPosition(p)
      expect(y).toBe(0)
      expect(Math.hypot(x, z)).toBeCloseTo(p.orbitRadius, 6)
      // 결정적: 같은 입력 → 같은 출력
      expect(planetPosition(p)).toEqual([x, y, z])
    }
  })

  it('태양 반지름은 가장 안쪽 궤도보다 충분히 작다', () => {
    expect(SUN_RADIUS * 2).toBeLessThan(PLANETS[0].orbitRadius)
  })
})
