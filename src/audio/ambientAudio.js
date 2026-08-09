// 앰비언트 드론 엔진. AudioContext를 인자로 받는 이유 두 가지:
// (1) 브라우저는 사용자 제스처 안에서 만든 컨텍스트만 소리를 내준다 —
//     컨텍스트 생성 시점은 호출부(클릭 핸들러)가 정해야 한다.
// (2) node 단위 테스트에서 가짜 컨텍스트를 넣어 그래프 모양을 검증할 수 있다.
import { AMBIENT_VOICES, MASTER_GAIN, FADE_IN_S, FADE_OUT_S } from './ambientVoices.js'

export function createAmbientAudio(ctx) {
  let master = null
  let nodes = []
  let oscillators = []
  let running = false

  function start() {
    // 두 번 부르면 그래프가 두 벌 생겨 음량이 배가 된다.
    if (running) return
    running = true

    const now = ctx.currentTime
    master = ctx.createGain()
    // 0에서 시작해 램프로 올린다 — 처음부터 목표 게인이면 "툭" 하고 켜진다.
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + FADE_IN_S)
    master.connect(ctx.destination)
    nodes.push(master)

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
        nodes.push(filter)
      }
      tail.connect(voiceGain)
      voiceGain.connect(master)
      nodes.push(voiceGain)

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
        oscillators.push(lfo)
        nodes.push(depth)
      }

      osc.start()
      oscillators.push(osc)
    }
  }

  function stop() {
    if (!running) return
    running = false
    const now = ctx.currentTime
    if (master) {
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + FADE_OUT_S)
    }
    // 페이드가 끝난 뒤에 멈춰야 뚝 끊기지 않는다.
    for (const o of oscillators) o.stop(now + FADE_OUT_S)
    oscillators = []
  }

  function dispose() {
    stop()
    for (const n of nodes) n.disconnect()
    nodes = []
    master = null
    running = false
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
