import { describe, it, expect, vi } from 'vitest'
import { createAmbientAudio } from './ambientAudio.js'
import { AMBIENT_VOICES, MASTER_GAIN } from './ambientVoices.js'

// 최소 가짜 AudioContext. 실제 소리를 내지 않고 그래프 모양만 기록한다 —
// node 환경에는 Web Audio가 없으므로 이 방식이 유일하게 검증 가능한 길이다.
function fakeContext() {
  const created = { oscillators: [], gains: [], filters: [] }
  const param = (value) => ({
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  })
  const node = (extra = {}) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
  })
  return {
    currentTime: 0,
    destination: node(),
    state: 'running',
    created,
    createOscillator: vi.fn(() => {
      const o = node({
        type: 'sine',
        frequency: param(0),
        detune: param(0),
        start: vi.fn(),
        stop: vi.fn(),
      })
      created.oscillators.push(o)
      return o
    }),
    createGain: vi.fn(() => {
      const g = node({ gain: param(1) })
      created.gains.push(g)
      return g
    }),
    createBiquadFilter: vi.fn(() => {
      const f = node({ type: 'lowpass', frequency: param(0), Q: param(1) })
      created.filters.push(f)
      return f
    }),
  }
}

describe('createAmbientAudio', () => {
  it('만들기만 해서는 아무 노드도 만들지 않는다 — 자동 재생 금지', () => {
    const ctx = fakeContext()
    createAmbientAudio(ctx)
    expect(ctx.createOscillator).not.toHaveBeenCalled()
    expect(ctx.createGain).not.toHaveBeenCalled()
  })

  it('start()가 성부마다 오실레이터를 만들고 시작시킨다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    expect(ctx.created.oscillators.length).toBeGreaterThanOrEqual(AMBIENT_VOICES.length)
    for (const v of AMBIENT_VOICES) {
      expect(ctx.created.oscillators.some((o) => o.frequency.value === v.freq)).toBe(true)
    }
    for (const o of ctx.created.oscillators) expect(o.start).toHaveBeenCalled()
  })

  it('마스터 게인은 0에서 시작해 램프로 올라간다 — 뚝 하고 켜지면 안 된다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    const master = ctx.created.gains[0]
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number))
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      MASTER_GAIN,
      expect.any(Number),
    )
  })

  it('running이 상태를 반영한다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    expect(a.running).toBe(false)
    a.start()
    expect(a.running).toBe(true)
    a.stop()
    expect(a.running).toBe(false)
  })

  it('start()를 두 번 불러도 그래프를 두 벌 만들지 않는다 — 두 배로 시끄러워진다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    const n = ctx.created.oscillators.length
    a.start()
    expect(ctx.created.oscillators.length).toBe(n)
  })

  it('stop()이 램프로 내리고 오실레이터를 멈춘다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    const master = ctx.created.gains[0]
    a.stop()
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number))
    for (const o of ctx.created.oscillators) expect(o.stop).toHaveBeenCalled()
  })

  it('시작한 적 없이 stop()해도 던지지 않는다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    expect(() => a.stop()).not.toThrow()
  })

  it('dispose()가 모든 노드를 끊는다 — 남으면 탭이 계속 오디오를 붙들고 있다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    a.dispose()
    for (const g of ctx.created.gains) expect(g.disconnect).toHaveBeenCalled()
    expect(a.running).toBe(false)
  })
})
