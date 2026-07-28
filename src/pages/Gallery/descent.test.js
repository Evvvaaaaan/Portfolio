import { describe, it, expect } from 'vitest'
import {
  computeDescent,
  landedState,
  DESCENT_DURATION_MS,
  ACCEL_END,
  BRAKE_START,
  PANEL_REVEAL_START,
} from './descent.js'

const at = (p) => computeDescent(DESCENT_DURATION_MS * p)

describe('computeDescent — 시작과 끝', () => {
  it('0ms에서는 우주 한가운데, 아직 멈춰 있다', () => {
    const s = computeDescent(0)
    expect(s.progress).toBe(0)
    expect(s.altitude).toBeCloseTo(1, 5)
    expect(s.velocity).toBeCloseTo(0, 5)
    expect(s.panelReveal).toBe(0)
    expect(s.done).toBe(false)
  })

  it('끝나면 착지 상태로 수렴한다', () => {
    const s = computeDescent(DESCENT_DURATION_MS)
    expect(s.altitude).toBeCloseTo(0, 5)
    expect(s.velocity).toBeCloseTo(0, 5)
    expect(s.panelReveal).toBeCloseTo(1, 5)
    expect(s.done).toBe(true)
  })

  it('타임라인을 지나도 값이 발산하지 않는다', () => {
    const s = computeDescent(DESCENT_DURATION_MS * 10)
    expect(s).toEqual(computeDescent(DESCENT_DURATION_MS))
  })

  it('음수 시간은 시작 상태로 취급한다', () => {
    expect(computeDescent(-500)).toEqual(computeDescent(0))
  })
})

describe('computeDescent — 속도 곡선', () => {
  it('가속 구간에서 단조 증가한다', () => {
    expect(at(ACCEL_END * 0.25).velocity).toBeLessThan(at(ACCEL_END * 0.75).velocity)
  })

  it('순항 구간은 최고 속도를 유지한다', () => {
    expect(at((ACCEL_END + BRAKE_START) / 2).velocity).toBeCloseTo(1, 5)
    expect(at(ACCEL_END).velocity).toBeCloseTo(1, 5)
  })

  it('제동 구간에서 급격히 떨어진다', () => {
    const early = at(BRAKE_START + 0.05).velocity
    const late = at(BRAKE_START + 0.2).velocity
    expect(early).toBeLessThan(1)
    expect(late).toBeLessThan(early)
    // 5제곱 감쇠 — 제동 중반이면 이미 대부분 죽어 있어야 한다
    expect(at((BRAKE_START + 1) / 2).velocity).toBeLessThan(0.05)
  })

  it('속도는 항상 0..1 범위다', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const v = at(p).velocity
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('computeDescent — 고도', () => {
  it('하강 본구간에서 단조 감소한다', () => {
    let prev = Infinity
    for (let p = 0; p <= 0.85; p += 0.02) {
      const a = at(p).altitude
      expect(a).toBeLessThanOrEqual(prev + 1e-9)
      prev = a
    }
  })

  it('착지 직전 살짝 지나쳤다 되돌아온다', () => {
    let min = Infinity
    for (let p = 0.85; p <= 1; p += 0.005) min = Math.min(min, at(p).altitude)
    expect(min).toBeLessThan(0)
    expect(min).toBeGreaterThan(-0.1)
    expect(at(1).altitude).toBeCloseTo(0, 5)
  })
})

describe('computeDescent — 연출 채널', () => {
  it('시야각은 속도를 따라 넓어졌다 돌아온다', () => {
    expect(computeDescent(0).fovDeg).toBeCloseTo(75, 5)
    expect(at((ACCEL_END + BRAKE_START) / 2).fovDeg).toBeGreaterThan(110)
    expect(computeDescent(DESCENT_DURATION_MS).fovDeg).toBeCloseTo(75, 5)
  })

  it('플라즈마는 대기권 구간에서만 타오른다', () => {
    expect(at(0.1).plasma).toBeCloseTo(0, 5)
    expect(at(0.62).plasma).toBeGreaterThan(0.9)
    expect(at(1).plasma).toBeCloseTo(0, 5)
  })

  it('셰이크는 플라즈마보다 좁고 약하다', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const s = at(p)
      expect(s.shake).toBeLessThanOrEqual(s.plasma + 1e-9)
      expect(s.shake).toBeGreaterThanOrEqual(0)
    }
  })

  it('패널은 마지막 3분의 1에서만 드러난다', () => {
    expect(at(PANEL_REVEAL_START - 0.01).panelReveal).toBe(0)
    expect(at(PANEL_REVEAL_START + 0.01).panelReveal).toBeGreaterThan(0)
    expect(at(1).panelReveal).toBeCloseTo(1, 5)
  })
})

describe('landedState', () => {
  it('타임라인 끝과 같은 값이다', () => {
    expect(landedState()).toEqual(computeDescent(DESCENT_DURATION_MS))
  })
})
