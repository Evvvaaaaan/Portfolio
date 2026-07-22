# Cosmic Mirror — Design Spec

Date: 2026-07-22
Status: Approved (design)

## Goal

Add a new camera-driven Lab experiment (`/gallery/cosmic-mirror`) where the
visitor's face, captured by webcam, is drawn as a portrait made of stars.
Facial expressions drive a generative cosmos: opening the mouth triggers a
supernova burst that scatters the portrait into a full-screen nebula, which
then re-coalesces back into the face when the mouth closes.

This is the lab's **second** camera experiment. The first, Hand Conductor,
uses MediaPipe hand landmarks (gesture → particle forces). Cosmic Mirror uses
a completely different signal — **face landmarks + blendshapes** — so it adds
a new interaction axis to the collection rather than duplicating Hand
Conductor. Selected during brainstorming over two alternatives (full-body
pose "Starfield Puppeteer" and body-segmentation "Silhouette Portal").

`@mediapipe/tasks-vision` is already a project dependency, so no new packages
are required — Cosmic Mirror swaps `HandLandmarker` for `FaceLandmarker`.

## Face-representation decision (hybrid)

Chosen during brainstorming over two alternatives (pure "portrait" vs pure
"conductor"): **hybrid**. The face is normally rendered as a star portrait;
opening the mouth wide bursts it, supernova-style, into a full-screen nebula.
This is richer than either pure mode and is the defining behavior of the
experiment.

## Architecture

Mirror Hand Conductor's proven structure exactly:

- Single component `src/experiments/CosmicMirror/CosmicMirror.jsx` +
  `CosmicMirror.css`, reusing `../shared/exp.css`.
- **Canvas 2D particle engine** (not Three.js) running continuously in the
  background as the visual medium — the same lightweight, proven path Hand
  Conductor uses. A `Float32Array` particle pool with per-particle position,
  velocity, and a color/brightness blend factor.
- MediaPipe loaded from CDN WASM + hosted model (same source pattern as Hand
  Conductor): `FaceLandmarker` with `outputFaceBlendshapes: true`,
  `numFaces: 1`, `runningMode: 'VIDEO'`.
- Mode state machine `idle | camera | mouse`, plus `camError` and
  `showPreview` (mirrored webcam preview toggle) — symmetric with Hand
  Conductor.

The single point of divergence from Hand Conductor is the landmarker
(`FaceLandmarker` instead of `HandLandmarker`) and the mapping described
below. Everything else — canvas engine loop, resize handling, DPR clamp,
idle/error UI, preview toggle, mouse fallback shape — follows the existing
file so it reads like its sibling.

## Data flow & mapping

Each frame, two kinds of signal are read from the detected face:

### Landmarks (shape → portrait)

Of the 468 face landmarks, a subset (~80 points along the face oval, eyes,
and lips) become **anchor points**. Particles are attracted toward the
nearest anchor, forming a recognizable **star portrait**. Landmark x is
mirrored to match the mirrored preview.

### Blendshapes (expression → scene)

To avoid over-design, exactly **three** blendshape drivers are used:

- `jawOpen` → **supernova burst.** When it crosses a threshold, an outward
  pulse force is emitted from the face center, scattering particles into a
  full-screen nebula. When the mouth closes, anchor attraction re-coalesces
  the particles back into the portrait.
- `mouthSmile_L` / `mouthSmile_R` (averaged) → nebula **brightness and hue**
  shift warmer.
- `eyeBlink_L` / `eyeBlink_R` → stars briefly **twinkle / dim** (momentary
  brightness dip on blink).

No other blendshapes are wired. Additional expressions are explicitly out of
scope (YAGNI).

## Fallback (no camera / denied / unsupported)

A portrait is impossible without a face, so the mouse fallback follows Hand
Conductor's spirit as an **abstract mode**: the cursor becomes the single
attractor anchor that gathers particles, and **click = supernova burst**.

The idle screen offers two buttons — "카메라 켜기" and "마우스로 체험". On
camera error or unsupported environment, show the error message and steer the
visitor to mouse mode. Camera mode failing must never leave a blank screen:
the background particle engine is always running.

## Registry entry

Add a `cosmic-mirror` entry to `src/experiments/index.js` (lazy import +
metadata), following the existing object shape. Proposed metadata, with exact
values confirmed at implementation time against the already-used
planet/symbol/color set to avoid collisions:

- `id: 'cosmic-mirror'`
- `title: 'Cosmic Mirror'`
- `description`: Korean, matching the tone of sibling entries.
- `tags: ['mediapipe', 'webcam', 'face']`
- `planet: 'saturn'` · `planetName: 'MIRROR'` · `symbol: '◐'` ·
  `color: '#c4b5fd'` (all pending a de-dup check against existing entries)
- `fullscreen: true`
- `component: CosmicMirror` (lazy)

## Verification criteria

- With a face detected, particles form a recognizable portrait outline
  (face oval + eyes + mouth readable).
- Opening the mouth bursts the portrait outward; closing it re-coalesces the
  particles back into the portrait — both visible.
- Smiling shifts nebula color/brightness warmer; blinking makes stars
  twinkle/dim.
- Denying or lacking camera support falls back to mouse mode with no blank
  screen and no unhandled error.
- `npm run build` passes; existing experiments unaffected (registry addition
  is additive).

## Out of scope

- Three.js / WebGL rendering (Canvas 2D is the chosen medium).
- Blendshapes beyond the three listed.
- Recording, export, or sharing of the portrait.
- Multi-face support (`numFaces: 1`).
