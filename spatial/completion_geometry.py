"""Geometry for local generative completion; observed surfaces stay untouched."""
import numpy as np


def orbit_camera(view, angle, width, height):
    position, target, up = (np.asarray(view[key], dtype=float) for key in ('position', 'target', 'up'))
    up /= np.linalg.norm(up)
    offset = position - target
    theta = np.radians(angle)
    rotated = (offset * np.cos(theta) + np.cross(up, offset) * np.sin(theta)
               + up * np.dot(up, offset) * (1 - np.cos(theta)))
    position = target + rotated
    forward = (target - position) / np.linalg.norm(rotated)
    right = np.cross(forward, up)
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    pose = np.eye(4)
    pose[:3, :3] = np.stack((right, -up, forward), axis=1)
    pose[:3, 3] = position
    focal = height / (2 * np.tan(np.radians(view['fov']) / 2))
    intrinsic = np.array([[focal, 0, (width - 1) / 2], [0, focal, (height - 1) / 2], [0, 0, 1]])
    camera = dict(position=position.tolist(), target=target.tolist(), up=up.tolist(),
                  distance=float(np.linalg.norm(rotated)), fov=view['fov'], aspect=width / height,
                  yawDegrees=angle, generated=True)
    return camera, intrinsic, pose


def align_depth(predicted, rendered, mask):
    known = (~mask) & np.isfinite(rendered) & (rendered > 0) & np.isfinite(predicted) & (predicted > 0)
    if known.sum() < 128:
        raise ValueError('새 시점을 연결할 관측 표면이 부족합니다. 겹치는 사진을 추가해 주세요.')
    scale = np.median(rendered[known] / predicted[known])
    depth = predicted * scale
    # Anchor the generated patch to the actual rendered boundary, not a new scale.
    from scipy.ndimage import gaussian_filter
    weight = gaussian_filter(known.astype(float), 12)
    residual = np.zeros_like(depth)
    residual[known] = rendered[known] - depth[known]
    correction = gaussian_filter(residual, 12) / np.maximum(weight, 1e-6)
    depth += correction * np.clip(weight * 4, 0, 1)
    depth[known] = rendered[known]
    return depth


def observed_conflicts(vertices, original):
    """Reject new geometry that would occlude any real input photograph."""
    conflict = np.zeros(len(vertices), dtype=bool)
    first = np.eye(4)
    first[:3] = original['extrinsics'][0]
    for depth, k, raw_e in zip(original['depth'], original['intrinsics'], original['extrinsics']):
        e = np.eye(4)
        e[:3] = raw_e
        e = e @ np.linalg.inv(first)
        points = (vertices * [1, -1, -1]) @ e[:3, :3].T + e[:3, 3]
        z = points[:, 2]
        x = np.rint(points[:, 0] / np.maximum(z, 1e-6) * k[0, 0] + k[0, 2]).astype(int)
        y = np.rint(points[:, 1] / np.maximum(z, 1e-6) * k[1, 1] + k[1, 2]).astype(int)
        h, w = depth.shape
        inside = (z > 0) & (x >= 0) & (y >= 0) & (x < w) & (y < h)
        observed = depth[np.clip(y, 0, h - 1), np.clip(x, 0, w - 1)]
        conflict |= inside & (z < observed * 1.015)
    return conflict


def lift_patch(depth, mask, intrinsic, pose, original, stride=2):
    h, w = depth.shape
    yy, xx = np.mgrid[0:h:stride, 0:w:stride]
    z = depth[::stride, ::stride]
    local = np.stack(((xx - intrinsic[0, 2]) * z / intrinsic[0, 0],
                      (yy - intrinsic[1, 2]) * z / intrinsic[1, 1], z), -1).reshape(-1, 3)
    vertices = (local @ pose[:3, :3].T + pose[:3, 3]).astype(np.float32)
    ids = np.arange(len(vertices)).reshape(z.shape)
    a, b, c, d = ids[:-1, :-1], ids[:-1, 1:], ids[1:, :-1], ids[1:, 1:]
    faces = np.concatenate((np.stack((a, c, b), -1).reshape(-1, 3),
                            np.stack((b, c, d), -1).reshape(-1, 3)))
    valid = mask[::stride, ::stride].ravel() & np.isfinite(z.ravel()) & (z.ravel() > 0)
    valid &= ~observed_conflicts(vertices, original)
    dz = z.ravel()[faces]
    faces = faces[np.all(valid[faces], axis=1) & (np.ptp(dz, axis=1) < np.maximum(.02, dz.min(1) * .09))]
    unique, inverse = np.unique(faces.ravel(), return_inverse=True)
    uv = np.stack((xx / (w - 1), 1 - yy / (h - 1)), -1).reshape(-1, 2)
    return dict(vertices=vertices[unique], faces=inverse.reshape(-1, 3).astype(np.int32),
                uv=uv[unique].astype(np.float32))
