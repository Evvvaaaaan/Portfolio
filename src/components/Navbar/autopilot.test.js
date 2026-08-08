import { describe, it, expect } from 'vitest'
import {
  TOUR_LEG_MS,
  TOUR_DWELL_MS,
  TOUR_STEP_MS,
  TOUR_TOTAL_MS,
  buildTourSchedule,
  tourTotalMs,
} from './autopilot.js'

describe('투어 상수', () => {
  it('한 정거장 = 이동 + 정차', () => {
    expect(TOUR_STEP_MS).toBe(TOUR_LEG_MS + TOUR_DWELL_MS)
  })

  it('기본 6개 정거장 투어가 스펙이 못박은 30초다', () => {
    expect(TOUR_TOTAL_MS).toBe(30000)
    expect(tourTotalMs()).toBe(TOUR_TOTAL_MS)
  })
})

describe('buildTourSchedule', () => {
  it('정거장 수만큼 스텝을 만들고 0부터 순서대로 방문한다', () => {
    const s = buildTourSchedule()
    expect(s).toHaveLength(6)
    expect(s.map((x) => x.stationIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('첫 스텝은 0ms에 시작하고, 시작 시각이 단조 증가한다', () => {
    const s = buildTourSchedule()
    expect(s[0].startMs).toBe(0)
    for (let i = 1; i < s.length; i++) {
      expect(s[i].startMs).toBeGreaterThan(s[i - 1].startMs)
    }
  })

  it('마지막 스텝이 끝나는 시각이 곧 투어 총 길이다', () => {
    const s = buildTourSchedule()
    const last = s[s.length - 1]
    expect(last.startMs + last.legMs + last.dwellMs).toBe(tourTotalMs())
  })

  it('reduced-motion이면 이동을 컷으로 바꾼다 — legMs=0, 정차는 그대로', () => {
    const s = buildTourSchedule({ reduced: true })
    for (const step of s) {
      expect(step.legMs).toBe(0)
      expect(step.dwellMs).toBe(TOUR_DWELL_MS)
    }
    expect(tourTotalMs({ reduced: true })).toBe(6 * TOUR_DWELL_MS)
  })

  it('정거장 수가 달라져도 식이 따라온다 — STATIONS가 늘어도 하드코딩이 깨지지 않는다', () => {
    const s = buildTourSchedule({ stationCount: 3 })
    expect(s).toHaveLength(3)
    expect(tourTotalMs({ stationCount: 3 })).toBe(3 * TOUR_STEP_MS)
  })
})
