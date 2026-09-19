# Skybound asset credits

These files are served locally with the game. No external asset API or streaming
service is used at runtime. The flight model and camera-local cockpit are custom
arcade implementations, not a Cessna training simulator.

## c172.glb — Cessna 172

- Original author: **e737**, now displayed as **Nobilis the Palaeovespa**.
- Author: https://sketchfab.com/e0057537
- Original: https://sketchfab.com/3d-models/cessna-172-64cddaee5aff470682659a8c08525046
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
  https://creativecommons.org/licenses/by/4.0/
- Redistribution source: God’s Eye View, by Bilawal Sidhu, pinned to commit
  `0d41b6be5490db1f10a171f238be75db4d4ec3b4`:
  https://github.com/bilawalsidhu/gods-eye-view/blob/0d41b6be5490db1f10a171f238be75db4d4ec3b4/public/models/c172.glb
- God’s Eye View modifications: simplified geometry/materials, textures resized
  to 256px WebP, orientation and real-world scale baked into the mesh.
- Skybound modifications: runtime rotation/scale, material IOR and roughness
  adjustments, baked paint shading lifted in a shader, environment lighting and
  shadows. The downloaded GLB is unchanged.
- Attribution does not imply endorsement by the original author or Cessna.

## sky.hdr — Kloofendal 48d Partly Cloudy (Pure Sky), 1K

- Greg Zaal (original), Jarod Guest (sky edits), via Poly Haven.
- https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr

## sand-{color,normal,rough}.jpg — Coast Sand 01, 1K

- Rob Tuytel, via Poly Haven.
- https://polyhaven.com/a/coast_sand_01
- Original files: `coast_sand_01_diff_1k.jpg`, `coast_sand_01_nor_gl_1k.jpg`,
  `coast_sand_01_rough_1k.jpg`.
- Download directory: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/

## grass-{color,normal,rough}.jpg — Aerial Grass Rock, 1K

- Rob Tuytel, via Poly Haven.
- https://polyhaven.com/a/aerial_grass_rock
- Original files: `aerial_grass_rock_diff_1k.jpg`, `aerial_grass_rock_nor_gl_1k.jpg`,
  `aerial_grass_rock_rough_1k.jpg`.
- Download directory: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/

All Poly Haven assets above are **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/ .
License policy: https://polyhaven.com/license . Files are unchanged apart from
local filenames; the game blends/repeats the textures and uses the HDR for lighting.

Retrieved 2026-09-19. No paid assets, subscriptions, or GPU streaming are required.
Normal hosting and bandwidth limits still apply.
