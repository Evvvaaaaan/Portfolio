import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBlueprintMaterial } from './blueprintMaterial.js'
import { BLUEPRINT_UNIFORM_NAMES } from './blueprint.glsl.js'

describe('createBlueprintMaterial', () => {
  it('셰이더 머티리얼과 계약 유니폼을 만든다', () => {
    const { material } = createBlueprintMaterial({ color: 0x6db5ff, extent: 15 })
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      expect(material.uniforms[u]).toBeTruthy()
    }
    expect(material.uniforms.uExtent.value).toBe(15)
  })

  it('가산 합성 + 깊이 쓰기 없음 (선이 실체 표면에 파묻히지 않게)', () => {
    const { material } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.blending).toBe(THREE.AdditiveBlending)
  })

  it('setBuild가 유니폼에 반영된다', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(0.4)
    expect(material.uniforms.uBuild.value).toBeCloseTo(0.4, 6)
  })

  it('setBuild는 0~1로 클램프한다', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(-3)
    expect(material.uniforms.uBuild.value).toBe(0)
    setBuild(9)
    expect(material.uniforms.uBuild.value).toBe(1)
  })

  it('build=1이면 청사진이 완전히 빠진다 (오늘 렌더와 동일해야 하는 계약)', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(0.5)
    expect(material.visible).toBe(true)
    setBuild(1)
    expect(material.visible).toBe(false)
  })
})
