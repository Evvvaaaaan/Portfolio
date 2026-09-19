"""Render geometry/depth without importing PyTorch (separate native runtime)."""
import json
from pathlib import Path
import sys
import numpy as np
import open3d as o3d
from PIL import Image, ImageFilter
from scipy.ndimage import binary_opening
from completion_geometry import orbit_camera

job, index, angle, width, height = Path(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
metadata = json.loads((job / 'scene.json').read_text())
camera, k, pose = orbit_camera(metadata['cameras'][0], angle, width, height)
scene = o3d.t.geometry.RaycastingScene()
surfaces = [(job / f'surface-{i}.npz', job / f'texture-{i}.jpg') for i in range(metadata['sourceCount'])]
surfaces += [(job / f'generated-surface-{i}.npz', job / f'generated-{i}.jpg') for i in range(index)]
assets = {}
for surface, texture in surfaces:
    data = np.load(surface)
    if not len(data['faces']):
        continue
    mesh = o3d.t.geometry.TriangleMesh(o3d.core.Tensor(data['vertices'].astype(np.float32)),
                                     o3d.core.Tensor(data['faces'].astype(np.uint32)))
    geometry = scene.add_triangles(mesh)
    assets[geometry] = (data['faces'], data['uv'], np.asarray(Image.open(texture).convert('RGB')))
yy, xx = np.mgrid[:height, :width]
directions = np.stack(((xx - k[0, 2]) / k[0, 0], (yy - k[1, 2]) / k[1, 1], np.ones_like(xx)), -1) @ pose[:3, :3].T
origins = np.broadcast_to(pose[:3, 3], directions.shape)
result = scene.cast_rays(o3d.core.Tensor(np.concatenate((origins, directions), -1).astype(np.float32)))
depth = result['t_hit'].numpy()
rgb = np.full((height, width, 3), 128, dtype=np.uint8)
geometries, primitives, barycentric = (result[key].numpy() for key in ('geometry_ids', 'primitive_ids', 'primitive_uvs'))
for geometry, (faces, uv, texture) in assets.items():
    pixels = geometries == geometry
    weights = barycentric[pixels]
    triangle_uv = uv[faces[primitives[pixels]]]
    coordinates = (triangle_uv[:, 0] * (1 - weights.sum(1))[:, None]
                   + triangle_uv[:, 1] * weights[:, :1] + triangle_uv[:, 2] * weights[:, 1:])
    th, tw = texture.shape[:2]
    tx = np.clip(np.rint(coordinates[:, 0] * (tw - 1)), 0, tw - 1).astype(int)
    ty = np.clip(np.rint((1 - coordinates[:, 1]) * (th - 1)), 0, th - 1).astype(int)
    rgb[pixels] = texture[ty, tx]
normal = result['primitive_normals'].numpy()
incidence = np.abs((normal * directions).sum(-1)) / np.maximum(np.linalg.norm(directions, axis=-1), 1e-6)
missing = (~np.isfinite(depth)) | (incidence < .12)
# Thin reprojected strips are unreliable too, not just completely empty pixels.
missing = ~binary_opening(~missing, structure=np.ones((9, 9)))
mask = Image.fromarray(missing.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
Image.fromarray(rgb).save(job / f'generated-input-{index}.png')
mask.save(job / f'generated-mask-{index}.png')
np.savez_compressed(job / f'generated-render-{index}.npz', depth=depth, intrinsic=k, pose=pose, mask=np.asarray(mask) > 0)
(job / f'generated-camera-{index}.json').write_text(json.dumps(camera))
print(f'COMPLETION_RENDER {angle} degrees / {missing.mean():.1%} missing', flush=True)
