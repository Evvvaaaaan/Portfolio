"""Depth geometry in first-camera coordinates; independent of the inference engine."""
import numpy as np


def reconstruct_view(depth, confidence, intrinsics, extrinsic, first_extrinsic, rgb, stride=1):
    height, width = depth.shape
    yy, xx = np.mgrid[0:height:stride, 0:width:stride]
    z = depth[::stride, ::stride]
    gh, gw = z.shape
    k = intrinsics
    local = np.stack(((xx - k[0, 2]) * z / k[0, 0],
                      (yy - k[1, 2]) * z / k[1, 1], z), -1)
    ext = np.eye(4)
    ext[:3] = extrinsic
    pose = first_extrinsic @ np.linalg.inv(ext)
    cv = local.reshape(-1, 3) @ pose[:3, :3].T + pose[:3, 3]
    # Browser/glTF: X right, Y up, -Z forward. Blender exporter converts later.
    vertices = (cv * [1, -1, -1]).astype(np.float32)
    uv = np.stack((xx / (width - 1), 1 - yy / (height - 1)), -1).reshape(-1, 2).astype(np.float32)
    ids = np.arange(gh * gw).reshape(gh, gw)
    a, b, c, d = ids[:-1, :-1], ids[:-1, 1:], ids[1:, :-1], ids[1:, 1:]
    faces = np.concatenate((np.stack((a, c, b), -1).reshape(-1, 3),
                            np.stack((b, c, d), -1).reshape(-1, 3)))
    flat_z = z.ravel()
    face_z = flat_z[faces]
    # Do not stretch a wall across the edge of a chair, or bridge a doorway.
    continuous = np.ptp(face_z, axis=1) < np.maximum(.03, np.min(face_z, axis=1) * .065)
    conf = confidence[::stride, ::stride].ravel()
    valid = np.isfinite(flat_z) & (flat_z > 0) & np.isfinite(conf)
    faces = faces[continuous & np.all(valid[faces], axis=1)].astype(np.int32)
    used = np.zeros(len(vertices), dtype=bool)
    used[faces.ravel()] = True

    # Depth-derived surface splats. These are an alternative renderer for the
    # inferred surfaces, not learned SHARP Gaussians or completed unseen geometry.
    dx = np.gradient(local, axis=1)
    dy = np.gradient(local, axis=0)
    normals = np.cross(dx, dy).reshape(-1, 3)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    normals = (normals @ pose[:3, :3].T) * [1, -1, -1]
    # Shortest arc quaternion from +Z to surface normal, stored WXYZ.
    quat = np.column_stack((-normals[:, 1], normals[:, 0], np.zeros(len(normals)), 1 + normals[:, 2]))
    anti = np.linalg.norm(quat, axis=1) < 1e-6
    quat[anti] = [1, 0, 0, 0]
    quat /= np.maximum(np.linalg.norm(quat, axis=1, keepdims=True), 1e-9)
    scale = np.column_stack((flat_z / k[0, 0] * stride * .8,
                             flat_z / k[1, 1] * stride * .8,
                             flat_z / max(k[0, 0], k[1, 1]) * .12))
    splats = np.zeros(len(vertices), dtype=[("p", "<f4", 3), ("s", "<f4", 3),
                                           ("c", "u1", 4), ("q", "u1", 4)])
    splats["p"], splats["s"] = vertices, scale
    splats["c"][:, :3] = rgb[::stride, ::stride].reshape(-1, 3)
    splats["c"][:, 3] = 245
    splats["q"] = np.clip(quat[:, [3, 0, 1, 2]] * 128 + 128, 0, 255).astype(np.uint8)
    position = pose[:3, 3] * [1, -1, -1]
    direction = (pose[:3, :3] @ [0, 0, 1]) * [1, -1, -1]
    up = (pose[:3, :3] @ [0, -1, 0]) * [1, -1, -1]
    distance = float(np.median(z))
    camera = dict(position=position.tolist(), target=(position + direction * distance).tolist(),
                  up=up.tolist(), fov=float(np.degrees(2 * np.arctan(height / (2 * k[1, 1])))),
                  aspect=width / height, distance=distance)
    return dict(vertices=vertices, faces=faces, uv=uv, camera=camera,
                splats=splats[valid], retained=float(np.mean(used)))


def write_splats(path, views):
    with open(path, "wb") as output:
        for view in views:
            output.write(view.tobytes())
