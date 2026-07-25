# Cloud Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fullscreen Lab experiment (`/gallery/cloud-gallery`) — an on-rails cinematic tour gliding over a raymarched volumetric cloud sea, passing procedurally-generated abstract sculptures rendered with physically-based materials.

**Architecture:** Raw three.js fullscreen experiment mirroring `NeonRaymarch`'s skeleton (imperative scene + `requestAnimationFrame` loop + explicit teardown). One perspective scene holds a full-screen background quad (sky + volumetric clouds shader) drawn behind PBR sculpture meshes lit by a PMREM `RoomEnvironment`. Pure, testable modules own the camera path (`cloudPath.js`) and tour layout (`sculptures.js`); the component owns geometry, materials, input, and the render/bloom pipeline.

**Tech Stack:** React 19, three.js r184 (`three/addons` EffectComposer / UnrealBloomPass / OutputPass / RoomEnvironment / PMREMGenerator), Vitest (unit), Playwright (e2e). No new dependencies.

## Global Constraints

- No new npm dependencies — use `three` r184 and `three/addons/*` only (matches `SeoulNights` / `SpaceBackground` postprocessing convention; the project does NOT use `@react-three/postprocessing`).
- Experiment registry entry shape (exact keys): `{ id, title, description, tags, color, planet, planetName, symbol, fullscreen, component }`.
- Pure logic modules (`cloudPath.js`, `sculptures.js`) must import NO three.js and use plain `[x, y, z]` number arrays, so Vitest runs them without WebGL — same convention as `flightPath.js` + `flightPath.test.js`.
- Description copy is Korean; identifiers, ids, and commit messages are English.
- Unit test runner: `npm test` (`vitest run`). E2E: `npm run test:e2e` (Playwright). Build: `npm run build`.
- Experiment id: `cloud-gallery`. Route: `/gallery/cloud-gallery`.

---

### Task 1: `cloudPath.js` — pure Catmull-Rom camera path

**Files:**
- Create: `src/experiments/CloudGallery/cloudPath.js`
- Test: `src/experiments/CloudGallery/cloudPath.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `samplePath(waypoints, t) → { position: [x,y,z], lookAt: [x,y,z] }` where `waypoints` is `Array<{ position: [x,y,z], lookAt: [x,y,z] }>` and `t ∈ [0,1]`. Passes exactly through the first waypoint at `t=0` and the last at `t=1`.
  - `stopT(index, count) → number` — evenly-spaced t in `[0,1]` for tour stop `index` of `count`.

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/CloudGallery/cloudPath.test.js
import { describe, it, expect } from 'vitest'
import { samplePath, stopT } from './cloudPath'

const wp = [
  { position: [0, 0, 0], lookAt: [0, 0, 1] },
  { position: [0, 2, 10], lookAt: [0, 2, 11] },
  { position: [0, 0, 20], lookAt: [0, 0, 21] },
]

describe('samplePath', () => {
  it('passes through the first waypoint at t=0', () => {
    const s = samplePath(wp, 0)
    expect(s.position).toEqual([0, 0, 0])
    expect(s.lookAt).toEqual([0, 0, 1])
  })

  it('passes through the last waypoint at t=1', () => {
    const s = samplePath(wp, 1)
    expect(s.position[2]).toBeCloseTo(20, 6)
    expect(s.lookAt[2]).toBeCloseTo(21, 6)
  })

  it('is continuous (small dt → small move)', () => {
    const a = samplePath(wp, 0.5)
    const b = samplePath(wp, 0.51)
    const d = Math.hypot(
      a.position[0] - b.position[0],
      a.position[1] - b.position[1],
      a.position[2] - b.position[2],
    )
    expect(d).toBeLessThan(1)
  })

  it('clamps t outside [0,1]', () => {
    expect(samplePath(wp, -1).position).toEqual([0, 0, 0])
    expect(samplePath(wp, 2).position[2]).toBeCloseTo(20, 6)
  })
})

describe('stopT', () => {
  it('maps endpoints to 0 and 1', () => {
    expect(stopT(0, 4)).toBe(0)
    expect(stopT(3, 4)).toBe(1)
  })

  it('is monotonically increasing', () => {
    const ts = [0, 1, 2, 3].map((i) => stopT(i, 4))
    expect(ts).toEqual([0, 1 / 3, 2 / 3, 1])
  })

  it('returns 0 for a single stop', () => {
    expect(stopT(0, 1)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/CloudGallery/cloudPath.test.js`
Expected: FAIL — cannot resolve `./cloudPath` / `samplePath is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/CloudGallery/cloudPath.js
// Pure uniform Catmull-Rom interpolation over plain [x,y,z] arrays.
// No three.js import — unit-testable without WebGL (mirrors flightPath.js).

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

function catmullVec(P0, P1, P2, P3, t) {
  return [
    catmull(P0[0], P1[0], P2[0], P3[0], t),
    catmull(P0[1], P1[1], P2[1], P3[1], t),
    catmull(P0[2], P1[2], P2[2], P3[2], t),
  ]
}

// Interpolate an array of vec3 control points at u in [0,1]. Boundary handled
// by clamping the phantom endpoints to the first/last point.
function splineAt(points, u) {
  const n = points.length
  if (n === 1) return points[0].slice()
  const segCount = n - 1
  const clamped = Math.min(Math.max(u, 0), 1)
  const scaled = clamped * segCount
  let seg = Math.floor(scaled)
  if (seg >= segCount) seg = segCount - 1
  const localT = scaled - seg
  const p0 = points[Math.max(seg - 1, 0)]
  const p1 = points[seg]
  const p2 = points[seg + 1]
  const p3 = points[Math.min(seg + 2, n - 1)]
  return catmullVec(p0, p1, p2, p3, localT)
}

export function samplePath(waypoints, t) {
  return {
    position: splineAt(waypoints.map((w) => w.position), t),
    lookAt: splineAt(waypoints.map((w) => w.lookAt), t),
  }
}

export function stopT(index, count) {
  if (count <= 1) return 0
  return index / (count - 1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/CloudGallery/cloudPath.test.js`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CloudGallery/cloudPath.js src/experiments/CloudGallery/cloudPath.test.js
git commit -m "feat(cloud-gallery): pure Catmull-Rom camera path module"
```

---

### Task 2: `sculptures.js` — pure tour layout

**Files:**
- Create: `src/experiments/CloudGallery/sculptures.js`
- Test: `src/experiments/CloudGallery/sculptures.test.js`

**Interfaces:**
- Consumes: nothing (parallel to Task 1).
- Produces:
  - `SCULPTURES` — `Array<{ id, form, label, caption, material }>`, `form ∈ 'torusKnot'|'crystal'|'wave'|'sphere'`, `material ∈ 'glass'|'metal'|'marble'|'chrome'`.
  - `layout(sculptures?, { spacing?, height? }?) → Array<{ ...def, position: [x,y,z], tourStop: number }>` — spaces sculptures along +Z, adds normalized `tourStop`.
  - `waypoints(laidOut, { back?, up?, side? }?) → Array<{ position: [x,y,z], lookAt: [x,y,z] }>` — camera framing per sculpture; feeds `samplePath` from Task 1.

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/CloudGallery/sculptures.test.js
import { describe, it, expect } from 'vitest'
import { SCULPTURES, layout, waypoints } from './sculptures'

describe('SCULPTURES', () => {
  it('has at least 3 sculptures with required fields', () => {
    expect(SCULPTURES.length).toBeGreaterThanOrEqual(3)
    for (const s of SCULPTURES) {
      expect(s.id).toBeTruthy()
      expect(s.form).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.caption).toBeTruthy()
      expect(s.material).toBeTruthy()
    }
  })

  it('has unique ids', () => {
    const ids = new Set(SCULPTURES.map((s) => s.id))
    expect(ids.size).toBe(SCULPTURES.length)
  })
})

describe('layout', () => {
  it('preserves count and adds position + tourStop', () => {
    const out = layout(SCULPTURES, { spacing: 14, height: 0 })
    expect(out.length).toBe(SCULPTURES.length)
    expect(out[0].tourStop).toBe(0)
    expect(out[out.length - 1].tourStop).toBe(1)
  })

  it('spaces sculptures evenly along +Z', () => {
    const out = layout(SCULPTURES, { spacing: 10, height: 2 })
    expect(out[0].position).toEqual([0, 2, 0])
    expect(out[1].position).toEqual([0, 2, 10])
    // monotonically increasing z
    for (let i = 1; i < out.length; i++) {
      expect(out[i].position[2]).toBeGreaterThan(out[i - 1].position[2])
    }
  })
})

describe('waypoints', () => {
  it('produces one waypoint per sculpture that looks at it', () => {
    const laid = layout(SCULPTURES, { spacing: 14 })
    const wps = waypoints(laid, { back: 7, up: 2.5, side: 4 })
    expect(wps.length).toBe(laid.length)
    expect(wps[0].lookAt).toEqual(laid[0].position)
    // camera pulled back on -Z relative to its sculpture
    expect(wps[0].position[2]).toBeLessThan(laid[0].position[2])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/CloudGallery/sculptures.test.js`
Expected: FAIL — cannot resolve `./sculptures`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/CloudGallery/sculptures.js
// Pure layout + config for the Cloud Gallery tour. No three.js import — the
// `form` key maps to a geometry builder inside the component; here it is data.

export const SCULPTURES = [
  { id: 'helix',  form: 'torusKnot', label: 'Helix',  caption: '유리 · 아침빛',    material: 'glass'  },
  { id: 'shard',  form: 'crystal',   label: 'Shard',  caption: '거친 금속 · 정오',  material: 'metal'  },
  { id: 'ripple', form: 'wave',      label: 'Ripple', caption: '대리석 · 황혼',     material: 'marble' },
  { id: 'orb',    form: 'sphere',    label: 'Orb',    caption: '광택 크롬 · 역광',   material: 'chrome' },
]

// Lay sculptures out along +Z at a fixed height, evenly spaced. Adds world
// `position` and normalized `tourStop` (t in [0,1]).
export function layout(sculptures = SCULPTURES, { spacing = 14, height = 0 } = {}) {
  const count = sculptures.length
  return sculptures.map((s, i) => ({
    ...s,
    position: [0, height, i * spacing],
    tourStop: count <= 1 ? 0 : i / (count - 1),
  }))
}

// Camera waypoints framing each laid-out sculpture: pulled back (-Z), up (+Y),
// and to the side (-X) for a 3/4 view, looking at the sculpture.
export function waypoints(laidOut, { back = 7, up = 2.5, side = 4 } = {}) {
  return laidOut.map((s) => ({
    position: [s.position[0] - side, s.position[1] + up, s.position[2] - back],
    lookAt: [...s.position],
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/CloudGallery/sculptures.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CloudGallery/sculptures.js src/experiments/CloudGallery/sculptures.test.js
git commit -m "feat(cloud-gallery): pure sculpture layout + camera waypoints"
```

---

### Task 3: `clouds.glsl.js` — volumetric cloud + sky shader

**Files:**
- Create: `src/experiments/CloudGallery/clouds.glsl.js`
- Test: `src/experiments/CloudGallery/clouds.glsl.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CLOUD_FRAG` (string) — a GLSL ES 1.0 fragment shader. Required uniforms the component MUST provide: `uRes` (vec2), `uTime` (float), `uCamPos` (vec3), `uCamRight` (vec3), `uCamUp` (vec3), `uCamFwd` (vec3), `uTanFov` (float), `uAspect` (float), `uSunDir` (vec3). Outputs **linear** color (no gamma) — the pipeline's `OutputPass` applies sRGB.

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/CloudGallery/clouds.glsl.test.js
import { describe, it, expect } from 'vitest'
import { CLOUD_FRAG } from './clouds.glsl'

describe('CLOUD_FRAG', () => {
  it('is a non-empty shader string', () => {
    expect(typeof CLOUD_FRAG).toBe('string')
    expect(CLOUD_FRAG.length).toBeGreaterThan(100)
  })

  it('declares every uniform the component drives', () => {
    for (const u of [
      'uRes', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp',
      'uCamFwd', 'uTanFov', 'uAspect', 'uSunDir',
    ]) {
      expect(CLOUD_FRAG).toContain(u)
    }
  })

  it('writes to gl_FragColor exactly once', () => {
    const matches = CLOUD_FRAG.match(/gl_FragColor/g) || []
    expect(matches.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/CloudGallery/clouds.glsl.test.js`
Expected: FAIL — cannot resolve `./clouds.glsl`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/CloudGallery/clouds.glsl.js
// Volumetric cloud-sea + sky background. Rendered on a full-screen NDC quad
// (vertex shader outputs clip space directly, so it ignores the camera and
// always fills the screen). Rays are reconstructed from the perspective
// camera basis passed as uniforms, so the clouds are parallax-correct as the
// tour moves. Outputs LINEAR color; OutputPass handles sRGB.

export const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uCamPos;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamFwd;
  uniform float uTanFov;
  uniform float uAspect;
  uniform vec3 uSunDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return s;
  }

  // Cloud slab lives below the flight path, between y = LOW and y = HIGH.
  const float LOW = -6.0;
  const float HIGH = -1.5;

  float density(vec3 p) {
    float base = fbm(p * 0.12 + vec3(uTime * 0.02, 0.0, 0.0));
    float edge = smoothstep(LOW, LOW + 1.5, p.y) * (1.0 - smoothstep(HIGH - 1.5, HIGH, p.y));
    return clamp((base - 0.48) * 2.2 * edge, 0.0, 1.0);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
    vec3 ro = uCamPos;
    vec3 rd = normalize(
      uCamFwd + uv.x * uTanFov * uAspect * uCamRight + uv.y * uTanFov * uCamUp);

    vec3 sun = normalize(uSunDir);
    float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(vec3(0.55, 0.62, 0.74), vec3(0.10, 0.22, 0.48), up);
    sky += vec3(1.0, 0.85, 0.6) * pow(max(dot(rd, sun), 0.0), 64.0) * 0.6;

    float trans = 1.0;
    vec3 acc = vec3(0.0);
    float tStart = 2.0;
    float dt = (40.0 - tStart) / 48.0;
    for (int i = 0; i < 48; i++) {
      float t = tStart + dt * float(i);
      vec3 p = ro + rd * t;
      if (p.y < LOW - 1.0 || p.y > HIGH + 1.0) continue;
      float dens = density(p);
      if (dens > 0.001) {
        float shadow = density(p + sun * 1.2);
        float light = clamp(1.0 - shadow, 0.0, 1.0);
        vec3 lit = mix(vec3(0.45, 0.5, 0.62), vec3(1.0, 0.97, 0.92), light);
        float a = dens * 0.5;
        acc += trans * a * lit;
        trans *= 1.0 - a;
        if (trans < 0.02) break;
      }
    }

    vec3 col = acc + sky * trans;
    gl_FragColor = vec4(col, 1.0);
  }
`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/CloudGallery/clouds.glsl.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CloudGallery/clouds.glsl.js src/experiments/CloudGallery/clouds.glsl.test.js
git commit -m "feat(cloud-gallery): volumetric cloud + sky background shader"
```

---

### Task 4: `CloudGallery.jsx` + CSS — scene, tour, render pipeline

**Files:**
- Create: `src/experiments/CloudGallery/CloudGallery.jsx`
- Create: `src/experiments/CloudGallery/CloudGallery.css`
- Uses: `cloudPath.js` (Task 1), `sculptures.js` (Task 2), `clouds.glsl.js` (Task 3), `../shared/exp.css`

**Interfaces:**
- Consumes: `samplePath`, `stopT` (Task 1); `SCULPTURES`, `layout`, `waypoints` (Task 2); `CLOUD_FRAG` (Task 3).
- Produces: `default export` React component (registered in Task 5).

- [ ] **Step 1: Write the component**

```jsx
// src/experiments/CloudGallery/CloudGallery.jsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { samplePath, stopT } from './cloudPath'
import { SCULPTURES, layout, waypoints } from './sculptures'
import { CLOUD_FRAG } from './clouds.glsl'
import '../shared/exp.css'
import './CloudGallery.css'

const SUN_DIR = new THREE.Vector3(0.6, 0.7, 0.35).normalize()

function buildGeometry(form) {
  switch (form) {
    case 'torusKnot': return new THREE.TorusKnotGeometry(1.2, 0.38, 220, 32)
    case 'crystal':   return new THREE.IcosahedronGeometry(1.6, 0)
    case 'wave':      return new THREE.TorusGeometry(1.3, 0.45, 32, 220)
    case 'sphere':    return new THREE.SphereGeometry(1.5, 96, 96)
    default:          return new THREE.IcosahedronGeometry(1.4, 1)
  }
}

function buildMaterial(kind) {
  switch (kind) {
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.05,
        transmission: 1, thickness: 1.5, ior: 1.45, clearcoat: 1,
      })
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 1, roughness: 0.34, flatShading: true })
    case 'marble':
      return new THREE.MeshStandardMaterial({ color: 0xf1ece4, metalness: 0, roughness: 0.5 })
    case 'chrome':
      return new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 })
    default:
      return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 })
  }
}

export default function CloudGallery() {
  const mountRef = useRef(null)
  const laidRef = useRef(layout(SCULPTURES, { spacing: 16, height: 0 }))
  const [stopIdx, setStopIdx] = useState(0)
  const targetStopRef = useRef(0)

  // keep the render loop's target in sync with UI state
  useEffect(() => { targetStopRef.current = stopIdx }, [stopIdx])

  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const laid = laidRef.current
    const wps = waypoints(laid, { back: 8, up: 2.6, side: 4.5 })
    const count = laid.length

    // ── renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    const narrow = mount.clientWidth < 720
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow ? 1.1 : 1.5))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.insertBefore(renderer.domElement, mount.firstChild)

    // ── environment (reflections) ──
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)

    const scene = new THREE.Scene()
    scene.environment = envRT.texture
    const cam = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 300)

    // ── background quad (sky + clouds) ──
    const bgUniforms = {
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uCamRight: { value: new THREE.Vector3() },
      uCamUp: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
      uTanFov: { value: Math.tan((50 / 2) * Math.PI / 180) },
      uAspect: { value: 1 },
      uSunDir: { value: SUN_DIR.clone() },
    }
    const bgMat = new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
      fragmentShader: CLOUD_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat)
    bgQuad.renderOrder = -1
    bgQuad.frustumCulled = false
    scene.add(bgQuad)

    // ── key light so metals/marble read directional ──
    const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2)
    sunLight.position.copy(SUN_DIR).multiplyScalar(20)
    scene.add(sunLight)
    scene.add(new THREE.AmbientLight(0x334455, 0.4))

    // ── sculptures ──
    const geoms = []
    const mats = []
    const meshes = laid.map((s) => {
      const g = buildGeometry(s.form)
      const m = buildMaterial(s.material)
      geoms.push(g)
      mats.push(m)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(s.position[0], s.position[1], s.position[2])
      scene.add(mesh)
      return mesh
    })

    // ── postprocessing ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, cam))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight), 0.35, 0.6, 0.85,
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const setSize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      composer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      const buf = renderer.getDrawingBufferSize(new THREE.Vector2())
      bgUniforms.uRes.value.copy(buf)
      bgUniforms.uAspect.value = w / h
    }
    setSize()

    // ── input: advance / retreat tour stop ──
    const clampStop = (i) => Math.max(0, Math.min(count - 1, i))
    const onWheel = (e) => {
      e.preventDefault()
      targetStopRef.current = clampStop(targetStopRef.current + (e.deltaY > 0 ? 1 : -1))
      setStopIdx(targetStopRef.current)
    }
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        targetStopRef.current = clampStop(targetStopRef.current + 1)
        setStopIdx(targetStopRef.current)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        targetStopRef.current = clampStop(targetStopRef.current - 1)
        setStopIdx(targetStopRef.current)
      }
    }
    let touchY = null
    const onTouchStart = (e) => { touchY = e.touches[0].clientY }
    const onTouchEnd = (e) => {
      if (touchY == null) return
      const dy = e.changedTouches[0].clientY - touchY
      if (Math.abs(dy) > 40) {
        targetStopRef.current = clampStop(targetStopRef.current + (dy < 0 ? 1 : -1))
        setStopIdx(targetStopRef.current)
      }
      touchY = null
    }
    mount.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    mount.addEventListener('touchstart', onTouchStart, { passive: true })
    mount.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('resize', setSize)

    // ── loop ──
    let progress = 0
    let raf = 0
    let running = true
    const right = new THREE.Vector3()
    const upv = new THREE.Vector3()
    const fwd = new THREE.Vector3()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const time = performance.now() / 1000
      const targetT = stopT(targetStopRef.current, count)
      progress += (targetT - progress) * 0.06

      const s = samplePath(wps, progress)
      cam.position.set(s.position[0], s.position[1], s.position[2])
      cam.lookAt(s.lookAt[0], s.lookAt[1], s.lookAt[2])

      // feed camera basis to the cloud shader
      cam.matrixWorld.extractBasis(right, upv, fwd)
      bgUniforms.uCamPos.value.copy(cam.position)
      bgUniforms.uCamRight.value.copy(right)
      bgUniforms.uCamUp.value.copy(upv)
      bgUniforms.uCamFwd.value.copy(fwd.clone().negate()) // camera looks down -Z
      bgUniforms.uTime.value = reduced ? 8 : time

      for (const mesh of meshes) mesh.rotation.y = reduced ? 0.4 : time * 0.15

      composer.render()
    }
    loop()

    const onVis = () => { running = !document.hidden }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', setSize)
      window.removeEventListener('keydown', onKey)
      mount.removeEventListener('wheel', onWheel)
      mount.removeEventListener('touchstart', onTouchStart)
      mount.removeEventListener('touchend', onTouchEnd)
      geoms.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      bgQuad.geometry.dispose()
      bgMat.dispose()
      envRT.dispose()
      pmrem.dispose()
      composer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  const laid = laidRef.current
  const current = laid[stopIdx]

  return (
    <div className="cloud-gallery" ref={mountRef}>
      <div className="cg-info">
        <span className="cg-label">{current.label}</span>
        <span className="cg-caption">{current.caption}</span>
      </div>
      <div className="cg-dots">
        {laid.map((s, i) => (
          <span key={s.id} className={`cg-dot${i === stopIdx ? ' active' : ''}`} />
        ))}
      </div>
      <p className="cg-hint">스크롤 / ↑↓ — 다음 작품</p>
    </div>
  )
}
```

- [ ] **Step 2: Write the CSS**

```css
/* src/experiments/CloudGallery/CloudGallery.css */
.cloud-gallery {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #12253f;
  touch-action: none;
}

.cloud-gallery canvas { display: block; width: 100%; height: 100%; }

.cg-info {
  position: absolute;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  text-align: center;
}
.cg-label {
  font-size: 20px;
  letter-spacing: 0.14em;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.4);
}
.cg-caption {
  font-size: 12px;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
}

.cg-dots {
  position: absolute;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  pointer-events: none;
}
.cg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  transition: background 0.25s, transform 0.25s;
}
.cg-dot.active { background: #fff; transform: scale(1.4); }

.cg-hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: exits clean (0), no import/resolution errors for `CloudGallery.jsx`.

- [ ] **Step 4: Manual visual check in dev**

Run: `npm run dev`, open `http://localhost:5173/gallery/cloud-gallery` (use the port Vite prints).
Expected, confirmed by eye: a cloud sea beneath the horizon; the first sculpture framed with visible environment reflections; scrolling / pressing ↓ eases the camera forward to the next sculpture; the bottom label + dots update; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CloudGallery/CloudGallery.jsx src/experiments/CloudGallery/CloudGallery.css
git commit -m "feat(cloud-gallery): scene, on-rails tour, cloud+PBR render pipeline"
```

---

### Task 5: Register experiment + e2e smoke

**Files:**
- Modify: `src/experiments/index.js` (add lazy import + registry entry)
- Modify: `e2e/lab-gallery.spec.js` (add id, bump count 13 → 14)
- Modify: `src/pages/Gallery/Gallery.css` (add a `.planet-cloud` card look)

**Interfaces:**
- Consumes: `CloudGallery` default export (Task 4).
- Produces: route `/gallery/cloud-gallery` and gallery carousel card.

- [ ] **Step 1: Add the lazy import**

In `src/experiments/index.js`, add after the `CosmicMirror` lazy import line:

```js
const CloudGallery = lazy(() => import('./CloudGallery/CloudGallery'))
```

- [ ] **Step 2: Add the registry entry**

In `src/experiments/index.js`, append this object as the last element of the `experiments` array (after the `cosmic-mirror` entry, inside the closing `]`):

```js
  {
    id: 'cloud-gallery',
    title: 'Cloud Gallery',
    description:
      '구름바다 위를 미끄러지듯 흐르는 시네마틱 투어. 코드로 빚은 추상 조각들이 맑은 공중에 떠 있고, 유리·금속·대리석 재질이 환경광을 실시간으로 반사합니다. 스크롤이나 방향키로 다음 작품으로 부드럽게 날아갑니다.',
    tags: ['glsl', 'raymarching', 'pbr'],
    color: '#8ec5ff',
    planet: 'cloud',
    planetName: 'NIMBUS',
    symbol: '☁',
    fullscreen: true,
    component: CloudGallery,
  },
```

- [ ] **Step 3: Add the planet card style**

In `src/pages/Gallery/Gallery.css`, append a cloud card surface (matches the existing `.planet-<name> .planet-surface` pattern):

```css
.planet-cloud .planet-surface {
  background: radial-gradient(circle at 34% 30%, #eaf4ff 0%, #9cc4f0 46%, #5b86c4 100%);
}
.planet-cloud .planet-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 60% 62%, rgba(255, 255, 255, 0.9) 0 10%, transparent 12%),
    radial-gradient(circle at 40% 70%, rgba(255, 255, 255, 0.8) 0 9%, transparent 11%),
    radial-gradient(circle at 72% 44%, rgba(255, 255, 255, 0.75) 0 7%, transparent 9%);
  opacity: 0.85;
}
```

- [ ] **Step 4: Update the e2e list and count**

In `e2e/lab-gallery.spec.js`: add `'cloud-gallery',` as the last entry of the `ids` array, and change the count assertion from 13 to 14:

```js
test('gallery shows 14 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(14)
})
```

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS — including the new `cloudPath`, `sculptures`, and `clouds.glsl` tests, and no regressions.

- [ ] **Step 6: Run the e2e smoke for the new route**

Run: `npx playwright test e2e/lab-gallery.spec.js`
Expected: PASS — `experiment cloud-gallery renders a canvas without console errors` is green and the count test reads 14. (If Playwright browsers aren't installed, run `npx playwright install` first.)

- [ ] **Step 7: Commit**

```bash
git add src/experiments/index.js e2e/lab-gallery.spec.js src/pages/Gallery/Gallery.css
git commit -m "feat(cloud-gallery): register experiment + gallery card + e2e smoke"
```

---

## Self-Review

**Spec coverage:**
- On-rails cloud-sea tour of procedural sculptures → Tasks 1–4. ✓
- Custom volumetric cloud shader (approach 2) → Task 3. ✓
- Layer separation (clouds below, sculptures above) → Task 4 (`LOW/HIGH` slab below path; sculptures at height 0; camera up-offset waypoints). ✓
- PBR materials + environment reflections → Task 4 (`RoomEnvironment` PMREM + physical/standard materials). ✓
- Pure testable path + layout modules → Tasks 1, 2. ✓
- Subtle bloom via `three/addons` (no new dep) → Task 4 (`UnrealBloomPass` + `OutputPass`). ✓
- Scroll / arrow / touch navigation with eased progress → Task 4. ✓
- Minimal UI (label, caption, dots, hint) → Task 4. ✓
- Perf/fallback (DPR clamp, offscreen skip, reduced-motion) → Task 4. Note: the raymarch loop bound is a GLSL compile-time constant, so the mobile lever is DPR reduction (narrow → 1.1) rather than a runtime step count — same intent as the spec, implementation differs. ✓
- Teardown disposes geometries/materials/RT/pmrem/composer/renderer with a `running=false` guard → Task 4. ✓
- Registry entry + gallery card + e2e → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `samplePath(waypoints, t)`/`stopT(index, count)` (Task 1) and `SCULPTURES`/`layout`/`waypoints` (Task 2) are consumed with matching signatures in Task 4. `CLOUD_FRAG` uniform names (Task 3) match the `bgUniforms` keys driven in Task 4. Registry entry keys match the shape used across `index.js`. ✓
