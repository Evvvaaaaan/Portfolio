"""Fuse overlapping inferred depth maps into one surface before texturing.

No fabricated hidden surfaces: only TSDF zero-crossings supported by the inputs.
Runs without importing torch to avoid duplicate OpenMP runtimes on macOS.
"""
import json
from pathlib import Path
import sys
import numpy as np
import open3d as o3d
from PIL import Image

job = Path(sys.argv[1])
raw = np.load(job / "reconstruction.npz")
depths, intrinsics = raw["depth"], raw["intrinsics"]
metadata = json.loads((job / "scene.json").read_text())
count, height, width = depths.shape
extrinsics = np.tile(np.eye(4), (count, 1, 1))
extrinsics[:, :3] = raw["extrinsics"]
extrinsics = extrinsics @ np.linalg.inv(extrinsics[0])
median = float(np.median(depths))
voxel = median / 380
volume = o3d.pipelines.integration.ScalableTSDFVolume(
    voxel_length=voxel, sdf_trunc=voxel * 5,
    color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
for i in range(count):
    k = intrinsics[i]
    depth = depths[i].astype(np.float32).copy()
    depth[(~np.isfinite(depth)) | (depth <= 0) | (depth > np.percentile(depth, 99.8))] = 0
    color = np.asarray(Image.open(job / f"texture-{i}.jpg").resize((width, height))).copy()
    rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
        o3d.geometry.Image(color), o3d.geometry.Image(depth), depth_scale=1,
        depth_trunc=median * 12, convert_rgb_to_intensity=False)
    intrinsic = o3d.camera.PinholeCameraIntrinsic(width, height, k[0, 0], k[1, 1], k[0, 2], k[1, 2])
    volume.integrate(rgbd, intrinsic, extrinsics[i])

mesh = volume.extract_triangle_mesh()
mesh.remove_degenerate_triangles()
mesh.remove_duplicated_triangles()
mesh.remove_unreferenced_vertices()
if len(mesh.triangles) < 1000:
    raise ValueError("사진 사이에서 일치하는 표면을 충분히 찾지 못했습니다. 겹치는 부분이 더 많은 사진을 사용해 주세요.")
if len(mesh.triangles) > 700_000:
    mesh = mesh.simplify_quadric_decimation(700_000)
# Decimation can introduce coincident triangles with opposite winding.
# Open3D's duplicate filter does not remove every such pair; Blender rejects them.
faces = np.asarray(mesh.triangles)
_, unique_faces = np.unique(np.sort(faces, axis=1), axis=0, return_index=True)
mesh.triangles = o3d.utility.Vector3iVector(faces[np.sort(unique_faces)])
mesh.remove_degenerate_triangles()
mesh.remove_unreferenced_vertices()
mesh.compute_triangle_normals()
vertices = np.asarray(mesh.vertices)
faces = np.asarray(mesh.triangles)
normals = np.asarray(mesh.triangle_normals)
centers = vertices[faces].mean(1)
scores, all_uv = [], []
for i in range(count):
    k, e = intrinsics[i], extrinsics[i]
    camera_vertices = vertices @ e[:3, :3].T + e[:3, 3]
    z = np.maximum(camera_vertices[:, 2], 1e-8)
    u = camera_vertices[:, 0] / z * k[0, 0] + k[0, 2]
    v = camera_vertices[:, 1] / z * k[1, 1] + k[1, 2]
    inside = (u >= 1) & (v >= 1) & (u < width - 2) & (v < height - 2) & (camera_vertices[:, 2] > 0)
    all_uv.append(np.stack((u / (width - 1), 1 - v / (height - 1)), -1).astype(np.float32))
    projected = centers @ e[:3, :3].T + e[:3, 3]
    px = np.clip(np.rint(projected[:, 0] / np.maximum(projected[:, 2], 1e-8) * k[0, 0] + k[0, 2]), 0, width-1).astype(int)
    py = np.clip(np.rint(projected[:, 1] / np.maximum(projected[:, 2], 1e-8) * k[1, 1] + k[1, 2]), 0, height-1).astype(int)
    observed = depths[i, py, px]
    relative_error = np.abs(projected[:, 2] - observed) / np.maximum(observed, 1e-6)
    origin = np.linalg.inv(e)[:3, 3]
    toward_camera = origin - centers
    distance = np.linalg.norm(toward_camera, axis=1)
    incidence = np.abs(np.sum(normals * toward_camera / np.maximum(distance[:, None], 1e-8), axis=1))
    score = incidence / np.maximum(distance, median * .1) ** 2 * np.exp(-relative_error * 30)
    score[~np.all(inside[faces], axis=1) | (relative_error > .12)] = -1
    scores.append(score)
scores = np.stack(scores)
source = np.argmax(scores, axis=0)
supported = scores.max(0) > 0
browser_vertices = (vertices * [1, -1, -1]).astype(np.float32)
triangles = 0
for i in range(count):
    selected = faces[(source == i) & supported]
    unique, inverse = np.unique(selected.ravel(), return_inverse=True)
    np.savez_compressed(job / f"surface-{i}.npz", vertices=browser_vertices[unique],
                        faces=inverse.reshape(-1, 3).astype(np.int32), uv=all_uv[i][unique])
    triangles += len(selected)
metadata["triangles"] = triangles
metadata["vertices"] = len(vertices)
metadata["fusion"] = "TSDF · source-view texture projection"
metadata["representation"] = "fused photo-textured surfaces"
metadata["preferredRenderer"] = "mesh"
metadata["bounds"] = np.percentile(browser_vertices, [2, 98], axis=0).tolist()
(job / "scene.json").write_text(json.dumps(metadata, ensure_ascii=False))
print(f"SPATIAL_FUSION_OK: {len(vertices)} vertices / {triangles} supported triangles", flush=True)
