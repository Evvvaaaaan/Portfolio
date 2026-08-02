// Evan System 월드 레이아웃 (순수 데이터 — three 미의존, 단위 테스트 대상).
// 행성은 XZ 평면 궤도 위 고정 방위각에 놓인다. 공전시키지 않는 이유:
// 카메라 레일 정거장이 행성 위치를 참조하므로, 움직이면 스크롤을 멈춘
// 방문자의 프레이밍이 흘러가 버린다. 생동감은 자전·위성 공전이 담당한다.
export const SUN_RADIUS = 42

export const PLANETS = [
  // color는 각 섹션의 시각 정체성 — about 블루는 사이트 기본 액센트 계열,
  // projects 앰버는 프로젝트 카드 accent들의 중간톤.
  { id: 'about',    color: 0x6db5ff, radius: 15, orbitRadius: 150, azimuthDeg: 205 },
  { id: 'skills',   color: 0x34d399, radius: 19, orbitRadius: 235, azimuthDeg: 330, ring: true },
  { id: 'projects', color: 0xf59e0b, radius: 17, orbitRadius: 330, azimuthDeg: 75 },
  { id: 'contact',  color: 0xf472b6, radius: 13, orbitRadius: 425, azimuthDeg: 245 },
]

export function planetPosition(planet) {
  const a = (planet.azimuthDeg * Math.PI) / 180
  return [Math.cos(a) * planet.orbitRadius, 0, Math.sin(a) * planet.orbitRadius]
}
