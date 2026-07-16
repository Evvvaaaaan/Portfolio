# Warp Transition Phase 1 (워프 전환 완성) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 섹션 전환 워프를 "완성된 항행 연출"로 만든다 — 하이퍼스페이스 스트릭, 워프 포스트프로세싱(블룸 + 방사형 블러/색수차), DOM 슬라이드 blur의 워프 커브 동기화, 섹션별 배경 틴트.

**Architecture:** `SpaceBackground`는 순수 Three.js 유지. 새 요소는 같은 폴더의 독립 모듈(`sectionTint.js`, `warpStreaks.js`, `postfx.js`)로 추가하며 각각 create/update(또는 compute)/dispose 인터페이스를 갖는다. 순수 계산은 렌더 루프와 분리해 vitest로 검증한다. 드라이버는 전부 기존 `computeTransitionIntensity`(스무딩된 `intensitySmooth`) 단일 소스다.

**Tech Stack:** Three.js 0.184 (`three/addons` 포스트프로세싱), Vitest (environment: node), Playwright, React 19, Vite 8.

## Global Constraints

- 성능 예산: 데스크톱 120fps (프레임당 ~8.3ms, rAF 언캡). DPR ≤ 2 유지.
- 포스트프로세싱·워프 스트릭은 데스크톱 전용. 판별 조건은 기존과 동일한 `(min-width: 769px) and (min-height: 701px)`.
- `prefers-reduced-motion: reduce`면 intensity가 0으로 고정되는 기존 동작을 깨지 않는다 (스트릭/왜곡은 intensity=0에서 완전 무효과여야 함).
- R3F 전환 금지 — `SpaceBackground`는 순수 Three.js.
- 순수 계산 함수는 별도 파일로 분리하고 vitest 테스트를 붙인다 (기존 `transitionIntensity.js` 패턴).
- 커밋 메시지는 기존 컨벤션: `feat(space-bg): ...`, `test(space-bg): ...` 등. 본 계획의 모든 작업은 `feat/warp-scroll-transition` 브랜치 위에서 진행.
- 기존 테스트 스위트가 먼저 통과하는지 확인 후 시작 (baseline): `npm test` → 현재 4개 테스트 통과 확인.

---

### Task 1: 섹션별 배경 틴트 순수 함수 (`sectionTint.js`)

**Files:**
- Create: `src/components/SpaceBackground/sectionTint.js`
- Test: `src/components/SpaceBackground/sectionTint.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `computeSectionTint(scrollY: number, viewportHeight: number, tints?: number[][]) => [r, g, b]` (0~1 범위 RGB), `SECTION_TINTS: number[][]` (6개 섹션 팔레트). Task 2가 이 둘을 import한다.

- [ ] **Step 1: baseline 확인**

Run: `npm test`
Expected: 기존 `transitionIntensity.test.js` 4개 테스트 PASS (실패가 있으면 중단하고 보고).

- [ ] **Step 2: 실패하는 테스트 작성**

`src/components/SpaceBackground/sectionTint.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeSectionTint, SECTION_TINTS } from './sectionTint.js'

describe('computeSectionTint', () => {
  it('섹션 경계에 정지해 있으면 그 섹션의 색을 그대로 반환한다', () => {
    expect(computeSectionTint(0, 800)).toEqual(SECTION_TINTS[0])
    expect(computeSectionTint(800, 800)).toEqual(SECTION_TINTS[1])
    expect(computeSectionTint(1600, 800)).toEqual(SECTION_TINTS[2])
  })

  it('전환 중간점에서 두 섹션 색의 중간값을 반환한다', () => {
    const [r, g, b] = computeSectionTint(400, 800)
    expect(r).toBeCloseTo((SECTION_TINTS[0][0] + SECTION_TINTS[1][0]) / 2, 5)
    expect(g).toBeCloseTo((SECTION_TINTS[0][1] + SECTION_TINTS[1][1]) / 2, 5)
    expect(b).toBeCloseTo((SECTION_TINTS[0][2] + SECTION_TINTS[1][2]) / 2, 5)
  })

  it('마지막 섹션을 넘어서면 마지막 색으로 클램프된다', () => {
    expect(computeSectionTint(800 * 99, 800)).toEqual(
      SECTION_TINTS[SECTION_TINTS.length - 1]
    )
  })

  it('음수 스크롤(iOS 바운스)에서는 첫 색으로 클램프된다', () => {
    expect(computeSectionTint(-100, 800)).toEqual(SECTION_TINTS[0])
  })

  it('viewportHeight가 0이면 첫 색을 반환한다 (0 나눗셈 방지)', () => {
    expect(computeSectionTint(500, 0)).toEqual(SECTION_TINTS[0])
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/sectionTint.test.js`
Expected: FAIL — `Cannot find module './sectionTint.js'` 류의 모듈 없음 에러.

- [ ] **Step 4: 구현**

`src/components/SpaceBackground/sectionTint.js`:

```js
// 스크롤 위치를 섹션별 배경 틴트(0~1 RGB)로 변환한다.
// 섹션에 머무를 때는 그 섹션의 색이 유지되고, 전환 구간에서
// smoothstep으로 다음 섹션 색으로 넘어간다 — "다른 좌표에 도착"한 느낌.
// App.jsx의 데스크톱 슬라이드덱(섹션당 정확히 100vh)에서만 의미가 있으므로
// 호출부(SpaceBackground)가 warpEnabled일 때만 사용한다.
export const SECTION_TINTS = [
  [0.039, 0.039, 0.059], // home     — 기본 우주색 (#0a0a0f)
  [0.031, 0.051, 0.106], // about    — 딥 블루
  [0.020, 0.067, 0.075], // skills   — 틸
  [0.067, 0.031, 0.098], // projects — 퍼플
  [0.086, 0.043, 0.051], // contact  — 웜 레드
  [0.024, 0.031, 0.055], // footer   — 다크 네이비
]

export function computeSectionTint(scrollY, viewportHeight, tints = SECTION_TINTS) {
  if (viewportHeight <= 0) return tints[0]
  const progress = Math.max(0, scrollY / viewportHeight)
  const last = tints.length - 1
  const idx = Math.min(Math.floor(progress), last)
  const next = Math.min(idx + 1, last)
  const frac = Math.min(progress - idx, 1)
  if (frac === 0 || idx === next) return tints[idx]
  const t = frac * frac * (3 - 2 * frac) // smoothstep — 경계에서 색이 잠시 머무름
  return [
    tints[idx][0] + (tints[next][0] - tints[idx][0]) * t,
    tints[idx][1] + (tints[next][1] - tints[idx][1]) * t,
    tints[idx][2] + (tints[next][2] - tints[idx][2]) * t,
  ]
}
```

주의: `frac === 0`이면 배열 인스턴스를 그대로 반환해 `toEqual`뿐 아니라 불필요한 할당도 피한다. 마지막 섹션 클램프 시 `idx === next`라 조기 반환된다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/sectionTint.test.js`
Expected: 5개 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/components/SpaceBackground/sectionTint.js src/components/SpaceBackground/sectionTint.test.js
git commit -m "feat(space-bg): add pure section tint palette function"
```

---

### Task 2: 배경 틴트를 렌더 루프에 연결

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx` (import 블록, tick 루프)

**Interfaces:**
- Consumes: Task 1의 `computeSectionTint(scrollY, viewportHeight)`
- Produces: 없음 (시각 효과만)

- [ ] **Step 1: import 추가 및 tick 수정**

`SpaceBackground.jsx` 상단 import에 추가:

```js
import { computeSectionTint } from './sectionTint.js'
```

`renderer.setClearColor(0x0a0a0f, 1)` 라인(현재 41행) 아래에 재사용 Color 인스턴스 추가:

```js
    const clearColor = new THREE.Color(0x0a0a0f)
```

tick 루프 안, `renderer.render(scene, camera)` 직전에 추가:

```js
      // 섹션별 우주 좌표 틴트: 메인 데스크톱 슬라이드덱에서만 의미가 있다.
      // (다른 라우트는 섹션이 100vh 고정이 아니므로 기본색 유지)
      if (warpEnabledRef.current) {
        const [r, g, b] = computeSectionTint(window.scrollY, window.innerHeight)
        clearColor.setRGB(r, g, b)
      } else {
        clearColor.set(0x0a0a0f)
      }
      renderer.setClearColor(clearColor, 1)
```

- [ ] **Step 2: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 기존 + Task 1 테스트 전부 PASS.

- [ ] **Step 3: 수동 확인**

Run: `npm run dev` 후 브라우저에서 `http://localhost:5173`
확인: 데스크톱에서 섹션을 넘길 때마다 배경 바탕색이 섹션별 색조(블루→틸→퍼플→레드→네이비)로 부드럽게 바뀌는지, `/gallery`로 이동하면 기본색으로 돌아오는지.

- [ ] **Step 4: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): tint clear color per section coordinate"
```

---

### Task 3: 하이퍼스페이스 스트릭 모듈 (`warpStreaks.js`)

**Files:**
- Create: `src/components/SpaceBackground/warpStreaks.js`
- Test: `src/components/SpaceBackground/warpStreaks.test.js`

**Interfaces:**
- Consumes: 없음 (three만 사용; WebGL 렌더러 불필요 — node 환경에서 테스트 가능)
- Produces: `createWarpStreaks({ count?: number }) => { object3d: THREE.LineSegments, update(intensity: number): void, dispose(): void }`. Task 4가 이 팩토리를 import한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SpaceBackground/warpStreaks.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createWarpStreaks } from './warpStreaks.js'

describe('createWarpStreaks', () => {
  it('count개의 스트릭이 각각 머리/꼬리 정점 한 쌍을 갖는다', () => {
    const s = createWarpStreaks({ count: 10 })
    expect(s.object3d.geometry.getAttribute('position').count).toBe(20)
    expect(s.object3d.geometry.getAttribute('aTail').count).toBe(20)
    s.dispose()
  })

  it('머리/꼬리 정점은 같은 위치에서 시작한다 (셰이더가 꼬리만 늘림)', () => {
    const s = createWarpStreaks({ count: 3 })
    const pos = s.object3d.geometry.getAttribute('position').array
    for (let i = 0; i < 3; i++) {
      const head = i * 6
      expect(pos[head]).toBe(pos[head + 3])
      expect(pos[head + 1]).toBe(pos[head + 4])
      expect(pos[head + 2]).toBe(pos[head + 5])
    }
    s.dispose()
  })

  it('intensity 0이면 완전히 숨겨진다', () => {
    const s = createWarpStreaks({ count: 4 })
    s.update(0)
    expect(s.object3d.visible).toBe(false)
    expect(s.object3d.material.uniforms.uOpacity.value).toBe(0)
    s.dispose()
  })

  it('intensity가 커지면 보이고 길이/밝기가 커진다', () => {
    const s = createWarpStreaks({ count: 4 })
    s.update(1)
    expect(s.object3d.visible).toBe(true)
    expect(s.object3d.material.uniforms.uStretch.value).toBe(220)
    expect(s.object3d.material.uniforms.uOpacity.value).toBeCloseTo(0.55, 5)
    s.dispose()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/warpStreaks.test.js`
Expected: FAIL — 모듈 없음 에러.

- [ ] **Step 3: 구현**

`src/components/SpaceBackground/warpStreaks.js`:

```js
import * as THREE from 'three'

// 워프 전환 정점에서 별이 카메라 쪽으로 길게 늘어나는 하이퍼스페이스 스트릭.
// 각 스트릭은 같은 위치의 정점 두 개(머리 aTail=0, 꼬리 aTail=1)로 시작하고,
// 버텍스 셰이더가 꼬리만 +z(카메라 쪽)로 uStretch만큼 밀어 원근에 의해
// 화면 중심에서 방사형으로 뻗는 선이 된다. 평상시(intensity=0)에는
// visible=false로 렌더 비용이 0이다.
const VERT = /* glsl */ `
  attribute float aTail;
  uniform float uStretch;
  varying float vTail;
  void main() {
    vTail = aTail;
    vec3 p = position;
    p.z += aTail * uStretch;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vTail;
  void main() {
    float alpha = (1.0 - vTail) * uOpacity;
    gl_FragColor = vec4(0.72, 0.82, 1.0, alpha);
  }
`

export function createWarpStreaks({ count = 400 } = {}) {
  const positions = new Float32Array(count * 2 * 3)
  const tails = new Float32Array(count * 2)

  for (let i = 0; i < count; i++) {
    // 별필드(±2600, z -900~600)와 같은 공간감이되 화면 중앙을 살짝 비운다.
    const x = (Math.random() - 0.5) * 2200
    const y = (Math.random() - 0.5) * 2200
    const z = -900 + Math.random() * 1200
    for (let v = 0; v < 2; v++) {
      const o = (i * 2 + v) * 3
      positions[o] = x
      positions[o + 1] = y
      positions[o + 2] = z
      tails[i * 2 + v] = v
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uStretch: { value: 0 },
      uOpacity: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const object3d = new THREE.LineSegments(geometry, material)
  object3d.visible = false

  return {
    object3d,
    update(intensity) {
      object3d.visible = intensity > 0.02
      material.uniforms.uStretch.value = intensity * 220
      material.uniforms.uOpacity.value = intensity <= 0
        ? 0
        : Math.min(1, intensity * 1.2) * 0.55
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/warpStreaks.test.js`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/warpStreaks.js src/components/SpaceBackground/warpStreaks.test.js
git commit -m "feat(space-bg): add hyperspace streak module"
```

---

### Task 4: 스트릭을 씬에 통합

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx` (import, 씬 구성, tick, cleanup)

**Interfaces:**
- Consumes: Task 3의 `createWarpStreaks()`, 기존 `intensitySmooth`
- Produces: 없음 (시각 효과만)

- [ ] **Step 1: 통합 코드 작성**

`SpaceBackground.jsx` import에 추가:

```js
import { createWarpStreaks } from './warpStreaks.js'
```

`scene.add(starsPoints)` 직후에 추가:

```js
    // 하이퍼스페이스 스트릭: 워프 전환 정점에서만 나타난다 (데스크톱 전용 연출
    // 이지만 게이트는 intensity가 담당 — 모바일/other 라우트는 intensity=0).
    const streaks = createWarpStreaks({ count: 400 })
    scene.add(streaks.object3d)
```

tick 루프 안, `intensitySmooth` 계산(기존 `intensitySmooth += ...` 라인) 이후에 추가:

```js
      // 스트릭은 별필드와 같은 회전을 따라가 한 몸처럼 보이게 한다.
      streaks.object3d.rotation.copy(starsPoints.rotation)
      streaks.update(intensitySmooth)
```

cleanup(return 함수) 안 `starGeo.dispose()` 앞에 추가:

```js
      streaks.dispose()
```

- [ ] **Step 2: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 전부 PASS.

- [ ] **Step 3: 수동 확인**

Run: `npm run dev` 후 데스크톱 뷰포트에서 섹션 전환.
확인: 전환 정점에서 별 사이로 방사형 빛줄기가 나타났다 사라지는지, 섹션에 정지해 있을 때는 전혀 보이지 않는지, 모바일 뷰포트(개발자도구 반응형 모드)에서는 나타나지 않는지.

- [ ] **Step 4: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): render hyperspace streaks during warp"
```

---

### Task 5: 포스트프로세싱 모듈 (`postfx.js`)

**Files:**
- Create: `src/components/SpaceBackground/postfx.js`

**Interfaces:**
- Consumes: three 렌더러/씬/카메라 인스턴스 (WebGL 필요 — vitest 불가, e2e/수동 검증)
- Produces: `createPostFX(renderer, scene, camera, width, height) => { render(intensity: number): void, setSize(w: number, h: number): void, dispose(): void }`. Task 6이 import한다.

- [ ] **Step 1: 구현**

`src/components/SpaceBackground/postfx.js`:

```js
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

// 데스크톱 전용 포스트프로세싱 체인: 은은한 블룸(상시) + 워프 정점에서만
// 걸리는 방사형 블러/색수차(uIntensity 드라이버, 0이면 입력 그대로 통과).
// WebGL 컨텍스트가 필요해 vitest 대상이 아니다 — e2e 스모크와 수동 검증.
const WarpDistortShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 center = vec2(0.5);
      vec2 toCenter = center - vUv;
      float dist = length(toCenter);

      // 방사형 블러: 중심 방향으로 6샘플 누적 (uIntensity=0이면 step=0 → 원본)
      vec2 blurStep = toCenter * uIntensity * 0.05;
      vec3 acc = vec3(0.0);
      vec2 uv = vUv;
      for (int i = 0; i < 6; i++) {
        acc += texture2D(tDiffuse, uv).rgb;
        uv += blurStep;
      }
      acc /= 6.0;

      // 색수차: 가장자리로 갈수록 RGB 채널 분리
      float ca = uIntensity * dist * 0.012;
      vec2 dir = normalize(toCenter + vec2(1e-6));
      float r = texture2D(tDiffuse, vUv + dir * ca).r;
      float b = texture2D(tDiffuse, vUv - dir * ca).b;
      vec3 split = vec3(r, acc.g, b);

      vec3 color = mix(acc, split, min(1.0, uIntensity * 1.5));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export function createPostFX(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // 블룸은 은은하게: threshold를 높여 밝은 별심만 번지게 한다.
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.55, 0.82)
  composer.addPass(bloom)

  const warpPass = new ShaderPass(WarpDistortShader)
  composer.addPass(warpPass)

  return {
    render(intensity) {
      warpPass.uniforms.uIntensity.value = intensity
      composer.render()
    },
    setSize(w, h) {
      composer.setSize(w, h)
    },
    dispose() {
      composer.dispose()
    },
  }
}
```

- [ ] **Step 2: 빌드로 import 경로 검증**

Run: `npm run build`
Expected: 에러 없이 빌드 성공 (`three/addons/...` 경로가 three 0.184 exports로 해석되는지 확인).

- [ ] **Step 3: 커밋**

```bash
git add src/components/SpaceBackground/postfx.js
git commit -m "feat(space-bg): add desktop post-processing chain (bloom + warp distortion)"
```

---

### Task 6: 포스트프로세싱을 렌더 루프에 통합 (데스크톱 게이트 + 120fps 실측)

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx` (import, 초기화, tick, resize, cleanup)

**Interfaces:**
- Consumes: Task 5의 `createPostFX()`, 기존 `intensitySmooth`
- Produces: 없음

- [ ] **Step 1: 통합 코드 작성**

`SpaceBackground.jsx` import에 추가:

```js
import { createPostFX } from './postfx.js'
```

`camera.position.z = 400` 라인 이후(씬 구성 전 아무 곳), 데스크톱 게이트로 생성:

```js
    // 포스트프로세싱은 데스크톱 전용 (스펙: 모바일은 중간 수준 유지).
    // 데스크톱 판별은 App.jsx의 useMediaQuery와 동일 조건을 독립 계산한다.
    // 워프 왜곡 패스는 intensity=0이면 무효과이므로 메인 페이지가 아닐 때는
    // 블룸만 남는다.
    const isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    const postfx = isDesktop
      ? createPostFX(renderer, scene, camera, window.innerWidth, window.innerHeight)
      : null
```

tick 루프의 `renderer.render(scene, camera)`를 다음으로 교체:

```js
      if (postfx) {
        postfx.render(intensitySmooth)
      } else {
        renderer.render(scene, camera)
      }
```

`onResize` 함수의 `camera.updateProjectionMatrix()` 뒤에 추가:

```js
      postfx?.setSize(window.innerWidth, window.innerHeight)
```

cleanup에 `renderer.dispose()` 앞에 추가:

```js
      postfx?.dispose()
```

- [ ] **Step 2: 전체 테스트 + 빌드 확인**

Run: `npm test && npm run build`
Expected: 테스트 전부 PASS, 빌드 성공.

- [ ] **Step 3: 수동 확인 — 시각 품질**

Run: `npm run dev` 후 데스크톱 뷰포트.
확인: (1) 평상시 밝은 별에 은은한 번짐, (2) 전환 정점에서 화면 가장자리 방사형 블러 + 색 분리, (3) 섹션 정지 시 왜곡 완전 소멸, (4) 모바일 뷰포트에서는 기존과 동일(포스트프로세싱 없음).

- [ ] **Step 4: 수동 확인 — 120fps 예산 실측**

Chrome DevTools → Performance 패널 → 고주사율 모니터에서 녹화하며 섹션 3회 전환.
확인: 프레임 시간이 ~8.3ms 이내(120fps 유지)인지. **예산 초과 시**: 블룸 strength/radius 축소(0.35→0.25, 0.55→0.4) 또는 composer 해상도 축소(`composer.setSize(w * 0.85, h * 0.85)`)를 순서대로 시도하고, 그래도 초과하면 UnrealBloomPass 제거(워프 왜곡 패스만 유지). 결정 사항을 커밋 메시지에 기록.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space-bg): route rendering through desktop postfx chain"
```

---

### Task 7: DOM 슬라이드 blur를 워프 커브에 동기화

**Files:**
- Modify: `src/App.jsx` (import 블록, `MainPage`의 `handleScroll` — 현재 97~135행)

**Interfaces:**
- Consumes: 기존 `computeTransitionIntensity(scrollY, viewportHeight)` (`src/components/SpaceBackground/transitionIntensity.js`)
- Produces: 없음

- [ ] **Step 1: 수정**

`App.jsx` import에 추가:

```js
import { computeTransitionIntensity } from './components/SpaceBackground/transitionIntensity.js'
```

`handleScroll` 안, `const progress = ...` 라인 다음에 추가:

```js
      // DOM blur를 배경 워프와 같은 커브(0→1→0 포물선)로 구동해 두 레이어의
      // 타이밍을 일치시킨다. 기존 |offset| 비례 blur는 슬라이드가 떠날수록
      // 계속 증가해 카메라 워프(중간점 정점)와 어긋났다.
      const transitionBlur = computeTransitionIntensity(window.scrollY, window.innerHeight) * 12
```

`offset > 0` 분기의 `blur = offset * 15`를 다음으로 교체:

```js
          blur = transitionBlur
```

`offset < 0` 분기의 `blur = Math.abs(offset) * 15`를 다음으로 교체:

```js
          blur = transitionBlur
```

- [ ] **Step 2: 테스트 + 수동 확인**

Run: `npm test`
Expected: 전부 PASS.

Run: `npm run dev` 후 데스크톱에서 섹션 전환.
확인: 슬라이드 blur가 전환 중간점에서 최대였다가 도착 시 0으로 — 배경 워프의 가속/감속과 같은 리듬으로 느껴지는지. 스냅 후 잔류 blur가 없는지.

- [ ] **Step 3: 커밋**

```bash
git add src/App.jsx
git commit -m "feat(main): sync slide blur with warp transition curve"
```

---

### Task 8: e2e 스모크 테스트 + 최종 검증

**Files:**
- Create: `e2e/warp-visuals.spec.js`

**Interfaces:**
- Consumes: Task 1~7의 통합 결과 (dev 서버 전체)
- Produces: 없음 (회귀 방지 게이트)

- [ ] **Step 1: e2e 테스트 작성**

`e2e/warp-visuals.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('메인 페이지 워프 연출이 콘솔 에러 없이 렌더된다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible()

  // 섹션 여러 개를 넘기며 워프 전환(스트릭/포스트프로세싱/틴트)을 트리거
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(1000)

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: e2e 실행**

Run: `npx playwright test e2e/warp-visuals.spec.js`
Expected: 1 passed. (WebGL은 headless chromium의 SwiftShader로 렌더 — 셰이더 컴파일 에러가 있으면 콘솔 에러로 잡힌다.)

- [ ] **Step 3: 전체 게이트 실행**

Run: `npm test && npm run lint && npm run build && npx playwright test`
Expected: vitest 전부 PASS, lint 클린, 빌드 성공, e2e 전부 PASS (기존 modes e2e 포함).

- [ ] **Step 4: 커밋**

```bash
git add e2e/warp-visuals.spec.js
git commit -m "test(e2e): add warp visuals smoke test"
```

---

## Self-Review 결과

- **스펙 커버리지**: 하이퍼스페이스 스트릭(Task 3·4), 포스트프로세싱 데스크톱 전용(Task 5·6), DOM 동기화(Task 7), 섹션별 우주 좌표(Task 1·2), 120fps 실측 게이트(Task 6 Step 4), 테스트 전략(각 Task + Task 8) — Phase 1 요구사항 전부 매핑됨.
- **모듈 인터페이스**: 스펙의 `create/update/dispose` 원칙 준수. `postfx.js`는 update 대신 `render(intensity)`가 그 역할(렌더와 uniform 갱신이 한 동작).
- **reduced-motion**: 기존 intensity=0 고정 로직을 그대로 타므로 스트릭·왜곡 모두 자동 무효과. 별도 코드 불필요함을 확인.
- **타입 일관성**: `computeSectionTint`/`SECTION_TINTS`(Task 1↔2), `createWarpStreaks`(Task 3↔4), `createPostFX`(Task 5↔6) 시그니처 일치 확인.
