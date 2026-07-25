# Non-Euclidean Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lab experiment where visitors walk in first person through a gallery whose rooms connect via render-target portals into four non-Euclidean illusions (bigger-inside room, infinite corridor, impossible loop, gravity flip).

**Architecture:** The world is a graph of rooms (each its own local coordinate space) joined by portals (edges carrying a rigid transform). The player is always in one current room; crossing a portal swaps the current room and rebases the camera by the portal's entry→exit transform. Portals are rendered by drawing the destination room's view into a `WebGLRenderTarget` with an oblique clipping plane, mapped onto the portal quad. Raw three.js, matching every existing 3D experiment.

**Tech Stack:** React 19 (`useEffect`/`useRef` shell only, no R3F), three.js 0.184 (`three/addons/...`), vitest (unit, imports `three` directly), Playwright (e2e smoke).

## Global Constraints

- **No R3F.** Raw three.js only, mirroring `src/experiments/SolarSystem/SolarSystem.jsx` and `EarthExplorer.jsx` structure. `@react-three/fiber` is in deps but unused by experiments.
- **Registration:** adding one entry to `src/experiments/index.js` is the only wiring needed — routes `/gallery/:id` and `/gallery/:id/code` are generic (`src/App.jsx:293-294`).
- **Entry fields (verbatim):** `id: 'non-euclidean-portals'`, `title: 'Non-Euclidean Portals'`, `color: '#818cf8'`, `planet: 'mercury'`, `planetName: 'ESCHER'`, `symbol: '⧉'`, `tags: ['three.js', 'portals', 'non-euclidean']`, `fullscreen: true`. Korean `description` in house style.
- **Shell conventions:** import shared `../shared/exp.css`; root `<div>` uses a `nep-wrap` class plus the shared `exp-wrap` class; `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`; `ResizeObserver` for resize; full dispose on unmount (renderer, render targets, geometries, materials, textures, listeners, `cancelAnimationFrame`).
- **Accessibility:** honor `window.matchMedia('(prefers-reduced-motion: reduce)')` — disable head-bob when set.
- **Testing floor:** existing unit and e2e suites must stay green. New unit tests use `vitest` and may import from `three`. New e2e uses Playwright and asserts `errors` array is empty via `page.on('pageerror', ...)`.
- **File layout (all under `src/experiments/NonEuclideanPortals/`):** `NonEuclideanPortals.jsx`, `NonEuclideanPortals.css`, `portalMath.js`, `rooms.js`, `playerControls.js`, `Portal.js`, `portalManager.js`, plus `*.test.js` for the pure modules.

---

## Coordinate & Portal Conventions (read before Task 1)

These conventions are fixed for the whole plan; every task assumes them.

- A **room** is its own local space, y-up, floor at `y = 0`, camera eye height `EYE = 1.6`.
- A **portal** is a vertical rectangle. Its local frame: origin at the portal center, `+z` is the portal's **front normal** (the side you approach from), width along `±x`, height along `±y`. A portal's placement in its room is a `THREE.Matrix4` built from position + yaw.
- A portal `link`s to exactly one other portal. Walking through the front of portal A puts you behind portal B, emerging along B's `-z` (i.e. facing away from B's front). The relative transform therefore includes a 180° yaw flip.
- **Player state** at runtime: `{ roomId, position: Vector3, yaw: number, pitch: number, up: Vector3 }`. `up` is `(0,1,0)` except after a gravity-flip traversal.

---

### Task 1: `portalMath.js` — portal transform + crossing test

**Files:**
- Create: `src/experiments/NonEuclideanPortals/portalMath.js`
- Test: `src/experiments/NonEuclideanPortals/portalMath.test.js`

**Interfaces:**
- Consumes: `three` (`Matrix4`, `Vector3`, `Euler`, `Quaternion`).
- Produces:
  - `portalMatrix(position: Vector3, yaw: number): Matrix4` — world placement matrix of a portal from its center position and yaw (rotation about y).
  - `relativePortalMatrix(entry: Matrix4, exit: Matrix4): Matrix4` — matrix mapping a point/orientation from the entry portal's room space into the exit portal's room space, including the 180° flip. Formula: `exit · rotY(π) · entry⁻¹`.
  - `crossedPortal(prev: Vector3, next: Vector3, entry: Matrix4, halfW: number, height: number): boolean` — true when the segment prev→next passes through the front face of the portal quad (crosses local `z=0` going front-to-back, with the crossing point inside `[-halfW,halfW] × [0,height]` in local x,y).

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/NonEuclideanPortals/portalMath.test.js
import { describe, it, expect } from 'vitest'
import { Vector3, Matrix4 } from 'three'
import { portalMatrix, relativePortalMatrix, crossedPortal } from './portalMath.js'

describe('portalMatrix', () => {
  it('places the portal at its position with yaw rotation', () => {
    const m = portalMatrix(new Vector3(2, 0, -3), Math.PI / 2)
    const pos = new Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBeCloseTo(2, 5)
    expect(pos.z).toBeCloseTo(-3, 5)
    // +z local axis rotated by +90° about y points toward +x
    const zAxis = new Vector3(0, 0, 1).transformDirection(m)
    expect(zAxis.x).toBeCloseTo(1, 5)
    expect(zAxis.z).toBeCloseTo(0, 5)
  })
})

describe('relativePortalMatrix', () => {
  it('a point at the entry portal center maps to the exit portal center', () => {
    const entry = portalMatrix(new Vector3(0, 0, 0), 0)
    const exit = portalMatrix(new Vector3(10, 0, 5), 0)
    const rel = relativePortalMatrix(entry, exit)
    const mapped = new Vector3(0, 0, 0).applyMatrix4(rel)
    expect(mapped.x).toBeCloseTo(10, 5)
    expect(mapped.z).toBeCloseTo(5, 5)
  })

  it('applies a 180° flip: a point just in front of entry lands just in front of exit', () => {
    const entry = portalMatrix(new Vector3(0, 0, 0), 0)   // front = +z
    const exit = portalMatrix(new Vector3(10, 0, 0), 0)   // front = +z
    const rel = relativePortalMatrix(entry, exit)
    // 1 unit in front of entry (local +z → world +z at entry)
    const p = new Vector3(0, 0, 1).applyMatrix4(rel)
    // after 180° flip it should be 1 unit in FRONT of exit as well (world +z)
    expect(p.x).toBeCloseTo(10, 5)
    expect(p.z).toBeCloseTo(1, 5)
  })
})

describe('crossedPortal', () => {
  const entry = portalMatrix(new Vector3(0, 0, 0), 0) // front +z, plane at z=0
  it('true when moving front-to-back through the quad', () => {
    const prev = new Vector3(0, 1.6, 0.3)
    const next = new Vector3(0, 1.6, -0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(true)
  })
  it('false when the crossing point is outside the quad width', () => {
    const prev = new Vector3(5, 1.6, 0.3)
    const next = new Vector3(5, 1.6, -0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
  it('false when moving back-to-front (wrong direction)', () => {
    const prev = new Vector3(0, 1.6, -0.3)
    const next = new Vector3(0, 1.6, 0.3)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
  it('false when both points are on the same side', () => {
    const prev = new Vector3(0, 1.6, 0.3)
    const next = new Vector3(0, 1.6, 0.1)
    expect(crossedPortal(prev, next, entry, 1.5, 3)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/NonEuclideanPortals/portalMath.test.js`
Expected: FAIL — "portalMatrix is not a function" (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/NonEuclideanPortals/portalMath.js
import { Matrix4, Vector3, Euler } from 'three'

// World placement matrix of a portal from center position + yaw (about y).
export function portalMatrix(position, yaw) {
  return new Matrix4().compose(
    position,
    new Matrix4().makeRotationY(yaw).extractRotationQuaternion?.() ??
      quatFromYaw(yaw),
    new Vector3(1, 1, 1),
  )
}

// three's Matrix4 has no extractRotationQuaternion; use a Quaternion helper.
import { Quaternion } from 'three'
function quatFromYaw(yaw) {
  return new Quaternion().setFromEuler(new Euler(0, yaw, 0))
}

const ROT_Y_180 = new Matrix4().makeRotationY(Math.PI)

// Maps entry-room space → exit-room space, with the 180° portal flip.
export function relativePortalMatrix(entry, exit) {
  const entryInv = new Matrix4().copy(entry).invert()
  return new Matrix4().copy(exit).multiply(ROT_Y_180).multiply(entryInv)
}

// True if segment prev→next passes through the portal's front face.
export function crossedPortal(prev, next, entry, halfW, height) {
  const inv = new Matrix4().copy(entry).invert()
  const p = prev.clone().applyMatrix4(inv)
  const n = next.clone().applyMatrix4(inv)
  // Front-to-back means local z goes from >0 to <=0.
  if (!(p.z > 0 && n.z <= 0)) return false
  const t = p.z / (p.z - n.z) // interpolation factor to z=0
  const x = p.x + (n.x - p.x) * t
  const y = p.y + (n.y - p.y) * t
  return x >= -halfW && x <= halfW && y >= 0 && y <= height
}
```

Then simplify `portalMatrix` to drop the fragile `??` — replace the whole function with:

```js
export function portalMatrix(position, yaw) {
  return new Matrix4().compose(position, quatFromYaw(yaw), new Vector3(1, 1, 1))
}
```

(and keep `quatFromYaw` defined above it; remove the earlier broken version).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/NonEuclideanPortals/portalMath.test.js`
Expected: PASS (4 describes, all green).

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/portalMath.js src/experiments/NonEuclideanPortals/portalMath.test.js
git commit -m "feat(non-euclidean-portals): add portal transform + crossing math"
```

---

### Task 2: `rooms.js` — declarative room graph + integrity validation

**Files:**
- Create: `src/experiments/NonEuclideanPortals/rooms.js`
- Test: `src/experiments/NonEuclideanPortals/rooms.test.js`

**Interfaces:**
- Consumes: nothing (plain data + a validator).
- Produces:
  - `ROOMS: Record<string, Room>` where `Room = { id, accent: number, size: {w,d,h}, walls: AABB[], portals: PortalDef[], gravityUp?: [x,y,z] }`, `AABB = { min:[x,z], max:[x,z] }`, `PortalDef = { id, position:[x,y,z], yaw, halfW, height, link }`.
  - `validateRooms(rooms): string[]` — returns a list of problems (empty array = valid). Checks: every `portal.link` refers to a portal id that exists; links are symmetric (if A links B, B links A); no portal links to itself.
  - For this task only the **TARDIS pair** of rooms is defined (`small`, `hall`); later tasks add more rooms. The validator must already pass for the two-room graph.

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/NonEuclideanPortals/rooms.test.js
import { describe, it, expect } from 'vitest'
import { ROOMS, validateRooms } from './rooms.js'

describe('ROOMS graph', () => {
  it('has valid, symmetric portal links', () => {
    expect(validateRooms(ROOMS)).toEqual([])
  })

  it('every room has an id matching its key and at least one portal', () => {
    for (const [key, room] of Object.entries(ROOMS)) {
      expect(room.id).toBe(key)
      expect(room.portals.length).toBeGreaterThan(0)
    }
  })
})

describe('validateRooms', () => {
  it('flags a dangling link', () => {
    const bad = {
      a: { id: 'a', portals: [{ id: 'a1', link: 'nope' }] },
    }
    expect(validateRooms(bad)).toContain('a1 links to missing portal nope')
  })

  it('flags an asymmetric link', () => {
    const bad = {
      a: { id: 'a', portals: [{ id: 'a1', link: 'b1' }] },
      b: { id: 'b', portals: [{ id: 'b1', link: 'a1' }, { id: 'b2', link: 'a1' }] },
    }
    // a1<->b1 is fine, but b2->a1 while a1->b1 is asymmetric
    expect(validateRooms(bad).some((m) => m.includes('asymmetric'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/NonEuclideanPortals/rooms.test.js`
Expected: FAIL — cannot import `ROOMS` (module missing).

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/NonEuclideanPortals/rooms.js
// A room is a local y-up space, floor at y=0. Walls are axis-aligned boxes in
// the x/z plane used for point collision. Portals are vertical rectangles.

export const ROOMS = {
  // Small outer room: looks like a modest 6x6 chamber with a doorway portal.
  small: {
    id: 'small',
    accent: 0x818cf8,
    size: { w: 6, d: 6, h: 3 },
    walls: wallBox(6, 6, [
      { side: 'north', gap: { center: 0, width: 2 } }, // doorway on far wall
    ]),
    portals: [
      { id: 'small-door', position: [0, 1.5, -3], yaw: 0, halfW: 1, height: 3, link: 'hall-door' },
    ],
  },
  // The hall the doorway opens into is vastly larger than the small room.
  hall: {
    id: 'hall',
    accent: 0x818cf8,
    size: { w: 40, d: 60, h: 14 },
    walls: wallBox(40, 60, [
      { side: 'south', gap: { center: 0, width: 2 } }, // doorway back to small
    ]),
    portals: [
      { id: 'hall-door', position: [0, 1.5, 30], yaw: Math.PI, halfW: 1, height: 3, link: 'small-door' },
    ],
  },
}

// Build 4 perimeter wall AABBs for a w×d room centered at origin, with optional
// gaps (doorways) so the player can pass through where a portal sits.
function wallBox(w, d, gaps = []) {
  const t = 0.3 // wall thickness
  const hw = w / 2
  const hd = d / 2
  const byside = Object.fromEntries(gaps.map((g) => [g.side, g.gap]))
  const walls = []
  // north (−z) and south (+z) run along x
  for (const [side, z] of [['north', -hd], ['south', hd]]) {
    const gap = byside[side]
    if (!gap) {
      walls.push({ min: [-hw, z - t], max: [hw, z + t] })
    } else {
      const gl = gap.center - gap.width / 2
      const gr = gap.center + gap.width / 2
      walls.push({ min: [-hw, z - t], max: [gl, z + t] })
      walls.push({ min: [gr, z - t], max: [hw, z + t] })
    }
  }
  // east (+x) and west (−x) run along z
  for (const [side, x] of [['east', hw], ['west', -hw]]) {
    const gap = byside[side]
    if (!gap) {
      walls.push({ min: [x - t, -hd], max: [x + t, hd] })
    } else {
      const gl = gap.center - gap.width / 2
      const gr = gap.center + gap.width / 2
      walls.push({ min: [x - t, -hd], max: [x + t, gl] })
      walls.push({ min: [x - t, gr], max: [x + t, hd] })
    }
  }
  return walls
}

export function validateRooms(rooms) {
  const problems = []
  const byId = {}
  for (const room of Object.values(rooms)) {
    for (const p of room.portals) byId[p.id] = p
  }
  for (const room of Object.values(rooms)) {
    for (const p of room.portals) {
      if (p.link === p.id) problems.push(`${p.id} links to itself`)
      const target = byId[p.link]
      if (!target) {
        problems.push(`${p.id} links to missing portal ${p.link}`)
        continue
      }
      if (target.link !== p.id) {
        problems.push(`asymmetric link: ${p.id}→${p.link} but ${target.id}→${target.link}`)
      }
    }
  }
  return problems
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/NonEuclideanPortals/rooms.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/rooms.js src/experiments/NonEuclideanPortals/rooms.test.js
git commit -m "feat(non-euclidean-portals): add room-graph data + link validation"
```

---

### Task 3: `playerControls.js` — collision-resolved movement (TDD core)

**Files:**
- Create: `src/experiments/NonEuclideanPortals/playerControls.js`
- Test: `src/experiments/NonEuclideanPortals/playerControls.test.js`

**Interfaces:**
- Consumes: `three` (`Vector3`), `rooms.js` AABB shape.
- Produces:
  - `resolveMove(pos: Vector3, delta: Vector3, walls: AABB[], radius=0.35): Vector3` — returns the new position after applying `delta` (x,z only) and sliding out of any wall AABB the player would penetrate. y is passed through unchanged.
  - `moveVector(yaw: number, input: {f,b,l,r}, speed: number): Vector3` — camera-relative movement delta on the x/z plane from key state.

- [ ] **Step 1: Write the failing test**

```js
// src/experiments/NonEuclideanPortals/playerControls.test.js
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { resolveMove, moveVector } from './playerControls.js'

const wall = [{ min: [-5, 2.7], max: [5, 3.3] }] // a wall slab near z=3

describe('resolveMove', () => {
  it('passes through open space unchanged', () => {
    const out = resolveMove(new Vector3(0, 1.6, 0), new Vector3(0, 0, 1), wall)
    expect(out.z).toBeCloseTo(1, 5)
  })
  it('stops the player before entering a wall from the front', () => {
    const out = resolveMove(new Vector3(0, 1.6, 2), new Vector3(0, 0, 1), wall, 0.35)
    // wall front face at z=2.7, minus radius 0.35 → clamp near z≈2.35
    expect(out.z).toBeLessThan(2.7)
    expect(out.z).toBeGreaterThan(2)
  })
  it('slides along a wall: blocked z but free x', () => {
    const out = resolveMove(new Vector3(0, 1.6, 2.5), new Vector3(1, 0, 1), wall, 0.35)
    expect(out.x).toBeCloseTo(1, 5)     // x movement preserved
    expect(out.z).toBeLessThan(2.7)     // z movement blocked
  })
})

describe('moveVector', () => {
  it('forward with yaw=0 moves toward -z', () => {
    const d = moveVector(0, { f: true, b: false, l: false, r: false }, 1)
    expect(d.z).toBeCloseTo(-1, 5)
    expect(d.x).toBeCloseTo(0, 5)
  })
  it('strafe right with yaw=0 moves toward +x', () => {
    const d = moveVector(0, { f: false, b: false, l: false, r: true }, 1)
    expect(d.x).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/experiments/NonEuclideanPortals/playerControls.test.js`
Expected: FAIL — `resolveMove is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/experiments/NonEuclideanPortals/playerControls.js
import { Vector3 } from 'three'

// Camera-relative movement delta on the x/z plane. yaw=0 looks toward -z.
export function moveVector(yaw, input, speed) {
  let fx = 0
  let fz = 0
  if (input.f) fz -= 1
  if (input.b) fz += 1
  if (input.l) fx -= 1
  if (input.r) fx += 1
  const len = Math.hypot(fx, fz)
  if (len === 0) return new Vector3(0, 0, 0)
  fx /= len
  fz /= len
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  // rotate (fx,fz) by yaw about y
  const dx = fx * cos + fz * sin
  const dz = -fx * sin + fz * cos
  return new Vector3(dx * speed, 0, dz * speed)
}

// Apply delta.x then delta.z independently, rejecting the axis if it would put
// the player (a circle of `radius`) inside any wall AABB. This yields wall slide.
export function resolveMove(pos, delta, walls, radius = 0.35) {
  const out = pos.clone()
  const tryAxis = (nx, nz) => {
    for (const w of walls) {
      if (
        nx > w.min[0] - radius && nx < w.max[0] + radius &&
        nz > w.min[1] - radius && nz < w.max[1] + radius
      ) return false
    }
    return true
  }
  if (delta.x !== 0 && tryAxis(out.x + delta.x, out.z)) out.x += delta.x
  if (delta.z !== 0 && tryAxis(out.x, out.z + delta.z)) out.z += delta.z
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/experiments/NonEuclideanPortals/playerControls.test.js`
Expected: PASS.

Note the front-clamp test asserts `z < 2.7 && z > 2`: with axis rejection the player stays at 2.5 (rejected), which satisfies both bounds. Confirm the test passes as written; if `resolveMove` ever changes to true clamping, keep the same bounds.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/playerControls.js src/experiments/NonEuclideanPortals/playerControls.test.js
git commit -m "feat(non-euclidean-portals): add camera-relative movement + wall collision"
```

---

### Task 4: Experiment shell + registration — one static room renders

**Files:**
- Create: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx`
- Create: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.css`
- Modify: `src/experiments/index.js` (add lazy import + array entry)
- Test: `e2e/non-euclidean-portals.spec.js`

**Interfaces:**
- Consumes: `ROOMS` (Task 2), `moveVector`/`resolveMove` (Task 3). Portals not yet rendered — this task renders the `small` room walls/floor and lets the player look and walk with collision.
- Produces: a mounted experiment at `/gallery/non-euclidean-portals`; `window`-level nothing. Later tasks extend the `useEffect` body.

- [ ] **Step 1: Write the failing test**

```js
// e2e/non-euclidean-portals.spec.js
import { test, expect } from '@playwright/test'

test('non-euclidean portals: 진입 → 캔버스 렌더 → 콘솔 에러 없음', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/gallery/non-euclidean-portals')
  await expect(page.locator('.nep-wrap canvas')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.nep-start')).toBeVisible() // click-to-start overlay

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/non-euclidean-portals.spec.js`
Expected: FAIL — route renders nothing / `.nep-wrap canvas` never appears (experiment not registered).

- [ ] **Step 3a: Register the experiment**

In `src/experiments/index.js`, add the lazy import next to the others:

```js
const NonEuclideanPortals = lazy(() => import('./NonEuclideanPortals/NonEuclideanPortals'))
```

And append this entry to the `experiments` array (after `earth-explorer`):

```js
  {
    id: 'non-euclidean-portals',
    title: 'Non-Euclidean Portals',
    description: '겉보기보다 큰 방, 끝없는 복도, 불가능한 고리 — 포탈로 이어진 비유클리드 갤러리를 1인칭으로 걷습니다. 카메라가 움직여야만 착시가 드러납니다.',
    tags: ['three.js', 'portals', 'non-euclidean'],
    color: '#818cf8',
    planet: 'mercury',
    planetName: 'ESCHER',
    symbol: '⧉',
    fullscreen: true,
    component: NonEuclideanPortals,
  },
```

- [ ] **Step 3b: Write the CSS**

```css
/* src/experiments/NonEuclideanPortals/NonEuclideanPortals.css */
.nep-wrap { cursor: default; }
.nep-wrap.locked { cursor: none; }

.nep-start {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(8, 8, 14, 0.72);
  z-index: 20;
  cursor: pointer;
}
.nep-start h2 {
  font-family: var(--font-mono, monospace);
  font-size: 15px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.82);
  font-weight: 500;
}
.nep-start p {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
}
.nep-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  z-index: 10;
}
.nep-roomlabel {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 10;
}
```

- [ ] **Step 3c: Write the shell component (static `small` room + walk/look)**

```jsx
// src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'
import './NonEuclideanPortals.css'
import { ROOMS } from './rooms.js'
import { moveVector, resolveMove } from './playerControls.js'

const EYE = 1.6
const SPEED = 3.2 // units/sec

export default function NonEuclideanPortals() {
  const wrapRef = useRef()
  const [started, setStarted] = useState(false)
  const [roomLabel, setRoomLabel] = useState('THE SMALL ROOM')
  const apiRef = useRef({})

  useEffect(() => {
    const wrap = wrapRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)
    scene.fog = new THREE.Fog(0x0a0a0f, 8, 55)

    const camera = new THREE.PerspectiveCamera(72, wrap.clientWidth / wrap.clientHeight, 0.05, 500)
    camera.position.set(0, EYE, 2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x0a0a0f)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0x5560a0, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 0.8)
    key.position.set(4, 10, 6)
    scene.add(key)

    // Build the `small` room geometry.
    const room = ROOMS.small
    const group = buildRoomMesh(room)
    scene.add(group)

    // Player state.
    const player = { yaw: 0, pitch: 0, pos: new THREE.Vector3(0, EYE, 2) }
    const keys = { f: false, b: false, l: false, r: false }

    const onKey = (down) => (e) => {
      const k = e.code
      if (k === 'KeyW' || k === 'ArrowUp') keys.f = down
      else if (k === 'KeyS' || k === 'ArrowDown') keys.b = down
      else if (k === 'KeyA' || k === 'ArrowLeft') keys.l = down
      else if (k === 'KeyD' || k === 'ArrowRight') keys.r = down
    }
    const kd = onKey(true)
    const ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    // Mouse look via Pointer Lock; drag-look fallback.
    const onMouse = (e) => {
      if (document.pointerLockElement !== renderer.domElement) return
      player.yaw -= e.movementX * 0.0022
      player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.3, 1.3)
    }
    document.addEventListener('mousemove', onMouse)

    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e) => {
      if (document.pointerLockElement === renderer.domElement) return
      dragging = true; lastX = e.clientX; lastY = e.clientY
    }
    const onMove = (e) => {
      if (!dragging) return
      player.yaw -= (e.clientX - lastX) * 0.004
      player.pitch = clamp(player.pitch - (e.clientY - lastY) * 0.004, -1.3, 1.3)
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = () => { dragging = false }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    apiRef.current.requestLock = () => renderer.domElement.requestPointerLock?.()

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const delta = moveVector(player.yaw, keys, SPEED * dt)
      player.pos = resolveMove(player.pos, delta, room.walls)
      camera.position.copy(player.pos)
      camera.rotation.set(0, 0, 0, 'YXZ')
      camera.rotateY(player.yaw)
      camera.rotateX(player.pitch)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('mousemove', onMouse)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div ref={wrapRef} className={`exp-wrap nep-wrap${started ? ' locked' : ''}`}>
      {started && <div className="nep-crosshair" />}
      {started && <div className="nep-roomlabel">{roomLabel}</div>}
      {!started && (
        <div
          className="nep-start"
          onClick={() => { setStarted(true); apiRef.current.requestLock?.() }}
        >
          <h2>NON-EUCLIDEAN PORTALS</h2>
          <p>클릭해 시작 · WASD 이동 · 마우스로 시점</p>
        </div>
      )}
    </div>
  )
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

// Floor + ceiling + perimeter walls (from room.walls AABBs), matte greyscale.
function buildRoomMesh(room) {
  const g = new THREE.Group()
  const { w, d, h } = room.size
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.95 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1c26, roughness: 0.9 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat)
  floor.rotation.x = -Math.PI / 2
  g.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = h
  g.add(ceil)
  for (const wl of room.walls) {
    const bw = wl.max[0] - wl.min[0]
    const bd = wl.max[1] - wl.min[1]
    const box = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), wallMat)
    box.position.set((wl.min[0] + wl.max[0]) / 2, h / 2, (wl.min[1] + wl.max[1]) / 2)
    g.add(box)
  }
  return g
}
```

- [ ] **Step 4: Run the e2e + manual verify**

Run: `npx playwright test e2e/non-euclidean-portals.spec.js`
Expected: PASS — `.nep-wrap canvas` visible, `.nep-start` overlay visible, zero page errors.

Manual: `npm run dev`, open `/gallery/non-euclidean-portals`, click to start, confirm you can look (mouse) and walk (WASD) inside a small room and cannot pass through walls except the doorway gap. `reduced` is read but unused until head-bob is added in Task 8 — that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx src/experiments/NonEuclideanPortals/NonEuclideanPortals.css src/experiments/index.js e2e/non-euclidean-portals.spec.js
git commit -m "feat(non-euclidean-portals): register experiment + first-person shell in one room"
```

---

### Task 5: `Portal.js` + `portalManager.js` — render-target portals

**Files:**
- Create: `src/experiments/NonEuclideanPortals/Portal.js`
- Create: `src/experiments/NonEuclideanPortals/portalManager.js`
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (build all rooms, render portals)

**Interfaces:**
- Consumes: `portalMatrix`, `relativePortalMatrix` (Task 1), `ROOMS` (Task 2).
- Produces:
  - `class Portal { constructor(def, roomId); mesh; matrix; def; roomId; setTexture(tex) }` — a quad mesh sized `2*halfW × height` placed at `def.position`/`def.yaw`, using a `MeshBasicMaterial` whose map is its render-target texture.
  - `class PortalManager { constructor(renderer, roomsMeshes, portalsByRoom); render(scene, camera, currentRoomId, playerYaw) }` — for each visible portal in the current room, renders the linked room's view (via a virtual camera + oblique clip) into that portal's render target, then the caller renders the main scene. Recursion depth 1 (depth 2 flagged for the corridor in Task 7).

- [ ] **Step 1: Implement `Portal.js`**

```js
// src/experiments/NonEuclideanPortals/Portal.js
import * as THREE from 'three'
import { portalMatrix } from './portalMath.js'

export class Portal {
  constructor(def, roomId) {
    this.def = def
    this.roomId = roomId
    this.matrix = portalMatrix(new THREE.Vector3(...def.position), def.yaw)
    this.target = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })
    const geo = new THREE.PlaneGeometry(def.halfW * 2, def.height)
    // Plane is centered; shift so its base sits on the floor (portal y is center).
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.applyMatrix4(this.matrix)
    this.mesh.userData.portal = this
  }

  dispose() {
    this.target.dispose()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
```

- [ ] **Step 2: Implement `portalManager.js`**

```js
// src/experiments/NonEuclideanPortals/portalManager.js
import * as THREE from 'three'
import { relativePortalMatrix } from './portalMath.js'

export class PortalManager {
  // roomScenes: Map<roomId, THREE.Scene>, portalsById: Map<portalId, Portal>
  constructor(renderer, roomScenes, portalsById) {
    this.renderer = renderer
    this.roomScenes = roomScenes
    this.portalsById = portalsById
    this.virtualCam = new THREE.PerspectiveCamera()
  }

  // Render each portal in the current room by drawing the linked room from a
  // virtual camera transformed by the portal-to-portal relative matrix.
  renderPortalViews(currentRoomId, mainCam, portalsInRoom, depth = 1) {
    for (const portal of portalsInRoom) {
      const exit = this.portalsById.get(portal.def.link)
      if (!exit) continue
      const rel = relativePortalMatrix(portal.matrix, exit.matrix)

      // Virtual camera = main camera transformed into the exit room.
      this.virtualCam.copy(mainCam)
      this.virtualCam.matrixWorld.multiplyMatrices(rel, mainCam.matrixWorld)
      this.virtualCam.matrixWorld.decompose(
        this.virtualCam.position, this.virtualCam.quaternion, this.virtualCam.scale,
      )
      this.virtualCam.projectionMatrix.copy(mainCam.projectionMatrix)
      this.virtualCam.updateMatrixWorld(true)

      // Oblique near plane at the exit portal so geometry behind it is clipped.
      applyObliqueClip(this.virtualCam, exit.matrix)

      const exitScene = this.roomScenes.get(exit.roomId)
      const prevTarget = this.renderer.getRenderTarget()
      this.renderer.setRenderTarget(portal.target)
      this.renderer.clear()
      this.renderer.render(exitScene, this.virtualCam)
      this.renderer.setRenderTarget(prevTarget)
    }
  }
}

// Skew the projection matrix so its near plane coincides with the portal plane,
// clipping everything on the wrong side of the exit portal.
function applyObliqueClip(cam, portalMatrixWorld) {
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(portalMatrixWorld)
  const point = new THREE.Vector3().setFromMatrixPosition(portalMatrixWorld)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point)
  plane.applyMatrix4(cam.matrixWorldInverse) // into view space

  const clipPlane = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
  const proj = cam.projectionMatrix
  const q = new THREE.Vector4(
    (Math.sign(clipPlane.x) + proj.elements[8]) / proj.elements[0],
    (Math.sign(clipPlane.y) + proj.elements[9]) / proj.elements[5],
    -1,
    (1 + proj.elements[10]) / proj.elements[14],
  )
  const c = clipPlane.multiplyScalar(2 / clipPlane.dot(q))
  proj.elements[2] = c.x
  proj.elements[6] = c.y
  proj.elements[10] = c.z + 1
  proj.elements[14] = c.w
}
```

- [ ] **Step 3: Wire multi-room rendering into the shell**

Replace the single-room build in `NonEuclideanPortals.jsx`'s `useEffect` with: build a `THREE.Scene` per room (each holding that room's `buildRoomMesh` group + its portal meshes + lights), keep a `Map` of `roomId → scene` and `portalId → Portal`, instantiate `PortalManager`, and in `tick()` call `manager.renderPortalViews(currentRoomId, camera, portalsOfCurrentRoom)` **before** `renderer.render(currentScene, camera)`. Track `currentRoomId` in a ref (starts `'small'`). Add per-room `AmbientLight` + `DirectionalLight` (clone the light setup per scene since a light can only belong to one scene).

Concretely, the tick render section becomes:

```js
      // render portal destination views, then the current room
      const curScene = roomScenes.get(currentRoomId)
      const curPortals = portalsByRoom.get(currentRoomId) || []
      manager.renderPortalViews(currentRoomId, camera, curPortals)
      renderer.render(curScene, camera)
```

And setup (before `tick`):

```js
    const roomScenes = new Map()
    const portalsById = new Map()
    const portalsByRoom = new Map()
    for (const room of Object.values(ROOMS)) {
      const s = new THREE.Scene()
      s.background = new THREE.Color(0x0a0a0f)
      s.fog = new THREE.Fog(0x0a0a0f, 8, 80)
      s.add(new THREE.AmbientLight(0x5560a0, 0.5))
      const dl = new THREE.DirectionalLight(0xffffff, 0.8)
      dl.position.set(4, 10, 6)
      s.add(dl)
      s.add(buildRoomMesh(room))
      const ps = []
      for (const def of room.portals) {
        const p = new Portal(def, room.id)
        s.add(p.mesh)
        portalsById.set(def.id, p)
        ps.push(p)
      }
      portalsByRoom.set(room.id, ps)
      roomScenes.set(room.id, s)
    }
    let currentRoomId = 'small'
    const manager = new PortalManager(renderer, roomScenes, portalsById)
```

(Delete the old single `scene`/`buildRoomMesh(ROOMS.small)`/single-room `renderer.render(scene, camera)` code. Keep camera, lights-per-scene, player, controls.) Add portal disposal to cleanup: `portalsById.forEach((p) => p.dispose())`.

- [ ] **Step 4: Manual verify**

Run: `npm run dev`, open the experiment, start, and walk up to the doorway of the small room. Through the doorway you should see the **large hall** (bigger than the room you are standing in). The portal image should track correctly as you move side to side (parallax through the doorway). Traversal/teleport is NOT wired yet — walking into the portal will clip; that is expected and handled in Task 6.

Run the full unit suite to confirm nothing regressed: `npx vitest run`
Expected: all green (portalMath, rooms, playerControls + pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/Portal.js src/experiments/NonEuclideanPortals/portalManager.js src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx
git commit -m "feat(non-euclidean-portals): render-target portals with oblique clip (TARDIS view)"
```

---

### Task 6: Portal traversal — teleport on crossing (illusion #1 complete)

**Files:**
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (crossing detection + rebase)
- Modify: `e2e/non-euclidean-portals.spec.js` (assert room change)

**Interfaces:**
- Consumes: `crossedPortal`, `relativePortalMatrix` (Task 1).
- Produces: on crossing a portal, `currentRoomId` swaps and the player's position + yaw are rebased into the destination room; the room label updates.

- [ ] **Step 1: Add crossing detection in `tick()`**

After `player.pos = resolveMove(...)` and before copying to the camera, insert:

```js
      // portal traversal: did we cross any portal in the current room?
      for (const portal of (portalsByRoom.get(currentRoomId) || [])) {
        if (crossedPortal(prevPos, player.pos, portal.matrix, portal.def.halfW, portal.def.height)) {
          const exit = portalsById.get(portal.def.link)
          const rel = relativePortalMatrix(portal.matrix, exit.matrix)
          // rebase position
          player.pos.applyMatrix4(rel)
          // rebase yaw: the relative matrix includes a 180° flip
          player.yaw += yawOf(rel)
          currentRoomId = exit.roomId
          setRoomLabel(LABELS[currentRoomId] || currentRoomId.toUpperCase())
          break
        }
      }
```

Add a `prevPos` snapshot at the top of `tick()` (before movement): `const prevPos = player.pos.clone()`.

Add these helpers near `clamp`:

```js
const LABELS = { small: 'THE SMALL ROOM', hall: 'IMPOSSIBLE HALL' }

function yawOf(m) {
  // extract yaw (rotation about y) from a rigid matrix
  const e = m.elements
  return Math.atan2(e[8], e[10])
}
```

Import `crossedPortal` and `relativePortalMatrix` at the top:

```js
import { crossedPortal, relativePortalMatrix } from './portalMath.js'
```

- [ ] **Step 2: Extend the e2e to assert traversal**

Append to the existing test (or add a second test) in `e2e/non-euclidean-portals.spec.js`:

```js
test('non-euclidean portals: 포탈 통과 시 방 라벨이 바뀐다', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/gallery/non-euclidean-portals')
  await expect(page.locator('.nep-wrap canvas')).toBeVisible({ timeout: 15000 })
  await page.locator('.nep-start').click()

  await expect(page.locator('.nep-roomlabel')).toHaveText('THE SMALL ROOM')
  // hold W to walk forward through the doorway into the hall
  await page.keyboard.down('KeyW')
  await expect(page.locator('.nep-roomlabel')).toHaveText('IMPOSSIBLE HALL', { timeout: 8000 })
  await page.keyboard.up('KeyW')

  expect(errors).toEqual([])
})
```

- [ ] **Step 3: Run the e2e to verify**

Run: `npx playwright test e2e/non-euclidean-portals.spec.js`
Expected: PASS — label transitions from THE SMALL ROOM to IMPOSSIBLE HALL after walking forward; zero page errors.

Manual: confirm the transition is seamless (no visible jump/flash) when walking through the doorway, and that after entering the hall you can turn around and walk back through into the small room.

- [ ] **Step 4: Commit**

```bash
git add src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx e2e/non-euclidean-portals.spec.js
git commit -m "feat(non-euclidean-portals): seamless portal traversal (bigger-inside illusion done)"
```

---

### Task 7: Infinite corridor (illusion #2)

**Files:**
- Modify: `src/experiments/NonEuclideanPortals/rooms.js` (+ `corridor` room, + link into the graph)
- Modify: `src/experiments/NonEuclideanPortals/rooms.test.js` (validation still passes)
- Modify: `src/experiments/NonEuclideanPortals/portalManager.js` (recursion depth 2)
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (label)

**Interfaces:**
- Consumes: existing room/portal machinery.
- Produces: a corridor whose far portal links to its own near portal, so forward walking never ends. To keep depth-perception convincing, portal views recurse to depth 2.

- [ ] **Step 1: Add the corridor to `rooms.js`**

Add a third room. The corridor is long along z; its two ends are portals linked to **each other** so exiting the far end re-enters the near end. Reachable from the hall via a new portal pair (`hall-arch` ↔ `corridor-mouth`).

```js
  corridor: {
    id: 'corridor',
    accent: 0x818cf8,
    size: { w: 4, d: 40, h: 4 },
    walls: wallBox(4, 40, [
      { side: 'north', gap: { center: 0, width: 2 } }, // far loop portal
      { side: 'south', gap: { center: 0, width: 2 } }, // near end + mouth
    ]),
    portals: [
      // near end (entry from hall) and far end loop back to each other
      { id: 'corridor-near', position: [0, 1.5, 20], yaw: Math.PI, halfW: 1, height: 3, link: 'corridor-far' },
      { id: 'corridor-far',  position: [0, 1.5, -20], yaw: 0, halfW: 1, height: 3, link: 'corridor-near' },
      // mouth: a side portal that returns to the hall
      { id: 'corridor-mouth', position: [2, 1.5, 18], yaw: -Math.PI / 2, halfW: 1, height: 3, link: 'hall-arch' },
    ],
  },
```

And add the matching portal in `hall` (append to `hall.portals`):

```js
    { id: 'hall-arch', position: [18, 1.5, 0], yaw: Math.PI / 2, halfW: 1, height: 3, link: 'corridor-mouth' },
```

Also widen `hall.walls` to include an east-wall gap for `hall-arch` by changing `hall`'s `wallBox(40, 60, [...])` gaps array to include `{ side: 'east', gap: { center: 0, width: 2 } }` alongside the existing south gap.

- [ ] **Step 2: Confirm validation still passes**

Run: `npx vitest run src/experiments/NonEuclideanPortals/rooms.test.js`
Expected: PASS — `validateRooms` returns `[]` (corridor-near↔corridor-far and hall-arch↔corridor-mouth are symmetric).

If it fails on symmetry, fix the `link` ids so every pair points back at each other.

- [ ] **Step 3: Add recursion depth to portal views**

In `portalManager.js`, make `renderPortalViews` recurse: after computing the virtual camera and before rendering, if `depth > 1`, recurse for the exit room's portals using the virtual camera as the new main camera, rendering into their targets first. Replace the method body's render section with:

```js
      const exitScene = this.roomScenes.get(exit.roomId)
      if (depth > 1) {
        const exitPortals = []
        exitScene.traverse((o) => { if (o.userData.portal) exitPortals.push(o.userData.portal) })
        this.renderPortalViews(exit.roomId, this.virtualCam, exitPortals, depth - 1)
      }
      const prevTarget = this.renderer.getRenderTarget()
      this.renderer.setRenderTarget(portal.target)
      this.renderer.clear()
      this.renderer.render(exitScene, this.virtualCam)
      this.renderer.setRenderTarget(prevTarget)
```

Note: `virtualCam` is reused across iterations, so capture per-portal state before recursing — snapshot `this.virtualCam` into a local `THREE.Matrix4`/new camera if artifacts appear. For depth 2 with one visible loop portal this is acceptable; if the corridor flickers, allocate a fresh `PerspectiveCamera` per recursion level instead of reusing `this.virtualCam`.

In the shell's `tick`, call the corridor with depth 2 only when `currentRoomId === 'corridor'`:

```js
      manager.renderPortalViews(currentRoomId, camera, curPortals, currentRoomId === 'corridor' ? 2 : 1)
```

- [ ] **Step 4: Add the label + manual verify**

In `NonEuclideanPortals.jsx`, extend `LABELS`:

```js
const LABELS = { small: 'THE SMALL ROOM', hall: 'IMPOSSIBLE HALL', corridor: 'ENDLESS CORRIDOR' }
```

Manual: `npm run dev` → from the hall, walk through the east arch into the corridor. Walking forward down the corridor should never reach an end — the far doorway always shows more corridor, and crossing it seamlessly returns you to the near end. Turn to the side portal (`mouth`) to walk back to the hall.

Run: `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/rooms.js src/experiments/NonEuclideanPortals/rooms.test.js src/experiments/NonEuclideanPortals/portalManager.js src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx
git commit -m "feat(non-euclidean-portals): endless corridor via self-linked portals (depth-2 views)"
```

---

### Task 8: Impossible loop (illusion #3) + head-bob polish

**Files:**
- Modify: `src/experiments/NonEuclideanPortals/rooms.js` (+ `loop` rooms A/B/C)
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (labels + head-bob under reduced-motion guard)

**Interfaces:**
- Consumes: existing machinery.
- Produces: three chambers linked so that three left turns return to the start (topologically impossible), reachable from the hall; plus subtle walk head-bob disabled when `prefers-reduced-motion`.

- [ ] **Step 1: Add the loop rooms**

Add three small chambers whose exit portals chain A→B→C→A, each turn 90° so the geometry cannot close in Euclidean space. Link one chamber back to the hall via a portal pair (`hall-loop` ↔ `loopA-in`).

```js
  loopA: {
    id: 'loopA', accent: 0x9f7cf8, size: { w: 8, d: 8, h: 3.5 },
    walls: wallBox(8, 8, [
      { side: 'south', gap: { center: 0, width: 2 } }, // in from hall
      { side: 'east',  gap: { center: 0, width: 2 } }, // out to B
    ]),
    portals: [
      { id: 'loopA-in',  position: [0, 1.5, 4],  yaw: Math.PI,      halfW: 1, height: 3, link: 'hall-loop' },
      { id: 'loopA-out', position: [4, 1.5, 0],  yaw: Math.PI / 2,  halfW: 1, height: 3, link: 'loopB-in' },
    ],
  },
  loopB: {
    id: 'loopB', accent: 0x9f7cf8, size: { w: 8, d: 8, h: 3.5 },
    walls: wallBox(8, 8, [
      { side: 'south', gap: { center: 0, width: 2 } },
      { side: 'east',  gap: { center: 0, width: 2 } },
    ]),
    portals: [
      { id: 'loopB-in',  position: [0, 1.5, 4], yaw: Math.PI,     halfW: 1, height: 3, link: 'loopA-out' },
      { id: 'loopB-out', position: [4, 1.5, 0], yaw: Math.PI / 2, halfW: 1, height: 3, link: 'loopC-in' },
    ],
  },
  loopC: {
    id: 'loopC', accent: 0x9f7cf8, size: { w: 8, d: 8, h: 3.5 },
    walls: wallBox(8, 8, [
      { side: 'south', gap: { center: 0, width: 2 } },
      { side: 'east',  gap: { center: 0, width: 2 } },
    ]),
    portals: [
      { id: 'loopC-in',  position: [0, 1.5, 4], yaw: Math.PI,     halfW: 1, height: 3, link: 'loopB-out' },
      { id: 'loopC-out', position: [4, 1.5, 0], yaw: Math.PI / 2, halfW: 1, height: 3, link: 'loopA-in2' },
    ],
  },
```

To make three left turns loop back to A, `loopC-out` should link to a **second** entry portal in `loopA`. Add `loopA-in2` to `loopA.portals` and a west-wall gap for it:

```js
    // in loopA.portals, add:
    { id: 'loopA-in2', position: [-4, 1.5, 0], yaw: -Math.PI / 2, halfW: 1, height: 3, link: 'loopC-out' },
```

and add `{ side: 'west', gap: { center: 0, width: 2 } }` to `loopA`'s `wallBox` gaps.

Add the hall connector portal in `hall.portals`:

```js
    { id: 'hall-loop', position: [-18, 1.5, 0], yaw: -Math.PI / 2, halfW: 1, height: 3, link: 'loopA-in' },
```

and a west-wall gap in `hall`'s `wallBox`.

- [ ] **Step 2: Validation still passes**

Run: `npx vitest run src/experiments/NonEuclideanPortals/rooms.test.js`
Expected: PASS. If asymmetry is reported, align each `link` with its partner (loopA-out↔loopB-in, loopB-out↔loopC-in, loopC-out↔loopA-in2, loopA-in↔hall-loop).

- [ ] **Step 3: Labels + head-bob**

Extend `LABELS` with `loopA/loopB/loopC` → `'THE LOOP'`. In `tick()`, add a subtle vertical bob to the camera when moving and not reduced-motion:

```js
      // head-bob (skipped under reduced-motion)
      const moving = keys.f || keys.b || keys.l || keys.r
      bobPhase += moving ? dt * 9 : 0
      const bob = reduced || !moving ? 0 : Math.sin(bobPhase) * 0.035
      camera.position.copy(player.pos)
      camera.position.y += bob
```

Declare `let bobPhase = 0` alongside the other tick-scope locals (before `tick`). Replace the existing `camera.position.copy(player.pos)` line with the block above.

- [ ] **Step 4: Manual verify**

`npm run dev` → from the hall walk west into loopA. Take the exit, and keep taking the same-handed exit through B and C — after three turns you arrive back where you started, though the turns could never close a real square. Confirm head-bob is present normally and absent when the OS "reduce motion" setting is on (toggle it, reload).

Run: `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/rooms.js src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx
git commit -m "feat(non-euclidean-portals): impossible three-turn loop + reduced-motion head-bob"
```

---

### Task 9: Gravity flip (illusion #4)

**Files:**
- Modify: `src/experiments/NonEuclideanPortals/rooms.js` (+ `flip` room with a floor portal carrying a pitch rotation)
- Modify: `src/experiments/NonEuclideanPortals/portalMath.js` (+ full-orientation crossing support for non-yaw portals) and its test
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (apply full rotation, not just yaw, on this traversal)

**Interfaces:**
- Consumes: existing machinery.
- Produces: a portal whose transform includes a 90° pitch so the player emerges walking on what was a wall; the controller re-aligns its `up` vector.

**Note:** This is the hardest illusion. If the earlier tasks consumed the time budget, this task may be deferred without affecting illusions #1–#3 (they are independent). The spec designates gravity flip as the cut candidate.

- [ ] **Step 1: Generalize portal placement to allow pitch**

Add a pitch-aware matrix builder and crossing test to `portalMath.js`:

```js
export function portalMatrixEuler(position, euler /* THREE.Euler */) {
  return new Matrix4().compose(
    position,
    new Quaternion().setFromEuler(euler),
    new Vector3(1, 1, 1),
  )
}
```

Add a test in `portalMath.test.js`:

```js
import { Euler } from 'three'
import { portalMatrixEuler } from './portalMath.js'

describe('portalMatrixEuler', () => {
  it('a floor portal (pitch -90°) has its +z normal pointing up', () => {
    const m = portalMatrixEuler(new Vector3(0, 0, 0), new Euler(-Math.PI / 2, 0, 0))
    const n = new Vector3(0, 0, 1).transformDirection(m)
    expect(n.y).toBeCloseTo(1, 5)
  })
})
```

Run: `npx vitest run src/experiments/NonEuclideanPortals/portalMath.test.js` → PASS.

- [ ] **Step 2: Add the flip room**

The flip room has a floor portal (`flip-down`) linked to a wall portal in a `flip2` room, so crossing the floor drops you onto a new "floor" that was a wall. Represent portals that need pitch with an optional `euler: [x,y,z]` field on the `PortalDef`; `Portal.js` uses `portalMatrixEuler` when `def.euler` is present, else `portalMatrix(position, yaw)`.

```js
  flip: {
    id: 'flip', accent: 0x7cf8d0, size: { w: 8, d: 8, h: 4 },
    walls: wallBox(8, 8, [{ side: 'south', gap: { center: 0, width: 2 } }]),
    portals: [
      { id: 'flip-in',   position: [0, 1.5, 4], yaw: Math.PI, halfW: 1, height: 3, link: 'hall-flip' },
      // floor portal: lies flat, normal up
      { id: 'flip-down', position: [0, 0.02, -1], euler: [-Math.PI / 2, 0, 0], halfW: 1.5, height: 3, link: 'flip2-wall' },
    ],
  },
  flip2: {
    id: 'flip2', accent: 0x7cf8d0, size: { w: 8, d: 8, h: 4 },
    walls: wallBox(8, 8, [{ side: 'north', gap: { center: 0, width: 2 } }]),
    portals: [
      { id: 'flip2-wall', position: [0, 1.5, -4], yaw: 0, halfW: 1.5, height: 3, link: 'flip-down' },
      { id: 'flip2-back', position: [0, 1.5, 4], yaw: Math.PI, halfW: 1, height: 3, link: 'hall-flip2' },
    ],
  },
```

Add hall connectors `hall-flip` ↔ `flip-in` and `hall-flip2` ↔ `flip2-back` (append to `hall.portals`, add gaps to hall as needed — reuse an existing wall side with a second gap or place on the north wall). Update `Portal.js` constructor:

```js
    this.matrix = def.euler
      ? portalMatrixEuler(new THREE.Vector3(...def.position), new THREE.Euler(...def.euler))
      : portalMatrix(new THREE.Vector3(...def.position), def.yaw)
```

(import `portalMatrixEuler` and `THREE.Euler`).

- [ ] **Step 3: Apply full orientation on flip traversal**

The current traversal rebases only `yaw`. For portals with `euler` (or more generally, when the relative matrix tilts the up axis), rebase the player's full orientation and `up` vector. In `tick()`'s crossing block, replace the yaw-only rebase with:

```js
          player.pos.applyMatrix4(rel)
          // rebase orientation: transform current look basis by rel's rotation
          const rot = new THREE.Matrix4().extractRotation(rel)
          player.up.applyMatrix4(rot).normalize()
          player.yaw += yawOf(rel)
          // when up tilts away from world-y, re-derive pitch/yaw from the new basis
          // (keep simple: for flip portals, snap pitch to 0 and adopt new up)
          if (Math.abs(player.up.y) < 0.9) player.pitch = 0
```

Add `up: new THREE.Vector3(0, 1, 0)` to the `player` object. When building the camera each frame, orient it by `up`:

```js
      camera.up.copy(player.up)
```

placed before the rotation is applied. For a first pass, gravity along the room-local `-up` is approximated by keeping `player.pos.y` fixed per room; full gravity re-simulation is out of scope.

- [ ] **Step 4: Manual verify**

`npm run dev` → reach the flip room, walk onto the floor portal. You should emerge in `flip2` standing on what was a wall, with the previous floor now vertical beside you. Confirm you do not fall through the floor and can walk back out. Extend `LABELS` with `flip`/`flip2` → `'RELATIVITY'`.

Run: `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/rooms.js src/experiments/NonEuclideanPortals/portalMath.js src/experiments/NonEuclideanPortals/portalMath.test.js src/experiments/NonEuclideanPortals/Portal.js src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx
git commit -m "feat(non-euclidean-portals): gravity-flip room via floor portal with up-vector rebase"
```

---

### Task 10: Polish, mobile fallback, full-suite verification

**Files:**
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` (entry hint copy, touch move affordance, dispose audit)
- Modify: `src/experiments/NonEuclideanPortals/NonEuclideanPortals.css` (touch button)

**Interfaces:**
- Consumes: everything above.
- Produces: shipping-quality experiment; green unit + e2e suites.

- [ ] **Step 0: Visibility / lighting pass (from live QA finding)**

Live QA of Task 5 found the scene renders too dark to perceive the illusion: the near-black materials (`floorMat 0x14141c`, `wallMat 0x1c1c26`) under `AmbientLight(0x5560a0, 0.5)` + `DirectionalLight(0xffffff, 0.8)` make both the room and the hall-through-the-portal read as near-black, so the "bigger inside" effect is invisible. Raise legibility while keeping the dark, minimal concrete mood (the spec calls for "dark, minimal … soft ambient" — do not over-brighten to flat grey). Confirmed-legible starting values from QA (tune to taste, keep it moody): `AmbientLight(0x8090c0, ~1.1)`, `DirectionalLight(0xffffff, ~1.35)`, `floorMat ~0x2c2c38`, `wallMat ~0x3c3c48`. Use each room's `accent` (already in `rooms.js`) so destination rooms read as visually distinct from the room you stand in — e.g. tint that room's ambient or add a low-intensity accent-colored fill light per scene keyed off `room.accent` — which strengthens every illusion (you can tell you've entered a different space). Keep `prefers-reduced-motion` untouched here. After changing, reload `/gallery/non-euclidean-portals` and confirm via the controller's browser QA that through the small room's doorway the larger hall is clearly visible and distinctly toned.

- [ ] **Step 1: Touch move affordance**

On touch devices Pointer Lock is unavailable; drag-look already works, but there is no forward input. Add a hold-to-walk button shown only when `'ontouchstart' in window`. In the component render, after the crosshair:

```jsx
      {started && isTouch && (
        <button
          className="nep-move"
          onTouchStart={() => (apiRef.current.touchForward = true)}
          onTouchEnd={() => (apiRef.current.touchForward = false)}
        >▲ 이동</button>
      )}
```

Declare `const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window` in the component body, and in `tick()` OR the key state, treat `apiRef.current.touchForward` as `keys.f`:

```js
      keys.f = keys.f || !!apiRef.current.touchForward
```

CSS:

```css
.nep-move {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 26px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 10, 15, 0.6);
  color: rgba(255, 255, 255, 0.6);
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.1em;
  border-radius: 999px;
  z-index: 15;
}
```

- [ ] **Step 2: Dispose audit**

Confirm the cleanup function disposes: `raf` cancelled; `ResizeObserver` disconnected; all key/mouse/pointer listeners removed; `portalsById.forEach((p) => p.dispose())`; every room scene traversed for geometry/material disposal; `renderer.dispose()`; `renderer.domElement` removed. Add any missing disposals. Verify no leak by navigating in/out of the experiment 5× in dev with the browser Performance monitor — GPU memory should return to baseline.

- [ ] **Step 3: Run the full suites**

Run: `npx vitest run`
Expected: all unit tests green (existing + portalMath, rooms, playerControls).

Run: `npx playwright test`
Expected: all e2e green, including both non-euclidean-portals specs. If the traversal spec is flaky due to walk timing, raise its `timeout` but do not weaken the assertion.

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-07-22-non-euclidean-portals-design.md`, change the Status line to `Implemented (2026-07-22)` and note any deviations (e.g. if gravity flip was deferred).

- [ ] **Step 5: Commit**

```bash
git add src/experiments/NonEuclideanPortals/ docs/superpowers/specs/2026-07-22-non-euclidean-portals-design.md
git commit -m "feat(non-euclidean-portals): touch fallback, dispose audit, mark spec implemented"
```

---

## Self-Review (author's checklist — completed)

**Spec coverage:** graph-of-rooms model → Tasks 2,5,6; first-person control → Tasks 3,4; render-target portals + oblique clip → Task 5; TARDIS → Task 6; infinite corridor → Task 7; impossible loop → Task 8; gravity flip → Task 9; aesthetic (concrete/greyscale, accent, fog) → Task 4 `buildRoomMesh`; perf (depth caps, DPR cap, render-target size) → Tasks 4,5,7; reduced-motion → Task 8; touch/no-pointer-lock fallback → Tasks 4,10; cleanup/dispose → Tasks 4,10; unit tests (portalMath, rooms) → Tasks 1,2; e2e smoke + traversal → Tasks 4,6; registration → Task 4. All spec sections mapped.

**Placeholders:** none — every code step carries real code. The one intentional approximation (gravity uses fixed per-room y rather than full re-simulation) is stated explicitly in Task 9 and matches the spec's "desktop-first, gravity flip is the hard/cut-candidate" framing.

**Type consistency:** `portalMatrix(position, yaw)`, `relativePortalMatrix(entry, exit)`, `crossedPortal(prev, next, entry, halfW, height)`, `resolveMove(pos, delta, walls, radius)`, `moveVector(yaw, input, speed)`, `Portal(def, roomId)`, `PortalManager(renderer, roomScenes, portalsById)` with `renderPortalViews(currentRoomId, mainCam, portalsInRoom, depth)` — names used consistently across Tasks 1–10. `PortalDef` gains an optional `euler` field in Task 9, handled in `Portal` and validated by the same `validateRooms`.
