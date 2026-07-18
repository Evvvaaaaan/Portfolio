# Earth Explorer — Design Spec

Date: 2026-07-18
Status: Implemented (2026-07-19). Two deviations from this spec, decided
during plan-writing and shipped as described in
docs/superpowers/plans/2026-07-19-earth-explorer.md's Global Constraints:
(1) fallback globe reuses the existing Guestbook land-mask/dot-matrix
technique instead of a new NASA Blue Marble texture; (2) "spiral descent"
is a single eased arc, not a literal spiral.

## Goal

Add an 11th Lab experiment (`/gallery/earth-explorer`) where visitors explore
a photorealistic 3D Earth — real satellite terrain and building meshes via
Google Photorealistic 3D Tiles — starting from an orbital view, flying
cinematically to curated landmarks, then free-flying with drag/zoom/tilt.

The original request named Unreal Engine; during brainstorming it was
established that UE cannot run in browsers (HTML5 export removed in UE 4.23,
Pixel Streaming requires an always-on GPU server). The user chose the
web-native Google 3D Tiles direction instead.

## Decisions (confirmed with user)

- **Execution**: web-native, no Unreal Engine, no streaming server.
- **Data source**: Google Photorealistic 3D Tiles (Map Tiles API) with quota
  defense; static-texture globe fallback when the key is absent or tiles fail.
- **Renderer**: raw three.js + `3d-tiles-renderer` (NASA-AMMOS, v0.5.0,
  requires three ≥0.167 — project has 0.184). Matches the codebase's
  raw-three.js pattern (no R3F). Adds ~150KB, lazy-loaded with the experiment.
- **UX**: landmark tour + free flight. Rejected alternatives: pure free
  flight (no guidance), search-based travel (geocoding complexity).
- **Rejected renderers**: CesiumJS (~3MB, separate rendering world, widget
  chrome), Google Maps `gmp-map-3d` web component (preview-stage, no camera/
  shader customization).

## Architecture

### 1. Experiment registration

- `src/experiments/EarthExplorer/EarthExplorer.jsx` + `EarthExplorer.css`.
- New entry `earth-explorer` in `src/experiments/index.js` → demo at
  `/gallery/earth-explorer`, code view at `/gallery/earth-explorer/code`,
  lazy-loaded like the other 10 experiments.

### 2. Scene composition

- Starfield background reusing the existing star-sprite approach
  (`createStarTexture` pattern) so the experiment reads as part of the
  site's space aesthetic.
- `TilesRenderer` group for the Earth (ECEF/WGS84 coordinate frame).
- Atmosphere rim glow (sprite or shader) around the limb.
- Plugins: `GoogleCloudAuthPlugin` (key auth + tile session),
  `TilesFadePlugin` (soften tile pop-in), `UpdateOnChangePlugin` (skip
  tile updates while the camera is idle — GPU/quota saver).

### 3. UX flow

1. **Entry** — orbital view: Earth floating in the starfield, low-detail
   tiles refine progressively.
2. **Landmark tour** — 8 landmark cards (bottom/side UI): Seoul Jamsil,
   Tokyo Shibuya, New York Manhattan, Paris Eiffel Tower, Dubai Burj
   Khalifa, San Francisco Golden Gate, Rio Christ the Redeemer, Sydney
   Opera House. Click → cinematic fly-to: altitude climb → great-circle
   cruise → spiral descent. `prefers-reduced-motion` → instant jump.
3. **Free flight** — after arrival, `GlobeControls` (built into
   3d-tiles-renderer) handles drag rotate, zoom, tilt; zooming out far
   enough returns to the orbital view naturally.
4. **Mobile** — same features; DPR cap and reduced tile cache size. Touch
   gestures handled by GlobeControls.

### 4. Key & quota defense

- Key in `VITE_GOOGLE_TILES_KEY` (Vercel env + local `.env.local`).
  Client-side exposure is the standard model for Google 3D Tiles.
- Defense lives outside code, documented as a manual checklist:
  (a) HTTP referrer restriction on the key (portfolio domain only),
  (b) daily quota cap on Map Tiles API in the GCP console.
- **Fallback mode**: if the key is missing or the root tileset request
  fails, swap to a NASA Blue Marble textured sphere with a notice
  ("위성 타일을 불러올 수 없어 정적 지구본으로 표시 중" / EN equivalent).
  Landmark fly-to still works in fallback (camera motion only, no
  buildings).
- **Attribution (required by Google ToS)**: render the Google logo plus the
  tile copyright string (exposed by 3d-tiles-renderer) persistently in a
  screen corner.

### 5. Geo utilities

Lat/lng → ECEF (WGS84 ellipsoid) conversion and fly-to path interpolation
as small pure-function utils. The guestbook's unit-sphere `geo.js` uses a
different coordinate system and is not reusable here.

### 6. Cleanup

On unmount: `tiles.dispose()`, renderer/texture/geometry disposal following
the existing experiments' dispose pattern (see GuestbookGlobe, SolarSystem).

## Error handling

- WebGL context failure or tile network errors → degrade to the fallback
  sphere without console errors.
- Tile fetch failures after successful start: keep rendering loaded tiles;
  if the root tileset itself becomes unavailable, degrade to fallback.

## Testing

- **Unit (vitest, no WebGL)**: lat/lng→ECEF conversion, fly-to path
  interpolation, landmark data integrity (8 entries, valid coordinate
  ranges).
- **e2e (Playwright)**: deterministic smoke in fallback mode (CI has no
  key) — enter page → canvas renders → click a landmark → zero console
  errors. Real tile rendering quality is manual QA.
- Existing suites (76 unit / 24 e2e) must stay green.

## Out of scope

- Place search / geocoding.
- Time-of-day or weather simulation.
- Any server-side component (the experiment is fully client-side).
