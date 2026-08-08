import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { createEvanSystem } from './evanSystem.js'
import { PLANETS, planetPosition } from './system.js'
import { computeGrade, hoursFromDate } from './timeOfDay.js'

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

describe('렌더링 품질 (Phase 3)', () => {
  const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

  it('행성이 커스텀 표면 셰이더를 쓴다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const p = sys.group.getObjectByName('planet-about')
    expect(p.material).toBeInstanceOf(THREE.ShaderMaterial)
    expect(p.material.uniforms.uBaseColor).toBeTruthy()
    sys.dispose()
  })

  it('행성마다 시드가 달라 지형이 겹치지 않는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const seeds = PLANETS.map((p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uSeed.value)
    expect(new Set(seeds).size).toBe(seeds.length)
    sys.dispose()
  })

  it('항성이 커스텀 표면 셰이더를 쓰고 글로우는 유지된다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun').material).toBeInstanceOf(THREE.ShaderMaterial)
    sys.dispose()
  })

  it('성운이 안쪽을 향한 큰 배경 구로 존재한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const neb = sys.group.getObjectByName('nebula')
    expect(neb).toBeTruthy()
    expect(neb.material.side).toBe(THREE.BackSide)
    // 가장 바깥 궤도보다 훨씬 멀어야 항성계를 감싼다.
    const outer = Math.max(...PLANETS.map((p) => p.orbitRadius))
    expect(neb.geometry.parameters.radius).toBeGreaterThan(outer * 2)
    sys.dispose()
  })

  it('update가 행성·항성·성운의 시간 유니폼을 함께 민다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.update(4.25)
    expect(sys.group.getObjectByName('planet-about').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    expect(sys.group.getObjectByName('sun').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    expect(sys.group.getObjectByName('nebula').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    sys.dispose()
  })

  it('reduced-motion: shaderTime=0을 넘기면 uTime 유니폼은 고정되고 메시는 계속 움직인다', () => {
    // SpaceBackground.jsx가 reduced-motion에서 update(t, 0, camera.position)을
    // 부른다 — 셰이더 시간(난류·성운 흐름)만 얼리고, t가 구동하는 자전 같은
    // Phase 1/2 모션은 그대로 유지돼야 한다("형태는 그대로 보여야 한다").
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const planet = sys.group.getObjectByName('planet-about')
    sys.update(0, 0)
    const s0 = planet.rotation.y
    sys.update(5, 0)
    expect(planet.rotation.y).not.toBe(s0)
    expect(planet.material.uniforms.uTime.value).toBe(0)
    expect(sys.group.getObjectByName('sun').material.uniforms.uTime.value).toBe(0)
    expect(sys.group.getObjectByName('nebula').material.uniforms.uTime.value).toBe(0)
    sys.dispose()
  })

  it('성운은 매 프레임 카메라 위치로 따라와 far plane 밖으로 잘리지 않는다', () => {
    // 성운은 반지름 1600 구인데 카메라 far는 2000이다 — 월드 원점에 고정하면
    // 레일 끝 정거장에서 구의 뒷면이 far 밖으로 나가 하늘에 구멍이 뚫린다.
    // 카메라에 붙어 있어야 모든 방향에서 거리가 항상 1600으로 유지된다.
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const neb = sys.group.getObjectByName('nebula')
    sys.update(1, 1, new THREE.Vector3(0, 300, 560))
    expect(neb.position.toArray()).toEqual([0, 300, 560])
    sys.update(2, 2, new THREE.Vector3(-120, 40, -300))
    expect(neb.position.toArray()).toEqual([-120, 40, -300])
    sys.dispose()
  })

  it('build=1이면 행성이 완전 불투명이고 투명 큐에서 빠진다 (Phase 2 계약 유지)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(1)
    const m = sys.group.getObjectByName('planet-about').material
    expect(m.uniforms.uOpacity.value).toBe(1)
    expect(m.transparent).toBe(false)
    sys.dispose()
  })

  it('build 중간에는 행성이 반투명으로 올라온다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.8)
    const m = sys.group.getObjectByName('planet-about').material
    expect(m.transparent).toBe(true)
    expect(m.uniforms.uOpacity.value).toBeGreaterThan(0)
    expect(m.uniforms.uOpacity.value).toBeLessThan(1)
    sys.dispose()
  })

  it('dispose가 성운과 항성 리소스도 해제한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const neb = sys.group.getObjectByName('nebula')
    const sun = sys.group.getObjectByName('sun')
    const spies = [
      vi.spyOn(neb.geometry, 'dispose'), vi.spyOn(neb.material, 'dispose'),
      vi.spyOn(sun.material, 'dispose'),
    ]
    sys.dispose()
    for (const s of spies) expect(s).toHaveBeenCalled()
  })

  it('setGrade가 항성·조명·행성 림·성운 색을 한 번에 바꾼다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const sun = sys.group.getObjectByName('sun')
    const neb = sys.group.getObjectByName('nebula')
    const planet = sys.group.getObjectByName('planet-about')

    sys.setGrade({
      sunCore: 0x112233,
      sunEdge: 0x445566,
      sunLight: 0x778899,
      ambient: 0xaabbcc,
      rim: 0xddeeff,
      nebulaA: 0x102030,
      nebulaB: 0x405060,
      nebulaIntensity: 0.17,
    })

    expect(sun.material.uniforms.uCoreColor.value.getHex()).toBe(0x112233)
    expect(sun.material.uniforms.uEdgeColor.value.getHex()).toBe(0x445566)
    // 림은 덮어쓰기가 아니라 "행성 고유색 → 등급 rim" 0.55 혼합이다.
    const expectedRim = new THREE.Color(PLANETS.find((p) => p.id === 'about').color)
      .lerp(new THREE.Color(0xddeeff), 0.55)
      .getHex()
    expect(planet.material.uniforms.uRimColor.value.getHex()).toBe(expectedRim)
    expect(neb.material.uniforms.uColorA.value.getHex()).toBe(0x102030)
    expect(neb.material.uniforms.uColorB.value.getHex()).toBe(0x405060)
    expect(neb.material.uniforms.uIntensity.value).toBeCloseTo(0.17, 6)

    const light = sys.group.children.find((c) => c.isPointLight)
    const amb = sys.group.children.find((c) => c.isAmbientLight)
    expect(light.color.getHex()).toBe(0x778899)
    expect(amb.color.getHex()).toBe(0xaabbcc)

    sys.dispose()
  })

  it('setGrade는 모든 행성에 적용되지만 행성별 림 정체성은 남는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const before = PLANETS.map(
      (p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uRimColor.value.getHex(),
    )
    sys.setGrade({
      sunCore: 0x111111, sunEdge: 0x222222, sunLight: 0x333333,
      ambient: 0x444444, rim: 0xff0000,
      nebulaA: 0x555555, nebulaB: 0x666666, nebulaIntensity: 0.2,
    })
    const after = PLANETS.map(
      (p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uRimColor.value.getHex(),
    )
    // 네 행성 모두 실제로 바뀌었고 — 하나라도 안 바뀌면 루프가 빠진 것
    for (let i = 0; i < before.length; i++) expect(after[i]).not.toBe(before[i])
    // 그러면서도 서로 다른 색으로 남는다 — 전부 같아지면 등급이 고유색을
    // 덮어쓴 것이고, Phase 3이 만든 행성별 정체성이 사라진다.
    expect(new Set(after).size).toBe(PLANETS.length)
    sys.dispose()
  })

  it('setGrade를 부르지 않아도 씬은 Phase 3 기본값으로 동작한다', () => {
    // setGrade는 선택적 확장이다 — 호출하지 않는 경로(테스트·다른 라우트)가
    // 그대로 살아 있어야 기존 계약이 깨지지 않는다.
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun').material.uniforms.uCoreColor.value.getHex())
      .toBe(0xfff1c9)
    expect(sys.group.getObjectByName('nebula').material.uniforms.uIntensity.value)
      .toBeCloseTo(0.32, 6)
    sys.dispose()
  })

  it('시각이 다르면 씬에 실제로 다른 색이 꽂힌다 — 등급 체인 전체 검증', () => {
    // computeGrade → setGrade → 유니폼까지의 합성을 한 번에 확인한다.
    // e2e 스크린샷은 필름 그레인과 별 회전이 실시간에 물려 있어 두 로드가
    // 항상 달라 보이므로, "시각 때문에 달라졌다"는 여기서만 증명된다.
    const gradeAt = (h) => computeGrade(hoursFromDate(new Date(2026, 7, 8, h, 0, 0)))

    const night = createEvanSystem({ satelliteColors: COLORS })
    night.setGrade(gradeAt(0))
    const nightSun = night.group.getObjectByName('sun').material.uniforms.uCoreColor.value.getHex()
    const nightNebA = night.group.getObjectByName('nebula').material.uniforms.uColorA.value.getHex()
    const nightRim = night.group.getObjectByName('planet-about').material.uniforms.uRimColor.value.getHex()
    night.dispose()

    const noon = createEvanSystem({ satelliteColors: COLORS })
    noon.setGrade(gradeAt(12))
    const noonSun = noon.group.getObjectByName('sun').material.uniforms.uCoreColor.value.getHex()
    const noonNebA = noon.group.getObjectByName('nebula').material.uniforms.uColorA.value.getHex()
    const noonRim = noon.group.getObjectByName('planet-about').material.uniforms.uRimColor.value.getHex()
    noon.dispose()

    expect(nightSun).not.toBe(noonSun)
    expect(nightNebA).not.toBe(noonNebA)
    expect(nightRim).not.toBe(noonRim)
  })
})
