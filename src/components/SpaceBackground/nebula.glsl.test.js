import { describe, it, expect } from 'vitest'
import { NEBULA_VERT, NEBULA_FRAG, NEBULA_UNIFORM_NAMES } from './nebula.glsl.js'

describe('성운 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(NEBULA_UNIFORM_NAMES).toEqual(['uColorA', 'uColorB', 'uIntensity', 'uTime'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of NEBULA_UNIFORM_NAMES) {
      expect(NEBULA_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = NEBULA_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('방향 벡터를 프래그먼트로 넘긴다 (구 안쪽에서 보는 하늘)', () => {
    expect(NEBULA_VERT).toMatch(/varying\s+vec3\s+vDir\s*;/)
    expect(NEBULA_FRAG).toMatch(/varying\s+vec3\s+vDir\s*;/)
  })

  it('uIntensity가 최종 알파를 곱한다 (0이면 완전히 사라져야 한다)', () => {
    // "검은 우주가 주인공" 제약을 지키려면 밀도를 한 손잡이로 끌 수 있어야 한다.
    // a 자체가 uIntensity의 곱이어야 하고, 최종 색과 알파 모두 그 a로
    // 스케일돼야 한다 — 그래야 uIntensity=0에서 색·알파가 함께 0이 된다.
    expect(NEBULA_FRAG).toMatch(/float\s+a\s*=\s*[\w.]+\s*\*\s*uIntensity\s*;/)
    expect(NEBULA_FRAG).toMatch(/gl_FragColor\s*=\s*vec4\(\s*color\s*\*\s*a\s*,\s*a\s*\)\s*;/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    expect(NEBULA_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = NEBULA_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })

  it('성운 임계값이 노이즈 평균보다 충분히 위에 있다 (검은 우주가 주인공)', () => {
    // 노이즈 합의 평균은 약 0.48. 임계를 그 근처에 두면 하늘 대부분이
    // 성운으로 덮여 아트 디렉션 제약이 깨진다.
    const m = NEBULA_FRAG.match(/smoothstep\(\s*([0-9.]+)\s*,/)
    expect(m).toBeTruthy()
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(0.6)
  })
})
