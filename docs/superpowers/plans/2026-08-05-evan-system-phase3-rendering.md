# Evan System Phase 3 — 렌더링 품질 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인트로가 끝나고 드러나는 화면을 "고퀄리티 우주"로 끌어올린다 — 행성은 절차적 표면·대기 림·야간면을 가진 천체가 되고, 항성은 코로나와 표면 난류를 얻고, 배경에는 얕은 성운이 깔리며, 화면 전체에 필름 그레인과 비네트가 걸린다 (스펙 Phase 3, 2026-08-05 재정렬).

**Architecture:** 행성과 항성의 `MeshStandardMaterial`/`MeshBasicMaterial`을 **커스텀 `ShaderMaterial`로 교체**한다. 광원이 원점의 항성 하나뿐이라 three.js 조명 파이프라인을 쓸 이유가 없고, 직접 라이팅을 계산하면 야간면 글로우·대기 프레넬처럼 표준 모델이 못 내는 표현이 가능해진다. 성운은 별 필드보다 먼 배경에 큰 구를 뒤집어 씌운 단일 셰이더로 그린다. 그레인/비네트는 기존 `postfx.js` 체인의 마지막 셰이더 패스에 합류시킨다.

**Tech Stack:** three.js 0.184 (명령형 — R3F 금지), 커스텀 GLSL, vitest, Playwright.

## Global Constraints

- **별 필드는 손대지 않는다.** `SpaceBackground.jsx`의 별 생성 블록(STARS 6500, 색·크기·텍스처·`PointsMaterial`)은 **수정 금지** — "검은 우주 + 떠다니는 별"은 사용자가 못박은 아트 디렉션이고 현재 구현이 이미 그 룩이다.
- **검은 우주가 주인공이다.** 성운은 배경에 "얕게" 깔리는 정도여야 하며, 별이 묻히거나 하늘이 뿌옇게 뜨면 실패다.
- **R3F/drei 금지, 새 npm 의존성 금지.**
- **Phase 2의 청사진 인트로가 그대로 살아 있어야 한다**: 행성의 실체 머티리얼은 여전히 `opacity`/`transparent`로 교차 페이드에 참여해야 하고, `setBuild(1)`에서 `transparent`가 `false`로 돌아가는 계약을 유지한다. 청사진 쌍둥이(`blueprint-*`)와 `setOrbitDraw`는 변경하지 않는다.
- **기존 기능 무손실**: 4개 모드, i18n 4개 언어, 해시 내비, 도착 시퀀스 계약(`ARRIVAL_DONE_EVENT`), Lab 워프 부스트, 모바일 폴백.
- **`prefers-reduced-motion`**: 셰이더의 시간 기반 애니메이션(난류·그레인)은 정지하되 형태는 그대로 보여야 한다.
- 커스텀 `ShaderMaterial`은 **반드시 `gl_FragColor = linearToOutputTexel(gl_FragColor);`로 끝낸다.** three는 `ShaderMaterial`에 이 함수를 정의만 해주고 호출하지 않는다 — 빠뜨리면 linear 값이 sRGB 버퍼에 그대로 쓰여 어두워진다 (Phase 2에서 실제로 겪은 결함).
- GLSL에서 `smoothstep(edge0, edge1, x)`는 `edge0 >= edge1`이면 **정의되지 않은 동작**이다. 역방향이 필요하면 `1.0 - smoothstep(edge1, edge0, x)`로 쓴다.
- GLSL 모듈은 기존 패턴을 따른다 — 셰이더 문자열 + 유니폼 이름 배열을 export하고, 유니폼 선언·사용을 정규식으로 검증하는 테스트를 짝짓는다.
- 주석은 "왜"를 설명하는 한국어. 커밋 메시지는 영어, 마지막 줄에:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
src/components/SpaceBackground/
  noise.glsl.js             # [신규] 공용 GLSL 노이즈 청크 (hash/value noise/fbm) 문자열
  noise.glsl.test.js        # [신규]
  planetSurface.glsl.js     # [신규] 행성 표면 셰이더 (지형·라이팅·프레넬 림·야간면)
  planetSurface.glsl.test.js# [신규]
  planetMaterial.js         # [신규] createPlanetMaterial → {material,setBuild,setTime,dispose}
  planetMaterial.test.js    # [신규]
  sunSurface.glsl.js        # [신규] 항성 표면 난류 + 림 코로나 셰이더
  sunSurface.glsl.test.js   # [신규]
  nebula.glsl.js            # [신규] 배경 성운 셰이더 (안쪽에서 보는 큰 구)
  nebula.glsl.test.js       # [신규]
  evanSystem.js             # [수정] 행성/항성 머티리얼 교체, 성운 추가, update에 시간 전달
  evanSystem.test.js        # [수정]
  postfx.js                 # [수정] 마지막 패스에 필름 그레인 + 비네트 합류
e2e/
  (신규 없음 — 기존 스펙으로 회귀만 확인)
```

---

### Task 0: 베이스라인 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 기존 테스트/빌드 실행**

```bash
cd /Users/evan/Desktop/02_project_dev/dev/evan-portfolio
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build 2>&1 | grep -E "✓ built|error"
```

Expected: vitest 287/287 통과, 빌드 성공. 린트는 손대지 않은 파일에 **기존 에러가 다수** 있다 — 기준은 "내가 만진 파일에 새 에러 0". 유닛이나 빌드가 실패하면 **중단하고 보고**한다.

---

### Task 1: 공용 노이즈 청크 `noise.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/noise.glsl.js`
- Test: `src/components/SpaceBackground/noise.glsl.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `GLSL_NOISE: string` — 다른 셰이더의 프래그먼트 본문 앞에 그대로 이어 붙이는 함수 모음. 정의하는 함수: `float hash13(vec3)`, `float vnoise(vec3)`, `float fbm(vec3, int)`, `float fbmRidged(vec3, int)`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/noise.glsl.test.js
import { describe, it, expect } from 'vitest'
import { GLSL_NOISE } from './noise.glsl.js'

describe('GLSL_NOISE', () => {
  it('행성·항성·성운이 함께 쓰는 함수를 모두 정의한다', () => {
    for (const fn of ['hash13', 'vnoise', 'fbm', 'fbmRidged']) {
      expect(GLSL_NOISE).toMatch(new RegExp(`float\\s+${fn}\\s*\\(`))
    }
  })

  it('전역 상태나 유니폼에 의존하지 않는다 (어느 셰이더에도 그대로 붙일 수 있어야 한다)', () => {
    expect(GLSL_NOISE).not.toMatch(/uniform\s/)
    expect(GLSL_NOISE).not.toMatch(/varying\s/)
  })

  it('fbm은 옥타브를 루프로 돌린다 (한 번만 샘플하면 디테일이 안 나온다)', () => {
    expect(GLSL_NOISE).toMatch(/for\s*\(/)
  })

  it('역방향 smoothstep을 쓰지 않는다 (GLSL ES 미정의 동작)', () => {
    // smoothstep(a, b, x)에서 a >= b면 결과가 정의되지 않는다.
    const calls = GLSL_NOISE.match(/smoothstep\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/noise.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/noise.glsl.js
// 행성 표면·항성 난류·성운이 공유하는 노이즈 함수 모음. 유니폼도 varying도
// 참조하지 않는 순수 함수라 어느 프래그먼트 셰이더 앞에도 그대로 붙는다.
//
// 텍스처를 받지 않고 절차적으로 만드는 이유: 다운로드가 없으니 첫 로딩이
// 늘지 않고, 행성마다 시드만 바꿔 서로 다른 지형을 줄 수 있다.

export const GLSL_NOISE = /* glsl */ `
// 3D 해시 → [0,1). sin 기반 해시는 GPU마다 정밀도가 달라 밴딩이 생기므로
// 정수 비트 섞기를 쓴다.
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// 값 노이즈: 격자 8개 코너를 스무스스텝으로 보간한다.
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// 옥타브를 겹쳐 큰 형태와 잔디테일을 동시에 만든다.
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// 능선형 변형: 산맥·소용돌이처럼 날 선 구조를 만든다.
float fbmRidged(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    sum += amp * n * n;
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/noise.glsl.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/noise.glsl.js src/components/SpaceBackground/noise.glsl.test.js
git commit -m "feat(space): shared GLSL noise chunk for procedural surfaces

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 행성 표면 셰이더 `planetSurface.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/planetSurface.glsl.js`
- Test: `src/components/SpaceBackground/planetSurface.glsl.test.js`

**Interfaces:**
- Consumes: `GLSL_NOISE` (Task 1)
- Produces: `PLANET_VERT`, `PLANET_FRAG`, `PLANET_UNIFORM_NAMES = ['uBaseColor','uSunPos','uTime','uSeed','uOpacity','uRimColor']`
  - `uSunPos`: 월드 공간 항성 위치(원점). 행성이 월드 좌표에 놓이므로 라이팅은 월드 공간에서 계산한다.
  - `uOpacity`: Phase 2 교차 페이드용. 셰이더가 직접 알파에 곱한다.
  - `uSeed`: 행성마다 다른 지형을 주는 시드.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/planetSurface.glsl.test.js
import { describe, it, expect } from 'vitest'
import { PLANET_VERT, PLANET_FRAG, PLANET_UNIFORM_NAMES } from './planetSurface.glsl.js'

describe('행성 표면 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(PLANET_UNIFORM_NAMES).toEqual([
      'uBaseColor', 'uSunPos', 'uTime', 'uSeed', 'uOpacity', 'uRimColor',
    ])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of PLANET_UNIFORM_NAMES) {
      expect(PLANET_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = PLANET_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('월드 좌표와 월드 노멀을 프래그먼트로 넘긴다 (라이팅을 월드 공간에서 계산)', () => {
    expect(PLANET_VERT).toMatch(/varying\s+vec3\s+vWorldPos\s*;/)
    expect(PLANET_VERT).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
    expect(PLANET_FRAG).toMatch(/varying\s+vec3\s+vWorldPos\s*;/)
    expect(PLANET_FRAG).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
    expect(PLANET_VERT).toMatch(/modelMatrix/)
  })

  it('노이즈 청크를 포함한다', () => {
    expect(PLANET_FRAG).toMatch(/float\s+fbm\s*\(/)
  })

  it('대기 프레넬 림을 계산한다 (시선과 노멀의 각도)', () => {
    // 림 라이트가 없으면 구가 평평한 원반처럼 읽힌다.
    expect(PLANET_FRAG).toMatch(/cameraPosition/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    // three는 ShaderMaterial에 linearToOutputTexel을 정의만 하고 호출은 안 한다.
    expect(PLANET_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('교차 페이드를 위해 uOpacity를 알파에 곱한다', () => {
    expect(PLANET_FRAG).toMatch(/uOpacity/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = PLANET_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/planetSurface.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/planetSurface.glsl.js
// 행성 표면: 절차적 지형 + 항성 하나짜리 직접 라이팅 + 대기 프레넬 림 +
// 야간면 미광. three.js 표준 머티리얼 대신 직접 쓰는 이유는, 광원이 원점의
// 항성 하나뿐이라 조명 파이프라인을 태울 이유가 없고 야간면·대기처럼
// 표준 모델이 못 내는 표현이 필요해서다.
import { GLSL_NOISE } from './noise.glsl.js'

export const PLANET_UNIFORM_NAMES = [
  'uBaseColor', 'uSunPos', 'uTime', 'uSeed', 'uOpacity', 'uRimColor',
]

export const PLANET_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  // 행성은 균등 스케일만 쓰므로 법선변환에 normalMatrix 대신 modelMatrix로 충분하다.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const PLANET_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uBaseColor;
uniform vec3 uSunPos;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uRimColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

${GLSL_NOISE}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // --- 지형: 로컬 좌표로 샘플해야 자전해도 무늬가 표면에 붙어 돈다.
  vec3 sp = normalize(vLocalPos) * 2.2 + uSeed;
  float continents = fbm(sp, 5);
  float ridges = fbmRidged(sp * 1.9, 4);
  // 대륙(넓은 덩어리) 위에 능선을 얹어 "지형"으로 읽히게 한다.
  float terrain = continents * 0.75 + ridges * 0.35;

  // 극지방을 밝게 — 구가 축을 가진 천체로 읽힌다.
  float lat = abs(normalize(vLocalPos).y);
  float ice = smoothstep(0.72, 0.98, lat + terrain * 0.12);

  vec3 albedo = uBaseColor;
  albedo *= 0.55 + 0.9 * terrain;
  albedo = mix(albedo, uBaseColor * 1.9 + vec3(0.12), ice);

  // --- 라이팅: 램버트 + 부드러운 명암 경계(터미네이터).
  float ndl = dot(N, L);
  float day = smoothstep(-0.12, 0.35, ndl);

  // 야간면: 완전히 검게 죽이지 않고 아주 옅은 자체 발광을 남긴다.
  vec3 night = uBaseColor * 0.06;

  vec3 color = mix(night, albedo * (0.15 + 1.05 * max(ndl, 0.0)), day);

  // --- 대기 프레넬 림: 가장자리로 갈수록 강해지고, 낮쪽에서 더 밝다.
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float rimLit = fres * (0.25 + 0.95 * smoothstep(-0.35, 0.5, ndl));
  color += uRimColor * rimLit * 0.85;

  // 아주 느린 대기 흐름 — 완전 정지 화면으로 보이지 않을 만큼만.
  float drift = fbm(sp * 0.7 + vec3(uTime * 0.012, 0.0, 0.0), 3);
  color *= 0.94 + 0.12 * drift;

  gl_FragColor = vec4(color, uOpacity);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/planetSurface.glsl.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/planetSurface.glsl.js src/components/SpaceBackground/planetSurface.glsl.test.js
git commit -m "feat(space): procedural planet surface shader with atmosphere rim and night side

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 행성 머티리얼 팩토리 `planetMaterial.js`

**Files:**
- Create: `src/components/SpaceBackground/planetMaterial.js`
- Test: `src/components/SpaceBackground/planetMaterial.test.js`

**Interfaces:**
- Consumes: `PLANET_VERT`, `PLANET_FRAG` (Task 2)
- Produces: `createPlanetMaterial({ color, rimColor, seed }) → { material: THREE.ShaderMaterial, setOpacity(v: number): void, setTime(t: number): void }`
  - `setOpacity`는 0~1 클램프. `v >= 1`이면 `material.transparent = false` (Phase 2의 build=1 계약을 이 머티리얼에서도 지킨다).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/planetMaterial.test.js
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPlanetMaterial } from './planetMaterial.js'
import { PLANET_UNIFORM_NAMES } from './planetSurface.glsl.js'

describe('createPlanetMaterial', () => {
  it('셰이더 머티리얼과 계약 유니폼을 만든다', () => {
    const { material } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 3 })
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    for (const u of PLANET_UNIFORM_NAMES) expect(material.uniforms[u]).toBeTruthy()
    expect(material.uniforms.uSeed.value).toBe(3)
  })

  it('setOpacity가 유니폼에 반영되고 0~1로 클램프된다', () => {
    const { material, setOpacity } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setOpacity(0.4)
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.4, 6)
    setOpacity(-2)
    expect(material.uniforms.uOpacity.value).toBe(0)
    setOpacity(5)
    expect(material.uniforms.uOpacity.value).toBe(1)
  })

  it('완전 불투명해지면 투명 큐에서 빠진다 (Phase 2 build=1 계약)', () => {
    const { material, setOpacity } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setOpacity(0.5)
    expect(material.transparent).toBe(true)
    setOpacity(1)
    expect(material.transparent).toBe(false)
  })

  it('setTime이 유니폼을 갱신한다', () => {
    const { material, setTime } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    setTime(12.5)
    expect(material.uniforms.uTime.value).toBeCloseTo(12.5, 6)
  })

  it('항성 위치 유니폼은 원점에서 시작한다 (항성계 중심)', () => {
    const { material } = createPlanetMaterial({ color: 0x6db5ff, rimColor: 0x9fd0ff, seed: 0 })
    expect(material.uniforms.uSunPos.value.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/planetMaterial.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/planetMaterial.js
import * as THREE from 'three'
import { PLANET_VERT, PLANET_FRAG } from './planetSurface.glsl.js'

export function createPlanetMaterial({ color, rimColor, seed }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uBaseColor: { value: new THREE.Color(color) },
      // 항성은 항성계 원점에 고정이라 상수지만, 유니폼으로 두면 Phase 5의
      // 시간대 라이팅에서 광원을 옮길 때 이 파일만 고치면 된다.
      uSunPos: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: 1 },
      uRimColor: { value: new THREE.Color(rimColor) },
    },
  })

  return {
    material,
    setOpacity(v) {
      const o = Math.min(Math.max(v, 0), 1)
      material.uniforms.uOpacity.value = o
      // 완전 불투명해지면 불투명 큐로 되돌린다 — 투명 큐에 남으면 정렬 비용과
      // 미세한 합성 차이가 생긴다 (Phase 2가 세운 계약).
      const wantTransparent = o < 1
      if (material.transparent !== wantTransparent) {
        material.transparent = wantTransparent
        material.needsUpdate = true
      }
    },
    setTime(t) {
      material.uniforms.uTime.value = t
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/planetMaterial.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/planetMaterial.js src/components/SpaceBackground/planetMaterial.test.js
git commit -m "feat(space): planet material factory with build-aware opacity

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 항성 셰이더 `sunSurface.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/sunSurface.glsl.js`
- Test: `src/components/SpaceBackground/sunSurface.glsl.test.js`

**Interfaces:**
- Consumes: `GLSL_NOISE` (Task 1)
- Produces: `SUN_VERT`, `SUN_FRAG`, `SUN_UNIFORM_NAMES = ['uCoreColor','uEdgeColor','uTime']`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/sunSurface.glsl.test.js
import { describe, it, expect } from 'vitest'
import { SUN_VERT, SUN_FRAG, SUN_UNIFORM_NAMES } from './sunSurface.glsl.js'

describe('항성 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(SUN_UNIFORM_NAMES).toEqual(['uCoreColor', 'uEdgeColor', 'uTime'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of SUN_UNIFORM_NAMES) {
      expect(SUN_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = SUN_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('시선 기준 림 감쇠를 계산한다 (가장자리 림브 다크닝)', () => {
    expect(SUN_FRAG).toMatch(/cameraPosition/)
    expect(SUN_VERT).toMatch(/varying\s+vec3\s+vWorldNormal\s*;/)
  })

  it('노이즈로 표면 난류를 만든다', () => {
    expect(SUN_FRAG).toMatch(/fbm/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    expect(SUN_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = SUN_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/sunSurface.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/sunSurface.glsl.js
// 항성 표면: 대류 세포처럼 끓는 난류 + 가장자리로 갈수록 붉어지는 림브
// 다크닝. 기존 캔버스 글로우 스프라이트는 그대로 두고(먼 거리의 헤일로 역할)
// 구체 표면만 이 셰이더가 맡는다.
import { GLSL_NOISE } from './noise.glsl.js'

export const SUN_UNIFORM_NAMES = ['uCoreColor', 'uEdgeColor', 'uTime']

export const SUN_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const SUN_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

${GLSL_NOISE}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 sp = normalize(vLocalPos) * 3.4;

  // 두 속도로 흐르는 난류를 겹쳐 "끓는" 느낌을 만든다 — 한 겹만 쓰면
  // 무늬가 통째로 흘러가는 것처럼 보인다.
  float t1 = fbm(sp + vec3(0.0, uTime * 0.055, 0.0), 4);
  float t2 = fbmRidged(sp * 1.7 - vec3(uTime * 0.032, 0.0, 0.0), 3);
  float turb = t1 * 0.68 + t2 * 0.52;

  // 림브 다크닝: 실제 항성처럼 가장자리가 어둡고 붉다.
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float limb = pow(mu, 0.55);

  vec3 color = mix(uEdgeColor, uCoreColor, limb);
  color *= 0.72 + 0.75 * turb;

  // 밝은 반점(광구 과립)을 살짝 태워 정적인 원반처럼 보이지 않게 한다.
  float hot = smoothstep(0.62, 0.92, turb);
  color += uCoreColor * hot * 0.5;

  gl_FragColor = vec4(color, 1.0);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/sunSurface.glsl.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/sunSurface.glsl.js src/components/SpaceBackground/sunSurface.glsl.test.js
git commit -m "feat(space): star surface shader with convective turbulence and limb darkening

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 성운 배경 셰이더 `nebula.glsl.js`

**Files:**
- Create: `src/components/SpaceBackground/nebula.glsl.js`
- Test: `src/components/SpaceBackground/nebula.glsl.test.js`

**Interfaces:**
- Consumes: `GLSL_NOISE` (Task 1)
- Produces: `NEBULA_VERT`, `NEBULA_FRAG`, `NEBULA_UNIFORM_NAMES = ['uColorA','uColorB','uIntensity','uTime']`
  - 안쪽에서 보는 큰 구(`side: BackSide`)에 입힌다. `uIntensity`로 전체 밀도를 조절하며, 0이면 완전히 사라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/nebula.glsl.test.js
import { describe, it, expect } from 'vitest'
import { NEBULA_VERT, NEBULA_FRAG, NEBULA_UNIFORM_NAMES } from './nebula.glsl.js'

describe('성운 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(NEBULA_UNIFORM_NAMES).toEqual(['uColorA', 'uColorB', 'uIntensity', 'uTime'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of NEBULA_UNIFORM_NAMES) {
      expect(NEBULA_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = NEBULA_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('방향 벡터를 프래그먼트로 넘긴다 (구 안쪽에서 보는 하늘)', () => {
    expect(NEBULA_VERT).toMatch(/varying\s+vec3\s+vDir\s*;/)
    expect(NEBULA_FRAG).toMatch(/varying\s+vec3\s+vDir\s*;/)
  })

  it('uIntensity가 최종 알파를 곱한다 (0이면 완전히 사라져야 한다)', () => {
    // "검은 우주가 주인공" 제약을 지키려면 밀도를 한 손잡이로 끌 수 있어야 한다.
    expect(NEBULA_FRAG).toMatch(/uIntensity/)
  })

  it('sRGB 출력 인코딩으로 끝난다', () => {
    expect(NEBULA_FRAG).toMatch(/linearToOutputTexel\(/)
  })

  it('역방향 smoothstep을 쓰지 않는다', () => {
    const calls = NEBULA_FRAG.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g) || []
    for (const c of calls) {
      const [, a, b] = c.match(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/)
      expect(parseFloat(a)).toBeLessThan(parseFloat(b))
    }
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/nebula.glsl.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/nebula.glsl.js
// 딥스페이스 성운: 항성계를 통째로 감싸는 큰 구의 안쪽 면에 그린다.
// "검은 우주가 주인공"이라는 제약이 있으므로 아주 얕게 — 별이 묻히거나
// 하늘이 뿌옇게 뜨면 실패다. uIntensity 하나로 전체 밀도를 끌 수 있게 둔다.
import { GLSL_NOISE } from './noise.glsl.js'

export const NEBULA_UNIFORM_NAMES = ['uColorA', 'uColorB', 'uIntensity', 'uTime']

export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  // 구 안쪽에서 보는 방향 = 로컬 좌표 방향. 카메라가 항성계 안을 돌아다녀도
  // 성운은 충분히 멀어 방향만으로 결정된다고 근사한다.
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const NEBULA_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;
uniform float uTime;

varying vec3 vDir;

${GLSL_NOISE}

void main() {
  vec3 d = normalize(vDir);

  // 아주 느리게 흐르는 큰 구름 + 그 안의 잔결.
  vec3 p = d * 1.6 + vec3(uTime * 0.004, 0.0, uTime * 0.003);
  float clouds = fbm(p, 5);
  float wisps = fbmRidged(d * 3.1 + vec3(0.0, uTime * 0.006, 0.0), 3);

  // 임계값을 높게 잡아 하늘의 일부에만 성운이 끼게 한다 — 전면에 깔면
  // 검은 우주가 사라진다.
  float mass = smoothstep(0.52, 0.92, clouds * 0.8 + wisps * 0.32);

  vec3 color = mix(uColorA, uColorB, clamp(wisps * 1.2, 0.0, 1.0));

  float a = mass * uIntensity;
  gl_FragColor = vec4(color * a, a);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
  if (a < 0.002) discard;
}
`
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/nebula.glsl.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/nebula.glsl.js src/components/SpaceBackground/nebula.glsl.test.js
git commit -m "feat(space): shallow deep-space nebula backdrop shader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: evanSystem에 새 머티리얼 통합

**Files:**
- Modify: `src/components/SpaceBackground/evanSystem.js`
- Modify: `src/components/SpaceBackground/evanSystem.test.js`

**Interfaces:**
- Consumes: `createPlanetMaterial` (Task 3), `SUN_VERT`/`SUN_FRAG` (Task 4), `NEBULA_VERT`/`NEBULA_FRAG` (Task 5)
- Produces: `createEvanSystem` 반환 계약은 **변경 없음** (`group`, `update(t)`, `setBuild`, `setOrbitDraw`, `dispose`). 내부만 교체된다.
  - 행성: `MeshStandardMaterial` → `createPlanetMaterial`. `setBuild`의 실체 페이드는 `setOpacity`를 통해 건다.
  - 항성: `MeshBasicMaterial` → `SUN_VERT`/`SUN_FRAG` `ShaderMaterial`. 글로우 스프라이트는 유지.
  - 성운: `nebula` 이름의 `Mesh`(BackSide 큰 구)를 group에 추가.
  - `update(t)`가 행성/항성/성운의 `uTime`을 갱신.

- [ ] **Step 1: 실패하는 테스트 작성 (기존 파일에 describe 추가)**

```js
// src/components/SpaceBackground/evanSystem.test.js 끝에 추가
describe('렌더링 품질 (Phase 3)', () => {
  const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

  it('행성이 커스텀 표면 셰이더를 쓴다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const p = sys.group.getObjectByName('planet-about')
    expect(p.material).toBeInstanceOf(THREE.ShaderMaterial)
    expect(p.material.uniforms.uBaseColor).toBeTruthy()
    sys.dispose()
  })

  it('행성마다 시드가 달라 지형이 겹치지 않는다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const seeds = PLANETS.map((p) => sys.group.getObjectByName(`planet-${p.id}`).material.uniforms.uSeed.value)
    expect(new Set(seeds).size).toBe(seeds.length)
    sys.dispose()
  })

  it('항성이 커스텀 표면 셰이더를 쓰고 글로우는 유지된다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun').material).toBeInstanceOf(THREE.ShaderMaterial)
    sys.dispose()
  })

  it('성운이 안쪽을 향한 큰 배경 구로 존재한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const neb = sys.group.getObjectByName('nebula')
    expect(neb).toBeTruthy()
    expect(neb.material.side).toBe(THREE.BackSide)
    // 가장 바깥 궤도보다 훨씬 멀어야 항성계를 감싼다.
    const outer = Math.max(...PLANETS.map((p) => p.orbitRadius))
    expect(neb.geometry.parameters.radius).toBeGreaterThan(outer * 2)
    sys.dispose()
  })

  it('update가 행성·항성·성운의 시간 유니폼을 함께 민다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.update(4.25)
    expect(sys.group.getObjectByName('planet-about').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    expect(sys.group.getObjectByName('sun').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    expect(sys.group.getObjectByName('nebula').material.uniforms.uTime.value).toBeCloseTo(4.25, 6)
    sys.dispose()
  })

  it('build=1이면 행성이 완전 불투명이고 투명 큐에서 빠진다 (Phase 2 계약 유지)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(1)
    const m = sys.group.getObjectByName('planet-about').material
    expect(m.uniforms.uOpacity.value).toBe(1)
    expect(m.transparent).toBe(false)
    sys.dispose()
  })

  it('build 중간에는 행성이 반투명으로 올라온다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.setBuild(0.8)
    const m = sys.group.getObjectByName('planet-about').material
    expect(m.transparent).toBe(true)
    expect(m.uniforms.uOpacity.value).toBeGreaterThan(0)
    expect(m.uniforms.uOpacity.value).toBeLessThan(1)
    sys.dispose()
  })

  it('dispose가 성운과 항성 리소스도 해제한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const neb = sys.group.getObjectByName('nebula')
    const sun = sys.group.getObjectByName('sun')
    const spies = [
      vi.spyOn(neb.geometry, 'dispose'), vi.spyOn(neb.material, 'dispose'),
      vi.spyOn(sun.material, 'dispose'),
    ]
    sys.dispose()
    for (const s of spies) expect(s).toHaveBeenCalled()
  })
})
```

기존 import에 `THREE`가 없으면 추가한다: `import * as THREE from 'three'`

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: FAIL — 행성 머티리얼이 아직 `MeshStandardMaterial`

- [ ] **Step 3: evanSystem.js 수정**

임포트 추가:
```js
import { createPlanetMaterial } from './planetMaterial.js'
import { SUN_VERT, SUN_FRAG } from './sunSurface.glsl.js'
import { NEBULA_VERT, NEBULA_FRAG } from './nebula.glsl.js'
```

**항성 머티리얼 교체** — 기존 `const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })`를:
```js
  // 항성 표면은 전용 셰이더가 맡는다. 글로우 스프라이트는 그대로 둬서
  // 먼 거리의 헤일로 역할을 계속 시킨다.
  const sunMat = new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: {
      uCoreColor: { value: new THREE.Color(0xfff1c9) },
      uEdgeColor: { value: new THREE.Color(0xff9d4a) },
      uTime: { value: 0 },
    },
  })
```

**성운 추가** — 궤도 라인 생성 앞에 넣는다:
```js
  // --- 성운: 항성계 전체를 감싸는 큰 구의 안쪽. 가장 바깥 궤도(425)보다
  // 훨씬 멀리 둬야 카메라가 레일 끝까지 가도 안쪽에 머문다.
  const nebulaGeo = new THREE.SphereGeometry(1600, 32, 24)
  const nebulaMat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms: {
      uColorA: { value: new THREE.Color(0x1b2b52) },
      uColorB: { value: new THREE.Color(0x3a1f4d) },
      // 얕게 — 검은 우주가 주인공이라는 제약. 이 값을 올리면 별이 묻힌다.
      uIntensity: { value: 0.32 },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // 별필드보다 먼저 그려져야 별이 성운 위에 얹힌다.
    depthTest: false,
  })
  const nebula = new THREE.Mesh(nebulaGeo, nebulaMat)
  nebula.name = 'nebula'
  nebula.renderOrder = -10
  group.add(nebula)
  disposables.push(nebulaGeo, nebulaMat)
```

**행성 머티리얼 교체** — 행성 루프 안의 `const mat = new THREE.MeshStandardMaterial({...})`를:
```js
    // 행성마다 시드를 달리해 지형이 서로 겹치지 않게 한다.
    const planet = createPlanetMaterial({
      color: p.color,
      // 림은 본색보다 밝고 푸르게 — 대기 산란처럼 읽힌다.
      rimColor: new THREE.Color(p.color).lerp(new THREE.Color(0xbfe0ff), 0.55).getHex(),
      seed: i * 17.3 + 3.1,
    })
    const mat = planet.material
```
루프가 인덱스를 안 쓰고 있으면 `PLANETS.forEach((p, i) => ...)`나 인덱스 카운터로 바꾼다.

`solidMaterials`에 넣는 방식이 `{ mat, baseOpacity }`였다면, 행성은 셰이더 유니폼으로 페이드하므로 별도 배열로 관리한다:
```js
  const planetFades = []   // 루프 밖 선언
  planetFades.push(planet) // 루프 안
```
그리고 `setBuild`에서 링·위성은 기존 `solidMaterials` 경로를 유지하되 행성은:
```js
      for (const pf of planetFades) pf.setOpacity(solidFrac)
```
(`solidFrac`은 기존 구현의 실체 진행도 변수명에 맞춘다. `g >= 1`일 때 정확히 1이 되는 기존 특수 처리를 그대로 통과해야 한다.)

**시간 전달** — `update(t)` 안에 추가:
```js
      for (const pf of planetFades) pf.setTime(t)
      sunMat.uniforms.uTime.value = t
      nebulaMat.uniforms.uTime.value = t
```

**조명 정리**: 행성이 더 이상 three 조명을 쓰지 않지만 링·위성은 `MeshStandardMaterial`이라 `sunLight`/`ambient`는 **그대로 둔다**. 지우면 링과 위성이 새까매진다 — 주석으로 이유를 남긴다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js` → PASS
Run: `npm test` → 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/evanSystem.js src/components/SpaceBackground/evanSystem.test.js
git commit -m "feat(space): swap planets and star onto custom shaders, add nebula backdrop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 필름 그레인 + 비네트

**Files:**
- Modify: `src/components/SpaceBackground/postfx.js`

**Interfaces:**
- Consumes: 없음 (기존 `WarpDistortShader`를 확장)
- Produces: `createPostFX(...)`의 반환 계약 변경 없음 (`render(intensity)`, `setSize`, `dispose`). 마지막 셰이더 패스가 그레인·비네트를 추가로 적용한다.

- [ ] **Step 1: postfx.js 수정**

`WarpDistortShader`의 uniforms에 추가:
```js
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
```

fragmentShader의 `sRGBEncode` 정의 아래에 해시를 추가:
```glsl
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
```

`gl_FragColor = vec4(sRGBEncode(color), 1.0);` 직전에 넣는다:
```glsl
      // 비네트: 가장자리를 눌러 시선을 화면 중앙(항성계)에 붙든다.
      float vig = 1.0 - smoothstep(0.42, 1.05, dist * 1.6);
      color *= mix(0.62, 1.0, vig);

      // 필름 그레인: 매 프레임 다른 노이즈. 절차적 표면의 밴딩을 깨주고
      // 렌더가 "찍힌 화면"처럼 보이게 한다 — 아주 옅게.
      float g = hash12(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 137.0);
      color += (g - 0.5) * uGrain;
```

`render(intensity)`를 시간도 받도록 확장하되 **기본값으로 기존 호출을 깨지 않는다**:
```js
    render(intensity, time = 0) {
      warpPass.uniforms.uIntensity.value = intensity
      warpPass.uniforms.uTime.value = time
      composer.render()
    },
```

`SpaceBackground.jsx`의 호출부를 `postfx.render(intensitySmooth, reducedMotion ? 0 : t)`로 바꾼다. reduced-motion에서는 그레인이 매 프레임 요동치지 않도록 시간을 고정한다.

- [ ] **Step 2: 유닛 테스트 + 빌드**

Run: `npm test` → 전체 통과 (postfx는 WebGL이 필요해 단위 테스트 대상이 아니다)
Run: `npm run build` → 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/SpaceBackground/postfx.js src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(space): film grain and vignette in the post chain

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 시각 검증 및 튜닝

**Files:** 필요 시 셰이더 상수만 조정

- [ ] **Step 1: 개발 서버로 캡처**

```bash
npm run dev   # 포트 확인
```

Playwright로 세 지점을 캡처한다 (인트로는 세션당 1회이므로 매번 새 컨텍스트):
1. 홈 정거장 정착 후 전체 화면
2. Skills 행성 클로즈업 (행성이 화면에 크게 잡히는 클립 영역)
3. 인트로 중반 — 청사진이 여전히 정상 동작하는지

- [ ] **Step 2: 판정 기준으로 직접 확인**

- 행성이 **단색 구체가 아니다**: 지형 무늬, 밝은 극지방, 가장자리 대기 림, 어두운 야간면이 보인다.
- 항성이 **평면 원반이 아니다**: 표면이 끓고 가장자리가 붉게 어둡다.
- **검은 우주가 여전히 주인공이다**: 성운이 하늘 일부에만 얕게 끼고, 별이 묻히지 않는다. 뿌옇게 떠 보이면 `uIntensity`를 낮춘다.
- 그레인이 **눈에 띄게 지글거리지 않는다**. 거슬리면 `uGrain`을 낮춘다.
- 청사진 인트로가 **여전히 정상**이다 (Phase 2 회귀 없음).

값을 조정했으면 이유와 함께 커밋한다.

- [ ] **Step 3: 커밋 (조정한 경우에만)**

```bash
git add -A
git commit -m "fix(space): tune shader constants against captured frames

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 전체 회귀 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 스위트**

```bash
npm test 2>&1 | grep -E "Test Files|Tests "
npm run lint 2>&1 | grep -E "planetSurface|planetMaterial|sunSurface|nebula|noise|evanSystem|postfx|SpaceBackground" || echo "no new errors in touched files"
npm run build 2>&1 | grep -E "✓ built|error"
npx playwright test 2>&1 | tail -6
```

Expected: 유닛 전체 통과, 빌드 성공. e2e는 **`destruction.spec.js` 1건이 기존 실패**로 알려져 있다(헤드리스 소프트웨어 렌더링에서 하드웨어 가속 안내 배너가 클릭을 가로챔 — Phase 1에서 베이스라인 재현으로 확인). 그 외 새 실패는 원인을 규명한다. **`playwright.config.js`의 `workers: 1`은 의도된 설정이니 바꾸지 않는다.**

- [ ] **Step 2: 수동 회귀 체크리스트**

- 4개 모드(Terminal/Speedrun/Destruction/Inspect) 진입·동작·이탈
- 언어 4개 전환
- `/gallery` 워프 부스트 → 링 갤러리 → 메인 복귀
- `/guestbook`, `/projects/:slug`
- reduced-motion: 셰이더 애니메이션이 멎고 그레인이 고정되지만 형태는 정상
- 인트로 도중 라우트 이탈 후 복귀 (Phase 2에서 고친 경로)

- [ ] **Step 3: 문제가 있으면 해당 태스크로 돌아가 수정 후 재실행**

전부 통과하면 Phase 3 완료를 검증 출력 요약과 함께 보고한다.

---

## Self-Review 결과

- **스펙 커버리지**: §5.3의 남은 항목 중 행성 절차적 표면(Task 2·3·6), 항성 코로나·난류(Task 4·6), 성운 배경(Task 5·6), 필름 그레인·비네트(Task 7)를 모두 다룬다. **별 필드 GLSL 재작성은 의도적으로 제외**했고 그 근거를 스펙 §6에 기록했다. 품질 프리셋(§5.4)은 이 단계 범위가 아니며 기존 게이팅(데스크톱 postfx, reduced-motion)을 그대로 쓴다.
- **플레이스홀더 스캔**: 통과 — 모든 코드 스텝에 실제 코드가 있다. Task 6은 기존 파일 수정이라 조각 단위로 주되, 각 조각의 삽입 위치와 이유를 명시했다.
- **타입 일관성**: `GLSL_NOISE`(T1 = T2/T4/T5), `PLANET_VERT/FRAG/UNIFORM_NAMES`(T2 = T3), `createPlanetMaterial({color,rimColor,seed}) → {material,setOpacity,setTime}`(T3 = T6), `SUN_VERT/FRAG`(T4 = T6), `NEBULA_VERT/FRAG`(T5 = T6) 모두 일치.
- **Phase 2 계약 유지 확인**: 행성 머티리얼이 바뀌어도 `setBuild`의 교차 페이드는 `setOpacity`로 이어지고, `build=1`에서 `transparent=false` 계약을 Task 3이 자체적으로 지키며 Task 6의 테스트가 이를 다시 확인한다. 청사진 쌍둥이와 `setOrbitDraw`는 건드리지 않는다.
- **알려진 위험**: 행성이 three 조명을 떠나므로 `sunLight`/`ambient`는 링·위성 전용이 된다. Task 6이 이를 명시하고 주석을 요구한다. 성운의 `depthTest: false` + `renderOrder: -10` 조합은 별 필드와의 그리기 순서를 결정하므로, Task 8에서 별이 성운 위에 제대로 얹히는지 눈으로 확인해야 한다.
