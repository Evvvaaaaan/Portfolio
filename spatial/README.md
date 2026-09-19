# Spatial Studio — stable solid reconstruction

The user chose stable, actual 3D geometry over photo-realistic but torn depth
surfaces. The current service reconstructs the photograph's approximate layout
using closed, editable CG furniture. It does not stretch the photograph over a
depth mesh, run diffusion inpainting, or substitute a panorama for real 3D.

## Run locally

```sh
npm install
npm run spatial:setup
npm run spatial
```

Open **http://127.0.0.1:5175/spatial**. `spatial:setup:completion` remains an alias
to the same current setup for existing users; it no longer installs SDXL.
`npm run spatial:check` checks the runtime and layout constraints.

Setup supports Apple Silicon macOS and Linux x64. It installs isolated Python
3.12, pinned packages, Qwen3-VL-2B-Instruct and Blender 4.5.3 under
`.spatial-runtime/`. The vision weights download is approximately 4.3 GB.
Allow at least 10 GB free for the current engine, installers and generated jobs.
Existing depth/SDXL weights are not deleted on upgrade.
Nothing is installed into `/Applications` or global Python. On macOS the Blender
installer mounts a read-only disk image.

Metal or CUDA is used when available; CPU fallback is substantially slower.
Apple M4 Pro / 24 GB unified memory is the tested configuration, not a minimum
memory guarantee. A sandbox may hide Metal: start the server from a normal
terminal. Linux and CPU-only generation have not been exercised on this machine.

Avoid iCloud-optimized execution dependencies. On this development machine,
`.spatial-runtime` now links to
`/Users/evan/Library/Application Support/Spatial Studio/runtime`, and `node_modules`
links to the sibling `web/node_modules` directory. The normal commands above still
work. Python packages were installed locally using the current pinned requirements;
existing Node lockfile versions were retained. Both local dependency trees were
checked for macOS `dataless` placeholders and contained none.

The previous environments remain recoverable under
`.spatial-data/runtime-icloud-backup` and `.spatial-data/node-modules-icloud-backup`.
Source code and uploaded photographs were not relocated. Keep the source/public
asset folder downloaded too: an offloaded Draco decoder also blocked the browser
and production build, and was restored from the same Three.js 0.184.0 package.
For a different local runtime directory, use `SPATIAL_RUNTIME` consistently for
setup and serving. See `docs/spatial-reconstruction.md` for verification evidence.

## Free generation and privacy

There are no generation API calls, credentials, paid credits or paid fallback.
Internet is required for the initial model installation; inference thereafter
uses local weights with Hugging Face and Transformers offline mode enabled.
Photographs are not transmitted to a model provider. Equipment, electricity,
storage and future public hosting are not free.

Uploads and intermediates stay in `.spatial-data/`, excluded from Git and static
serving. Only the sourced demo photograph and its generated assets are public.
The API requires same-origin localhost requests and permits one active job.
Reload resumes progress; cancellation terminates the worker's process group,
including Blender. Original uploaded bytes remain in the private job directory;
the comparison JPEG is EXIF-oriented and reduced to at most 2560 pixels.

## Pipeline and technical specification

1. Accept 1–8 JPG/PNG/WebP images, at most 12 MB each and 48 MB combined. Check
   actual file signatures and decoded image size. The first image defines the
   composition; others provide recognition context, not calibrated camera poses.
2. `solid_reconstruct.py` runs local Qwen3-VL 2B. It identifies object classes,
   2D bounding boxes and colors. It cannot generate or execute Python, shaders,
   paths or arbitrary geometry. The primary image is analyzed at up to 1008px;
   reference images at up to 672px. Generation is deterministic, limited to 2600
   new tokens per attempt. Invalid JSON or an unusable layout is retried once
   against only the first photograph; a second failure fails the job. Metadata
   records when this primary-only retry was used.
3. `scene_spec.py` interprets detections as an approximate layout. It deduplicates
   repeated plants, ignores tiny accessories, bounds dimensions/colors, and uses
   semantic furniture dimensions. A deterministic nearest-feasible placement
   search separates furniture footprints and wall decorations. Impossible layouts
   are rejected. This is not metric depth estimation or photogrammetry.
4. `build_solids.py` assembles bounded boxes, capped cylinders and ellipsoids in
   Blender: sofas, seats, beds, tables, storage, plants, rugs, lamps and wall items.
   Each part has thickness and closed topology, including hidden sides. Furniture
   components stay within the collision-checked footprint. Objects use regular
   physically based materials, not photo-projected UV sheets.
5. Validate finite coordinates, room bounds, floor-furniture separation, closed
   edges and nondegenerate faces. Render 39 inspection images: yaw -90° through
   +90° every 15°, at elevations 18°, 27° and 42°. Check render validity and that
   the bounded camera orbit stays outside the model. These automatic checks do
   not prove semantic accuracy or detect every possible aesthetic problem.
6. Export editable `scene.blend`, Draco-compressed `scene.glb`, a Cycles preview,
   seven viewpoint thumbnails and metadata. Re-import the actual GLB in a fresh
   Blender process with `verify_glb.py`; check decoded closure and face validity
   before marking the job ready. Seam welding is diagnostic only, never an
   automatic repair of the user's exported file.
7. React/Three.js displays only `closed-solids-v1` results with all quality-gate
   fields passed. Orbit is continuous across 180°, not limited to seven buttons.
   Elevation is 18–42°, zoom 0.85–1.25 of the overview distance, and panning is
   disabled to prevent entering or going beneath the model. Camera-facing walls
   are hidden as whole architectural cutaways; the ceiling/front wall are omitted.
   Original-photo comparison, structure view and Blender/GLB downloads remain.

“균형 / 고품질” controls preview rendering samples, not geometry accuracy. All
results undergo the same stability checks. Failed jobs never expose partially
generated 3D. Legacy depth/inpaint jobs retain their original photographs and
files on disk but cannot display or download unsafe 3D through the current API.
They must be regenerated. Legacy research scripts remain for historical evidence;
the service and default installer do not invoke them.

## Deliberate limitations

This is a plausible simplified CG reconstruction, not a recovered scan. Actual
furniture shape, size, number, placement and unseen surfaces may differ. Color and
object recognition can be wrong. Fine details and photographic shading are not
preserved. Multiple inputs are visual context, not fused measurements. Unsupported
objects are approximated by basic solids; scenes too crowded for safe placement
fail rather than export intersecting piles. A camera-side wall disappearing is an
intentional cutaway, not a broken mesh. No complete 360° or measurement guarantee
is made, and arbitrary photographs cannot be guaranteed semantically correct.

## Validation and serving

```sh
npm test
.spatial-runtime/venv/bin/python -m unittest discover -s spatial -p 'test_scene_spec.py'
npx eslint src/experiments/SpatialStudio dev/spatialService.js dev/spatialService.test.js e2e/spatial-studio.spec.js
npx playwright test --config playwright.spatial.config.js
npm run build
npm run spatial:serve
```

Browser tests use real local inference and Blender, not mocked generation, for
the single-image and different-room multi-image flows. They require Google Chrome
and the installed runtime. The multi-image test uses the previously downloaded
Open3D Redwood color fixture and skips if absent. Other tests cover continuous
orbit limits, camera reset, original comparison, downloads, reload, mobile touch,
cancellation, malformed images, private files and refusal to display legacy or
failed-gate models. Screenshots are written to `/private/tmp`.
`verify_blender.py` can separately reopen a `.blend` to verify its closed parts.
The historical geometry/completion tests need the legacy dependencies and are
not required by the current minimal installer.

The production server serves the build and the same local API. Public deployment
is not configured: multi-user hosting needs authentication, quotas, isolated
storage and persistent compute. A static hosting service alone cannot run Python
or Blender.

Overrides: `SPATIAL_RUNTIME`, `SPATIAL_DATA`, `SPATIAL_PYTHON`, `SPATIAL_BLENDER`,
`SPATIAL_DEVICE` (`mps`, `cuda`, `cpu`), `SPATIAL_PORT` for the production server,
and `UV_BIN` for an existing uv binary.

## Provenance

- Vision model: [Qwen3-VL-2B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct),
  Apache-2.0, pinned revision `89644892e4d85e24eaac8bacfd4f463576704203`.
- Runtime: PyTorch 2.14.0, Transformers 4.57.6, Accelerate 1.13.0,
  Pillow 12.3.0; see `requirements-solid.txt` for the complete pins.
- Geometry, previews and exports: [Blender](https://www.blender.org/), 4.5.3.
- Web: React 19, [Three.js](https://threejs.org/) and local Draco decoders.
- Demo photograph: [Unsplash source](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0).
- Detailed revision history and verification evidence: `docs/spatial-reconstruction.md`.
