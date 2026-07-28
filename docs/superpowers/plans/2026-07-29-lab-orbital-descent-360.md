# Lab Orbital Descent & 360° Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Lab page (`/gallery`) coverflow carousel with an orbital descent from space into Earth's upper stratosphere, landing in a 360° panorama where the 14 experiments hang as framed panels the visitor drags to look around and clicks to enter.

**Architecture:** A full-screen GLSL fragment shader draws the background — stars, velocity streaks, curved Earth limb, atmospheric scattering, re-entry plasma, near-field motes — driven by `yaw`/`pitch`/`altitude`/`velocity` uniforms. The 14 works stay real DOM elements on a CSS 3D cylinder, reusing the existing planet artwork. One `requestAnimationFrame` loop reads two pure modules (`descent.js` for the fall timeline, `useLookAround.js` for orientation) and writes the shader uniforms and the ring's transform in the same frame, so background and panels never drift apart.

**Tech Stack:** React 19, three.js 0.184 (fullscreen `ShaderMaterial` quad, same pattern as `NeonRaymarch` / `CloudGallery`), CSS 3D transforms, vitest (node environment, pure-logic tests only), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-29-lab-orbital-descent-360-design.md`

## Global Constraints

- Design spec is authoritative. Where this plan deviates, the deviation is stated explicitly in the task.
- `src/experiments/index.js` is **not** modified. Panel artwork continues to come from `planet`, `color`, `symbol`, `title`, `tags`.
- The existing `.carousel-card` and `.planet-*` CSS class names are **kept**. Roughly 1,200 lines of planet artwork in `Gallery.css` key off `.carousel-card.planet-X` and `.carousel-card.planet-X.active`; renaming would mean rewriting all of it for no gain. Only layout rules change. (Deviation from spec: the spec assumed the e2e `.carousel-card` selector would break. It does not.)
- All 14 panels stay mounted at all times. (Deviation from spec: the spec called for culling panels beyond ±110°. 14 DOM nodes cost nothing, and culling would force a React re-render on every yaw change. `backface-visibility: hidden` hides the ones behind the viewer.)
- Vitest runs with `environment: 'node'` — there is no jsdom. **Only pure modules get unit tests.** React components and WebGL code are verified by `npm run build`, Playwright, and manual observation.
- All user-facing copy goes through `useLang()`. Four locales must stay in sync: `en`, `ko`, `ja`, `zh`. English arrival text is exactly `Lab arrived`.
- `prefers-reduced-motion: reduce` skips the descent entirely and disables inertia.
- Angles are **degrees** in `ring.js` and in component state; the shader receives **radians**. Conversion happens once, at the uniform write.
- Baseline before any change: `npm test` → 26 files, 153 tests, 0 failures. Never let this regress.
- Commit after each task.

---

### Task 1: Ring geometry and orientation math

Pure module. No React, no DOM. Owns where panels sit on the cylinder, which one is in front, and how yaw/pitch are normalised.

**Files:**
- Create: `src/pages/Gallery/ring.js`
- Test: `src/pages/Gallery/ring.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `wrapDeg(deg: number) => number` — normalises to `(-180, 180]`
  - `clampPitch(deg: number) => number` — clamps to `[-PITCH_LIMIT_DEG, PITCH_LIMIT_DEG]`
  - `panelAngle(index: number, count: number) => number` — degrees, `0` for index 0
  - `signedOffset(index: number, count: number, yawDeg: number) => number` — degrees in `(-180, 180]`; `0` means dead ahead
  - `activeIndex(count: number, yawDeg: number) => number`
  - `stepYaw(yawDeg: number, count: number, dir: 1 | -1) => number` — target yaw one panel away
  - `yawForIndex(yawDeg: number, count: number, index: number) => number` — nearest yaw that puts `index` dead ahead, without unwinding accumulated turns
  - `panelGeometry(vw: number, count: number) => { width, height, radius, perspective }` — all px
  - `PITCH_LIMIT_DEG: number` (25)

- [ ] **Step 1: Write the failing test**

Create `src/pages/Gallery/ring.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  wrapDeg,
  clampPitch,
  panelAngle,
  signedOffset,
  activeIndex,
  stepYaw,
  yawForIndex,
  panelGeometry,
  PITCH_LIMIT_DEG,
} from './ring.js'

describe('wrapDeg', () => {
  it('통과 구간은 그대로 둔다', () => {
    expect(wrapDeg(0)).toBe(0)
    expect(wrapDeg(90)).toBe(90)
    expect(wrapDeg(-90)).toBe(-90)
  })

  it('±180을 넘으면 되감는다', () => {
    expect(wrapDeg(190)).toBeCloseTo(-170)
    expect(wrapDeg(-190)).toBeCloseTo(170)
    expect(wrapDeg(360)).toBeCloseTo(0)
    expect(wrapDeg(725)).toBeCloseTo(5)
  })

  it('180은 180으로 남고 -180은 180으로 접힌다', () => {
    expect(wrapDeg(180)).toBe(180)
    expect(wrapDeg(-180)).toBe(180)
  })
})

describe('clampPitch', () => {
  it('한계 안에서는 그대로', () => {
    expect(clampPitch(10)).toBe(10)
    expect(clampPitch(-10)).toBe(-10)
  })

  it('한계를 넘으면 잘린다', () => {
    expect(clampPitch(90)).toBe(PITCH_LIMIT_DEG)
    expect(clampPitch(-90)).toBe(-PITCH_LIMIT_DEG)
  })
})

describe('panelAngle', () => {
  it('14개를 균등 분할한다', () => {
    expect(panelAngle(0, 14)).toBe(0)
    expect(panelAngle(1, 14)).toBeCloseTo(360 / 14)
    expect(panelAngle(13, 14)).toBeCloseTo((360 / 14) * 13)
  })
})

describe('signedOffset', () => {
  it('yaw가 패널 각도와 같으면 정면(0)', () => {
    expect(signedOffset(3, 14, panelAngle(3, 14))).toBeCloseTo(0)
  })

  it('항상 최단 방향을 고른다', () => {
    // 패널 13은 각도 334.3°. yaw 0에서 최단 경로는 -25.7°이지 +334.3°가 아니다.
    expect(signedOffset(13, 14, 0)).toBeCloseTo(-360 / 14)
  })

  it('yaw 랩어라운드를 넘어도 성립한다', () => {
    expect(signedOffset(0, 14, 720)).toBeCloseTo(0)
    expect(signedOffset(0, 14, -360)).toBeCloseTo(0)
  })
})

describe('activeIndex', () => {
  it('yaw 0이면 0번', () => {
    expect(activeIndex(14, 0)).toBe(0)
  })

  it('한 칸 회전하면 다음 패널', () => {
    expect(activeIndex(14, 360 / 14)).toBe(1)
    expect(activeIndex(14, -360 / 14)).toBe(13)
  })

  it('경계 직전까지는 아직 이전 패널이다', () => {
    const step = 360 / 14
    expect(activeIndex(14, step * 0.49)).toBe(0)
    expect(activeIndex(14, step * 0.51)).toBe(1)
  })

  it('여러 바퀴를 돌아도 범위 안이다', () => {
    for (const yaw of [0, 1234, -987, 360 * 5 + 3]) {
      const i = activeIndex(14, yaw)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(14)
    }
  })
})

describe('stepYaw', () => {
  it('한 칸씩 더하고 뺀다', () => {
    expect(stepYaw(0, 14, 1)).toBeCloseTo(360 / 14)
    expect(stepYaw(0, 14, -1)).toBeCloseTo(-360 / 14)
  })

  it('누적 yaw를 유지해 되감기 점프가 없다', () => {
    // 720에서 한 칸 가면 745.7이어야 한다 — 25.7로 되감기면 화면이 튄다.
    expect(stepYaw(720, 14, 1)).toBeCloseTo(720 + 360 / 14)
  })
})

describe('yawForIndex', () => {
  const step = 360 / 14

  it('목표 패널이 정면에 오는 yaw를 준다', () => {
    const y = yawForIndex(0, 14, 5)
    expect(activeIndex(14, y)).toBe(5)
  })

  it('최단 방향으로 간다 — 13번은 뒤로 한 칸', () => {
    expect(yawForIndex(0, 14, 13)).toBeCloseTo(-step)
  })

  it('누적 회전을 풀지 않는다', () => {
    // yaw 720(두 바퀴)에서 1번 패널로 가면 745.7 근처여야지 25.7로 돌아가면 안 된다.
    const y = yawForIndex(720, 14, 1)
    expect(y).toBeCloseTo(720 + step)
  })

  it('이미 정면이면 그대로 둔다', () => {
    expect(yawForIndex(step * 3, 14, 3)).toBeCloseTo(step * 3)
  })
})

describe('panelGeometry', () => {
  it('패널이 겹치지 않을 만큼 반지름을 잡는다', () => {
    for (const vw of [360, 768, 1440, 2560]) {
      const g = panelGeometry(vw, 14)
      // 원주가 패널 14개 폭보다 넉넉히 커야 한다
      expect(2 * Math.PI * g.radius).toBeGreaterThan(14 * g.width)
    }
  })

  it('뷰포트가 커지면 패널도 커지되 상한이 있다', () => {
    expect(panelGeometry(1440, 14).width).toBeGreaterThan(panelGeometry(360, 14).width)
    expect(panelGeometry(4000, 14).width).toBe(panelGeometry(3000, 14).width)
  })

  it('가로세로비와 원근 거리를 함께 돌려준다', () => {
    const g = panelGeometry(1440, 14)
    expect(g.height).toBeCloseTo(g.width * 0.62, 0)
    expect(g.perspective).toBeGreaterThan(g.radius)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/pages/Gallery/ring.test.js`
Expected: FAIL — `Failed to resolve import "./ring.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/pages/Gallery/ring.js`:

```js
// Lab 360° 파노라마의 기하: 패널 14개가 원통 위에 균등 배치되고, 관람자는
// 원점에서 회전만 한다. 여기 있는 함수는 전부 순수 함수 — 각도 단위는 도이며
// 셰이더에 넘길 때만 라디안으로 바꾼다.

export const PITCH_LIMIT_DEG = 25

// (-180, 180] 로 정규화. -180은 180으로 접어 경계에서 부호가 튀지 않게 한다.
export function wrapDeg(deg) {
  const m = ((deg % 360) + 360) % 360
  return m > 180 ? m - 360 : m === 0 ? 0 : m
}

export function clampPitch(deg) {
  return Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, deg))
}

export function panelAngle(index, count) {
  return (360 / count) * index
}

// 시선(yaw)에서 패널까지의 부호 있는 최단 각도차. 0이면 정면.
export function signedOffset(index, count, yawDeg) {
  return wrapDeg(panelAngle(index, count) - yawDeg)
}

export function activeIndex(count, yawDeg) {
  const step = 360 / count
  const raw = Math.round(yawDeg / step)
  return ((raw % count) + count) % count
}

// 화살표/방향키용. yaw를 되감지 않고 누적해 회전이 최단 경로로 이어지게 한다.
export function stepYaw(yawDeg, count, dir) {
  const step = 360 / count
  return (Math.round(yawDeg / step) + dir) * step
}

// 임의의 패널을 정면으로 가져오는 yaw. 누적 회전수를 유지한 채 최단 방향을
// 고른다 — 그러지 않으면 여러 바퀴 돈 뒤 패널을 누를 때 링이 통째로 되감긴다.
export function yawForIndex(yawDeg, count, index) {
  const step = 360 / count
  const current = Math.round(yawDeg / step)
  let delta = (((index - current) % count) + count) % count
  if (delta > count / 2) delta -= count
  return (current + delta) * step
}

// 패널 크기와 링 반지름. 반지름은 원주가 패널 폭 합의 1.25배 이상이 되도록
// 잡아 이웃 패널이 겹치지 않게 한다.
export function panelGeometry(vw, count) {
  const width = Math.round(Math.min(vw * 0.62, 760))
  const height = Math.round(width * 0.62)
  const radius = Math.round((count * width * 1.25) / (2 * Math.PI))
  return { width, height, radius, perspective: radius * 2 }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/pages/Gallery/ring.test.js`
Expected: PASS — all assertions green.

- [ ] **Step 5: Confirm the full suite still passes**

Run: `npm test`
Expected: 27 files, 153 + new tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Gallery/ring.js src/pages/Gallery/ring.test.js
git commit -m "feat(lab): ring geometry and orientation math for 360 gallery"
```

---

### Task 2: Descent timeline

Pure module. Converts elapsed milliseconds into every value the descent drives. The velocity curve is the whole point — it must accelerate hard, cruise, then brake sharply, because perceived speed comes from rate of change.

**Files:**
- Create: `src/pages/Gallery/descent.js`
- Test: `src/pages/Gallery/descent.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `computeDescent(elapsedMs: number) => DescentState`
  - `landedState() => DescentState`
  - `DESCENT_DURATION_MS: number` (3200)
  - `ACCEL_END: number` (0.25), `BRAKE_START: number` (0.72), `PANEL_REVEAL_START: number` (0.66)
  - `DescentState = { progress, velocity, altitude, fovDeg, plasma, shake, panelReveal, done }`
    - `progress` 0→1, `velocity` 0→1→0 (felt speed), `altitude` 1 (deep space) → 0 (stratosphere), `fovDeg` 75→120→75, `plasma`/`shake`/`panelReveal` 0→1 ranges, `done` boolean.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Gallery/descent.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  computeDescent,
  landedState,
  DESCENT_DURATION_MS,
  ACCEL_END,
  BRAKE_START,
  PANEL_REVEAL_START,
} from './descent.js'

const at = (p) => computeDescent(DESCENT_DURATION_MS * p)

describe('computeDescent — 시작과 끝', () => {
  it('0ms에서는 우주 한가운데, 아직 멈춰 있다', () => {
    const s = computeDescent(0)
    expect(s.progress).toBe(0)
    expect(s.altitude).toBeCloseTo(1, 5)
    expect(s.velocity).toBeCloseTo(0, 5)
    expect(s.panelReveal).toBe(0)
    expect(s.done).toBe(false)
  })

  it('끝나면 착지 상태로 수렴한다', () => {
    const s = computeDescent(DESCENT_DURATION_MS)
    expect(s.altitude).toBeCloseTo(0, 5)
    expect(s.velocity).toBeCloseTo(0, 5)
    expect(s.panelReveal).toBeCloseTo(1, 5)
    expect(s.done).toBe(true)
  })

  it('타임라인을 지나도 값이 발산하지 않는다', () => {
    const s = computeDescent(DESCENT_DURATION_MS * 10)
    expect(s).toEqual(computeDescent(DESCENT_DURATION_MS))
  })

  it('음수 시간은 시작 상태로 취급한다', () => {
    expect(computeDescent(-500)).toEqual(computeDescent(0))
  })
})

describe('computeDescent — 속도 곡선', () => {
  it('가속 구간에서 단조 증가한다', () => {
    expect(at(ACCEL_END * 0.25).velocity).toBeLessThan(at(ACCEL_END * 0.75).velocity)
  })

  it('순항 구간은 최고 속도를 유지한다', () => {
    expect(at((ACCEL_END + BRAKE_START) / 2).velocity).toBeCloseTo(1, 5)
    expect(at(ACCEL_END).velocity).toBeCloseTo(1, 5)
  })

  it('제동 구간에서 급격히 떨어진다', () => {
    const early = at(BRAKE_START + 0.05).velocity
    const late = at(BRAKE_START + 0.2).velocity
    expect(early).toBeLessThan(1)
    expect(late).toBeLessThan(early)
    // 5제곱 감쇠 — 제동 중반이면 이미 대부분 죽어 있어야 한다
    expect(at((BRAKE_START + 1) / 2).velocity).toBeLessThan(0.05)
  })

  it('속도는 항상 0..1 범위다', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const v = at(p).velocity
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('computeDescent — 고도', () => {
  it('하강 본구간에서 단조 감소한다', () => {
    let prev = Infinity
    for (let p = 0; p <= 0.85; p += 0.02) {
      const a = at(p).altitude
      expect(a).toBeLessThanOrEqual(prev + 1e-9)
      prev = a
    }
  })

  it('착지 직전 살짝 지나쳤다 되돌아온다', () => {
    let min = Infinity
    for (let p = 0.85; p <= 1; p += 0.005) min = Math.min(min, at(p).altitude)
    expect(min).toBeLessThan(0)
    expect(min).toBeGreaterThan(-0.1)
    expect(at(1).altitude).toBeCloseTo(0, 5)
  })
})

describe('computeDescent — 연출 채널', () => {
  it('시야각은 속도를 따라 넓어졌다 돌아온다', () => {
    expect(computeDescent(0).fovDeg).toBeCloseTo(75, 5)
    expect(at((ACCEL_END + BRAKE_START) / 2).fovDeg).toBeGreaterThan(110)
    expect(computeDescent(DESCENT_DURATION_MS).fovDeg).toBeCloseTo(75, 5)
  })

  it('플라즈마는 대기권 구간에서만 타오른다', () => {
    expect(at(0.1).plasma).toBeCloseTo(0, 5)
    expect(at(0.62).plasma).toBeGreaterThan(0.9)
    expect(at(1).plasma).toBeCloseTo(0, 5)
  })

  it('셰이크는 플라즈마보다 좁고 약하다', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const s = at(p)
      expect(s.shake).toBeLessThanOrEqual(s.plasma + 1e-9)
      expect(s.shake).toBeGreaterThanOrEqual(0)
    }
  })

  it('패널은 마지막 3분의 1에서만 드러난다', () => {
    expect(at(PANEL_REVEAL_START - 0.01).panelReveal).toBe(0)
    expect(at(PANEL_REVEAL_START + 0.01).panelReveal).toBeGreaterThan(0)
    expect(at(1).panelReveal).toBeCloseTo(1, 5)
  })
})

describe('landedState', () => {
  it('타임라인 끝과 같은 값이다', () => {
    expect(landedState()).toEqual(computeDescent(DESCENT_DURATION_MS))
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/pages/Gallery/descent.test.js`
Expected: FAIL — `Failed to resolve import "./descent.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/pages/Gallery/descent.js`:

```js
// 우주 → 성층권 진입 타임라인. 속도감이 목적이므로 등속이 아니라
// "급가속 → 순항 → 급제동"으로 짠다. 체감 속도는 속도값 자체가 아니라
// 변화율에서 나오기 때문에, 짧고 급하게 멈추는 쪽이 길고 균일한 쪽보다
// 훨씬 빠르게 느껴진다.
//
// altitude는 velocity를 실제로 적분해 얻는다 — 두 값을 따로 정의하면
// 하늘이 움직이는 속도와 별 스트릭 길이가 어긋나 보인다.

export const DESCENT_DURATION_MS = 3200

export const ACCEL_END = 0.25          // 가속이 끝나는 진행도
export const BRAKE_START = 0.72        // 제동이 시작되는 진행도
export const PANEL_REVEAL_START = 0.66 // 패널이 드러나기 시작하는 진행도

const PLASMA_START = 0.35
const PLASMA_SPAN = 0.55
const SETTLE_START = 0.86
const SETTLE_DEPTH = 0.045             // 착지 시 지나치는 깊이

// v(p): 0..1. 가속은 제곱, 순항은 1, 제동은 5제곱 감쇠.
function velocityAt(p) {
  if (p <= 0) return 0
  if (p < ACCEL_END) {
    const t = p / ACCEL_END
    return t * t
  }
  if (p < BRAKE_START) return 1
  if (p >= 1) return 0
  const u = 1 - (p - BRAKE_START) / (1 - BRAKE_START)
  return u * u * u * u * u
}

// ∫v dp 를 구간별 닫힌 형태로. 전체 적분값으로 나눠 0..1로 정규화한다.
const TOTAL_DISTANCE =
  ACCEL_END / 3 + (BRAKE_START - ACCEL_END) + (1 - BRAKE_START) / 6

function distanceAt(p) {
  if (p <= 0) return 0
  if (p >= 1) return TOTAL_DISTANCE
  if (p < ACCEL_END) return (p * p * p) / (3 * ACCEL_END * ACCEL_END)
  const accel = ACCEL_END / 3
  if (p < BRAKE_START) return accel + (p - ACCEL_END)
  const cruise = BRAKE_START - ACCEL_END
  const u = 1 - (p - BRAKE_START) / (1 - BRAKE_START)
  return accel + cruise + ((1 - BRAKE_START) / 6) * (1 - u ** 6)
}

// 0에서 1로 올랐다 0으로 떨어지는 반주기 사인 범프.
function bump(p, start, span) {
  if (p <= start || p >= start + span) return 0
  return Math.sin(Math.PI * ((p - start) / span))
}

export function computeDescent(elapsedMs) {
  const progress = Math.max(0, Math.min(1, elapsedMs / DESCENT_DURATION_MS))
  const velocity = velocityAt(progress)

  // 착지 순간 살짝 지나쳤다 되돌아오는 정착. "멈췄다"를 몸으로 느끼게 한다.
  const settle = bump(progress, SETTLE_START, 1 - SETTLE_START) * SETTLE_DEPTH
  const altitude = 1 - distanceAt(progress) / TOTAL_DISTANCE - settle

  const plasma = bump(progress, PLASMA_START, PLASMA_SPAN)
  const panelReveal =
    progress <= PANEL_REVEAL_START
      ? 0
      : (progress - PANEL_REVEAL_START) / (1 - PANEL_REVEAL_START)

  return {
    progress,
    velocity,
    altitude,
    fovDeg: 75 + velocity * 45,
    plasma,
    shake: plasma * plasma * 0.55,
    panelReveal,
    done: elapsedMs >= DESCENT_DURATION_MS,
  }
}

export function landedState() {
  return computeDescent(DESCENT_DURATION_MS)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/pages/Gallery/descent.test.js`
Expected: PASS.

If the `panelReveal` boundary assertion fails at exactly `PANEL_REVEAL_START`, note that `progress <= PANEL_REVEAL_START` returns `0` by design — the test probes `±0.01` around it, not the point itself.

- [ ] **Step 5: Confirm the full suite still passes**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Gallery/descent.js src/pages/Gallery/descent.test.js
git commit -m "feat(lab): descent timeline with accelerate-cruise-brake velocity curve"
```

---

### Task 3: Localised Lab copy

The Lab currently hard-codes Korean while the app's default language is English. Every string the new page shows goes into all four locales.

**Files:**
- Modify: `src/i18n/translations.js` (add a `lab` object to each of the four locale blocks: `en` starts line 2, `ko` line 90, `ja` line 178, `zh` line 266 — line numbers shift as you edit; anchor on the locale keys instead)
- Create: `src/i18n/translations.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `t.lab` on every locale, with keys `eyebrow`, `title`, `hint`, `arrived`, `enter`, `descending`.

- [ ] **Step 1: Write the failing test**

Create `src/i18n/translations.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { translations } from './translations.js'

const LOCALES = ['en', 'ko', 'ja', 'zh']
const LAB_KEYS = ['eyebrow', 'title', 'hint', 'arrived', 'enter', 'descending']

describe('translations.lab', () => {
  it('네 개 로케일이 모두 있다', () => {
    expect(Object.keys(translations).sort()).toEqual([...LOCALES].sort())
  })

  for (const locale of LOCALES) {
    it(`${locale}에 lab 문구가 모두 있다`, () => {
      const lab = translations[locale].lab
      expect(lab).toBeDefined()
      for (const key of LAB_KEYS) {
        expect(typeof lab[key]).toBe('string')
        expect(lab[key].length).toBeGreaterThan(0)
      }
    })
  }

  it('영어 도착 문구는 "Lab arrived"다', () => {
    expect(translations.en.lab.arrived).toBe('Lab arrived')
  })

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const arrived = LOCALES.map((l) => translations[l].lab.arrived)
    expect(new Set(arrived).size).toBe(LOCALES.length)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/i18n/translations.test.js`
Expected: FAIL — `expected undefined to be defined` for `translations.en.lab`.

- [ ] **Step 3: Add the `lab` block to each locale**

In `src/i18n/translations.js`, insert into the **`en`** locale object (alongside `nav`, `hero`, …):

```js
    lab: {
      eyebrow: 'interactive lab — orbital descent',
      title: 'Experiments',
      hint: 'Drag to look around · click a work to enter',
      arrived: 'Lab arrived',
      enter: 'Enter',
      descending: 'Entering atmosphere...',
    },
```

Into **`ko`**:

```js
    lab: {
      eyebrow: 'interactive lab — 궤도 진입',
      title: '실험실',
      hint: '드래그해 둘러보고, 작품을 클릭해 들어가세요',
      arrived: 'Lab에 도착하였습니다',
      enter: '들어가기',
      descending: '대기권 진입 중...',
    },
```

Into **`ja`**:

```js
    lab: {
      eyebrow: 'interactive lab — 軌道降下',
      title: '実験室',
      hint: 'ドラッグで見回し、作品をクリックして入ります',
      arrived: 'Lab に到着しました',
      enter: '入る',
      descending: '大気圏に突入中...',
    },
```

Into **`zh`**:

```js
    lab: {
      eyebrow: 'interactive lab — 轨道降落',
      title: '实验室',
      hint: '拖动环视，点击作品进入',
      arrived: '已抵达 Lab',
      enter: '进入',
      descending: '正在进入大气层...',
    },
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/i18n/translations.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm the full suite still passes**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/translations.js src/i18n/translations.test.js
git commit -m "feat(i18n): localised Lab copy across en/ko/ja/zh"
```

---

### Task 4: Sky shader source

The GLSL lives in a plain `.js` string module so it can be asserted against in a node-environment test, matching `clouds.glsl.js` / `clouds.glsl.test.js`.

The shader draws, back to front: stars (stretched into streaks by velocity), the curved Earth limb and its scattering bands, re-entry plasma at the lower edge, and near-field motes whipping past.

**Files:**
- Create: `src/pages/Gallery/sky.glsl.js`
- Test: `src/pages/Gallery/sky.glsl.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SKY_FRAG: string`, `SKY_VERT: string`, `SKY_UNIFORM_NAMES: string[]`.
  Uniforms: `uRes`, `uTime`, `uYaw`, `uPitch`, `uAltitude`, `uVelocity`, `uTanFov`, `uPlasma`, `uQuality`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Gallery/sky.glsl.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { SKY_FRAG, SKY_VERT, SKY_UNIFORM_NAMES } from './sky.glsl.js'

describe('SKY_FRAG', () => {
  it('비어 있지 않은 셰이더 문자열이다', () => {
    expect(typeof SKY_FRAG).toBe('string')
    expect(SKY_FRAG.length).toBeGreaterThan(500)
  })

  it('컴포넌트가 구동하는 유니폼을 모두 선언한다', () => {
    // 이름이 본문 어딘가에 등장하는 것으로는 부족하다 — 실제 uniform
    // 선언문이 있어야 SkyCanvas가 값을 밀어 넣을 수 있다.
    for (const u of SKY_UNIFORM_NAMES) {
      expect(SKY_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
    }
  })

  it('선언만 하고 쓰지 않는 유니폼이 없다', () => {
    for (const u of SKY_UNIFORM_NAMES) {
      const uses = SKY_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('유니폼 목록에 필요한 채널이 다 들어 있다', () => {
    expect(SKY_UNIFORM_NAMES).toEqual([
      'uRes', 'uTime', 'uYaw', 'uPitch',
      'uAltitude', 'uVelocity', 'uTanFov', 'uPlasma', 'uQuality',
    ])
  })

  it('gl_FragColor에 정확히 한 번 쓴다', () => {
    const matches = SKY_FRAG.match(/gl_FragColor\s*=/g) || []
    expect(matches).toHaveLength(1)
  })

  it('중괄호 짝이 맞는다', () => {
    const open = (SKY_FRAG.match(/{/g) || []).length
    const close = (SKY_FRAG.match(/}/g) || []).length
    expect(open).toBe(close)
  })
})

describe('SKY_VERT', () => {
  it('gl_Position을 설정하고 uv를 넘긴다', () => {
    expect(SKY_VERT).toContain('gl_Position')
    expect(SKY_VERT).toContain('vUv')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/pages/Gallery/sky.glsl.test.js`
Expected: FAIL — `Failed to resolve import "./sky.glsl.js"`.

- [ ] **Step 3: Write the shader**

Create `src/pages/Gallery/sky.glsl.js`:

```js
// Lab 360° 파노라마의 배경. 풀스크린 프래그먼트 셰이더 한 장이 별·속도
// 스트릭·휘어진 지구 림·대기 산란·재진입 플라즈마·근거리 입자를 모두 그린다.
// 관람자는 원점에서 회전만 하므로 카메라 위치는 uAltitude 하나로 결정된다.
//
// 좌표계: 지구 중심이 원점, 반지름 1. 카메라는 +Y축 위 (1 + camH) 지점.
// uAltitude 1 = 깊은 우주, 0 = 성층권.

export const SKY_UNIFORM_NAMES = [
  'uRes', 'uTime', 'uYaw', 'uPitch',
  'uAltitude', 'uVelocity', 'uTanFov', 'uPlasma', 'uQuality',
]

export const SKY_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const SKY_FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform float uYaw;       // 라디안
uniform float uPitch;     // 라디안
uniform float uAltitude;  // 1 = 깊은 우주, 0 = 성층권
uniform float uVelocity;  // 0..1 체감 속도
uniform float uTanFov;    // tan(fov/2)
uniform float uPlasma;    // 0..1 재진입 발열
uniform float uQuality;   // 1 = 데스크톱, 0.55 = 모바일

const float EARTH_R = 1.0;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 화면 좌표 → 월드 광선. yaw는 Y축, pitch는 X축 회전.
vec3 rayDir(vec2 uv) {
  vec3 d = normalize(vec3(uv.x * uTanFov, uv.y * uTanFov, -1.0));
  float cp = cos(uPitch), sp = sin(uPitch);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  return normalize(d);
}

// 별. 구면 좌표를 격자로 나눠 셀마다 최대 하나. 속도가 붙으면 진행 방향
// (고도각 축)으로 늘어나 스트릭이 된다.
float stars(vec3 d) {
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec2 cell = sph * (52.0 * uQuality + 18.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;

  float h = hash21(id);
  if (h < 0.87) return 0.0;

  vec2 off = vec2(hash21(id + 7.0), hash21(id + 13.0)) - 0.5;
  f -= off * 0.7;

  // 고도각 방향으로 늘리면 하강 진행 방향에서 뻗어 나오는 스트릭이 된다.
  f.y /= (1.0 + uVelocity * 16.0);

  float bright = (h - 0.87) / 0.13;
  float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + h * 40.0);
  return exp(-dot(f, f) * 230.0) * bright * twinkle;
}

// 화면을 스쳐 지나가는 근거리 입자. 속도는 가까운 기준점이 있어야 읽히므로
// 이게 가장 강한 속도 단서다. 멈추면 완전히 사라진다.
float motes(vec2 uv) {
  float acc = 0.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float x = (hash21(vec2(fi, 7.0)) - 0.5) * 2.6;
    float speed = 0.8 + hash21(vec2(fi, 3.0)) * 1.6;
    float y = 1.6 - fract(hash21(vec2(fi, 11.0)) + uTime * speed * (0.15 + uVelocity * 1.4)) * 3.2;
    vec2 p = uv - vec2(x, y);
    p.y /= (0.015 + uVelocity * 0.42);
    acc += exp(-dot(p, p) * 520.0);
  }
  return clamp(acc, 0.0, 1.0) * uVelocity;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0;
  vec3 d = rayDir(uv);

  // 카메라 높이: 깊은 우주에서는 지구가 작게, 성층권에서는 지평선이 휜다.
  float camH = mix(0.055, 4.0, uAltitude * uAltitude);
  vec3 ro = vec3(0.0, EARTH_R + camH, 0.0);
  vec3 up = normalize(ro);
  float roLen = length(ro);

  // 지평선: 광선이 구에 접할 때의 dot(up, d).
  float sinA = EARTH_R / roLen;
  float horizonY = -sqrt(max(0.0, 1.0 - sinA * sinA));
  float dy = dot(up, d);
  float above = dy - horizonY;   // >0 하늘, <0 지구

  vec3 col = vec3(0.0);

  // ── 별 (지구에 가리지 않은 방향만)
  if (above > 0.0) {
    col += vec3(0.86, 0.91, 1.0) * stars(d);
  }

  // 고도가 낮아질수록 대기가 짙어진다.
  float atmos = 1.0 - clamp(uAltitude, 0.0, 1.0) * 0.82;

  if (above > 0.0) {
    // ── 대기 산란: 지평선에 붙을수록 주황, 위로 갈수록 파랑, 더 위는 검정
    float band  = exp(-above * 24.0);
    float haze  = exp(-above * 6.5);
    vec3 orange = vec3(1.0, 0.44, 0.13);
    vec3 blue   = vec3(0.15, 0.40, 0.92);
    vec3 sky = blue * haze * 0.85;
    sky = mix(sky, orange, band * 0.9);
    col += sky * atmos;
  } else {
    // ── 지구 표면: 성층권에서 내려다본 어두운 청회색 + 옅은 구름 얼룩
    float depth = clamp(-above * 4.0, 0.0, 1.0);
    vec2 sph = vec2(atan(d.z, d.x), d.y) * 6.0;
    float mottle = hash21(floor(sph * 3.0)) * 0.35 + 0.65;
    vec3 ground = mix(vec3(0.10, 0.17, 0.30), vec3(0.03, 0.05, 0.10), depth);
    col += ground * mottle * atmos;
    // 지평선 안쪽 가장자리를 밝혀 대기 두께를 느끼게 한다
    col += vec3(1.0, 0.55, 0.22) * exp(above * 40.0) * 0.55 * atmos;
  }

  // ── 근거리 입자
  col += vec3(0.80, 0.88, 1.0) * motes(uv) * 0.9;

  // ── 재진입 플라즈마: 화면 아래쪽에서 타오른다
  float edge = smoothstep(0.2, -1.0, uv.y);
  col += vec3(1.0, 0.36, 0.09) * edge * uPlasma * 1.1;
  col += vec3(1.0, 0.62, 0.25) * pow(edge, 3.0) * uPlasma * 0.6;

  // 아주 옅은 비네트로 가장자리를 눌러 중앙에 시선을 모은다
  col *= 1.0 - 0.22 * dot(uv, uv) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
`
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/pages/Gallery/sky.glsl.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm the full suite still passes**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Gallery/sky.glsl.js src/pages/Gallery/sky.glsl.test.js
git commit -m "feat(lab): sky shader for orbital descent background"
```

---

### Task 5: Sky canvas component

Owns the three.js lifecycle for one fullscreen quad. Exposes an imperative uniform setter so the Gallery's single animation loop drives it without React re-renders. Falls back to a CSS gradient if WebGL is unavailable.

**Files:**
- Create: `src/pages/Gallery/SkyCanvas.jsx`
- Test: none (WebGL + DOM; vitest runs in node). Verified by `npm run build` and by Playwright in Task 8.

**Interfaces:**
- Consumes: `SKY_FRAG`, `SKY_VERT` from `./sky.glsl.js` (Task 4).
- Produces: default export `SkyCanvas`, a `forwardRef` component.
  - Props: none.
  - Imperative handle: `{ setUniforms(state: { timeSec, yawDeg, pitchDeg, altitude, velocity, fovDeg, plasma }) => void, render() => void }`.
  - Renders `<canvas class="lab-sky">`, or `<div class="lab-sky lab-sky--fallback">` when WebGL is unavailable. In the fallback case `setUniforms` and `render` are no-ops, so callers need no branching.

- [ ] **Step 1: Write the component**

Create `src/pages/Gallery/SkyCanvas.jsx`:

```jsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { SKY_FRAG, SKY_VERT } from './sky.glsl.js'

// 배경 하늘. 렌더 루프는 Gallery가 소유하고 여기는 유니폼 갱신과 draw만
// 담당한다 — 배경과 패널이 같은 프레임에 갱신되어야 어긋나지 않는다.
// WebGL을 쓸 수 없으면 CSS 그라디언트로 대체하고, 이때 setUniforms/render는
// 아무 일도 하지 않는다 (호출부에 분기를 만들지 않기 위해).
const SkyCanvas = forwardRef(function SkyCanvas(props, ref) {
  const canvasRef = useRef(null)
  const gpuRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isDesktop ? 2 : 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight, false)

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uAltitude: { value: 1 },
      uVelocity: { value: 0 },
      uTanFov: { value: Math.tan((75 * Math.PI) / 180 / 2) },
      uPlasma: { value: 0 },
      uQuality: { value: isDesktop ? 1 : 0.55 },
    }

    const scene = new THREE.Scene()
    const camera = new THREE.Camera()
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

    const applySize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h, false)
      const dpr = renderer.getPixelRatio()
      uniforms.uRes.value.set(w * dpr, h * dpr)
    }
    applySize()
    window.addEventListener('resize', applySize)

    // 컨텍스트 유실 시 그리기를 멈추고, 복구되면 다음 프레임부터 이어 그린다.
    let contextLost = false
    const onLost = (e) => { e.preventDefault(); contextLost = true }
    const onRestored = () => { contextLost = false; applySize() }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    gpuRef.current = {
      uniforms,
      draw() {
        if (contextLost) return
        renderer.render(scene, camera)
      },
    }

    return () => {
      window.removeEventListener('resize', applySize)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gpuRef.current = null
      material.dispose()
      scene.traverse((o) => o.geometry?.dispose())
      renderer.dispose()
    }
  }, [])

  useImperativeHandle(ref, () => ({
    setUniforms(state) {
      const gpu = gpuRef.current
      if (!gpu) return
      const u = gpu.uniforms
      u.uTime.value = state.timeSec
      u.uYaw.value = (state.yawDeg * Math.PI) / 180
      u.uPitch.value = (state.pitchDeg * Math.PI) / 180
      u.uAltitude.value = state.altitude
      u.uVelocity.value = state.velocity
      u.uTanFov.value = Math.tan((state.fovDeg * Math.PI) / 180 / 2)
      u.uPlasma.value = state.plasma
    },
    render() {
      gpuRef.current?.draw()
    },
  }), [])

  if (failed) return <div className="lab-sky lab-sky--fallback" aria-hidden="true" />
  return <canvas ref={canvasRef} className="lab-sky" aria-hidden="true" />
})

export default SkyCanvas
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: lint reports no errors for `SkyCanvas.jsx`; build exits 0.

If `npm run build` reports the file as unused, that is expected at this point — it is wired up in Task 7.

**Deviation from the spec, stated plainly:** the spec calls for falling back to the CSS gradient on *shader compile failure* as well as on context-creation failure. three.js does not throw on a failed shader compile — it logs to the console and draws nothing, and the internal program diagnostics are not a stable public API. Only context-creation failure is auto-detected here. Shader correctness is instead guarded by the structural test in Task 4 and the console-error assertion in Task 8's e2e. Do not fake the detection with an API that may change.

- [ ] **Step 3: Confirm the test suite is untouched**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Gallery/SkyCanvas.jsx
git commit -m "feat(lab): sky canvas with imperative uniforms and WebGL fallback"
```

---

### Task 6: Look-around input

Pointer drag with inertia, wheel, and keyboard. Orientation lives in a ref (read once per frame) rather than React state, so dragging does not re-render 14 panels at 60 fps.

**Files:**
- Create: `src/pages/Gallery/useLookAround.js`
- Test: none directly (React hook + DOM events). Its math (`wrapDeg`, `clampPitch`, `stepYaw`) is already covered by Task 1.

**Interfaces:**
- Consumes: `clampPitch`, `stepYaw` from `./ring.js` (Task 1).
- Produces: default export `useLookAround(count: number, { enabled: boolean, reducedMotion: boolean })` returning:
  - `orientationRef: { current: { yaw: number, pitch: number } }` — degrees, yaw unbounded (accumulates)
  - `handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel }` — spread onto the scene element
  - `stepBy(dir: 1 | -1): void` — animate one panel step
  - `nudgePitch(deltaDeg: number): void` — keyboard up/down look, clamped
  - `snapToYaw(targetYawDeg: number): void` — ease to an absolute yaw (used when a side panel is clicked)
  - `tick(dtSec: number): void` — call once per frame; applies inertia and eased snapping
  - `wasDrag(): boolean` — true if the gesture that just ended moved far enough to count as a drag rather than a click

- [ ] **Step 1: Write the hook**

Create `src/pages/Gallery/useLookAround.js`:

```js
import { useCallback, useRef } from 'react'
import { clampPitch, stepYaw } from './ring.js'

// 드래그로 시선을 돌리는 입력. 방위(yaw)는 되감지 않고 계속 누적한다 —
// ±180에서 되감으면 그 순간 링이 한 바퀴 튄다.
//
// 방향은 "배경을 잡아 끄는" 감각을 따른다: 오른쪽으로 끌면 시선이 왼쪽으로
// 돈다(yaw 감소). 회전 상태는 React state가 아니라 ref에 둔다 — 60fps로
// 패널 14개를 리렌더할 이유가 없다.

const DRAG_THRESHOLD_PX = 6
const YAW_PER_PX = 0.22
const PITCH_PER_PX = 0.12
const INERTIA_DAMPING = 3.2   // 초당 감쇠율
const MIN_INERTIA = 0.4       // 도/초 — 이 아래면 멈춘다
const SNAP_RATE = 6.0         // 화살표/키보드 스냅 속도

export default function useLookAround(count, { enabled, reducedMotion }) {
  const orientationRef = useRef({ yaw: 0, pitch: 0 })
  const velocityRef = useRef(0)
  const targetRef = useRef(null)
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, lastX: 0, lastT: 0 })

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    targetRef.current = null
    velocityRef.current = 0
    dragRef.current = {
      active: true,
      moved: false,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
    }
  }, [enabled])

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag.active) return

    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true
    }

    const o = orientationRef.current
    o.yaw -= dx * YAW_PER_PX
    o.pitch = clampPitch(o.pitch + dy * PITCH_PER_PX)

    // 관성용 순간 속도(도/초)
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT) / 1000
    velocityRef.current = (-(e.clientX - drag.lastX) * YAW_PER_PX) / dt

    drag.x = e.clientX
    drag.y = e.clientY
    drag.lastX = e.clientX
    drag.lastT = now
  }, [])

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag.active) return
    drag.active = false
    if (reducedMotion || !drag.moved) velocityRef.current = 0
  }, [reducedMotion])

  const onWheel = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    targetRef.current = null
    orientationRef.current.yaw += e.deltaY * 0.08 + e.deltaX * 0.08
    velocityRef.current = 0
  }, [enabled])

  const stepBy = useCallback((dir) => {
    if (!enabled) return
    velocityRef.current = 0
    targetRef.current = stepYaw(orientationRef.current.yaw, count, dir)
  }, [enabled, count])

  const snapToYaw = useCallback((targetYawDeg) => {
    if (!enabled) return
    velocityRef.current = 0
    targetRef.current = targetYawDeg
  }, [enabled])

  const nudgePitch = useCallback((deltaDeg) => {
    if (!enabled) return
    const o = orientationRef.current
    o.pitch = clampPitch(o.pitch + deltaDeg)
  }, [enabled])

  const tick = useCallback((dtSec) => {
    const o = orientationRef.current

    // 화살표/키보드로 지정한 목표가 있으면 그쪽으로 이징
    if (targetRef.current !== null) {
      const diff = targetRef.current - o.yaw
      if (Math.abs(diff) < 0.05) {
        o.yaw = targetRef.current
        targetRef.current = null
      } else {
        o.yaw += diff * Math.min(1, SNAP_RATE * dtSec)
      }
      return
    }

    // 손을 뗀 뒤 관성
    if (!dragRef.current.active && velocityRef.current !== 0) {
      o.yaw += velocityRef.current * dtSec
      velocityRef.current *= Math.exp(-INERTIA_DAMPING * dtSec)
      if (Math.abs(velocityRef.current) < MIN_INERTIA) velocityRef.current = 0
    }
  }, [])

  const wasDrag = useCallback(() => dragRef.current.moved, [])

  return {
    orientationRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    },
    stepBy,
    snapToYaw,
    nudgePitch,
    tick,
    wasDrag,
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: no errors from `useLookAround.js`; build exits 0.

- [ ] **Step 3: Confirm the test suite is untouched**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Gallery/useLookAround.js
git commit -m "feat(lab): drag look-around with inertia and step navigation"
```

---

### Task 7: Gallery page and ring layout

The integration task. Replaces the coverflow with the ring, wires the single animation loop, and rebuilds the page's layout CSS while leaving every `.planet-*` artwork rule untouched.

**Files:**
- Rewrite: `src/pages/Gallery/Gallery.jsx` (currently 274 lines — the whole component body is replaced)
- Modify: `src/pages/Gallery/Gallery.css` — replace lines 1–64 (page / header / scene / track) and the CTA block starting at line 770; **leave `.carousel-card` artwork rules and every `.planet-*` rule alone**
- Test: none directly; covered by Playwright in Task 8.

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 4, 5, 6, plus `experiments` from `../../experiments/index.js` and `useLang` from `../../context/LangContext`.
- Produces: the `/gallery` route's UI. DOM contract relied on by Task 8's e2e:
  - `.lab-scene` — the drag surface
  - `.carousel-card` — one per experiment, 14 total, each carrying `data-idx` and `data-id`
  - `.carousel-card.active` — exactly one at a time
  - `.lab-stage[data-landed="true"]` — set once the descent completes
  - `.lab-arrived` — the localised arrival line, present only briefly after landing

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/pages/Gallery/Gallery.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { experiments } from '../../experiments/index.js'
import { useLang } from '../../context/LangContext'
import SkyCanvas from './SkyCanvas.jsx'
import useLookAround from './useLookAround.js'
import { activeIndex, panelAngle, panelGeometry, yawForIndex } from './ring.js'
import { computeDescent, landedState, DESCENT_DURATION_MS } from './descent.js'
import './Gallery.css'

const ARRIVED_HOLD_MS = 1800

function useViewport() {
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setVw(window.innerWidth)
    window.addEventListener('resize', fn, { passive: true })
    return () => window.removeEventListener('resize', fn)
  }, [])
  return vw
}

export default function Gallery() {
  const { t } = useLang()
  const navigate = useNavigate()
  const n = experiments.length
  const vw = useViewport()
  const geo = useMemo(() => panelGeometry(vw, n), [vw, n])

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const [landed, setLanded] = useState(reducedMotion)
  const [showArrived, setShowArrived] = useState(false)
  const [active, setActive] = useState(0)

  const skyRef = useRef(null)
  const ringRef = useRef(null)
  const stageRef = useRef(null)

  const look = useLookAround(n, { enabled: landed, reducedMotion })
  const { orientationRef, tick } = look

  // 하강 + 시선을 한 프레임 안에서 함께 갱신한다. 배경과 패널이 서로 다른
  // 루프에 있으면 빠른 회전에서 어긋나 보인다.
  useEffect(() => {
    let raf
    let last = performance.now()
    const start = performance.now()
    let landedFired = reducedMotion

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dtSec = Math.min(0.05, (now - last) / 1000)
      last = now

      const d = reducedMotion ? landedState() : computeDescent(now - start)
      if (d.done && !landedFired) {
        landedFired = true
        setLanded(true)
      }

      tick(dtSec)
      const o = orientationRef.current

      // 착지 전에는 회전 입력이 잠겨 있으므로 흔들림만 얹는다.
      const shakeX = d.shake ? (Math.random() - 0.5) * d.shake * 1.6 : 0
      const shakeY = d.shake ? (Math.random() - 0.5) * d.shake * 1.6 : 0

      skyRef.current?.setUniforms({
        timeSec: (now - start) / 1000,
        yawDeg: o.yaw + shakeX,
        pitchDeg: o.pitch + shakeY,
        altitude: d.altitude,
        velocity: d.velocity,
        fovDeg: d.fovDeg,
        plasma: d.plasma,
      })
      skyRef.current?.render()

      // 링은 회전만 한다. 패널이 translateZ(-radius)로 이미 물러나 있고
      // .lab-scene의 perspective가 원근을 만든다 — 여기서 translateZ를 더하면
      // 패널이 원근 평면 앞으로 튀어나와 배율이 뒤집힌다.
      const ring = ringRef.current
      if (ring) {
        ring.style.transform =
          `rotateX(${(o.pitch + shakeY).toFixed(3)}deg) rotateY(${(-o.yaw).toFixed(3)}deg)`
        ring.style.opacity = String(d.panelReveal)
      }

      const next = activeIndex(n, o.yaw)
      setActive((prev) => (prev === next ? prev : next))
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [n, reducedMotion, tick, orientationRef])

  // 착지 문구는 잠깐 떴다 사라진다.
  useEffect(() => {
    if (!landed) return
    setShowArrived(true)
    const id = setTimeout(() => setShowArrived(false), ARRIVED_HOLD_MS)
    return () => clearTimeout(id)
  }, [landed])

  const openPanel = useCallback((idx) => {
    navigate(`/gallery/${experiments[idx].id}`)
  }, [navigate])

  // 선택은 패널의 onClick이 아니라 씬의 pointerup에서 위임 처리한다.
  // onPointerDown에서 setPointerCapture를 걸기 때문에 이후 포인터 이벤트가
  // 씬으로 향하고, 자식 패널의 click이 오지 않을 수 있다 — 기존 캐러셀도
  // 같은 이유로 pointerup + closest()를 썼다.
  //
  // 정면 패널만 진입시킨다. 옆 패널을 누르면 그쪽으로 돌기만 한다 — 실수로
  // 작품이 열리지 않게 하려는 의도적인 동작이다.
  const onScenePointerUp = useCallback((e) => {
    look.handlers.onPointerUp(e)
    if (!landed || look.wasDrag()) return
    const el = e.target?.closest?.('.carousel-card')
    if (!el) return
    const idx = Number(el.dataset.idx)
    if (Number.isNaN(idx)) return
    if (idx === active) openPanel(idx)
    else look.snapToYaw(yawForIndex(orientationRef.current.yaw, n, idx))
  }, [landed, active, look, openPanel, orientationRef, n])

  const onKeyDown = useCallback((e) => {
    if (!landed) return
    if (e.key === 'ArrowRight') { e.preventDefault(); look.stepBy(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); look.stepBy(-1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); look.nudgePitch(-4) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); look.nudgePitch(4) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(active) }
  }, [landed, look, active, openPanel])

  return (
    <section className="gallery-page">
      <SkyCanvas ref={skyRef} />

      <div className="lab-stage" ref={stageRef} data-landed={landed ? 'true' : 'false'}>
        <div className="gallery-header">
          <span className="gallery-eyebrow">{t.lab.eyebrow}</span>
          <h1 className="gallery-title">{t.lab.title}</h1>
          <p className="gallery-desc">{landed ? t.lab.hint : t.lab.descending}</p>
        </div>

        <div
          className="lab-scene"
          style={{ perspective: `${geo.perspective}px` }}
          tabIndex={0}
          role="listbox"
          aria-label={t.lab.title}
          onKeyDown={onKeyDown}
          {...look.handlers}
          onPointerUp={onScenePointerUp}
        >
          <div className="lab-ring" ref={ringRef} style={{ opacity: 0 }}>
            {experiments.map((exp, i) => {
              const hasRing = exp.planet === 'saturn' || exp.planet === 'uranus'
              return (
                <div
                  key={exp.id}
                  data-idx={i}
                  data-id={exp.id}
                  role="option"
                  aria-selected={i === active}
                  className={`carousel-card planet-${exp.planet}${i === active ? ' active' : ''}`}
                  style={{
                    width: `${geo.width}px`,
                    height: `${geo.height}px`,
                    marginLeft: `${-geo.width / 2}px`,
                    marginTop: `${-geo.height / 2}px`,
                    transform: `rotateY(${panelAngle(i, n)}deg) translateZ(${-geo.radius}px)`,
                    '--exp-color': exp.color,
                  }}
                >
                  <div className="card-bg" />
                  <div className="card-glow" />
                  <div className="planet-surface">
                    {exp.planet === 'jupiter'  && <div className="planet-spot" />}
                    {exp.planet === 'earth'    && <div className="planet-land" />}
                    {exp.planet === 'neptune'  && <div className="planet-dark-spot" />}
                    {(exp.planet === 'mercury' || exp.planet === 'moon') && <div className="planet-craters" />}
                    {exp.planet === 'mars'     && <div className="planet-polar-cap" />}
                    {exp.planet === 'sun'      && <div className="planet-corona" />}
                    {exp.planet === 'moon'     && <div className="planet-moon-shadow" />}
                  </div>
                  {hasRing && <div className="planet-ring" />}
                  <div className="exhibit-meta">
                    <span className="exhibit-num">{String(i + 1).padStart(2, '0')}</span>
                    <div className="exhibit-text">
                      <span className="exhibit-title">{exp.title}</span>
                      <span className="exhibit-tags">{exp.tags.slice(0, 2).join(' · ')}</span>
                    </div>
                  </div>
                  <div className="card-symbol">
                    <span className="card-symbol-glyph">{exp.symbol}</span>
                  </div>
                  <div className="card-dim" />
                </div>
              )
            })}
          </div>
        </div>

        <div className="carousel-cta">
          <div className="carousel-nav">
            <button className="carousel-arrow" onClick={() => look.stepBy(-1)} aria-label="Previous">←</button>
            <div className="carousel-info">
              <span className="carousel-active-num">{String(active + 1).padStart(2, '0')}</span>
              <span className="carousel-slash">/</span>
              <span className="carousel-total">{String(n).padStart(2, '0')}</span>
            </div>
            <button className="carousel-arrow" onClick={() => look.stepBy(1)} aria-label="Next">→</button>
          </div>
          <div className="carousel-progress">
            <span style={{ width: `${((active + 1) / n) * 100}%` }} />
          </div>
        </div>
      </div>

      {showArrived && <p className="lab-arrived">{t.lab.arrived}</p>}
    </section>
  )
}
```

- [ ] **Step 2: Replace the layout CSS**

In `src/pages/Gallery/Gallery.css`, replace lines 1–64 (everything from `/* ── Page: 100vh, no scroll ── */` down to and including the `.carousel-track { ... }` block) with:

```css
/* ── Page: 100vh, no scroll ── */
.gallery-page {
  position: relative; /* SpaceBackground(fixed, z:0) 위에 올라오도록 */
  z-index: 1;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}

/* 배경 하늘 — 페이지 스택 컨텍스트 안에서 가장 아래 */
.lab-sky {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  display: block;
  pointer-events: none;
}

/* WebGL을 못 쓸 때의 대체 하늘: 검정 → 파랑 → 지평선 주황 */
.lab-sky--fallback {
  background:
    linear-gradient(
      180deg,
      #000000 0%,
      #030814 42%,
      #0d2b63 72%,
      #7a3a12 88%,
      #05070d 100%
    );
}

/* 콘텐츠 레이어 */
.lab-stage {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 72px 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

/* 하강 중에는 UI를 눌러 둔다 — 떨어지는 동안 읽을 것이 없어야 한다 */
.lab-stage[data-landed='false'] .gallery-header,
.lab-stage[data-landed='false'] .carousel-cta {
  opacity: 0.18;
  pointer-events: none;
}

.lab-stage .gallery-header,
.lab-stage .carousel-cta {
  transition: opacity 700ms ease;
}

/* ── Header ── */
.gallery-header {
  text-align: center;
  padding: 20px 0 14px;
  flex-shrink: 0;
}

.gallery-eyebrow {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.gallery-title {
  font-size: clamp(28px, 4.6vw, 54px);
  font-weight: 600;
  color: var(--text-h);
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 8px 0 8px;
}

.gallery-desc {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

/* ── 360° ring scene ── */
.lab-scene {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  outline: none;
}

.lab-scene:active { cursor: grabbing; }

.lab-scene:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  border-radius: 12px;
}

/* 링은 화면 중앙을 축으로 회전한다. translateZ로 원근 중심까지 끌어와야
   패널이 관람자를 둘러싸는 것처럼 보인다. */
.lab-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  will-change: transform, opacity;
}

/* 뒤편 패널은 브라우저가 알아서 감춘다 — 컬링 코드가 필요 없다 */
.lab-ring .carousel-card {
  backface-visibility: hidden;
}

/* 착지 문구 */
.lab-arrived {
  position: fixed;
  left: 50%;
  bottom: 14%;
  transform: translateX(-50%);
  z-index: 3;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.86);
  text-shadow: 0 0 24px rgba(120, 170, 255, 0.55);
  animation: lab-arrived-in 520ms ease both;
  pointer-events: none;
}

@keyframes lab-arrived-in {
  from { opacity: 0; transform: translate(-50%, 10px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
```

Then delete the now-unused `.carousel-open-btn` rules (the block starting at the original line 836 and its `:hover`, plus the `.carousel-open-btn` line inside the `@media (max-width: 479px)` block near the original line 1488). Every other rule stays.

- [ ] **Step 3: Verify build and lint**

Run: `npm run lint && npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 4: Run the app and look at it**

Run: `npm run dev`, open `/gallery`.

Confirm by observation:
1. The page starts black, then Earth rises into view as the fall decelerates.
2. Stars visibly stretch into streaks during the fast phase and snap back to points on braking.
3. Motes whip past the camera — this is the cue that sells the speed.
4. An orange glow builds at the bottom of the frame mid-fall and fades out.
5. Panels fade in only near the end, then the arrival text appears and fades.
6. Dragging rotates the view; releasing coasts and settles.
7. The panel dead ahead is highlighted and the `NN / 14` counter tracks it.

Tune only these constants if something reads wrong, and note what you changed:
`DESCENT_DURATION_MS` / `ACCEL_END` / `BRAKE_START` in `descent.js`, `YAW_PER_PX` / `INERTIA_DAMPING` in `useLookAround.js`, the `0.62` width factor and `1.25` spacing factor in `panelGeometry`.

- [ ] **Step 5: Confirm the unit suite still passes**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Gallery/Gallery.jsx src/pages/Gallery/Gallery.css
git commit -m "feat(lab): 360 ring gallery with orbital descent"
```

---

### Task 8: Warp handoff, transition cleanup, and e2e

The warp already runs in `SpaceBackground` and swaps the route at the flash. The Gallery now owns everything after that, so `LabTransition`'s own arrival text is removed — otherwise the same line appears twice, in two different languages.

**Files:**
- Modify: `src/components/LabTransition/LabTransition.jsx` (remove the text element and its timers; keep the warp boost, flash, and `onDone` contract)
- Modify: `src/components/LabTransition/LabTransition.css` (remove `.labtransition-text` rules)
- Modify: `e2e/lab-gallery.spec.js`

**Interfaces:**
- Consumes: the DOM contract from Task 7 (`.lab-scene`, `.carousel-card`, `.lab-stage[data-landed]`).
- Produces: no new exports. `LabTransition`'s props (`origin`, `onNavigate`, `onDone`) are unchanged, so `Navbar` needs no edit.

- [ ] **Step 1: Write the failing e2e test**

Replace `e2e/lab-gallery.spec.js`:

```js
import { test, expect } from '@playwright/test'

const ids = [
  'particle-morph',
  'ink-flow',
  'neon-raymarch',
  'wind-atlas',
  'seismic-echo',
  'hand-conductor',
  'voice-bloom',
  'poster-lab',
  'solar-system',
  'deep-space',
  'earth-explorer',
  'non-euclidean-portals',
  'cosmic-mirror',
  'cloud-gallery',
]

test('gallery shows 14 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(14)
})

test('descent completes and the gallery lands', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.lab-arrived')).toBeVisible()
})

test('exactly one work is active at a time', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.carousel-card.active')).toHaveCount(1)
})

test('dragging changes the active work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const before = await page.locator('.carousel-card.active').getAttribute('data-id')

  const scene = page.locator('.lab-scene')
  const box = await scene.boundingBox()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(1200)

  const after = await page.locator('.carousel-card.active').getAttribute('data-id')
  expect(after).not.toBe(before)
})

test('the arrow button steps to the next work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const before = await page.locator('.carousel-card.active').getAttribute('data-id')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.waitForTimeout(900)

  const after = await page.locator('.carousel-card.active').getAttribute('data-id')
  expect(after).not.toBe(before)
})

test('clicking the front panel opens that work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const activeId = await page.locator('.carousel-card.active').getAttribute('data-id')
  await page.locator('.carousel-card.active').click()
  await expect(page).toHaveURL(new RegExp(`/gallery/${activeId}$`))
})

test('the lab renders without console errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1000)
  expect(errors).toEqual([])
})

for (const id of ids) {
  test(`experiment ${id} renders a canvas without console errors`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/gallery/${id}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}
```

- [ ] **Step 2: Run the e2e suite and confirm the new tests fail before the cleanup**

Run: `npm run test:e2e -- --grep "lands|active|dragging|arrow|front panel"`
Expected: these pass already if Task 7 is complete. If `.lab-arrived` is flaky because the 1.8 s hold expires before the assertion, raise `ARRIVED_HOLD_MS` in `Gallery.jsx` to `2600` rather than loosening the test.

Note: `playwright.config.js` sets `reuseExistingServer: true` against `http://localhost:5173`. If another process already holds 5173, Playwright will test **that** app, not yours. Confirm with `lsof -ti:5173` and stop any stale server first.

- [ ] **Step 3: Remove the duplicated arrival text from LabTransition**

In `src/components/LabTransition/LabTransition.jsx`:

- Delete the `showText` state, both `setShowText` timers in each branch, and the `TEXT_HOLD_MS` / `TEXT_OUT_MS` usage in the rendered output.
- Keep `TEXT_HOLD_MS` and `TEXT_OUT_MS` in the `onDone` timing so the overlay lifetime is unchanged.
- Remove the `<p className="labtransition-text">` element entirely.

The comment block at the top of the file gains one line explaining the move:

```jsx
// 도착 문구는 Gallery가 하강 완료 시점에 로케일에 맞춰 띄운다 — 여기서
// 한국어로 하드코딩해 두면 언어 설정과 어긋나고 문구가 두 번 보인다.
```

The reduced-motion branch becomes:

```jsx
    if (reducedMotion) {
      // 부스트 없이 어두운 오버레이만 짧게.
      const timers = [
        setTimeout(() => callbacksRef.current.onNavigate(), REDUCED_NAV_MS),
        setTimeout(
          () => callbacksRef.current.onDone(),
          REDUCED_DONE_MS + TEXT_HOLD_MS,
        ),
      ]
      return () => timers.forEach(clearTimeout)
    }
```

and the normal branch's timer array becomes exactly this — the two `setShowText`
entries are gone, every other timing is unchanged:

```jsx
    const navAt = BOOST_CHARGE_MS + BOOST_PEAK_MS / 2
    const timers = [
      setTimeout(() => setFlash(true), BOOST_CHARGE_MS - FLASH_LEAD_MS),
      setTimeout(() => {
        callbacksRef.current.onNavigate()
        document.body.classList.remove('warp-exit')
        document.documentElement.style.removeProperty('--warp-origin-y')
      }, navAt),
      setTimeout(() => {
        setFlash(false)
        // 플래시가 걷히면 오버레이가 갤러리 입력을 막지 않게 한다.
        setReleased(true)
      }, BOOST_CHARGE_MS + BOOST_PEAK_MS),
      setTimeout(
        () => callbacksRef.current.onDone(),
        BOOST_CHARGE_MS + BOOST_PEAK_MS + BOOST_RELEASE_MS + TEXT_HOLD_MS + TEXT_OUT_MS,
      ),
    ]
```

The return value becomes:

```jsx
  return (
    <div
      className={`labtransition-overlay ${reducedMotion ? 'labtransition-overlay--reduced' : ''} ${released ? 'labtransition-overlay--released' : ''}`}
    >
      <div className={`labtransition-flash ${flash ? 'labtransition-flash--on' : ''}`} />
    </div>
  )
```

In `src/components/LabTransition/LabTransition.css`, delete the `.labtransition-text` and `.labtransition-text--in` rules.

- [ ] **Step 4: Verify the warp path end to end**

Run: `npm run dev`, open `/`, and click Lab in the navbar.

Confirm:
1. The warp accelerates, flashes, and the fall continues without a visible seam.
2. The arrival line appears exactly once, at the end of the fall.
3. Switching the language to English and repeating shows `Lab arrived`; Japanese and Chinese show their own strings.

- [ ] **Step 5: Run every check**

Run: `npm run lint && npm test && npm run build && npm run test:e2e`
Expected: lint clean, unit suite 0 failures, build exits 0, Playwright all green.

Paste the actual tail of each command's output into the task notes. Do not report success without it.

- [ ] **Step 6: Commit**

```bash
git add src/components/LabTransition/LabTransition.jsx src/components/LabTransition/LabTransition.css e2e/lab-gallery.spec.js
git commit -m "feat(lab): hand the warp off to the descent and localise arrival"
```

---

## Known follow-ups (not in scope)

- `SpaceBackground` keeps rendering its starfield behind the Lab's opaque sky, so two WebGL contexts run at once on `/gallery`. It cannot simply be unmounted, because `LabTransition`'s warp boost plays inside it during the route swap. If mobile frame rate suffers, the fix is to pause `SpaceBackground`'s loop once the Lab reports it has landed — a separate change with its own risk to the warp.
- The panel artwork is still the planet CSS from the carousel era. A framing treatment that reads more like a hung artwork (matte, bevel, cast light) would suit the new concept better, but it is a pure styling pass and independent of this plan.
