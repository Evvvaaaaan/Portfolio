import { describe, it, expect } from 'vitest'
import { PLANET_VERT, PLANET_FRAG, PLANET_UNIFORM_NAMES } from './planetSurface.glsl.js'

describe('행성 표면 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(PLANET_UNIFORM_NAMES).toEqual([
      'uBaseColor', 'uSunPos', 'uTime', 'uSeed', 'uOpacity', 'uRimColor',
    ])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of PLANET_UNIFORM_NAMES) {
      expect(PLANET_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = PLANET_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('월드 좌표와 월드 노멀을 프래그먼트로 넘긴다 (라이팅을 월드 공간에서 계산)', () => {
    expect(PLANET_VERT).toMatch(/varying\s+vec3\s+vWorldPos\s*;/)
    expect(PLANET_VERT).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
    expect(PLANET_FRAG).toMatch(/varying\s+vec3\s+vWorldPos\s*;/)
    expect(PLANET_FRAG).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
    expect(PLANET_VERT).toMatch(/modelMatrix/)
  })

  it('노이즈 청크를 포함한다', () => {
    expect(PLANET_FRAG).toMatch(/float\s+fbm\s*\(/)
  })

  it('대기 프레넬 림을 계산한다 (시선과 노멀의 각도)', () => {
    // 림 라이트가 없으면 구가 평평한 원반처럼 읽힌다.
    expect(PLANET_FRAG).toMatch(/cameraPosition/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    // three는 ShaderMaterial에 linearToOutputTexel을 정의만 하고 호출은 안 한다.
    expect(PLANET_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('교차 페이드를 위해 uOpacity를 알파에 곱한다', () => {
    expect(PLANET_FRAG).toMatch(/uOpacity/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = PLANET_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
