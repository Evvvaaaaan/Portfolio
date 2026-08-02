import { describe, it, expect } from 'vitest'
import { STATIONS, computeRailPose } from './rail.js'
import { PLANETS, planetPosition } from './system.js'

describe('카메라 레일', () => {
  it('정거장은 메인 페이지 슬라이드 6개와 1:1 대응한다', () => {
    expect(STATIONS.map((s) => s.id)).toEqual(['home', 'about', 'skills', 'projects', 'contact', 'footer'])
  })

  it('정수 progress에서는 해당 정거장 포즈를 정확히 돌려준다', () => {
    STATIONS.forEach((st, i) => {
      const pose = computeRailPose(i)
      expect(pose.position).toEqual(st.position)
      expect(pose.target).toEqual(st.target)
    })
  })

  it('행성 정거장의 target은 행성 위치에서 화면 옆으로 밀려난 지점이다 (행성이 화면 중앙을 가리지 않도록)', () => {
    const TARGET_SHIFT = 55
    for (const p of PLANETS) {
      const st = STATIONS.find((s) => s.id === p.id)
      const planetPos = planetPosition(p)
      expect(st.target[1]).toBe(0)
      const shiftDist = Math.hypot(st.target[0] - planetPos[0], st.target[2] - planetPos[2])
      expect(shiftDist).toBeCloseTo(TARGET_SHIFT, 5)
    }
  })

  it('행성 정거장 카메라는 행성에서 적당한 거리에 있다 (너무 붙지도 멀지도 않게)', () => {
    for (const p of PLANETS) {
      const st = STATIONS.find((s) => s.id === p.id)
      const d = Math.hypot(
        st.position[0] - st.target[0],
        st.position[1] - st.target[1],
        st.position[2] - st.target[2],
      )
      expect(d).toBeGreaterThan(p.radius * 3)
      expect(d).toBeLessThan(p.radius * 12)
    }
  })

  it('중간 progress에서 유한한 보간 포즈를 준다', () => {
    for (let p = 0; p <= 5; p += 0.13) {
      const pose = computeRailPose(p)
      for (const v of [...pose.position, ...pose.target]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('범위 밖 progress는 클램프된다', () => {
    expect(computeRailPose(-3)).toEqual(computeRailPose(0))
    expect(computeRailPose(99)).toEqual(computeRailPose(5))
  })

  it('reduced 모드는 가장 가까운 정거장으로 스냅한다', () => {
    expect(computeRailPose(1.4, true)).toEqual(computeRailPose(1))
    expect(computeRailPose(1.6, true)).toEqual(computeRailPose(2))
  })

  it('엡실론 경계: 1e-10 이내는 스냅, 범위 밖은 보간', () => {
    // 엡실론 경계 안 (< 1e-10): 마지막 정거장으로 스냅
    const insideEpsilon = computeRailPose(5 - 1e-11)
    expect(insideEpsilon).toEqual(computeRailPose(5))

    // 엡실론 경계 밖 (> 1e-10): 유한한 보간, 정거장 5와 다름
    const outsideEpsilon = computeRailPose(4.999)
    expect(Number.isFinite(outsideEpsilon.position[0])).toBe(true)
    expect(Number.isFinite(outsideEpsilon.position[1])).toBe(true)
    expect(Number.isFinite(outsideEpsilon.position[2])).toBe(true)
    expect(outsideEpsilon).not.toEqual(computeRailPose(5))
  })
})
