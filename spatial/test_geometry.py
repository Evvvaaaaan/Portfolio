"""Geometry contract tests: projection, occlusion edges and camera registration."""
import tempfile
import unittest
from pathlib import Path
import numpy as np
from geometry import reconstruct_view, write_splats


class GeometryTests(unittest.TestCase):
    def scene(self, depth, ext=None, confidence=None):
        h, w = depth.shape
        k = np.array([[20., 0., (w-1)/2], [0., 20., (h-1)/2], [0., 0., 1.]])
        ext = np.eye(4)[:3] if ext is None else ext
        return reconstruct_view(depth, np.ones_like(depth) if confidence is None else confidence,
                                k, ext, np.eye(4), np.full((h, w, 3), 160, dtype=np.uint8))

    def test_plane_preserves_every_observed_pixel_and_has_correct_winding(self):
        result = self.scene(np.ones((10, 12)))
        self.assertEqual(len(result['faces']), 2 * 9 * 11)
        self.assertEqual(len(result['splats']), 120)
        self.assertTrue(np.allclose(result['vertices'][:, 2], -1))
        v = result['vertices'][result['faces'][0]]
        self.assertGreater(np.cross(v[1]-v[0], v[2]-v[0])[2], 0)

    def test_depth_boundary_is_not_bridged(self):
        depth = np.ones((10, 12))
        depth[:, 6:] = 3
        result = self.scene(depth)
        depths = -result['vertices'][result['faces'], 2]
        self.assertTrue(np.all(np.ptp(depths, axis=1) == 0))
        self.assertEqual(len(result['splats']), 120)

    def test_low_confidence_does_not_erase_visible_photograph(self):
        confidence = np.ones((10, 12))
        confidence[2:4, 3:6] = .0001
        result = self.scene(np.ones((10, 12)), confidence=confidence)
        self.assertEqual(len(result['faces']), 198)
        self.assertEqual(result['retained'], 1)

    def test_camera_translation_and_splat_encoding(self):
        ext = np.eye(4)[:3]
        ext[0, 3] = -.4
        result = self.scene(np.ones((10, 12)), ext=ext)
        self.assertAlmostEqual(result['camera']['position'][0], .4)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'scene.splat'
            write_splats(output, [result['splats']])
            self.assertEqual(output.stat().st_size, 120 * 32)
        self.assertTrue(np.isfinite(result['splats']['s']).all())
        self.assertTrue(np.all(result['splats']['s'] > 0))


if __name__ == '__main__':
    unittest.main()
