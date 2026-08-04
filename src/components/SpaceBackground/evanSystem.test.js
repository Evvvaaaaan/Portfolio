import { describe, it, expect, vi } from 'vitest'
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

  it('dispose 후 group이 비워지고 geometry/material의 dispose가 실제로 호출된다 (GPU 리소스 누수 방지 계약)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const sun = sys.group.getObjectByName('sun')
    const geoSpy = vi.spyOn(sun.geometry, 'dispose')
    const matSpy = vi.spyOn(sun.material, 'dispose')
    sys.dispose()
    expect(sys.group.children.length).toBe(0)
    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
  })
})

describe('청사진 빌드 (Phase 2)', () => {
  const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

  it('행성마다 청사진 쌍둥이 메시가 생긴다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    for (const p of PLANETS) {
      expect(sys.group.getObjectByName(`blueprint-${p.id}`)).toBeTruthy()
    }
    sys.dispose()
  })

  it('build=0이면 실체가 감춰지고 청사진이 보인다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0)
    const solid = sys.group.getObjectByName('planet-about')
    const bp = sys.group.getObjectByName('blueprint-about')
    expect(solid.material.opacity).toBeLessThan(0.05)
    expect(bp.material.visible).toBe(true)
    sys.dispose()
  })

  it('build=1이면 실체가 완전하고 청사진이 빠지며 transparent가 복원된다', () => {
    // 이게 "인트로가 끝나면 오늘과 픽셀 동일" 계약의 검증 지점이다.
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(1)
    const solid = sys.group.getObjectByName('planet-about')
    const bp = sys.group.getObjectByName('blueprint-about')
    expect(solid.material.opacity).toBe(1)
    expect(solid.material.transparent).toBe(false)
    expect(bp.material.visible).toBe(false)

    // ring-skills처럼 Phase 1에서 원래 반투명이던 머티리얼은 build=1에서도
    // 그 반투명함(baseOpacity)과 transparent 큐를 유지해야 한다 — 여기를
    // 놓치면 링이 build=1에서 불투명해지는 회귀가 전체 스위트를 통과한다.
    const ring = sys.group.getObjectByName('ring-skills')
    expect(ring.material.opacity).toBeCloseTo(0.3, 6)
    expect(ring.material.transparent).toBe(true)

    // 위성은 링과 달리 Phase 1에서도 완전 불투명이었다 — build=1에서 불투명
    // 큐로 복귀해야 한다.
    const sat = sys.group.getObjectByName('satellites-pivot').children[0]
    expect(sat.material.opacity).toBe(1)
    expect(sat.material.transparent).toBe(false)
    sys.dispose()
  })

  it('중간 build에서는 실체가 반투명 상태로 올라온다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.8)
    const solid = sys.group.getObjectByName('planet-about')
    expect(solid.material.transparent).toBe(true)
    expect(solid.material.opacity).toBeGreaterThan(0)
    expect(solid.material.opacity).toBeLessThan(1)
    sys.dispose()
  })

  it('행성마다 빌드 시점이 어긋난다 (동시 실체화 방지)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.5)
    const first = sys.group.getObjectByName(`blueprint-${PLANETS[0].id}`)
    const last = sys.group.getObjectByName(`blueprint-${PLANETS[PLANETS.length - 1].id}`)
    expect(first.material.uniforms.uBuild.value)
      .toBeGreaterThan(last.material.uniforms.uBuild.value)
    sys.dispose()
  })

  it('궤도 라인이 호 속성과 리빌 유니폼을 갖는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const orbit = sys.group.getObjectByName(`orbit-${PLANETS[0].id}`)
    const arc = orbit.geometry.getAttribute('aArc')
    expect(arc).toBeTruthy()
    expect(arc.count).toBe(orbit.geometry.getAttribute('position').count)
    // 호 파라미터는 0에서 시작해 1에서 끝나야 리빌이 한 바퀴를 정확히 덮는다.
    expect(arc.getX(0)).toBeCloseTo(0, 6)
    expect(arc.getX(arc.count - 1)).toBeCloseTo(1, 6)
    sys.dispose()
  })

  it('setOrbitDraw가 모든 궤도 유니폼에 반영된다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setOrbitDraw(0.42)
    for (const p of PLANETS) {
      const orbit = sys.group.getObjectByName(`orbit-${p.id}`)
      expect(orbit.material.uniforms.uDraw.value).toBeCloseTo(0.42, 6)
    }
    sys.dispose()
  })

  it('dispose가 청사진 머티리얼과 지오메트리도 해제한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const bp = sys.group.getObjectByName('blueprint-about')
    const geoSpy = vi.spyOn(bp.geometry, 'dispose')
    const matSpy = vi.spyOn(bp.material, 'dispose')
    sys.dispose()
    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
  })
})
