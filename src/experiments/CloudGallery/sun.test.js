import { describe, it, expect } from 'vitest'
import { SCULPTURES, layout, waypoints } from './sculptures'
import { stopT } from './cloudPath'
import { sunAt, dirFrom } from './sun'

const elevOf = (d) => (Math.asin(d[1]) * 180) / Math.PI

describe('dirFrom', () => {
  it('returns unit vectors', () => {
    for (const [e, a] of [[0, 0], [45, 90], [80, 200], [17, 350]]) {
      expect(Math.hypot(...dirFrom(e, a))).toBeCloseTo(1, 9)
    }
  })
})

describe('sunAt', () => {
  it('rises from a low dawn to a high noon and sets again', () => {
    const dawn = elevOf(sunAt(0).dir)
    const noon = elevOf(sunAt(0.45).dir)
    const dusk = elevOf(sunAt(1).dir)
    expect(noon).toBeGreaterThan(dawn + 25)
    expect(noon).toBeGreaterThan(dusk + 25)
  })

  it('warms towards both ends of the tour', () => {
    const warmth = (c) => c[0] - c[2]
    expect(warmth(sunAt(0).color)).toBeGreaterThan(warmth(sunAt(0.45).color))
    expect(warmth(sunAt(1).color)).toBeGreaterThan(warmth(sunAt(0.45).color))
  })

  it('moves continuously and clamps outside [0,1]', () => {
    const a = sunAt(0.5)
    const b = sunAt(0.51)
    const d = Math.hypot(a.dir[0] - b.dir[0], a.dir[1] - b.dir[1], a.dir[2] - b.dir[2])
    expect(d).toBeLessThan(0.05)
    expect(sunAt(-1)).toEqual(sunAt(0))
    expect(sunAt(2)).toEqual(sunAt(1))
  })
})

// 이 스위트가 태양 연동의 핵심 안전장치다. 프레임 반각은 수직 25도이므로
// 여유 40도면 태양이 화면 가장자리에도 닿지 않는다. 배치나 태양 궤도를
// 나중에 손볼 때 이 테스트가 블로우아웃 재발을 막는다.
describe('sun stays out of frame along the arc tour', () => {
  const laid = layout(SCULPTURES, { spacing: 16, height: 0, shape: 'arc', sweep: 200 })
  const wps = waypoints(laid, { back: 8, up: 2.6, side: -4.5 })

  it('keeps at least 40 degrees between camera forward and the sun', () => {
    wps.forEach((w, i) => {
      const f = [
        w.lookAt[0] - w.position[0],
        w.lookAt[1] - w.position[1],
        w.lookAt[2] - w.position[2],
      ]
      const len = Math.hypot(...f)
      const d = f.map((v) => v / len)
      const s = sunAt(stopT(i, wps.length)).dir
      const dot = d[0] * s[0] + d[1] * s[1] + d[2] * s[2]
      const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
      expect(angle).toBeGreaterThan(40)
    })
  })

  it('never drops the sun below the top edge of the frame', () => {
    // 프레임은 고도 -41도 ~ +9도를 덮는다. 태양 고도가 그보다 높으면
    // 방위와 무관하게 화면 밖이다.
    for (let i = 0; i <= 20; i++) {
      expect(elevOf(sunAt(i / 20).dir)).toBeGreaterThan(12)
    }
  })
})
