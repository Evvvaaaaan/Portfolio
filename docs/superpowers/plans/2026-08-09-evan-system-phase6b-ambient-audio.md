# Evan System Phase 6b — 앰비언트 오디오 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 항성계에 낮은 앰비언트 드론을 깔되, 기본은 완전 무음이고 방문자가 직접 켤 때만 소리가 난다.

**Architecture:** 오디오 파일을 쓰지 않는다 — 오실레이터와 필터로 직접 합성한다. 합성 "레시피"(주파수·게인·필터·LFO)는 Web Audio에 의존하지 않는 순수 데이터 모듈로 두고, 엔진은 그 레시피를 받아 그래프를 짓는다. 엔진은 `AudioContext`를 **인자로 받으므로** node 테스트에서 가짜 컨텍스트를 넣어 그래프 모양을 그대로 검증할 수 있다. 토글은 네비바의 오토파일럿 버튼과 같은 패턴이다.

**Tech Stack:** Web Audio API, React 19, vitest 4 (환경 `node`), Playwright 1.60.

## Global Constraints

- **소리는 절대 자동 재생되지 않는다.** 첫 방문이든 재방문이든 기본은 무음이고, 오직 사용자의 클릭으로만 시작된다. 브라우저 자동재생 정책 이전에 이것이 제품 요구사항이다.
- **`AudioContext`는 사용자 제스처 안에서 만들거나 resume한다.** 밖에서 만들면 `suspended` 상태로 굳어 아무 소리도 나지 않는다.
- **볼륨 상한은 마스터 게인 0.06이다.** 포트폴리오 배경음이 대화를 방해하면 실패다.
- **오디오 파일을 저장소에 추가하지 않는다.** 합성만 쓴다 (스펙 §6의 2026-08-09 결정).
- **vitest 환경은 `node`다.** 단위 테스트에서 `document`·`window`·`AudioContext`를 쓸 수 없다 — 그래서 엔진이 컨텍스트를 주입받는 설계다.
- **`@react-three/fiber`를 쓰지 않는다.**
- **i18n 4개 로케일(`en`, `ko`, `ja`, `zh`) 전부**에 새 문구를 넣는다.
- **데스크톱 판별 미디어쿼리 문자열은 정확히 `(min-width: 769px) and (min-height: 701px)`** 다.
- 커밋 메시지는 영어, 코드 주석은 한국어.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/audio/ambientVoices.js` (신규) | 합성 레시피 — 성부별 주파수·파형·게인·필터·LFO. 순수 데이터. |
| `src/audio/ambientVoices.test.js` (신규) | 레시피 단위 테스트. |
| `src/audio/ambientAudio.js` (신규) | 레시피 → Web Audio 그래프. `AudioContext`를 주입받는다. |
| `src/audio/ambientAudio.test.js` (신규) | 가짜 컨텍스트로 그래프 모양·페이드·정리 검증. |
| `src/components/Navbar/SoundToggle.jsx` (신규) | 네비바 토글 버튼 (오토파일럿 버튼과 같은 패턴). |
| `src/components/Navbar/Navbar.jsx` (수정) | 토글 버튼 배치. |
| `src/components/Navbar/Navbar.css` (수정) | 토글 켜짐 상태 + 첫 방문 유도 펄스. |
| `src/i18n/translations.js` (수정) | `sound.on` / `sound.off` / `sound.hint` — 4개 로케일. |
| `src/i18n/translations.test.js` (수정) | 새 키 파리티 검증. |
| `e2e/ambient-audio.spec.js` (신규) | 기본 무음, 클릭으로 시작, 다시 눌러 정지. |

## 비범위 (Out of Scope)

- 씬 상태(정거장·워프·인트로)에 따라 음색이 변하는 반응형 사운드. 이번엔 정적인 드론 하나다.
- 재방문 시 소리 자동 복원. 항상 무음으로 시작한다 — 자동재생 금지 요구사항과 정면으로 충돌한다.
- 헤드트래킹 패럴랙스 — 스펙 §6에서 범위 제외.

---

### Task 1: 합성 레시피

**Files:**
- Create: `src/audio/ambientVoices.js`
- Test: `src/audio/ambientVoices.test.js`

**Interfaces:**
- Consumes: 없음 (완전 독립 순수 모듈).
- Produces: `MASTER_GAIN`(0.06), `FADE_IN_S`(2.5), `FADE_OUT_S`(1.2), `AMBIENT_VOICES`(`{ id, type, freq, gain, detune, filter: { type, freq, q } | null, lfo: { target, freq, depth } | null }[]`).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/audio/ambientVoices.test.js`:

```js
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
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/audio/ambientVoices.test.js`
Expected: FAIL — `Failed to resolve import "./ambientVoices.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/audio/ambientVoices.js`:

```js
// 앰비언트 드론 합성 레시피 (순수 데이터 — Web Audio 미의존, 단위 테스트 대상).
// 오디오 파일을 쓰지 않는 이유: 저장소에 오디오 자산이 없고, 파일을 들이면
// 용량과 라이선스가 따라온다. 오실레이터로 만들면 둘 다 없고 "브라우저에서
// 직접 만들었다"는 이 사이트의 이야기와도 맞는다.

// 배경음의 목적은 존재감이지 주목이 아니다 — 대화를 방해하면 실패다.
export const MASTER_GAIN = 0.06
// 페이드가 짧으면 배경음이 아니라 효과음처럼 "켜졌다"고 인식된다.
export const FADE_IN_S = 2.5
export const FADE_OUT_S = 1.2

// A1(55Hz)을 기음으로 한 배음렬. 정수배로 쌓아야 뭉개지지 않고 하나의
// 음색으로 들린다. detune은 센트 단위로 살짝 어긋내 맥놀이를 만든다 —
// 완전히 같은 위상이면 합성음 특유의 죽은 소리가 난다.
export const AMBIENT_VOICES = [
  {
    id: 'sub',
    type: 'sine',
    freq: 55,
    gain: 0.5,
    detune: 0,
    filter: null,
    lfo: null,
  },
  {
    id: 'body',
    type: 'triangle',
    freq: 110,
    gain: 0.26,
    detune: -6,
    filter: { type: 'lowpass', freq: 420, q: 0.7 },
    // 아주 느린 필터 스윕 — 소리가 "숨쉬는" 느낌을 만든다.
    lfo: { target: 'filterFreq', freq: 0.05, depth: 160 },
  },
  {
    id: 'air',
    type: 'sine',
    freq: 220,
    gain: 0.12,
    detune: 7,
    filter: { type: 'lowpass', freq: 900, q: 0.5 },
    lfo: { target: 'gain', freq: 0.07, depth: 0.06 },
  },
  {
    id: 'shimmer',
    type: 'sine',
    freq: 440,
    gain: 0.05,
    detune: -4,
    filter: { type: 'highpass', freq: 300, q: 0.4 },
    lfo: { target: 'gain', freq: 0.11, depth: 0.03 },
  },
]
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/audio/ambientVoices.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/audio/ambientVoices.js src/audio/ambientVoices.test.js
git commit -m "feat(audio): synthesis recipe for the ambient drone"
```

---

### Task 2: 오디오 엔진

**Files:**
- Create: `src/audio/ambientAudio.js`
- Test: `src/audio/ambientAudio.test.js`

**Interfaces:**
- Consumes: Task 1의 `AMBIENT_VOICES`, `MASTER_GAIN`, `FADE_IN_S`, `FADE_OUT_S`.
- Produces: `createAmbientAudio(ctx) → { start(), stop(), dispose(), get running() }`.
  `ctx`는 `AudioContext`(또는 같은 인터페이스의 가짜)다. **모듈이 스스로 `AudioContext`를 만들지 않는다** — 사용자 제스처 안에서 만들어 넘기는 것은 호출부의 책임이고, 그래야 node에서 가짜를 주입해 테스트할 수 있다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/audio/ambientAudio.test.js`:

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/audio/ambientAudio.test.js`
Expected: FAIL — `Failed to resolve import "./ambientAudio.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/audio/ambientAudio.js`:

```js
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/audio/ambientAudio.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/audio/ambientAudio.js src/audio/ambientAudio.test.js
git commit -m "feat(audio): ambient drone engine with an injectable audio context"
```

---

### Task 3: 네비바 토글 + 유도

**Files:**
- Create: `src/components/Navbar/SoundToggle.jsx`, `e2e/ambient-audio.spec.js`
- Modify: `src/components/Navbar/Navbar.jsx`, `src/components/Navbar/Navbar.css`, `src/i18n/translations.js`, `src/i18n/translations.test.js`

**Interfaces:**
- Consumes: Task 2의 `createAmbientAudio(ctx) → { start, stop, dispose, running }`; `src/context/LangContext.jsx`의 `useLang()`.
- Produces: DOM 계약 — 토글은 `button.sound-btn`, `aria-pressed`가 상태를 반영하고, 접근성 이름은 꺼짐 상태에서 `t.sound.on`, 켜짐 상태에서 `t.sound.off`.

- [ ] **Step 1: i18n 문구를 넣는다**

`src/i18n/translations.js`의 각 로케일 `nav` 블록 **바로 다음 줄**에 추가한다. `nav:`가 네 번 나오며 전부에 넣는다.

`en`:
```js
    sound: { on: 'Sound on', off: 'Sound off', hint: 'This system has a sound' },
```
`ko`:
```js
    sound: { on: '소리 켜기', off: '소리 끄기', hint: '이 항성계에는 소리가 있습니다' },
```
`ja`:
```js
    sound: { on: 'サウンドを再生', off: 'サウンドを停止', hint: 'この星系には音があります' },
```
`zh`:
```js
    sound: { on: '开启声音', off: '关闭声音', hint: '这个星系有声音' },
```

- [ ] **Step 2: 토글 컴포넌트를 쓴다**

`src/components/Navbar/SoundToggle.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { createAmbientAudio } from '../../audio/ambientAudio.js'

const HINT_KEY = 'evanSystemSoundHinted'

export default function SoundToggle() {
  const { t } = useLang()
  const [on, setOn] = useState(false)
  // 유도는 "한 번 살짝 알린다"까지다 — 모달로 막아 세우면 배경음 하나 때문에
  // 방문의 첫 동작을 빼앗는 셈이 된다.
  const [hinted, setHinted] = useState(true)
  const audioRef = useRef(null)

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(HINT_KEY)) setHinted(false)
    } catch {
      // 프라이빗 모드 등에서 sessionStorage가 막히면 유도를 생략한다.
    }
  }, [])

  // 탭을 떠날 때 오디오 그래프가 남아 있으면 브라우저가 계속 붙들고 있다.
  useEffect(() => () => audioRef.current?.dispose(), [])

  const toggle = () => {
    // 컨텍스트는 반드시 이 클릭(사용자 제스처) 안에서 만든다 — 밖에서 만들면
    // suspended로 굳어 소리가 나지 않는다.
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      audioRef.current = createAmbientAudio(new Ctx())
    }
    if (on) {
      audioRef.current.stop()
      setOn(false)
    } else {
      audioRef.current.start()
      setOn(true)
    }
    if (!hinted) {
      setHinted(true)
      try {
        sessionStorage.setItem(HINT_KEY, '1')
      } catch {
        // 저장 실패는 무시한다 — 유도가 한 번 더 보일 뿐이다.
      }
    }
  }

  const label = on ? t.sound.off : t.sound.on

  return (
    <button
      type="button"
      className={`nav-icon-btn sound-btn ${on ? 'sound-btn--on' : ''} ${hinted ? '' : 'sound-btn--hint'}`}
      aria-pressed={on}
      title={hinted ? label : t.sound.hint}
      onClick={toggle}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" />
        {on ? (
          <>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a8.5 8.5 0 0 1 0 12" />
          </>
        ) : (
          <path d="M17 9.5l4 5m0-5l-4 5" />
        )}
      </svg>
      <span className="nav-icon-btn-label">{label}</span>
    </button>
  )
}
```

- [ ] **Step 3: 네비바에 붙인다**

`src/components/Navbar/Navbar.jsx`의 import 블록에 추가:

```jsx
import SoundToggle from './SoundToggle.jsx'
```

`.nav-controls` 안, `{location.pathname === '/' && isDesktop && <AutopilotButton />}` 줄 **바로 다음**에 추가한다. 소리는 메인 정거장 경험의 일부이므로 오토파일럿과 같은 게이트를 쓴다:

```jsx
          {location.pathname === '/' && isDesktop && <SoundToggle />}
```

- [ ] **Step 4: 스타일을 추가한다**

`src/components/Navbar/Navbar.css` 맨 끝에 추가:

```css
/* 소리 토글: 켜지면 오토파일럿과 같은 방식으로 상태를 보여준다. */
.sound-btn--on {
  color: #fff;
  background: rgba(109, 181, 255, 0.16);
  border-color: rgba(109, 181, 255, 0.45);
}

/* 첫 방문 유도: 두 번만 아주 옅게 숨쉰다. 계속 뛰면 광고처럼 읽힌다. */
@keyframes sound-hint-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(109, 181, 255, 0); }
  50%      { box-shadow: 0 0 0 4px rgba(109, 181, 255, 0.18); }
}

.sound-btn--hint {
  animation: sound-hint-pulse 2.4s ease-in-out 2;
}

@media (prefers-reduced-motion: reduce) {
  .sound-btn--hint { animation: none; }
}
```

- [ ] **Step 5: i18n 파리티 테스트를 추가한다**

`src/i18n/translations.test.js` 맨 끝에 추가:

```js
describe('Phase 6b 사운드 문구', () => {
  const KEYS = ['on', 'off', 'hint']
  for (const locale of LOCALES) {
    it(`${locale}에 사운드 문구가 모두 있다`, () => {
      for (const key of KEYS) {
        expect(typeof translations[locale].sound[key]).toBe('string')
        expect(translations[locale].sound[key].length).toBeGreaterThan(0)
      }
    })
  }

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const on = LOCALES.map((l) => translations[l].sound.on)
    expect(new Set(on).size).toBe(LOCALES.length)
  })

  it('영어 문구는 e2e가 접근성 이름으로 찾는 값과 정확히 같다', () => {
    expect(translations.en.sound.on).toBe('Sound on')
    expect(translations.en.sound.off).toBe('Sound off')
  })
})
```

- [ ] **Step 6: 테스트·빌드·린트를 확인한다**

Run: `npm test`
Expected: 전부 통과

Run: `npm run build`
Expected: 정상 종료

Run: `npx eslint src/audio/ambientAudio.js src/audio/ambientVoices.js src/components/Navbar/SoundToggle.jsx src/components/Navbar/Navbar.jsx`
Expected: 오류 0건

- [ ] **Step 7: e2e 스펙을 쓴다**

`e2e/ambient-audio.spec.js`:

```js
import { test, expect } from '@playwright/test'

// AudioContext를 실제로 만들지 않고 계측한다 — 헤드리스 크로미움은 오디오
// 출력이 없어 "소리가 났는지"를 직접 확인할 수 없다. 대신 컨텍스트가 언제
// 몇 개 만들어졌는지를 기록해 "자동 재생하지 않는다"와 "클릭에 반응한다"를
// 각각 증명한다.
async function instrument(page) {
  await page.addInitScript(() => {
    window.__audioCreated = 0
    const Real = window.AudioContext || window.webkitAudioContext
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args)
        window.__audioCreated += 1
      }
    }
  })
}

test('기본은 완전 무음 — AudioContext를 만들지도 않는다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sound on' })).toBeVisible({ timeout: 15000 })
  // 페이지가 자리를 잡을 시간을 준 뒤에도 여전히 0이어야 한다.
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => window.__audioCreated)).toBe(0)
})

test('토글을 누르면 그때 오디오가 시작된다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  const on = page.getByRole('button', { name: 'Sound on' })
  await expect(on).toBeVisible({ timeout: 15000 })
  await on.click()
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await page.evaluate(() => window.__audioCreated)).toBe(1)
})

test('다시 누르면 멈추고, 컨텍스트를 새로 만들지 않는다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Sound on' }).click()
  const off = page.getByRole('button', { name: 'Sound off' })
  await expect(off).toBeVisible()
  await off.click()
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // 컨텍스트는 재사용돼야 한다 — 매번 새로 만들면 탭이 오디오 장치를 계속 붙든다.
  expect(await page.evaluate(() => window.__audioCreated)).toBe(1)
})

test('토글은 데스크톱 메인에만 있다', async ({ page }) => {
  await page.goto('/guestbook')
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveCount(0)
})
```

- [ ] **Step 8: e2e를 돌린다**

Run: `npx playwright test e2e/ambient-audio.spec.js`
Expected: 4 passed

Playwright는 한 번에 하나만 돌린다 — 두 프로세스가 5173 포트를 공유해 서로의 서버를 내리면 `ERR_CONNECTION_REFUSED`가 무더기로 난다.

- [ ] **Step 9: 커밋**

```bash
git add src/components/Navbar/SoundToggle.jsx src/components/Navbar/Navbar.jsx \
        src/components/Navbar/Navbar.css src/i18n/translations.js \
        src/i18n/translations.test.js e2e/ambient-audio.spec.js
git commit -m "feat(audio): navbar sound toggle, muted by default"
```

---

## 컨트롤러 확인 사항 (구현자에게 넘기지 않는 것)

- **실제로 들어봐야 한다.** 단위 테스트는 그래프 모양만 검증하고 e2e는 컨텍스트 생성 횟수만 센다 — "좋은 소리인가"는 사람만 판단할 수 있다. 컨트롤러가 `npm run dev`로 직접 켜서 듣고, 너무 크거나 거슬리면 `MASTER_GAIN`과 성부 게인을 조정한다.
- **자동 재생 금지가 실제로 지켜지는지 눈으로 확인한다.** e2e의 첫 테스트가 이걸 지키지만, 브라우저 콘솔에 자동재생 정책 경고가 뜨는지도 함께 본다.
- **탭을 떠난 뒤 소리가 남지 않는지 확인한다.** 다른 라우트로 이동하면 토글이 언마운트되며 `dispose`가 불린다 — 실제로 조용해지는지 듣는다.
