import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  computeArrivalIntensity,
  shouldPlayArrival,
  getArrivalStatus,
  beginArrival,
  concludeArrival,
  resetArrivalForTest,
  ARRIVAL_HOLD_MS,
  ARRIVAL_DURATION_MS,
  ARRIVAL_DONE_EVENT,
} from './arrivalSequence.js'

describe('computeArrivalIntensity', () => {
  it('홀드 구간에서는 최고 속도(1)를 유지한다', () => {
    expect(computeArrivalIntensity(0)).toEqual({ intensity: 1, done: false })
    expect(computeArrivalIntensity(ARRIVAL_HOLD_MS - 1)).toEqual({ intensity: 1, done: false })
  })

  it('감속 구간에서 단조 감소한다', () => {
    const mid1 = computeArrivalIntensity(ARRIVAL_HOLD_MS + (ARRIVAL_DURATION_MS - ARRIVAL_HOLD_MS) * 0.25)
    const mid2 = computeArrivalIntensity(ARRIVAL_HOLD_MS + (ARRIVAL_DURATION_MS - ARRIVAL_HOLD_MS) * 0.75)
    expect(mid1.intensity).toBeGreaterThan(mid2.intensity)
    expect(mid1.intensity).toBeLessThan(1)
    expect(mid2.intensity).toBeGreaterThan(0)
    expect(mid1.done).toBe(false)
  })

  it('지속시간이 끝나면 intensity 0, done true', () => {
    expect(computeArrivalIntensity(ARRIVAL_DURATION_MS)).toEqual({ intensity: 0, done: true })
    expect(computeArrivalIntensity(ARRIVAL_DURATION_MS + 5000)).toEqual({ intensity: 0, done: true })
  })
})

describe('shouldPlayArrival', () => {
  const base = { warpEnabled: true, reducedMotion: false, scrollY: 0, viewportHeight: 800 }

  it('메인 데스크톱 + 모션 허용 + 페이지 상단이면 재생한다', () => {
    expect(shouldPlayArrival(base)).toBe(true)
  })

  it('warpEnabled가 아니면 재생하지 않는다 (모바일/비메인 라우트)', () => {
    expect(shouldPlayArrival({ ...base, warpEnabled: false })).toBe(false)
  })

  it('reduced-motion이면 재생하지 않는다', () => {
    expect(shouldPlayArrival({ ...base, reducedMotion: true })).toBe(false)
  })

  it('스크롤 복원으로 페이지 중간이면 재생하지 않는다', () => {
    expect(shouldPlayArrival({ ...base, scrollY: 400 })).toBe(false)
    expect(shouldPlayArrival({ ...base, scrollY: 399 })).toBe(true)
  })
})

describe('arrival status 머신', () => {
  beforeEach(() => {
    resetArrivalForTest()
    // node 환경에는 window가 없으므로 dispatch 대상 스텁을 만든다.
    globalThis.window = { dispatchEvent: vi.fn() }
    globalThis.Event = class { constructor(type) { this.type = type } }
    return () => {
      delete globalThis.window
      delete globalThis.Event
    }
  })

  it('pending → playing → done 전이와 이벤트 dispatch', () => {
    expect(getArrivalStatus()).toBe('pending')
    beginArrival()
    expect(getArrivalStatus()).toBe('playing')
    concludeArrival('done')
    expect(getArrivalStatus()).toBe('done')
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
    expect(window.dispatchEvent.mock.calls[0][0].type).toBe(ARRIVAL_DONE_EVENT)
  })

  it('pending → skipped 전이도 이벤트를 dispatch한다 (Hero가 기다리지 않도록)', () => {
    concludeArrival('skipped')
    expect(getArrivalStatus()).toBe('skipped')
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
  })
})
