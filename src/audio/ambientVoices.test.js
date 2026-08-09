import { describe, it, expect } from 'vitest'
import {
  MASTER_GAIN,
  FADE_IN_S,
  FADE_OUT_S,
  AMBIENT_VOICES,
} from './ambientVoices.js'

describe('마스터 상수', () => {
  it('배경음이 대화를 방해하지 않을 만큼 낮다', () => {
    expect(MASTER_GAIN).toBeGreaterThan(0)
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.06)
  })

  it('페이드가 눈치채지 못할 만큼 길다 — 뚝 끊기면 배경음이 아니라 효과음이 된다', () => {
    expect(FADE_IN_S).toBeGreaterThanOrEqual(1.5)
    expect(FADE_OUT_S).toBeGreaterThanOrEqual(0.8)
  })
})

describe('AMBIENT_VOICES', () => {
  it('성부가 여럿이다 — 하나면 드론이 아니라 삐 소리다', () => {
    expect(AMBIENT_VOICES.length).toBeGreaterThanOrEqual(3)
  })

  it('id가 서로 겹치지 않는다', () => {
    expect(new Set(AMBIENT_VOICES.map((v) => v.id)).size).toBe(AMBIENT_VOICES.length)
  })

  it('모든 성부가 가청 대역 안에 있다', () => {
    for (const v of AMBIENT_VOICES) {
      expect(v.freq).toBeGreaterThan(20)
      expect(v.freq).toBeLessThan(20000)
    }
  })

  it('성부 게인의 합이 1을 넘지 않는다 — 넘으면 마스터 앞에서 클리핑된다', () => {
    const sum = AMBIENT_VOICES.reduce((a, v) => a + v.gain, 0)
    expect(sum).toBeLessThanOrEqual(1)
  })

  it('저음 토대가 있다 — 우주의 "깊이"는 저역에서 나온다', () => {
    expect(AMBIENT_VOICES.some((v) => v.freq < 120)).toBe(true)
  })

  it('성부 주파수가 서로 화음 관계다 — 무작위 주파수는 불협으로 들린다', () => {
    // 가장 낮은 성부를 기준으로 각 성부의 비율이 정수배 ±1% 안에 있는지 본다.
    const base = Math.min(...AMBIENT_VOICES.map((v) => v.freq))
    for (const v of AMBIENT_VOICES) {
      const ratio = v.freq / base
      const nearest = Math.round(ratio)
      expect(Math.abs(ratio - nearest) / nearest).toBeLessThan(0.01)
    }
  })

  it('파형은 Web Audio가 아는 값만 쓴다', () => {
    const OK = ['sine', 'triangle', 'sawtooth', 'square']
    for (const v of AMBIENT_VOICES) expect(OK).toContain(v.type)
  })

  it('필터와 LFO는 있으면 형태가 온전하다', () => {
    for (const v of AMBIENT_VOICES) {
      if (v.filter) {
        expect(['lowpass', 'highpass', 'bandpass']).toContain(v.filter.type)
        expect(v.filter.freq).toBeGreaterThan(0)
        expect(v.filter.q).toBeGreaterThan(0)
      }
      if (v.lfo) {
        expect(['gain', 'filterFreq']).toContain(v.lfo.target)
        // LFO가 20Hz를 넘으면 흔들림이 아니라 음정으로 들린다.
        expect(v.lfo.freq).toBeGreaterThan(0)
        expect(v.lfo.freq).toBeLessThan(1)
        expect(v.lfo.depth).toBeGreaterThan(0)
      }
    }
  })

  it('적어도 한 성부는 LFO로 흔들린다 — 완전히 고정된 드론은 기계음으로 들린다', () => {
    expect(AMBIENT_VOICES.some((v) => v.lfo)).toBe(true)
  })

  it('target이 filterFreq인 LFO는 반드시 필터가 있는 성부에만 붙는다', () => {
    // ambientAudio.js의 배선: target === 'filterFreq' && filter가 있으면
    // filter.frequency로, 그렇지 않으면 voiceGain.gain으로 depth를 흘려보낸다.
    // filter가 없는 성부에 filterFreq LFO를 붙이면 depth(예: 160)가 통째로
    // gain(예: 0.26) 쪽으로 들어가 ±160으로 흔들리는 게인이 되어 마스터 게인과
    // 무관하게 무조건 클리핑된다 — 소리 없이 조용히 깨진다. 오늘 레시피에는
    // 그런 항목이 없지만(filterFreq를 쓰는 유일한 성부인 body는 필터가 있다),
    // 엔진을 고치는 대신 레시피가 애초에 이 조합을 표현하지 못하게 데이터
    // 단에서 막는다.
    for (const v of AMBIENT_VOICES) {
      if (v.lfo?.target === 'filterFreq') {
        expect(v.filter).not.toBeNull()
      }
    }
  })
})
