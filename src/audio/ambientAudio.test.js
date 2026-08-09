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
  // connect/disconnect가 "호출됐다"만 기록하는 빈 vi.fn()이면 무엇을 무엇에
  // 연결했는지, 지금도 연결돼 있는지는 알 수 없다. connectedTo에 실제 대상을
  // 기록해야 "사이클 두 벌이 동시에 destination에 붙어있다" 같은 그래프
  // 위상 버그를 테스트에서 직접 잡아낼 수 있다.
  const node = (extra = {}) => {
    const n = {
      connectedTo: new Set(),
      connect: vi.fn((target) => n.connectedTo.add(target)),
      disconnect: vi.fn(() => n.connectedTo.clear()),
      ...extra,
    }
    return n
  }
  return {
    currentTime: 0,
    destination: node(),
    state: 'running',
    resume: vi.fn(() => Promise.resolve()),
    created,
    createOscillator: vi.fn(() => {
      const o = node({
        type: 'sine',
        frequency: param(0),
        detune: param(0),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
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

  it('컨텍스트가 이미 running이면 start()가 resume()을 부르지 않는다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('컨텍스트가 suspended면 start()가 resume()을 부른다 — 헤드리스 브라우저는 이 상태를 스스로 만들 수 없어 가짜 컨텍스트로 흉내낸다', () => {
    const ctx = fakeContext()
    ctx.state = 'suspended'
    const a = createAmbientAudio(ctx)
    a.start()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('컨텍스트가 interrupted(iPadOS Safari)여도 start()가 resume()을 부른다', () => {
    const ctx = fakeContext()
    ctx.state = 'interrupted'
    const a = createAmbientAudio(ctx)
    a.start()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('resume()이 실패해도 start()는 던지지 않는다 — 실패한 프로미스를 처리하지 않은 채로 두지 않는다', async () => {
    const ctx = fakeContext()
    ctx.state = 'suspended'
    ctx.resume = vi.fn(() => Promise.reject(new Error('already closed')))
    const a = createAmbientAudio(ctx)
    expect(() => a.start()).not.toThrow()
    // resume()이 반환한 프로미스가 실제로 정리되는지(처리되지 않은 거부로
    // 남지 않는지) 확인하려면 이벤트 루프를 한 바퀴 돌려야 한다.
    await Promise.resolve()
    await Promise.resolve()
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

  it('토글을 반복해도 이전 사이클의 마스터가 destination에 남지 않는다 — 남으면 노드가 누적된다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)

    a.start()
    const firstMaster = ctx.created.gains[0]
    expect(firstMaster.connectedTo.has(ctx.destination)).toBe(true)

    a.stop()
    // 페이드가 끝나기 전에는 아직 그래프에 남아있어야 한다 — stop()이 곧바로
    // disconnect하면 페이드 자체가 들리지 않는다.
    expect(firstMaster.disconnect).not.toHaveBeenCalled()

    // 실제로는 osc.stop(t)이 오디오 클럭에서 'ended'를 낸다. 여기서는 stop()이
    // 등록해 둔 그 콜백을 직접 불러 "페이드가 끝났다"를 흉내낸다.
    expect(ctx.created.oscillators[0].onended).toBeTypeOf('function')
    ctx.created.oscillators[0].onended()

    expect(firstMaster.disconnect).toHaveBeenCalledTimes(1)
    expect(firstMaster.connectedTo.has(ctx.destination)).toBe(false)

    const gainsBeforeSecondStart = ctx.created.gains.length
    a.start()
    const secondMaster = ctx.created.gains[gainsBeforeSecondStart]

    // 어느 순간이든 destination에는 마스터가 최대 하나만 붙어 있어야 한다.
    const mastersConnectedToDestination = ctx.created.gains.filter((g) =>
      g.connectedTo.has(ctx.destination),
    )
    expect(mastersConnectedToDestination).toEqual([secondMaster])
  })

  it('stop() 이후 dispose()해도 던지지 않고, 남아있던 onended가 나중에 불려도 다시 끊지 않는다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    a.stop()
    const pendingOnended = ctx.created.oscillators[0].onended
    expect(pendingOnended).toBeTypeOf('function')

    expect(() => a.dispose()).not.toThrow()
    const master = ctx.created.gains[0]
    expect(master.disconnect).toHaveBeenCalledTimes(1)

    // 실제 브라우저라면 dispose()가 onended를 null로 지워서 이 콜백이 다시
    // 불릴 일이 없다. 그래도 어딘가 남아있던 참조가 불리는 경우까지 안전해야
    // 한다 — 두 번째 disconnect가 일어나면 안 된다.
    expect(() => pendingOnended()).not.toThrow()
    expect(master.disconnect).toHaveBeenCalledTimes(1)
  })

  it('그래프 위상: 마스터는 destination에, 각 성부 체인은 마스터에 닿는다', () => {
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()

    const master = ctx.created.gains[0]
    expect(master.connectedTo.has(ctx.destination)).toBe(true)

    // 성부마다 정확히 하나의 voiceGain이 master로 이어진다.
    const connectedToMaster = ctx.created.gains.filter((g) => g.connectedTo.has(master))
    expect(connectedToMaster.length).toBe(AMBIENT_VOICES.length)

    // 필터가 있는 성부는 osc → filter → voiceGain 순서로 이어지므로, 필터는
    // 반드시 어딘가(voiceGain)에 연결돼 있어야 한다.
    for (const f of ctx.created.filters) {
      expect(f.connectedTo.size).toBeGreaterThan(0)
    }
  })
  it('페이드아웃 시작점은 MASTER_GAIN으로 clamp된다 — suspended 컨텍스트가 게인을 1로 읽어도 터지지 않는다', () => {
    // 컨텍스트가 suspended면 오디오 스레드가 한 렌더 quantum도 돌지 않는다.
    // 그 상태에서 AudioParam.value가 예약값(0)을 주는지 GainNode 생성
    // 기본값(1)을 주는지는 구현마다 다르고, 헤드리스 브라우저로는 suspended
    // 컨텍스트를 만들 수 없어 실측으로 판별할 수도 없다. 1이 읽히면 1 → 0
    // 램프가 걸려 컨텍스트가 깨어나는 순간 의도한 레벨의 열 몇 배로 터진다.
    // 여기서는 그 잘못된 읽기를 직접 흉내내고, 램프가 MASTER_GAIN에서
    // 시작하는지 확인한다 — clamp를 지우면 이 테스트가 깨진다.
    const ctx = fakeContext()
    const a = createAmbientAudio(ctx)
    a.start()
    const master = ctx.created.gains[0]
    master.gain.setValueAtTime.mockClear()
    // 렌더된 적 없는 GainNode가 돌려줄 수 있는 최악의 값.
    master.gain.value = 1
    a.stop()
    const [startValue] = master.gain.setValueAtTime.mock.calls.at(-1)
    expect(startValue).toBe(MASTER_GAIN)
    expect(startValue).toBeLessThan(1)
  })
})
