# Evan System Phase 6a — 프로젝트 위성 디오라마 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** projects 행성을 도는 위성 세 개가 각각 실제 프로젝트가 되어, 이름이 뜨고 누르면 워프로 그 프로젝트 상세 페이지에 도착한다.

**Architecture:** 위성은 이미 씬에 있지만 색만 있고 정체성이 없다. 배치 수식을 순수 모듈로 꺼내 프로젝트(slug·제목·accent)와 묶고, 매 프레임 위성의 월드 좌표를 화면 좌표로 투영해 그 자리에 진짜 HTML `<button>`을 얹는다. 3D 레이캐스팅 대신 DOM 오버레이를 쓰는 이유는 키보드·스크린리더가 공짜로 따라오고 캔버스의 `pointer-events: none`을 건드리지 않아도 되기 때문이다. 클릭 전환은 Lab 이동에 이미 쓰이는 `LabTransition`(워프 부스트 + 화이트 플래시 + 라우트 교체)을 그대로 재사용한다.

**Tech Stack:** React 19, three.js 0.184 (명령형), react-router 7, vitest 4 (환경 `node`), Playwright 1.60.

## Global Constraints

- **R3F(`@react-three/fiber`)를 쓰지 않는다.** 설치돼 있지만 이 코드베이스의 3D는 전부 명령형 three.js다.
- **아트 디렉션:** 배경은 "검은 우주 + 떠다니는 별"이다. 오버레이 UI가 하늘을 밝히거나 별을 가리면 안 된다.
- **vitest 환경은 `node`다.** 단위 테스트 파일에서 `document`, `window`, `sessionStorage`를 쓸 수 없다. DOM이 필요한 검증은 Playwright e2e로 간다.
- **`SpaceBackground`의 캔버스는 `pointer-events: none`을 유지한다.** 캔버스가 포인터를 먹으면 도킹 패널의 링크·폼이 전부 죽는다.
- **`createEvanSystem`의 공개 계약을 깨지 않는다.** 현재 반환값은 `{ group, update(t, shaderTime, cameraPosition), setBuild, setOrbitDraw, setGrade, dispose }`이고 Phase 1~5의 테스트가 이 모양에 의존한다. 이번에 더하는 것은 `satellites` 하나뿐이다.
- **위성의 시각적 배치는 지금과 픽셀 동일해야 한다.** 이 플랜은 위치 수식을 옮기기만 하고 값을 바꾸지 않는다.
- **데스크톱 판별 미디어쿼리 문자열은 정확히 `(min-width: 769px) and (min-height: 701px)`** 다.
- **i18n 4개 로케일(`en`, `ko`, `ja`, `zh`) 전부**에 새 문구를 넣는다.
- **`prefers-reduced-motion`에서도 위성은 누를 수 있어야 한다.** 줄어드는 것은 전환 연출이지 기능이 아니다.
- 커밋 메시지는 영어, 코드 주석은 이 코드베이스 관례대로 한국어.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/components/SpaceBackground/satellites.js` (신규) | 위성 = 프로젝트. 배치 수식과 slug·제목·accent를 한곳에서 정의. 순수. |
| `src/components/SpaceBackground/satellites.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/SpaceBackground/screenProject.js` (신규) | 월드 좌표 → 화면 픽셀 좌표 + 카메라 뒤 판정. 순수(three의 Vector3/Matrix4만 사용). |
| `src/components/SpaceBackground/screenProject.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/SpaceBackground/satelliteOverlay.js` (신규) | 렌더 루프 → React를 잇는 최소 스토어. `publish`/`subscribe`. 순수. |
| `src/components/SpaceBackground/satelliteOverlay.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/SpaceBackground/evanSystem.js` (수정) | 위성 생성을 `SATELLITES`에서 돌리고, `satellites` 배열(slug + mesh)을 노출. |
| `src/components/SpaceBackground/SpaceBackground.jsx` (수정) | projects 정거장 근처에서만 위성 화면 좌표를 publish. |
| `src/components/ProjectSatellites/ProjectSatellites.jsx` (신규) | 위성 자리에 얹히는 버튼 오버레이. 클릭 시 워프 전환 후 라우트 이동. |
| `src/components/ProjectSatellites/ProjectSatellites.css` (신규) | 오버레이 스타일. |
| `src/App.jsx` (수정) | 메인+데스크톱에서 `<ProjectSatellites />` 렌더. |
| `src/i18n/translations.js` (수정) | `satellites.label`, `satellites.open` — 4개 로케일. |
| `src/i18n/translations.test.js` (수정) | 새 키 파리티 검증. |
| `e2e/project-satellites.spec.js` (신규) | 위성 버튼 등장·이름·클릭 이동. |

## 비범위 (Out of Scope)

- 헤드트래킹 패럴랙스 — 스펙 §6에서 2026-08-09에 범위 제외.
- 앰비언트 오디오 — Phase 6b의 별도 플랜.
- 프로젝트가 3개를 넘어갈 때의 위성 배치 재설계. 현재 `projects`는 3개이고 위성도 3개다. 이 플랜은 1:1을 유지하되 개수에 의존하지 않는 수식을 쓴다.

---

### Task 1: 위성 = 프로젝트 (배치 수식 추출)

**Files:**
- Create: `src/components/SpaceBackground/satellites.js`
- Test: `src/components/SpaceBackground/satellites.test.js`
- Modify: `src/components/SpaceBackground/evanSystem.js`

**Interfaces:**
- Consumes: `src/data/projects.js`의 `projects` 배열 (각 항목은 `{ id, title, desc, tags, category, accent, slug, ... }`); `src/components/SpaceBackground/system.js`의 `PLANETS`.
- Produces: `SATELLITE_COUNT`(number), `SATELLITES`(`{ slug, title, accent, position: [x, y, z] }[]`). `position`은 projects 행성 **로컬** 좌표다(위성은 행성의 자식 피벗에 붙는다).

**현재 코드(`evanSystem.js`의 위성 블록) — 값을 그대로 보존할 것:**

```js
  const projectsPlanetData = PLANETS.find((p) => p.id === 'projects')
  ...
  satelliteColors.forEach((hex, i) => {
    const geo = new THREE.SphereGeometry(3.5, 20, 20)
    ...
    const a = (i / satelliteColors.length) * Math.PI * 2
    const r = projectsPlanetData.radius * 1.9
    sat.position.set(Math.cos(a) * r, Math.sin(a * 2) * 4, Math.sin(a) * r)
```

`createEvanSystem`은 현재 `satelliteColors` 옵션을 받고, `SpaceBackground.jsx`가 `projects.slice(0, 3).map((p) => p.accent)`를 넘긴다. 이 태스크 뒤에는 색이 `SATELLITES`에서 나오므로 호출부에서 그 인자를 넘길 필요가 없어진다 — **하지만 시그니처는 그대로 두고 인자를 무시하지 말 것.** 아래 Step 4가 호출부까지 정리한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/SpaceBackground/satellites.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { projects } from '../../data/projects.js'
import { PLANETS } from './system.js'
import { SATELLITE_COUNT, SATELLITES } from './satellites.js'

describe('SATELLITES', () => {
  it('프로젝트에서 나오고 개수가 SATELLITE_COUNT와 맞는다', () => {
    expect(SATELLITES).toHaveLength(SATELLITE_COUNT)
    expect(SATELLITE_COUNT).toBeLessThanOrEqual(projects.length)
  })

  it('각 위성이 실제 프로젝트의 slug·제목·accent를 그대로 갖는다', () => {
    SATELLITES.forEach((s, i) => {
      expect(s.slug).toBe(projects[i].slug)
      expect(s.title).toBe(projects[i].title)
      expect(s.accent).toBe(projects[i].accent)
    })
  })

  it('slug가 비어 있는 위성은 없다 — 누르면 갈 곳이 있어야 한다', () => {
    for (const s of SATELLITES) {
      expect(typeof s.slug).toBe('string')
      expect(s.slug.length).toBeGreaterThan(0)
    }
  })

  it('slug가 서로 겹치지 않는다 — 겹치면 두 위성이 같은 곳으로 간다', () => {
    expect(new Set(SATELLITES.map((s) => s.slug)).size).toBe(SATELLITES.length)
  })

  it('배치가 기존 씬 수식과 정확히 같다 (시각 회귀 방지)', () => {
    // Phase 1부터 쓰던 식을 그대로 옮겼는지 검증한다. 값이 바뀌면 위성이
    // 화면에서 다른 자리로 튄다.
    const r = PLANETS.find((p) => p.id === 'projects').radius * 1.9
    SATELLITES.forEach((s, i) => {
      const a = (i / SATELLITE_COUNT) * Math.PI * 2
      expect(s.position[0]).toBeCloseTo(Math.cos(a) * r, 10)
      expect(s.position[1]).toBeCloseTo(Math.sin(a * 2) * 4, 10)
      expect(s.position[2]).toBeCloseTo(Math.sin(a) * r, 10)
    })
  })

  it('위성끼리 겹치지 않는다 — 반지름 3.5짜리 구가 서로 파고들면 안 된다', () => {
    for (let i = 0; i < SATELLITES.length; i++) {
      for (let j = i + 1; j < SATELLITES.length; j++) {
        const [ax, ay, az] = SATELLITES[i].position
        const [bx, by, bz] = SATELLITES[j].position
        expect(Math.hypot(ax - bx, ay - by, az - bz)).toBeGreaterThan(7)
      }
    }
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/satellites.test.js`
Expected: FAIL — `Failed to resolve import "./satellites.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/SpaceBackground/satellites.js`:

```js
// 프로젝트 위성 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 위성은 장식이 아니라 실제 프로젝트다: 색뿐 아니라 slug·제목을 함께 들고
// 있어야 화면 오버레이가 이름을 띄우고 상세 페이지로 보낼 수 있다.
import { projects } from '../../data/projects.js'
import { PLANETS } from './system.js'

// 위성은 projects 행성 주위에 도는 세 개다. projects 데이터가 늘어도 씬이
// 붐비지 않도록 앞의 세 개만 태운다 (Phase 1부터의 동작).
export const SATELLITE_COUNT = 3

const PROJECTS_PLANET = PLANETS.find((p) => p.id === 'projects')
// 행성 반지름의 1.9배 — PLANETS에서 파생시켜 행성 크기를 바꿔도 desync되지 않는다.
const ORBIT_RADIUS = PROJECTS_PLANET.radius * 1.9

export const SATELLITES = projects.slice(0, SATELLITE_COUNT).map((p, i) => {
  const a = (i / SATELLITE_COUNT) * Math.PI * 2
  return {
    slug: p.slug,
    title: p.title,
    accent: p.accent,
    // projects 행성 로컬 좌표 — 위성은 행성의 자식 피벗에 붙는다.
    // y는 sin(2a)로 흔들어 세 개가 한 평면에 늘어서지 않게 한다.
    position: [Math.cos(a) * ORBIT_RADIUS, Math.sin(a * 2) * 4, Math.sin(a) * ORBIT_RADIUS],
  }
})
```

- [ ] **Step 4: 씬이 이 모듈을 쓰게 한다**

`src/components/SpaceBackground/evanSystem.js`의 import 블록에 추가:

```js
import { SATELLITES } from './satellites.js'
```

위성 생성 블록 전체(`const projectsPlanetData = ...`부터 `satelliteColors.forEach(...)`가 닫히는 곳까지)를 아래로 교체한다. `projectsPlanetData`는 이 블록에서만 쓰이므로 함께 사라진다:

```js
  // --- 프로젝트 위성: projects 행성 주위를 피벗 그룹째 공전.
  const projectsPlanet = group.getObjectByName('planet-projects')
  const pivot = new THREE.Group()
  pivot.name = 'satellites-pivot'
  projectsPlanet.add(pivot)
  // 화면 오버레이가 위성마다 버튼을 얹으려면 slug와 메시를 짝지어 알아야 한다.
  const satellites = []
  SATELLITES.forEach((s) => {
    const geo = new THREE.SphereGeometry(3.5, 20, 20)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(s.accent),
      emissive: new THREE.Color(s.accent),
      emissiveIntensity: 0.4,
      roughness: 0.5,
    })
    const sat = new THREE.Mesh(geo, mat)
    sat.name = `satellite-${s.slug}`
    sat.position.set(...s.position)
    pivot.add(sat)
    disposables.push(geo, mat)
    satellites.push({ slug: s.slug, title: s.title, object: sat })
    // 위성도 링과 마찬가지로 작아서 청사진 쌍둥이 없이 실체 페이드만 태운다.
    solidMaterials.push({ mat, baseOpacity: mat.opacity })
  })
```

반환 객체에 `satellites`를 추가한다 — `dispose` 정의 **바로 앞**에 한 줄:

```js
    satellites,
```

`createEvanSystem`의 시그니처에서 이제 쓰이지 않는 `satelliteColors` 옵션을 지운다. 현재:

```js
export function createEvanSystem({ satelliteColors = [] } = {}) {
```

를 아래로 바꾼다:

```js
export function createEvanSystem() {
```

그리고 호출부 `src/components/SpaceBackground/SpaceBackground.jsx`에서 인자와 이제 불필요해진 준비 코드를 지운다. 현재:

```jsx
    const satelliteColors = projects.slice(0, 3).map((p) => p.accent)
    const ensureSystem = () => {
      if (!evanSystem) {
        evanSystem = createEvanSystem({ satelliteColors })
```

를 아래로 바꾼다:

```jsx
    const ensureSystem = () => {
      if (!evanSystem) {
        evanSystem = createEvanSystem()
```

이 변경으로 `SpaceBackground.jsx`의 `import { projects } from '../../data/projects.js'`가 쓰이지 않게 된다 — **그 import 줄을 지운다.** (파일 안에서 `projects`를 다른 데서도 쓰는지 먼저 `grep -n "projects" src/components/SpaceBackground/SpaceBackground.jsx`로 확인하고, 이 용도뿐이면 지운다.)

- [ ] **Step 5: 테스트를 돌린다**

Run: `npx vitest run src/components/SpaceBackground/satellites.test.js`
Expected: PASS

Run: `npm test`
Expected: 전부 통과. **`evanSystem.test.js`가 `createEvanSystem({ satelliteColors: COLORS })` 형태로 부르고 있다면 인자는 그냥 무시되므로 그대로 통과한다.** 만약 위성 개수나 이름에 의존하는 단언이 깨지면, 그 테스트가 검증하려던 것이 무엇인지 읽고 새 구조에 맞게 고친다 — 단언을 지워서 통과시키지 말 것.

Run: `npm run build`
Expected: 정상 종료

Run: `npx eslint src/components/SpaceBackground/satellites.js src/components/SpaceBackground/evanSystem.js src/components/SpaceBackground/SpaceBackground.jsx`
Expected: 오류 0건 (특히 안 쓰는 import가 남아 있으면 여기서 잡힌다)

- [ ] **Step 6: 커밋**

```bash
git add src/components/SpaceBackground/satellites.js \
        src/components/SpaceBackground/satellites.test.js \
        src/components/SpaceBackground/evanSystem.js \
        src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(satellites): give each project satellite its project identity"
```

---

### Task 2: 월드 → 화면 좌표 투영

**Files:**
- Create: `src/components/SpaceBackground/screenProject.js`
- Test: `src/components/SpaceBackground/screenProject.test.js`

**Interfaces:**
- Consumes: `three`의 `Vector3`, `Matrix4`.
- Produces: `projectToScreen(worldPos, viewProjection, width, height) → { x, y, visible }`.
  `worldPos`는 `THREE.Vector3`, `viewProjection`은 `THREE.Matrix4`(= `projectionMatrix * matrixWorldInverse`), `width`/`height`는 픽셀. 반환의 `x`/`y`는 CSS 픽셀 좌표(좌상단 원점), `visible`은 카메라 앞이고 뷰포트 안이면 `true`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/SpaceBackground/screenProject.test.js`:

```js
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { projectToScreen } from './screenProject.js'

// 원점을 바라보며 z=+10에 선 카메라의 뷰프로젝션 행렬.
function viewProjectionAt(z = 10) {
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
  cam.position.set(0, 0, z)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
}

describe('projectToScreen', () => {
  it('카메라가 보는 원점은 화면 정중앙이다', () => {
    const r = projectToScreen(new THREE.Vector3(0, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.x).toBeCloseTo(400, 6)
    expect(r.y).toBeCloseTo(300, 6)
    expect(r.visible).toBe(true)
  })

  it('오른쪽에 있는 점은 화면 중앙보다 오른쪽에 온다', () => {
    const r = projectToScreen(new THREE.Vector3(2, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.x).toBeGreaterThan(400)
    expect(r.y).toBeCloseTo(300, 6)
  })

  it('위에 있는 점은 화면 중앙보다 위에 온다 — y축이 뒤집혀야 한다', () => {
    // NDC는 위가 +1이지만 CSS 픽셀은 아래가 +y다. 뒤집지 않으면 위성 버튼이
    // 상하 반대로 붙는다.
    const r = projectToScreen(new THREE.Vector3(0, 2, 0), viewProjectionAt(), 800, 600)
    expect(r.y).toBeLessThan(300)
  })

  it('카메라 뒤의 점은 visible=false다', () => {
    // z=+50은 z=+10에 선 카메라의 등 뒤다. 뒤를 걸러내지 않으면 원근 나눗셈이
    // 부호를 뒤집어 화면 반대편에 유령 버튼이 생긴다.
    const r = projectToScreen(new THREE.Vector3(0, 0, 50), viewProjectionAt(), 800, 600)
    expect(r.visible).toBe(false)
  })

  it('뷰포트 밖으로 나간 점은 visible=false다', () => {
    const r = projectToScreen(new THREE.Vector3(60, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.visible).toBe(false)
  })

  it('종횡비가 다른 뷰포트에서도 중앙은 중앙이다', () => {
    const r = projectToScreen(new THREE.Vector3(0, 0, 0), viewProjectionAt(), 1920, 1080)
    expect(r.x).toBeCloseTo(960, 6)
    expect(r.y).toBeCloseTo(540, 6)
  })

  it('입력 벡터를 훼손하지 않는다 — 씬의 실제 위성 좌표를 그대로 넘기게 된다', () => {
    const v = new THREE.Vector3(1, 2, 3)
    projectToScreen(v, viewProjectionAt(), 800, 600)
    expect([v.x, v.y, v.z]).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/screenProject.test.js`
Expected: FAIL — `Failed to resolve import "./screenProject.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/SpaceBackground/screenProject.js`:

```js
// 월드 좌표 → 화면 픽셀 좌표 (순수 — DOM 미의존, 단위 테스트 대상).
// 위성 위에 HTML 버튼을 얹기 위해 필요하다. 레이캐스팅 대신 이 방향을 쓰는
// 이유: 캔버스는 pointer-events:none을 유지해야 하고(도킹 패널의 링크·폼이
// 죽는다), 진짜 <button>이어야 키보드·스크린리더가 그대로 동작한다.
import * as THREE from 'three'

// 매 프레임 위성 수만큼 호출되므로 벡터를 재사용한다 — 프레임마다 새로
// 할당하면 GC가 렌더 루프 안에서 튄다.
const scratch = new THREE.Vector3()

export function projectToScreen(worldPos, viewProjection, width, height) {
  // 입력 벡터는 씬이 소유한 값이라 절대 건드리지 않는다.
  scratch.copy(worldPos).applyMatrix4(viewProjection)

  // applyMatrix4는 w로 나눈 뒤의 NDC를 주지만, w<0(카메라 뒤)일 때는 부호가
  // 뒤집혀 화면 반대편의 유령 좌표가 된다. 그래서 뒤 판정을 따로 한다.
  const w =
    viewProjection.elements[3] * worldPos.x +
    viewProjection.elements[7] * worldPos.y +
    viewProjection.elements[11] * worldPos.z +
    viewProjection.elements[15]
  const behind = w <= 0

  // NDC(-1~1, 위가 +1) → CSS 픽셀(좌상단 원점, 아래가 +y).
  const x = (scratch.x * 0.5 + 0.5) * width
  const y = (-scratch.y * 0.5 + 0.5) * height

  const inside = x >= 0 && x <= width && y >= 0 && y <= height
  return { x, y, visible: !behind && inside }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/screenProject.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/screenProject.js src/components/SpaceBackground/screenProject.test.js
git commit -m "feat(satellites): world-to-screen projection for the button overlay"
```

---

### Task 3: 렌더 루프 → React 스토어

**Files:**
- Create: `src/components/SpaceBackground/satelliteOverlay.js`
- Test: `src/components/SpaceBackground/satelliteOverlay.test.js`
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx`

**Interfaces:**
- Consumes: Task 1의 `evanSystem.satellites`(`{ slug, title, object }[]`); Task 2의 `projectToScreen(worldPos, viewProjection, width, height)`.
- Produces: `publishSatellites(list)`, `subscribeSatellites(fn) → unsubscribe`, `getSatellites()`.
  `list`는 `{ slug, title, x, y, visible }[]`. 구독자는 publish마다 그 배열을 받는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/SpaceBackground/satelliteOverlay.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  publishSatellites,
  subscribeSatellites,
  getSatellites,
} from './satelliteOverlay.js'

beforeEach(() => {
  publishSatellites([])
})

describe('satelliteOverlay 스토어', () => {
  it('publish한 값을 getSatellites로 다시 읽는다', () => {
    const list = [{ slug: 'findx', title: 'FindX', x: 10, y: 20, visible: true }]
    publishSatellites(list)
    expect(getSatellites()).toEqual(list)
  })

  it('구독자는 publish마다 최신 목록을 받는다', () => {
    const seen = []
    subscribeSatellites((l) => seen.push(l))
    publishSatellites([{ slug: 'a', title: 'A', x: 1, y: 2, visible: true }])
    publishSatellites([{ slug: 'b', title: 'B', x: 3, y: 4, visible: false }])
    expect(seen).toHaveLength(2)
    expect(seen[0][0].slug).toBe('a')
    expect(seen[1][0].slug).toBe('b')
  })

  it('구독 해지 후에는 더 받지 않는다 — 언마운트된 오버레이가 계속 깨어나면 안 된다', () => {
    const fn = vi.fn()
    const off = subscribeSatellites(fn)
    publishSatellites([{ slug: 'a', title: 'A', x: 0, y: 0, visible: true }])
    off()
    publishSatellites([{ slug: 'b', title: 'B', x: 0, y: 0, visible: true }])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('구독자가 여럿이어도 모두 받는다', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeSatellites(a)
    subscribeSatellites(b)
    publishSatellites([])
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('한 구독자가 던져도 다른 구독자는 계속 받는다 — 렌더 루프가 멈추면 씬 전체가 죽는다', () => {
    const boom = () => {
      throw new Error('boom')
    }
    const ok = vi.fn()
    subscribeSatellites(boom)
    subscribeSatellites(ok)
    expect(() => publishSatellites([])).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/satelliteOverlay.test.js`
Expected: FAIL — `Failed to resolve import "./satelliteOverlay.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/SpaceBackground/satelliteOverlay.js`:

```js
// 명령형 렌더 루프 → React 오버레이를 잇는 최소 스토어 (순수).
// three 씬은 React 바깥에서 돌기 때문에, 위성의 화면 좌표를 컴포넌트가
// 읽으려면 이런 중계가 필요하다. useLenis의 getLenis()와 같은 결의 패턴이다.
let current = []
const listeners = new Set()

export function publishSatellites(list) {
  current = list
  for (const fn of listeners) {
    // 구독자 하나가 던져도 렌더 루프는 계속 돌아야 한다 — 여기서 예외가
    // 새어 나가면 tick()이 끊겨 씬 전체가 정지한다.
    try {
      fn(list)
    } catch (err) {
      console.error('[satelliteOverlay] 구독자에서 예외:', err)
    }
  }
}

export function subscribeSatellites(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSatellites() {
  return current
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/SpaceBackground/satelliteOverlay.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 렌더 루프에서 publish한다**

`src/components/SpaceBackground/SpaceBackground.jsx`의 import 블록에 추가:

```jsx
import { projectToScreen } from './screenProject.js'
import { publishSatellites } from './satelliteOverlay.js'
```

`useEffect` 안, `tick` 정의보다 **위쪽**(예: `let progressSmooth = ...` 근처)에 재사용 객체와 상태를 만든다:

```jsx
    // 위성 오버레이용 뷰프로젝션 행렬. 매 프레임 새로 만들면 렌더 루프 안에서
    // 할당이 쌓이므로 하나를 재사용한다.
    const satViewProjection = new THREE.Matrix4()
    const satWorld = new THREE.Vector3()
    // 직전에 publish한 게 빈 목록이었는지 — 정거장을 벗어난 뒤 빈 목록을
    // 매 프레임 다시 쏘지 않기 위한 가드.
    let satPublishedEmpty = true
```

그리고 `tick` 안의 스테이지 분기, `evanSystem.update(t, reducedMotion ? 0 : t, camera.position)` 줄 **바로 다음**에 추가한다:

```jsx
        // --- 프로젝트 위성 오버레이: projects 정거장(인덱스 3) 근처에서만
        // 화면 좌표를 흘려보낸다. 멀리 있을 때도 계산하면 매 프레임 헛일이고,
        // 화면 구석에 눌리지 않는 버튼이 떠 있게 된다.
        const nearProjects = Math.abs(progressSmooth - 3) < 0.6
        if (nearProjects) {
          camera.updateMatrixWorld()
          satViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
          publishSatellites(
            evanSystem.satellites.map((s) => {
              s.object.getWorldPosition(satWorld)
              const p = projectToScreen(satWorld, satViewProjection, window.innerWidth, window.innerHeight)
              return { slug: s.slug, title: s.title, x: p.x, y: p.y, visible: p.visible }
            }),
          )
          satPublishedEmpty = false
        } else if (!satPublishedEmpty) {
          publishSatellites([])
          satPublishedEmpty = true
        }
```

정거장을 벗어나 스테이지가 꺼질 때도 버튼이 남지 않도록, `else if (evanSystem) evanSystem.group.visible = false` 가지에도 같은 정리를 넣는다:

```jsx
      else if (evanSystem) {
        evanSystem.group.visible = false
        if (!satPublishedEmpty) {
          publishSatellites([])
          satPublishedEmpty = true
        }
      }
```

- [ ] **Step 6: 빌드·테스트·린트를 확인한다**

Run: `npm test`
Expected: 전부 통과

Run: `npm run build`
Expected: 정상 종료

Run: `npx eslint src/components/SpaceBackground/satelliteOverlay.js src/components/SpaceBackground/SpaceBackground.jsx`
Expected: 오류 0건

- [ ] **Step 7: 커밋**

```bash
git add src/components/SpaceBackground/satelliteOverlay.js \
        src/components/SpaceBackground/satelliteOverlay.test.js \
        src/components/SpaceBackground/SpaceBackground.jsx
git commit -m "feat(satellites): publish satellite screen positions from the render loop"
```

---

### Task 4: 위성 버튼 오버레이

**Files:**
- Create: `src/components/ProjectSatellites/ProjectSatellites.jsx`, `src/components/ProjectSatellites/ProjectSatellites.css`, `e2e/project-satellites.spec.js`
- Modify: `src/App.jsx`, `src/i18n/translations.js`, `src/i18n/translations.test.js`

**Interfaces:**
- Consumes: Task 3의 `subscribeSatellites(fn) → unsubscribe`와 `getSatellites()`; `src/components/LabTransition/LabTransition.jsx`의 default export(props `{ origin, onNavigate, onDone }`); `src/context/LangContext.jsx`의 `useLang()`.
- Produces: default export `ProjectSatellites` (props 없음). DOM 계약 — 루트 `div.project-satellites`, 버튼 `button.satellite-btn`(접근성 이름은 `t.satellites.open`에 프로젝트 제목을 끼운 문자열).

- [ ] **Step 1: i18n 문구를 넣는다**

`src/i18n/translations.js`의 각 로케일 객체에서 `nav: { ... }` 블록 **바로 다음 줄**에 추가한다. 파일 안에 `nav:`가 네 번 나오며 전부에 넣는다. `{title}`은 컴포넌트가 프로젝트 제목으로 치환한다.

`en`:
```js
    satellites: { label: 'Project satellites', open: 'Open project {title}' },
```
`ko`:
```js
    satellites: { label: '프로젝트 위성', open: '{title} 프로젝트 열기' },
```
`ja`:
```js
    satellites: { label: 'プロジェクト衛星', open: '{title} プロジェクトを開く' },
```
`zh`:
```js
    satellites: { label: '项目卫星', open: '打开项目 {title}' },
```

- [ ] **Step 2: 컴포넌트를 쓴다**

`src/components/ProjectSatellites/ProjectSatellites.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import { subscribeSatellites, getSatellites } from '../SpaceBackground/satelliteOverlay.js'
import LabTransition from '../LabTransition/LabTransition.jsx'
import './ProjectSatellites.css'

export default function ProjectSatellites() {
  const { t } = useLang()
  const navigate = useNavigate()
  // 어떤 위성이 화면에 있는지(= 버튼을 몇 개, 어떤 이름으로 그릴지)만 React
  // 상태로 두고, 좌표는 상태에 넣지 않는다 — 매 프레임 setState하면 60fps로
  // 리렌더가 돈다. slug와 title을 함께 담는 이유: 렌더 중에 getSatellites()를
  // 읽으면 구독 없이 외부 가변 상태를 읽는 셈이라 동시성 모드에서 찢어질 수
  // 있다. 렌더에 필요한 값은 전부 상태 안에 있어야 한다.
  const [shown, setShown] = useState([])
  const [pending, setPending] = useState(null)
  const nodesRef = useRef(new Map())

  useEffect(() => {
    const apply = (list) => {
      const nextVisible = list.filter((s) => s.visible)
      // 목록의 구성(slug 또는 제목)이 바뀔 때만 리렌더한다.
      setShown((prev) => {
        const same =
          prev.length === nextVisible.length &&
          prev.every((p, i) => p.slug === nextVisible[i].slug && p.title === nextVisible[i].title)
        return same ? prev : nextVisible.map((s) => ({ slug: s.slug, title: s.title }))
      })
      // 좌표는 DOM에 직접 쓴다 — React를 거치지 않아 프레임 비용이 없다.
      for (const s of nextVisible) {
        const el = nodesRef.current.get(s.slug)
        if (el) el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`
      }
    }
    apply(getSatellites())
    return subscribeSatellites(apply)
  }, [])

  const open = (slug) => {
    // 이미 전환 중이면 두 번째 클릭은 무시한다 — 두 전환이 겹치면 라우트가
    // 두 번 바뀐다.
    if (pending) return
    setPending(slug)
  }

  return (
    <>
      <div className="project-satellites" aria-label={t.satellites.label} role="group">
        {shown.map(({ slug, title }) => (
          <button
            key={slug}
            type="button"
            ref={(el) => {
              if (el) nodesRef.current.set(slug, el)
              else nodesRef.current.delete(slug)
            }}
            className="satellite-btn"
            onClick={() => open(slug)}
          >
            <span className="satellite-btn-ring" aria-hidden="true" />
            <span className="satellite-btn-label">{t.satellites.open.replace('{title}', title)}</span>
            <span className="satellite-btn-name" aria-hidden="true">{title}</span>
          </button>
        ))}
      </div>
      {pending && (
        // origin은 LabTransition이 시각적으로 쓰지 않는다 — 확대 기준은
        // window.scrollY에서 직접 계산한다(LabTransition.jsx의 주석 참조).
        // Navbar와의 계약 때문에 시그니처에만 남아 있어 null로 넘겨도 안전하다.
        <LabTransition
          origin={null}
          onNavigate={() => navigate(`/projects/${pending}`)}
          onDone={() => setPending(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: 스타일을 쓴다**

`src/components/ProjectSatellites/ProjectSatellites.css`:

```css
/* 위성 버튼 오버레이: 캔버스 위에 떠 있지만 컨테이너는 포인터를 먹지 않는다
   — 버튼만 먹어야 뒤의 도킹 패널 링크가 계속 눌린다. 네비바(z 100)보다
   아래, 미니맵(z 50)과 같은 층에 둔다. */
.project-satellites {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}

.satellite-btn {
  position: absolute;
  top: 0;
  left: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 위성 자체는 3D로 이미 그려져 있다 — 오버레이는 "누를 수 있다"는 것만
   알리는 얇은 링이어야 한다. 채우면 위성을 가린다. */
.satellite-btn-ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.32);
  transition: border-color 0.18s, transform 0.18s;
}

.satellite-btn:hover .satellite-btn-ring,
.satellite-btn:focus-visible .satellite-btn-ring {
  border-color: rgba(255, 255, 255, 0.85);
  transform: scale(1.12);
}

.satellite-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

/* 이름표: 평소엔 숨고 호버·포커스에서 링 아래에 뜬다. */
.satellite-btn-name {
  position: absolute;
  top: calc(100% - 2px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-h);
  text-shadow: var(--legibility-shadow);
  opacity: 0;
  transition: opacity 0.18s;
  pointer-events: none;
}

.satellite-btn:hover .satellite-btn-name,
.satellite-btn:focus-visible .satellite-btn-name {
  opacity: 1;
}

/* 접근성 이름 전용 — 화면에는 자리를 차지하지 않는다. */
.satellite-btn-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .satellite-btn-ring,
  .satellite-btn-name {
    transition: none;
  }
}
```

- [ ] **Step 4: App.jsx에 연결한다**

`src/App.jsx`의 import 블록에서 `import Minimap from './components/Minimap/Minimap'` 바로 아래에 추가:

```jsx
import ProjectSatellites from './components/ProjectSatellites/ProjectSatellites'
```

그리고 `AppContent`의 return 안, `{isMainPage && isDesktop && <Minimap />}` 줄 **바로 다음**에 추가:

```jsx
        {isMainPage && isDesktop && <ProjectSatellites />}
```

- [ ] **Step 5: i18n 파리티 테스트를 추가한다**

`src/i18n/translations.test.js` 맨 끝에 추가한다 (`LOCALES`와 `translations`는 파일 상단에 이미 있다):

```js
describe('Phase 6a 위성 문구', () => {
  for (const locale of LOCALES) {
    it(`${locale}에 위성 문구가 모두 있다`, () => {
      const s = translations[locale].satellites
      expect(typeof s.label).toBe('string')
      expect(s.label.length).toBeGreaterThan(0)
      expect(typeof s.open).toBe('string')
      // {title} 자리표시자가 없으면 버튼 이름에 프로젝트명이 안 들어간다.
      expect(s.open).toContain('{title}')
    })
  }

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const labels = LOCALES.map((l) => translations[l].satellites.label)
    expect(new Set(labels).size).toBe(LOCALES.length)
  })
})
```

- [ ] **Step 6: 테스트·빌드·린트를 확인한다**

Run: `npm test`
Expected: 전부 통과

Run: `npm run build`
Expected: 정상 종료

Run: `npx eslint src/components/ProjectSatellites/ProjectSatellites.jsx src/App.jsx`
Expected: 오류 0건

- [ ] **Step 7: e2e 스펙을 쓴다**

`e2e/project-satellites.spec.js`:

```js
import { test, expect } from '@playwright/test'
import { projects } from '../src/data/projects.js'

const FIRST = projects[0]

// 도착 시퀀스가 끝난 뒤 projects 정거장(인덱스 3)으로 이동해야 위성이 보인다.
async function goToProjects(page) {
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  // 레일 스무딩(0.08/frame)이 정거장에 정착할 시간을 준다.
  await page.waitForTimeout(2500)
}

test('projects 정거장에서 위성 버튼이 나타난다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
})

test('위성 버튼의 접근성 이름에 프로젝트 제목이 들어간다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(
    page.getByRole('button', { name: new RegExp(FIRST.title) }),
  ).toBeVisible({ timeout: 10000 })
})

test('홈 정거장에서는 위성 버튼이 없다 — 누를 수 없는 버튼이 떠 있으면 안 된다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(2500)
  await expect(page.locator('button.satellite-btn')).toHaveCount(0)
})

test('위성을 누르면 그 프로젝트 상세 페이지로 이동한다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await page.getByRole('button', { name: new RegExp(FIRST.title) }).click()
  await page.waitForURL(`**/projects/${FIRST.slug}`, { timeout: 15000 })
})

test('오버레이 컨테이너는 뒤의 콘텐츠 클릭을 막지 않는다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
  // 오버레이는 inset:0으로 화면 전체를 덮지만 pointer-events:none이어야 한다.
  // 위성 버튼에서 떨어진 지점의 hit-test가 오버레이 컨테이너에 걸리면 실패.
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(12, window.innerHeight - 12)
    return el?.closest('.project-satellites') ? 'blocked' : 'clear'
  })
  expect(hit).toBe('clear')
})
```

- [ ] **Step 8: e2e를 돌린다**

Run: `npx playwright test e2e/project-satellites.spec.js`
Expected: 5 passed

Playwright는 한 번에 하나만 돌린다 — 두 프로세스가 5173 포트를 공유해 서로의 서버를 내리면 `ERR_CONNECTION_REFUSED`가 무더기로 난다. 실패하면 단언을 느슨하게 고치지 말고 실제 실패 원인을 먼저 읽을 것.

- [ ] **Step 9: 커밋**

```bash
git add src/components/ProjectSatellites/ProjectSatellites.jsx \
        src/components/ProjectSatellites/ProjectSatellites.css \
        src/App.jsx src/i18n/translations.js src/i18n/translations.test.js \
        e2e/project-satellites.spec.js
git commit -m "feat(satellites): clickable project satellites with warp transition"
```

---

## 컨트롤러 확인 사항 (구현자에게 넘기지 않는 것)

- **최종 시각 QA는 컨트롤러가 직접 한다.** projects 정거장에서 위성 링이 위성 위에 정확히 얹히는지(투영 오차), 호버 이름표가 읽히는지, 검은 우주 톤을 해치지 않는지 스크린샷으로 확인한다.
- **`.project-satellites`가 `inset: 0`으로 화면 전체를 덮는다.** `pointer-events: none`이 컨테이너에 확실히 걸려 있어야 도킹 패널·미니맵·네비바가 계속 눌린다. Task 4의 마지막 e2e가 이걸 지키지만, 미니맵(좌하단)과 겹치는 지점도 눈으로 확인한다.
- **스펙 문구와의 차이를 기록해 둔다.** §3.5는 "선택 시 카메라가 위성으로 다가가고 상세 페이지로 연결"이라고 쓰여 있는데, 이 플랜은 카메라를 위성 쪽으로 실제로 이동시키는 대신 Lab 이동에 쓰이는 워프 부스트 전환(`LabTransition`)을 재생한다. 가속감으로 "다가간다"를 읽히게 하면서 이미 검증된 전환 코드를 그대로 쓰기 위한 선택이다. 위성으로의 실제 카메라 접근이 필요하면 별도 후속 작업으로 다룬다 — 레일이 카메라를 소유하고 있어(Phase 1) 그 소유권을 일시적으로 뺏는 설계가 따로 필요하다.
