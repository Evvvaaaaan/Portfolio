import { describe, it, expect } from 'vitest'
import { SUN_VERT, SUN_FRAG, SUN_UNIFORM_NAMES } from './sunSurface.glsl.js'

describe('항성 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(SUN_UNIFORM_NAMES).toEqual(['uCoreColor', 'uEdgeColor', 'uTime'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of SUN_UNIFORM_NAMES) {
      expect(SUN_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = SUN_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('시선 기준 림 감쇠를 계산한다 (가장자리 림브 다크닝)', () => {
    expect(SUN_FRAG).toMatch(/cameraPosition/)
    expect(SUN_VERT).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
  })

  it('노이즈로 표면 난류를 만든다', () => {
    expect(SUN_FRAG).toMatch(/fbm/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    expect(SUN_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = SUN_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
