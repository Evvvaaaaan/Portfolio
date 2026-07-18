import { describe, it, expect } from 'vitest'
import { latLonToDirection } from './sphereFrame.js'

describe('latLonToDirection', () => {
  it('경도 0, 위도 0은 +x 축 방향이다', () => {
    const d = latLonToDirection(0, 0)
    expect(d.x).toBeCloseTo(1, 5)
    expect(d.y).toBeCloseTo(0, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('북극(위도 90)은 +y 축 방향이다', () => {
    const d = latLonToDirection(90, 0)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('항상 단위 벡터를 반환한다', () => {
    const d = latLonToDirection(37.5, 127)
    expect(d.length()).toBeCloseTo(1, 5)
  })

  it('target 인자에 결과를 채워 반환한다', () => {
    const target = { set() { return this }, normalize() { return this } }
    let sawSet = false
    target.set = function (x, y, z) { sawSet = true; this.x = x; this.y = y; this.z = z; return this }
    const result = latLonToDirection(10, 20, target)
    expect(sawSet).toBe(true)
    expect(result).toBe(target)
  })
})
