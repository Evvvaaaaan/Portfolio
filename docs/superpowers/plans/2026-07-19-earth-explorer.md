# Earth Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 11th Lab experiment, `earth-explorer`, where visitors fly to 8
curated landmarks on a photorealistic 3D Earth (Google Photorealistic 3D
Tiles) and free-fly by drag/zoom, with a fully offline dot-matrix-globe
fallback when no API key is configured or tiles fail to load.

**Architecture:** A single lazy-loaded experiment component
(`src/experiments/EarthExplorer/`) follows the codebase's existing raw
three.js pattern (no React Three Fiber). Two rendering subsystems share one
scene/camera/renderer/starfield/landmark-UI shell: a **fallback dot-globe**
(always available, zero network dependency, built first) and **Google 3D
Tiles** (attempted only when a key is configured, degrades to fallback on
root-tileset failure). A shared pure-math module computes camera fly-to
frames independent of which coordinate system (unit sphere vs. real-world
WGS84 meters) is active.

**Tech Stack:** three.js 0.184 (already installed), `3d-tiles-renderer`
0.5.0 (installed this session — see Task 1), `three/addons/controls/OrbitControls.js`
(fallback mode), `GlobeControls` from `3d-tiles-renderer` (tiles mode),
vitest, Playwright.

## Global Constraints

- No React Three Fiber — raw three.js only, matching every existing
  experiment (`DeepSpace`, `SolarSystem`, `GuestbookGlobe`).
- Experiment must be lazy-loaded via `src/experiments/index.js`, following
  the existing `lazy(() => import(...))` pattern exactly.
- 8 landmarks (fixed set, confirmed in spec): Seoul Jamsil, Tokyo Shibuya,
  New York Manhattan, Paris Eiffel Tower, Dubai Burj Khalifa, San Francisco
  Golden Gate, Rio Christ the Redeemer, Sydney Opera House.
- API key: `import.meta.env.VITE_GOOGLE_TILES_KEY`. Never hardcode a key or
  a guessed Google asset URL anywhere in code.
- `prefers-reduced-motion: reduce` → landmark selection jumps instantly, no
  animated fly-to.
- Existing suites (76 unit / 24 e2e as of branch head) must stay green
  after every task. New pure-math gets vitest coverage; the new experiment
  gets a Playwright smoke test in fallback (keyless) mode, since CI has no
  Google API key.
- **Deviation from spec, decided during planning (documented here for
  transparency):** the spec said "NASA Blue Marble textured sphere" for the
  fallback globe. Instead, the fallback reuses the *existing* bundled
  land-mask asset (`src/assets/earth-land-mask.png`) and re-implements the
  small dot-sampling technique already proven in
  `src/pages/Guestbook/landDots.js`, rendered as a dot-matrix globe (same
  visual language as the Guestbook globe). Rationale: avoids introducing a
  new external texture asset and licensing/attribution question, reuses a
  tested technique, keeps the fallback visually consistent with the rest of
  the site. The Guestbook module itself is not imported (each experiment
  stays self-contained per existing convention) — the ~15-line sampling
  function is duplicated locally against this experiment's own coordinate
  helper.
- **Deviation from spec's cinematic wording:** "spiral descent" is
  implemented as a single smooth eased arc (climb → cruise → settle), not a
  literal multi-turn spiral. This keeps the flight math a small, testable
  pure function. Flagged here rather than silently simplified.
- Google attribution: only the **text** copyright string is rendered
  (`GoogleCloudAuthPlugin` returns it reliably from live tile responses).
  The plugin's optional `logoUrl` image-attribution feature is intentionally
  *not* wired up — that requires a real, currently-valid Google-hosted logo
  URL, which cannot be guessed or hardcoded here (URL fabrication is
  disallowed). This is called out as a manual follow-up in the final task,
  not silently dropped.

---

### Task 1: Dependency, landmark data, pure geo/flight-path math (TDD)

**Files:**
- Modify: `package.json`, `package-lock.json` (dependency already installed
  this session via `npm install 3d-tiles-renderer@0.5.0` — this task just
  commits it)
- Create: `src/experiments/EarthExplorer/landmarks.js`
- Create: `src/experiments/EarthExplorer/landmarks.test.js`
- Create: `src/experiments/EarthExplorer/sphereFrame.js`
- Create: `src/experiments/EarthExplorer/sphereFrame.test.js`
- Create: `src/experiments/EarthExplorer/flightPath.js`
- Create: `src/experiments/EarthExplorer/flightPath.test.js`

**Interfaces:**
- Produces: `latLonToDirection(latDeg, lonDeg, target?) -> THREE.Vector3`
  (unit vector, three.js Y-up frame)
- Produces: `slerpDirection(fromDir, toDir, t, target?) -> THREE.Vector3`
  (unit vector)
- Produces: `computeFlightFrame(fromDir, toDir, progress, radius, options?) ->
  { position: THREE.Vector3, lookAt: THREE.Vector3, up: THREE.Vector3 }`
- Produces: `LANDMARKS` — array of `{ id, name, lat, lon }`, length 8.
- Consumed by: Task 2 (fallback globe uses `latLonToDirection`), Task 3
  (landmark UI uses `LANDMARKS` + `computeFlightFrame`), Task 4 (tiles mode
  reuses `computeFlightFrame` with real-world radius + `slerpDirection`
  indirectly via the same function).

- [ ] **Step 1: Verify the dependency is already installed**

Run: `node -e "console.log(require('./node_modules/3d-tiles-renderer/package.json').version)"`
Expected: `0.5.0`

If this fails (dependency missing), run `npm install 3d-tiles-renderer@0.5.0`
first, then continue.

- [ ] **Step 2: Write the failing test for landmark data**

Create `src/experiments/EarthExplorer/landmarks.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { LANDMARKS } from './landmarks.js'

describe('LANDMARKS', () => {
  it('8개의 랜드마크를 담고 있다', () => {
    expect(LANDMARKS).toHaveLength(8)
  })

  it('id가 모두 고유하다', () => {
    const ids = LANDMARKS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 좌표가 유효 범위 안에 있다', () => {
    for (const { lat, lon } of LANDMARKS) {
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(lon).toBeGreaterThanOrEqual(-180)
      expect(lon).toBeLessThanOrEqual(180)
    }
  })

  it('name과 id가 모두 비어있지 않은 문자열이다', () => {
    for (const { id, name } of LANDMARKS) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/experiments/EarthExplorer/landmarks.test.js`
Expected: FAIL — `Failed to resolve import "./landmarks.js"`

- [ ] **Step 4: Implement landmark data**

Create `src/experiments/EarthExplorer/landmarks.js`:

```js
// 8개 고정 랜드마크 — 스펙 확정 목록. 좌표는 각 도시의 대표 랜드마크 근방.
export const LANDMARKS = [
  { id: 'seoul', name: '서울 잠실', lat: 37.5133, lon: 127.1028 },
  { id: 'tokyo', name: '도쿄 시부야', lat: 35.6595, lon: 139.7005 },
  { id: 'newyork', name: '뉴욕 맨해튼', lat: 40.7831, lon: -73.9712 },
  { id: 'paris', name: '파리 에펠탑', lat: 48.8584, lon: 2.2945 },
  { id: 'dubai', name: '두바이 부르즈 할리파', lat: 25.1972, lon: 55.2744 },
  { id: 'sanfrancisco', name: '샌프란시스코 금문교', lat: 37.8199, lon: -122.4783 },
  { id: 'rio', name: '리우 예수상', lat: -22.9519, lon: -43.2105 },
  { id: 'sydney', name: '시드니 오페라하우스', lat: -33.8568, lon: 151.2153 },
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/experiments/EarthExplorer/landmarks.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/experiments/EarthExplorer/landmarks.js src/experiments/EarthExplorer/landmarks.test.js
git commit -m "feat(earth-explorer): add 3d-tiles-renderer dep and landmark data"
```

- [ ] **Step 7: Write the failing test for the sphere-direction helper**

Create `src/experiments/EarthExplorer/sphereFrame.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { latLonToDirection } from './sphereFrame.js'

describe('latLonToDirection', () => {
  it('경도 0, 위도 0은 +x 축 방향이다', () => {
    const d = latLonToDirection(0, 0)
    expect(d.x).toBeCloseTo(1, 5)
    expect(d.y).toBeCloseTo(0, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('북극(위도 90)은 +y 축 방향이다', () => {
    const d = latLonToDirection(90, 0)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('항상 단위 벡터를 반환한다', () => {
    const d = latLonToDirection(37.5, 127)
    expect(d.length()).toBeCloseTo(1, 5)
  })

  it('target 인자에 결과를 채워 반환한다', () => {
    const target = { set() { return this }, normalize() { return this } }
    let sawSet = false
    target.set = function (x, y, z) { sawSet = true; this.x = x; this.y = y; this.z = z; return this }
    const result = latLonToDirection(10, 20, target)
    expect(sawSet).toBe(true)
    expect(result).toBe(target)
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run src/experiments/EarthExplorer/sphereFrame.test.js`
Expected: FAIL — `Failed to resolve import "./sphereFrame.js"`

- [ ] **Step 9: Implement the sphere-direction helper**

Create `src/experiments/EarthExplorer/sphereFrame.js`:

```js
import { Vector3 } from 'three'

const DEG = Math.PI / 180

// 위경도(도) → 단위구 위 3D 방향 벡터 (three.js Y-up). 폴백 지구본, 랜드마크
// 카메라 프레이밍에 쓰인다. 실제 Google 3D Tiles의 WGS84 좌표계와는 별개다 —
// 그쪽은 tiles.ellipsoid.getCartographicToPosition을 직접 쓴다 (Task 4).
export function latLonToDirection(latDeg, lonDeg, target = new Vector3()) {
  const phi = (90 - latDeg) * DEG
  const theta = (lonDeg + 180) * DEG
  return target
    .set(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    .normalize()
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run src/experiments/EarthExplorer/sphereFrame.test.js`
Expected: PASS (4 tests)

- [ ] **Step 11: Commit**

```bash
git add src/experiments/EarthExplorer/sphereFrame.js src/experiments/EarthExplorer/sphereFrame.test.js
git commit -m "feat(earth-explorer): add lat/lon to unit-sphere direction helper"
```

- [ ] **Step 12: Write the failing test for flight-path math**

Create `src/experiments/EarthExplorer/flightPath.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { slerpDirection, computeFlightFrame } from './flightPath.js'

describe('slerpDirection', () => {
  it('t=0이면 fromDir을 반환한다', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 0)
    expect(d.x).toBeCloseTo(1, 5)
    expect(d.y).toBeCloseTo(0, 5)
  })

  it('t=1이면 toDir을 반환한다', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 1)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
  })

  it('t=0.5이면 두 방향의 이등분 대권 위 점이다 (직교 벡터 기준)', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 0.5)
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5)
    expect(d.y).toBeCloseTo(Math.SQRT1_2, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('fromDir과 toDir이 같으면 그대로 반환한다 (0으로 나누기 없음)', () => {
    const from = new Vector3(0, 1, 0)
    const d = slerpDirection(from, from.clone(), 0.5)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })
})

describe('computeFlightFrame', () => {
  const from = new Vector3(1, 0, 0)
  const to = new Vector3(0, 1, 0)
  const radius = 10

  it('progress=0: 출발지 상공, 위치와 시선이 겹치지 않는다', () => {
    const { position, lookAt, up } = computeFlightFrame(from, to, 0, radius)
    expect(position.length()).toBeGreaterThan(radius)
    expect(lookAt.x).toBeCloseTo(radius, 4)
    expect(lookAt.y).toBeCloseTo(0, 4)
    expect(position.distanceTo(lookAt)).toBeGreaterThan(0.01)
    expect(up.length()).toBeCloseTo(1, 5)
  })

  it('progress=1: 목적지 상공에 도착한다', () => {
    const { lookAt } = computeFlightFrame(from, to, 1, radius)
    expect(lookAt.x).toBeCloseTo(0, 4)
    expect(lookAt.y).toBeCloseTo(radius, 4)
  })

  it('progress=0.5: 고도가 가장 높다 (climb peak)', () => {
    const start = computeFlightFrame(from, to, 0, radius)
    const mid = computeFlightFrame(from, to, 0.5, radius)
    const end = computeFlightFrame(from, to, 1, radius)
    expect(mid.position.length()).toBeGreaterThan(start.position.length())
    expect(mid.position.length()).toBeGreaterThan(end.position.length())
  })

  it('progress를 [0,1] 밖으로 줘도 클램프된다', () => {
    const under = computeFlightFrame(from, to, -0.5, radius)
    const over = computeFlightFrame(from, to, 1.5, radius)
    const atZero = computeFlightFrame(from, to, 0, radius)
    const atOne = computeFlightFrame(from, to, 1, radius)
    expect(under.position.distanceTo(atZero.position)).toBeCloseTo(0, 4)
    expect(over.position.distanceTo(atOne.position)).toBeCloseTo(0, 4)
  })
})
```

- [ ] **Step 13: Run test to verify it fails**

Run: `npx vitest run src/experiments/EarthExplorer/flightPath.test.js`
Expected: FAIL — `Failed to resolve import "./flightPath.js"`

- [ ] **Step 14: Implement flight-path math**

Create `src/experiments/EarthExplorer/flightPath.js`:

```js
import { Vector3 } from 'three'

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// 두 단위 방향 벡터 사이를 구면 선형보간(대권 경로)한다.
export function slerpDirection(fromDir, toDir, t, target = new Vector3()) {
  const dot = Math.min(1, Math.max(-1, fromDir.dot(toDir)))
  const omega = Math.acos(dot)
  if (omega < 1e-6) {
    return target.copy(fromDir).normalize()
  }
  const sinOmega = Math.sin(omega)
  const wFrom = Math.sin((1 - t) * omega) / sinOmega
  const wTo = Math.sin(t * omega) / sinOmega
  return target
    .set(
      fromDir.x * wFrom + toDir.x * wTo,
      fromDir.y * wFrom + toDir.y * wTo,
      fromDir.z * wFrom + toDir.z * wTo,
    )
    .normalize()
}

// 시네마틱 랜드마크 비행 프레임: 상승(altitude 험프) → 대권 순항 → 도착지
// 상공으로 하강(스펙의 "나선 하강"을 단일 완만한 곡선으로 단순화 — plan 문서
// 참고). radius는 단위구(폴백, radius=1)든 실제 WGS84 미터(타일 모드)든
// 그대로 대입해 쓸 수 있다 — 좌표계에 무관한 순수 함수.
export function computeFlightFrame(fromDir, toDir, progress, radius, options = {}) {
  const { altitudeFactor = 1.6, baseAltitudeFactor = 0.05 } = options
  const t = easeInOutCubic(clamp01(progress))
  const dir = slerpDirection(fromDir, toDir, t)
  const climb = Math.sin(Math.PI * t)
  const altitude = radius * (1 + baseAltitudeFactor + climb * altitudeFactor)
  const position = dir.clone().multiplyScalar(altitude)
  const lookAt = dir.clone().multiplyScalar(radius)
  const up = dir.clone()
  return { position, lookAt, up }
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `npx vitest run src/experiments/EarthExplorer/flightPath.test.js`
Expected: PASS (9 tests)

- [ ] **Step 16: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: all test files pass (baseline 13 files/76 tests + 3 new files/17 tests = 16 files/93 tests)

- [ ] **Step 17: Commit**

```bash
git add src/experiments/EarthExplorer/flightPath.js src/experiments/EarthExplorer/flightPath.test.js
git commit -m "feat(earth-explorer): add cinematic flight-path interpolation math"
```

---

### Task 2: Fallback dot-matrix globe, registered as the 11th Lab experiment

**Files:**
- Create: `src/experiments/EarthExplorer/landDots.js`
- Create: `src/experiments/EarthExplorer/EarthExplorer.jsx`
- Create: `src/experiments/EarthExplorer/EarthExplorer.css`
- Modify: `src/experiments/index.js` (add lazy import + registry entry)
- Modify: `e2e/lab-gallery.spec.js` (10 → 11 curated works, add `earth-explorer` id)

**Interfaces:**
- Consumes: `latLonToDirection` from `./sphereFrame.js` (Task 1)
- Produces: `loadLandDots(imageUrl, { radius, step, threshold }) -> Promise<Float32Array>`
  (consumed only within this file for now; Task 4 does not need it)
- Produces: default export `EarthExplorer()` React component — the shape
  Task 3 and Task 4 will extend in place.

- [ ] **Step 1: Implement the land-dot sampler**

Create `src/experiments/EarthExplorer/landDots.js`:

```js
import { latLonToDirection } from './sphereFrame.js'

// 등장방형(equirectangular) 마스크 이미지를 샘플링해 육지 도트의 구면 좌표를
// 만든다. 어두운 픽셀 = 육지. src/pages/Guestbook/landDots.js와 동일한
// 기법이지만 이 실험 자신의 sphereFrame 변환을 쓰는 독립 사본이다 (실험은
// 서로 다른 실험/페이지 폴더를 import하지 않는 기존 관례를 따른다).
export function loadLandDots(imageUrl, { radius = 1, step = 2, threshold = 90 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, img.width, img.height)

      const positions = []
      const dir = { x: 0, y: 0, z: 0 }
      const setDir = (v) => { dir.x = v.x; dir.y = v.y; dir.z = v.z }
      for (let py = 0; py < img.height; py += step) {
        for (let px = 0; px < img.width; px += step) {
          const i = (py * img.width + px) * 4
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
          if (brightness < threshold) {
            const lat = 90 - (py / img.height) * 180
            const lon = (px / img.width) * 360 - 180
            setDir(latLonToDirection(lat, lon))
            positions.push(dir.x * radius, dir.y * radius, dir.z * radius)
          }
        }
      }
      resolve(new Float32Array(positions))
    }
    img.onerror = reject
    img.src = imageUrl
  })
}
```

- [ ] **Step 2: Implement the experiment shell (fallback-only for now)**

Create `src/experiments/EarthExplorer/EarthExplorer.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadLandDots } from './landDots.js'
import landMaskUrl from '../../assets/earth-land-mask.png'
import '../shared/exp.css'
import './EarthExplorer.css'

const GLOBE_R = 1

function makeGlowTexture(size, color) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

export default function EarthExplorer() {
  const wrapRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    let raf
    let cancelled = false
    const disposables = []

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, wrap.clientWidth / wrap.clientHeight, 0.01, 100)
    camera.position.set(0, 0.5, 2.6)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x000000, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    // 별필드
    const starTex = makeGlowTexture(32, 'rgba(255,255,255,1)')
    disposables.push(starTex)
    const STAR_COUNT = 2000
    const starPos = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(20 + Math.random() * 30)
      starPos[i * 3] = v.x
      starPos[i * 3 + 1] = v.y
      starPos[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      map: starTex, size: 0.12, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    disposables.push(starGeo, starMat)
    scene.add(new THREE.Points(starGeo, starMat))

    // 폴백 지구본: 어두운 구체 + 육지 도트 매트릭스 (방명록과 같은 기법)
    const globeGeo = new THREE.SphereGeometry(GLOBE_R, 48, 48)
    const globeMat = new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: 0.92 })
    disposables.push(globeGeo, globeMat)
    const globe = new THREE.Mesh(globeGeo, globeMat)
    scene.add(globe)

    const dotTex = makeGlowTexture(32, 'rgba(140,200,255,1)')
    disposables.push(dotTex)
    let dotPoints = null
    loadLandDots(landMaskUrl, { radius: GLOBE_R * 1.005, step: 2, threshold: 90 })
      .then((positions) => {
        if (cancelled) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const mat = new THREE.PointsMaterial({
          map: dotTex, size: 0.012, color: 0x8cc8ff, transparent: true, opacity: 0.85,
          depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        })
        disposables.push(geo, mat)
        dotPoints = new THREE.Points(geo, mat)
        scene.add(dotPoints)
      })
      .catch(() => { /* 육지 마스크 로드 실패는 무시 — 빈 지구본으로도 충분 */ })

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.3
    controls.maxDistance = 6
    controls.rotateSpeed = 0.5

    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      globe.rotateY(0.0006)
      if (dotPoints) dotPoints.rotation.y = globe.rotation.y
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="exp-wrap ee-wrap" ref={wrapRef}>
      <span className="exp-hint">드래그로 지구를 회전 · 휠로 확대/축소</span>
    </div>
  )
}
```

- [ ] **Step 3: Implement minimal styles**

Create `src/experiments/EarthExplorer/EarthExplorer.css`:

```css
.ee-wrap {
  background: #000;
}
```

- [ ] **Step 4: Register the experiment in the gallery**

Modify `src/experiments/index.js` — add the lazy import near the other
`lazy(...)` declarations:

```js
const EarthExplorer = lazy(() => import('./EarthExplorer/EarthExplorer'))
```

Add this entry as the new last element of the `experiments` array (after
`deep-space`):

```js
  {
    id: 'earth-explorer',
    title: 'Earth Explorer',
    description: '실제 위성 3D 타일로 지구를 탐험하는 랜드마크 투어. 서울, 도쿄, 뉴욕 등 8개 도시로 시네마틱하게 날아가거나 자유롭게 지구를 둘러볼 수 있습니다.',
    tags: ['three.js', '3d-tiles', 'geo'],
    color: '#7dd3fc',
    planet: 'earth',
    planetName: 'TERRA',
    symbol: '🌐',
    fullscreen: true,
    component: EarthExplorer,
  },
```

- [ ] **Step 5: Update the gallery count and per-experiment e2e list**

Modify `e2e/lab-gallery.spec.js`:

```js
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
]

test('gallery shows 11 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(11)
})
```

(Only the `ids` array and the count/assertion in the first test change; the
per-id loop below is untouched and will automatically pick up
`earth-explorer`.)

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: unchanged from Task 1 (16 files, 93 tests) — this task adds no
new unit tests, only a manual/e2e-verified visual component.

- [ ] **Step 7: Run lint on the new/changed files**

Run: `npx eslint src/experiments/EarthExplorer/EarthExplorer.jsx src/experiments/EarthExplorer/landDots.js src/experiments/index.js e2e/lab-gallery.spec.js`
Expected: no errors.

- [ ] **Step 8: Manual verification in the browser**

Run: `npm run dev`, open `http://localhost:5173/gallery`, confirm 11 cards
render, click into `Earth Explorer`, confirm the dot-matrix globe renders
with drag-to-rotate and wheel-to-zoom working, and the browser console has
no errors.

- [ ] **Step 9: Run the full e2e suite**

Run: `npx playwright test`
Expected: `earth-explorer` renders a canvas without console errors (picked
up automatically by the `ids` loop), gallery count test passes at 11,
all other 23 existing e2e tests still pass (24 total → 25 total).

- [ ] **Step 10: Commit**

```bash
git add src/experiments/EarthExplorer/landDots.js src/experiments/EarthExplorer/EarthExplorer.jsx src/experiments/EarthExplorer/EarthExplorer.css src/experiments/index.js e2e/lab-gallery.spec.js
git commit -m "feat(earth-explorer): add fallback dot-matrix globe as 11th lab experiment"
```

---

### Task 3: Landmark tour UI + cinematic fly-to camera

**Files:**
- Modify: `src/experiments/EarthExplorer/EarthExplorer.jsx`
- Modify: `src/experiments/EarthExplorer/EarthExplorer.css`

**Interfaces:**
- Consumes: `LANDMARKS` from `./landmarks.js`, `computeFlightFrame` from
  `./flightPath.js`, `latLonToDirection` from `./sphereFrame.js` (all Task 1)
- Produces: internal `startFlight(landmark)` closure — Task 4 will call the
  same function, only the position-source function it captures changes.

- [ ] **Step 1: Add landmark state, click handler, and flight animation**

Modify `src/experiments/EarthExplorer/EarthExplorer.jsx` — replace the
imports block at the top with:

```jsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadLandDots } from './landDots.js'
import { latLonToDirection } from './sphereFrame.js'
import { computeFlightFrame } from './flightPath.js'
import { LANDMARKS } from './landmarks.js'
import landMaskUrl from '../../assets/earth-land-mask.png'
import '../shared/exp.css'
import './EarthExplorer.css'
```

Change the component to track selection state and add two refs: one for
the mutable flight state the render loop reads each frame, one to expose
the mount effect's internal `flyTo` function to the JSX click handlers
below (effects and JSX can't otherwise share a plain closure variable):

```jsx
export default function EarthExplorer() {
  const wrapRef = useRef(null)
  const flyToRef = useRef(() => {})
  const flightRef = useRef(null) // { fromDir, toDir, startedAt, durationMs } | null
  const [activeLandmark, setActiveLandmark] = useState(null)
```

Inside the mount `useEffect`, right after `const controls = new OrbitControls(...)`
block (before `const resize = () => {`), add the flight-trigger function and
reduced-motion check:

```jsx
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let currentDir = new THREE.Vector3(0, 0.5, 2.6).normalize() // 초기 카메라 방향(구면상 근사)

    const flyTo = (landmark) => {
      const toDir = latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())
      if (reducedMotion) {
        const frame = computeFlightFrame(toDir, toDir, 1, GLOBE_R)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        controls.target.copy(frame.lookAt)
        currentDir = toDir
        return
      }
      flightRef.current = {
        fromDir: currentDir.clone(),
        toDir,
        startedAt: performance.now(),
        durationMs: 2200,
      }
      currentDir = toDir
    }
    flyToRef.current = flyTo
```

`flyToRef` is already declared at the top of the component (previous step)
— this line just assigns into it each time the mount effect runs.

In the `tick` function, before `controls.update()`, add flight playback:

```jsx
      const flight = flightRef.current
      if (flight) {
        const elapsed = performance.now() - flight.startedAt
        const progress = Math.min(1, elapsed / flight.durationMs)
        const frame = computeFlightFrame(flight.fromDir, flight.toDir, progress, GLOBE_R)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        controls.target.copy(frame.lookAt)
        if (progress >= 1) flightRef.current = null
      }
```

- [ ] **Step 2: Add the landmark button bar to the render output**

Replace the component's `return` statement:

```jsx
  return (
    <div className="exp-wrap ee-wrap" ref={wrapRef}>
      <span className="exp-hint">드래그로 지구를 회전 · 휠로 확대/축소</span>
      <div className="ee-landmarks">
        {LANDMARKS.map((lm) => (
          <button
            key={lm.id}
            type="button"
            className={`ee-landmark-btn${activeLandmark === lm.id ? ' active' : ''}`}
            onClick={() => { setActiveLandmark(lm.id); flyToRef.current(lm) }}
          >
            {lm.name}
          </button>
        ))}
      </div>
    </div>
  )
```

- [ ] **Step 3: Style the landmark bar**

Modify `src/experiments/EarthExplorer/EarthExplorer.css`:

```css
.ee-wrap {
  background: #000;
}

.ee-landmarks {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: min(90vw, 640px);
  z-index: 10;
}

.ee-landmark-btn {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 10, 15, 0.55);
  color: rgba(255, 255, 255, 0.55);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: border-color 0.18s, color 0.18s, background 0.18s;
  letter-spacing: 0.02em;
}

.ee-landmark-btn:hover {
  border-color: rgba(255, 255, 255, 0.35);
  color: #fff;
}

.ee-landmark-btn.active {
  border-color: #7dd3fc;
  color: #7dd3fc;
  background: rgba(125, 211, 252, 0.1);
}
```

- [ ] **Step 4: Run lint**

Run: `npx eslint src/experiments/EarthExplorer/EarthExplorer.jsx`
Expected: no errors. Pay particular attention to the `flyToRef.current(lm)`
closure — `flyToRef` must be declared with `useRef` at component top level
(not inside the mount effect) since it is read from the JSX click handler
outside that effect.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`, open `/gallery/earth-explorer`, click each of the 8
landmark buttons, confirm the camera animates toward the globe location and
settles there, the active button highlights, and free drag/zoom still works
after a flight completes. Then enable "reduce motion" in OS accessibility
settings (or via Chrome DevTools rendering tab → emulate
`prefers-reduced-motion: reduce`) and confirm landmark clicks jump instantly
with no animation and no console errors.

- [ ] **Step 6: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test`
Expected: 25/25 passing (unchanged from Task 2 — this task adds interactive
behavior to the same experiment already covered by the generic per-id
smoke test, no new spec file yet).

- [ ] **Step 7: Commit**

```bash
git add src/experiments/EarthExplorer/EarthExplorer.jsx src/experiments/EarthExplorer/EarthExplorer.css
git commit -m "feat(earth-explorer): add landmark tour with cinematic fly-to camera"
```

---

### Task 4: Google Photorealistic 3D Tiles (progressive enhancement)

**Files:**
- Modify: `src/experiments/EarthExplorer/EarthExplorer.jsx`
- Modify: `src/experiments/EarthExplorer/EarthExplorer.css`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `TilesRenderer, GlobeControls, WGS84_RADIUS` from
  `3d-tiles-renderer`; `GoogleCloudAuthPlugin, TilesFadePlugin,
  UpdateOnChangePlugin` from `3d-tiles-renderer/plugins` (both confirmed
  available in the installed 0.5.0 package — see Task 1 verification).
- Produces: no new exports — this task makes the existing mount effect
  mode-aware (`'fallback' | 'tiles'`) without changing the component's
  public shape (still a plain default-exported component with no props,
  matching every other experiment).

This task is the riskiest one because it cannot be exercised end-to-end
without a real, billed Google Cloud API key — CI and this repo's automated
checks run **keyless**, which must deterministically take the fallback path
built in Tasks 2–3. The fallback path must not regress.

- [ ] **Step 1: Add the env var placeholder**

Modify `.env.example` — append:

```
VITE_GOOGLE_TILES_KEY=your-google-cloud-maps-api-key
```

- [ ] **Step 2: Restructure the mount effect into a mode switch**

Modify `src/experiments/EarthExplorer/EarthExplorer.jsx`. Add to the import
block:

```jsx
import { TilesRenderer, GlobeControls, WGS84_RADIUS } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin, TilesFadePlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/plugins'
```

Add a `notice` state next to the existing `activeLandmark` state:

```jsx
  const [notice, setNotice] = useState(null)
```

**First**, the fallback-globe block written in Task 2 (`const globeGeo =
new THREE.SphereGeometry(...)` through the `.catch(...)` that closes the
`loadLandDots(...)` call) currently runs unconditionally at mount. In
tiles mode it must **not** run — otherwise the dot-matrix globe would
render underneath/alongside the real Google tiles. Replace that entire
block with a function that can be called on demand instead:

```jsx
    // 폴백 지구본: 어두운 구체 + 육지 도트 매트릭스 (방명록과 같은 기법).
    // 타일 모드에서는 필요 없으므로 즉시 만들지 않고, 폴백이 실제로 필요할 때만
    // (키가 없을 때, 또는 타일 로드 실패로 전환될 때) buildFallbackGlobe()를
    // 호출한다.
    let globe = null
    let dotPoints = null
    const dotTex = makeGlowTexture(32, 'rgba(140,200,255,1)')
    disposables.push(dotTex)

    function buildFallbackGlobe() {
      if (globe) return // 이미 만들어져 있으면 중복 생성하지 않는다
      const globeGeo = new THREE.SphereGeometry(GLOBE_R, 48, 48)
      const globeMat = new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: 0.92 })
      disposables.push(globeGeo, globeMat)
      globe = new THREE.Mesh(globeGeo, globeMat)
      scene.add(globe)

      loadLandDots(landMaskUrl, { radius: GLOBE_R * 1.005, step: 2, threshold: 90 })
        .then((positions) => {
          if (cancelled) return
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          const mat = new THREE.PointsMaterial({
            map: dotTex, size: 0.012, color: 0x8cc8ff, transparent: true, opacity: 0.85,
            depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
          })
          disposables.push(geo, mat)
          dotPoints = new THREE.Points(geo, mat)
          scene.add(dotPoints)
        })
        .catch(() => { /* 육지 마스크 로드 실패는 무시 — 빈 지구본으로도 충분 */ })
    }
```

**Then**, immediately after the `const controls = new
OrbitControls(...)` block used in Task 3, replace the block from `const
reducedMotion = ...` down through the `flyToRef.current = flyTo` line with
the mode switch:

```jsx
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let currentDir = new THREE.Vector3(0, 0.5, 2.6).normalize()

    const apiKey = import.meta.env.VITE_GOOGLE_TILES_KEY
    let mode = 'fallback'
    let tiles = null
    let tilesControls = null
    let activeControls = controls
    let activeRadius = GLOBE_R
    let getLandmarkDir = (landmark) => latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())

    const teardownTiles = () => {
      if (tilesControls) { tilesControls.dispose(); tilesControls = null }
      if (tiles) { tiles.dispose(); tiles = null }
    }

    const activateFallback = (noticeText) => {
      teardownTiles()
      mode = 'fallback'
      activeControls = controls
      activeRadius = GLOBE_R
      getLandmarkDir = (landmark) => latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())
      camera.position.set(currentDir.x * GLOBE_R * 2.6, currentDir.y * GLOBE_R * 2.6, currentDir.z * GLOBE_R * 2.6)
      buildFallbackGlobe()
      setNotice(noticeText)
    }

    if (apiKey) {
      mode = 'tiles'
      tiles = new TilesRenderer()
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey }))
      tiles.registerPlugin(new TilesFadePlugin())
      tiles.registerPlugin(new UpdateOnChangePlugin())
      scene.add(tiles.group)
      tiles.setCamera(camera)
      tiles.setResolutionFromRenderer(camera, renderer)

      tiles.addEventListener('load-error', (e) => {
        if (e.tile !== null) return // 개별 타일 실패는 무시 — 루트 타일셋 실패만 폴백 트리거
        if (mode !== 'tiles') return
        activateFallback('위성 타일을 불러올 수 없어 정적 지구본으로 표시 중')
      })

      tilesControls = new GlobeControls(scene, camera, renderer.domElement)
      tilesControls.setEllipsoid(tiles.ellipsoid, tiles.group)
      activeControls = tilesControls
      activeRadius = WGS84_RADIUS
      getLandmarkDir = (landmark) => {
        const target = new THREE.Vector3()
        tiles.ellipsoid.getCartographicToPosition(
          landmark.lat * (Math.PI / 180),
          landmark.lon * (Math.PI / 180),
          0,
          target,
        )
        return target.normalize()
      }
      camera.position.set(0, WGS84_RADIUS * 0.4, WGS84_RADIUS * 2.6)
      currentDir = new THREE.Vector3(0, 0.4, 2.6).normalize()
    } else {
      buildFallbackGlobe()
    }

    const flyTo = (landmark) => {
      const toDir = getLandmarkDir(landmark)
      if (reducedMotion) {
        const frame = computeFlightFrame(toDir, toDir, 1, activeRadius)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        activeControls.target.copy(frame.lookAt)
        currentDir = toDir
        return
      }
      flightRef.current = {
        fromDir: currentDir.clone(),
        toDir,
        startedAt: performance.now(),
        durationMs: 2200,
      }
      currentDir = toDir
    }
    flyToRef.current = flyTo
```

Note: the `const controls = new OrbitControls(camera, renderer.domElement)`
line from Task 2/3 stays exactly where it was (it is always constructed,
even in tiles mode, so `activeControls` has a safe non-null value to fall
back to before the `if (apiKey)` branch runs); it is simply not the one used
for per-frame updates when `mode === 'tiles'`. `buildFallbackGlobe()` is
idempotent (the `if (globe) return` guard), so calling it from both the
`else` branch and later from `activateFallback()` on a load error never
double-builds the globe.

- [ ] **Step 3: Update the render loop to be mode-aware**

Replace the `tick` function body with:

```jsx
    let attributionFrameCount = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)

      const flight = flightRef.current
      if (flight) {
        const elapsed = performance.now() - flight.startedAt
        const progress = Math.min(1, elapsed / flight.durationMs)
        const frame = computeFlightFrame(flight.fromDir, flight.toDir, progress, activeRadius)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        activeControls.target.copy(frame.lookAt)
        if (progress >= 1) flightRef.current = null
      }

      if (mode === 'tiles' && tiles) {
        const updatePlugin = tiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN')
        if (!updatePlugin || updatePlugin.doTilesNeedUpdate()) {
          tiles.update()
        }
        attributionFrameCount += 1
        if (attributionFrameCount % 30 === 0) {
          const attributions = tiles.getAttributions([])
          const text = attributions.find((a) => a.type === 'string')?.value ?? null
          setNotice((prev) => (prev && prev.startsWith('위성 타일을 불러올 수 없어') ? prev : text))
        }
      } else if (globe) {
        globe.rotateY(0.0006)
        if (dotPoints) dotPoints.rotation.y = globe.rotation.y
      }

      activeControls.update()
      renderer.render(scene, camera)
    }
    tick()
```

- [ ] **Step 4: Update resize handling for tiles mode**

Replace the `resize` function:

```jsx
    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      if (mode === 'tiles' && tiles) tiles.setResolutionFromRenderer(camera, renderer)
    }
```

- [ ] **Step 5: Dispose tiles-mode resources on unmount**

In the effect's cleanup function, add `teardownTiles()` right after
`cancelAnimationFrame(raf)`:

```jsx
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      teardownTiles()
      ro.disconnect()
      controls.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
```

- [ ] **Step 6: Render the attribution/notice overlay**

Add to the JSX return, inside `.ee-wrap`, after the landmarks div:

```jsx
      {notice && <div className="ee-notice">{notice}</div>}
```

- [ ] **Step 7: Style the notice overlay**

Append to `src/experiments/EarthExplorer/EarthExplorer.css`:

```css
.ee-notice {
  position: absolute;
  top: 16px;
  right: 16px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.02em;
  max-width: 45vw;
  text-align: right;
  z-index: 10;
  pointer-events: none;
}
```

- [ ] **Step 8: Run lint**

Run: `npx eslint src/experiments/EarthExplorer/EarthExplorer.jsx`
Expected: no errors.

- [ ] **Step 9: Run the full unit + e2e suite in the keyless (default) environment**

Run: `npx vitest run && npx playwright test`
Expected: unit 93/93 unchanged; e2e 25/25 unchanged — with no
`VITE_GOOGLE_TILES_KEY` set, `apiKey` is `undefined`, `mode` stays
`'fallback'`, and the component behaves exactly as it did after Task 3.
This is the critical regression check for this task.

- [ ] **Step 10: Manual verification with a real key (only if the user has one)**

If a Google Cloud Maps API key with the Map Tiles API enabled is available,
add it to `.env.local` as `VITE_GOOGLE_TILES_KEY=<key>`, run `npm run dev`,
open `/gallery/earth-explorer`, and confirm: real photorealistic tiles load
around the globe, landmark fly-to lands at the correct real-world location
(visually cross-check against the actual landmark), free-flight via
`GlobeControls` (drag/zoom/tilt) works, the attribution text renders in the
top-right corner, and no console errors appear. If no key is available,
state plainly in the final report that this step was skipped and the tiles
code path is unverified beyond code review + the keyless regression check.

- [ ] **Step 11: Commit**

```bash
git add src/experiments/EarthExplorer/EarthExplorer.jsx src/experiments/EarthExplorer/EarthExplorer.css .env.example
git commit -m "feat(earth-explorer): add Google Photorealistic 3D Tiles with fallback degrade"
```

---

### Task 5: Fallback-mode e2e smoke test, quota-defense docs, final sweep

**Files:**
- Create: `e2e/earth-explorer.spec.js`
- Modify: `docs/superpowers/specs/2026-07-18-earth-explorer-design.md` (mark
  implemented, note the two documented deviations from Task-planning are
  now shipped as described)

**Interfaces:** none (final integration/verification task, no new code
consumed elsewhere).

- [ ] **Step 1: Write the fallback-mode e2e smoke test**

Create `e2e/earth-explorer.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('earth explorer: 폴백 지구본 진입 → 랜드마크 클릭 → 콘솔 에러 없음', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/gallery/earth-explorer')
  await expect(page.locator('.ee-wrap canvas')).toBeVisible({ timeout: 15000 })

  const seoulBtn = page.locator('.ee-landmark-btn', { hasText: '서울 잠실' })
  await expect(seoulBtn).toBeVisible()
  await seoulBtn.click()
  await expect(seoulBtn).toHaveClass(/active/)

  await page.waitForTimeout(2500) // 비행 애니메이션(2200ms) 완료 대기

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run the new test in isolation**

Run: `npx playwright test earth-explorer`
Expected: PASS. This runs in the repo's default keyless environment (no
`VITE_GOOGLE_TILES_KEY` in the test/CI environment), exercising the
fallback path deterministically — the same guarantee the per-id loop in
`lab-gallery.spec.js` already relies on for every other experiment.

- [ ] **Step 3: Run the complete verification sweep**

Run each of the following and read the actual output (not just exit code):

```bash
npx eslint .
npx vitest run
npm run build
npx playwright test
```

Expected: lint has zero errors on any file this plan touched (pre-existing
unrelated lint failures elsewhere in the repo, if any, are out of scope —
confirm they are unchanged in count from before this plan started); unit
93/93; build completes and emits a new lazy chunk for `EarthExplorer`;
e2e 26/26 (25 from Task 2 + this task's new spec).

- [ ] **Step 4: Update the design spec status**

Modify `docs/superpowers/specs/2026-07-18-earth-explorer-design.md` — change
the `Status:` line at the top from `Approved by Evan (chat, 2026-07-18)` to:

```
Status: Implemented (2026-07-19). Two deviations from this spec, decided
during plan-writing and shipped as described in
docs/superpowers/plans/2026-07-19-earth-explorer.md's Global Constraints:
(1) fallback globe reuses the existing Guestbook land-mask/dot-matrix
technique instead of a new NASA Blue Marble texture; (2) "spiral descent"
is a single eased arc, not a literal spiral.
```

- [ ] **Step 5: Commit**

```bash
git add e2e/earth-explorer.spec.js docs/superpowers/specs/2026-07-18-earth-explorer-design.md
git commit -m "test(earth-explorer): add fallback-mode e2e smoke test, mark spec implemented"
```

- [ ] **Step 6: Final report to the user**

Surface these manual follow-ups (no code can resolve them):

1. **Google Cloud setup required** — `VITE_GOOGLE_TILES_KEY` needs a real
   Google Cloud project with the Map Tiles API enabled and billing active.
   Without it, the experiment runs in fallback (dot-globe) mode
   indefinitely — this is by design, not a bug.
2. **Quota/referrer defense** — restrict the API key to the portfolio's
   domain via HTTP referrer restrictions in the Google Cloud Console, and
   set a daily quota cap on the Map Tiles API, both from the console (no
   CLI/code path for this).
3. **Google logo attribution not wired up** — only the text copyright
   string is shown; the plugin's optional image-logo attribution was left
   unconfigured because it requires a real Google-hosted logo URL that
   cannot be fabricated in code. If strict Google Maps Platform branding
   compliance is required, source the correct current logo asset/URL from
   Google's own branding guidelines and wire it into the
   `GoogleCloudAuthPlugin({ logoUrl: ... })` option in
   `EarthExplorer.jsx`.
4. **Real-tiles path unverified without a key** (state only if Task 4 Step
   10 was actually skipped in that session) — the Google Tiles rendering,
   `GlobeControls` free-flight, and real-world landmark accuracy have not
   been visually confirmed; only the keyless fallback path has full
   automated + manual coverage.

## Self-Review Notes (completed during writing, not a separate pass)

- **Spec coverage:** every section of the design spec maps to a task —
  execution model (raw three.js, Task 1/2), data source + fallback (Task
  2/4), UX flow entry/landmark-tour/free-flight (Task 2/3/4), key/quota
  defense (Task 4/5), attribution (Task 4), geo utilities (Task 1),
  cleanup (Task 2/4), error handling (Task 4), testing (Task 1/2/5), out of
  scope items are not touched by any task.
- **Type/name consistency checked:** `latLonToDirection`, `slerpDirection`,
  `computeFlightFrame`, `LANDMARKS`, `loadLandDots` are defined once in
  Task 1/2 and referenced with identical names/signatures in every later
  task that imports them.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an
  exact command with expected output.
