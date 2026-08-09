import { describe, it, expect } from 'vitest'
import { projects } from '../../data/projects.js'
import { PLANETS } from './system.js'
import { SATELLITE_COUNT, SATELLITES } from './satellites.js'

describe('SATELLITES', () => {
  it('프로젝트에서 나오고 개수가 SATELLITE_COUNT와 맞는다', () => {
    expect(SATELLITES).toHaveLength(SATELLITE_COUNT)
    expect(SATELLITE_COUNT).toBeLessThanOrEqual(projects.length)
  })

  it('각 위성이 실제 프로젝트의 slug·제목·accent를 그대로 갖는다', () => {
    SATELLITES.forEach((s, i) => {
      expect(s.slug).toBe(projects[i].slug)
      expect(s.title).toBe(projects[i].title)
      expect(s.accent).toBe(projects[i].accent)
    })
  })

  it('slug가 비어 있는 위성은 없다 — 누르면 갈 곳이 있어야 한다', () => {
    for (const s of SATELLITES) {
      expect(typeof s.slug).toBe('string')
      expect(s.slug.length).toBeGreaterThan(0)
    }
  })

  it('slug가 서로 겹치지 않는다 — 겹치면 두 위성이 같은 곳으로 간다', () => {
    expect(new Set(SATELLITES.map((s) => s.slug)).size).toBe(SATELLITES.length)
  })

  it('배치가 기존 씬 수식과 정확히 같다 (시각 회귀 방지)', () => {
    // Phase 1부터 쓰던 식을 그대로 옮겼는지 검증한다. 값이 바뀌면 위성이
    // 화면에서 다른 자리로 튄다.
    const r = PLANETS.find((p) => p.id === 'projects').radius * 1.9
    SATELLITES.forEach((s, i) => {
      const a = (i / SATELLITE_COUNT) * Math.PI * 2
      expect(s.position[0]).toBeCloseTo(Math.cos(a) * r, 10)
      expect(s.position[1]).toBeCloseTo(Math.sin(a * 2) * 4, 10)
      expect(s.position[2]).toBeCloseTo(Math.sin(a) * r, 10)
    })
  })

  it('위성끼리 겹치지 않는다 — 반지름 3.5짜리 구가 서로 파고들면 안 된다', () => {
    for (let i = 0; i < SATELLITES.length; i++) {
      for (let j = i + 1; j < SATELLITES.length; j++) {
        const [ax, ay, az] = SATELLITES[i].position
        const [bx, by, bz] = SATELLITES[j].position
        expect(Math.hypot(ax - bx, ay - by, az - bz)).toBeGreaterThan(7)
      }
    }
  })
})
