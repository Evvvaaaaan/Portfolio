// 첫 방문 인트로 타임라인 (순수 모듈). 항성계가 청사진으로 그려진 뒤
// 점화되어 실체화되기까지를 담당하고, 끝나면 기존 도착 워프로 넘긴다.
//
// 재생 정책(사용자 확정): 첫 방문만 풀 인트로. 재방문은 도착 워프만.

export const INTRO_GRID_MS = 500
export const INTRO_DRAW_MS = 1100
export const INTRO_IGNITE_MS = 300
export const INTRO_TOTAL_MS = INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS

// 드로잉 구간이 끝나는 시점의 빌드 진행도. blueprint.glsl.js가 0.55부터
// 실체 메시에 자리를 내주기 시작하므로, 그 직전까지만 올려두고 점화 구간에서
// 단숨에 1로 밀어 올린다 — 두 파일이 공유하는 상수라 함께 수정할 것.
const BUILD_AT_DRAW_END = 0.55

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)
// ease-out cubic: 그리기 시작은 빠르고 끝은 부드럽게 멎는다.
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

export function computeIntroState(elapsedMs) {
  const t = Math.max(elapsedMs, 0)

  if (t >= INTRO_TOTAL_MS) {
    return { phase: 'done', gridOpacity: 0, drawProgress: 1, buildProgress: 1, done: true }
  }

  if (t < INTRO_GRID_MS) {
    return {
      phase: 'grid',
      gridOpacity: clamp01(t / INTRO_GRID_MS),
      drawProgress: 0,
      buildProgress: 0,
      done: false,
    }
  }

  const afterGrid = t - INTRO_GRID_MS
  if (afterGrid < INTRO_DRAW_MS) {
    const k = clamp01(afterGrid / INTRO_DRAW_MS)
    return {
      phase: 'draw',
      gridOpacity: 1,
      drawProgress: easeOut(k),
      buildProgress: k * BUILD_AT_DRAW_END,
      done: false,
    }
  }

  const k = clamp01((afterGrid - INTRO_DRAW_MS) / INTRO_IGNITE_MS)
  return {
    phase: 'ignite',
    // 점화와 함께 설계도를 걷는다 — 실체가 드러나는 동안 격자가 남아 있으면
    // "아직 도면"으로 읽힌다.
    gridOpacity: 1 - k,
    drawProgress: 1,
    buildProgress: BUILD_AT_DRAW_END + (1 - BUILD_AT_DRAW_END) * k,
    done: false,
  }
}

// 오브젝트별 지연. 전부 동시에 실체화되면 "한 장면이 전환됐다"로 보이고,
// 조금씩 어긋나야 "하나씩 조립된다"로 읽힌다.
export function staggeredBuild(globalBuild, index, count) {
  const lag = (index / Math.max(count, 1)) * 0.35
  return clamp01((globalBuild - lag) / (1 - lag))
}

export function shouldPlayIntro({ stageEnabled, reducedMotion, scrollY, viewportHeight, seen }) {
  if (!stageEnabled || reducedMotion || seen) return false
  // 스크롤 복원으로 페이지 중간에서 시작한 경우엔 인트로가 맥락을 잃는다.
  return scrollY < viewportHeight * 0.5
}

const SEEN_KEY = 'evanSystemIntroSeen'

export function hasSeenIntro() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 프라이빗 모드 등 — 인트로가 한 번 더 나오는 정도의 손해라 무시한다 */
  }
}
