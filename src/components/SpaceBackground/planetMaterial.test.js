import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPlanetMaterial } from './planetMaterial.js'
import { PLANET_UNIFORM_NAMES } from './planetSurface.glsl.js'

describe('createPlanetMaterial', () => {
  it('셰이더 머티리얼과 계약 유니폼을 만든다', () => {
    const { material } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 3 })
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    for (const u of PLANET_UNIFORM_NAMES) expect(material.uniforms[u]).toBeTruthy()
    expect(material.uniforms.uSeed.value).toBe(3)
  })

  it('setOpacity가 유니폼에 반영되고 0~1로 클램프된다', () => {
    const { material, setOpacity } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setOpacity(0.4)
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.4, 6)
    setOpacity(-2)
    expect(material.uniforms.uOpacity.value).toBe(0)
    setOpacity(5)
    expect(material.uniforms.uOpacity.value).toBe(1)
  })

  it('완전 불투명해지면 투명 큐에서 빠진다 (Phase 2 build=1 계약)', () => {
    const { material, setOpacity } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setOpacity(0.5)
    expect(material.transparent).toBe(true)
    setOpacity(1)
    expect(material.transparent).toBe(false)
  })

  it('setTime이 유니폼을 갱신한다', () => {
    const { material, setTime } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setTime(12.5)
    expect(material.uniforms.uTime.value).toBeCloseTo(12.5, 6)
  })

  it('항성 위치 유니폼은 원점에서 시작한다 (항성계 중심)', () => {
    const { material } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    expect(material.uniforms.uSunPos.value.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
  })
})
