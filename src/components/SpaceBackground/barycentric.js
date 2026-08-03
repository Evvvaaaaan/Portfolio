// 와이어프레임을 프래그먼트 셰이더에서 그리려면 각 삼각형 안에서 "변까지의
// 거리"를 알아야 한다. 바리센트릭 좌표가 그 거리를 준다 — 세 정점에
// (1,0,0),(0,1,0),(0,0,1)을 심어두면 보간된 값의 최솟값이 곧 가장 가까운
// 변까지의 거리다.
//
// 인덱스 지오메트리는 정점을 삼각형끼리 공유하므로 한 정점에 서로 다른
// 바리센트릭 값을 줄 수 없다 — 반드시 비인덱스로 펼친 뒤 심는다.
import * as THREE from 'three'

export function toBarycentricGeometry(geometry) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const count = geo.getAttribute('position').count
  const bary = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // i % 3 == 0 → (1,0,0), 1 → (0,1,0), 2 → (0,0,1)
    bary[i * 3 + (i % 3)] = 1
  }
  geo.setAttribute('aBary', new THREE.BufferAttribute(bary, 3))
  return geo
}
