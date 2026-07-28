# Lab — Orbital Descent & 360° Gallery — Design Spec

Date: 2026-07-29
Status: Approved (design)

## Goal

Replace the Lab page (`/gallery`) presentation. Today it is a CSS 3D coverflow
carousel of planet-styled cards floating over the global starfield. It becomes:

1. **An orbital descent.** Entering the Lab reads as falling out of space into
   Earth's atmosphere — a fast, physically-suggestive plunge that decelerates and
   settles at high altitude.
2. **A 360° panorama.** The visitor stops in the upper stratosphere, standing
   still at the centre of the space, and drags to rotate their view. The
   14 experiments hang in the air around them as framed panels.
3. **Click to enter.** The panel currently facing the viewer is the active work;
   clicking it navigates to `/gallery/:id`.

Concept sentence: **the Lab is no longer "in space" — it is the descent from
space into Earth.**

## Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Where does the viewer stand? | Fixed at the origin, rotating in place. Works are arranged around them. Not orbiting a centred Earth, not a continuous scroll-dive. |
| When does the descent play? | Continuous with the existing warp. Navbar → warp boost → flash → route swap → descent. Direct URL entry plays the descent alone. |
| What are the works? | Framed panels floating in the air, reusing the existing CSS planet art and typography. Not spheres, not live previews. |
| Look-around control | Pointer drag with inertia. Identical on desktop and touch. |
| Environment after landing | High stratosphere: curved Earth limb below, orange thermosphere scattering band, blue atmosphere, black star-filled sky above. |
| Mobile / reduced motion | Same 360° experience everywhere, quality scaled down. `prefers-reduced-motion` starts already landed. |
| Sense of speed | Explicitly amplified during the descent — see "Descent choreography". |
| Arrival text | Localised to the selected UI language (en / ko / ja / zh). |

## Approach decision (CSS 3D panel ring + dedicated sky shader)

Chosen over two alternatives:

1. **CSS 3D panel ring + full-screen GLSL sky (SELECTED).** The background —
   stars, curved Earth limb, atmospheric scattering, speed streaks — is one
   full-screen fragment shader driven by `yaw`, `pitch`, `altitude` and `time`
   uniforms. The 14 works are real DOM elements positioned on a cylinder with
   CSS 3D transforms, reusing the existing planet artwork and card typography.
   Text stays crisp and accessible; the shader carries the atmosphere.
2. All-three.js scene. Panels become textured planes. Unified lighting and
   depth, but text must be baked to canvas textures (blurry, inaccessible) and
   all 14 card artworks rebuilt. Roughly 3–4× the work.
3. Extend the global `SpaceBackground`. Good reuse, but it mounts on every
   route; adding Lab-only descent state there means route-conditional branching
   and fragile teardown when leaving the Lab.

Approach 1 follows the repository's established shape: pure logic modules with
sibling unit tests (`arrivalSequence.js`, `warpStreaks.js`, `sculptures.js`), a
raw WebGL canvas driven imperatively by `requestAnimationFrame`, and GLSL kept
in a plain `.js` string module so it can be asserted against in tests.

## Spatial model

- The viewer is fixed at the origin. Only orientation changes.
- 14 panels are spaced evenly around a cylinder: `360 / 14 ≈ 25.71°` apart, at a
  fixed radius `R`.
- Rotating the view means rotating the whole ring by `-yaw`; the shader receives
  the same `yaw` so background and panels move as one.
- `pitch` is clamped to ±25° so the horizon is never lost.
- The panel with the smallest absolute angular offset from straight-ahead is
  **active**: enlarged, fully lit, and clickable. Others recede, dim, and shrink.
- Panels beyond ±110° of the view direction are not rendered, so the DOM holds
  roughly half the ring at any moment.
- Clicking the active panel navigates. Clicking a non-active panel rotates the
  view to bring it to the front instead of navigating — the same
  snap-then-open behaviour the current carousel has, so a work is never opened
  by accident.

## UI chrome after landing

Retained from the current page, restyled: the `NN / 14` counter and the active
work's title. The two arrow buttons remain and rotate the ring by exactly one
panel step, giving a pointer-free path through the works. The standalone
"Open — <title>" button is dropped; the active panel itself is the target.

Keyboard access: left/right arrows rotate one step, up/down adjust pitch, and
Enter or Space on the focused active panel opens it. The panel is a real
focusable element, so this needs no parallel implementation.

## Descent choreography

The descent must *feel fast*. Distant stars alone do not convey speed, so speed
is carried by five simultaneous cues:

1. **Velocity curve, not a constant slide.** The timeline accelerates hard for
   the first third, holds a high-speed cruise, then brakes sharply in the final
   ~0.8 s. Perceived speed comes from the rate of change, so a shorter, sharply
   decelerating fall reads faster than a longer, even one. Total duration
   ≈ 3.2 s.
2. **Field-of-view expansion.** The shader's projection widens during the
   high-speed phase and narrows on braking — the same edge-stretching illusion
   the existing warp uses.
3. **Radial star streaks.** Stars stretch into streaks along the direction of
   travel, their length driven by instantaneous velocity, collapsing back to
   points as the fall brakes.
4. **Near-field elements that flash past.** Sparse foreground motes (high-
   altitude ice crystals / debris) sweep past the camera. This is the strongest
   cue available, because speed is only legible against nearby reference points.
5. **Re-entry heat and shake.** As the atmosphere thickens, an orange plasma
   glow builds at the lower edge of the frame and a small high-frequency camera
   shake rides the peak, both easing out as the viewer settles.

Landing overshoots slightly and settles back, so stopping is felt rather than
merely reached.

The panels fade in only in the final third of the descent, so the fall reads as
motion through empty atmosphere rather than a gallery sliding into place. UI
chrome (counter, hints) is suppressed until the descent completes.

## Entry paths

- **From the Navbar.** Unchanged up to the flash: `LabTransition` fires the warp
  boost, and the route swaps at the flash peak. The Gallery mounts at
  `altitude = 0` (black space) and immediately begins the descent, so the warp
  and the fall read as one continuous move.
- **Direct URL / reload.** No warp is available; the descent plays on its own
  from the same starting altitude.
- **`prefers-reduced-motion`.** No descent, no shake, no inertia. The page mounts
  in the landed state with panels already visible.

## Component decomposition

| File | Responsibility |
|---|---|
| `src/pages/Gallery/Gallery.jsx` | Orchestration only. Owns `yaw`, `pitch`, descent progress and active index; renders the ring and the canvas. |
| `src/pages/Gallery/ring.js` | Pure. Panel angles, `yaw` → per-panel signed offset, active index, visibility cutoff, per-panel scale/opacity. |
| `src/pages/Gallery/descent.js` | Pure. Elapsed ms → `{ altitude, velocity, fov, shake, plasma, panelReveal, done }`. Returns the landed state immediately when reduced motion is set. |
| `src/pages/Gallery/useLookAround.js` | Pointer drag, wheel and arrow keys → `yaw` / `pitch`. Inertia damping, pitch clamp, drag-vs-click discrimination. |
| `src/pages/Gallery/skyShader.js` | GLSL source string: stars, star streaks, curved Earth limb, scattering bands, plasma, near-field motes. |
| `src/pages/Gallery/SkyCanvas.jsx` | WebGL context lifecycle, uniform updates, resize, context-loss handling, disposal. |
| `src/pages/Gallery/Gallery.css` | Ring and panel styling. Existing planet-art CSS is kept; only the coverflow layout rules are replaced. |

Each pure module is independently testable and holds no React state. A single
`requestAnimationFrame` loop reads `descent.js` and `useLookAround.js` and
writes both the shader uniforms and the ring's CSS custom properties in the same
frame, so background and panels can never drift apart.

## Data flow

`src/experiments/index.js` is **not** modified. `planet`, `color`, `symbol`,
`title` and `tags` continue to drive the panel artwork and labels exactly as
they do in the current cards. Adding an experiment stays a one-object change.

## Localisation

The Lab's copy currently contains hard-coded Korean while the app's default
language is English — the arrival line `Lab에 도착하였습니다` in
`LabTransition.jsx`, and the heading and hint text in `Gallery.jsx`.

A `lab` section is added to all four locales in `src/i18n/translations.js`
(`en`, `ko`, `ja`, `zh`):

- `arrived` — the arrival line, shown after the descent completes.
  English reads `Lab arrived`.
- `title` — the panorama heading.
- `hint` — the look-around instruction ("drag to look around").
- `open` — the label of the enter-work action.

`LabTransition` and `Gallery` read these through `useLang()`. The arrival line
moves from the warp flash to the moment the descent finishes.

## Error handling and fallbacks

- **WebGL unavailable or context creation fails.** The sky canvas is skipped and
  a CSS gradient sky (black → blue → orange band) is used instead. The panel
  ring stays fully functional; reaching the works is never blocked by a
  rendering failure.
- **`webglcontextlost`.** The render loop stops; on `webglcontextrestored` the
  shader is recompiled and the loop resumes at the current state.
- **Shader compile failure.** Logged once, then the same CSS gradient fallback.
- **Mobile / low-end.** `devicePixelRatio` capped at 1.5, reduced star count and
  fewer scattering samples. Chosen from viewport size at mount, matching the
  desktop predicate already used in `App.jsx` and `SpaceBackground.jsx`.

## Testing

**Unit (vitest), sibling `.test.js` files:**

- `ring.js` — even angular spacing; `yaw` wrap-around at ±180°; active index
  correctness at boundaries; panels outside the cutoff excluded; scale/opacity
  monotonic with offset.
- `descent.js` — starts at altitude 0 and ends landed; velocity peaks mid-fall
  and reaches ~0 at the end; `panelReveal` stays 0 through the first two thirds;
  reduced motion returns the landed state at t = 0; values stay bounded past the
  end of the timeline.

**End-to-end (Playwright):** `e2e/lab-gallery.spec.js` is updated. The existing
`.carousel-card` count assertion breaks by design and is replaced with the new
panel selector. Added coverage: dragging changes the active work; clicking the
front panel navigates to `/gallery/:id`; the page reaches the landed state
within a timeout; no console errors. The per-experiment render tests are
untouched.

**Manual verification:** the descent is a subjective effect — its sense of speed
is confirmed by running the app, not by assertion.

## Out of scope

- Experiment thumbnail images or live previews inside panels.
- Earth surface textures or geography (the stratospheric view is procedural
  gradient and limb only).
- Sharing code with the Guestbook globe.
- Changes to the experiment data schema or to any individual experiment.
- Changes to the warp boost timing in `SpaceBackground` / `warpBoost.js`.
