import unittest
from scene_spec import normalize_spec, parse_spec, footprint


class SceneSpecTests(unittest.TestCase):
    def test_bounds_colors_and_unknown_kinds_never_execute_model_content(self):
        result = normalize_spec({'room': {'size': [float('nan'), -8, 900]}, 'objects': [
            {'kind': '__import__("os")', 'size': [1000, -2, float('inf')], 'position': [999, -999],
             'color': 'javascript:alert(1)'}]})
        self.assertEqual(result['room']['size'], [6, 2.2, 12])
        self.assertEqual(result['objects'][0]['kind'], 'object')
        self.assertEqual(result['objects'][0]['color'], '#b7afa0')
        self.assertLess(result['objects'][0]['position'][0], 3)

    def test_rotated_objects_are_inside_room(self):
        result = normalize_spec({'room': {'size': [3, 2.5, 3]}, 'objects': [
            {'kind': 'sofa', 'size': [5, 1, 4], 'position': [99, -99], 'yaw': 45}]})
        item = result['objects'][0]
        import math
        radius = (item['size'][0] + item['size'][2]) / (2 * math.sqrt(2))
        self.assertLessEqual(abs(item['position'][0]) + radius, 1.5)
        self.assertLessEqual(abs(item['position'][1]) + radius, 1.5)

    def test_rejects_empty_and_malformed_specs(self):
        for value in ['not json', '{"objects":[]}', '{"objects":[']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_spec(value)

    def test_accepts_only_bounded_number_of_declarative_objects(self):
        result = normalize_spec({'objects': [{'kind': 'rug'}] * 100})
        self.assertEqual(len(result['objects']), 28)
        self.assertTrue(all(item['size'][1] == .018 for item in result['objects']))

    def test_three_component_positions_do_not_silently_collapse_to_origin(self):
        result = normalize_spec({'objects': [{'kind': 'chair', 'position': [1.2, .5, -1.4]}]})
        self.assertEqual(result['objects'][0]['position'], [1.2, -1.4])

    def test_overlapping_predictions_are_separated_and_impossible_rooms_rejected(self):
        result = normalize_spec({'objects': [{'kind': 'armchair', 'position': [0, 0]}] * 12})
        for i, a in enumerate(result['objects']):
            for b in result['objects'][i + 1:]:
                ax, az = footprint(a)
                bx, bz = footprint(b)
                self.assertTrue(abs(a['position'][0] - b['position'][0]) >= ax + bx + .079
                                or abs(a['position'][1] - b['position'][1]) >= az + bz + .079)
        with self.assertRaisesRegex(ValueError, '겹치지 않는 배치'):
            normalize_spec({'room': {'size': [3, 2.8, 3]}, 'objects': [
                {'kind': 'sofa', 'size': [2.3, 1, 2.3]}] * 10})

    def test_grounding_deduplicates_plants_and_places_back_furniture_behind_front(self):
        result = normalize_spec({'room': {'enclosure': 'open'}, 'objects': [
            {'kind': 'cabinet', 'bbox': [300, 480, 500, 560]},
            {'kind': 'chair', 'bbox': [50, 600, 280, 950]},
            {'kind': 'plant', 'bbox': [600, 200, 750, 650]},
            {'kind': 'tree', 'bbox': [601, 201, 750, 651]},
            {'kind': 'lamp', 'bbox': [300, 400, 350, 500]},
            {'kind': 'window', 'bbox': [820, 0, 1000, 520]},
        ]})
        objects = result['objects']
        self.assertEqual(len(objects), 4)
        self.assertLess(objects[0]['position'][1], objects[1]['position'][1])
        self.assertEqual(objects[-1]['wall'], 'right')
        self.assertEqual(result['room']['enclosure'], 'room')

    def test_wall_frames_are_bounded_and_do_not_overlap(self):
        result = normalize_spec({'objects': [
            {'kind': 'picture', 'size': [1.6, 1.2, .08], 'elevation': 1.1}] * 3})
        for item in result['objects']:
            self.assertLessEqual(item['elevation'] + item['size'][1], result['room']['size'][1])
        self.assertEqual(result['layoutCheck']['wallOverlaps'], 0)

    def test_rejects_3d_cuboids_instead_of_interpreting_them_as_image_rectangles(self):
        with self.assertRaisesRegex(ValueError, '인식한 공간 요소가 없습니다'):
            normalize_spec({'objects': [{'kind': 'armchair',
                'bbox': [.53, -.01, 2.07, .7, .72, .7, .03, .3, .03]}]})
        self.assertEqual(normalize_spec({'objects': [{'kind': 'armchair',
            'bbox_2d': [400, 150, 900, 850]}]})['objects'][0]['kind'], 'armchair')


if __name__ == '__main__':
    unittest.main()
