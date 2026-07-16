# Hero Arrival Sequence Phase 2 (Hero 도착 시퀀스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 로딩 시 카메라가 고속 워프 상태(스트릭 최대)에서 시작해 감속하며 Hero 별필드에 "도착"하고, 정착이 끝나는 순간 Hero 콘텐츠가 기존 스태거로 등장한다.

**Architecture:** 도착 타임라인·재생 조건·상태 머신을 순수 모듈(`arrivalSequence.js`)로 분리한다. `SpaceBackground`가 재생을 담당하고(도착 중에는 `intensitySmooth`를 타임라인 값으로 직접 구동 — 기존 스트릭/포스트프로세싱/카메라 줌이 자동으로 따라옴), 완료 시 window 이벤트를 쏜다. Hero는 그 이벤트를 기다리는 동안 기존 `fade-up` 스태거 애니메이션을 `animation-play-state: paused`로 잡아두었다가 도착 순간 재생한다. 두 컴포넌트는 이벤트+상태 조회로만 결합한다.

**Tech Stack:** Three.js 0.184 (기존 SpaceBackground 모듈), Vitest (environment: node), Playwright, React 19.

## Global Constraints

- `prefers-reduced-motion: reduce`면 시퀀스를 생략하고 정착 상태로 바로 시작 (스펙 Phase 2 명시).
- 시퀀스는 첫 페이지 로드 1회만, 메인 페이지+데스크톱(`warpEnabled`)에서만. 스크롤 복원으로 페이지 중간에서 리로드되면 생략.
- 모바일/비메인 라우트/생략 시 기존 동작에서 회귀 없음 — Hero 콘텐츠는 즉시(기존처럼) 등장해야 한다.
- Hero가 이벤트를 놓쳐도 영원히 숨겨지면 안 된다 (안전 타임아웃 필수).
- 순수 계산은 별도 파일 + vitest (기존 `transitionIntensity.js` 패턴). R3F 전환 금지.
- 커밋 컨벤션: `feat(space-bg): ...`, `feat(hero): ...`, `test(e2e): ...`.
- 작업 브랜치: `feat/hero-arrival` (main에서 새로 생성; Phase 1은 이미 main에 머지됨).
- baseline: 시작 전 `npm test` 31개 통과 확인.

---

### Task 1: 도착 시퀀스 순수 모듈 (`arrivalSequence.js`)

**Files:**
- Create: `src/components/SpaceBackground/arrivalSequence.js`
- Test: `src/components/SpaceBackground/arrivalSequence.test.js`

**Interfaces:**
- Consumes: 없음
- Produces (Task 2·3이 import):
  - `ARRIVAL_DONE_EVENT: string` — 종결 시 window에 dispatch되는 이벤트 이름
  - `ARRIVAL_HOLD_MS: number`, `ARRIVAL_DURATION_MS: number`
  - `computeArrivalIntensity(elapsedMs: number) => { intensity: number, done: boolean }`
  - `shouldPlayArrival({ warpEnabled, reducedMotion, scrollY, viewportHeight }) => boolean`
  - `getArrivalStatus() => 'pending' | 'playing' | 'done' | 'skipped'`
  - `beginArrival(): void`, `concludeArrival(finalStatus: 'done' | 'skipped'): void`
  - `resetArrivalForTest(): void`

- [ ] **Step 1: baseline 확인**

Run: `npm test`
Expected: 31개 테스트 PASS (실패가 있으면 중단하고 보고).

- [ ] **Step 2: 실패하는 테스트 작성**

`src/components/SpaceBackground/arrivalSequence.test.js`:

```js
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/arrivalSequence.test.js`
Expected: FAIL — 모듈 없음 에러.

- [ ] **Step 4: 구현**

`src/components/SpaceBackground/arrivalSequence.js`:

```js
// 첫 로딩 "도착 시퀀스": 페이지가 고속 워프 상태(intensity=1)로 시작해
// 감속하며 Hero 별필드에 정착한다. SpaceBackground가 재생을 담당하고,
// Hero는 종결 이벤트(ARRIVAL_DONE_EVENT)를 기다렸다가 콘텐츠를 등장시킨다.
// 재생 조건 미충족 시에도 반드시 'skipped'로 종결해 이벤트를 쏜다 —
// Hero가 영원히 기다리는 상황을 막는 계약이다.

export const ARRIVAL_DONE_EVENT = 'space-arrival:done'
export const ARRIVAL_HOLD_MS = 600
export const ARRIVAL_DURATION_MS = 2400

// 0~HOLD: 최고 속도 유지, HOLD~DURATION: ease-out cubic으로 1→0 감속.
export function computeArrivalIntensity(elapsedMs) {
  if (elapsedMs < ARRIVAL_HOLD_MS) return { intensity: 1, done: false }
  if (elapsedMs >= ARRIVAL_DURATION_MS) return { intensity: 0, done: true }
  const t = (elapsedMs - ARRIVAL_HOLD_MS) / (ARRIVAL_DURATION_MS - ARRIVAL_HOLD_MS)
  const remain = 1 - t
  return { intensity: remain * remain * remain, done: false }
}

// 재생 조건: 메인 데스크톱(warpEnabled) + 모션 허용 + 페이지 상단.
// 스크롤 복원으로 중간에서 리로드된 경우(뷰포트 절반 이상)는 생략한다.
export function shouldPlayArrival({ warpEnabled, reducedMotion, scrollY, viewportHeight }) {
  if (!warpEnabled || reducedMotion) return false
  return scrollY < viewportHeight * 0.5
}

// 페이지 로드당 1회 상태 머신: pending → playing → done | pending → skipped.
let status = 'pending'

export function getArrivalStatus() {
  return status
}

export function beginArrival() {
  status = 'playing'
}

export function concludeArrival(finalStatus) {
  status = finalStatus
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ARRIVAL_DONE_EVENT))
  }
}

// 테스트 전용: 모듈 상태 초기화.
export function resetArrivalForTest() {
  status = 'pending'
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/arrivalSequence.test.js`
Expected: 9개 테스트 PASS.

- [ ] **Step 6: 전체 스위트 + 커밋**

Run: `npm test`
Expected: 40개 테스트 PASS.

```bash
git add src/components/SpaceBackground/arrivalSequence.js src/components/SpaceBackground/arrivalSequence.test.js
git commit -m "feat(space-bg): add pure arrival sequence timeline and status machine"
```

---

### Task 2: SpaceBackground에서 도착 시퀀스 재생

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx` (import, 마운트 이펙트 초기화부, tick 루프)

**Interfaces:**
- Consumes: Task 1의 `shouldPlayArrival`, `beginArrival`, `concludeArrival`, `computeArrivalIntensity`
- Produces: 없음 (종결 시 `ARRIVAL_DONE_EVENT`가 window에 dispatch됨 — Task 3이 수신)

- [ ] **Step 1: import 추가**

`SpaceBackground.jsx` 상단 import 블록에 추가:

```js
import {
  shouldPlayArrival,
  beginArrival,
  concludeArrival,
  computeArrivalIntensity,
} from './arrivalSequence.js'
```

- [ ] **Step 2: 마운트 시 재생 판정**

마운트 이펙트 안, `const reducedMotion = ...` 라인 **아래**에 추가 (reducedMotion 선언 이후여야 함):

```js
    // 첫 로딩 도착 시퀀스: 조건 충족 시 고속 워프에서 시작해 감속-정착한다.
    // SpaceBackground는 라우트가 바뀌어도 언마운트되지 않으므로 이 판정은
    // 페이지 로드당 정확히 1회다. 재생하지 않는 경우에도 반드시 'skipped'로
    // 종결해 Hero가 기다리지 않게 한다.
    let arrivalActive = shouldPlayArrival({
      warpEnabled: warpEnabledRef.current,
      reducedMotion,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    })
    if (arrivalActive) {
      beginArrival()
    } else {
      concludeArrival('skipped')
    }
```

- [ ] **Step 3: tick 루프에서 타임라인 구동**

tick 루프 안의 기존 intensity 블록을 수정한다. 현재 코드(Phase 1 완료 상태):

```js
      const targetIntensity = (warpEnabledRef.current && !reducedMotion)
        ? computeTransitionIntensity(window.scrollY, window.innerHeight)
        : 0
      if (!warpEnabledRef.current) {
        // 라우트 이동 등으로 워프가 꺼지면 잔류 왜곡/스트릭 없이 즉시 리셋.
        intensitySmooth = 0
      } else {
        const smoothingRate = targetIntensity > intensitySmooth ? 0.18 : 0.025
        intensitySmooth += (targetIntensity - intensitySmooth) * smoothingRate
      }
```

이를 다음으로 교체 (도착 시퀀스 분기가 가장 앞, 기존 로직은 그대로 후순위):

```js
      // 도착 시퀀스 중에는 스크롤이 아니라 타임라인이 intensity를 직접
      // 구동한다 (스무딩 없이 — 감속 곡선 자체가 이미 ease-out).
      // 도중에 라우트가 바뀌면(warp off) 즉시 종결하고 기존 리셋을 따른다.
      if (arrivalActive && !warpEnabledRef.current) {
        arrivalActive = false
        concludeArrival('done')
      }
      if (arrivalActive) {
        const arrival = computeArrivalIntensity(t * 1000)
        intensitySmooth = arrival.intensity
        if (arrival.done) {
          arrivalActive = false
          concludeArrival('done')
        }
      } else {
        const targetIntensity = (warpEnabledRef.current && !reducedMotion)
          ? computeTransitionIntensity(window.scrollY, window.innerHeight)
          : 0
        if (!warpEnabledRef.current) {
          // 라우트 이동 등으로 워프가 꺼지면 잔류 왜곡/스트릭 없이 즉시 리셋.
          intensitySmooth = 0
        } else {
          const smoothingRate = targetIntensity > intensitySmooth ? 0.18 : 0.025
          intensitySmooth += (targetIntensity - intensitySmooth) * smoothingRate
        }
      }
```

참고: `t`는 tick 상단의 기존 `const t = clock.getElapsedTime()`(초 단위). Clock은 첫 프레임에 시작하므로 `t * 1000`이 곧 도착 경과시간이다. 기존 주석(스무딩 설명 블록)은 교체 코드 위에 그대로 남긴다.

- [ ] **Step 4: 전체 테스트 + 빌드 확인**

Run: `npm test && npm run build`
Expected: 40개 PASS, 빌드 성공.

- [ ] **Step 5: 수동 확인**

Run: `npm run dev` 후 데스크톱 뷰포트에서 새로고침.
확인: (1) 페이지가 워프 최고 속도(스트릭 + 왜곡)로 시작해 약 2.4초에 걸쳐 감속-정착, (2) 정착 후 스크롤 워프가 기존대로 동작, (3) 페이지 중간으로 스크롤 후 새로고침하면 시퀀스 생략, (4) 모바일 뷰포트에서 시퀀스 없음, (5) macOS 시스템 설정 '동작 줄이기' 켜고 새로고침 시 시퀀스 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): play warp arrival sequence on first load"
```

---

### Task 3: Hero 콘텐츠를 도착 순간까지 대기시키기

**Files:**
- Modify: `src/sections/Hero/Hero.jsx` (import, Hero 컴포넌트 state/effect, section className)
- Modify: `src/sections/Hero/Hero.css` (`.hero .fade-up` 규칙 근처)

**Interfaces:**
- Consumes: Task 1의 `ARRIVAL_DONE_EVENT`, `getArrivalStatus()`
- Produces: 없음

- [ ] **Step 1: Hero.jsx 수정**

import 추가:

```js
import { ARRIVAL_DONE_EVENT, getArrivalStatus } from '../../components/SpaceBackground/arrivalSequence.js'
```

`Hero` 컴포넌트 함수 본문 상단(기존 `useLang`/`useTyping` 근처)에 추가:

```js
  // 도착 시퀀스가 끝날 때까지 콘텐츠 스태거를 잡아둔다. 이미 종결됐으면
  // (재생 안 함 포함) 처음부터 기다리지 않는다.
  const [awaitingArrival, setAwaitingArrival] = useState(() => {
    const s = getArrivalStatus()
    return s !== 'done' && s !== 'skipped'
  })

  useEffect(() => {
    if (!awaitingArrival) return
    // 이펙트 실행 순서 레이스 방지: SpaceBackground의 이펙트가 먼저 실행돼
    // 리스너 부착 전에 이벤트가 이미 지나갔을 수 있다 — 상태를 재확인한다.
    const s = getArrivalStatus()
    if (s === 'done' || s === 'skipped') {
      setAwaitingArrival(false)
      return
    }
    const reveal = () => setAwaitingArrival(false)
    window.addEventListener(ARRIVAL_DONE_EVENT, reveal, { once: true })
    // 안전장치: 어떤 이유로든 이벤트가 오지 않아도 콘텐츠가 영원히 숨지 않게.
    const fallback = setTimeout(reveal, 4000)
    return () => {
      window.removeEventListener(ARRIVAL_DONE_EVENT, reveal)
      clearTimeout(fallback)
    }
  }, [awaitingArrival])
```

section 태그의 className을 교체:

```js
    <section className={awaitingArrival ? 'hero hero--awaiting-arrival' : 'hero'} id="home">
```

- [ ] **Step 2: Hero.css 수정**

`.hero .fade-up { ... }` 규칙 바로 아래에 추가:

```css
/* 도착 시퀀스 동안 등장 스태거를 0% 지점에서 일시정지시킨다 (delay 카운트다운
   포함). 시퀀스가 끝나 클래스가 떨어지는 순간 스태거가 처음부터 재생된다. */
.hero--awaiting-arrival .fade-up {
  animation-play-state: paused;
}
```

(`.hero .fade-up`의 기본 `opacity: 0`이 일시정지 동안의 숨김을 담당한다 — 추가 숨김 규칙 불필요.)

- [ ] **Step 3: 전체 테스트 + 수동 확인**

Run: `npm test`
Expected: 40개 PASS.

Run: `npm run dev` 후 데스크톱에서 새로고침.
확인: (1) 워프 감속이 끝나는 순간 태그→타이틀→역할→설명→버튼→소셜 순서의 스태거가 시작, (2) 모바일 뷰포트에서는 기존처럼 즉시 스태거(대기 없음), (3) `/gallery`로 처음 진입 후 메인으로 이동해도 Hero가 즉시 등장(시퀀스는 첫 로드에만).

- [ ] **Step 4: 커밋**

```bash
git add src/sections/Hero/Hero.jsx src/sections/Hero/Hero.css
git commit -m "feat(hero): hold content stagger until warp arrival settles"
```

---

### Task 4: e2e 도착 시퀀스 테스트 + 전체 게이트

**Files:**
- Create: `e2e/arrival.spec.js`

**Interfaces:**
- Consumes: Task 1~3의 통합 결과 (`hero--awaiting-arrival` 클래스 수명주기)
- Produces: 없음 (회귀 방지 게이트)

- [ ] **Step 1: e2e 테스트 작성**

`e2e/arrival.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('첫 로딩 도착 시퀀스 후 Hero 콘텐츠가 등장한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const hero = page.locator('section.hero')
  // 시퀀스(~2.4s)가 끝나면 대기 클래스가 떨어지고 콘텐츠 스태거가 시작된다.
  await expect(hero).not.toHaveClass(/hero--awaiting-arrival/, { timeout: 6000 })
  await expect(page.locator('.hero-title').first()).toBeVisible()

  expect(errors).toEqual([])
})

test('reduced-motion이면 시퀀스 없이 즉시 등장한다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()

  await page.goto('/')
  // 'skipped' 종결이 즉시 일어나므로 대기 클래스가 빠르게 사라져야 한다.
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 2000,
  })

  await context.close()
})
```

- [ ] **Step 2: e2e 실행**

Run: `npx playwright test e2e/arrival.spec.js`
Expected: 2 passed.

- [ ] **Step 3: 전체 게이트**

Run: `npm test && npm run build && npx playwright test`
Expected: vitest 40개 PASS, 빌드 성공, e2e 전부 PASS (기존 modes/warp-visuals 포함). (`npm run lint`는 pre-existing 실패 상태라 게이트에서 제외 — 이 브랜치가 새 lint 에러를 추가하지 않는지만 `npx eslint src/components/SpaceBackground/arrivalSequence.js src/sections/Hero/Hero.jsx e2e/arrival.spec.js`로 확인, 에러 0이어야 함.)

- [ ] **Step 4: 커밋**

```bash
git add e2e/arrival.spec.js
git commit -m "test(e2e): add hero arrival sequence coverage"
```

---

## Self-Review 결과

- **스펙 커버리지**: 고속 워프 시작→감속→정착(Task 1·2), 정착 순간 타이틀/타이핑 스태거 등장(Task 3), reduced-motion 생략(Task 1 predicate + Task 4 e2e) — Phase 2 요구사항 전부 매핑. "기존 LoadingShowcase와 이어붙임"은 조사 결과 LoadingShowcase가 실제 로딩 화면이 아니라 `?showcase=loading` 데모 전용임을 확인 — SPA 마운트 시점이 곧 로딩 종료이므로 마운트 즉시 시퀀스 시작이 스펙 의도에 부합 (별도 로딩 화면 신설은 YAGNI).
- **레이스 컨디션**: SpaceBackground와 Hero의 이펙트 실행 순서에 의존하지 않도록 Hero가 (a) state 초기화 시점, (b) 이펙트 진입 시점 두 번 상태를 재확인하고, (c) 4초 안전 타임아웃을 갖는다.
- **타입 일관성**: `computeArrivalIntensity`/`shouldPlayArrival`/`beginArrival`/`concludeArrival`/`getArrivalStatus`/`ARRIVAL_DONE_EVENT` 시그니처가 Task 1↔2↔3에서 일치함을 확인.
- **회귀**: 시퀀스 비재생 경로(모바일/reduced-motion/스크롤 복원/비메인 첫 진입)는 전부 'skipped' 즉시 종결 → Hero 즉시 등장으로 기존 동작과 동일.
