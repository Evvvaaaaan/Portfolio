// Pure layout + config for the Cloud Gallery tour. No three.js import — the
// `form` key maps to a geometry builder inside the component; here it is data.

// 프로토타입: 14개 실험을 그대로 조각으로 세워 배치를 눈으로 비교한다.
// `transmission` 유리는 오브젝트당 별도 렌더 패스라 비싸서 하나만 둔다.
export const SCULPTURES = [
  { id: 'particle-morph',        form: 'torusKnot', label: 'Particle Morph', caption: '유리 · 아침빛',   material: 'glass'  },
  { id: 'ink-flow',              form: 'wave',      label: 'Ink Flow',       caption: '대리석 · 아침',   material: 'marble' },
  { id: 'neon-raymarch',         form: 'crystal',   label: 'Neon Raymarch',  caption: '거친 금속 · 아침', material: 'metal'  },
  { id: 'wind-atlas',            form: 'sphere',    label: 'Wind Atlas',     caption: '광택 크롬 · 오전', material: 'chrome' },
  { id: 'seismic-echo',          form: 'wave',      label: 'Seismic Echo',   caption: '대리석 · 오전',   material: 'marble' },
  { id: 'hand-conductor',        form: 'crystal',   label: 'Hand Conductor', caption: '거친 금속 · 정오', material: 'metal'  },
  { id: 'voice-bloom',           form: 'torusKnot', label: 'Voice Bloom',    caption: '대리석 · 정오',   material: 'marble' },
  { id: 'poster-lab',            form: 'crystal',   label: 'Poster Lab',     caption: '광택 크롬 · 정오', material: 'chrome' },
  { id: 'solar-system',          form: 'sphere',    label: 'Solar System',   caption: '거친 금속 · 오후', material: 'metal'  },
  { id: 'deep-space',            form: 'crystal',   label: 'Deep Space',     caption: '광택 크롬 · 오후', material: 'chrome' },
  { id: 'earth-explorer',        form: 'sphere',    label: 'Earth Explorer', caption: '대리석 · 황혼',   material: 'marble' },
  { id: 'non-euclidean-portals', form: 'torusKnot', label: 'Non-Euclidean',  caption: '거친 금속 · 황혼', material: 'metal'  },
  { id: 'cosmic-mirror',         form: 'sphere',    label: 'Cosmic Mirror',  caption: '광택 크롬 · 역광', material: 'chrome' },
  { id: 'cloud-gallery',         form: 'wave',      label: 'Cloud Gallery',  caption: '대리석 · 역광',   material: 'marble' },
]

const DEG = Math.PI / 180

// 조각을 직선(+Z) 또는 호 위에 균등 간격으로 놓는다. 두 배치 모두 높이가
// 일정하다 — 구름 셰이더의 슬랩이 월드 Y에 고정(LOW/HIGH)이라 고도가 변하면
// 구름이 어긋난다. 월드 `position`과 정규화된 `tourStop`(t in [0,1])을 붙인다.
export function layout(sculptures = SCULPTURES, opts = {}) {
  const { spacing = 14, height = 0, shape = 'line', sweep = 200 } = opts
  const count = sculptures.length
  const stop = (i) => (count <= 1 ? 0 : i / (count - 1))

  if (shape === 'arc') {
    // 호 길이(= 균등 간격 × 구간 수)와 열림 각도로 반지름이 정해진다.
    const sweepRad = sweep * DEG
    const radius = count <= 1 ? 0 : ((count - 1) * spacing) / sweepRad
    return sculptures.map((s, i) => {
      const a = -sweepRad / 2 + sweepRad * stop(i)
      return {
        ...s,
        position: [radius * Math.sin(a), height, radius * Math.cos(a)],
        tourStop: stop(i),
      }
    })
  }

  return sculptures.map((s, i) => ({
    ...s,
    position: [0, height, i * spacing],
    tourStop: stop(i),
  }))
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-6) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

// cross(tangent, worldUp). 직선(+Z) 배치에서는 [-1,0,0]이 되어 기존
// "카메라를 -X로 민다" 동작과 그대로 일치한다.
function rightOf(t) {
  return normalize([-t[2], 0, t[0]])
}

// 이웃 조각의 중앙차분으로 경로 접선을 구한다. 양 끝은 한쪽 이웃으로 대체.
function tangentAt(laidOut, i) {
  const last = laidOut.length - 1
  const prev = laidOut[Math.max(i - 1, 0)].position
  const next = laidOut[Math.min(i + 1, last)].position
  return normalize(sub(next, prev))
}

// 각 조각을 담는 카메라 웨이포인트. 오프셋을 월드 축이 아니라 **경로 접선**
// 기준으로 잡아야 곡선 배치에서도 카메라가 항상 진행 방향 뒤·위·옆에 선다.
// (월드 -Z 고정이던 이전 구현은 직선 배치에서만 성립했다.)
export function waypoints(laidOut, { back = 7, up = 2.5, side = 4 } = {}) {
  return laidOut.map((s, i) => {
    const t = tangentAt(laidOut, i)
    const r = rightOf(t)
    return {
      position: [
        s.position[0] - t[0] * back + r[0] * side,
        s.position[1] - t[1] * back + r[1] * side + up,
        s.position[2] - t[2] * back + r[2] * side,
      ],
      lookAt: [...s.position],
    }
  })
}
