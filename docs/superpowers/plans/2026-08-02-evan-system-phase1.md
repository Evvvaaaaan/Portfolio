# Evan System Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 페이지 데스크톱 경험을 "슬라이드 줌 전환"에서 "3D 항성계를 항행하는 카메라 레일 + 섹션 HTML 도킹"으로 교체한다 (스펙 Phase 1).

**Architecture:** 기존 SpaceBackground(순수 three.js 명령형, 단일 rAF 루프)를 확장해 `stageEnabled`일 때 항성계(태양+행성 4+프로젝트 위성)를 씬에 추가하고, 스크롤 진행도를 Catmull-Rom 카메라 레일 포즈로 매핑한다. 순수 로직(월드 좌표, 레일 보간, 도킹 스타일 계산)은 별도 모듈 + vitest, three.js 통합은 e2e 스모크 + 수동 검증. MainPage의 슬라이드 zoom/blur 로직은 도킹 페이드로 대체하되 스냅·해시 내비는 유지.

**Tech Stack:** three.js 0.184 (명령형 — R3F 사용 금지, 코드베이스 패턴), vitest, Playwright, Lenis(기존 그대로).

## Global Constraints

- **검은 우주 + 떠다니는 별 룩 유지**: SpaceBackground의 별 필드 생성 코드(STARS 6500, 색·크기·텍스처)는 수정 금지.
- **R3F/drei 도입 금지**: 코드베이스 전체가 순수 three.js 명령형 패턴.
- **새 npm 의존성 추가 금지**.
- **기존 기능 무손실**: 4개 모드(Terminal/Speedrun/Destruction/Inspect), i18n 4개 언어, 해시 내비(#about 등), 도착 시퀀스(arrivalSequence 계약 — Hero가 ARRIVAL_DONE_EVENT 대기), Lab 워프 부스트(WARP_BOOST_EVENT).
- **모바일은 이번 Phase에서 변경 없음**: 현행 세로 스크롤 유지. `stageEnabled`는 데스크톱(`min-width: 769px and min-height: 701px`)에서만 true.
- **저사양/모션 배려**: `prefers-reduced-motion`이면 카메라가 글라이드 없이 정거장 포즈로 스냅, 도킹은 페이드만.
- 주석은 기존 스타일대로 "왜"를 설명하는 한국어 주석. 커밋 메시지는 영어, 기존 컨벤션(`feat(scope): ...`).
- 모든 커밋 메시지 끝에: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
src/components/SpaceBackground/
  system.js            # [신규] 월드 레이아웃: 행성 정의, planetPosition (순수)
  system.test.js       # [신규]
  rail.js              # [신규] STATIONS + computeRailPose (순수, three 미의존)
  rail.test.js         # [신규]
  evanSystem.js        # [신규] createEvanSystem: three 메시 생성/업데이트/해제
  evanSystem.test.js   # [신규]
  SpaceBackground.jsx  # [수정] stageEnabled prop, 스테이지 렌더 분기
src/
  App.jsx              # [수정] stageEnabled 전달, MainPage 도킹 전환
  index.css            # [수정] .scroll-slide--dock 레이아웃 추가
  components/dockLayout.js       # [신규] computeDockStyle (순수)
  components/dockLayout.test.js  # [신규]
e2e/
  evan-system.spec.js  # [신규] 스테이지 스모크
```

---

### Task 0: 베이스라인 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 기존 테스트/린트/빌드 실행**

```bash
cd /Users/evan/Desktop/02_project_dev/dev/evan-portfolio
npm test 2>&1 | tail -5
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 세 명령 모두 성공(테스트 0 failures, lint clean, build 완료). 실패가 있으면 **작업 중단하고 보고** — 이후 태스크의 실패가 기존 문제인지 새 문제인지 구분하는 기준선이다.

---

### Task 1: 월드 레이아웃 모듈 `system.js`

**Files:**
- Create: `src/components/SpaceBackground/system.js`
- Test: `src/components/SpaceBackground/system.test.js`

**Interfaces:**
- Produces: `PLANETS: Array<{id, color, radius, orbitRadius, azimuthDeg, ring?}>`, `SUN_RADIUS: number`, `planetPosition(planet) → [x, y, z]` (XZ 평면, y=0)
- Consumes: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/system.test.js
import { describe, it, expect } from 'vitest'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'

describe('system 월드 레이아웃', () => {
  it('섹션 행성 4개가 about→contact 순서로 정의된다', () => {
    expect(PLANETS.map((p) => p.id)).toEqual(['about', 'skills', 'projects', 'contact'])
  })

  it('궤도 반지름은 순서대로 단조 증가한다 (카메라 레일이 안쪽→바깥쪽 항행)', () => {
    const radii = PLANETS.map((p) => p.orbitRadius)
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1])
  })

  it('planetPosition은 XZ 평면 위 궤도 반지름 거리의 결정적 좌표를 준다', () => {
    for (const p of PLANETS) {
      const [x, y, z] = planetPosition(p)
      expect(y).toBe(0)
      expect(Math.hypot(x, z)).toBeCloseTo(p.orbitRadius, 6)
      // 결정적: 같은 입력 → 같은 출력
      expect(planetPosition(p)).toEqual([x, y, z])
    }
  })

  it('태양 반지름은 가장 안쪽 궤도보다 충분히 작다', () => {
    expect(SUN_RADIUS * 2).toBeLessThan(PLANETS[0].orbitRadius)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/system.test.js`
Expected: FAIL — "Failed to load ... system.js" (모듈 없음)

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/system.js
// Evan System 월드 레이아웃 (순수 데이터 — three 미의존, 단위 테스트 대상).
// 행성은 XZ 평면 궤도 위 고정 방위각에 놓인다. 공전시키지 않는 이유:
// 카메라 레일 정거장이 행성 위치를 참조하므로, 움직이면 스크롤을 멈춘
// 방문자의 프레이밍이 흘러가 버린다. 생동감은 자전·위성 공전이 담당한다.
export const SUN_RADIUS = 42

export const PLANETS = [
  // color는 각 섹션의 시각 정체성 — about 블루는 사이트 기본 액센트 계열,
  // projects 앰버는 프로젝트 카드 accent들의 중간톤.
  { id: 'about',    color: 0x6db5ff, radius: 15, orbitRadius: 150, azimuthDeg: 205 },
  { id: 'skills',   color: 0x34d399, radius: 19, orbitRadius: 235, azimuthDeg: 330, ring: true },
  { id: 'projects', color: 0xf59e0b, radius: 17, orbitRadius: 330, azimuthDeg: 75 },
  { id: 'contact',  color: 0xf472b6, radius: 13, orbitRadius: 425, azimuthDeg: 245 },
]

export function planetPosition(planet) {
  const a = (planet.azimuthDeg * Math.PI) / 180
  return [Math.cos(a) * planet.orbitRadius, 0, Math.sin(a) * planet.orbitRadius]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/system.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/system.js src/components/SpaceBackground/system.test.js
git commit -m "feat(space): Evan System world layout — planets on fixed orbital azimuths

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 카메라 레일 `rail.js`

**Files:**
- Create: `src/components/SpaceBackground/rail.js`
- Test: `src/components/SpaceBackground/rail.test.js`

**Interfaces:**
- Consumes: `PLANETS`, `planetPosition` (Task 1)
- Produces: `STATIONS: Array<{id, position:[x,y,z], target:[x,y,z]}>` (길이 6: home, about, skills, projects, contact, footer), `computeRailPose(progress: number, reduced?: boolean) → {position:[x,y,z], target:[x,y,z]}`
  - `progress`는 `scrollY / innerHeight` (0=home … 5=footer). 범위 밖은 클램프.
  - `reduced=true`면 가장 가까운 정거장 포즈로 스냅(보간 없음).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/SpaceBackground/rail.test.js
import { describe, it, expect } from 'vitest'
import { STATIONS, computeRailPose } from './rail.js'
import { PLANETS, planetPosition } from './system.js'

describe('카메라 레일', () => {
  it('정거장은 메인 페이지 슬라이드 6개와 1:1 대응한다', () => {
    expect(STATIONS.map((s) => s.id)).toEqual(['home', 'about', 'skills', 'projects', 'contact', 'footer'])
  })

  it('정수 progress에서는 해당 정거장 포즈를 정확히 돌려준다', () => {
    STATIONS.forEach((st, i) => {
      const pose = computeRailPose(i)
      expect(pose.position).toEqual(st.position)
      expect(pose.target).toEqual(st.target)
    })
  })

  it('행성 정거장의 target은 그 행성 위치다', () => {
    for (const p of PLANETS) {
      const st = STATIONS.find((s) => s.id === p.id)
      expect(st.target).toEqual(planetPosition(p))
    }
  })

  it('행성 정거장 카메라는 행성에서 적당한 거리에 있다 (너무 붙지도 멀지도 않게)', () => {
    for (const p of PLANETS) {
      const st = STATIONS.find((s) => s.id === p.id)
      const d = Math.hypot(
        st.position[0] - st.target[0],
        st.position[1] - st.target[1],
        st.position[2] - st.target[2],
      )
      expect(d).toBeGreaterThan(p.radius * 3)
      expect(d).toBeLessThan(p.radius * 12)
    }
  })

  it('중간 progress에서 유한한 보간 포즈를 준다', () => {
    for (let p = 0; p <= 5; p += 0.13) {
      const pose = computeRailPose(p)
      for (const v of [...pose.position, ...pose.target]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('범위 밖 progress는 클램프된다', () => {
    expect(computeRailPose(-3)).toEqual(computeRailPose(0))
    expect(computeRailPose(99)).toEqual(computeRailPose(5))
  })

  it('reduced 모드는 가장 가까운 정거장으로 스냅한다', () => {
    expect(computeRailPose(1.4, true)).toEqual(computeRailPose(1))
    expect(computeRailPose(1.6, true)).toEqual(computeRailPose(2))
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/rail.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/rail.js
// 스크롤 진행도(0~5) → 카메라 포즈. 순수 모듈 (three 미의존).
// 위치는 Catmull-Rom으로 부드럽게 잇고, target(시선)은 정거장 사이를
// smoothstep 선형 보간한다 — 시선까지 스플라인을 태우면 중간에 아무것도
// 없는 허공을 훑는 구간이 생겨 멀미를 유발했다.
import { PLANETS, planetPosition } from './system.js'

// 행성 정거장: 카메라를 행성의 "태양 반대쪽 + 옆" 오프셋에 두어
// 행성 뒤로 태양·안쪽 궤도가 배경으로 걸리게 한다 (깊이감).
// 높이(y)를 조금 주어 궤도면을 비스듬히 내려다본다.
function planetStation(id, dist, height) {
  const p = PLANETS.find((pl) => pl.id === id)
  const [x, , z] = planetPosition(p)
  const len = Math.hypot(x, z) || 1
  const ox = x / len
  const oz = z / len
  // XZ 평면에서 바깥 방향에 수직인 접선 방향 — 카메라를 옆으로 틀어
  // 행성이 화면 정중앙이 아니라 살짝 왼쪽에 오게 한다 (도킹 패널 자리).
  const tx = -oz
  const tz = ox
  return {
    id,
    position: [
      x + ox * dist + tx * dist * 0.55,
      height,
      z + oz * dist + tz * dist * 0.55,
    ],
    target: [x, 0, z],
  }
}

export const STATIONS = [
  { id: 'home', position: [0, 80, 430], target: [0, 0, 0] },
  planetStation('about', 90, 28),
  planetStation('skills', 110, 34),
  planetStation('projects', 105, 30),
  planetStation('contact', 85, 26),
  // footer: 높이 올려 전체 시스템 조망 — "여정의 끝, 지도 한눈에".
  { id: 'footer', position: [0, 300, 560], target: [0, 0, 0] },
]

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p2 - 3 * p2 + p3 + 2 * p2 - p0) * t3)
  )
}

export function computeRailPose(progress, reduced = false) {
  const n = STATIONS.length
  const p = Math.min(Math.max(progress, 0), n - 1)
  if (reduced) {
    const s = STATIONS[Math.round(p)]
    return { position: [...s.position], target: [...s.target] }
  }
  const i = Math.min(Math.floor(p), n - 2)
  const t = p - i
  const at = (k) => STATIONS[Math.min(Math.max(k, 0), n - 1)]
  const position = [0, 1, 2].map((axis) =>
    catmullRom(
      at(i - 1).position[axis],
      at(i).position[axis],
      at(i + 1).position[axis],
      at(i + 2).position[axis],
      t,
    ),
  )
  const s = t * t * (3 - 2 * t)
  const target = [0, 1, 2].map(
    (axis) => at(i).target[axis] + (at(i + 1).target[axis] - at(i).target[axis]) * s,
  )
  return { position, target }
}
```

**주의:** 위 `catmullRom`의 t3 계수가 수식 전개 실수처럼 보인다면 맞다 — 구현 시 표준 공식을 그대로 쓸 것:

```js
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}
```

정수 t=0에서 p1, t=1에서 p2를 반환하는지가 테스트로 보장된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/rail.test.js`
Expected: PASS (7 tests). t=1에서 `catmullRom`이 정확히 p2를 반환해야 "정수 progress = 정거장 포즈" 테스트가 통과한다. 부동소수 오차로 `toEqual`이 실패하면 구현이 틀린 것이다(표준 Catmull-Rom은 끝점에서 대수적으로 정확).

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/rail.js src/components/SpaceBackground/rail.test.js
git commit -m "feat(space): scroll-driven camera rail with Catmull-Rom station interpolation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 항성계 메시 `evanSystem.js`

**Files:**
- Create: `src/components/SpaceBackground/evanSystem.js`
- Test: `src/components/SpaceBackground/evanSystem.test.js`

**Interfaces:**
- Consumes: `PLANETS`, `SUN_RADIUS`, `planetPosition` (Task 1)
- Produces: `createEvanSystem({ satelliteColors }) → { group: THREE.Group, update(elapsedSeconds: number): void, dispose(): void }`
  - `group`을 씬에 add하면 태양(발광+글로우 스프라이트+PointLight), 행성 4, 궤도 라인 4, skills 링, projects 위성들이 배치된다.
  - `update(t)`: 행성 자전 + 위성 피벗 공전. 호출부(SpaceBackground tick)가 매 프레임 호출.
  - `dispose()`: 모든 geometry/material/texture 해제.
  - `satelliteColors`: 프로젝트 accent 색 배열 (예: `['#4f9cf9', '#f59e0b', '#c084fc']`).

- [ ] **Step 1: 실패하는 테스트 작성**

three.js의 Group/Mesh 생성은 WebGL 컨텍스트 없이 node에서 동작한다(렌더링만 불가). 구조·배치·해제를 검증한다.

```js
// src/components/SpaceBackground/evanSystem.test.js
import { describe, it, expect } from 'vitest'
import { createEvanSystem } from './evanSystem.js'
import { PLANETS, planetPosition } from './system.js'

const COLORS = ['#4f9cf9', '#f59e0b', '#c084fc']

describe('createEvanSystem', () => {
  it('행성 메시가 system.js 좌표에 정확히 놓인다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    for (const p of PLANETS) {
      const mesh = sys.group.getObjectByName(`planet-${p.id}`)
      expect(mesh).toBeTruthy()
      const [x, y, z] = planetPosition(p)
      expect(mesh.position.x).toBeCloseTo(x, 5)
      expect(mesh.position.y).toBeCloseTo(y, 5)
      expect(mesh.position.z).toBeCloseTo(z, 5)
    }
    sys.dispose()
  })

  it('태양·궤도 라인·위성 피벗이 존재한다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    expect(sys.group.getObjectByName('sun')).toBeTruthy()
    expect(sys.group.getObjectByName('satellites-pivot')).toBeTruthy()
    const orbits = sys.group.children.filter((c) => c.name.startsWith('orbit-'))
    expect(orbits.length).toBe(PLANETS.length)
    // 위성 수 = 전달한 색 수
    expect(sys.group.getObjectByName('satellites-pivot').children.length).toBe(COLORS.length)
    sys.dispose()
  })

  it('update는 위성 피벗을 공전시키고 행성을 자전시킨다', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    const pivot = sys.group.getObjectByName('satellites-pivot')
    const planet = sys.group.getObjectByName('planet-about')
    sys.update(1.0)
    const r1 = pivot.rotation.y
    const s1 = planet.rotation.y
    sys.update(2.0)
    expect(pivot.rotation.y).not.toBe(r1)
    expect(planet.rotation.y).not.toBe(s1)
    sys.dispose()
  })

  it('dispose 후 group이 비워진다 (GPU 리소스 누수 방지 계약)', () => {
    const sys = createEvanSystem({ satelliteColors: COLORS })
    sys.dispose()
    expect(sys.group.children.length).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/SpaceBackground/evanSystem.js
// Evan System 메시 계층 생성 (Phase 1: 표준 머티리얼 — GLSL 표면 셰이더는
// Phase 2 Blueprint 머티리얼과 함께 온다). WebGL 없이 node에서 생성
// 가능하도록 렌더러 참조를 받지 않는다.
import * as THREE from 'three'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'

// 태양 글로우: 별 텍스처와 같은 캔버스 라디얼 그라디언트 방식.
// (문서/테스트 환경에는 document가 있고, node vitest는 jsdom 환경.)
function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 214, 140, 0.9)')
  g.addColorStop(0.3, 'rgba(255, 180, 90, 0.35)')
  g.addColorStop(1, 'rgba(255, 160, 60, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function circlePoints(radius, segments = 128) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  return pts
}

export function createEvanSystem({ satelliteColors = [] } = {}) {
  const group = new THREE.Group()
  group.name = 'evan-system'
  const disposables = []

  // --- 조명: 태양이 유일한 주광, 앰비언트는 행성 야간면이 완전히
  // 죽지 않을 만큼만.
  const sunLight = new THREE.PointLight(0xffe2b0, 22000, 0, 1.8)
  group.add(sunLight)
  const ambient = new THREE.AmbientLight(0x1a2438, 1.2)
  group.add(ambient)

  // --- 태양
  const sunGeo = new THREE.SphereGeometry(SUN_RADIUS, 48, 48)
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  const sun = new THREE.Mesh(sunGeo, sunMat)
  sun.name = 'sun'
  group.add(sun)
  disposables.push(sunGeo, sunMat)

  const glowTex = createGlowTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(SUN_RADIUS * 6)
  glow.name = 'sun-glow'
  group.add(glow)
  disposables.push(glowTex, glowMat)

  // --- 궤도 라인: 어두운 청회색 — "검은 우주" 톤을 해치지 않는 밀도.
  const orbitMat = new THREE.LineBasicMaterial({
    color: 0x35507a,
    transparent: true,
    opacity: 0.35,
  })
  disposables.push(orbitMat)
  for (const p of PLANETS) {
    const geo = new THREE.BufferGeometry().setFromPoints(circlePoints(p.orbitRadius))
    const line = new THREE.Line(geo, orbitMat)
    line.name = `orbit-${p.id}`
    group.add(line)
    disposables.push(geo)
  }

  // --- 행성
  const planetMeshes = []
  for (const p of PLANETS) {
    const geo = new THREE.SphereGeometry(p.radius, 40, 40)
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: 0.65,
      metalness: 0.1,
      emissive: p.color,
      emissiveIntensity: 0.06,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = `planet-${p.id}`
    mesh.position.set(...planetPosition(p))
    group.add(mesh)
    planetMeshes.push(mesh)
    disposables.push(geo, mat)

    if (p.ring) {
      const ringGeo = new THREE.RingGeometry(p.radius * 1.5, p.radius * 2.1, 64)
      const ringMat = new THREE.MeshBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2 + 0.25
      ring.name = `ring-${p.id}`
      mesh.add(ring)
      disposables.push(ringGeo, ringMat)
    }
  }

  // --- 프로젝트 위성: projects 행성 주위를 피벗 그룹째 공전.
  const projectsPlanet = group.getObjectByName('planet-projects')
  const pivot = new THREE.Group()
  pivot.name = 'satellites-pivot'
  projectsPlanet.add(pivot)
  satelliteColors.forEach((hex, i) => {
    const geo = new THREE.SphereGeometry(3.5, 20, 20)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.4,
      roughness: 0.5,
    })
    const sat = new THREE.Mesh(geo, mat)
    const a = (i / satelliteColors.length) * Math.PI * 2
    const r = 17 * 1.9
    sat.position.set(Math.cos(a) * r, Math.sin(a * 2) * 4, Math.sin(a) * r)
    pivot.add(sat)
    disposables.push(geo, mat)
  })

  return {
    group,
    update(t) {
      for (const m of planetMeshes) m.rotation.y = t * 0.08
      pivot.rotation.y = t * 0.35
      // 태양 글로우 미세 맥동 — 정지화면처럼 보이지 않게.
      glow.scale.setScalar(SUN_RADIUS * (6 + Math.sin(t * 0.8) * 0.25))
    },
    dispose() {
      group.clear()
      for (const d of disposables) d.dispose()
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/SpaceBackground/evanSystem.test.js`
Expected: PASS (4 tests). vitest 환경이 jsdom이 아니어서 `document`가 없으면(`vitest.config.js` 확인) `createGlowTexture`에 `if (typeof document === 'undefined') return null` 가드를 넣고 glow 스프라이트 생성을 건너뛰도록 수정하되, 테스트의 존재 단언은 `sun`/`satellites-pivot`만 유지한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/evanSystem.js src/components/SpaceBackground/evanSystem.test.js
git commit -m "feat(space): Evan System mesh hierarchy — sun, planets, orbits, project satellites

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: SpaceBackground 스테이지 통합 + App 배선

**Files:**
- Modify: `src/components/SpaceBackground/SpaceBackground.jsx`
- Modify: `src/App.jsx:304` (SpaceBackground 사용부)

**Interfaces:**
- Consumes: `createEvanSystem` (Task 3), `computeRailPose` (Task 2), `projects` (`src/data/projects.js` — accent 색)
- Produces: `<SpaceBackground warpEnabled stageEnabled />` — `stageEnabled=true`면 항성계가 렌더되고 카메라가 레일을 따른다. false면 기존 동작과 완전히 동일.

- [ ] **Step 1: SpaceBackground.jsx 수정**

임포트 추가:

```js
import { createEvanSystem } from './evanSystem.js'
import { computeRailPose } from './rail.js'
import { projects } from '../../data/projects.js'
```

props와 ref (warpEnabled와 같은 패턴):

```js
export default function SpaceBackground({ warpEnabled = false, stageEnabled = false }) {
  const ref = useRef(null)
  const warpEnabledRef = useRef(warpEnabled)
  const stageEnabledRef = useRef(stageEnabled)

  useEffect(() => {
    warpEnabledRef.current = warpEnabled
  }, [warpEnabled])

  useEffect(() => {
    stageEnabledRef.current = stageEnabled
  }, [stageEnabled])
```

메인 useEffect 안, renderer 생성을 try/catch로 감싼다 (스펙 5.4: WebGL 불가 시 2D 폴백 — 지금은 생성 실패가 React 트리를 죽인다):

```js
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      // WebGL 사용 불가 — 배경 없이 DOM 콘텐츠만으로 동작한다 (스펙 5.4).
      // HardwareAccelNotice가 별도로 사용자에게 안내한다.
      return
    }
```

별 필드 생성 코드 뒤에 (수정 금지 구역 이후), 항성계를 게으르게 생성:

```js
    // Evan System: 스테이지가 켜질 때 1회 생성. SpaceBackground는 라우트가
    // 바뀌어도 언마운트되지 않으므로 메인 재방문 시 재사용된다.
    let evanSystem = null
    const satelliteColors = projects.slice(0, 3).map((p) => p.accent)
    const ensureSystem = () => {
      if (!evanSystem) {
        evanSystem = createEvanSystem({ satelliteColors })
        scene.add(evanSystem.group)
      }
      evanSystem.group.visible = true
    }
```

tick 안의 카메라 구동 분기 — 기존 `zoomDriver` 블록(`// 1. Vortex rotation` 주석부터 `camera.updateProjectionMatrix()`까지)을 다음 구조로 바꾼다. **intensity 계산(도착 시퀀스/부스트/스크롤 워프)은 그대로 두고, 카메라 적용부만 분기한다:**

```js
      const stageOn = stageEnabledRef.current
      if (stageOn) ensureSystem()
      else if (evanSystem) evanSystem.group.visible = false

      if (stageOn && evanSystem) {
        // --- 스테이지 모드: 스크롤 진행도 → 레일 포즈.
        // 슬라이드덱이 섹션당 정확히 100vh이므로 진행도 = scrollY/vh.
        const progress = window.scrollY / window.innerHeight
        // 도착 시퀀스와 무관하게 레일이 카메라를 소유한다 — 시퀀스의
        // 워프감은 스트릭+포스트FX(intensity)가 담당한다.
        progressSmooth += (progress - progressSmooth) * (reducedMotion ? 1 : 0.08)
        const pose = computeRailPose(progressSmooth, reducedMotion)
        camera.position.set(pose.position[0], pose.position[1], pose.position[2])
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2])
        camera.fov = Math.min(150, 60 + Math.pow(intensitySmooth, 1.5) * 45)
        camera.updateProjectionMatrix()

        // 별은 카메라와 독립적으로 아주 느리게만 회전 (스크롤 소용돌이는
        // 카메라 이동으로 대체됨).
        starsPoints.rotation.set(
          Math.sin(t * 0.003) * 0.04,
          t * 0.005,
          0,
        )
        // 스트릭은 카메라를 감싸야 도착/부스트 워프가 화면에 보인다.
        streaks.object3d.position.copy(camera.position)
        streaks.object3d.rotation.copy(camera.rotation)
        streaks.update(intensitySmooth)

        evanSystem.update(t)
      } else {
        // --- 기존 워프/배경 모드 (변경 없음: 아래는 기존 코드 그대로)
        starsPoints.rotation.z = scrollPercentSmooth * 1.8
        starsPoints.rotation.y = t * 0.005 + scrollPercentSmooth * 0.15
        starsPoints.rotation.x = Math.sin(t * 0.003) * 0.04 + scrollPercentSmooth * 0.08
        streaks.object3d.position.set(0, 0, 0)
        streaks.object3d.rotation.copy(starsPoints.rotation)
        streaks.update(intensitySmooth)
        camera.position.z = 400 - Math.pow(zoomDriver, 1.2) * 360
        camera.position.x = 0
        camera.position.y = 0
        camera.lookAt(0, 0, 0)
        camera.fov = Math.min(150, 75 + Math.pow(zoomDriver, 1.5) * 45)
        camera.updateProjectionMatrix()
      }
```

`progressSmooth`는 tick 위에서 `let progressSmooth = window.scrollY / window.innerHeight` (첫 프레임 점프 방지 — 스크롤 복원 리로드 대응)로 초기화한다. `zoomDriver` 계산은 기존 위치에 유지한다.

cleanup에 추가:

```js
      evanSystem?.dispose()
```

- [ ] **Step 2: App.jsx에서 stageEnabled 전달**

`src/App.jsx:304`:

```jsx
        <SpaceBackground
          warpEnabled={isMainPage && isDesktop}
          stageEnabled={isMainPage && isDesktop}
        />
```

- [ ] **Step 3: 단위 테스트 전체 실행 (회귀 확인)**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 통과 (Task 0 베이스라인과 동일 수 이상).

- [ ] **Step 4: 개발 서버로 수동 검증**

Run: `npm run dev` (백그라운드), 브라우저에서 `http://localhost:5173` 열기.

체크리스트:
- 로드 시 도착 시퀀스(워프 감속) 후 항성계 조망(태양+행성 4+궤도 라인)이 보인다.
- 별 필드는 기존과 동일한 검은 우주 + 별 룩이다.
- 스크롤하면 카메라가 행성 사이를 활강한다. 5번 스크롤에 footer 조망까지 도달.
- 콘솔에 에러가 없다.
- `/gallery` 이동 시 항성계가 사라지고 기존 배경/워프 부스트가 정상 동작, 메인 복귀 시 항성계 복원.

- [ ] **Step 5: 커밋**

```bash
git add src/components/SpaceBackground/SpaceBackground.jsx src/App.jsx
git commit -m "feat(space): stage mode — camera rail flies the starfield through Evan System

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 도킹 스타일 계산 `dockLayout.js`

**Files:**
- Create: `src/components/dockLayout.js`
- Test: `src/components/dockLayout.test.js`

**Interfaces:**
- Consumes: 없음 (순수)
- Produces: `computeDockStyle(progress: number, idx: number, reduced?: boolean) → { visible: boolean, opacity?: number, translateY?: number, pointerEvents?: 'auto'|'none' }`
  - `progress = scrollY / innerHeight`, `idx` = 슬라이드 인덱스. `translateY`는 px.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/components/dockLayout.test.js
import { describe, it, expect } from 'vitest'
import { computeDockStyle } from './dockLayout.js'

describe('computeDockStyle', () => {
  it('정거장 정착(offset=0)에서 완전 표시 + 인터랙션 가능', () => {
    const s = computeDockStyle(2, 2)
    expect(s.visible).toBe(true)
    expect(s.opacity).toBe(1)
    expect(s.translateY).toBe(0)
    expect(s.pointerEvents).toBe('auto')
  })

  it('전환 중(offset=±0.4)에는 페이드 + 인터랙션 차단', () => {
    for (const p of [1.6, 2.4]) {
      const s = computeDockStyle(p, 2)
      expect(s.visible).toBe(true)
      expect(s.opacity).toBeGreaterThan(0)
      expect(s.opacity).toBeLessThan(1)
      expect(s.pointerEvents).toBe('none')
    }
  })

  it('멀어지면(|offset|>=0.6) 숨긴다 — 슬라이드 DOM 6개가 전부 그려지는 낭비 방지', () => {
    expect(computeDockStyle(0, 2).visible).toBe(false)
    expect(computeDockStyle(4, 2).visible).toBe(false)
  })

  it('translateY는 스크롤 반대 방향으로 드리프트한다 (지나가는 창밖 풍경감)', () => {
    expect(computeDockStyle(1.8, 2).translateY).toBeGreaterThan(0)
    expect(computeDockStyle(2.2, 2).translateY).toBeLessThan(0)
  })

  it('reduced 모드는 이동 없이 페이드만 한다', () => {
    expect(computeDockStyle(1.8, 2, true).translateY).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/dockLayout.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```js
// src/components/dockLayout.js
// 도킹 패널 표시 스타일 (순수). 기존 슬라이드덱의 scale-zoom/blur를
// 대체한다 — 전환의 "이동감"은 이제 3D 카메라가 담당하므로 DOM은
// 가볍게 페이드+드리프트만 한다.
const HIDE_AT = 0.6
const INTERACT_WITHIN = 0.25
const DRIFT_PX = 60

export function computeDockStyle(progress, idx, reduced = false) {
  const offset = progress - idx
  const abs = Math.abs(offset)
  if (abs >= HIDE_AT) return { visible: false }
  const fade = 1 - abs / HIDE_AT
  return {
    visible: true,
    // 페이드를 앞당겨(1.6배) 정착 구간에서는 확실한 opacity 1.
    opacity: Math.min(1, fade * 1.6),
    translateY: reduced ? 0 : -offset * DRIFT_PX,
    pointerEvents: abs < INTERACT_WITHIN ? 'auto' : 'none',
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/dockLayout.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/dockLayout.js src/components/dockLayout.test.js
git commit -m "feat(main): dock panel style computation replacing slide zoom math

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: MainPage 도킹 전환

**Files:**
- Modify: `src/App.jsx` — `MainPage`의 `handleScroll` (기존 89~268행 영역)
- Modify: `src/index.css` — 도킹 레이아웃 클래스 추가

**Interfaces:**
- Consumes: `computeDockStyle` (Task 5)
- Produces: 데스크톱 메인 페이지 슬라이드가 zoom/blur 대신 도킹 페이드로 전환. About/Skills/Contact는 우측 도킹, Hero/Projects/Footer는 중앙 유지.

- [ ] **Step 1: App.jsx 수정**

임포트 교체 — `computeTransitionIntensity` 임포트(6행)를 제거하고:

```js
import { computeDockStyle } from './components/dockLayout.js'
```

`handleScroll` 내부의 슬라이드 스타일 블록(기존 `const transitionBlur = ...`부터 `slides.forEach(...)` 끝까지)을 다음으로 교체한다. **스냅 로직(`clearTimeout(scrollTimeout)` 이하)은 그대로 유지:**

```js
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const handleScroll = () => {
      const progress = window.scrollY / window.innerHeight
      const slides = slidesRef.current

      slides.forEach((slide, idx) => {
        if (!slide) return
        const dock = computeDockStyle(progress, idx, reducedMotion)
        slide.style.display = dock.visible ? 'flex' : 'none'
        if (dock.visible) {
          slide.style.transform = `translateY(${dock.translateY}px)`
          slide.style.opacity = dock.opacity
          slide.style.filter = 'none'
          slide.style.pointerEvents = dock.pointerEvents
        }
      })
```

- [ ] **Step 2: 도킹 클래스 부여**

`MainPage`의 슬라이드 렌더 map에서 About(1)·Skills(2)·Contact(4) 인덱스에 도킹 클래스를 준다. Projects(3)는 카드 그리드가 넓어 중앙 유지, Hero(0)·Footer(5)도 중앙 유지:

```jsx
        {sections.map((sec, idx) => {
          const docked = idx === 1 || idx === 2 || idx === 4
          return (
            <div
              key={sec.id}
              ref={(el) => (slidesRef.current[idx] = el)}
              className={docked ? 'scroll-slide scroll-slide--dock' : 'scroll-slide'}
              style={{ /* 기존 인라인 스타일 유지 */ }}
            >
              <div className="slide-content" style={{ width: '100%', pointerEvents: 'auto' }}>
                {sec.component}
              </div>
            </div>
          )
        })}
```

- [ ] **Step 3: index.css에 도킹 레이아웃 추가**

```css
/* Evan System 도킹 패널: 행성이 화면 왼쪽에 걸리도록 카메라를 틀었으므로
   (rail.js의 접선 오프셋) 콘텐츠는 오른쪽 절반에 도킹한다. */
@media (min-width: 769px) and (min-height: 701px) {
  .scroll-slide--dock .slide-content {
    max-width: 680px;
    margin-left: auto;
    margin-right: 4vw;
  }
}
```

- [ ] **Step 4: 단위 테스트 + 수동 검증**

Run: `npm test` → Expected: PASS 전체.

`npm run dev`로 수동 체크리스트:
- About/Skills/Contact 콘텐츠가 우측에 도킹되고, 왼쪽에 해당 행성이 보인다.
- 각 섹션 내부 레이아웃이 깨지지 않는다. **깨지는 섹션이 있으면 그 인덱스만 `docked` 목록에서 빼고 중앙 유지로 되돌린 뒤, 어떤 섹션을 왜 뺐는지 커밋 메시지에 남긴다.**
- Hero 타이핑, Projects 카드 호버/클릭, Contact 폼 입력이 정상.
- 스크롤 멈추면 정거장에 스냅되고 콘텐츠가 선명(opacity 1)해진다.
- `#about` 해시로 직접 진입 시 해당 정거장에서 시작한다.
- 모바일 뷰포트(개발자도구)에서는 기존 세로 스크롤 그대로다.

- [ ] **Step 5: 커밋**

```bash
git add src/App.jsx src/index.css
git commit -m "feat(main): dock section panels beside their planets, retire slide zoom

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: e2e 스모크

**Files:**
- Create: `e2e/evan-system.spec.js`

**Interfaces:**
- Consumes: Task 4·6의 동작 (콘솔 에러 없음, 도킹 pointer-events 계약)

- [ ] **Step 1: e2e 테스트 작성**

기존 e2e 패턴(한국어 제목, 콘솔 에러 수집)을 따른다:

```js
// e2e/evan-system.spec.js
import { test, expect } from '@playwright/test'

test('Evan System: 메인 로드 후 항성계 스테이지가 콘솔 에러 없이 뜬다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 15000 })
  // 배경 캔버스 존재 (스테이지 렌더 대상)
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('Evan System: 스크롤로 Projects 정거장에 도착하면 카드가 인터랙션 가능하다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 15000 })

  // 정거장 3 = projects. 스냅 로직이 정착시킬 때까지 기다린다.
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  await page.waitForFunction(
    () => Math.abs(window.scrollY - window.innerHeight * 3) < 2,
    { timeout: 5000 },
  )
  const projects = page.locator('#projects')
  await expect(projects).toBeVisible()
  // 도킹 정착 시 pointer-events가 auto여야 카드 클릭이 산다.
  const slide = page.locator('.scroll-slide').nth(3)
  await expect(slide).toHaveCSS('pointer-events', 'auto', { timeout: 5000 })
})

test('Evan System: 해시 진입(#contact)은 해당 정거장에서 시작한다', async ({ page }) => {
  await page.goto('/#contact', { waitUntil: 'commit' })
  await page.waitForFunction(
    () => Math.abs(window.scrollY - window.innerHeight * 4) < 2,
    { timeout: 10000 },
  )
})
```

- [ ] **Step 2: e2e 실행**

Run: `npx playwright test e2e/evan-system.spec.js`
Expected: PASS (3 tests). 실패 시 실패 출력 전체를 확인하고 원인(레이스인지 실제 회귀인지)을 규명한 뒤 수정 — 타임아웃 늘리기로 덮지 않는다.

- [ ] **Step 3: 커밋**

```bash
git add e2e/evan-system.spec.js
git commit -m "test(e2e): Evan System stage smoke — load, dock interaction, hash entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 전체 회귀 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증 스위트 실행**

```bash
npm test 2>&1 | tail -5
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -5
npx playwright test 2>&1 | tail -10
```

Expected: 전부 통과. e2e 중 기존 스펙(arrival, mode-menu, destruction, speedrun, terminal, inspect, warp-visuals, lab-warp)이 특히 중요 — 슬라이드 구조 변경의 회귀를 잡는 그물이다.

- [ ] **Step 2: 수동 회귀 체크리스트**

`npm run dev`에서:
- Mode 메뉴에서 Terminal/Speedrun/Destruction/Inspect 각각 진입·동작·이탈.
- 언어 전환(en/ko/ja/zh) 후 도킹 패널 콘텐츠 갱신.
- `/gallery` 진입 워프 부스트 → 링 갤러리 정상, 메인 복귀 정상.
- `/guestbook`, `/projects/:slug` 라우트 정상.
- reduced-motion (개발자도구 에뮬레이션): 카메라 스냅 + 페이드만.

- [ ] **Step 3: 발견된 문제 수정 또는 보고**

문제가 있으면 해당 태스크로 돌아가 수정 후 이 태스크를 재실행. 전부 통과하면 Phase 1 완료를 보고하고, 검증 출력 요약을 포함한다.

---

## Self-Review 결과

- **스펙 커버리지**: Phase 1 범위(항성계 씬 + 카메라 레일 + 섹션 도킹 + 기존 기능 무손실)는 Task 1-8이 커버. 스펙 5.4의 GPU 티어 프리셋은 Phase 1에서 기존 게이팅(isDesktop postfx, reduced-motion) 유지로 축소 — 본격 티어링은 셰이더가 늘어나는 Phase 2에서 함께 구현하는 것이 낭비가 없다. WebGL 불가 폴백은 Task 4 Step 1의 try/catch로 커버.
- **플레이스홀더 스캔**: 통과 — 모든 코드 스텝에 실제 코드 포함. Task 2의 catmullRom 오식 경고는 의도된 주의 표지.
- **타입 일관성**: `computeRailPose(progress, reduced)` (Task 2 정의 = Task 4 사용), `createEvanSystem({satelliteColors})` (Task 3 정의 = Task 4 사용), `computeDockStyle(progress, idx, reduced)` (Task 5 정의 = Task 6 사용) 일치 확인.
