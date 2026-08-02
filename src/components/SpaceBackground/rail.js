// 스크롤 진행도(0~5) → 카메라 포즈. 순수 모듈 (three 미의존).
// 위치는 Catmull-Rom으로 부드럽게 잇고, target(시선)은 정거장 사이를
// smoothstep 선형 보간한다 — 시선까지 스플라인을 태우면 중간에 아무것도
// 없는 허공을 훑는 구간이 생겨 멀미를 유발했다.
import { PLANETS, planetPosition } from './system.js'

// 행성 정거장: 카메라를 행성의 "태양 반대쪽 + 옆" 오프셋에 두어
// 행성 뒤로 태양·안쪽 궤도가 배경으로 걸리게 한다 (깊이감).
// 높이(y)를 조금 주어 궤도면을 비스듬히 내려다본다.
// 행성을 화면 중앙에서 옆으로 밀어내는 시선(target) 오프셋 — 도킹 패널 자리 확보.
// 카메라를 접선 방향으로 트는 것만으로는 lookAt이 여전히 행성을 정조준하므로
// 화면 중앙에 그대로 렌더된다 — target 자체를 옆으로 옮겨야 행성이 밀려난다.
// 부호는 카메라 오프셋과 반대(-t) — 같은 방향(+t)으로 밀면 시선이 태양을
// 향해 태양+글로우가 화면 절반을 압도한다 (브라우저 시각 QA로 확인됨).
const TARGET_SHIFT = 55

function planetStation(id, dist, height) {
  const p = PLANETS.find((pl) => pl.id === id)
  const [x, , z] = planetPosition(p)
  const len = Math.hypot(x, z) || 1
  const ox = x / len
  const oz = z / len
  // XZ 평면에서 바깥 방향에 수직인 접선 방향 — 카메라는 +t 쪽으로 틀어
  // 옆에서 보게 하고, 시선(target)은 반대인 -t 쪽으로 밀어낸다. 같은
  // 방향으로 밀면 시선이 태양 쪽을 향해 태양+글로우가 화면을 압도하고
  // 행성은 프레임 밖으로 밀려났다 (브라우저 시각 QA에서 확인) — 반대
  // 방향이어야 행성이 화면 중앙이 아닌 한쪽으로 치우쳐 렌더된다 (도킹 패널 자리).
  const tx = -oz
  const tz = ox
  return {
    id,
    position: [
      x + ox * dist + tx * dist * 0.55,
      height,
      z + oz * dist + tz * dist * 0.55,
    ],
    target: [x - tx * TARGET_SHIFT, 0, z - tz * TARGET_SHIFT],
  }
}

export const STATIONS = [
  { id: 'home', position: [0, 80, 430], target: [0, 0, 0] },
  planetStation('about', 90, 28),
  planetStation('skills', 110, 34),
  planetStation('projects', 105, 30),
  planetStation('contact', 85, 26),
  // footer: 높이 올려 전체 시스템 조망 — "여정의 끝, 지도 한눈에".
  { id: 'footer', position: [0, 300, 560], target: [0, 0, 0] },
]

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

export function computeRailPose(progress, reduced = false) {
  const n = STATIONS.length
  const p = Math.min(Math.max(progress, 0), n - 1)
  if (reduced) {
    const s = STATIONS[Math.round(p)]
    return { position: [...s.position], target: [...s.target] }
  }

  // t=1 경계(마지막 정거장 진입)에서 catmullRom 항 합산이 대수적으로는 2*p2로
  // 소거되지만 부동소수 합산에서는 파국적 소거(catastrophic cancellation)로 오차가 남는다.
  // t=0 경로(정거장 0~4)는 IEEE 754에서 비트 정확하므로, 이 분기가 실제로 막는 것은
  // 마지막 정거장 도착뿐이다 (i 클램프에서 t=1이 된다).
  const isIntegerProgress = Math.abs(p - Math.round(p)) < 1e-10
  if (isIntegerProgress) {
    const s = STATIONS[Math.round(p)]
    return { position: [...s.position], target: [...s.target] }
  }

  const i = Math.min(Math.floor(p), n - 2)
  const t = p - i
  const at = (k) => STATIONS[Math.min(Math.max(k, 0), n - 1)]
  const position = [0, 1, 2].map((axis) =>
    catmullRom(
      at(i - 1).position[axis],
      at(i).position[axis],
      at(i + 1).position[axis],
      at(i + 2).position[axis],
      t,
    ),
  )
  const s = t * t * (3 - 2 * t)
  const target = [0, 1, 2].map(
    (axis) => at(i).target[axis] + (at(i + 1).target[axis] - at(i).target[axis]) * s,
  )
  return { position, target }
}
