import { Vector3 } from 'three'

const WORLD_UP = new Vector3(0, 1, 0)
const FALLBACK_UP = new Vector3(0, 0, 1)

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// 두 단위 방향 벡터 사이를 구면 선형보간(대권 경로)한다.
export function slerpDirection(fromDir, toDir, t, target = new Vector3()) {
  const dot = Math.min(1, Math.max(-1, fromDir.dot(toDir)))
  const omega = Math.acos(dot)
  if (omega < 1e-6) {
    return target.copy(fromDir).normalize()
  }
  const sinOmega = Math.sin(omega)
  const wFrom = Math.sin((1 - t) * omega) / sinOmega
  const wTo = Math.sin(t * omega) / sinOmega
  return target
    .set(
      fromDir.x * wFrom + toDir.x * wTo,
      fromDir.y * wFrom + toDir.y * wTo,
      fromDir.z * wFrom + toDir.z * wTo,
    )
    .normalize()
}

// 시네마틱 랜드마크 비행 프레임: 상승(altitude 험프) → 대권 순항 → 도착지
// 상공으로 하강(스펙의 "나선 하강"을 단일 완만한 곡선으로 단순화 — plan 문서
// 참고). radius는 단위구(폴백, radius=1)든 실제 WGS84 미터(타일 모드)든
// 그대로 대입해 쓸 수 있다 — 좌표계에 무관한 순수 함수.
export function computeFlightFrame(fromDir, toDir, progress, radius, options = {}) {
  const { altitudeFactor = 1.6, baseAltitudeFactor = 0.05 } = options
  const t = easeInOutCubic(clamp01(progress))
  const dir = slerpDirection(fromDir, toDir, t)
  const climb = Math.sin(Math.PI * t)
  const altitude = radius * (1 + baseAltitudeFactor + climb * altitudeFactor)
  const position = dir.clone().multiplyScalar(altitude)
  const lookAt = dir.clone().multiplyScalar(radius)
  // 카메라 up: 시선축(반경 방향 dir)에 평행하면 lookAt()이 불안정해진다.
  // 월드 업을 접평면에 투영해 dir에 수직인 접선 up을 만든다. dir이 극점 근처라
  // 투영이 붕괴하면(월드 업과 거의 평행) 다른 기준축으로 대체한다.
  const ref = Math.abs(dir.dot(WORLD_UP)) > 0.999 ? FALLBACK_UP : WORLD_UP
  const up = ref.clone().addScaledVector(dir, -ref.dot(dir)).normalize()
  return { position, lookAt, up }
}
