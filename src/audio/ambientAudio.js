// 앰비언트 드론 엔진. AudioContext를 인자로 받는 이유 두 가지:
// (1) 브라우저는 사용자 제스처 안에서 만든 컨텍스트만 소리를 내준다 —
//     컨텍스트 생성 시점은 호출부(클릭 핸들러)가 정해야 한다.
// (2) node 단위 테스트에서 가짜 컨텍스트를 넣어 그래프 모양을 검증할 수 있다.
import { AMBIENT_VOICES, MASTER_GAIN, FADE_IN_S, FADE_OUT_S } from './ambientVoices.js'

export function createAmbientAudio(ctx) {
  // 사이클(cycle) = 한 번의 start()가 만든 그래프 전체(마스터 게인 + 모든 노드 +
  // 모든 오실레이터)를 가리키는 묶음. 예전에는 master/nodes/oscillators가 모듈
  // 전역에 하나씩만 있어서, start()→stop()→start()를 반복하면 새 사이클이
  // 이전 사이클의 자리에 겹쳐 쓰였다 — 이전 마스터는 destination에 연결된 채로
  // 아무도 참조하지 않는 좀비 그래프가 됐다. 사이클 단위로 묶으면 각 세대가
  // 독립적으로 태어나고 독립적으로 정리된다.
  let activeCycle = null // 지금 재생 중인 사이클 (running === true일 때만 존재)
  // stop()으로 페이드아웃은 걸렸지만 아직 onended로 정리되지 않은 사이클들.
  // 토글을 빠르게 반복하면(끄고 → 페이드 끝나기 전에 다시 켜고 → 끄고 …) 동시에
  // 여러 개가 여기 쌓일 수 있다. 하나만 담을 수 있게 만들면 두 번째 토글부터
  // 이전 사이클이 이 배열 밖으로 밀려나 disconnect될 기회를 잃는다.
  let fadingCycles = []
  let running = false

  function start() {
    // 두 번 부르면 그래프가 두 벌 생겨 음량이 배가 된다.
    if (running) return
    running = true

    // 사용자 제스처 안에서 만든 컨텍스트는 보통 처음부터 running으로
    // 시작하지만, 그 뒤로도 계속 running이라는 보장은 없다 — macOS는 오디오
    // 장치 전환이나 절전 복귀로 컨텍스트를 suspended로 떨어뜨릴 수 있고,
    // iPadOS Safari는 interrupted 상태를 쓴다. 문제는 "생성한 순간"이 아니라
    // "그 이후 아무 때나" 생길 수 있으므로, 컨텍스트를 만들 때 한 번이 아니라
    // start()를 부를 때마다(즉 토글을 켤 때마다) 상태를 확인해야 한다.
    // suspended인 채로 그래프를 만들면 오디오 스레드가 한 번도 렌더링을
    // 안 해 currentTime이 멈춰 있는 상태가 된다 — 이때 stop()이 불리면
    // master.gain의 "현재값"을 스케줄된 값이 아니라 GainNode 생성 기본값인
    // 1로 잘못 읽어, 나중에 컨텍스트가 resume됐을 때 목표 게인(MASTER_GAIN)의
    // 열 몇 배에 달하는 순간적인 큰 소리로 터질 수 있다. resume()은 프로미스를
    // 반환하므로 실패(예: 이미 닫힌 컨텍스트)해도 처리되지 않은 거부가 새지
    // 않게 삼킨다 — 실패해도 그래프는 예정대로 만들어지고, 다음 재생 시도에서
    // 다시 확인한다.
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    const cycleNodes = []
    const cycleOscillators = []

    const master = ctx.createGain()
    // 0에서 시작해 램프로 올린다 — 처음부터 목표 게인이면 "툭" 하고 켜진다.
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + FADE_IN_S)
    master.connect(ctx.destination)
    cycleNodes.push(master)

    for (const v of AMBIENT_VOICES) {
      const osc = ctx.createOscillator()
      osc.type = v.type
      osc.frequency.value = v.freq
      osc.detune.value = v.detune

      const voiceGain = ctx.createGain()
      voiceGain.gain.value = v.gain

      // 성부 체인: osc → (필터) → 게인 → 마스터
      let tail = osc
      let filter = null
      if (v.filter) {
        filter = ctx.createBiquadFilter()
        filter.type = v.filter.type
        filter.frequency.value = v.filter.freq
        filter.Q.value = v.filter.q
        tail.connect(filter)
        tail = filter
        cycleNodes.push(filter)
      }
      tail.connect(voiceGain)
      voiceGain.connect(master)
      cycleNodes.push(voiceGain)

      if (v.lfo) {
        // LFO는 오실레이터 하나 + 게인 하나로 만든다. 게인이 곧 흔들림 폭이다.
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = v.lfo.freq
        const depth = ctx.createGain()
        depth.gain.value = v.lfo.depth
        lfo.connect(depth)
        // filterFreq는 필터가 있을 때만 의미가 있다.
        if (v.lfo.target === 'filterFreq' && filter) depth.connect(filter.frequency)
        else depth.connect(voiceGain.gain)
        lfo.start()
        cycleOscillators.push(lfo)
        cycleNodes.push(depth)
      }

      osc.start()
      cycleOscillators.push(osc)
    }

    activeCycle = { master, nodes: cycleNodes, oscillators: cycleOscillators, torn: false }
  }

  // 사이클 하나를 실제로 그래프에서 끊어낸다. stop()이 예약한 onended 콜백과
  // dispose()의 즉시 경로 양쪽에서 호출될 수 있으므로, torn 플래그로 중복
  // disconnect를 막는다 — "stop()의 페이드가 끝나기 전에 dispose()가 먼저
  // 끊고, 뒤늦게 onended가 발동"하는 순서에서도 같은 노드를 두 번 끊지
  // 않아야 한다.
  function teardownCycle(cycle) {
    if (cycle.torn) return
    cycle.torn = true
    for (const n of cycle.nodes) n.disconnect()
    fadingCycles = fadingCycles.filter((c) => c !== cycle)
  }

  function stop() {
    if (!running) return
    running = false
    const cycle = activeCycle
    // 다음 start()는 반드시 새 사이클을 만든다 — 지금 페이드아웃을 시작하는
    // 이 사이클을 모듈이 더는 "현재 사이클"로 참조하지 않게 끊어 둔다. 그래야
    // 이어지는 start()가 이 사이클의 master/nodes를 절대 재사용하거나
    // 건드릴 수 없다.
    activeCycle = null
    if (!cycle) return

    const now = ctx.currentTime
    cycle.master.gain.cancelScheduledValues(now)
    cycle.master.gain.setValueAtTime(cycle.master.gain.value, now)
    cycle.master.gain.linearRampToValueAtTime(0, now + FADE_OUT_S)
    // 페이드가 끝난 뒤에 멈춰야 뚝 끊기지 않는다.
    for (const o of cycle.oscillators) o.stop(now + FADE_OUT_S)

    // "페이드가 끝났다"를 setTimeout으로 재는 대신 onended를 쓴다. setTimeout은
    // 벽시계(wall clock) 기준이라 탭이 백그라운드로 밀리면 스로틀링으로
    // 지연·드리프트가 생기고, FADE_OUT_S를 여기 다시 하드코딩해 오디오 클럭의
    // 스케줄과 별개로 어긋날 여지도 생긴다. 반면 osc.stop(t)는 오디오 클럭
    // 기준으로 정확히 t 시점에 'ended' 이벤트를 낸다 — Web Audio가 이미 정확히
    // 알고 있는 신호를 그대로 받아쓰는 쪽이 더 정확하고 코드도 더 간단하다.
    if (cycle.oscillators.length > 0) {
      cycle.oscillators[0].onended = () => teardownCycle(cycle)
      fadingCycles.push(cycle)
    } else {
      // 성부가 하나도 없는 극단적인 경우(오실레이터가 없어 onended를 걸 데가
      // 없음) 대비 — 바로 정리한다.
      teardownCycle(cycle)
    }
  }

  function dispose() {
    // dispose()는 stop()과 의도적으로 다른 경로다. stop()은 "사용자가 소리를
    // 껐다" — 페이드로 자연스럽게 사라져야 좋은 경험이다. dispose()는
    // "컴포넌트가 언마운트된다" — 화면에 그 페이드를 들을 사람이 이미 없고,
    // 오히려 AudioContext와 노드를 계속 붙들고 있는 쪽이 더 나쁘다. 그래서
    // dispose()는 stop()을 호출하지 않고, 지금 존재하는 모든 사이클(한창
    // 재생 중이든, stop() 이후 페이드 중이든)을 즉시 끊는다 — "지금 당장
    // 정리, 페이드 없음"이 이 함수의 계약이다.
    running = false
    const cycles = activeCycle ? [activeCycle, ...fadingCycles] : fadingCycles
    activeCycle = null
    fadingCycles = []

    for (const cycle of cycles) {
      // stop()이 걸어 둔 onended가 나중에(예: 이미 예약된 stop 시각에) 발동해
      // 지금 끊는 노드를 다시 disconnect()하려 들지 않도록 먼저 떼어낸다.
      for (const o of cycle.oscillators) o.onended = null
      // stop()은 여러 번 호출해도 안전하다 — 이미 stop()이 예약된 오실레이터에
      // 다시 호출하면 정지 시각을 지금으로 재예약할 뿐이다(Web Audio 스펙).
      // 아직 한 번도 stop()이 걸리지 않은 사이클(재생 중에 바로 dispose된
      // 경우)도 이 호출로 지금 멈춘다.
      for (const o of cycle.oscillators) o.stop()
      teardownCycle(cycle)
    }
  }

  return {
    start,
    stop,
    dispose,
    get running() {
      return running
    },
  }
}
