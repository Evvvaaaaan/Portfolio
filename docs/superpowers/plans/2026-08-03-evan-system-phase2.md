# Evan System Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 방문 시 항성계가 청사진 선으로 그려진 뒤 점화되어 실체화되는 시그니처 인트로를 만들고, 그 "선 → 와이어프레임 → 실체" 전환을 커스텀 GLSL 공용 머티리얼로 구현한다 (스펙 Phase 2).

**Architecture:** 각 행성/위성/링은 **쌍둥이 메시**를 갖는다 — 기존 `MeshStandardMaterial` 실체 메시와, 바리센트릭 좌표로 와이어를 그리는 커스텀 `ShaderMaterial` 청사진 메시. 하나의 `build` 진행도(0~1)가 둘의 교차 페이드를 구동한다. 궤도 라인은 호 길이(`aArc`) 기반 리빌 셰이더로 그려지고, 배경에는 풀스크린 청사진 그리드 쿼드가 깔린다. 인트로 타임라인은 순수 모듈이며, 종료 시 기존 도착 워프(arrivalSequence)로 넘긴다.

**Tech Stack:** three.js 0.184 (명령형 — R3F 금지), 커스텀 GLSL, vitest, Playwright.

## Global Constraints

- **검은 우주 + 떠다니는 별 룩 유지**: `SpaceBackground.jsx`의 별 필드 생성 블록(STARS 6500, 색·크기·텍스처)은 **수정 금지**.
- **R3F/drei 도입 금지**, **새 npm 의존성 추가 금지**.
- **`build = 1`에서 오늘과 픽셀 동일해야 한다**: 실체 머티리얼은 인트로가 끝나면 `transparent = false`로 되돌려 현행 렌더 경로(불투명 큐)를 그대로 복원한다. 이것이 시각 회귀를 막는 핵심 계약이다.
- **기존 기능 무손실**: 4개 모드(Terminal/Speedrun/Destruction/Inspect), i18n 4개 언어, 해시 내비, 도착 시퀀스 계약(`ARRIVAL_DONE_EVENT`는 어떤 경로로든 반드시 발화), Lab 워프 부스트.
- **인트로 재생 정책 (사용자 확정)**: **첫 방문만** 풀 인트로. `sessionStorage`로 판정하며, 재방문은 기존 2.4초 도착 워프만 재생한다.
- **`prefers-reduced-motion`**: 인트로 전체를 건너뛰고 즉시 `build = 1`.
- **모바일/비데스크톱**: 인트로 없음 (`stageEnabled`가 false이므로 자연히 제외).
- GLSL 모듈은 기존 `src/pages/Gallery/sky.glsl.js` 패턴을 따른다 — 셰이더 문자열과 유니폼 이름 배열을 export하고, 유니폼 선언·사용을 정규식으로 검증하는 테스트를 짝지어 둔다.
- 주석은 "왜"를 설명하는 한국어. 커밋 메시지는 영어 `feat(scope): ...` / `fix(scope): ...`, 마지막 줄에:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
src/components/SpaceBackground/
  barycentric.js            # [신규] 지오메트리 → 비인덱스 + aBary 속성 (순수)
  barycentric.test.js       # [신규]
  blueprint.glsl.js         # [신규] 청사진 메시 셰이더 문자열 + 유니폼 이름
  blueprint.glsl.test.js    # [신규]
  blueprintMaterial.js      # [신규] createBlueprintMaterial → {material,setBuild,dispose}
  blueprintMaterial.test.js # [신규]
  introVisuals.glsl.js      # [신규] 그리드 쿼드 + 궤도 리빌 셰이더 문자열
  introVisuals.glsl.test.js # [신규]
  introSequence.js          # [신규] 인트로 타임라인·첫방문 판정·스태거 (순수)
  introSequence.test.js     # [신규]
  evanSystem.js             # [수정] 쌍둥이 메시, 궤도 리빌, setBuild/setOrbitDraw
  evanSystem.test.js        # [수정]
  SpaceBackground.jsx       # [수정] 인트로 구동 + 그리드 쿼드 + 도착 핸드오프
e2e/
  evan-intro.spec.js        # [신규] 인트로 스모크
```

---

### Task 0: 베이스라인 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 기존 테스트/린트/빌드 실행**

```bash
cd /Users/evan/Desktop/02_project_dev/dev/evan-portfolio
npm test 2>&1 | tail -4
npm run lint 2>&1 | tail -3
npm run build 2>&1 | grep -E "✓ built|error"
```

Expected: vitest 228/228 통과, 빌드 성공. 린트는 **기존 에러가 다수 존재**한다(`build/` 산출물과 손대지 않은 파일들) — 앞으로의 기준은 "내가 만진 파일에 새 에러 0"이다. 유닛 테스트나 빌드가 실패하면 **작업을 중단하고 보고**한다.

---

### Task 1: 바리센트릭 속성 `barycentric.js`

**Files:**
- Create: `src/components/SpaceBackground/barycentric.js`
- Test: `src/components/SpaceBackground/barycentric.test.js`

**Interfaces:**
- Consumes: 없음 (three.js만)
- Produces: `toBarycentricGeometry(geometry: THREE.BufferGeometry) → THREE.BufferGeometry`
  - 입력을 비인덱스로 변환하고 `aBary` (itemSize 3) 속성을 추가한 **새 지오메트리**를 반환한다. 입력은 수정하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/barycentric.test.js
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { toBarycentricGeometry } from './barycentric.js'

describe('toBarycentricGeometry', () => {
  it('aBary 속성을 정점 수만큼 추가한다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const out = toBarycentricGeometry(src)
    const pos = out.getAttribute('position')
    const bary = out.getAttribute('aBary')
    expect(bary).toBeTruthy()
    expect(bary.itemSize).toBe(3)
    expect(bary.count).toBe(pos.count)
  })

  it('삼각형마다 세 정점이 (1,0,0),(0,1,0),(0,0,1)을 받는다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const bary = toBarycentricGeometry(src).getAttribute('aBary')
    // 와이어프레임 계산은 삼각형 안에서 세 축이 각각 1이어야 성립한다.
    for (let i = 0; i < bary.count; i += 3) {
      expect([bary.getX(i), bary.getY(i), bary.getZ(i)]).toEqual([1, 0, 0])
      expect([bary.getX(i + 1), bary.getY(i + 1), bary.getZ(i + 1)]).toEqual([0, 1, 0])
      expect([bary.getX(i + 2), bary.getY(i + 2), bary.getZ(i + 2)]).toEqual([0, 0, 1])
    }
  })

  it('비인덱스 지오메트리를 돌려준다 (인덱스가 있으면 정점 공유로 바리센트릭이 깨진다)', () => {
    const out = toBarycentricGeometry(new THREE.SphereGeometry(1, 6, 4))
    expect(out.index).toBeNull()
  })

  it('입력 지오메트리를 변형하지 않는다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4)
    const hadIndex = src.index !== null
    toBarycentricGeometry(src)
    expect(src.index !== null).toBe(hadIndex)
    expect(src.getAttribute('aBary')).toBeUndefined()
  })

  it('이미 비인덱스인 지오메트리도 처리한다', () => {
    const src = new THREE.SphereGeometry(1, 6, 4).toNonIndexed()
    const out = toBarycentricGeometry(src)
    expect(out.getAttribute('aBary').count).toBe(out.getAttribute('position').count)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/barycentric.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/barycentric.js
// 와이어프레임을 프래그먼트 셰이더에서 그리려면 각 삼각형 안에서 "변까지의
// 거리"를 알아야 한다. 바리센트릭 좌표가 그 거리를 준다 — 세 정점에
// (1,0,0),(0,1,0),(0,0,1)을 심어두면 보간된 값의 최솟값이 곧 가장 가까운
// 변까지의 거리다.
//
// 인덱스 지오메트리는 정점을 삼각형끼리 공유하므로 한 정점에 서로 다른
// 바리센트릭 값을 줄 수 없다 — 반드시 비인덱스로 펼친 뒤 심는다.
import * as THREE from 'three'

export function toBarycentricGeometry(geometry) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const count = geo.getAttribute('position').count
  const bary = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // i % 3 == 0 → (1,0,0), 1 → (0,1,0), 2 → (0,0,1)
    bary[i * 3 + (i % 3)] = 1
  }
  geo.setAttribute('aBary', new THREE.BufferAttribute(bary, 3))
  return geo
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/barycentric.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/barycentric.js src/components/SpaceBackground/barycentric.test.js
git commit -m "feat(space): barycentric attribute builder for shader wireframes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 청사진 셰이더 `blueprint.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/blueprint.glsl.js`
- Test: `src/components/SpaceBackground/blueprint.glsl.test.js`

**Interfaces:**
- Consumes: 없음 (순수 문자열)
- Produces: `BLUEPRINT_VERT: string`, `BLUEPRINT_FRAG: string`, `BLUEPRINT_UNIFORM_NAMES: string[]`
  - 유니폼: `uBuild` (0~1 빌드 진행도), `uLineColor` (vec3), `uExtent` (float — 스윕 정규화용 오브젝트 반경)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/blueprint.glsl.test.js
import { describe, it, expect } from 'vitest'
import { BLUEPRINT_VERT, BLUEPRINT_FRAG, BLUEPRINT_UNIFORM_NAMES } from './blueprint.glsl.js'

describe('blueprint 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(BLUEPRINT_UNIFORM_NAMES).toEqual(['uBuild', 'uLineColor', 'uExtent'])
  })

  it('프래그먼트가 모든 유니폼을 실제로 선언한다', () => {
    // 이름이 본문에 등장하는 것만으로는 부족하다 — 선언문이 있어야
    // ShaderMaterial이 값을 밀어 넣을 수 있다.
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      expect(BLUEPRINT_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
    }
  })

  it('선언만 하고 쓰지 않는 유니폼이 없다', () => {
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      const uses = BLUEPRINT_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('버텍스가 aBary 속성을 받아 프래그먼트로 넘긴다', () => {
    expect(BLUEPRINT_VERT).toMatch(/attribute\s+vec3\s+aBary\s*;/)
    expect(BLUEPRINT_VERT).toMatch(/varying\s+vec3\s+vBary\s*;/)
    expect(BLUEPRINT_VERT).toMatch(/vBary\s*=\s*aBary\s*;/)
    expect(BLUEPRINT_FRAG).toMatch(/varying\s+vec3\s+vBary\s*;/)
  })

  it('스윕용 로컬 좌표를 넘긴다', () => {
    expect(BLUEPRINT_VERT).toMatch(/varying\s+vec3\s+vLocal\s*;/)
    expect(BLUEPRINT_FRAG).toMatch(/varying\s+vec3\s+vLocal\s*;/)
  })

  it('화면 공간 보정(fwidth)으로 선 굵기를 일정하게 유지한다', () => {
    // fwidth 없이 바리센트릭 임계값만 쓰면 멀리 있는 오브젝트의 선이 사라진다.
    expect(BLUEPRINT_FRAG).toMatch(/fwidth\s*\(/)
  })

  it('gl_FragColor를 쓴다 (three 0.184 프래그먼트 출력 규약)', () => {
    expect(BLUEPRINT_FRAG).toMatch(/gl_FragColor\s*=/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/blueprint.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/blueprint.glsl.js
// 청사진 메시 셰이더: 실체 메시와 같은 지오메트리를 겹쳐 그리며 "선 드로잉 →
// 와이어프레임"까지를 담당한다. 실체화(0.55~1.0 구간)는 실체 메시의 opacity가
// 맡고, 이 셰이더는 그 구간에서 역으로 사라진다 — 둘의 합이 교차 페이드다.
//
// 실체 머티리얼에 onBeforeCompile로 주입하지 않고 별도 메시로 분리한 이유:
// 주입은 three.js 내부 청크 이름에 의존해 버전 업그레이드에 취약하고,
// build=1에서 원래 렌더 경로와 완전히 같다는 보장을 하기 어렵다.

export const BLUEPRINT_UNIFORM_NAMES = ['uBuild', 'uLineColor', 'uExtent']

export const BLUEPRINT_VERT = /* glsl */ `
attribute vec3 aBary;
varying vec3 vBary;
varying vec3 vLocal;

void main() {
  vBary = aBary;
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const BLUEPRINT_FRAG = /* glsl */ `
precision highp float;

uniform float uBuild;
uniform vec3 uLineColor;
uniform float uExtent;

varying vec3 vBary;
varying vec3 vLocal;

// 바리센트릭 최솟값 = 가장 가까운 삼각형 변까지의 거리.
// fwidth로 화면 공간 미분을 취해야 원근에 상관없이 선 굵기가 일정하다
// (안 그러면 멀리 있는 행성의 와이어가 통째로 사라지거나 뭉갠다).
float wireEdge(vec3 bary, float width) {
  vec3 d = fwidth(bary) * width;
  vec3 a = smoothstep(vec3(0.0), d, bary);
  return 1.0 - min(min(a.x, a.y), a.z);
}

void main() {
  float wire = wireEdge(vBary, 1.4);

  // 드로잉 스윕: 오브젝트 아래(-Y)에서 위(+Y)로 훑으며 선이 나타난다.
  // uExtent로 정규화해 크기가 다른 행성들이 같은 속도로 그려지게 한다.
  float h = clamp(vLocal.y / max(uExtent, 0.0001) * 0.5 + 0.5, 0.0, 1.0);
  float front = smoothstep(0.0, 0.5, uBuild);
  float drawn = 1.0 - smoothstep(front - 0.10, front + 0.02, h);

  // 0.55부터 실체 메시가 올라오므로 청사진은 그만큼 물러난다.
  float fade = 1.0 - smoothstep(0.55, 1.0, uBuild);
  float alpha = wire * drawn * fade;

  // 드로잉 프런트 부근을 밝게 태워 "지금 그려지는 중"이 읽히게 한다.
  float hot = smoothstep(0.12, 0.0, abs(h - front)) * fade;

  gl_FragColor = vec4(uLineColor * (0.75 + 1.6 * hot), alpha);
  if (gl_FragColor.a < 0.003) discard;
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/blueprint.glsl.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/blueprint.glsl.js src/components/SpaceBackground/blueprint.glsl.test.js
git commit -m "feat(space): blueprint mesh shader — line draw into wireframe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 청사진 머티리얼 `blueprintMaterial.js`

**Files:**
- Create: `src/components/SpaceBackground/blueprintMaterial.js`
- Test: `src/components/SpaceBackground/blueprintMaterial.test.js`

**Interfaces:**
- Consumes: `BLUEPRINT_VERT`, `BLUEPRINT_FRAG` (Task 2)
- Produces: `createBlueprintMaterial({ color: number|string, extent: number }) → { material: THREE.ShaderMaterial, setBuild(v: number): void }`
  - `setBuild`는 0~1로 클램프한다. `material.visible`은 `build < 1`일 때만 true (build=1에서 청사진이 완전히 빠져야 오늘 렌더와 같아진다).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/blueprintMaterial.test.js
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBlueprintMaterial } from './blueprintMaterial.js'
import { BLUEPRINT_UNIFORM_NAMES } from './blueprint.glsl.js'

describe('createBlueprintMaterial', () => {
  it('셰이더 머티리얼과 계약 유니폼을 만든다', () => {
    const { material } = createBlueprintMaterial({ color: 0x6db5ff, extent: 15 })
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      expect(material.uniforms[u]).toBeTruthy()
    }
    expect(material.uniforms.uExtent.value).toBe(15)
  })

  it('가산 합성 + 깊이 쓰기 없음 (선이 실체 표면에 파묻히지 않게)', () => {
    const { material } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.blending).toBe(THREE.AdditiveBlending)
  })

  it('setBuild가 유니폼에 반영된다', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(0.4)
    expect(material.uniforms.uBuild.value).toBeCloseTo(0.4, 6)
  })

  it('setBuild는 0~1로 클램프한다', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(-3)
    expect(material.uniforms.uBuild.value).toBe(0)
    setBuild(9)
    expect(material.uniforms.uBuild.value).toBe(1)
  })

  it('build=1이면 청사진이 완전히 빠진다 (오늘 렌더와 동일해야 하는 계약)', () => {
    const { material, setBuild } = createBlueprintMaterial({ color: 0x6db5ff, extent: 1 })
    setBuild(0.5)
    expect(material.visible).toBe(true)
    setBuild(1)
    expect(material.visible).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/blueprintMaterial.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/blueprintMaterial.js
import * as THREE from 'three'
import { BLUEPRINT_VERT, BLUEPRINT_FRAG } from './blueprint.glsl.js'

export function createBlueprintMaterial({ color, extent }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: BLUEPRINT_VERT,
    fragmentShader: BLUEPRINT_FRAG,
    uniforms: {
      uBuild: { value: 0 },
      uLineColor: { value: new THREE.Color(color) },
      uExtent: { value: extent },
    },
    // 가산 합성 + depthWrite:false — 청사진 선은 발광체처럼 겹쳐 보여야 하고,
    // 깊이를 쓰면 뒤따라 그려지는 실체 메시가 선에 가려 뚫려 보인다.
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  return {
    material,
    setBuild(v) {
      const b = Math.min(Math.max(v, 0), 1)
      material.uniforms.uBuild.value = b
      // build=1에서는 청사진 메시를 렌더 목록에서 통째로 뺀다. 알파가 0이어도
      // 투명 큐에 남아 있으면 정렬 비용과 미세한 합성 오차가 생기고, 무엇보다
      // "인트로가 끝나면 오늘과 픽셀 동일" 계약을 보장할 수 없다.
      material.visible = b < 1
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/blueprintMaterial.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/blueprintMaterial.js src/components/SpaceBackground/blueprintMaterial.test.js
git commit -m "feat(space): blueprint material factory with build-driven visibility

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 인트로 비주얼 셰이더 `introVisuals.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/introVisuals.glsl.js`
- Test: `src/components/SpaceBackground/introVisuals.glsl.test.js`

**Interfaces:**
- Consumes: 없음 (순수 문자열)
- Produces:
  - `GRID_VERT`, `GRID_FRAG`, `GRID_UNIFORM_NAMES = ['uOpacity', 'uAspect', 'uLineColor']` — 풀스크린 청사진 그리드 쿼드용. 클립 공간에 바로 그리므로 카메라와 무관하다.
  - `ORBIT_VERT`, `ORBIT_FRAG`, `ORBIT_UNIFORM_NAMES = ['uDraw', 'uLineColor', 'uBaseOpacity']` — 궤도 라인 호 길이 리빌용. `aArc` 속성(0~1)을 받는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/introVisuals.glsl.test.js
import { describe, it, expect } from 'vitest'
import {
  GRID_VERT, GRID_FRAG, GRID_UNIFORM_NAMES,
  ORBIT_VERT, ORBIT_FRAG, ORBIT_UNIFORM_NAMES,
} from './introVisuals.glsl.js'

describe('그리드 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(GRID_UNIFORM_NAMES).toEqual(['uOpacity', 'uAspect', 'uLineColor'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of GRID_UNIFORM_NAMES) {
      expect(GRID_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = GRID_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('클립 공간에 바로 그린다 (카메라 행렬을 타지 않아야 풀스크린이 유지된다)', () => {
    expect(GRID_VERT).toMatch(/gl_Position\s*=\s*vec4\(\s*position\.xy/)
    expect(GRID_VERT).not.toMatch(/projectionMatrix/)
  })
})

describe('궤도 리빌 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(ORBIT_UNIFORM_NAMES).toEqual(['uDraw', 'uLineColor', 'uBaseOpacity'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of ORBIT_UNIFORM_NAMES) {
      expect(ORBIT_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = ORBIT_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('aArc 속성을 받아 프래그먼트로 넘긴다', () => {
    expect(ORBIT_VERT).toMatch(/attribute\s+float\s+aArc\s*;/)
    expect(ORBIT_VERT).toMatch(/varying\s+float\s+vArc\s*;/)
    expect(ORBIT_FRAG).toMatch(/varying\s+float\s+vArc\s*;/)
  })

  it('궤도는 카메라 변환을 탄다 (3D 공간의 선이므로)', () => {
    expect(ORBIT_VERT).toMatch(/projectionMatrix/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/introVisuals.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/introVisuals.glsl.js
// 인트로 전용 비주얼 두 가지. 둘 다 "설계도" 언어를 공유하지만 좌표계가
// 다르다 — 그리드는 화면에 고정된 종이, 궤도는 3D 공간의 선이다.

export const GRID_UNIFORM_NAMES = ['uOpacity', 'uAspect', 'uLineColor']

export const GRID_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // 클립 공간에 그대로 찍는다 — 카메라가 레일을 따라 움직여도 그리드는
  // 화면에 붙어 있어야 "설계도 위에 그린다"는 은유가 유지된다.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const GRID_FRAG = /* glsl */ `
precision highp float;

uniform float uOpacity;
uniform float uAspect;
uniform vec3 uLineColor;

varying vec2 vUv;

// 한 축의 격자선 세기. fwidth로 화면 공간 폭을 고정해 해상도와 무관하게
// 같은 굵기로 보이게 한다.
float gridLine(float coord, float cells) {
  float f = fract(coord * cells);
  float d = min(f, 1.0 - f);
  return 1.0 - smoothstep(0.0, fwidth(coord * cells), d);
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  float fine = max(gridLine(p.x, 28.0), gridLine(p.y, 28.0));
  float coarse = max(gridLine(p.x, 7.0), gridLine(p.y, 7.0));

  // 화면 중앙이 밝고 가장자리로 갈수록 어두워지는 비네트 — 종이가 조명
  // 아래 놓인 느낌을 주고 가장자리 격자가 시선을 끌지 않게 한다.
  float vignette = 1.0 - smoothstep(0.25, 0.95, length(vUv - 0.5) * 1.6);

  float a = (fine * 0.16 + coarse * 0.42) * vignette * uOpacity;
  gl_FragColor = vec4(uLineColor, a);
  if (a < 0.002) discard;
}
`

export const ORBIT_UNIFORM_NAMES = ['uDraw', 'uLineColor', 'uBaseOpacity']

export const ORBIT_VERT = /* glsl */ `
attribute float aArc;
varying float vArc;
void main() {
  vArc = aArc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const ORBIT_FRAG = /* glsl */ `
precision highp float;

uniform float uDraw;
uniform vec3 uLineColor;
uniform float uBaseOpacity;

varying float vArc;

void main() {
  // uDraw 앞쪽만 그려진 상태. 프런트 근처를 밝게 태워 펜 끝처럼 보이게 한다.
  float drawn = step(vArc, uDraw);
  float hot = smoothstep(0.06, 0.0, uDraw - vArc) * step(vArc, uDraw);

  float a = drawn * uBaseOpacity * (1.0 + 2.2 * hot);
  gl_FragColor = vec4(uLineColor * (1.0 + 1.8 * hot), a);
  if (a < 0.002) discard;
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/introVisuals.glsl.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/introVisuals.glsl.js src/components/SpaceBackground/introVisuals.glsl.test.js
git commit -m "feat(space): intro visuals — blueprint grid quad and orbit arc reveal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 인트로 타임라인 `introSequence.js`

**Files:**
- Create: `src/components/SpaceBackground/introSequence.js`
- Test: `src/components/SpaceBackground/introSequence.test.js`

**Interfaces:**
- Consumes: 없음 (순수)
- Produces:
  - 상수: `INTRO_GRID_MS = 500`, `INTRO_DRAW_MS = 1100`, `INTRO_IGNITE_MS = 300`, `INTRO_TOTAL_MS = 1900`
  - `computeIntroState(elapsedMs: number) → { phase: 'grid'|'draw'|'ignite'|'done', gridOpacity: number, drawProgress: number, buildProgress: number, done: boolean }`
  - `staggeredBuild(globalBuild: number, index: number, count: number) → number` — 오브젝트별 지연. `globalBuild === 1`이면 인덱스와 무관하게 항상 1.
  - `shouldPlayIntro({ stageEnabled, reducedMotion, scrollY, viewportHeight, seen }) → boolean`
  - `hasSeenIntro() → boolean`, `markIntroSeen() → void` — sessionStorage 기반, 접근 실패 시 조용히 false/no-op.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/introSequence.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  INTRO_GRID_MS, INTRO_DRAW_MS, INTRO_IGNITE_MS, INTRO_TOTAL_MS,
  computeIntroState, staggeredBuild, shouldPlayIntro,
  hasSeenIntro, markIntroSeen,
} from './introSequence.js'

describe('인트로 타임라인', () => {
  it('구간 합이 전체 길이와 같다', () => {
    expect(INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS).toBe(INTRO_TOTAL_MS)
  })

  it('시작 시점: 아무것도 그려지지 않았다', () => {
    const s = computeIntroState(0)
    expect(s.phase).toBe('grid')
    expect(s.gridOpacity).toBe(0)
    expect(s.drawProgress).toBe(0)
    expect(s.buildProgress).toBe(0)
    expect(s.done).toBe(false)
  })

  it('그리드 구간이 끝나면 그리드가 완전히 떠 있고 드로잉은 아직이다', () => {
    const s = computeIntroState(INTRO_GRID_MS)
    expect(s.gridOpacity).toBeCloseTo(1, 5)
    expect(s.drawProgress).toBe(0)
  })

  it('드로잉 구간에서 궤도와 빌드가 함께 진행한다', () => {
    const mid = INTRO_GRID_MS + INTRO_DRAW_MS / 2
    const s = computeIntroState(mid)
    expect(s.phase).toBe('draw')
    expect(s.drawProgress).toBeGreaterThan(0)
    expect(s.drawProgress).toBeLessThan(1)
    expect(s.buildProgress).toBeGreaterThan(0)
    // 드로잉 구간이 끝나는 시점의 빌드는 실체화 직전(0.55)까지만 간다.
    expect(s.buildProgress).toBeLessThan(0.55)
  })

  it('드로잉 구간 끝: 궤도는 다 그려졌고 빌드는 실체화 직전이다', () => {
    const s = computeIntroState(INTRO_GRID_MS + INTRO_DRAW_MS)
    expect(s.drawProgress).toBeCloseTo(1, 5)
    expect(s.buildProgress).toBeCloseTo(0.55, 5)
  })

  it('점화 구간에서 빌드가 1로 올라가고 그리드가 걷힌다', () => {
    const s = computeIntroState(INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS / 2)
    expect(s.phase).toBe('ignite')
    expect(s.buildProgress).toBeGreaterThan(0.55)
    expect(s.buildProgress).toBeLessThan(1)
    expect(s.gridOpacity).toBeLessThan(1)
    expect(s.gridOpacity).toBeGreaterThan(0)
  })

  it('끝나면 완전히 실체화되고 그리드는 사라진다', () => {
    const s = computeIntroState(INTRO_TOTAL_MS)
    expect(s.phase).toBe('done')
    expect(s.done).toBe(true)
    expect(s.buildProgress).toBe(1)
    expect(s.gridOpacity).toBe(0)
    expect(s.drawProgress).toBe(1)
  })

  it('타임라인을 넘겨도 종료 상태를 유지한다', () => {
    expect(computeIntroState(INTRO_TOTAL_MS * 5)).toEqual(computeIntroState(INTRO_TOTAL_MS))
  })

  it('음수 경과 시간은 시작 상태로 취급한다', () => {
    expect(computeIntroState(-100)).toEqual(computeIntroState(0))
  })

  it('전 구간에서 값이 유한하고 0~1 범위를 벗어나지 않는다', () => {
    for (let t = 0; t <= INTRO_TOTAL_MS; t += 37) {
      const s = computeIntroState(t)
      for (const v of [s.gridOpacity, s.drawProgress, s.buildProgress]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('staggeredBuild', () => {
  it('뒤쪽 오브젝트일수록 늦게 시작한다', () => {
    const a = staggeredBuild(0.3, 0, 4)
    const b = staggeredBuild(0.3, 3, 4)
    expect(a).toBeGreaterThan(b)
  })

  it('전체가 끝나면 모든 오브젝트가 1이다 (계약: 잔여 청사진 금지)', () => {
    for (let i = 0; i < 4; i++) expect(staggeredBuild(1, i, 4)).toBe(1)
  })

  it('전체가 0이면 모두 0이다', () => {
    for (let i = 0; i < 4; i++) expect(staggeredBuild(0, i, 4)).toBe(0)
  })

  it('count가 1이어도 0으로 나누지 않는다', () => {
    expect(Number.isFinite(staggeredBuild(0.5, 0, 1))).toBe(true)
  })
})

describe('shouldPlayIntro', () => {
  const base = { stageEnabled: true, reducedMotion: false, scrollY: 0, viewportHeight: 900, seen: false }

  it('첫 방문 데스크톱 상단이면 재생한다', () => {
    expect(shouldPlayIntro(base)).toBe(true)
  })

  it('스테이지가 꺼져 있으면(모바일/다른 라우트) 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, stageEnabled: false })).toBe(false)
  })

  it('reduced-motion이면 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true })).toBe(false)
  })

  it('이미 본 세션이면 재생하지 않는다 (사용자 확정: 첫 방문만)', () => {
    expect(shouldPlayIntro({ ...base, seen: true })).toBe(false)
  })

  it('스크롤 복원으로 중간에서 시작하면 재생하지 않는다', () => {
    expect(shouldPlayIntro({ ...base, scrollY: 600 })).toBe(false)
  })
})

describe('세션 기억', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('처음에는 본 적 없음이다', () => {
    expect(hasSeenIntro()).toBe(false)
  })

  it('표시하면 본 것으로 남는다', () => {
    markIntroSeen()
    expect(hasSeenIntro()).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/introSequence.test.js`
Expected: FAIL — 모듈 없음

**주의:** 이 프로젝트의 vitest 환경은 `node`라 `sessionStorage`가 없다. 세션 기억 테스트가 `sessionStorage is not defined`로 실패하면, 그 describe 블록 위에 아래 스텁을 추가한다 (구현은 건드리지 않는다):

```js
// vitest 환경이 node라 sessionStorage가 없다 — 구현의 try/catch 경로가 아니라
// 정상 경로를 검증하려면 최소 스텁이 필요하다.
beforeEach(() => {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  }
})
```

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/introSequence.js
// 첫 방문 인트로 타임라인 (순수 모듈). 항성계가 청사진으로 그려진 뒤
// 점화되어 실체화되기까지를 담당하고, 끝나면 기존 도착 워프로 넘긴다.
//
// 재생 정책(사용자 확정): 첫 방문만 풀 인트로. 재방문은 도착 워프만.

export const INTRO_GRID_MS = 500
export const INTRO_DRAW_MS = 1100
export const INTRO_IGNITE_MS = 300
export const INTRO_TOTAL_MS = INTRO_GRID_MS + INTRO_DRAW_MS + INTRO_IGNITE_MS

// 드로잉 구간이 끝나는 시점의 빌드 진행도. blueprint.glsl.js가 0.55부터
// 실체 메시에 자리를 내주기 시작하므로, 그 직전까지만 올려두고 점화 구간에서
// 단숨에 1로 밀어 올린다 — 두 파일이 공유하는 상수라 함께 수정할 것.
const BUILD_AT_DRAW_END = 0.55

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)
// ease-out cubic: 그리기 시작은 빠르고 끝은 부드럽게 멎는다.
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

export function computeIntroState(elapsedMs) {
  const t = Math.max(elapsedMs, 0)

  if (t >= INTRO_TOTAL_MS) {
    return { phase: 'done', gridOpacity: 0, drawProgress: 1, buildProgress: 1, done: true }
  }

  if (t < INTRO_GRID_MS) {
    return {
      phase: 'grid',
      gridOpacity: clamp01(t / INTRO_GRID_MS),
      drawProgress: 0,
      buildProgress: 0,
      done: false,
    }
  }

  const afterGrid = t - INTRO_GRID_MS
  if (afterGrid < INTRO_DRAW_MS) {
    const k = clamp01(afterGrid / INTRO_DRAW_MS)
    return {
      phase: 'draw',
      gridOpacity: 1,
      drawProgress: easeOut(k),
      buildProgress: k * BUILD_AT_DRAW_END,
      done: false,
    }
  }

  const k = clamp01((afterGrid - INTRO_DRAW_MS) / INTRO_IGNITE_MS)
  return {
    phase: 'ignite',
    // 점화와 함께 설계도를 걷는다 — 실체가 드러나는 동안 격자가 남아 있으면
    // "아직 도면"으로 읽힌다.
    gridOpacity: 1 - k,
    drawProgress: 1,
    buildProgress: BUILD_AT_DRAW_END + (1 - BUILD_AT_DRAW_END) * k,
    done: false,
  }
}

// 오브젝트별 지연. 전부 동시에 실체화되면 "한 장면이 전환됐다"로 보이고,
// 조금씩 어긋나야 "하나씩 조립된다"로 읽힌다.
export function staggeredBuild(globalBuild, index, count) {
  const lag = (index / Math.max(count, 1)) * 0.35
  return clamp01((globalBuild - lag) / (1 - lag))
}

export function shouldPlayIntro({ stageEnabled, reducedMotion, scrollY, viewportHeight, seen }) {
  if (!stageEnabled || reducedMotion || seen) return false
  // 스크롤 복원으로 페이지 중간에서 시작한 경우엔 인트로가 맥락을 잃는다.
  return scrollY < viewportHeight * 0.5
}

const SEEN_KEY = 'evanSystemIntroSeen'

export function hasSeenIntro() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 프라이빗 모드 등 — 인트로가 한 번 더 나오는 정도의 손해라 무시한다 */
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/introSequence.test.js`
Expected: PASS (전체). `staggeredBuild(1, i, 4) === 1` 이 부동소수 오차로 실패하면 구현이 틀린 것이다 — `(1 - lag) / (1 - lag)`은 정확히 1이어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/introSequence.js src/components/SpaceBackground/introSequence.test.js
git commit -m "feat(space): intro timeline with first-visit-only policy and per-object stagger

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: evanSystem에 청사진 통합

**Files:**
- Modify: `src/components/SpaceBackground/evanSystem.js`
- Modify: `src/components/SpaceBackground/evanSystem.test.js`

**Interfaces:**
- Consumes: `toBarycentricGeometry` (Task 1), `createBlueprintMaterial` (Task 3), `ORBIT_VERT`/`ORBIT_FRAG` (Task 4), `staggeredBuild` (Task 5)
- Produces: `createEvanSystem` 반환 객체에 두 메서드 추가
  - `setBuild(progress: number): void` — 행성·위성·링의 청사진/실체 교차 페이드. `progress = 1`이면 실체 머티리얼의 `transparent`를 false로 되돌린다.
  - `setOrbitDraw(progress: number): void` — 궤도 라인 호 리빌.
  - 기존 `group`, `update(t)`, `dispose()` 시그니처는 변경 없음.

- [ ] **Step 1: 실패하는 테스트 작성 (기존 파일에 describe 블록 추가)**

```js
// src/components/SpaceBackground/evanSystem.test.js 끝에 추가
describe('청사진 빌드 (Phase 2)', () => {
  const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

  it('행성마다 청사진 쌍둥이 메시가 생긴다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    for (const p of PLANETS) {
      expect(sys.group.getObjectByName(`blueprint-${p.id}`)).toBeTruthy()
    }
    sys.dispose()
  })

  it('build=0이면 실체가 감춰지고 청사진이 보인다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0)
    const solid = sys.group.getObjectByName('planet-about')
    const bp = sys.group.getObjectByName('blueprint-about')
    expect(solid.material.opacity).toBeLessThan(0.05)
    expect(bp.material.visible).toBe(true)
    sys.dispose()
  })

  it('build=1이면 실체가 완전하고 청사진이 빠지며 transparent가 복원된다', () => {
    // 이게 "인트로가 끝나면 오늘과 픽셀 동일" 계약의 검증 지점이다.
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(1)
    const solid = sys.group.getObjectByName('planet-about')
    const bp = sys.group.getObjectByName('blueprint-about')
    expect(solid.material.opacity).toBe(1)
    expect(solid.material.transparent).toBe(false)
    expect(bp.material.visible).toBe(false)
    sys.dispose()
  })

  it('중간 build에서는 실체가 반투명 상태로 올라온다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.8)
    const solid = sys.group.getObjectByName('planet-about')
    expect(solid.material.transparent).toBe(true)
    expect(solid.material.opacity).toBeGreaterThan(0)
    expect(solid.material.opacity).toBeLessThan(1)
    sys.dispose()
  })

  it('행성마다 빌드 시점이 어긋난다 (동시 실체화 방지)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.5)
    const first = sys.group.getObjectByName(`blueprint-${PLANETS[0].id}`)
    const last = sys.group.getObjectByName(`blueprint-${PLANETS[PLANETS.length - 1].id}`)
    expect(first.material.uniforms.uBuild.value)
      .toBeGreaterThan(last.material.uniforms.uBuild.value)
    sys.dispose()
  })

  it('궤도 라인이 호 속성과 리빌 유니폼을 갖는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const orbit = sys.group.getObjectByName(`orbit-${PLANETS[0].id}`)
    const arc = orbit.geometry.getAttribute('aArc')
    expect(arc).toBeTruthy()
    expect(arc.count).toBe(orbit.geometry.getAttribute('position').count)
    // 호 파라미터는 0에서 시작해 1에서 끝나야 리빌이 한 바퀴를 정확히 덮는다.
    expect(arc.getX(0)).toBeCloseTo(0, 6)
    expect(arc.getX(arc.count - 1)).toBeCloseTo(1, 6)
    sys.dispose()
  })

  it('setOrbitDraw가 모든 궤도 유니폼에 반영된다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setOrbitDraw(0.42)
    for (const p of PLANETS) {
      const orbit = sys.group.getObjectByName(`orbit-${p.id}`)
      expect(orbit.material.uniforms.uDraw.value).toBeCloseTo(0.42, 6)
    }
    sys.dispose()
  })

  it('dispose가 청사진 머티리얼과 지오메트리도 해제한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const bp = sys.group.getObjectByName('blueprint-about')
    const geoSpy = vi.spyOn(bp.geometry, 'dispose')
    const matSpy = vi.spyOn(bp.material, 'dispose')
    sys.dispose()
    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
  })
})
```

기존 import 줄에 `vi`와 `PLANETS`가 없으면 추가한다:
```js
import { describe, it, expect, vi } from 'vitest'
import { PLANETS, planetPosition } from './system.js'
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: FAIL — `sys.setBuild is not a function`

- [ ] **Step 3: evanSystem.js 수정**

임포트 추가:
```js
import { toBarycentricGeometry } from './barycentric.js'
import { createBlueprintMaterial } from './blueprintMaterial.js'
import { ORBIT_VERT, ORBIT_FRAG } from './introVisuals.glsl.js'
import { staggeredBuild } from './introSequence.js'
```

`circlePoints`를 호 속성까지 만들도록 바꾼다 (기존 함수 교체):
```js
// 궤도 링의 정점과, 각 정점이 한 바퀴 중 어디쯤인지(0~1)를 함께 만든다.
// 리빌 셰이더가 이 aArc로 "어디까지 그려졌는지"를 판정한다.
function circleGeometry(radius, segments = 128) {
  const pts = []
  const arc = new Float32Array(segments + 1)
  for (let i = 0; i <= segments; i++) {
    const k = i / segments
    const a = k * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
    arc[i] = k
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  geo.setAttribute('aArc', new THREE.BufferAttribute(arc, 1))
  return geo
}
```

궤도 생성 블록을 교체한다. **기존의 공유 `orbitMat` 하나를 쓰던 방식에서 궤도마다 머티리얼을 만드는 방식으로 바뀐다** — `setOrbitDraw`가 유니폼을 갱신해야 하고, 색·불투명도는 기존 값(0x35507a, 0.35)을 유지한다:

```js
  // --- 궤도 라인: 어두운 청회색 — "검은 우주" 톤을 해치지 않는 밀도.
  // 인트로 리빌을 위해 궤도마다 유니폼을 갖는다 (공유 머티리얼이면 uDraw를
  // 궤도별로 줄 수 없다). 색·불투명도는 Phase 1 값을 그대로 유지한다.
  const orbitMaterials = []
  for (const p of PLANETS) {
    const geo = circleGeometry(p.orbitRadius)
    const mat = new THREE.ShaderMaterial({
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      uniforms: {
        uDraw: { value: 1 },
        uLineColor: { value: new THREE.Color(0x35507a) },
        uBaseOpacity: { value: 0.35 },
      },
      transparent: true,
      depthWrite: false,
    })
    const line = new THREE.Line(geo, mat)
    line.name = `orbit-${p.id}`
    group.add(line)
    orbitMaterials.push(mat)
    disposables.push(geo, mat)
  }
```

행성 생성 루프 안, `group.add(mesh)` 뒤에 청사진 쌍둥이를 추가한다. 그리고 실체 머티리얼을 빌드에서 제어할 수 있도록 배열에 모은다:

```js
  const solidMaterials = []
  const blueprints = []
```
(루프 바깥, `planetMeshes` 선언 근처에 둔다)

루프 안:
```js
    solidMaterials.push(mat)

    // 청사진 쌍둥이: 같은 지오메트리를 바리센트릭으로 펼쳐 겹쳐 그린다.
    const bpGeo = toBarycentricGeometry(geo)
    const bp = createBlueprintMaterial({ color: p.color, extent: p.radius })
    const bpMesh = new THREE.Mesh(bpGeo, bp.material)
    bpMesh.name = `blueprint-${p.id}`
    bpMesh.position.copy(mesh.position)
    group.add(bpMesh)
    blueprints.push(bp)
    disposables.push(bpGeo, bp.material)
```

링과 위성의 실체 머티리얼도 `solidMaterials`에 넣는다 (링: `ringMat`, 위성: 루프 안의 `mat`). 링·위성은 작아서 청사진 쌍둥이를 만들지 않고 실체 페이드만 태운다 — 이유를 주석으로 남긴다.

반환 객체에 두 메서드를 추가한다:
```js
    setBuild(progress) {
      const g = Math.min(Math.max(progress, 0), 1)
      blueprints.forEach((bp, i) => bp.setBuild(staggeredBuild(g, i, blueprints.length)))
      // 실체 표면은 청사진이 물러나는 구간(0.55~1)에서 올라온다.
      const solid = Math.min(Math.max((g - 0.55) / 0.45, 0), 1)
      for (const m of solidMaterials) {
        m.opacity = solid
        // 완전히 실체화되면 불투명 큐로 되돌린다 — 투명 큐에 남으면 정렬
        // 비용과 미세한 합성 차이가 생겨 "오늘과 픽셀 동일" 계약이 깨진다.
        m.transparent = solid < 1
        m.needsUpdate = true
      }
    },
    setOrbitDraw(progress) {
      const d = Math.min(Math.max(progress, 0), 1)
      for (const m of orbitMaterials) m.uniforms.uDraw.value = d
    },
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js` → PASS
Run: `npm test` → 전체 통과 (기존 228 + 새 테스트)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/evanSystem.js src/components/SpaceBackground/evanSystem.test.js
git commit -m "feat(space): blueprint twins and orbit reveal driven by build progress

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: SpaceBackground에 인트로 배선

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx`

**Interfaces:**
- Consumes: `computeIntroState`, `shouldPlayIntro`, `hasSeenIntro`, `markIntroSeen`, `INTRO_TOTAL_MS` (Task 5), `GRID_VERT`/`GRID_FRAG` (Task 4), `evanSystem.setBuild`/`setOrbitDraw` (Task 6)
- Produces: 첫 방문 시 인트로 → 도착 워프 순서로 재생. 그 외에는 Phase 1과 동일.

- [ ] **Step 1: SpaceBackground.jsx 수정**

임포트 추가:
```js
import { GRID_VERT, GRID_FRAG } from './introVisuals.glsl.js'
import {
  computeIntroState, shouldPlayIntro, hasSeenIntro, markIntroSeen, INTRO_TOTAL_MS,
} from './introSequence.js'
```

`ensureSystem` 정의 아래에 그리드 쿼드를 만든다. **별도 오버레이 씬으로 두는 이유**: 메인 씬에 넣으면 카메라 행렬을 타고 깊이 정렬에 끼어든다.

```js
    // 청사진 그리드: 인트로 동안만 화면 전체에 깔리는 오버레이. 클립 공간에
    // 직접 그리므로 전용 씬+카메라로 분리해 메인 씬의 깊이 정렬과 섞이지 않게 한다.
    const gridScene = new THREE.Scene()
    const gridCamera = new THREE.Camera()
    const gridUniforms = {
      uOpacity: { value: 0 },
      uAspect: { value: window.innerWidth / window.innerHeight },
      uLineColor: { value: new THREE.Color(0x6db5ff) },
    }
    const gridGeo = new THREE.PlaneGeometry(2, 2)
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: gridUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    gridScene.add(new THREE.Mesh(gridGeo, gridMat))
```

도착 시퀀스 판정 블록 **앞에** 인트로 판정을 넣는다:

```js
    // 첫 방문 인트로: 청사진이 그려지고 점화되어 실체화된 뒤에야 도착 워프가
    // 시작된다. 재방문(세션 기억)·reduced-motion·모바일은 건너뛰고 Phase 1과
    // 동일하게 동작한다.
    const introActive = shouldPlayIntro({
      stageEnabled: stageEnabledRef.current,
      reducedMotion,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      seen: hasSeenIntro(),
    })
    let introStartT = null
    let introDone = !introActive
    if (introActive) markIntroSeen()
```

기존 도착 판정에 인트로 조건을 더한다 — 인트로가 끝난 뒤에 워프가 시작해야 하므로, 인트로 중에는 `beginArrival()`을 미룬다:

```js
    let arrivalActive = shouldPlayArrival({
      warpEnabled: warpEnabledRef.current,
      reducedMotion,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    })
    let arrivalStartT = null
    if (arrivalActive && !introActive) {
      beginArrival()
      arrivalStartT = 0
    } else if (!arrivalActive) {
      concludeArrival('skipped')
    }
```

tick 안, `const t = clock.getElapsedTime()` 바로 뒤에 인트로 구동을 넣는다:

```js
      // --- 인트로 구동 (첫 방문에만 진입)
      if (!introDone) {
        if (introStartT === null) introStartT = t
        const intro = computeIntroState((t - introStartT) * 1000)
        gridUniforms.uOpacity.value = intro.gridOpacity
        if (stageEnabledRef.current) {
          ensureSystem()
          evanSystem.setBuild(intro.buildProgress)
          evanSystem.setOrbitDraw(intro.drawProgress)
        }
        if (intro.done) {
          introDone = true
          gridUniforms.uOpacity.value = 0
          // 실체화가 끝난 순간 도착 워프로 넘긴다 — 점화의 여파가 그대로
          // 카메라 돌입으로 이어져 한 동작처럼 읽힌다.
          if (arrivalActive) {
            beginArrival()
            arrivalStartT = t
          }
        }
      }
```

`arrivalActive` 분기가 절대 시간(`t * 1000`)을 쓰고 있다면 인트로 지연만큼 어긋난다. `arrivalStartT` 기준으로 바꾼다:

```js
      } else if (arrivalActive) {
        const arrival = computeArrivalIntensity((t - (arrivalStartT ?? 0)) * 1000)
```

인트로가 아직 진행 중이면 워프 세기를 0으로 눌러 둔다 (인트로 동안 별이 흐르면 설계도 은유가 깨진다). 위 `else if (arrivalActive)` 앞에 조건을 하나 더 둔다:

```js
      } else if (!introDone) {
        intensitySmooth = 0
      } else if (arrivalActive) {
```

인트로를 건너뛴 경로(재방문·reduced-motion·모바일)에서는 시스템이 처음부터 완성 상태여야 한다. `ensureSystem` 안에서 최초 생성 직후 빌드를 채운다:

```js
    const ensureSystem = () => {
      if (!evanSystem) {
        evanSystem = createEvanSystem({ satelliteColors })
        scene.add(evanSystem.group)
        // 인트로가 없는 경로에서는 곧바로 완성 상태로 시작한다. 인트로가
        // 있으면 첫 tick이 곧 setBuild(0)으로 덮어쓴다.
        evanSystem.setBuild(1)
        evanSystem.setOrbitDraw(1)
      }
      evanSystem.group.visible = true
    }
```

렌더 직전에 그리드를 덧그린다. 기존 `if (postfx) { postfx.render(...) } else { renderer.render(...) }` 블록 **뒤**에:

```js
      // 그리드는 항상 마지막에 덧그린다 — 포스트FX 블룸이 격자를 번지게 하면
      // 도면이 아니라 안개처럼 보인다.
      if (gridUniforms.uOpacity.value > 0.001) {
        renderer.autoClear = false
        renderer.render(gridScene, gridCamera)
        renderer.autoClear = true
      }
```

리사이즈 핸들러에 종횡비 갱신을 추가한다:
```js
      gridUniforms.uAspect.value = window.innerWidth / window.innerHeight
```

cleanup에 추가:
```js
      gridGeo.dispose()
      gridMat.dispose()
```

- [ ] **Step 2: 단위 테스트 회귀 확인**

Run: `npm test`
Expected: 전체 통과.

- [ ] **Step 3: 린트·빌드**

```bash
npm run lint 2>&1 | grep "SpaceBackground.jsx" || echo "no new errors in touched file"
npm run build 2>&1 | grep -E "✓ built|error"
```
Expected: 만진 파일에 새 에러 없음, 빌드 성공.

- [ ] **Step 4: 브라우저 수동 검증**

`npm run dev`로 서버를 띄우고 확인한다 (인트로는 세션당 1회이므로, 다시 보려면 **새 시크릿 창**을 쓰거나 콘솔에서 `sessionStorage.clear()` 후 새로고침):

- 첫 로드: 청사진 격자가 떠오르고 → 궤도가 한 바퀴 그려지고 → 행성이 선에서 실체로 차오르고 → 격자가 걷히며 워프가 시작돼 히어로에 정착한다.
- 인트로 종료 후 화면이 **Phase 1과 똑같아 보인다** (청사진 잔상, 반투명 행성, 궤도 밝기 변화가 남아 있으면 실패).
- 같은 탭에서 새로고침: 인트로 없이 워프만 재생된다.
- `/gallery` 이동 후 메인 복귀: 인트로 재생 없음, 항성계 정상.
- 개발자도구에서 reduced-motion 에뮬레이션: 인트로 없이 즉시 완성 상태.
- 콘솔 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space): first-visit blueprint intro handing off to the arrival warp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: e2e 스모크

**Files:**
- Create: `e2e/evan-intro.spec.js`

**Interfaces:**
- Consumes: Task 7의 동작

- [ ] **Step 1: e2e 테스트 작성**

기존 e2e 관례(한국어 제목, 콘솔 에러 수집, `waitUntil: 'commit'`)를 따른다. 인트로는 세션 저장소로 게이트되므로 **새 컨텍스트**가 곧 첫 방문이다.

```js
// e2e/evan-intro.spec.js
import { test, expect } from '@playwright/test'

test('첫 방문 인트로가 콘솔 에러 없이 끝나고 히어로가 나타난다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  // 인트로(1.9s) + 도착 워프(2.4s)가 끝나면 히어로 콘텐츠가 등장한다.
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })
  expect(errors).toEqual([])
})

test('인트로는 세션당 한 번만 재생된다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })

  const seen = await page.evaluate(() => sessionStorage.getItem('evanSystemIntroSeen'))
  expect(seen).toBe('1')

  // 같은 컨텍스트에서 재방문하면 인트로 없이 곧바로 히어로가 뜬다.
  await page.reload({ waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 12000 })
})

test('인트로가 끝나면 항성계가 완성 상태다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })
  // 캔버스가 살아 있고 페이지 에러가 없으면 실체화 경로가 끝까지 돈 것이다.
  await expect(page.locator('canvas').first()).toBeVisible()
})
```

- [ ] **Step 2: e2e 실행**

Run: `npx playwright test e2e/evan-intro.spec.js`
Expected: PASS (3 tests). 실패하면 **타임아웃을 늘려 덮지 말고** 원인을 규명한다 — 인트로가 끝나지 않아 도착 시퀀스가 종결되지 않는 경우가 가장 가능성 높은 실제 버그다.

- [ ] **Step 3: 커밋**

```bash
git add e2e/evan-intro.spec.js
git commit -m "test(e2e): first-visit intro smoke — completion, session gating, stage alive

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 전체 회귀 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 스위트 실행**

```bash
npm test 2>&1 | grep -E "Test Files|Tests "
npm run lint 2>&1 | grep -E "SpaceBackground|evanSystem|blueprint|intro|barycentric" || echo "no new errors in touched files"
npm run build 2>&1 | grep -E "✓ built|error"
npx playwright test 2>&1 | tail -6
```

Expected: 유닛 전체 통과, 빌드 성공. e2e는 **`destruction.spec.js` 1건이 기존 실패**로 알려져 있다(헤드리스 소프트웨어 렌더링에서 하드웨어 가속 안내 배너가 RESTORE 클릭을 가로챔 — Phase 1에서 베이스라인 재현으로 확인). 그 외 실패가 새로 생기면 원인을 규명한다.

- [ ] **Step 2: 수동 회귀 체크리스트**

`npm run dev`에서:
- 4개 모드(Terminal/Speedrun/Destruction/Inspect) 진입·동작·이탈
- 언어 4개 전환 후 도킹 패널 갱신
- `/gallery` 워프 부스트 → 링 갤러리 → 메인 복귀
- `/guestbook`, `/projects/:slug` 라우트
- 좁은 데스크톱(약 820px 폭)에서 도킹 패널이 행성을 덮지 않음 (Phase 1 회귀)
- reduced-motion: 인트로 없이 즉시 완성

- [ ] **Step 3: 발견된 문제 수정 또는 보고**

문제가 있으면 해당 태스크로 돌아가 수정 후 이 태스크를 재실행한다. 전부 통과하면 Phase 2 완료를 검증 출력 요약과 함께 보고한다.

---

## Self-Review 결과

- **스펙 커버리지**: Phase 2 범위(Blueprint 머티리얼 + 로딩→실체화 인트로)는 Task 1-8이 커버한다. 스펙 §5.3의 나머지 셰이더 항목(별 필드 GLSL 재작성, 성운 배경, 행성 절차적 표면, 항성 코로나)은 Phase 2 범위가 아니다 — 스펙 §6 표가 Phase 2를 "Blueprint 머티리얼 + 로딩→실체화 인트로"로 한정하고 있고, 나머지는 Phase 5 폴리시로 남는다. 품질 프리셋(§5.4)도 Phase 2 대상이 아니며 기존 게이팅(데스크톱 postfx, reduced-motion)을 그대로 쓴다.
- **플레이스홀더 스캔**: 통과 — 모든 코드 스텝에 실제 코드가 있다. Task 5 Step 2의 sessionStorage 스텁은 조건부 지시이며 코드가 포함돼 있다.
- **타입 일관성**: `toBarycentricGeometry(geometry)` (T1 정의 = T6 사용), `createBlueprintMaterial({color, extent}) → {material, setBuild}` (T3 = T6), `ORBIT_VERT/ORBIT_FRAG` + `GRID_VERT/GRID_FRAG` (T4 = T6/T7), `computeIntroState/shouldPlayIntro/staggeredBuild/hasSeenIntro/markIntroSeen/INTRO_TOTAL_MS` (T5 = T6/T7), `setBuild/setOrbitDraw` (T6 = T7) 모두 일치.
- **공유 상수 주의**: `BUILD_AT_DRAW_END = 0.55`(introSequence.js)와 blueprint.glsl.js의 `smoothstep(0.55, 1.0, uBuild)`, evanSystem의 `(g - 0.55) / 0.45`가 같은 경계를 쓴다. 세 곳 모두 주석으로 연결을 표시했다.
