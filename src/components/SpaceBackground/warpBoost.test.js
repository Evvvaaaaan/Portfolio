import { describe, it, expect, vi } from 'vitest'
import {
  computeBoostIntensity,
  requestWarpBoost,
  WARP_BOOST_EVENT,
  BOOST_CHARGE_MS,
  BOOST_PEAK_MS,
  BOOST_RELEASE_MS,
  BOOST_PEAK_INTENSITY,
} from './warpBoost.js'

const TOTAL_MS = BOOST_CHARGE_MS + BOOST_PEAK_MS + BOOST_RELEASE_MS

describe('computeBoostIntensity', () => {
  it('가속 구간: 0에서 시작해 ease-in으로 단조 증가한다', () => {
    expect(computeBoostIntensity(0)).toEqual({ intensity: 0, phase: 'charging' })
    const early = computeBoostIntensity(BOOST_CHARGE_MS * 0.25)
    const late = computeBoostIntensity(BOOST_CHARGE_MS * 0.75)
    expect(early.intensity).toBeLessThan(late.intensity)
    expect(late.intensity).toBeLessThan(BOOST_PEAK_INTENSITY)
    expect(late.phase).toBe('charging')
  })

  it('ease-in-cubic: 중간 지점에서 피크의 12.5%다', () => {
    const mid = computeBoostIntensity(BOOST_CHARGE_MS * 0.5)
    expect(mid.intensity).toBeCloseTo(BOOST_PEAK_INTENSITY * 0.125, 5)
  })

  it('피크 구간: 피크 세기를 유지한다', () => {
    expect(computeBoostIntensity(BOOST_CHARGE_MS)).toEqual({
      intensity: BOOST_PEAK_INTENSITY,
      phase: 'peak',
    })
    expect(computeBoostIntensity(BOOST_CHARGE_MS + BOOST_PEAK_MS - 1).phase).toBe('peak')
  })

  it('해제 구간: ease-out으로 단조 감소한다', () => {
    const start = BOOST_CHARGE_MS + BOOST_PEAK_MS
    const early = computeBoostIntensity(start + BOOST_RELEASE_MS * 0.25)
    const late = computeBoostIntensity(start + BOOST_RELEASE_MS * 0.75)
    expect(early.phase).toBe('release')
    expect(early.intensity).toBeGreaterThan(late.intensity)
    expect(late.intensity).toBeGreaterThan(0)
  })

  it('종료: intensity 0, phase done', () => {
    expect(computeBoostIntensity(TOTAL_MS)).toEqual({ intensity: 0, phase: 'done' })
    expect(computeBoostIntensity(TOTAL_MS + 9999)).toEqual({ intensity: 0, phase: 'done' })
  })

  it('음수 경과시간은 가속 시작 전으로 취급한다', () => {
    expect(computeBoostIntensity(-16)).toEqual({ intensity: 0, phase: 'charging' })
  })
})

describe('requestWarpBoost', () => {
  it('WARP_BOOST_EVENT를 window에 dispatch한다', () => {
    globalThis.window = { dispatchEvent: vi.fn() }
    globalThis.Event = class { constructor(type) { this.type = type } }
    try {
      requestWarpBoost()
      expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
      expect(window.dispatchEvent.mock.calls[0][0].type).toBe(WARP_BOOST_EVENT)
    } finally {
      delete globalThis.window
      delete globalThis.Event
    }
  })

  it('window가 없으면 크래시 없이 무시한다 (node 환경)', () => {
    expect(() => requestWarpBoost()).not.toThrow()
  })
})
