import { describe, it, expect } from 'vitest'
import { SKY_FRAG, SKY_VERT, SKY_UNIFORM_NAMES } from './sky.glsl.js'

describe('SKY_FRAG', () => {
  it('비어 있지 않은 셰이더 문자열이다', () => {
    expect(typeof SKY_FRAG).toBe('string')
    expect(SKY_FRAG.length).toBeGreaterThan(500)
  })

  it('컴포넌트가 구동하는 유니폼을 모두 선언한다', () => {
    // 이름이 본문 어딘가에 등장하는 것으로는 부족하다 — 실제 uniform
    // 선언문이 있어야 SkyCanvas가 값을 밀어 넣을 수 있다.
    for (const u of SKY_UNIFORM_NAMES) {
      expect(SKY_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
    }
  })

  it('선언만 하고 쓰지 않는 유니폼이 없다', () => {
    for (const u of SKY_UNIFORM_NAMES) {
      const uses = SKY_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('유니폼 목록에 필요한 채널이 다 들어 있다', () => {
    expect(SKY_UNIFORM_NAMES).toEqual([
      'uRes', 'uTime', 'uYaw', 'uPitch',
      'uAltitude', 'uVelocity', 'uTanFov', 'uPlasma', 'uQuality',
    ])
  })

  it('gl_FragColor에 정확히 한 번 쓴다', () => {
    const matches = SKY_FRAG.match(/gl_FragColor\s*=/g) || []
    expect(matches).toHaveLength(1)
  })

  it('중괄호 짝이 맞는다', () => {
    const open = (SKY_FRAG.match(/{/g) || []).length
    const close = (SKY_FRAG.match(/}/g) || []).length
    expect(open).toBe(close)
  })
})

describe('SKY_VERT', () => {
  it('gl_Position을 설정하고 uv를 넘긴다', () => {
    expect(SKY_VERT).toContain('gl_Position')
    expect(SKY_VERT).toContain('vUv')
  })
})
