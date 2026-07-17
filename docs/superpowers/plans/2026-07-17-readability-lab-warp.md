# Readability & Lab Warp Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 섹션 본문 가독성을 틴트 감광+스크림으로 확보하고, Lab 진입을 "우주로 완전히 빨려들어가는" 워프 부스트 연출로 교체한다.

**Architecture:** 가독성은 순수 팔레트 값 교체(`sectionTint.js`) + 공통 CSS 스크림 1곳. Lab 전환은 `arrivalSequence.js` 패턴을 따르는 순수 타임라인 모듈(`warpBoost.js`)이 window 이벤트로 SpaceBackground의 `intensitySmooth`를 하이재킹하고(우선순위: 부스트 > 도착 시퀀스 > 스크롤 워프, warpEnabled와 무관하게 끝까지 재생), LabTransition은 블랙홀 비주얼 대신 부스트 오케스트레이션(콘텐츠 확대·페이드 → 피크 화이트 플래시에서 네비게이션 → 해제)을 담당한다.

**Tech Stack:** Three.js 0.184 (기존 SpaceBackground), Vitest (environment: node), Playwright, React 19.

## Global Constraints

- 작업 브랜치: `feat/hero-arrival` (현재 브랜치 그대로).
- **선행 조건 (Task 1 Step 1)**: 현재 미커밋 변경(사용자 WIP: Navbar.jsx, LabTransition/, MainInCanvas/, SeoulNights/, 각종 css)을 먼저 보존 커밋한 뒤 그 위에 쌓는다.
- 부스트 타임라인: 0 → 피크 **1.4** ease-in-cubic **800ms** → 피크 유지 **200ms** → ease-out-cubic 해제 **700ms** → 0. FOV는 SpaceBackground에서 **150° 상한 클램프**.
- 부스트는 `warpEnabled`와 무관하게 끝까지 재생 (라우트가 /gallery로 바뀌어도 해제 곡선 유지). 부스트 시작 시 진행 중인 도착 시퀀스는 즉시 'done' 종결.
- `prefers-reduced-motion`: 부스트 생략, 빠른 페이드 전환, "Lab에 도착하였습니다" 문구 유지.
- 순수 계산은 별도 파일 + vitest (기존 `arrivalSequence.js` 패턴). R3F 전환 금지.
- 커밋 컨벤션: `feat(space-bg):`, `feat(lab):`, `fix(...)`, `test(e2e):`, `tune(...)`.
- baseline: 시작 전 `npm test` 40개 통과 확인. `npm run lint`는 pre-existing 실패 상태 — 스코프 lint(이번에 만지는 파일)만 신규 에러 0 확인. `lab-gallery.spec.js` e2e는 WIP 커밋 후 상태를 그대로 보고.

---

### Task 1: 사용자 WIP 보존 커밋 + SECTION_TINTS 감광

**Files:**
- Modify: `src/components/SpaceBackground/sectionTint.js:6-13` (팔레트 값만)

**Interfaces:**
- Consumes: 없음
- Produces: 어두워진 `SECTION_TINTS` (구조·이름·개수 불변 — 기존 소비자 영향 없음)

- [ ] **Step 1: 사용자 WIP 보존 커밋**

현재 작업 트리의 모든 미커밋 변경은 사용자의 lab gallery v2 병행 작업 잔여분이다 (사용자 확인 완료: 해당 세션 종료, 커밋해 보존하기로 승인됨).

```bash
git add -A
git commit -m "wip(lab): preserve in-progress gallery v2 working tree before warp entry work"
```

- [ ] **Step 2: baseline 확인**

Run: `npm test`
Expected: 40개 테스트 PASS (실패 시 중단하고 보고).

- [ ] **Step 3: 팔레트 값 교체**

`src/components/SpaceBackground/sectionTint.js`의 `SECTION_TINTS` 배열을 다음으로 교체 (색조 방향 유지, 밝기 약 절반 — sRGB 출력 수정 이후 체감 밝기 보정 겸 본문 대비 확보):

```js
export const SECTION_TINTS = [
  [0.024, 0.024, 0.037], // home     — 기본 우주색 (더 어둡게)
  [0.016, 0.027, 0.055], // about    — 딥 블루
  [0.010, 0.035, 0.039], // skills   — 틸
  [0.035, 0.016, 0.051], // projects — 퍼플
  [0.045, 0.022, 0.027], // contact  — 웜 레드
  [0.012, 0.016, 0.029], // footer   — 다크 네이비
]
```

주석은 위와 같이 갱신한다 (home 주석의 `#0a0a0f` 표기는 더 이상 정확하지 않으므로 "더 어둡게"로 교체).

- [ ] **Step 4: 테스트 확인**

Run: `npm test`
Expected: 40개 PASS — sectionTint 테스트는 `SECTION_TINTS` 상수를 참조하므로 값 교체로 깨지지 않는다. 깨진다면 테스트가 리터럴 값을 하드코딩한 것이므로 중단하고 보고.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/sectionTint.js
git commit -m "tune(space-bg): darken section tints for body text contrast"
```

---

### Task 2: 섹션 콘텐츠 스크림

**Files:**
- Modify: `src/index.css` (파일 끝에 규칙 추가)

**Interfaces:**
- Consumes: 섹션 루트 클래스 — `About.jsx`의 `<section className="about section">`, 같은 패턴의 `.skills`, `.projects`, `.contact` (각 섹션의 직계 자식으로 `<div className="container">`)
- Produces: 없음 (시각 효과만)

- [ ] **Step 1: 스크림 규칙 추가**

`src/index.css` 끝에 추가:

```css
/* ==== 섹션 본문 가독성 스크림 ====
   별/블룸이 텍스트 바로 뒤에서 빛나지 않도록 콘텐츠 뒤에 은은한
   방사형 어둠을 깐다. 블러 없는 순수 그라데이션이라 렌더 비용은 없다.
   Hero는 대상이 아니다 (가독성 문제 지점이 섹션 본문으로 확인됨). */
.about,
.skills,
.projects,
.contact {
  position: relative;
}

.about::before,
.skills::before,
.projects::before,
.contact::before {
  content: '';
  position: absolute;
  inset: -6% 0;
  background: radial-gradient(
    ellipse 72% 62% at 50% 50%,
    rgba(5, 6, 12, 0.55),
    rgba(5, 6, 12, 0) 74%
  );
  pointer-events: none;
  z-index: 0;
}

.about > .container,
.skills > .container,
.projects > .container,
.contact > .container {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 2: 기존 스타일 충돌 확인**

각 섹션 CSS(`src/sections/*/*.css`)에서 해당 루트 클래스에 이미 `position` 지정이 있는지 grep으로 확인:

Run: `grep -n "^\.about {\|^\.skills {\|^\.projects {\|^\.contact {" src/sections/*/*.css`

이미 `position: relative`면 중복이지만 무해. `position: absolute/fixed` 등 다른 값이 지정돼 있으면 index.css의 `position: relative` 선언만 제거하고 보고.

- [ ] **Step 3: 테스트 + 수동 확인**

Run: `npm test`
Expected: 40개 PASS.

Run: `npm run dev` — 데스크톱에서 About/Skills/Projects/Contact 섹션 본문 뒤가 은은하게 어두워지고 별이 텍스트를 관통하지 않는지, 스크림 가장자리가 눈에 띄는 경계 없이 자연스러운지.

- [ ] **Step 4: 커밋**

```bash
git add src/index.css
git commit -m "feat(sections): add radial scrim behind section content for readability"
```

---

### Task 3: 워프 부스트 순수 모듈 (`warpBoost.js`)

**Files:**
- Create: `src/components/SpaceBackground/warpBoost.js`
- Test: `src/components/SpaceBackground/warpBoost.test.js`

**Interfaces:**
- Consumes: 없음
- Produces (Task 4·5가 import):
  - `WARP_BOOST_EVENT: string`
  - `BOOST_CHARGE_MS = 800`, `BOOST_PEAK_MS = 200`, `BOOST_RELEASE_MS = 700`, `BOOST_PEAK_INTENSITY = 1.4`
  - `computeBoostIntensity(elapsedMs: number) => { intensity: number, phase: 'charging' | 'peak' | 'release' | 'done' }`
  - `requestWarpBoost(): void` — window에 `WARP_BOOST_EVENT` dispatch

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SpaceBackground/warpBoost.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/SpaceBackground/warpBoost.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/components/SpaceBackground/warpBoost.js`:

```js
// Lab 진입 워프 부스트: 스크롤 워프 최대치(1.0)를 넘는 세기로 카메라가
// 별필드를 관통하며 "우주로 완전히 빨려들어가는" 정점을 만든다.
// LabTransition이 requestWarpBoost()로 시작을 요청하면 SpaceBackground가
// 이 타임라인으로 intensity를 직접 구동한다. 부스트는 라우트 변경과
// 무관하게 끝까지 재생된다 (갤러리 도착 후 자연 감속).

export const WARP_BOOST_EVENT = 'space-warp:boost'
export const BOOST_CHARGE_MS = 800
export const BOOST_PEAK_MS = 200
export const BOOST_RELEASE_MS = 700
export const BOOST_PEAK_INTENSITY = 1.4

// 가속: ease-in-cubic (점점 빨라지며 빨려듦), 해제: ease-out-cubic.
export function computeBoostIntensity(elapsedMs) {
  if (elapsedMs < BOOST_CHARGE_MS) {
    const t = Math.max(0, elapsedMs) / BOOST_CHARGE_MS
    return { intensity: BOOST_PEAK_INTENSITY * t * t * t, phase: 'charging' }
  }
  const afterCharge = elapsedMs - BOOST_CHARGE_MS
  if (afterCharge < BOOST_PEAK_MS) {
    return { intensity: BOOST_PEAK_INTENSITY, phase: 'peak' }
  }
  const afterPeak = afterCharge - BOOST_PEAK_MS
  if (afterPeak < BOOST_RELEASE_MS) {
    const remain = 1 - afterPeak / BOOST_RELEASE_MS
    return { intensity: BOOST_PEAK_INTENSITY * remain * remain * remain, phase: 'release' }
  }
  return { intensity: 0, phase: 'done' }
}

export function requestWarpBoost() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WARP_BOOST_EVENT))
  }
}
```

- [ ] **Step 4: 통과 확인 + 전체 스위트**

Run: `npx vitest run src/components/SpaceBackground/warpBoost.test.js`
Expected: 8개 PASS.

Run: `npm test`
Expected: 48개 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/warpBoost.js src/components/SpaceBackground/warpBoost.test.js
git commit -m "feat(space-bg): add pure warp boost timeline for lab entry"
```

---

### Task 4: SpaceBackground 부스트 통합

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx` (import, 이벤트 리스너, tick 분기, zoomDriver, FOV 클램프, cleanup)

**Interfaces:**
- Consumes: Task 3의 `WARP_BOOST_EVENT`, `computeBoostIntensity`; 기존 `arrivalActive`/`concludeArrival`/`intensitySmooth`
- Produces: 없음 (LabTransition이 이벤트만 쏘면 배경이 반응)

- [ ] **Step 1: import 추가**

```js
import { WARP_BOOST_EVENT, computeBoostIntensity } from './warpBoost.js'
```

- [ ] **Step 2: 부스트 상태와 리스너 추가**

`const clock = new THREE.Clock()` 라인(약 142행) 바로 **아래**에 추가:

```js
    // Lab 진입 부스트: 이벤트 수신 시점부터 타임라인을 재생한다.
    // 진행 중인 도착 시퀀스가 있으면 즉시 종결한다 (우선순위: 부스트 >
    // 도착 시퀀스 > 스크롤 워프).
    let boostStartT = null
    const onWarpBoost = () => {
      boostStartT = clock.getElapsedTime()
      if (arrivalActive) {
        arrivalActive = false
        concludeArrival('done')
      }
    }
    window.addEventListener(WARP_BOOST_EVENT, onWarpBoost)
```

- [ ] **Step 3: tick 분기 수정**

tick 루프의 현재 intensity 블록:

```js
      if (arrivalActive && !warpEnabledRef.current) {
        arrivalActive = false
        concludeArrival('done')
      }
      if (arrivalActive) {
```

의 두 번째 `if (arrivalActive) {`를 다음으로 교체 (부스트 분기가 최우선, 도착/스크롤 분기는 else-if 체인으로):

```js
      if (boostStartT !== null) {
        // 부스트는 warpEnabled와 무관하게 끝까지 재생 — 라우트가 /gallery로
        // 바뀌어도 해제 곡선이 이어져 도착 후 자연 감속한다.
        const boost = computeBoostIntensity((t - boostStartT) * 1000)
        intensitySmooth = boost.intensity
        if (boost.phase === 'done') boostStartT = null
      } else if (arrivalActive) {
```

(기존 arrival 본문과 그 아래 else 블록은 그대로 — 첫 분기만 앞에 끼워 넣는 형태.)

- [ ] **Step 4: zoomDriver와 FOV 클램프 수정**

기존:

```js
      const zoomDriver = warpEnabledRef.current ? intensitySmooth : scrollPercentSmooth
```

를 다음으로 교체:

```js
      // 부스트 중에는 라우트와 무관하게 intensity가 카메라를 구동해야 한다.
      const zoomDriver = (warpEnabledRef.current || boostStartT !== null)
        ? intensitySmooth
        : scrollPercentSmooth
```

기존:

```js
      camera.fov = 75 + Math.pow(zoomDriver, 1.5) * 45
```

를 다음으로 교체:

```js
      // 부스트 피크(1.4)에서 기존 공식은 ~150°를 넘어 왜곡이 깨진다 — 클램프.
      camera.fov = Math.min(150, 75 + Math.pow(zoomDriver, 1.5) * 45)
```

- [ ] **Step 5: cleanup에 리스너 해제 추가**

cleanup(return 함수)의 `window.removeEventListener('scroll', onScroll)` 옆에 추가:

```js
      window.removeEventListener(WARP_BOOST_EVENT, onWarpBoost)
```

- [ ] **Step 6: 테스트 + 빌드**

Run: `npm test && npm run build`
Expected: 48개 PASS, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): drive warp boost timeline across route changes"
```

---

### Task 5: LabTransition 비주얼 교체 (워프 오케스트레이션)

**Files:**
- Modify: `src/components/LabTransition/LabTransition.jsx` (전면 교체)
- Modify: `src/components/LabTransition/LabTransition.css` (전면 교체)
- Modify: `src/index.css` (warp-exit 규칙 추가)

**Interfaces:**
- Consumes: Task 3의 `requestWarpBoost`, `BOOST_CHARGE_MS`, `BOOST_PEAK_MS`, `BOOST_RELEASE_MS`
- Produces: 없음. **Navbar와의 계약 유지**: `<LabTransition origin onNavigate onDone />` — origin은 받되 사용하지 않음, onNavigate/onDone 호출 시점만 새 타임라인으로 변경. Navbar.jsx는 수정하지 않는다.

- [ ] **Step 1: LabTransition.jsx 전면 교체**

```jsx
import { useEffect, useRef, useState } from 'react'
import './LabTransition.css'
import {
  requestWarpBoost,
  BOOST_CHARGE_MS,
  BOOST_PEAK_MS,
  BOOST_RELEASE_MS,
} from '../SpaceBackground/warpBoost.js'

const FLASH_LEAD_MS = 150
const TEXT_HOLD_MS = 900
const TEXT_OUT_MS = 400
const REDUCED_NAV_MS = 250
const REDUCED_DONE_MS = 800

// Lab 이동: 배경 우주 워프가 최대로 가속(부스트)하며 페이지 콘텐츠가
// 카메라를 지나쳐 사라지고, 정점의 화이트 플래시 순간 라우트를 바꾼 뒤
// 워프가 풀리며 갤러리가 드러난다. origin prop은 시각적으로 더 이상
// 쓰지 않지만 Navbar 계약 유지를 위해 시그니처에 남긴다.
// eslint-disable-next-line no-unused-vars
export default function LabTransition({ origin, onNavigate, onDone }) {
  const [flash, setFlash] = useState(false)
  const [showText, setShowText] = useState(false)

  // onNavigate/onDone은 부모(Navbar)가 매 렌더 새 인라인 함수로 넘긴다.
  // 타이머 예약은 마운트 시 한 번만 돌아야 하므로 최신 콜백은 ref로 읽는다.
  const callbacksRef = useRef({ onNavigate, onDone })
  callbacksRef.current = { onNavigate, onDone }

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reducedMotion) {
      // 부스트 없이 어두운 오버레이 + 문구만 짧게.
      const timers = [
        setTimeout(() => callbacksRef.current.onNavigate(), REDUCED_NAV_MS),
        setTimeout(() => setShowText(true), REDUCED_NAV_MS),
        setTimeout(() => setShowText(false), REDUCED_NAV_MS + TEXT_HOLD_MS),
        setTimeout(
          () => callbacksRef.current.onDone(),
          REDUCED_DONE_MS + TEXT_HOLD_MS,
        ),
      ]
      return () => timers.forEach(clearTimeout)
    }

    requestWarpBoost()
    document.body.classList.add('warp-exit')

    const navAt = BOOST_CHARGE_MS + BOOST_PEAK_MS / 2
    const timers = [
      setTimeout(() => setFlash(true), BOOST_CHARGE_MS - FLASH_LEAD_MS),
      setTimeout(() => {
        callbacksRef.current.onNavigate()
        document.body.classList.remove('warp-exit')
      }, navAt),
      setTimeout(() => setFlash(false), BOOST_CHARGE_MS + BOOST_PEAK_MS),
      setTimeout(() => setShowText(true), BOOST_CHARGE_MS + BOOST_PEAK_MS),
      setTimeout(
        () => setShowText(false),
        BOOST_CHARGE_MS + BOOST_PEAK_MS + TEXT_HOLD_MS,
      ),
      setTimeout(
        () => callbacksRef.current.onDone(),
        BOOST_CHARGE_MS + BOOST_PEAK_MS + BOOST_RELEASE_MS + TEXT_HOLD_MS + TEXT_OUT_MS,
      ),
    ]
    return () => {
      timers.forEach(clearTimeout)
      document.body.classList.remove('warp-exit')
    }
    // reducedMotion은 마운트 시점 판정 고정 — 의도적으로 deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`labtransition-overlay ${reducedMotion ? 'labtransition-overlay--reduced' : ''}`}
    >
      <div className={`labtransition-flash ${flash ? 'labtransition-flash--on' : ''}`} />
      <p className={`labtransition-text ${showText ? 'labtransition-text--in' : ''}`}>
        Lab에 도착하였습니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: LabTransition.css 전면 교체**

```css
.labtransition-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
  cursor: none;
}

/* reduced-motion: 워프 없이 어두운 배경 위에 문구만 */
.labtransition-overlay--reduced {
  background: rgba(5, 6, 12, 0.88);
}

/* 부스트 정점의 화이트 플래시 — 빠르게 차오르고 여운을 남기며 사라진다 */
.labtransition-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(255, 255, 255, 0.98),
    rgba(210, 225, 255, 0.9) 45%,
    rgba(255, 255, 255, 0.78)
  );
  opacity: 0;
  transition: opacity 450ms ease-out;
}

.labtransition-flash--on {
  opacity: 1;
  transition-duration: 150ms;
}

.labtransition-text {
  position: relative;
  z-index: 1;
  color: #f0f0ff;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: clamp(1rem, 2.4vw, 1.3rem);
  letter-spacing: 0.08em;
  text-align: center;
  padding: 0 24px;
  text-shadow: 0 2px 18px rgba(5, 6, 12, 0.9);
  opacity: 0;
  filter: blur(6px);
  transform: translateY(8px);
  transition: opacity 400ms ease, filter 400ms ease, transform 400ms ease;
}

.labtransition-text--in {
  opacity: 1;
  filter: blur(0);
  transform: translateY(0);
  transition-duration: 1200ms;
}

@media (prefers-reduced-motion: reduce) {
  .labtransition-flash {
    display: none;
  }
  .labtransition-text {
    transition-duration: 1ms;
  }
}
```

- [ ] **Step 3: index.css에 warp-exit 규칙 추가**

`src/index.css` 끝(Task 2에서 추가한 스크림 규칙 뒤)에 추가:

```css
/* ==== Lab 워프 진입: 페이지 콘텐츠 이탈 ====
   부스트 가속 동안 콘텐츠가 카메라를 지나쳐 사라지듯 확대·페이드된다.
   LabTransition이 body에 warp-exit 클래스를 토글한다. 데스크톱 메인은
   .scroll-viewport, 그 외 라우트/모바일은 main이 콘텐츠 루트다. */
body.warp-exit .scroll-viewport,
body.warp-exit main {
  transition:
    transform 800ms cubic-bezier(0.5, 0, 1, 1),
    opacity 800ms cubic-bezier(0.5, 0, 1, 1);
  transform: scale(1.35);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  body.warp-exit .scroll-viewport,
  body.warp-exit main {
    transition: none;
    transform: none;
    opacity: 1;
  }
}
```

- [ ] **Step 4: 테스트 + 스코프 lint + 수동 확인**

Run: `npm test`
Expected: 48개 PASS.

Run: `npx eslint src/components/LabTransition/LabTransition.jsx`
Expected: 에러 0.

Run: `npm run dev` — 데스크톱에서 Navbar의 Lab 클릭:
(1) 배경 워프가 점점 가속하며 페이지가 확대·페이드로 빨려들어감, (2) 정점에서 화이트 플래시 → 갤러리로 전환, (3) 워프가 풀리며 갤러리 드러남 + "Lab에 도착하였습니다" 문구, (4) 전환 종료 후 오버레이 제거·갤러리 조작 가능, (5) macOS '동작 줄이기' 켜면 어두운 오버레이+문구만으로 빠른 전환.

- [ ] **Step 5: 커밋**

```bash
git add src/components/LabTransition/LabTransition.jsx src/components/LabTransition/LabTransition.css src/index.css
git commit -m "feat(lab): replace black-hole transition with warp boost suck-in"
```

---

### Task 6: e2e + 전체 게이트

**Files:**
- Create: `e2e/lab-warp.spec.js`

**Interfaces:**
- Consumes: Task 3~5 통합 결과 (Lab 클릭 → 부스트 → 갤러리 도착 → 오버레이 정리)
- Produces: 없음 (회귀 방지 게이트)

- [ ] **Step 1: e2e 작성**

`e2e/lab-warp.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('Lab 클릭 시 워프 전환을 거쳐 갤러리에 도착한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  // 도착 시퀀스가 끝나 화면이 안정된 뒤 클릭한다.
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 6000,
  })

  await page.getByRole('link', { name: 'Lab' }).first().click()

  // 피크(~900ms)에 네비게이션이 일어난다.
  await expect(page).toHaveURL(/\/gallery/, { timeout: 4000 })
  // 해제+문구가 끝나면 오버레이가 완전히 정리되어야 한다 (총 ~3.1s).
  await expect(page.locator('.labtransition-overlay')).toHaveCount(0, { timeout: 8000 })

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: e2e 실행**

Run: `npx playwright test e2e/lab-warp.spec.js`
Expected: 1 passed.

- [ ] **Step 3: 전체 게이트**

Run: `npm test && npm run build && npx playwright test`
Expected: vitest 48개 PASS, 빌드 성공, e2e — arrival/warp-visuals/modes/lab-warp 전부 PASS. `lab-gallery.spec.js`는 Task 1에서 사용자 WIP를 커밋한 상태의 결과를 그대로 보고 (통과하면 통과, 실패하면 실패 내용 그대로 — 수정 금지).

스코프 lint: `npx eslint src/components/SpaceBackground/warpBoost.js src/components/LabTransition/LabTransition.jsx e2e/lab-warp.spec.js src/index.css --no-error-on-unmatched-pattern` — 에러 0 (css는 eslint 대상이 아니므로 무시됨).

- [ ] **Step 4: 커밋**

```bash
git add e2e/lab-warp.spec.js
git commit -m "test(e2e): cover lab warp entry transition"
```

---

## Self-Review 결과

- **스펙 커버리지**: 틴트 감광(Task 1), 스크림(Task 2), 부스트 타임라인+클램프(Task 3·4), 라우트 생존 부스트(Task 4 — zoomDriver·분기), LabTransition 비주얼 교체+콘텐츠 이탈+플래시+문구 유지(Task 5), reduced-motion(Task 3 predicate 불필요 — LabTransition이 분기, Task 5), 모바일(부스트는 intensity 경로라 자동 동작, postfx 게이트 기존 유지 — 코드 변경 불필요), WIP 보존 커밋(Task 1 Step 1), e2e(Task 6) — 전부 매핑.
- **타입 일관성**: `computeBoostIntensity`/`requestWarpBoost`/`WARP_BOOST_EVENT`/`BOOST_*` 상수가 Task 3↔4↔5에서 일치. `phase` 문자열 4종 일치.
- **placeholder 스캔**: 없음.
- **주의점 명시**: 부스트 종료 순간 zoomDriver가 scrollPercentSmooth로 복귀하는데, 갤러리 진입 직후는 scrollY≈0이라 둘 다 z=400/fov=75 근방 — 스냅 없음 (Task 4 설계 근거).
