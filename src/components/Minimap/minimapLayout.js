// 미니맵 좌표 변환 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 항성계를 위에서 내려다본 XZ 평면을 0~100 정사각 뷰박스에 담는다.
import { PLANETS, planetPosition } from '../SpaceBackground/system.js'
import { STATIONS, computeRailPose } from '../SpaceBackground/rail.js'

// 뷰박스 한 변(SVG 사용자 단위). 정사각이라 종횡비 왜곡이 없다.
export const MAP_SIZE = 100

// 지도가 담아야 하는 월드 반경. 기준은 가장 바깥 궤도(425)가 아니라 가장 먼
// 정거장인 footer 카메라(z=560)다 — 마커가 지도 밖으로 나가면 "현재 위치"라는
// 미니맵의 유일한 기능이 깨진다. 600은 거기에 약간의 여백을 더한 값이다.
export const WORLD_RADIUS = 600

const SCALE = MAP_SIZE / 2 / WORLD_RADIUS

export const SUN_POINT = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }

// 높이(y)는 버린다 — 위에서 내려다본 평면도이므로 XZ만 쓴다.
export function projectToMap([x, , z]) {
  return { x: MAP_SIZE / 2 + x * SCALE, y: MAP_SIZE / 2 + z * SCALE }
}

export const MAP_ORBITS = PLANETS.map((p) => ({
  id: p.id,
  r: p.orbitRadius * SCALE,
}))

// three의 숫자 색(0x6db5ff)을 SVG fill이 그대로 먹을 수 있는 형태로.
function toHex(color) {
  return '#' + color.toString(16).padStart(6, '0')
}

// 지도 버튼이 되는 정거장. footer는 우주에 대응하는 지형지물이 없어 버튼을
// 두지 않는다 — 대신 카메라 마커가 footer 구간에도 계속 따라간다.
export const MAP_STATIONS = [
  {
    id: 'home',
    stationIndex: STATIONS.findIndex((s) => s.id === 'home'),
    color: '#ffd9a0',
    ...SUN_POINT,
  },
  ...PLANETS.map((p) => ({
    id: p.id,
    stationIndex: STATIONS.findIndex((s) => s.id === p.id),
    color: toHex(p.color),
    ...projectToMap(planetPosition(p)),
  })),
]

export function cameraMarker(progress, reduced = false) {
  return projectToMap(computeRailPose(progress, reduced).position)
}
