import unittest
import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
from completion_geometry import orbit_camera, align_depth, observed_conflicts, lift_patch


class CompletionGeometryTests(unittest.TestCase):
    def setUp(self):
        self.view = dict(position=[0, 0, 0], target=[0, 0, -2], up=[0, 1, 0], fov=60)
        self.camera, self.k, self.pose = orbit_camera(self.view, 0, 56, 56)
        self.original = dict(depth=np.full((56, 56), 2.), intrinsics=[self.k], extrinsics=[np.eye(4)[:3]])
        self.original['depth'] = self.original['depth'][None]

    def test_half_turn_camera_positions_preserve_radius_and_calibration(self):
        left, _, _ = orbit_camera(self.view, -90, 56, 56)
        right, _, _ = orbit_camera(self.view, 90, 56, 56)
        np.testing.assert_allclose(left['position'], [-2, 0, -2], atol=1e-8)
        np.testing.assert_allclose(right['position'], [2, 0, -2], atol=1e-8)
        np.testing.assert_allclose(self.pose[:3, :3].T @ self.pose[:3, :3], np.eye(3), atol=1e-8)

    def test_depth_alignment_keeps_known_pixels_and_relative_scale(self):
        predicted = np.full((56, 56), 10.)
        rendered = np.full((56, 56), 2.)
        mask = np.zeros((56, 56), bool)
        mask[:, 30:] = True
        rendered[mask] = np.inf
        np.testing.assert_allclose(align_depth(predicted, rendered, mask), 2.)

    def test_generated_geometry_cannot_cover_observed_photo(self):
        points = np.array([[0, 0, -1], [0, 0, -3], [50, 0, -1]])
        np.testing.assert_array_equal(observed_conflicts(points, self.original), [True, False, False])
        patch = lift_patch(np.full((56, 56), 1.), np.ones((56, 56), bool), self.k, self.pose, self.original)
        self.assertEqual(len(patch['faces']), 0)
        patch = lift_patch(np.full((56, 56), 3.), np.ones((56, 56), bool), self.k, self.pose, self.original)
        self.assertGreater(len(patch['faces']), 100)

    def test_unanchored_generation_is_rejected(self):
        with self.assertRaises(ValueError):
            align_depth(np.ones((10, 10)), np.full((10, 10), np.inf), np.ones((10, 10), bool))

    def test_failed_generation_preserves_observed_result_without_paid_fallback(self):
        from reconstruct import complete_scene
        for failure in [subprocess.CalledProcessError(1, 'local-worker'), subprocess.TimeoutExpired('local-worker', 1800)]:
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as folder:
                job = Path(folder)
                observed = dict(sourceCount=1, triangles=12345)
                with patch('reconstruct.subprocess.run', side_effect=failure) as execute, patch('reconstruct.traceback.print_exc'):
                    result = complete_scene(job, observed, 'blender', lambda *_: None)
                self.assertEqual(execute.call_count, 1)
                self.assertEqual(result['triangles'], 12345)
                self.assertEqual(result['completion']['status'], 'failed')
                self.assertEqual(result['completion']['apiCost'], 0)
                self.assertEqual(json.loads((job / 'scene.json').read_text()), result)


if __name__ == '__main__':
    unittest.main()
