import { describe, it, expect } from 'vitest'
import { TIME_KEYFRAMES, computeGrade, hoursFromDate } from './timeOfDay.js'

const KEYS = [
  'sunCore', 'sunEdge', 'sunLight', 'ambient',
  'rim', 'nebulaA', 'nebulaB', 'nebulaIntensity',
]

// 0xrrggbb 정수색에서 가장 밝은 채널 값(0~255) — "하늘이 밝아지지 않는다"를
// 재는 대리 지표.
const peak = (hex) => Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255)

describe('hoursFromDate', () => {
  it('로컬 시각을 소수 시간으로 바꾼다', () => {
    expect(hoursFromDate(new Date(2026, 0, 1, 0, 0, 0))).toBeCloseTo(0, 6)
    expect(hoursFromDate(new Date(2026, 0, 1, 6, 30, 0))).toBeCloseTo(6.5, 6)
    expect(hoursFromDate(new Date(2026, 0, 1, 23, 45, 0))).toBeCloseTo(23.75, 6)
  })
})

describe('TIME_KEYFRAMES', () => {
  it('심야·여명·한낮·황혼 네 개가 시각 순서대로 있다', () => {
    expect(TIME_KEYFRAMES).toHaveLength(4)
    expect(TIME_KEYFRAMES.map((k) => k.hour)).toEqual([0, 6, 12, 18])
  })

  it('모든 키프레임이 Grade 8개 키를 빠짐없이 갖는다', () => {
    for (const k of TIME_KEYFRAMES) {
      expect(Object.keys(k.grade).sort()).toEqual([...KEYS].sort())
    }
  })
})

describe('computeGrade', () => {
  it('키프레임 시각에서는 그 키프레임 값을 그대로 준다', () => {
    for (const k of TIME_KEYFRAMES) {
      expect(computeGrade(k.hour)).toEqual(k.grade)
    }
  })

  it('24시는 0시와 같다 — 자정에 톤이 튀지 않는다', () => {
    expect(computeGrade(24)).toEqual(computeGrade(0))
  })

  it('키프레임 사이는 두 끝 사이의 값이 된다 (보간이 실제로 일어난다)', () => {
    const mid = computeGrade(3)
    const a = computeGrade(0).nebulaIntensity
    const b = computeGrade(6).nebulaIntensity
    expect(mid.nebulaIntensity).toBeGreaterThan(Math.min(a, b))
    expect(mid.nebulaIntensity).toBeLessThan(Math.max(a, b))
    expect(mid).not.toEqual(computeGrade(0))
    expect(mid).not.toEqual(computeGrade(6))
  })

  it('하루 어느 시각에도 8개 키가 다 있고 색은 24비트 범위 안이다', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const g = computeGrade(h)
      expect(Object.keys(g).sort()).toEqual([...KEYS].sort())
      for (const key of KEYS) {
        if (key === 'nebulaIntensity') continue
        expect(Number.isInteger(g[key])).toBe(true)
        expect(g[key]).toBeGreaterThanOrEqual(0)
        expect(g[key]).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('경계를 넘겨도 하루 안으로 접어 읽는다 — 음수·25시에도 깨지지 않는다', () => {
    expect(computeGrade(-1)).toEqual(computeGrade(23))
    expect(computeGrade(25)).toEqual(computeGrade(1))
  })

  it('검은 우주 제약: 어느 시각에도 성운이 얕게 유지된다', () => {
    // 0.32는 Phase 3이 "별이 묻히지 않는" 값으로 정해 시각 QA까지 마친
    // 기준선이다. 시간대 연출이 이 위로 올라가면 하늘이 뿌예진다.
    for (let h = 0; h < 24; h += 0.25) {
      expect(computeGrade(h).nebulaIntensity).toBeLessThanOrEqual(0.32)
      expect(computeGrade(h).nebulaIntensity).toBeGreaterThan(0)
    }
  })

  it('검은 우주 제약: 앰비언트가 어느 시각에도 어둡게 유지된다', () => {
    // 앰비언트는 야간면이 완전히 죽지 않게 하는 최소 조명이다 — 밝아지면
    // 행성의 낮/밤 경계(터미네이터)가 뭉개져 Phase 3 연출이 무너진다.
    for (let h = 0; h < 24; h += 0.25) {
      expect(peak(computeGrade(h).ambient)).toBeLessThanOrEqual(0x50)
    }
  })

  it('밤이 낮보다 어둡고 차갑다 — 연출의 방향이 실제로 반영된다', () => {
    const night = computeGrade(0)
    const day = computeGrade(12)
    expect(peak(night.ambient)).toBeLessThan(peak(day.ambient))
    // 차갑다 = 파랑이 빨강보다 우세하다.
    expect(night.ambient & 255).toBeGreaterThan((night.ambient >> 16) & 255)
    expect(peak(night.sunLight)).toBeLessThan(peak(day.sunLight))
  })
})
