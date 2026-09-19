"""Blender builder: bounded furniture primitives, never stretched photo meshes."""
import json
import math
from pathlib import Path
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

job = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
spec = json.loads((job / 'scene-spec.json').read_text())
width, height, depth = spec['room']['size']
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Spatial Studio · Stable Solids'
scene['representation'] = 'closed-solids-v1'
scene['scale'] = 'Relative, not surveyed dimensions'
scene['notes'] = 'AI-inferred arrangement; closed parametric furniture; no photograph-projected depth sheets.'
materials = {}
parent = None


def xyz(p):
    return (p[0], -p[2], p[1])


def material(hex_color, roughness=.72):
    key = (hex_color, roughness)
    if key not in materials:
        rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
        mat = bpy.data.materials.new(f'Color {hex_color}')
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*linear, 1)
        shader.inputs['Roughness'].default_value = roughness
        materials[key] = mat
    return materials[key]


def finish(obj, name, color, smooth=False):
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(material(color))
    for face in obj.data.polygons:
        face.use_smooth = smooth
    obj['stableSolid'] = True
    return obj


def box(name, center, size, color, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new('Rounded closed edges', 'BEVEL')
        modifier.width = min(bevel, min(size) * .24)
        modifier.segments = 3
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normals = obj.modifiers.new('Stable flat normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normals.name)
    return finish(obj, name, color)


def cylinder(name, center, radius, length, color, top=None):
    if top is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=length, location=xyz(center))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=radius, radius2=top, depth=length, location=xyz(center))
    return finish(bpy.context.object, name, color, True)


def ellipsoid(name, center, size, color):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=xyz(center))
    obj = bpy.context.object
    obj.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, color, True)


def rod(name, start, end, radius, color):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=(b - a).length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, color, True)


def group(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    return obj


def merge(group_obj):
    children = [o for o in group_obj.children if o.type == 'MESH']
    if not children:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in children:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = children[0]
    bpy.ops.object.join()
    obj = children[0]
    obj.name = group_obj.name + ' · closed surfaces'
    obj['generated'] = True
    obj['stableSolid'] = True
    if group_obj.get('cutaway'):
        obj['cutaway'] = group_obj['cutaway']
    return obj


wood, metal, cream = '#805f43', '#343936', '#f1eee5'
parent = group('Floor')
box('Foundation', (0, -.1, 0), (width + .22, .2, depth + .22), spec['room']['floorColor'], .05)
for col in range(14):
    for row in range(6):
        box('Floorboard', (-width / 2 + (col + .5) * width / 14, .009, -depth / 2 + (row + .5) * depth / 6),
            (width / 14 - .009, .018, depth / 6 - .009), spec['room']['floorColor'], .003)
merge(parent)

if spec['room']['enclosure'] == 'room':
    for wall, center, size in [('back', (0, height / 2, -depth / 2), (width + .18, height, .16)),
                               ('left', (-width / 2, height / 2, 0), (.16, height, depth)),
                               ('right', (width / 2, height / 2, 0), (.16, height, depth))]:
        parent = group('Wall ' + wall)
        parent['cutaway'] = wall
        box('Solid wall', center, size, spec['room']['wallColor'], .012)
        if wall == 'back':
            box('Skirting', (0, .065, -depth / 2 + .1), (width, .13, .055), cream, .006)
        else:
            box('Skirting', ((-1 if wall == 'left' else 1) * (width / 2 - .1), .065, 0), (.055, .13, depth), cream, .006)
        merge(parent)

for index, item in enumerate(spec['objects']):
    w, h, d = item['size']
    kind, color = item['kind'], item['color']
    parent = group(item['label'])
    parent['kind'] = kind
    parent['generated'] = True
    if kind in ('sofa', 'armchair', 'bench'):
        for x in [-w * .38, w * .38]:
            for z in [-d * .32, d * .32]:
                rod('Foot', (x, .02, z), (x, h * .24, z), min(.04, w * .04), wood)
        box('Seat base', (0, h * .32, 0), (w * .91, h * .25, d * .88), color, .08)
        if kind != 'bench':
            box('Back', (0, h * .7, -d * .38), (w * .9, h * .6, d * .21), color, .08)
            for x in [-w * .44, w * .44]:
                box('Arm', (x, h * .48, 0), (w * .12, h * .53, d * .96), color, .065)
        seats = 2 if kind == 'sofa' and w > 1.4 else 1
        for i in range(seats):
            x = (i - (seats - 1) / 2) * w * .77 / seats
            box('Seat cushion', (x, h * .51, d * .065), (w * .75 / seats, h * .17, d * .7), color, .07)
            if kind != 'bench':
                box('Back cushion', (x, h * .78, -d * .27), (w * .73 / seats, h * .39, d * .16), cream if i == 0 else color, .08)
    elif kind in ('chair', 'stool'):
        for x in [-w * .36, w * .36]:
            for z in [-d * .34, d * .34]:
                rod('Chair leg', (x * 1.12, .025, z * 1.12), (x, h * .46, z), min(.027, w * .055), wood)
        box('Seat', (0, h * .48, 0), (w, h * .1, d), color, .035)
        if kind == 'chair':
            for x in [-w * .4, w * .4]:
                rod('Back frame', (x, h * .42, -d * .4), (x, h * .95, -d * .4), .025, wood)
            box('Backrest', (0, h * .8, -d * .4), (w, h * .37, d * .12), color, .025)
    elif kind in ('table', 'desk'):
        if item['shape'] == 'round':
            radius = min(w, d) / 2
            cylinder('Round tabletop', (0, h - .045, 0), radius, .09, color)
            cylinder('Pedestal', (0, h * .46, 0), radius * .18, h * .88, wood)
            cylinder('Stable base', (0, .065, 0), radius * .57, .1, wood)
        else:
            box('Tabletop', (0, h - .045, 0), (w, .09, d), color, .035)
            for x in [-w * .4, w * .4]:
                for z in [-d * .36, d * .36]:
                    rod('Table leg', (x, .02, z), (x, h - .09, z), min(.045, w * .045), wood)
        cylinder('Ceramic vase', (w * .2, h + .14, 0), .085, .28, cream, top=.055)
    elif kind == 'bed':
        box('Bed frame', (0, h * .23, 0), (w, h * .36, d), wood, .055)
        box('Mattress', (0, h * .49, d * .02), (w * .95, h * .27, d * .94), cream, .1)
        box('Duvet', (0, h * .65, d * .15), (w * .96, h * .13, d * .66), color, .1)
        box('Headboard', (0, h * .54, -d * .47), (w * 1.02, h * 1.03, .13), color, .065)
        for x in [-w * .24, w * .24]:
            box('Pillow', (x, h * .7, -d * .32), (w * .42, h * .15, d * .22), cream, .1)
    elif kind in ('cabinet', 'counter', 'shelf', 'building'):
        box('Top', (0, h - .04, 0), (w, .08, d), color, .015)
        box('Base', (0, .08, 0), (w, .12, d), color, .015)
        box('Back', (0, h / 2, -d / 2 + .035), (w, h, .07), color, .01)
        for x in [-w / 2 + .035, w / 2 - .035]:
            box('Side', (x, h / 2, 0), (.07, h, d), color, .012)
        if kind == 'shelf':
            for level in range(1, 4):
                y = h * level / 4
                box('Shelf', (0, y, 0), (w * .96, .05, d * .95), color, .008)
                for j in range(3):
                    box('Book', (-w * .32 + j * .09, y + h * .08, d * .12), (.06, h * .15, d * .55), [cream, '#728476', '#ba8362'][j], .004)
        else:
            for x in [-w * .25, w * .25]:
                box('Door', (x, h * .52, d / 2), (w * .48, h * .85, .055), color, .01)
                rod('Handle', (x + w * .12, h * .45, d / 2 + .045), (x + w * .12, h * .6, d / 2 + .045), .009, metal)
    elif kind in ('plant', 'tree'):
        pot_h = h * (.19 if kind == 'plant' else .12)
        cylinder('Plant pot', (0, pot_h / 2, 0), w * .22, pot_h, '#bf9f80', top=w * .3)
        cylinder('Soil', (0, pot_h + .004, 0), w * .27, .018, '#594c39')
        rod('Trunk', (0, pot_h, 0), (0, h * .93, 0), max(.018, w * .026), wood)
        rng = random.Random(index + 401)
        for i in range(18):
            angle = i * 2.4
            y = pot_h + (h - pot_h) * (.2 + i / 24)
            r = w * (.24 + rng.random() * .17)
            x, z = math.cos(angle) * r, math.sin(angle) * r
            rod('Branch', (0, y - .12, 0), (x, y, z), .008, wood)
            leaf = ellipsoid('Solid leaf', (x, y + .025, z), (w * .38, h * .09, d * .22), ['#426548', '#718757', '#5a794d'][i % 3])
            leaf.rotation_euler[2] = -angle
    elif kind == 'rug':
        if item['shape'] == 'round':
            cylinder('Round rug', (0, .035, 0), min(w, d) / 2, .025, color)
        else:
            box('Woven rug', (0, .032, 0), (w, .025, d), color, .02)
            for z in [-d * .43, d * .43]:
                box('Rug border', (0, .046, z), (w * .93, .004, .025), cream, .001)
    elif kind == 'lamp':
        cylinder('Lamp base', (0, .055, 0), w * .35, .09, metal)
        rod('Lamp stem', (0, .08, 0), (0, h * .9, 0), .023, metal)
        cylinder('Closed lampshade', (0, h * .86, 0), w * .5, h * .27, color, top=w * .3)
    elif kind == 'screen':
        box('Display', (0, h * .66, 0), (w, h * .68, .065), metal, .025)
        box('Screen glass', (0, h * .66, .038), (w * .93, h * .61, .009), '#405b64', .008)
        cylinder('Screen support', (0, h * .18, 0), .04, h * .36, metal)
        box('Screen foot', (0, .04, .02), (w * .45, .055, d), metal, .02)
    elif kind in ('window', 'picture', 'door'):
        wall = item['wall']
        parent['cutaway'] = wall
        w = min(w, (width if wall == 'back' else depth) - .5)
        h = min(h, height - .3)
        elevation = 0 if kind == 'door' else min(item['elevation'], height - h - .12)
        box('Frame', (0, elevation + h / 2, 0), (w, h, .12), wood if kind == 'picture' else cream, .015)
        box('Inset', (0, elevation + h / 2, .068), (w * .91, h * .92, .02), '#b6ccd1' if kind == 'window' else color, .006)
        if kind == 'window':
            box('Window mullion', (0, elevation + h / 2, .087), (.035, h * .95, .025), cream, .003)
            box('Window transom', (0, elevation + h * .48, .087), (w * .95, .04, .025), cream, .003)
        elif kind == 'picture':
            for j in range(3):
                box('Abstract artwork', ((j - 1) * w * .2, elevation + h * (.35 + j * .15), .084),
                    (w * .18, h * .29, .004), [metal, '#b58560', '#7e927b'][j], .001)
        if wall == 'back':
            item['position'] = [max(-width / 2 + w / 2 + .15, min(width / 2 - w / 2 - .15, item['position'][0])), -depth / 2 + .09]
            item['yaw'] = 0
        else:
            item['position'] = [(-1 if wall == 'left' else 1) * (width / 2 - .09), max(-depth / 2 + w / 2 + .15, min(depth / 2 - w / 2 - .15, item['position'][1]))]
            item['yaw'] = 90 if wall == 'left' else -90
    else:
        box('Bounded solid', (0, h / 2, 0), (w, h, d), color, .07)
    mesh = merge(parent)
    if kind not in ('window', 'picture', 'door', 'rug'):
        # Decorative details (leaves, handles, pillows) must remain inside the
        # footprint that the non-overlapping layout solver reserved.
        local = np.asarray([mesh.matrix_local @ vertex.co for vertex in mesh.data.vertices])
        low, high = local.min(axis=0), local.max(axis=0)
        extent = high - low
        mesh.location.x -= (low[0] + high[0]) / 2
        mesh.location.y -= (low[1] + high[1]) / 2
        mesh.location.z -= low[2]
        parent.scale = (min(1., w / extent[0]), min(1., d / extent[1]), min(1., h / extent[2]))
    parent.location = xyz((item['position'][0], .025, item['position'][1]))
    parent.rotation_euler[2] = math.radians(item['yaw'])

parent = None
bpy.context.view_layer.update()
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
non_manifold = degenerate = 0
furniture_bounds = []
for obj in meshes:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold += sum(not edge.is_manifold for edge in bm.edges)
    degenerate += sum(face.calc_area() < 1e-12 for face in bm.faces)
    bm.free()
    points = np.asarray([obj.matrix_world @ vertex.co for vertex in obj.data.vertices])
    if not np.isfinite(points).all() or np.abs(points).max() > 25:
        raise ValueError('Invalid or unbounded solid geometry')
    if obj.data.validate(clean_customdata=False):
        raise ValueError('A solid required mesh repair; refuse export')
    if obj.parent and obj.parent.get('kind') not in (None, 'window', 'picture', 'door', 'rug'):
        low, high = points.min(axis=0), points.max(axis=0)
        if low[0] < -width / 2 + .1 or high[0] > width / 2 - .1 or low[1] < -depth / 2 + .1 or high[1] > depth / 2 - .1:
            raise ValueError('Furniture crosses a room boundary')
        if any(np.all(high[:2] > other_low[:2] + .001) and np.all(other_high[:2] > low[:2] + .001)
               for other_low, other_high in furniture_bounds):
            raise ValueError('Furniture overlap detected in final geometry')
        furniture_bounds.append((low, high))
if non_manifold or degenerate:
    raise ValueError(f'Solid quality gate failed: {non_manifold} non-manifold edges, {degenerate} degenerate faces')

scene.render.engine = 'CYCLES'
scene.cycles.samples = 32 if spec['quality'] == 'detail' else 16
scene.cycles.use_denoising = True
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.78, .8, .75, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
for name, location, power, size in [('Key', (-3, -4, 8), 1450, 7), ('Fill', (5, 0, 6), 850, 5)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, .5)) - light.location).to_track_quat('-Z', 'Y').to_euler()

distance = math.hypot(width, depth) * 1.12
target = Vector((0, 0, height * .3))
camera_data = bpy.data.cameras.new('Inspection camera')
camera = bpy.data.objects.new('Inspection camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'PERSP'
camera_data.lens = 48
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 36
camera_data.clip_start, camera_data.clip_end = .05, 150
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 92
scene.render.film_transparent = False


def place_camera(yaw, elevation=27):
    a, e = math.radians(yaw), math.radians(elevation)
    position = Vector((distance * math.sin(a) * math.cos(e), -distance * math.cos(a) * math.cos(e), distance * math.sin(e))) + target
    camera.location = position
    camera.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()
    # Deliberate whole-wall cutaways, shared by Blender and browser; never clipped meshes.
    for obj in meshes:
        side = obj.get('cutaway')
        hidden = (side == 'left' and position.x < -.1) or (side == 'right' and position.x > .1) or (side == 'back' and position.y > .1)
        obj.hide_render = hidden
    return dict(position=[position.x, position.z, -position.y], target=[target.x, target.z, -target.y],
        up=[0, 1, 0], fov=math.degrees(2 * math.atan(camera_data.sensor_height / (2 * camera_data.lens))), aspect=1.4, distance=distance,
        yawDegrees=yaw, generated=True)


views = []
scene.render.resolution_x, scene.render.resolution_y = 896, 640
scene.render.resolution_percentage = 100
for i, yaw in enumerate([0, -90, -60, -30, 30, 60, 90]):
    view = place_camera(yaw)
    view['image'] = f'view-{i}.jpg'
    views.append(view)
    scene.render.filepath = str(job / view['image'])
    bpy.ops.render.render(write_still=True)

status = json.loads((job / 'status.json').read_text())
status.update(stage='verifying', progress=85)
(job / 'status.json.tmp').write_text(json.dumps(status, ensure_ascii=False))
(job / 'status.json.tmp').replace(job / 'status.json')
scene.render.resolution_x, scene.render.resolution_y = 448, 320
scene.cycles.samples = 4
checks = []
for elevation in [18, 27, 42]:
    for yaw in range(-90, 91, 15):
        place_camera(yaw, elevation)
        if math.hypot(camera.location.x, camera.location.y) * .85 <= math.hypot(width, depth) / 2 + .3:
            raise ValueError('Orbit camera can enter the room geometry')
        scene.render.filepath = str(job / f'audit-{yaw}-{elevation}.jpg')
        bpy.ops.render.render(write_still=True)
        rendered = bpy.data.images.load(scene.render.filepath, check_existing=False)
        pixels = np.asarray(rendered.pixels[:], dtype=np.float32).reshape(-1, 4)
        if not np.isfinite(pixels).all() or pixels[:, :3].std() < .025:
            raise ValueError(f'Invalid inspection render at {yaw}/{elevation}')
        bpy.data.images.remove(rendered)
        checks.append([yaw, elevation])

place_camera(0)
scene.render.resolution_x, scene.render.resolution_y = 1440, 1029
scene.cycles.samples = 48 if spec['quality'] == 'detail' else 24
scene.render.filepath = str(job / 'preview.jpg')
bpy.ops.render.render(write_still=True)
for obj in meshes:
    obj.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=str(job / 'scene.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(job / 'scene.glb'), export_format='GLB', export_extras=True,
    export_cameras=False, export_yup=True, export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6, export_draco_position_quantization=16)
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in meshes)
metadata = dict(engine='Qwen3-VL 2B · bounded solid reconstruction', device=spec['device'],
    primaryOnlyRetry=spec.get('primaryOnlyRetry', False),
    representation='closed-solids-v1', sourceCount=spec['sourceCount'], objectCount=len(spec['objects']),
    vertices=sum(len(o.data.vertices) for o in meshes), triangles=triangles,
    cameras=views, sources=[f'source-{i}.jpg' for i in range(spec['sourceCount'])],
    roomSize=spec['room']['size'], scale='relative', license='Apache-2.0',
    warnings=['사진의 배치와 색을 참고한 CG 재구성입니다. 실제 가구 모양·치수와 다를 수 있습니다.',
              '내부를 볼 수 있도록 카메라 쪽 벽과 천장은 생략한 개방형 공간 모델입니다.'],
    qualityGate=dict(status='passed', version=1, nonManifoldEdges=non_manifold,
        degenerateFaces=degenerate, furnitureOverlaps=0, inspectedViews=len(checks), angles=checks,
        photoProjectedSurfaces=0, cameraOutsideGeometry=True),
    completion=dict(status='ready', local=True, apiCost=0, horizontalRange=180,
        representation='closed-solids-v1', warning='닫힌 입체로 재구성한 공간입니다. 사진과 형태가 다를 수 있습니다.'))
(job / 'scene.json').write_text(json.dumps(metadata, ensure_ascii=False))
print(f'STABLE_SOLIDS_OK: {len(meshes)} closed meshes, {triangles} triangles, {len(checks)} inspected views', flush=True)
