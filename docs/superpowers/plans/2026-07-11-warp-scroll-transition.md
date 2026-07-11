# Warp Scroll Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱 메인 페이지에서 섹션이 바뀔 때마다(About→Skills 등), 지금 있는 우주 배경(SpaceBackground)의 카메라 줌/FOV 효과가 반복적으로 가속했다가 가라앉으며 "우주 속으로 빨려들어가는" 느낌을 주도록 만든다.

**Architecture:** `SpaceBackground.jsx`의 기존 카메라 줌(`camera.position.z`)·FOV 확장 로직을 그대로 재사용하되, 그 입력값을 "페이지 전체 스크롤 비율"(`scrollPercentSmooth`, 한 번만 누적)에서 "현재 섹션 전환 구간 진행도"(0→1→0 포물선, 전환마다 반복)로 교체한다. 새 순수 함수 하나(`computeTransitionIntensity`)를 분리해 유닛 테스트하고, 그 값을 데스크톱에서만 카메라 구동에 사용한다. 모바일과 `prefers-reduced-motion`은 각각 기존 동작 유지/즉시 컷으로 분기한다.

**Tech Stack:** React 19, three.js(기존 의존성), Vitest(이미 설정됨 — `docs/superpowers/plans/2026-07-11-lab-modes.md`에서 도입).

**Spec:** `docs/superpowers/specs/2026-07-11-warp-scroll-transition-design.md` — 이 계획의 요구사항 원본.

## Global Constraints

- 새 컴포넌트·오버레이·행성 오브젝트를 추가하지 않는다. `SpaceBackground.jsx` 한 파일과 그 옆의 순수 함수 파일만 건드린다.
- 각 섹션 콘텐츠(Hero/About/Skills/Projects/Contact)는 손대지 않는다.
- 적용 범위는 데스크톱 슬라이드덱(`min-width: 769px` and `min-height: 701px`)에서만. 모바일은 기존 `scrollPercentSmooth` 기반 동작을 그대로 유지한다.
- `prefers-reduced-motion: reduce`에서는 데스크톱에서도 가속 없이 `camera.z=400`/`fov=75` 고정(즉시 컷).
- 회전(vortex spin, y/x drift)은 이 작업과 무관 — 기존 `scrollPercentSmooth` 기반 그대로 유지, 건드리지 않는다.
- 테스트 명령: `npm test` (vitest). 빌드 확인: `npm run build`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 작업 트리에 이 기능과 무관한 사용자 미커밋 변경이 있을 수 있다 (`src/experiments/`, `Projects.jsx` 등). 커밋 시 이 계획이 만든/수정한 파일만 `git add`.

---

### Task 1: 전환 세기 계산을 순수 함수로 분리

**Files:**
- Create: `src/components/SpaceBackground/transitionIntensity.js`
- Test: `src/components/SpaceBackground/transitionIntensity.test.js`

**Interfaces:**
- Produces: `computeTransitionIntensity(scrollY: number, viewportHeight: number) -> number`. 섹션에 정확히 멈춰 있으면(스크롤 위치가 `viewportHeight`의 정수 배) 0, 두 섹션 사이 정중앙이면 1, 그 사이는 포물선으로 보간. Task 2가 이 함수를 import한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SpaceBackground/transitionIntensity.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeTransitionIntensity } from './transitionIntensity.js'

describe('computeTransitionIntensity', () => {
  it('is 0 exactly at a section boundary', () => {
    expect(computeTransitionIntensity(0, 800)).toBe(0)
    expect(computeTransitionIntensity(800, 800)).toBe(0)
    expect(computeTransitionIntensity(1600, 800)).toBe(0)
  })

  it('peaks at 1 at the midpoint between two adjacent sections', () => {
    expect(computeTransitionIntensity(400, 800)).toBeCloseTo(1, 5)
    expect(computeTransitionIntensity(1200, 800)).toBeCloseTo(1, 5)
  })

  it('is symmetric around the midpoint', () => {
    const before = computeTransitionIntensity(200, 800)
    const after = computeTransitionIntensity(600, 800)
    expect(before).toBeCloseTo(after, 5)
    expect(before).toBeCloseTo(0.75, 5)
  })

  it('returns 0 when viewportHeight is 0 (avoids division by zero)', () => {
    expect(computeTransitionIntensity(500, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module './transitionIntensity.js'`.

- [ ] **Step 3: 구현**

`src/components/SpaceBackground/transitionIntensity.js`:

```js
// 섹션 전환 구간 진행도를 0→1→0 포물선 세기로 변환한다.
// frac=0(섹션에 정지) → intensity=0, frac=0.5(두 섹션 사이 중간) → intensity=1(최고 속도).
export function computeTransitionIntensity(scrollY, viewportHeight) {
  if (viewportHeight <= 0) return 0
  const progress = scrollY / viewportHeight
  const frac = progress - Math.floor(progress)
  return 4 * frac * (1 - frac)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 4 tests passed (기존 Lab Modes 테스트 18개 포함 총 22 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/SpaceBackground/transitionIntensity.js src/components/SpaceBackground/transitionIntensity.test.js
git commit -m "feat(space-bg): add pure transition-intensity function

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SpaceBackground 카메라 줌/FOV를 전환 세기로 구동

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx`

**Interfaces:**
- Consumes: Task 1의 `computeTransitionIntensity(scrollY, viewportHeight)`.

- [ ] **Step 1: import 추가**

`src/components/SpaceBackground/SpaceBackground.jsx` 최상단:

```js
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
```

를 다음으로 교체:

```js
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { computeTransitionIntensity } from './transitionIntensity.js'
```

- [ ] **Step 2: 데스크톱/reduced-motion 판정과 세기 변수 추가**

기존 (77~84번째 줄 부근):

```js
    let scrollPercent = 0
    let scrollPercentSmooth = 0
    
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollPercent = maxScroll > 0 ? window.scrollY / maxScroll : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })
```

를 다음으로 교체:

```js
    let scrollPercent = 0
    let scrollPercentSmooth = 0
    let intensitySmooth = 0

    // 데스크톱 슬라이드덱(섹션마다 정확히 100vh)에서만 섹션 전환 구간 가속을 쓴다.
    // 모바일은 섹션 높이가 콘텐츠에 따라 달라 이 계산이 성립하지 않으므로
    // 기존 페이지 전체 기준(scrollPercentSmooth) 줌을 그대로 유지한다.
    let isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollPercent = maxScroll > 0 ? window.scrollY / maxScroll : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })
```

- [ ] **Step 3: tick() 안에서 카메라 구동 변수를 교체**

기존 (92~108번째 줄 부근):

```js
      // Smooth out scroll progress
      scrollPercentSmooth += (scrollPercent - scrollPercentSmooth) * 0.05
      
      // 1. Vortex rotation: spin the stars on Z axis as we scroll down
      starsPoints.rotation.z = scrollPercentSmooth * 1.8
      
      // Y/X slow rotation + scroll drift
      starsPoints.rotation.y = t * 0.005 + scrollPercentSmooth * 0.15
      starsPoints.rotation.x = Math.sin(t * 0.003) * 0.04 + scrollPercentSmooth * 0.08
      
      // 2. Camera flies deep into the starfield (Z: 400 down to 40)
      // We use a power curve so the zoom feels like it accelerates (sucked-in feeling)
      camera.position.z = 400 - Math.pow(scrollPercentSmooth, 1.2) * 360
      
      // 3. Field of View Expansion: creates an edge-stretching warp speed optical illusion
      camera.fov = 75 + Math.pow(scrollPercentSmooth, 1.5) * 45
      camera.updateProjectionMatrix()
```

를 다음으로 교체:

```js
      // Smooth out scroll progress
      scrollPercentSmooth += (scrollPercent - scrollPercentSmooth) * 0.05

      // 데스크톱+모션 허용 시: 섹션 전환 구간마다 0→1→0으로 반복되는 세기.
      // 그 외(모바일, reduced-motion)에는 0으로 고정하고 zoomDriver가 기존 값을 쓰게 한다.
      const targetIntensity = (isDesktop && !reducedMotion)
        ? computeTransitionIntensity(window.scrollY, window.innerHeight)
        : 0
      intensitySmooth += (targetIntensity - intensitySmooth) * 0.14
      const zoomDriver = isDesktop ? intensitySmooth : scrollPercentSmooth

      // 1. Vortex rotation: spin the stars on Z axis as we scroll down
      starsPoints.rotation.z = scrollPercentSmooth * 1.8
      
      // Y/X slow rotation + scroll drift
      starsPoints.rotation.y = t * 0.005 + scrollPercentSmooth * 0.15
      starsPoints.rotation.x = Math.sin(t * 0.003) * 0.04 + scrollPercentSmooth * 0.08
      
      // 2. Camera flies deep into the starfield (Z: 400 down to 40)
      // We use a power curve so the zoom feels like it accelerates (sucked-in feeling)
      camera.position.z = 400 - Math.pow(zoomDriver, 1.2) * 360
      
      // 3. Field of View Expansion: creates an edge-stretching warp speed optical illusion
      camera.fov = 75 + Math.pow(zoomDriver, 1.5) * 45
      camera.updateProjectionMatrix()
```

- [ ] **Step 4: 리사이즈 시 isDesktop 재판정**

기존 (114~119번째 줄 부근):

```js
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)
```

를 다음으로 교체:

```js
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    }
    window.addEventListener('resize', onResize)
```

- [ ] **Step 5: 회귀 확인 — 단위 테스트 + 빌드**

Run: `npm test`
Expected: PASS — 22 passed (기존 18 + Task 1의 4개).

Run: `npm run build`
Expected: exit 0, 에러 없음.

- [ ] **Step 6: 수동 확인 (브라우저) — 데스크톱**

```bash
npm run dev
```

브라우저 창을 769px 이상 너비·701px 이상 높이로 열고 (`isDesktop` 조건 충족):

1. Home에서 About으로 천천히 스크롤 — 중간 지점에서 별 시야가 빠르게 좁아지며(FOV 확장) 화면이 확 뚫리듯 가속되고, About에 도착하면 원래 상태(FOV 75)로 돌아오는지 확인.
2. About→Skills, Skills→Projects, Projects→Contact로 계속 스크롤 — **매 전환마다** 같은 가속이 반복되는지 확인 (이전처럼 Contact 근처에서 카메라가 극단적으로 확대된 채 고정되지 않아야 함).
3. 섹션에 멈춰서 스크롤을 멈췄을 때 화면이 잔잔한 상태(FOV 75 근처)로 유지되는지 확인.

- [ ] **Step 7: 수동 확인 (브라우저) — 모바일 폭 + reduced motion**

1. 브라우저 창 폭을 768px 이하로 줄이거나 개발자도구 모바일 에뮬레이션으로 전환. Home부터 끝까지 스크롤하며 이전과 동일한(페이지 전체 기준으로 서서히 누적되는) 줌 동작인지 확인 — 이번 변경으로 모바일 동작이 달라지면 안 됨.
2. 다시 데스크톱 폭으로 돌아와 macOS는 시스템 설정의 "동작 줄이기", Chrome DevTools는 Rendering 탭의 "Emulate CSS media feature prefers-reduced-motion: reduce"를 켠 상태로 섹션 전환 스크롤 — 카메라가 가속 없이 고정(FOV 75, z 400 부근)인지 확인.

- [ ] **Step 8: Commit**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): drive camera warp by per-section transition intensity

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
