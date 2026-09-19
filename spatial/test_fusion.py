import unittest
import numpy as np
import open3d as o3d


class FusionRuntimeTest(unittest.TestCase):
    def test_known_plane_produces_a_surface(self):
        depth = o3d.geometry.Image(np.ones((96, 96), dtype=np.float32))
        color = o3d.geometry.Image(np.full((96, 96, 3), 160, dtype=np.uint8))
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
            color, depth, depth_scale=1., depth_trunc=3., convert_rgb_to_intensity=False)
        intrinsic = o3d.camera.PinholeCameraIntrinsic(96, 96, 80., 80., 48., 48.)
        volume = o3d.pipelines.integration.ScalableTSDFVolume(
            .015, .05, o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
        volume.integrate(rgbd, intrinsic, np.eye(4))
        mesh = volume.extract_triangle_mesh()
        self.assertGreater(len(mesh.triangles), 1000,
                           'The native fusion library produced an empty known plane; check the pinned Open3D version.')
        self.assertTrue(np.allclose(np.asarray(mesh.vertices)[:, 2], 1., atol=.02))


if __name__ == '__main__':
    unittest.main()
