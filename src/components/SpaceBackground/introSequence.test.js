import { describe, it, expect, beforeEach } from 'vitest'
import {
  INTRO_GRID_MS, INTRO_DRAW_MS, INTRO_IGNITE_MS, INTRO_TOTAL_MS,
  computeIntroState, staggeredBuild, shouldPlayIntro,
  hasSeenIntro, markIntroSeen,
} from './introSequence.js'

describe('인트로 타임라인', () => {
  it('구간 합이 전체 길이와 같다', () => {
    expect(INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS).toBe(INTRO_TOTAL_MS)
  })

  it('시작 시점: 아무것도 그려지지 않았다', () => {
    const s = computeIntroState(0)
    expect(s.phase).toBe('grid')
    expect(s.gridOpacity).toBe(0)
    expect(s.drawProgress).toBe(0)
    expect(s.buildProgress).toBe(0)
    expect(s.done).toBe(false)
  })

  it('그리드 구간이 끝나면 그리드가 완전히 떠 있고 드로잉은 아직이다', () => {
    const s = computeIntroState(INTRO_GRID_MS)
    expect(s.gridOpacity).toBeCloseTo(1, 5)
    expect(s.drawProgress).toBe(0)
  })

  it('드로잉 구간에서 궤도와 빌드가 함께 진행한다', () => {
    const mid = INTRO_GRID_MS + INTRO_DRAW_MS / 2
    const s = computeIntroState(mid)
    expect(s.phase).toBe('draw')
    expect(s.drawProgress).toBeGreaterThan(0)
    expect(s.drawProgress).toBeLessThan(1)
    expect(s.buildProgress).toBeGreaterThan(0)
    // 드로잉 구간이 끝나는 시점의 빌드는 실체화 직전(0.55)까지만 간다.
    expect(s.buildProgress).toBeLessThan(0.55)
  })

  it('드로잉 구간 끝: 궤도는 다 그려졌고 빌드는 실체화 직전이다', () => {
    const s = computeIntroState(INTRO_GRID_MS + INTRO_DRAW_MS)
    expect(s.drawProgress).toBeCloseTo(1, 5)
    expect(s.buildProgress).toBeCloseTo(0.55, 5)
  })

  it('점화 구간에서 빌드가 1로 올라가고 그리드가 걷힌다', () => {
    const s = computeIntroState(INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS / 2)
    expect(s.phase).toBe('ignite')
    expect(s.buildProgress).toBeGreaterThan(0.55)
    expect(s.buildProgress).toBeLessThan(1)
    expect(s.gridOpacity).toBeLessThan(1)
    expect(s.gridOpacity).toBeGreaterThan(0)
  })

  it('끝나면 완전히 실체화되고 그리드는 사라진다', () => {
    const s = computeIntroState(INTRO_TOTAL_MS)
    expect(s.phase).toBe('done')
    expect(s.done).toBe(true)
    expect(s.buildProgress).toBe(1)
    expect(s.gridOpacity).toBe(0)
    expect(s.drawProgress).toBe(1)
  })

  it('타임라인을 넘겨도 종료 상태를 유지한다', () => {
    expect(computeIntroState(INTRO_TOTAL_MS * 5)).toEqual(computeIntroState(INTRO_TOTAL_MS))
  })

  it('음수 경과 시간은 시작 상태로 취급한다', () => {
    expect(computeIntroState(-100)).toEqual(computeIntroState(0))
  })

  it('전 구간에서 값이 유한하고 0~1 범위를 벗어나지 않는다', () => {
    for (let t = 0; t <= INTRO_TOTAL_MS; t += 37) {
      const s = computeIntroState(t)
      for (const v of [s.gridOpacity, s.drawProgress, s.buildProgress]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('staggeredBuild', () => {
  it('뒤쪽 오브젝트일수록 늦게 시작한다', () => {
    const a = staggeredBuild(0.3, 0, 4)
    const b = staggeredBuild(0.3, 3, 4)
    expect(a).toBeGreaterThan(b)
  })

  it('전체가 끝나면 모든 오브젝트가 1이다 (계약: 잔여 청사진 금지)', () => {
    for (let i = 0; i < 4; i++) expect(staggeredBuild(1, i, 4)).toBe(1)
  })

  it('전체가 0이면 모두 0이다', () => {
    for (let i = 0; i < 4; i++) expect(staggeredBuild(0, i, 4)).toBe(0)
  })

  it('count가 1이어도 0으로 나누지 않는다', () => {
    expect(Number.isFinite(staggeredBuild(0.5, 0, 1))).toBe(true)
  })
})

describe('shouldPlayIntro', () => {
  const base = { stageEnabled: true, reducedMotion: false, scrollY: 0, viewportHeight: 900, seen: false }

  it('첫 방문 데스크톱 상단이면 재생한다', () => {
    expect(shouldPlayIntro(base)).toBe(true)
  })

  it('스테이지가 꺼져 있으면(모바일/다른 라우트) 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, stageEnabled: false })).toBe(false)
  })

  it('reduced-motion이면 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true })).toBe(false)
  })

  it('이미 본 세션이면 재생하지 않는다 (사용자 확정: 첫 방문만)', () => {
    expect(shouldPlayIntro({ ...base, seen: true })).toBe(false)
  })

  it('스크롤 복원으로 중간에서 시작하면 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, scrollY: 600 })).toBe(false)
  })
})

describe('세션 기억', () => {
  // vitest 환경이 node라 sessionStorage가 없다 — 구현의 try/catch 경로가 아니라
  // 정상 경로를 검증하려면 최소 스텁이 필요하다.
  beforeEach(() => {
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      clear: () => store.clear(),
    }
  })

  it('처음에는 본 적 없음이다', () => {
    expect(hasSeenIntro()).toBe(false)
  })

  it('표시하면 본 것으로 남는다', () => {
    markIntroSeen()
    expect(hasSeenIntro()).toBe(true)
  })
})
