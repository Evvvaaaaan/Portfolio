# Evan System Phase 5 — 시간대 라이팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방문자의 로컬 시각에 따라 항성계의 빛과 톤이 달라지게 한다 — 새벽에 오면 차갑고 깊은 밤의 항성계, 한낮에 오면 맑고 또렷한 항성계.

**Architecture:** 시각 → 라이팅 값 변환은 three·DOM에 의존하지 않는 순수 모듈(`timeOfDay.js`)이 전부 담당하고, 씬은 그 결과를 받아 유니폼에 꽂기만 한다. 하루를 네 개의 키프레임(심야·여명·한낮·황혼)으로 잡고 그 사이를 원형(24시가 0시로 이어지는) 보간해, 어느 시각에 들어와도 튀는 경계가 없다. 등급은 마운트 시 한 번 계산해 고정한다.

**Tech Stack:** three.js 0.184 (명령형), 커스텀 GLSL, vitest 4 (환경 `node`), Playwright 1.60.

## Global Constraints

- **R3F(`@react-three/fiber`)를 쓰지 않는다.** 설치돼 있지만 이 코드베이스의 3D는 전부 명령형 three.js다.
- **아트 디렉션이 최우선이다: 배경은 "검은 우주 + 떠다니는 별"이다.** 어떤 시간대에서도 하늘이 밝아지거나 뿌예지면 실패다. 시간대 차이는 "톤이 다르다"로 읽혀야지 "밝기가 다르다"로 읽히면 안 된다.
- **vitest 환경은 `node`다.** 단위 테스트 파일에서 `document`, `window`, `sessionStorage`를 쓸 수 없다. DOM/WebGL이 필요한 검증은 Playwright e2e로 간다.
- **`createEvanSystem`의 공개 계약을 깨지 않는다.** 현재 반환값은 `{ group, update(t, shaderTime, cameraPosition), setBuild, setOrbitDraw, dispose }`이고 Phase 1~4의 테스트들이 이 모양에 의존한다. 이번에 추가하는 것은 `setGrade` 하나뿐이다.
- **`prefers-reduced-motion`은 시간대 라이팅을 끄지 않는다.** 이건 모션이 아니라 색이다 — 정지 화면에서도 그대로 적용된다.
- 커밋 메시지는 영어, 코드 주석은 이 코드베이스 관례대로 한국어.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/components/SpaceBackground/timeOfDay.js` (신규) | 로컬 시각(0~24) → 라이팅 등급(색·세기 묶음). 순수. |
| `src/components/SpaceBackground/timeOfDay.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/SpaceBackground/evanSystem.js` (수정) | `setGrade(grade)` 추가 — 등급을 항성·조명·행성 림·성운 유니폼에 적용. |
| `src/components/SpaceBackground/evanSystem.test.js` (수정) | `setGrade`가 실제로 유니폼을 바꾸는지 검증. |
| `src/components/SpaceBackground/SpaceBackground.jsx` (수정) | 마운트 시 로컬 시각으로 등급을 계산해 `setGrade` 호출. |
| `e2e/time-of-day.spec.js` (신규) | 시계를 고정한 두 시각에서 씬이 실제로 다르게 렌더되는지 검증. |

## 비범위 (Out of Scope)

- **Supabase 방문자 흔적** — 스펙 §4에서 2026-08-08에 범위 제외됐다. 방명록이 이미 `/guestbook`에 구현돼 있어 목적이 달성된 상태다.
- 실시간 재등급(탭을 몇 시간 열어두면 톤이 서서히 바뀌는 것). 등급은 마운트 시 1회 고정한다.
- 별 필드 자체의 색 변화. 별은 사용자가 두 번 못박은 룩이라 손대지 않는다.

---

### Task 1: 시간대 등급 모듈

**Files:**
- Create: `src/components/SpaceBackground/timeOfDay.js`
- Test: `src/components/SpaceBackground/timeOfDay.test.js`

**Interfaces:**
- Consumes: 없음 (완전 독립 순수 모듈, three 미의존 — 색은 three의 `Color`가 아니라 `0xrrggbb` 숫자로 다룬다).
- Produces: `TIME_KEYFRAMES` (`{ hour, grade }[]`, 길이 4), `computeGrade(hour) → Grade`, `hoursFromDate(date) → number`.
  `Grade`는 정확히 이 8개 키를 가진 객체다:
  `{ sunCore, sunEdge, sunLight, ambient, rim, nebulaA, nebulaB, nebulaIntensity }`
  — 앞 7개는 `0xrrggbb` 정수색, `nebulaIntensity`는 0~1 실수.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/SpaceBackground/timeOfDay.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { TIME_KEYFRAMES, computeGrade, hoursFromDate } from './timeOfDay.js'

const KEYS = [
  'sunCore', 'sunEdge', 'sunLight', 'ambient',
  'rim', 'nebulaA', 'nebulaB', 'nebulaIntensity',
]

// 0xrrggbb 정수색에서 가장 밝은 채널 값(0~255) — "하늘이 밝아지지 않는다"를
// 재는 대리 지표.
const peak = (hex) => Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255)

describe('hoursFromDate', () => {
  it('로컬 시각을 소수 시간으로 바꾼다', () => {
    expect(hoursFromDate(new Date(2026, 0, 1, 0, 0, 0))).toBeCloseTo(0, 6)
    expect(hoursFromDate(new Date(2026, 0, 1, 6, 30, 0))).toBeCloseTo(6.5, 6)
    expect(hoursFromDate(new Date(2026, 0, 1, 23, 45, 0))).toBeCloseTo(23.75, 6)
  })
})

describe('TIME_KEYFRAMES', () => {
  it('심야·여명·한낮·황혼 네 개가 시각 순서대로 있다', () => {
    expect(TIME_KEYFRAMES).toHaveLength(4)
    expect(TIME_KEYFRAMES.map((k) => k.hour)).toEqual([0, 6, 12, 18])
  })

  it('모든 키프레임이 Grade 8개 키를 빠짐없이 갖는다', () => {
    for (const k of TIME_KEYFRAMES) {
      expect(Object.keys(k.grade).sort()).toEqual([...KEYS].sort())
    }
  })
})

describe('computeGrade', () => {
  it('키프레임 시각에서는 그 키프레임 값을 그대로 준다', () => {
    for (const k of TIME_KEYFRAMES) {
      expect(computeGrade(k.hour)).toEqual(k.grade)
    }
  })

  it('24시는 0시와 같다 — 자정에 톤이 튀지 않는다', () => {
    expect(computeGrade(24)).toEqual(computeGrade(0))
  })

  it('키프레임 사이는 두 끝 사이의 값이 된다 (보간이 실제로 일어난다)', () => {
    const mid = computeGrade(3)
    const a = computeGrade(0).nebulaIntensity
    const b = computeGrade(6).nebulaIntensity
    expect(mid.nebulaIntensity).toBeGreaterThan(Math.min(a, b))
    expect(mid.nebulaIntensity).toBeLessThan(Math.max(a, b))
    expect(mid).not.toEqual(computeGrade(0))
    expect(mid).not.toEqual(computeGrade(6))
  })

  it('하루 어느 시각에도 8개 키가 다 있고 색은 24비트 범위 안이다', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const g = computeGrade(h)
      expect(Object.keys(g).sort()).toEqual([...KEYS].sort())
      for (const key of KEYS) {
        if (key === 'nebulaIntensity') continue
        expect(Number.isInteger(g[key])).toBe(true)
        expect(g[key]).toBeGreaterThanOrEqual(0)
        expect(g[key]).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('경계를 넘겨도 하루 안으로 접어 읽는다 — 음수·25시에도 깨지지 않는다', () => {
    expect(computeGrade(-1)).toEqual(computeGrade(23))
    expect(computeGrade(25)).toEqual(computeGrade(1))
  })

  it('검은 우주 제약: 어느 시각에도 성운이 얕게 유지된다', () => {
    // 0.32는 Phase 3이 "별이 묻히지 않는" 값으로 정해 시각 QA까지 마친
    // 기준선이다. 시간대 연출이 이 위로 올라가면 하늘이 뿌예진다.
    for (let h = 0; h < 24; h += 0.25) {
      expect(computeGrade(h).nebulaIntensity).toBeLessThanOrEqual(0.32)
      expect(computeGrade(h).nebulaIntensity).toBeGreaterThan(0)
    }
  })

  it('검은 우주 제약: 앰비언트가 어느 시각에도 어둡게 유지된다', () => {
    // 앰비언트는 야간면이 완전히 죽지 않게 하는 최소 조명이다 — 밝아지면
    // 행성의 낮/밤 경계(터미네이터)가 뭉개져 Phase 3 연출이 무너진다.
    for (let h = 0; h < 24; h += 0.25) {
      expect(peak(computeGrade(h).ambient)).toBeLessThanOrEqual(0x50)
    }
  })

  it('밤이 낮보다 어둡고 차갑다 — 연출의 방향이 실제로 반영된다', () => {
    const night = computeGrade(0)
    const day = computeGrade(12)
    expect(peak(night.ambient)).toBeLessThan(peak(day.ambient))
    // 차갑다 = 파랑이 빨강보다 우세하다.
    expect(night.ambient & 255).toBeGreaterThan((night.ambient >> 16) & 255)
    expect(peak(night.sunLight)).toBeLessThan(peak(day.sunLight))
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/timeOfDay.test.js`
Expected: FAIL — `Failed to resolve import "./timeOfDay.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/SpaceBackground/timeOfDay.js`:

```js
// 시간대 라이팅 등급 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 하루를 네 키프레임으로 잡고 원형(24시→0시)으로 보간한다. 색을 three의
// Color가 아니라 0xrrggbb 정수로 다루는 이유: 이 모듈을 node 환경 단위
// 테스트에서 three 없이 그대로 돌리기 위해서다.
//
// 아트 디렉션 제약이 이 표의 상한을 정한다 — 어느 시각에도 하늘이 밝아지면
// 안 되므로, 시간대 차이는 "밝기"가 아니라 "색온도"로만 표현한다. 성운
// 세기는 Phase 3이 시각 QA로 정한 0.32를 절대 넘지 않는다.
export const TIME_KEYFRAMES = [
  {
    // 심야: 가장 차갑고 어둡다. 항성은 식은 듯 붉고, 성운은 남색으로 가라앉는다.
    hour: 0,
    grade: {
      sunCore: 0xffe3ad,
      sunEdge: 0xd9702c,
      sunLight: 0xd8c39a,
      ambient: 0x121a30,
      rim: 0x9fc4ff,
      nebulaA: 0x16224a,
      nebulaB: 0x2a1740,
      nebulaIntensity: 0.3,
    },
  },
  {
    // 여명: 붉은 기가 올라오며 성운이 자줏빛으로 물든다.
    hour: 6,
    grade: {
      sunCore: 0xfff0c6,
      sunEdge: 0xff8f42,
      sunLight: 0xf0cfa2,
      ambient: 0x1d2036,
      rim: 0xc8ceff,
      nebulaA: 0x24264f,
      nebulaB: 0x4a1f45,
      nebulaIntensity: 0.28,
    },
  },
  {
    // 한낮: 가장 또렷하고 중성적이다. 현재(Phase 3) 값이 이 지점의 기준선.
    hour: 12,
    grade: {
      sunCore: 0xfff1c9,
      sunEdge: 0xff9d4a,
      sunLight: 0xffe2b0,
      ambient: 0x1a2438,
      rim: 0xbfe0ff,
      nebulaA: 0x1b2b52,
      nebulaB: 0x3a1f4d,
      nebulaIntensity: 0.32,
    },
  },
  {
    // 황혼: 호박빛에서 자홍으로 넘어간다.
    hour: 18,
    grade: {
      sunCore: 0xffe9b4,
      sunEdge: 0xff7f3a,
      sunLight: 0xf5d0a0,
      ambient: 0x1f1c33,
      rim: 0xd7c2ff,
      nebulaA: 0x1f2450,
      nebulaB: 0x4b1d48,
      nebulaIntensity: 0.31,
    },
  },
]

const DAY = 24

// 0xrrggbb 두 색을 채널별로 선형 보간한다. 라운딩을 채널마다 따로 해야
// 결과가 항상 24비트 안에 떨어진다.
function mixHex(a, b, t) {
  const ch = (shift) => {
    const av = (a >> shift) & 255
    const bv = (b >> shift) & 255
    return Math.round(av + (bv - av) * t) & 255
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function hoursFromDate(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export function computeGrade(hour) {
  // 하루 안으로 접는다 — 음수 시각(-1)도 23시로 읽혀야 자정 경계가 매끄럽다.
  const h = ((hour % DAY) + DAY) % DAY

  const n = TIME_KEYFRAMES.length
  // 첫 키프레임이 0시라 h >= 0은 항상 참 — i는 반드시 한 번은 정해진다.
  let i = 0
  for (let k = 0; k < n; k++) {
    if (h >= TIME_KEYFRAMES[k].hour) i = k
  }
  const from = TIME_KEYFRAMES[i]
  // 마지막 키프레임(18시)은 24시를 건너 첫 키프레임(0시)으로 이어진다.
  const to = TIME_KEYFRAMES[(i + 1) % n]
  const span = (to.hour - from.hour + DAY) % DAY
  const raw = ((h - from.hour + DAY) % DAY) / span
  // smoothstep으로 키프레임 근처를 평평하게 만들어 시각이 바뀌는 순간의
  // 변화율이 눈에 띄지 않게 한다.
  const t = raw * raw * (3 - 2 * raw)

  return {
    sunCore: mixHex(from.grade.sunCore, to.grade.sunCore, t),
    sunEdge: mixHex(from.grade.sunEdge, to.grade.sunEdge, t),
    sunLight: mixHex(from.grade.sunLight, to.grade.sunLight, t),
    ambient: mixHex(from.grade.ambient, to.grade.ambient, t),
    rim: mixHex(from.grade.rim, to.grade.rim, t),
    nebulaA: mixHex(from.grade.nebulaA, to.grade.nebulaA, t),
    nebulaB: mixHex(from.grade.nebulaB, to.grade.nebulaB, t),
    nebulaIntensity:
      from.grade.nebulaIntensity +
      (to.grade.nebulaIntensity - from.grade.nebulaIntensity) * t,
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/timeOfDay.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/timeOfDay.js src/components/SpaceBackground/timeOfDay.test.js
git commit -m "feat(space): time-of-day lighting grade with circular keyframe blending"
```

---

### Task 2: 씬에 등급 적용 (`setGrade`)

**Files:**
- Modify: `src/components/SpaceBackground/evanSystem.js`
- Test: `src/components/SpaceBackground/evanSystem.test.js`

**Interfaces:**
- Consumes: Task 1의 `computeGrade(hour) → { sunCore, sunEdge, sunLight, ambient, rim, nebulaA, nebulaB, nebulaIntensity }` (앞 7개는 `0xrrggbb` 정수, 마지막은 실수).
- Produces: `createEvanSystem(...)`의 반환 객체에 `setGrade(grade)` 추가. 기존 `{ group, update, setBuild, setOrbitDraw, dispose }`는 그대로 유지된다.

**참고 — 현재 씬이 갖고 있는 것(수정 대상):**
- `sunMat.uniforms.uCoreColor` / `uEdgeColor` — `THREE.Color`
- `sunLight` — `THREE.PointLight(0xffe2b0, 22000, 0, 1.8)`
- `ambient` — `THREE.AmbientLight(0x1a2438, 1.2)`
- `nebulaMat.uniforms.uColorA` / `uColorB` / `uIntensity`
- 행성 머티리얼은 `createPlanetMaterial({ color, rimColor, seed })`로 만들어지고 `evanSystem.js:164`의 `planetFades` 배열이 그 결과 객체(`{ material, setOpacity, setTime }`)를 이미 들고 있다. **새 배열을 만들지 말 것** — `pf.material.uniforms.uRimColor`로 바로 닿는다.

**림 색은 덮어쓰지 말고 섞는다 (중요).** 현재 각 행성의 림은 `evanSystem.js:172`에서 행성 고유색으로부터 만들어진다:

```js
rimColor: new THREE.Color(p.color).lerp(new THREE.Color(0xbfe0ff), 0.55).getHex(),
```

여기서 `0xbfe0ff`가 "대기 산란" 상수이고, 행성 고유색이 나머지 45%를 차지해 행성마다 림이 다르다. 등급의 `rim`을 그대로 `uRimColor`에 넣으면 네 행성의 림이 전부 같은 색이 되어 Phase 3이 만든 행성별 정체성이 사라진다. 등급의 `rim`은 **`0xbfe0ff` 자리를 대신하는 값**이다 — 같은 0.55 비율로 섞어야 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/SpaceBackground/evanSystem.test.js` 맨 끝의 `describe` 블록 안에 추가한다 (파일 상단에 이미 `import * as THREE from 'three'`와 `createEvanSystem`, `COLORS`가 있다):

```js
  it('setGrade가 항성·조명·행성 림·성운 색을 한 번에 바꾼다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const sun = sys.group.getObjectByName('sun')
    const neb = sys.group.getObjectByName('nebula')
    const planet = sys.group.getObjectByName('planet-about')

    sys.setGrade({
      sunCore: 0x112233,
      sunEdge: 0x445566,
      sunLight: 0x778899,
      ambient: 0xaabbcc,
      rim: 0xddeeff,
      nebulaA: 0x102030,
      nebulaB: 0x405060,
      nebulaIntensity: 0.17,
    })

    expect(sun.material.uniforms.uCoreColor.value.getHex()).toBe(0x112233)
    expect(sun.material.uniforms.uEdgeColor.value.getHex()).toBe(0x445566)
    // 림은 덮어쓰기가 아니라 "행성 고유색 → 등급 rim" 0.55 혼합이다.
    const expectedRim = new THREE.Color(PLANETS.find((p) => p.id === 'about').color)
      .lerp(new THREE.Color(0xddeeff), 0.55)
      .getHex()
    expect(planet.material.uniforms.uRimColor.value.getHex()).toBe(expectedRim)
    expect(neb.material.uniforms.uColorA.value.getHex()).toBe(0x102030)
    expect(neb.material.uniforms.uColorB.value.getHex()).toBe(0x405060)
    expect(neb.material.uniforms.uIntensity.value).toBeCloseTo(0.17, 6)

    const light = sys.group.children.find((c) => c.isPointLight)
    const amb = sys.group.children.find((c) => c.isAmbientLight)
    expect(light.color.getHex()).toBe(0x778899)
    expect(amb.color.getHex()).toBe(0xaabbcc)

    sys.dispose()
  })

  it('setGrade는 모든 행성에 적용되지만 행성별 림 정체성은 남는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const before = PLANETS.map(
      (p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uRimColor.value.getHex(),
    )
    sys.setGrade({
      sunCore: 0x111111, sunEdge: 0x222222, sunLight: 0x333333,
      ambient: 0x444444, rim: 0xff0000,
      nebulaA: 0x555555, nebulaB: 0x666666, nebulaIntensity: 0.2,
    })
    const after = PLANETS.map(
      (p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uRimColor.value.getHex(),
    )
    // 네 행성 모두 실제로 바뀌었고 — 하나라도 안 바뀌면 루프가 빠진 것
    for (let i = 0; i < before.length; i++) expect(after[i]).not.toBe(before[i])
    // 그러면서도 서로 다른 색으로 남는다 — 전부 같아지면 등급이 고유색을
    // 덮어쓴 것이고, Phase 3이 만든 행성별 정체성이 사라진다.
    expect(new Set(after).size).toBe(PLANETS.length)
    sys.dispose()
  })

  it('setGrade를 부르지 않아도 씬은 Phase 3 기본값으로 동작한다', () => {
    // setGrade는 선택적 확장이다 — 호출하지 않는 경로(테스트·다른 라우트)가
    // 그대로 살아 있어야 기존 계약이 깨지지 않는다.
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun').material.uniforms.uCoreColor.value.getHex())
      .toBe(0xfff1c9)
    expect(sys.group.getObjectByName('nebula').material.uniforms.uIntensity.value)
      .toBeCloseTo(0.32, 6)
    sys.dispose()
  })
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: FAIL — `sys.setGrade is not a function`

- [ ] **Step 3: `setGrade`를 구현한다**

`src/components/SpaceBackground/evanSystem.js`의 반환 객체에서 `setOrbitDraw` 정의 **바로 다음**에 추가한다. 새 배열은 만들지 않는다 — `planetFades`가 이미 각 행성의 머티리얼을 들고 있다.

```js
    // 시간대 라이팅: 방문 시각으로 계산한 등급을 씬 전체에 한 번에 꽂는다.
    // 마운트 시 1회 호출을 전제로 하므로 프레임 예산을 신경 쓰지 않는다.
    // 부르지 않으면 Phase 3 기본값 그대로 동작한다.
    setGrade(grade) {
      sunMat.uniforms.uCoreColor.value.setHex(grade.sunCore)
      sunMat.uniforms.uEdgeColor.value.setHex(grade.sunEdge)
      sunLight.color.setHex(grade.sunLight)
      ambient.color.setHex(grade.ambient)
      // 림은 등급 색으로 덮어쓰지 않는다 — 행성 고유색에서 출발해 등급 색
      // 쪽으로 0.55만큼 섞는다(생성 시 0xbfe0ff를 섞던 그 자리). 덮어쓰면
      // 네 행성의 림이 같아져 행성별 정체성이 사라진다.
      const rim = new THREE.Color(grade.rim)
      planetFades.forEach((pf, i) => {
        pf.material.uniforms.uRimColor.value.setHex(PLANETS[i].color).lerp(rim, 0.55)
      })
      nebulaMat.uniforms.uColorA.value.setHex(grade.nebulaA)
      nebulaMat.uniforms.uColorB.value.setHex(grade.nebulaB)
      nebulaMat.uniforms.uIntensity.value = grade.nebulaIntensity
    },
```

`planetFades`는 `PLANETS.forEach`로 채워지므로 인덱스가 `PLANETS`와 1:1로 맞는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: PASS (새 3개 포함 전부 통과)

- [ ] **Step 5: 전체 단위 테스트가 깨지지 않았는지 확인한다**

Run: `npm test`
Expected: 전부 통과 — 특히 Phase 1~4의 `evanSystem` 계약 테스트가 그대로 살아 있어야 한다

- [ ] **Step 6: 커밋**

```bash
git add src/components/SpaceBackground/evanSystem.js src/components/SpaceBackground/evanSystem.test.js
git commit -m "feat(space): apply a lighting grade to star, lights, planet rims and nebula"
```

---

### Task 3: 방문 시각으로 등급 적용 + e2e

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx`
- Create: `e2e/time-of-day.spec.js`

**Interfaces:**
- Consumes: Task 1의 `computeGrade(hour)`와 `hoursFromDate(date)`; Task 2의 `evanSystem.setGrade(grade)`.
- Produces: 없음 (배선 태스크).

- [ ] **Step 1: 씬 생성 시 등급을 꽂는다**

`src/components/SpaceBackground/SpaceBackground.jsx`의 import 블록에서 `import { computeRailPose } from './rail.js'` 바로 아래에 추가:

```jsx
import { computeGrade, hoursFromDate } from './timeOfDay.js'
```

그리고 `ensureSystem` 안, `evanSystem.setOrbitDraw(1)` 줄 **바로 다음**에 추가:

```jsx
        // 시간대 라이팅: 방문 시각으로 씬의 색온도를 한 번 정한다. 매 프레임
        // 다시 계산하지 않는 이유 — 사람이 한 자리에서 한 시간을 보내지
        // 않으므로 변화가 보이지 않고, 프레임마다 유니폼을 쓰는 비용만 남는다.
        evanSystem.setGrade(computeGrade(hoursFromDate(new Date())))
```

(`ensureSystem`은 `if (!evanSystem) { ... }` 블록 안에서 씬을 1회 생성한다 — 이 줄도 그 블록 안, 즉 생성 직후에 들어가야 한다. 블록 밖의 `evanSystem.group.visible = true`보다 위다.)

- [ ] **Step 2: 빌드와 단위 테스트를 확인한다**

Run: `npm test`
Expected: 전부 통과

Run: `npm run build`
Expected: 정상 종료. "Some chunks are larger than 600 kB" 경고는 이 브랜치 이전부터 있던 것이라 무시한다.

Run: `npx eslint src/components/SpaceBackground/SpaceBackground.jsx`
Expected: 오류 0건

- [ ] **Step 3: e2e 스펙을 쓴다**

`e2e/time-of-day.spec.js`:

```js
import { test, expect } from '@playwright/test'

// 씬은 캔버스 하나라 DOM으로는 색을 읽을 수 없다 — 시계를 고정한 두 시각에서
// 같은 정거장을 렌더해 픽셀이 실제로 다른지로 검증한다.
async function shotAt(browser, isoTime) {
  const context = await browser.newContext()
  const page = await context.newPage()
  // installFakeTimers가 아니라 setFixedTime — 애니메이션 루프의 rAF는 그대로
  // 흘러야 씬이 정상적으로 그려진다. new Date()만 고정하면 된다.
  await page.clock.setFixedTime(new Date(isoTime))
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
  // 항성이 화면을 크게 채우는 home 정거장에서 찍는다 — 색 차이가 가장 크다.
  await page.waitForTimeout(2500)
  const buf = await page.locator('canvas').screenshot()
  await context.close()
  return buf
}

test('방문 시각이 다르면 항성계의 톤이 실제로 달라진다', async ({ browser }) => {
  test.slow()
  // 심야(0시)와 한낮(12시) — 키프레임 표에서 가장 멀리 떨어진 두 지점.
  const night = await shotAt(browser, '2026-08-08T00:00:00')
  const day = await shotAt(browser, '2026-08-08T12:00:00')
  expect(night.equals(day)).toBe(false)
})

```

두 번째 테스트("같은 시각이면 같은 결과")는 **일부러 넣지 않는다.** `computeGrade`는 인자만 받는 순수 함수라 Task 1의 단위 테스트가 이미 결정성을 증명하고, 캔버스 스크린샷은 필름 그레인과 별 회전이 경과 시간에 물려 있어 같은 시각이라도 픽셀이 달라진다 — 통과시키려면 단언을 무의미하게 느슨히 해야 하므로 아예 두지 않는다.

- [ ] **Step 4: e2e를 돌린다**

Run: `npx playwright test e2e/time-of-day.spec.js`
Expected: 1 passed

이 스펙이 **실패하면 코드가 틀린 것이지 테스트가 까다로운 것이 아니다.** 실패의 가장 흔한 원인은 `setGrade` 호출이 `ensureSystem`의 생성 블록 밖에 있어 아예 안 불리는 것이다. 단언을 느슨하게 고치지 말 것.

- [ ] **Step 5: 네 시각을 스크린샷으로 남긴다**

아트 디렉션 확인은 사람 눈이 해야 한다. 아래 임시 스펙으로 네 시각을 캡처해 `/tmp`에 저장하고, **커밋 전에 이 파일을 지운다**. 캡처한 이미지는 컨트롤러가 검토한다.

`e2e/zz-tod-shots.spec.js` (임시):

```js
import { test, expect } from '@playwright/test'

for (const [name, iso] of [
  ['night', '2026-08-08T00:00:00'],
  ['dawn', '2026-08-08T06:00:00'],
  ['noon', '2026-08-08T12:00:00'],
  ['dusk', '2026-08-08T18:00:00'],
]) {
  test(`shot ${name}`, async ({ browser }) => {
    test.slow()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date(iso))
    await page.goto('/')
    await expect(page.locator('section.hero')).not.toHaveClass(
      /hero--awaiting-arrival/,
      { timeout: 20000 },
    )
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `/tmp/tod-${name}.png` })
    await context.close()
  })
}
```

Run: `npx playwright test e2e/zz-tod-shots.spec.js && rm e2e/zz-tod-shots.spec.js`
Expected: 4 passed, 그리고 `/tmp/tod-{night,dawn,noon,dusk}.png` 네 장이 생긴다. 보고서에 네 파일 경로를 적는다.

- [ ] **Step 6: 전체 게이트를 돌린다**

Run: `npm test`
Expected: 전부 통과

Run: `npx playwright test`
Expected: `e2e/destruction.spec.js`의 알려진 **기존** 실패 1건을 제외하고 전부 통과. 그 실패는 이 브랜치의 기준 커밋에서도 재현되는 것으로 무관하다 — 새로 깨진 스펙이 하나라도 있으면 그건 이 브랜치의 회귀이므로 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx e2e/time-of-day.spec.js
git commit -m "feat(space): grade the scene from the visitor's local time on mount"
```

---

## 컨트롤러 확인 사항 (구현자에게 넘기지 않는 것)

- **최종 시각 QA는 컨트롤러가 직접 한다.** 이 기능의 성패는 단위 테스트가 아니라 "검은 우주가 유지되는가"이고, 그 판단은 스크린샷을 눈으로 봐야 나온다. 심야·여명·한낮·황혼 네 시각을 각각 렌더해 하늘 밝기와 별 가시성을 비교한다.
- **`sunLight.intensity`는 건드리지 않는다.** 등급은 색만 바꾼다 — 세기까지 흔들면 위성(`MeshStandardMaterial`)의 노출이 시간대마다 달라져 프로젝트 accent 색이 시각에 따라 다르게 보인다.
- 시간대는 방문자의 **로컬** 시각이다(`Date#getHours`). 서버 시각이나 UTC로 바꾸면 "밤에 오면 밤"이라는 서사 자체가 깨진다.
