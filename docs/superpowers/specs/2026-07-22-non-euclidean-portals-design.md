# Non-Euclidean Portals — Design Spec

Date: 2026-07-22
Status: Approved (brainstorming). Not yet implemented.

## Goal

Add a new Lab experiment (`/gallery/non-euclidean-portals`) where visitors
walk in first person through a minimalist architectural gallery whose rooms
are connected by portals into spaces that cannot exist in Euclidean geometry.
The camera movement is the whole point: each illusion only reveals itself as
the visitor moves, so "camera-driven motion" is the core interaction, not a
garnish.

This is the first of a two-part effort chosen during brainstorming. Part two,
**Cosmic Zoom** (a "Powers of Ten" continuous dolly-zoom across scales), is a
separate spec to be written after this ships and is confirmed.

## Decisions (confirmed with user)

- **Camera control**: first-person free movement. Pointer Lock (WASD +
  mouse-look) on desktop; drag-look + tap/hold-to-move fallback where Pointer
  Lock is unavailable or on touch.
- **Illusions (all four)**: bigger-on-the-inside room (TARDIS), infinite
  corridor, impossible loop, gravity flip. Build order:
  TARDIS → infinite corridor → impossible loop → gravity flip. If scope must be
  trimmed, gravity flip is the cut candidate (it is the only one needing
  player up-vector / gravity re-orientation).
- **Portal rendering**: render-target portals (approach B). Render the
  destination room's view into a `WebGLRenderTarget`, map it onto the portal
  quad, with oblique near-plane clipping so nothing in front of the portal
  plane is drawn. Recursion depth 1 in general, depth 2 for the infinite
  corridor. Rejected: (A) stencil-buffer recursion — most accurate but the
  hardest to implement and debug in this codebase; (C) teleport-only with no
  see-through — cheapest but kills the TARDIS "small outside, vast inside"
  impact.
- **Rendering stack**: raw three.js, matching every existing 3D experiment
  (DeepSpace, SolarSystem, EarthExplorer, ParticleMorph, NeonRaymarch,
  SeoulNights). The project lists `@react-three/fiber` in dependencies but no
  experiment uses it; this experiment will not introduce R3F.
- **Aesthetic**: dark, minimal concrete/greyscale architectural gallery, soft
  ambient light, one subtle accent color per room. Fits the Lab's existing
  space/monochrome mood.

## Core idea — a graph of rooms

Non-Euclidean space cannot be expressed in a single coordinate system, so the
world is modelled as a **graph**: nodes are rooms (each its own local
coordinate space) and edges are portals (each carrying a rigid transform).
The player is always "in" exactly one current room. Crossing a portal swaps
the current room and applies the portal's entry→exit transform to the player's
position and orientation. This one model produces all four illusions:

- **TARDIS** — a small room's doorway portal links to a huge hall. The portal
  quad is small, but through it (and stepping through it) you are in a vast
  space.
- **Infinite corridor** — the corridor's far portal links back to its own
  entrance with a forward offset, so walking never reaches an end.
- **Impossible loop** — three rooms linked so that three left turns return you
  to the start (topologically impossible in Euclidean space); equivalently,
  two portals in one room linked to each other, Portal-game style.
- **Gravity flip** — a floor portal carries a rotation that re-aligns the
  player's up vector and gravity, so you emerge walking on what was a wall or
  ceiling (Escher "Relativity").

## Architecture

### 1. Experiment registration

- `src/experiments/NonEuclideanPortals/NonEuclideanPortals.jsx` +
  `NonEuclideanPortals.css`, importing shared `../shared/exp.css` like the
  other experiments.
- New entry in `src/experiments/index.js`, lazy-loaded:
  - `id: 'non-euclidean-portals'` → demo at `/gallery/non-euclidean-portals`,
    code view at `/gallery/non-euclidean-portals/code`.
  - `title: 'Non-Euclidean Portals'`, Korean `description` in the house style.
  - `fullscreen: true`.
  - `color: '#818cf8'`, `planet: 'mercury'` (rocky/grey surface matches the
    concrete gallery; `planet` is decorative and may repeat), `planetName:
    'ESCHER'`, `symbol: '⧉'`.
  - `tags: ['three.js', 'portals', 'non-euclidean']`.

### 2. File boundaries (units)

- **`NonEuclideanPortals.jsx`** — React shell: `useRef` canvas + `useEffect`
  mount/teardown, owns the three.js renderer, scene, animation loop, and the
  room-graph state. Mirrors SolarSystem/DeepSpace structure.
- **`playerControls.js`** — first-person controller: Pointer Lock request +
  WASD/mouse-look, drag-look/tap-move fallback, wall AABB collision, and
  portal-plane crossing detection. Pure-ish: takes input state + current room,
  returns next camera transform and (if crossed) the portal to traverse.
- **`Portal.js`** — one portal: a quad mesh, a `WebGLRenderTarget`, the linked
  portal reference, and the entry→exit rigid transform. Computes the virtual
  camera for its destination view and the oblique clipping plane.
- **`portalManager.js`** — per frame: gather visible portals, order the render
  passes, enforce recursion depth (1 default, 2 for the corridor), render each
  destination view into its target, then render the main scene.
- **`rooms.js`** — declarative definitions of the four rooms: walls, portals,
  lights, accent color. Data separated from logic so rooms are easy to reason
  about and test.
- **`portalMath.js`** — pure functions: the entry→exit relative transform, the
  virtual-camera matrix, the oblique projection matrix, and the player
  teleport transform. This is the unit-tested core.

### 3. Data flow (per frame)

1. Input (keyboard/mouse/touch) → `playerControls` resolves intended movement.
2. Collision against the current room's wall AABBs clamps the move.
3. If the move crosses a portal plane, `portalMath` computes the teleport
   transform; the player's camera is re-based into the destination room and
   `currentRoom` is swapped.
4. Render: `portalManager` renders each visible portal's destination view into
   its render target (respecting recursion depth), then the main camera renders
   the current room with portal quads textured by their targets.

### 4. Player controller details

- Eye height and walk speed fixed; optional subtle head-bob, disabled under
  `prefers-reduced-motion`.
- Collision is axis-aligned box tests against wall segments — no physics
  engine (matter-js is unrelated 2D and not used here).
- Gravity flip: the controller stores an `up` vector and a "floor normal" per
  room; the gravity-flip portal's transform rotates both, and mouse-look is
  computed relative to the current up vector.

### 5. Aesthetic & UX

- Concrete/greyscale walls, soft ambient + one directional light, gentle fog
  for depth. Each room gets one restrained accent color.
- Minimal on-screen guidance: a short prompt on entry ("클릭해 둘러보기 /
  WASD로 이동"), a small crosshair, and an unobtrusive room label. No HUD
  clutter.
- Entry screen: click-to-start (needed to request Pointer Lock) with a
  one-line explanation, matching the other experiments' quiet intros.

### 6. Performance & fallback

- Portals cost one extra render pass per visible portal per recursion level →
  cap simultaneous visible portals and recursion depth (1 default, 2 corridor),
  and scale render-target resolution (with a DPR cap on mobile).
- `prefers-reduced-motion`: remove head-bob, keep movement.
- Touch/no-Pointer-Lock: drag-look + on-screen move affordance (reduced mode);
  desktop is the primary target.
- WebGL context failure → show a graceful notice instead of a blank canvas,
  consistent with other experiments; no uncaught console errors.

### 7. Cleanup

On unmount: dispose renderer, all render targets, geometries, materials, and
textures, and remove listeners (Pointer Lock, resize, keyboard), following the
existing experiments' dispose pattern (SolarSystem, DeepSpace, EarthExplorer).

## Error handling

- Missing Pointer Lock support → automatically use drag-look fallback, no
  error surfaced.
- WebGL context loss → notice + safe teardown.
- A portal with no valid link is a no-op wall (defensive; should not occur with
  correct `rooms.js`).

## Testing

- **Unit (vitest, no WebGL)**: `portalMath` — entry→exit relative transform,
  virtual-camera matrix, oblique projection, and teleport transform
  correctness; `rooms.js` integrity (every portal links to an existing portal,
  no dangling edges).
- **e2e (Playwright)**: deterministic smoke like the EarthExplorer test —
  enter the page → canvas renders → scripted forward movement traverses at
  least one portal (assert room label / state change) → zero console errors.
  Visual illusion quality is manual QA.
- Existing unit and e2e suites must stay green.

## Out of scope

- Any server-side component (fully client-side).
- A level editor or user-authored rooms.
- Audio.
- Cosmic Zoom (separate follow-up spec).
