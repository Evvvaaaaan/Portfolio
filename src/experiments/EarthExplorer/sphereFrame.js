import { Vector3 } from 'three'

const DEG = Math.PI / 180

// 위경도(도) → 단위구 위 3D 방향 벡터 (three.js Y-up). 폴백 지구본, 랜드마크
// 카메라 프레이밍에 쓰인다. 실제 Google 3D Tiles의 WGS84 좌표계와는 별개다 —
// 그쪽은 tiles.ellipsoid.getCartographicToPosition을 직접 쓴다 (Task 4).
export function latLonToDirection(latDeg, lonDeg, target = new Vector3()) {
  const phi = (90 - latDeg) * DEG
  const theta = (lonDeg + 180) * DEG
  return target
    .set(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    .normalize()
}
