// 시간대 라이팅 등급 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 하루를 네 키프레임으로 잡고 원형(24시→0시)으로 보간한다. 색을 three의
// Color가 아니라 0xrrggbb 정수로 다루는 이유: 이 모듈을 node 환경 단위
// 테스트에서 three 없이 그대로 돌리기 위해서다.
//
// 아트 디렉션 제약이 이 표의 상한을 정한다 — 어느 시각에도 하늘이 밝아지면
// 안 되므로, 시간대 차이는 "밝기"가 아니라 "색온도"로만 표현한다. 성운
// 세기는 Phase 3이 시각 QA로 정한 0.32를 절대 넘지 않는다.
export const TIME_KEYFRAMES = [
  {
    // 심야: 가장 차갑고 어둡다. 항성은 식은 듯 붉고, 성운은 남색으로 가라앉는다.
    hour: 0,
    grade: {
      sunCore: 0xffe3ad,
      sunEdge: 0xd9702c,
      sunLight: 0xd8c39a,
      ambient: 0x121a30,
      rim: 0x9fc4ff,
      nebulaA: 0x16224a,
      nebulaB: 0x2a1740,
      nebulaIntensity: 0.3,
    },
  },
  {
    // 여명: 붉은 기가 올라오며 성운이 자줏빛으로 물든다.
    hour: 6,
    grade: {
      sunCore: 0xfff0c6,
      sunEdge: 0xff8f42,
      sunLight: 0xf0cfa2,
      ambient: 0x1d2036,
      rim: 0xc8ceff,
      nebulaA: 0x24264f,
      nebulaB: 0x4a1f45,
      nebulaIntensity: 0.28,
    },
  },
  {
    // 한낮: 가장 또렷하고 중성적이다. 현재(Phase 3) 값이 이 지점의 기준선.
    hour: 12,
    grade: {
      sunCore: 0xfff1c9,
      sunEdge: 0xff9d4a,
      sunLight: 0xffe2b0,
      ambient: 0x1a2438,
      rim: 0xbfe0ff,
      nebulaA: 0x1b2b52,
      nebulaB: 0x3a1f4d,
      nebulaIntensity: 0.32,
    },
  },
  {
    // 황혼: 호박빛에서 자홍으로 넘어간다.
    hour: 18,
    grade: {
      sunCore: 0xffe9b4,
      sunEdge: 0xff7f3a,
      sunLight: 0xf5d0a0,
      ambient: 0x1f1c33,
      rim: 0xd7c2ff,
      nebulaA: 0x1f2450,
      nebulaB: 0x4b1d48,
      nebulaIntensity: 0.31,
    },
  },
]

const DAY = 24

// 0xrrggbb 두 색을 채널별로 선형 보간한다. 라운딩을 채널마다 따로 해야
// 결과가 항상 24비트 안에 떨어진다.
function mixHex(a, b, t) {
  const ch = (shift) => {
    const av = (a >> shift) & 255
    const bv = (b >> shift) & 255
    return Math.round(av + (bv - av) * t) & 255
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function hoursFromDate(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export function computeGrade(hour) {
  // 하루 안으로 접는다 — 음수 시각(-1)도 23시로 읽혀야 자정 경계가 매끄럽다.
  const h = ((hour % DAY) + DAY) % DAY

  const n = TIME_KEYFRAMES.length
  // 첫 키프레임이 0시라 h >= 0은 항상 참 — i는 반드시 한 번은 정해진다.
  let i = 0
  for (let k = 0; k < n; k++) {
    if (h >= TIME_KEYFRAMES[k].hour) i = k
  }
  const from = TIME_KEYFRAMES[i]
  // 마지막 키프레임(18시)은 24시를 건너 첫 키프레임(0시)으로 이어진다.
  const to = TIME_KEYFRAMES[(i + 1) % n]
  const span = (to.hour - from.hour + DAY) % DAY
  const raw = ((h - from.hour + DAY) % DAY) / span
  // smoothstep으로 키프레임 근처를 평평하게 만들어 시각이 바뀌는 순간의
  // 변화율이 눈에 띄지 않게 한다.
  const t = raw * raw * (3 - 2 * raw)

  return {
    sunCore: mixHex(from.grade.sunCore, to.grade.sunCore, t),
    sunEdge: mixHex(from.grade.sunEdge, to.grade.sunEdge, t),
    sunLight: mixHex(from.grade.sunLight, to.grade.sunLight, t),
    ambient: mixHex(from.grade.ambient, to.grade.ambient, t),
    rim: mixHex(from.grade.rim, to.grade.rim, t),
    nebulaA: mixHex(from.grade.nebulaA, to.grade.nebulaA, t),
    nebulaB: mixHex(from.grade.nebulaB, to.grade.nebulaB, t),
    nebulaIntensity:
      from.grade.nebulaIntensity +
      (to.grade.nebulaIntensity - from.grade.nebulaIntensity) * t,
  }
}
