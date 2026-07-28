// 투어 진행도에 연동된 태양. three.js를 import하지 않는 순수 계산이라 WebGL
// 없이 테스트된다 (cloudPath.js / sculptures.js / forms.js와 같은 규칙).
//
// 고정 태양에서는 14개 정거장이 전부 같은 조명이라 서로 구분되지 않았다.
// 진행도에 따라 고도·방위·색을 움직여 새벽에서 황혼까지 한 번의 여정으로 만든다.
//
// 제약: 태양이 화면에 들어오면 안 된다. 카메라는 아래로 약 16도 기울어
// 있고 화면 반각은 수직 25도라, 프레임은 고도 -41도에서 +9도까지를 덮는다.
// 고도를 그 위로 유지하고 방위를 카메라 진행과 벌려두면 안전하다.
// sun.test.js가 실제 웨이포인트에 대해 이 여유각을 검증한다.

const DEG = Math.PI / 180

// t=0 새벽, t=0.45 정오, t=1 황혼. 정오를 중앙보다 살짝 앞에 두어
// 여정의 후반이 길게 저물도록 했다.
const KEYS = [
  { t: 0,    elev: 16, azim: 28, color: [1.0, 0.76, 0.52], intensity: 1.7 },
  { t: 0.28, elev: 44, azim: 44, color: [1.0, 0.91, 0.80], intensity: 2.3 },
  { t: 0.45, elev: 58, azim: 56, color: [1.0, 0.97, 0.93], intensity: 2.6 },
  { t: 0.72, elev: 38, azim: 74, color: [1.0, 0.84, 0.62], intensity: 2.2 },
  { t: 1,    elev: 17, azim: 92, color: [1.0, 0.60, 0.36], intensity: 1.7 },
]

const mix = (a, b, k) => a + (b - a) * k

// 고도·방위(도)를 방향 벡터로. 방위는 +Z에서 +X 쪽으로 도는 각으로,
// sculptures.js가 조각을 놓는 축과 같은 규약이다.
export function dirFrom(elevDeg, azimDeg) {
  const e = elevDeg * DEG
  const a = azimDeg * DEG
  const cosE = Math.cos(e)
  return [cosE * Math.sin(a), Math.sin(e), cosE * Math.cos(a)]
}

export function sunAt(t) {
  const u = Math.min(Math.max(t, 0), 1)
  let i = 0
  while (i < KEYS.length - 2 && u > KEYS[i + 1].t) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const k = b.t === a.t ? 0 : (u - a.t) / (b.t - a.t)

  return {
    dir: dirFrom(mix(a.elev, b.elev, k), mix(a.azim, b.azim, k)),
    color: [
      mix(a.color[0], b.color[0], k),
      mix(a.color[1], b.color[1], k),
      mix(a.color[2], b.color[2], k),
    ],
    intensity: mix(a.intensity, b.intensity, k),
  }
}
