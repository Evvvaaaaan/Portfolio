// 스크롤 진행값 0.00 → 1.00 하나가 카메라·부품 분해·오버레이 셰이더·DOM 카피를
// 전부 구동한다. 이 파일이 그 진행값의 정의역을 소유한다.

export const PHASES = [
  {
    num: '01',
    name: 'Silhouette',
    from: 0.0,
    to: 0.18,
    align: 'center',
    kicker: 'Deep Space Network',
    head: '신호를 잡았습니다',
    sub: '별빛 사이에 실루엣 하나. 아직 무엇인지 알 수 없습니다.',
  },
  {
    num: '02',
    name: 'Approach',
    from: 0.18,
    to: 0.38,
    align: 'end',
    kicker: 'Range 4.2 AU · closing',
    head: '가까워질수록 재질이 드러납니다',
    sub: '조명은 전부 환경맵이 담당합니다. 골드 MLI 표면에 반사가 닿기 시작하는 구간입니다.',
  },
  {
    num: '03',
    name: 'Decomposition',
    from: 0.38,
    to: 0.62,
    align: 'start',
    kicker: 'Component breakdown',
    head: '여섯 개로 나뉩니다',
    sub: '부품마다 실제 제원과 대응 프로젝트가 함께 붙습니다.',
    showParts: true,
  },
  {
    num: '04',
    name: 'Instrument',
    from: 0.62,
    to: 0.8,
    align: 'end',
    kicker: 'HGA · 3.66 m',
    head: '한 부품만 남깁니다',
    sub: '고이득 안테나 클로즈업. 나머지 부품은 물러납니다.',
  },
  {
    num: '05',
    name: 'Reassembly',
    from: 0.8,
    to: 0.94,
    align: 'start',
    kicker: 'Systems nominal',
    head: '다시 하나로',
    sub: '분해의 역재생이 아니라, 부품마다 다른 이징으로 되돌아옵니다.',
  },
  {
    num: '06',
    name: 'Departure',
    from: 0.94,
    to: 1.0,
    align: 'center',
    kicker: 'Outbound',
    head: '보내줍니다',
    sub: '',
    cta: true,
  },
]

// 카메라와 오버레이의 키프레임. dist/azim/elev는 원점을 도는 구면 좌표,
// ty는 바라보는 지점의 기본 높이다.
const CAM = [
  { t: 0.0, dist: 46, azim: -0.95, elev: 0.22, ty: 0, explode: 0, focus: 0, vig: 0.95, dark: 0.58 },
  { t: 0.18, dist: 26, azim: -0.55, elev: 0.16, ty: 0, explode: 0, focus: 0, vig: 0.78, dark: 0.3 },
  { t: 0.38, dist: 12.5, azim: 0.12, elev: 0.1, ty: 0.1, explode: 0, focus: 0, vig: 0.58, dark: 0.1 },
  { t: 0.62, dist: 20.0, azim: 0.62, elev: 0.34, ty: 0.2, explode: 1, focus: 0, vig: 0.48, dark: 0.05 },
  { t: 0.8, dist: 6.6, azim: 0.3, elev: 0.26, ty: 0.2, explode: 1, focus: 1, vig: 0.44, dark: 0.26 },
  { t: 0.94, dist: 13.0, azim: -0.25, elev: 0.2, ty: 0.1, explode: 0, focus: 0, vig: 0.56, dark: 0.1 },
  { t: 1.0, dist: 34, azim: -0.62, elev: 0.28, ty: 0.3, explode: 0, focus: 0, vig: 0.92, dark: 0.52 },
]

const CAM_KEYS = ['dist', 'azim', 'elev', 'ty', 'explode', 'focus', 'vig', 'dark']

const smoothstep = (u) => u * u * (3 - 2 * u)

// 진행값 t에서의 카메라/오버레이 상태. `out`을 넘기면 매 프레임 객체를
// 새로 만들지 않는다.
export function sampleCam(t, out = {}) {
  const p = t < 0 ? 0 : t > 1 ? 1 : t
  let i = 0
  while (i < CAM.length - 2 && p > CAM[i + 1].t) i++
  const a = CAM[i]
  const b = CAM[i + 1]
  const span = b.t - a.t
  const u = span <= 0 ? 0 : smoothstep((p - a.t) / span)
  for (const k of CAM_KEYS) out[k] = a[k] + (b[k] - a[k]) * u
  return out
}

// 페이즈 카피의 불투명도. 자기 구간의 앞뒤 18%에서 페이드한다.
//
// 시퀀스의 양 끝은 예외다. 첫 페이즈에 페이드인을 걸면 스크롤하기 전 첫 화면이
// 빈 채로 열리고, 마지막 페이즈에 페이드아웃을 걸면 끝까지 내렸을 때 CTA가
// 사라진다.
export function phaseOpacity(phase, t) {
  const span = phase.to - phase.from
  const local = (t - phase.from) / span
  if (local < -0.15 || local > 1.15) return 0
  const fade = 0.18
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
  const inA = phase.from <= 0 ? 1 : clamp01(local / fade)
  const outA = phase.to >= 1 ? 1 : clamp01((1 - local) / fade)
  return Math.min(inA, outA)
}

// 각 페이즈가 차지하는 스크롤 높이(뷰포트 배수). 구간 폭에 비례시켜
// DOM 위치와 진행값이 정확히 일치하게 한다.
export const TOTAL_VH = 650
