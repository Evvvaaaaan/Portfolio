const DEG = Math.PI / 180

// 위경도(도) → 반지름 r 구면 위 3D 좌표 (three.js Y-up).
// 경도 0 = +x, 동경으로 갈수록 -z 방향으로 감긴다.
export function latLngToVector3(lat, lng, r = 1) {
  const phi = (90 - lat) * DEG    // 극각
  const theta = (lng + 180) * DEG // 방위각
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ]
}

// 구면 위 3D 좌표 → [lat, lng] (도). 경도는 [-180, 180]으로 정규화.
export function vector3ToLatLng(x, y, z) {
  const r = Math.hypot(x, y, z)
  const lat = 90 - Math.acos(y / r) / DEG
  const lng = Math.atan2(z, -x) / DEG - 180
  return [lat, ((lng + 540) % 360) - 180]
}
