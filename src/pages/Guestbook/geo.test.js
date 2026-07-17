import { describe, it, expect } from 'vitest'
import { latLngToVector3, vector3ToLatLng } from './geo.js'

describe('latLngToVector3', () => {
  it('경도 0, 위도 0은 +x 축 위의 점이 된다', () => {
    const [x, y, z] = latLngToVector3(0, 0)
    expect(x).toBeCloseTo(1, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('북극(위도 90)은 +y 축 위의 점이 된다', () => {
    const [x, y, z] = latLngToVector3(90, 0)
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(1, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('반지름 인자를 곱한 크기의 벡터를 반환한다', () => {
    const [x, y, z] = latLngToVector3(37.5, 127, 2)
    expect(Math.hypot(x, y, z)).toBeCloseTo(2, 5)
  })
})

describe('vector3ToLatLng (라운드트립)', () => {
  const cases = [
    [37.5, 127],    // 서울
    [-33.9, 151.2], // 시드니
    [52.5, 13.4],   // 베를린
    [0, -180],      // 날짜변경선
    [-89, 45],      // 남극 근처
  ]
  it.each(cases)('(%f, %f) 좌표가 변환 후 복원된다', (lat, lng) => {
    const [x, y, z] = latLngToVector3(lat, lng)
    const [rlat, rlng] = vector3ToLatLng(x, y, z)
    expect(rlat).toBeCloseTo(lat, 4)
    // 경도는 -180/180이 같은 지점 — 정규화 차이를 허용
    const dLng = Math.abs(((rlng - lng + 540) % 360) - 180)
    expect(dLng).toBeCloseTo(0, 4)
  })

  it('반지름이 1이 아닌 벡터도 올바른 위경도를 반환한다', () => {
    const [x, y, z] = latLngToVector3(37.5, 127, 3)
    const [rlat, rlng] = vector3ToLatLng(x, y, z)
    expect(rlat).toBeCloseTo(37.5, 4)
    expect(rlng).toBeCloseTo(127, 4)
  })
})
