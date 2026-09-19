# Spatial Studio

## Current revision: stable solids (2026-09-19)

The user explicitly approved actual closed 3D geometry at the cost of photographic
texture fidelity. This revision supersedes the original depth/inpainting acceptance
criteria and behavior documented in the historical sections below.

Evidence: the retained source depth mesh had 9,064 triangles with an edge-length
ratio above 10. Side-view renders and the user's screenshot showed tearing and
stretched foreground surfaces. Extra inpainting patches did not replace those
defective source sheets. The new service never renders them.

Current implementation:

- Local Qwen3-VL 2B recognizes 2D object bounds, kinds and colors. Direct 3D
  coordinate generation was rejected after raw outputs confused depth with height;
  grounding was checked against the actual photograph instead. The untrusted
  response is declarative JSON, not executable code.
- Deterministic approximate layout, semantic furniture sizes, duplicate filtering,
  non-overlapping placement and bounded wall decorations. Reject unsatisfiable
  layouts. First photograph defines the composition; others are recognition context.
- Blender closed primitives and PBR materials replace all photo-projected depth
  meshes. Actual 3D hidden sides are modeled, but not claimed to match reality.
- Geometry, finite bounds, furniture separation and camera clearance checks;
  39 renders at 13 yaw angles and 3 elevations; actual compressed GLB re-import
  validation. Only completely validated results become ready.
- Continuous ±90° web orbit with bounded elevation/zoom and whole-wall cutaways.
  Original-photo comparison, structure view and editable Blender/GLB exports.
- UI and API both block old or failed-gate 3D. Original user photographs and old
  job files remain private and untouched. Superseded public demo geometry was moved
  recoverably to `.spatial-data/verification-archive/retired-sheet-demo-Rtxati/`.
- Default setup now installs the 4.3 GB Apache-2.0 Qwen checkpoint and current
  dependencies; no SDXL, DA3, paid provider, key or credits are needed for new jobs.
  Existing legacy model files were retained, not deleted.

The new sample is simplified CG and contains 12 inferred objects and 42,532
triangles. Native Blender and decoded GLB topology checks passed. A real browser
upload completed in 85 seconds on this M4 Pro / 24 GB machine. Timing and semantic
accuracy are input-dependent. Automatic geometry checks do not prove photographic
fidelity or detect every possible aesthetic defect.

Current run/setup instructions and detailed limitations are in `spatial/README.md`.

### Final verification, 2026-09-20

The environment blocker was resolved and the final checks were rerun:

- Full JavaScript suite: 63 files, **516 tests passed**. Current Python layout
  suite: **9 tests passed**, including rejection of malformed 9-value cuboids.
- All **7 browser tests passed**, without skipping the different-room fixture.
  The real single-image upload completed in 85 seconds with 42,532 triangles;
  the three-photo Redwood input completed in 59 seconds with 18,476 triangles.
  Both passed all 39 inspection views and actual compressed-GLB re-import.
- The browser suite exercised continuous ±90° rotation, intermediate angles,
  inertia reset, bounded zoom/elevation, mobile touch, original comparison,
  downloads, reload persistence, cancellation, damaged images, private files,
  and refusal to display legacy or failed-gate geometry.
- Production build passed. Two additional desktop/mobile and continuous-orbit
  tests passed against the production server. The existing 730.75 kB shared
  Three.js chunk warning remains; it is not a build error.
- A previously stalled user job was resumed with the same ID and original input,
  and completed in 76 seconds. Its uploaded bytes had the same SHA-256 before
  and after recovery. Its native Blender file reopened with 9 closed meshes,
  one camera and no projected photo textures. The three-photo native file also
  reopened successfully. Production-browser checks of the user's result covered
  -90°, 0°, +90°, mobile, original comparison and both export links. Downloaded
  GLB and Blender files matched the generated files byte for byte.
- Desktop, mobile, side-view and recovered-user-result images were inspected.
  No depth-sheet tearing or stretched spikes were observed in those results.
- `npm run spatial:setup` and `npm run spatial:check` passed using the local
  environment, with Metal detected. Scoped ESLint and diff checks passed.
  The five API verification jobs from this run were moved to the private
  verification archive; the user's six existing job records remain visible.

Earlier investigation found a model response containing a 3D cuboid instead of
a 2D box. The prompt now specifies `bbox_2d` explicitly, with one primary-image
retry before failing safely. A separate browser resize issue was fixed by drawing
immediately after resizing. The final browser helper also requires the preview
overlay and error state to be absent, so a failed load cannot count as loaded 3D.

macOS had offloaded Node/Python dependencies (`compressed,dataless`), causing empty
module loads and workers stuck before inference. Materialization requests alone
were insufficient. With the user's approval, the active execution environment
was recreated outside iCloud under
`/Users/evan/Library/Application Support/Spatial Studio/`, with `.spatial-runtime`
and `node_modules` symlinks retaining the normal commands. The previous runtime
and Node tree remain in `.spatial-data/runtime-icloud-backup` and
`.spatial-data/node-modules-icloud-backup`; old models were not deleted.
The active local trees contained zero dataless files. Source and original photos
were not relocated.

A remaining public Draco WebAssembly decoder was also offloaded. Browser traces
showed its request never completing; a process sample showed the production build
blocked in `CopyFile`/`pread` on the same file. It was restored from the identical
Three.js 0.184.0 distribution. The served 192,420-byte file matched the dependency's
SHA-256, and the build and browser tests then passed. Keep source/public assets
downloaded as well; this change does not alter the user's system-wide iCloud settings.

## Historical objective (superseded)

Build a website that reconstructs arbitrary spaces from a small set of uploaded photographs. Use Blender to produce editable scenes and GLB downloads, and provide a realistic interactive browser preview. Roberto Nickson's studio walkthrough is a reference for the experience, not a fixed model to substitute for the user's uploads.

## Acceptance criteria

- A user can upload their own photographs, submit reconstruction, follow actual processing state, and explore the resulting geometry in the browser.
- One photo produces inferred geometry; multiple overlapping photos are jointly reconstructed with estimated camera poses. Never advertise hidden surfaces or dimensions as measured truth.
- Blender runs on the submitted reconstruction and produces a real, self-contained `.blend` file and a `.glb` model.
- Materials preserve the actual source photographs. Navigation, input/output comparison, reset, and downloads work on desktop and touch screens.
- Jobs survive a page refresh, failures are actionable, and private uploads are outside the public directory. Local execution must work without third-party generation credentials.
- Validate using actual inference on interior photographs, open the Blender output, exercise the upload-to-result browser flow, inspect screenshots, run the existing unit suite and production build.

## Evidence and scope

- Baseline on 2026-09-19: 60 test files / 503 tests passed.
- Reference: https://studio.rpn24.chatgpt.site/interior and https://x.com/rpnickson/status/2097488440489116111.
- Depth Anything 3 provides jointly estimated depth and camera poses from one or more photos: https://github.com/ByteDance-Seed/Depth-Anything-3.
- Apple SHARP was evaluated but excluded because its model license does not permit product development. Depth estimation uses only Apache-2.0 DA3-BASE and DA3METRIC-LARGE checkpoints.
- Unseen surfaces cannot be verified from source images. A single photograph supports limited nearby views, not a measured, complete room.
- Build locally. Public hosting of the inference service requires a persistent compute server; a static deployment alone does not run Blender or the models.

## Implementation and verification log

Implemented `/spatial` and the portfolio Lab entry, a local upload/job API, isolated
Python inference, original-photo UV texturing, multi-view TSDF surface fusion,
Blender export and a Three.js viewer. Downloads are real `.blend`, Draco-compressed
`.glb`, and optional depth-derived `.splat` files. The latter are not learned
Gaussian-splat reconstructions. Jobs persist and can be cancelled.

Verified on Apple Silicon macOS on 2026-09-19:

- Full repository unit suite: 62 files, 512 tests passed (baseline was 503).
- Geometry/native fusion: 5 Python tests passed, including a known-plane TSDF
  regression, discontinuity filtering and camera coordinates.
- Browser: five end-to-end tests passed on both the development server and the
  production build server. The production run additionally exercises touch-drag
  camera movement. They exercise
  actual high-quality single-image inference, real Blender export, binary model
  downloads, reload persistence, multi-image inference/fusion and camera changes,
  mobile upload/cancellation, malformed input and private-file isolation.
- Blender reopened the single-photo result: 850,138 triangles, one camera and one
  packed texture. The three-photo result contained 689,001 triangles, three cameras
  and three packed textures. Both passed mesh validity and UV assertions.
  The final production-upload Redwood result also reopened successfully with
  696,988 triangles, three cameras and three packed textures.
- `npm run spatial:setup` reran successfully with pinned packages, native regression
  tests and Blender. Metal acceleration was detected. A fresh Linux installation
  has not been executed here.
- Production build and scoped ESLint passed. Build retains a size warning for the
  shared Three.js chunk; there are no build errors.
- Production `/spatial` and `/gallery` return successfully; the engine health
  endpoint reports Python, Blender, model weights and the inference engine ready.

Validation inputs are explicitly different from user uploads: one sourced
Unsplash interior, three real VGGT table/object views for camera/fusion validation,
and three overlapping Open3D Redwood sample color frames (a rendered interior).
No supplied depth, camera poses or ready-made geometry were used as reconstruction
inputs. Only the Unsplash demonstration assets are in `public/`.

Root causes investigated and resolved: conflicting eagerly imported COLMAP OpenMP
runtimes; Open3D 0.20.0 returning zero TSDF triangles even for a known plane on this
machine (0.19.0 works); oppositely wound duplicate triangles after mesh decimation;
and raw internal file paths in errors for damaged JPEGs.

The output preserves photographic appearance near source viewpoints but is not a
complete, surveyed room. Thin furniture, reflections and occlusions can contain
holes or depth errors. Observed-mode navigation is deliberately limited near the
input cameras; the experimental completion mode below has a wider range.
Public multi-user hosting is not deployed: the server runs on localhost, without
user authentication or public compute provisioning. User uploads and weights are
excluded from Git and direct static file serving.

Completed test jobs are preserved under `.spatial-data/verification-archive/`
instead of cluttering the user's new-space history. No uploaded test evidence was
deleted. Direct worker verification outputs remain in their named job folders.

## Free local completion revision

Requested change: retain zero per-generation API charges while adding an
experimental 180-degree exploration option and inferred hidden surfaces.
Before this revision, the baseline was 62 JavaScript test files / 512 tests and
five Python geometry/fusion tests. No paid provider was added or called.

Implementation:

- Local SDXL Inpainting 0.1, pinned to revision
  `115134f363124c53c7d878647567d04daf26e41e`, with CreativeML Open RAIL++-M
  use restrictions. Optional setup downloads about 6.5 GB of weights and retains
  the license. This is not an unrestricted Apache-licensed generation model.
- Six incremental views at ±30°, ±60° and ±90°. Ray-cast known surfaces, locally
  inpaint unseen regions, infer their depth, align against observed depth, and
  add only generated mesh patches. Geometry that would occlude an original input
  photograph is excluded.
- Separate `scene.*` and `completed.*` artifacts; original Blender/GLB files remain
  intact. AI meshes, camera thumbnails, metadata and the UI are marked as generated.
  The web camera can orbit continuously across the 180-degree range.
- Generation runs from local weights with offline mode enabled. There is no
  API key, credit balance, or paid fallback. If completion fails/times out, the
  observed result remains available with an explicit failure notice.
- Results initially show observed geometry, even when completion succeeded.
  The user explicitly switches to the experimental AI result. The public sample
  also includes both versions for an honest comparison.
- Device, electricity, disk and future public hosting are not free. No public
  inference deployment or authentication work was added.

Quality audit, same fixed camera and 640-pixel render width:

| Orbit angle | Empty pixels, observed | Empty pixels, completed |
| --- | ---: | ---: |
| -90° | 41.3% | 3.5% |
| -45° | 29.2% | 4.6% |
| 0° | 1.6% | 1.2% |
| +45° | 45.3% | 9.9% |
| +90° | 47.8% | 0.4% |

These coverage numbers **do not establish geometric accuracy or visual quality**.
Visual inspection found large stretched foreground surfaces, invented furniture,
and remaining holes at the extremes. Inpainting fills previously unobserved areas
but cannot correct all depth errors in the retained original mesh. The feature
is therefore experimental, not a production-quality full-room reconstruction.

The standalone completed sample passed Blender checks with seven meshes, seven
cameras, seven packed textures and 1,162,994 triangles. The observed GLB SHA-256
remained `119ff09729d22960632df92e1dbcceb8efd3f9b8286239741a6339118a24ecb1`.
An actual browser-upload completion finished in 275 seconds on this M4 Pro/24 GB
Mac and reopened in Blender with 1,173,751 valid triangles. Timing and results
are sample-specific, not a performance or quality guarantee for arbitrary images.

An end-to-end camera-switch check initially failed (`Expected: 90, Received: 57`):
OrbitControls retained drag inertia when applying a calibrated camera. The fix
drains pending control motion before positioning the selected camera. A subsequent
test assertion distinguished JavaScript `-0` from `0`; the zero-angle assertion
now uses a numeric tolerance rather than identity equality.

Final verification for the free revision:

- 63 JavaScript test files / 514 tests passed; 10 Python tests passed, including
  camera calibration, source-occlusion protection, depth anchoring, and preserved
  observed results after local-process failure or timeout.
- All seven browser tests passed on the final code, including actual local
  generation, both continuous orbit limits, switching immediately after a drag,
  mobile layouts, original/AI toggles, downloads and reload persistence. The final
  full upload finished in 283 seconds, adding 339,182 generated triangles.
- The production build was separately exercised read-only against a real
  generated job: four AI camera selections, observed/AI switching, a valid GLB
  download, local zero-API-cost health data, and no browser runtime errors.
- `spatial:setup:completion` reran idempotently; MPS, pinned dependencies, model
  files/license and Blender checks passed. Total local runtime storage was 13 GB.
- Production build, scoped ESLint and `git diff --check` passed. The pre-existing
  shared Three.js chunk-size warning remains. This revision was verified on this
  Apple Silicon Mac, not on a fresh Linux or CPU-only system.

The temporary production test server was stopped. The development UI remains at
`http://127.0.0.1:5175/spatial`. These checks establish pipeline and interaction
correctness, **not** high-quality hidden-surface reconstruction at extreme angles.
