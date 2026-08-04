import { describe, it, expect } from 'vitest'
import { GLSL_NOISE } from './noise.glsl.js'

describe('GLSL_NOISE', () => {
  it('행성·항성·성운이 함께 쓰는 함수를 모두 정의한다', () => {
    for (const fn of ['hash13', 'vnoise', 'fbm', 'fbmRidged']) {
      expect(GLSL_NOISE).toMatch(new RegExp(`float\\s+${fn}\\s*\\(`))
    }
  })

  it('전역 상태나 유니폼에 의존하지 않는다 (어느 셰이더에도 그대로 붙일 수 있어야 한다)', () => {
    expect(GLSL_NOISE).not.toMatch(/uniform\s/)
    expect(GLSL_NOISE).not.toMatch(/varying\s/)
  })

  it('fbm은 옥타브를 루프로 돌린다 (한 번만 샘플하면 디테일이 안 나온다)', () => {
    // 파일 어딘가에 for가 있다는 것만으로는 fbm/fbmRidged 자체가 옥타브를
    // 도는지 보장하지 못한다 — 각 함수 본문 안에 루프가 있는지 직접 확인한다.
    for (const fn of ['fbm', 'fbmRidged']) {
      const body = GLSL_NOISE.match(new RegExp(`float\\s+${fn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))
      expect(body).toBeTruthy()
      expect(body[1]).toMatch(/for\s*\(/)
    }
  })

  it('역방향 smoothstep을 쓰지 않는다 (GLSL ES 미정의 동작)', () => {
    // smoothstep(a, b, x)에서 a >= b면 결과가 정의되지 않는다.
    const calls = GLSL_NOISE.match(/smoothstep\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
