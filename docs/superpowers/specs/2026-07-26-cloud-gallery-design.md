# Cloud Gallery — Design Spec

Date: 2026-07-26
Status: Approved (design)

## Goal

Add a new fullscreen Lab experiment (`/gallery/cloud-gallery`) — a cinematic,
on-rails tour that glides over a **volumetric sea of clouds**, passing a series
of **procedurally-generated abstract sculptures** rendered with photorealistic
materials (glass, polished metal, marble). Scroll / arrow keys / touch swipe
advance the camera from one sculpture to the next. Lighting comes from an
environment map so the sculptures read as truly physically-based; the clouds
provide atmosphere and depth beneath the flight path.

This is the visitor-facing answer to "run a realistic work in the lab." Unreal
Engine itself cannot run inside the browser (native C++ engine; the HTML5 build
target was dropped in UE 4.24), and Unreal → glTF export carries only geometry +
baked textures, not Unreal's real-time renderer. The photorealism budget is
therefore spent **in-browser**, which is where every other Lab experiment lives.
Rather than depend on external assets, the sculptures are generated in code — the
final image quality lands at the same place as importing models, with zero asset
files, no licensing, and full self-containment.

## Approach decision (custom volumetric shader)

Chosen during brainstorming over three alternatives:

1. drei-native (`<Environment>` + `<Clouds>` + `<Sky>`) — fast, cohesive.
2. **Custom volumetric cloud shader + hand-rolled scene (SELECTED)** — a
   raymarched FBM cloud sea in GLSL, matching the proven `NeonRaymarch`
   raymarching pattern already in the collection. More control and a more
   distinctive atmosphere; higher shader-authoring cost.
3. Lightweight image-based HDRI sky — cheapest, but clouds are a static backdrop
   the camera cannot fly over.

Approach 2 was selected. It reuses `NeonRaymarch`'s exact skeleton (raw three.js,
a fullscreen raymarched fragment shader driven imperatively by
`requestAnimationFrame`) and gives the experiment its own hand-authored cloud
look instead of a library preset.

## Core rendering decision (layer separation)

The experiment combines two rendering paradigms with different natures:

- **Clouds** — raymarched (per-pixel density integration) → fragment shader.
- **Sculpture materials** (glass / metal / marble) — real PBR meshes with
  environment-map reflection/refraction → rasterizer.

Compositing the two with pixel-accurate depth (so clouds can occlude the
sculptures) requires depth compositing and carries real risk. **v1 avoids this
entirely by separating the layers spatially:** the volumetric cloud sea is a
floor rendered *below* the flight path, and the sculptures float in clear air
*above* it. The camera always travels above the cloud tops looking at the
sculptures, so clouds act as the lower background / atmosphere and no
per-pixel depth compositing is needed — image quality is unaffected. Wispy
foreground cloud drift (soft sprites passing in front of a sculpture) is
explicitly deferred as a later enhancement, not part of v1.

### Composition layers (back to front)

1. Sky / atmosphere gradient (shader background).
2. Volumetric cloud sea — FBM-noise raymarching with single-scattering toward
   the sun direction — laid across the lower portion of the view.
3. Floating sculptures — procedural geometry + `MeshPhysicalMaterial` /
   `MeshTransmissionMaterial`, lit by a PMREM environment map for reflections
   and refraction.
4. Subtle bloom — the existing `three/addons` `UnrealBloomPass` chain used by
   `SeoulNights` / `SpaceBackground` (no new dependency).

## Architecture

Reuse the `NeonRaymarch` skeleton: raw three.js, a fullscreen experiment, scene
and render loop owned imperatively in a `useEffect` with a
`requestAnimationFrame` loop and explicit teardown. Not R3F, to match the
raymarching experiments.

### Files — `src/experiments/CloudGallery/`

| File | Responsibility | Test |
|---|---|---|
| `CloudGallery.jsx` | Experiment entry point. three scene, renderer, rAF loop, input handling, resource teardown. Reuses `../shared/exp.css`. | e2e smoke |
| `cloudPath.js` | **Pure functions.** Waypoint array → Catmull-Rom spline. `sample(t) → { position, lookAt }`. Per-sculpture stop framing (tour-stop `t` values). | ✅ vitest |
| `sculptures.js` | **Pure config / layout.** Array of sculpture definitions (form type, material params, world position above the sea, tour-stop `t`). Coordinate / spacing / stop computations are pure. | ✅ vitest |
| `clouds.glsl.js` | Volumetric cloud fragment shader string (FBM density + single scattering). | manual / visual |
| `CloudGallery.css` | Experiment-only UI styles. | — |

Actual geometry construction (three-dependent) lives in `.jsx`; the *layout and
tour* logic (pure) lives in `sculptures.js` / `cloudPath.js` — the same split as
the existing `flightPath.js` + `flightPath.test.js` convention.

## Data flow / interaction

- The experiment owns `progress` (0–1). Wheel scroll / ↑↓ arrows / touch swipe
  change `targetStop` (an integer sculpture index); `progress` eases toward the
  target `t` each frame (smooth deceleration).
- Each frame: `cloudPath.sample(progress)` → set camera position + lookAt →
  update shader uniforms (`uTime`, `uCamPos`, sun direction) → advance slow
  sculpture self-rotation → render → bloom.
- **UI** (minimal, in `CosmicMirror`'s idle-UI tone): current sculpture label +
  a one-line material/lighting caption, a scroll hint, and progress dots.

## Performance / fallback / error handling

- Raymarched clouds are expensive: clamp DPR (≤ 1.5), reduce raymarch step count
  on narrow viewports (mobile low-quality path), skip rendering when the canvas
  is offscreen.
- On WebGL context-creation failure, show a guidance fallback (match the pattern
  the existing experiments use).
- Teardown disposes geometries, materials, render targets, and the composer in
  order. `cosmic-mirror` previously hit a teardown race, so disposal ordering
  and guarding against a torn-down loop get explicit attention.

## Registry / tests / details

- **Registry**: add an entry to `src/experiments/index.js` — `id: 'cloud-gallery'`,
  `tags: ['glsl','raymarching','pbr']`, `fullscreen: true`, plus `color`,
  `symbol`, `title`, and a Korean `description`. `planet` maps to the gallery
  carousel CSS class `planet-{value}`; reuse a fitting existing planet look, or
  add a small `.planet-cloud` card style if none fits.
- **Tests**: `cloudPath.test.js` (spline continuity, endpoints, stop framing,
  monotonic progression) and `sculptures.test.js` (count, spacing, stop-`t`
  mapping). Shader / WebGL paths are covered by the per-route gallery-render e2e
  smoke (as done for `cosmic-mirror`) plus manual visual verification.
- **Verification criteria**: `npm test` passes; `npm run build` exits clean; in
  `npm run dev` the tour flows smoothly from the first sculpture to the last,
  with visible sculpture reflections/refraction and a volumetric cloud sea
  beneath the flight path.

## Out of scope (v1)

- Depth-accurate compositing of clouds in front of sculptures (foreground cloud
  drift).
- Imported / Unreal-authored 3D models — sculptures are procedural.
- Free-fly or click-to-focus navigation — the tour is on-rails.
