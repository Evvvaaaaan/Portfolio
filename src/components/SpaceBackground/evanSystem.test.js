import { describe, it, expect } from 'vitest'
import { createEvanSystem } from './evanSystem.js'
import { PLANETS, planetPosition } from './system.js'

const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

describe('createEvanSystem', () => {
  it('행성 메시가 system.js 좌표에 정확히 놓인다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    for (const p of PLANETS) {
      const mesh = sys.group.getObjectByName(`planet-${p.id}`)
      expect(mesh).toBeTruthy()
      const [x, y, z] = planetPosition(p)
      expect(mesh.position.x).toBeCloseTo(x, 5)
      expect(mesh.position.y).toBeCloseTo(y, 5)
      expect(mesh.position.z).toBeCloseTo(z, 5)
    }
    sys.dispose()
  })

  it('태양·궤도 라인·위성 피벗이 존재한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun')).toBeTruthy()
    expect(sys.group.getObjectByName('satellites-pivot')).toBeTruthy()
    const orbits = sys.group.children.filter((c) => c.name.startsWith('orbit-'))
    expect(orbits.length).toBe(PLANETS.length)
    // 위성 수 = 전달한 색 수
    expect(sys.group.getObjectByName('satellites-pivot').children.length).toBe(COLORS.length)
    sys.dispose()
  })

  it('update는 위성 피벗을 공전시키고 행성을 자전시킨다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const pivot = sys.group.getObjectByName('satellites-pivot')
    const planet = sys.group.getObjectByName('planet-about')
    sys.update(1.0)
    const r1 = pivot.rotation.y
    const s1 = planet.rotation.y
    sys.update(2.0)
    expect(pivot.rotation.y).not.toBe(r1)
    expect(planet.rotation.y).not.toBe(s1)
    sys.dispose()
  })

  it('dispose 후 group이 비워진다 (GPU 리소스 누수 방지 계약)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.dispose()
    expect(sys.group.children.length).toBe(0)
  })
})
