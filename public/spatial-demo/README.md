# The light room — stable CG reconstruction

Generated from one interior photograph using local Qwen3-VL 2B object recognition,
constrained layout and closed furniture primitives in Blender 4.5.3. This is real,
editable 3D, but deliberately simplified CG, not a measured or photorealistic scan.

Photograph: [Unsplash source image](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0).
[Unsplash license](https://unsplash.com/license).

`scene.blend` contains editable closed furniture and architectural parts, PBR
materials, lighting and an overview camera. `scene.glb` is the compressed web
model; `scene.json` records its approximation limits and quality checks.

The model contains 12 inferred scene elements plus the floor and three walls,
42,532 triangles, and no photograph-projected surfaces. Thirty-nine yaw/elevation
renders were inspected automatically, with explicit geometry, footprint and
camera checks. The exported GLB was re-imported and checked for closure.
The browser supports continuous ±90° orbit. Camera-side walls are intentionally
hidden as whole cutaways, never torn depth surfaces.

The old stretched depth/inpainting demo was moved into the private verification
archive, recoverably. Its original source photograph was left unchanged. The
current sample is approximate in layout, colors and furniture design; stability
checks do not establish the real room's dimensions or unseen appearance.
