import { describe, it, expect } from 'vitest'
import { createWarpStreaks } from './warpStreaks.js'

describe('createWarpStreaks', () => {
  it('count개의 스트릭이 각각 머리/꼬리 정점 한 쌍을 갖는다', () => {
    const s = createWarpStreaks({ count: 10 })
    expect(s.object3d.geometry.getAttribute('position').count).toBe(20)
    expect(s.object3d.geometry.getAttribute('aTail').count).toBe(20)
    s.dispose()
  })

  it('머리/꼬리 정점은 같은 위치에서 시작한다 (셰이더가 꼬리만 늘림)', () => {
    const s = createWarpStreaks({ count: 3 })
    const pos = s.object3d.geometry.getAttribute('position').array
    for (let i = 0; i < 3; i++) {
      const head = i * 6
      expect(pos[head]).toBe(pos[head + 3])
      expect(pos[head + 1]).toBe(pos[head + 4])
      expect(pos[head + 2]).toBe(pos[head + 5])
    }
    s.dispose()
  })

  it('intensity 0이면 완전히 숨겨진다', () => {
    const s = createWarpStreaks({ count: 4 })
    s.update(0)
    expect(s.object3d.visible).toBe(false)
    expect(s.object3d.material.uniforms.uOpacity.value).toBe(0)
    s.dispose()
  })

  it('intensity가 커지면 보이고 길이/밝기가 커진다', () => {
    const s = createWarpStreaks({ count: 4 })
    s.update(1)
    expect(s.object3d.visible).toBe(true)
    expect(s.object3d.material.uniforms.uStretch.value).toBe(220)
    expect(s.object3d.material.uniforms.uOpacity.value).toBeCloseTo(0.55, 5)
    s.dispose()
  })
})
