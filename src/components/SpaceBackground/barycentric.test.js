import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { toBarycentricGeometry } from './barycentric.js'

describe('toBarycentricGeometry', () => {
  it('aBary 속성을 정점 수만큼 추가한다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const out = toBarycentricGeometry(src)
    const pos = out.getAttribute('position')
    const bary = out.getAttribute('aBary')
    expect(bary).toBeTruthy()
    expect(bary.itemSize).toBe(3)
    expect(bary.count).toBe(pos.count)
  })

  it('삼각형마다 세 정점이 (1,0,0),(0,1,0),(0,0,1)을 받는다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const bary = toBarycentricGeometry(src).getAttribute('aBary')
    // 와이어프레임 계산은 삼각형 안에서 세 축이 각각 1이어야 성립한다.
    for (let i = 0; i < bary.count; i += 3) {
      expect([bary.getX(i), bary.getY(i), bary.getZ(i)]).toEqual([1, 0, 0])
      expect([bary.getX(i + 1), bary.getY(i + 1), bary.getZ(i + 1)]).toEqual([0, 1, 0])
      expect([bary.getX(i + 2), bary.getY(i + 2), bary.getZ(i + 2)]).toEqual([0, 0, 1])
    }
  })

  it('비인덱스 지오메트리를 돌려준다 (인덱스가 있으면 정점 공유로 바리센트릭이 깨진다)', () => {
    const out = toBarycentricGeometry(new THREE.SphereGeometry(1, 6, 4))
    expect(out.index).toBeNull()
  })

  it('입력 지오메트리를 변형하지 않는다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const hadIndex = src.index !== null
    toBarycentricGeometry(src)
    expect(src.index !== null).toBe(hadIndex)
    expect(src.getAttribute('aBary')).toBeUndefined()
  })

  it('이미 비인덱스인 지오메트리도 처리한다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4).toNonIndexed()
    const out = toBarycentricGeometry(src)
    expect(out.getAttribute('aBary').count).toBe(out.getAttribute('position').count)
  })
})
