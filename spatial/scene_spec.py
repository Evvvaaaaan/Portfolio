"""Untrusted vision-model JSON becomes a bounded, declarative solid scene.

No generated Python, shaders, file paths, or executable code are accepted.
"""
import json
import math
import re

KINDS = {'sofa', 'armchair', 'chair', 'table', 'desk', 'bed', 'cabinet', 'shelf',
         'plant', 'tree', 'rug', 'lamp', 'screen', 'window', 'door', 'picture',
         'counter', 'stool', 'bench', 'building', 'object'}
WALL_ITEMS = {'window', 'door', 'picture'}
SIZES = {'sofa': [2.3, .95, 1], 'armchair': [.85, .9, .85], 'chair': [.6, .95, .6],
         'table': [1.15, .48, .9], 'desk': [1.5, .76, .7], 'bed': [1.7, 1, 2.1],
         'cabinet': [1.8, .8, .48], 'shelf': [1.2, 1.8, .4], 'plant': [.8, 1.7, .8],
         'tree': [1.1, 2.1, 1.1], 'rug': [3.2, .018, 2.7], 'lamp': [.5, 1.6, .5],
         'screen': [1.3, 1, .3], 'window': [2.6, 2.1, .12], 'door': [.9, 2.1, .12],
         'picture': [1.6, 1.2, .12], 'counter': [2.2, .95, .7], 'stool': [.45, .65, .45],
         'bench': [1.5, .5, .5], 'building': [2, 2.4, 2], 'object': [.8, .8, .8]}


def number(value, default, low, high):
    try:
        value = float(value)
        return min(high, max(low, value)) if math.isfinite(value) else default
    except (ValueError, TypeError):
        return default


def color(value, default):
    return value.lower() if isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value) else default


def vector(value, defaults, limits):
    if not isinstance(value, list) or len(value) != len(defaults):
        value = defaults
    return [number(v, d, *bounds) for v, d, bounds in zip(value, defaults, limits)]


def footprint(item):
    w, _, d = item['size']
    a = math.radians(item['yaw'])
    return ((abs(math.cos(a)) * w + abs(math.sin(a)) * d) / 2,
            (abs(math.sin(a)) * w + abs(math.cos(a)) * d) / 2)


def grounded_objects(raw):
    """Convert image-space observations to a plausible layout, not measured depth.

    The small vision model is reliable at 2D grounding, not metric 3D coordinates.
    Furniture dimensions are intentionally conservative semantic approximations.
    """
    result, accepted = [], []
    for observed in raw[:40]:
        if not isinstance(observed, dict) or observed.get('kind') not in KINDS:
            continue
        bounds = observed.get('bbox_2d', observed.get('bbox'))
        if not isinstance(bounds, list) or len(bounds) != 4:
            continue
        x1, y1, x2, y2 = [number(v, -1, 0, 1000) / 1000 for v in bounds]
        if x2 - x1 < .025 or y2 - y1 < .02:
            continue
        kind = observed['kind']
        if kind == 'lamp' and y2 - y1 < .2:
            continue  # Table accessories are not floor furniture.
        family = 'plant' if kind in ('plant', 'tree') else kind
        duplicate = False
        for old_family, (ox1, oy1, ox2, oy2) in accepted:
            intersection = max(0, min(x2, ox2) - max(x1, ox1)) * max(0, min(y2, oy2) - max(y1, oy1))
            union = (x2 - x1) * (y2 - y1) + (ox2 - ox1) * (oy2 - oy1) - intersection
            if family == old_family and intersection / max(union, .0001) > .65:
                duplicate = True
                break
        if duplicate:
            continue
        accepted.append((family, (x1, y1, x2, y2)))
        x, z = x1 + x2 - 1, max(-.85, min(.85, (y2 - .74) * 3))
        size = SIZES[kind].copy()
        yaw = 0
        if kind in ('sofa', 'armchair', 'chair', 'bench'):
            yaw = -90 if x > .35 else 90 if x < -.35 else 0
        if kind == 'table' and x2 - x1 < .18:
            size = [.65, .6, .65]
        if kind in ('plant', 'tree'):
            factor = max(.6, min(1.15, (y2 - y1) / .4))
            size = [v * factor for v in size]
        wall = observed.get('wall')
        if wall not in ('back', 'left', 'right'):
            wall = 'left' if x < -.65 else 'right' if x > .65 else 'back'
        if kind in WALL_ITEMS:
            z = -.4 if wall != 'back' else -.9
        result.append(dict(kind=kind, label=str(observed.get('label', kind))[:70],
            x=x, z=z, size=size, yaw=yaw, color=observed.get('color'), wall=wall,
            elevation=.35 if kind == 'window' else 1.15 if kind == 'picture' else 0,
            shape=observed.get('shape', 'round' if kind == 'table' else 'rectangular')))
    return result


def separate_objects(result):
    """Nearest feasible floor placement. Never export an overlapping pile."""
    width, height, depth = result['room']['size']
    occupied = []
    floor = [o for o in result['objects'] if o['kind'] not in WALL_ITEMS | {'rug'}]
    for item in sorted(floor, key=lambda o: o['size'][0] * o['size'][2], reverse=True):
        hx, hz = footprint(item)
        desired_x, desired_z = item['position']
        xmin, xmax = -width / 2 + hx + .19, width / 2 - hx - .19
        zmin, zmax = -depth / 2 + hz + .19, depth / 2 - hz - .19
        candidates = [(max(xmin, min(xmax, desired_x)), max(zmin, min(zmax, desired_z)))]
        candidates += [(xmin + (xmax - xmin) * i / 36, zmin + (zmax - zmin) * j / 36)
                       for i in range(37) for j in range(37)]
        candidates.sort(key=lambda p: (p[0] - desired_x) ** 2 + (p[1] - desired_z) ** 2)
        for x, z in candidates:
            if all(abs(x - ox) >= hx + ohx + .08 or abs(z - oz) >= hz + ohz + .08
                   for ox, oz, ohx, ohz in occupied):
                item['position'] = [round(x, 5), round(z, 5)]
                occupied.append((x, z, hx, hz))
                break
        else:
            raise ValueError('가구가 겹치지 않는 배치를 만들지 못했습니다. 더 넓게 촬영한 사진으로 다시 시도해 주세요.')
    walls = {'back': [], 'left': [], 'right': []}
    for item in [o for o in result['objects'] if o['kind'] in WALL_ITEMS]:
        wall = item['wall']
        span = width if wall == 'back' else depth
        w, h, _ = item['size']
        w, h = min(w, span - .4), min(h, height - .25)
        item['size'] = [w, h, .12]
        horizontal = item['position'][0 if wall == 'back' else 1]
        y = 0 if item['kind'] == 'door' else min(item['elevation'], height - h - .12)
        lo, hi = -span / 2 + w / 2 + .15, span / 2 - w / 2 - .15
        centers = [(max(lo, min(hi, horizontal)), max(.025, y))]
        centers += [(lo + (hi - lo) * i / 24, .025 + (height - h - .15) * j / 12)
                    for i in range(25) for j in range(13)]
        centers.sort(key=lambda p: (p[0] - horizontal) ** 2 + (p[1] - y) ** 2)
        for x, y in centers:
            if all(abs(x - ox) >= (w + ow) / 2 + .05 or y >= oy + oh + .05 or oy >= y + h + .05
                   for ox, oy, ow, oh in walls[wall]):
                item['position'][0 if wall == 'back' else 1] = x
                item['elevation'] = y
                walls[wall].append((x, y, w, h))
                break
        else:
            raise ValueError('벽면 요소가 겹치지 않는 배치를 만들지 못했습니다. 다른 사진으로 다시 시도해 주세요.')
    result['layoutCheck'] = {'floorOverlaps': 0, 'wallOverlaps': 0, 'floorObjects': len(floor)}


def normalize_spec(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get('objects'), list):
        raise ValueError('사진에서 공간 구성을 읽지 못했습니다. 공간 전체가 보이는 사진으로 다시 시도해 주세요.')
    room = raw.get('room') if isinstance(raw.get('room'), dict) else {}
    width, height, depth = vector(room.get('size'), [6, 2.8, 5], [(3, 12), (2.2, 4.5), (3, 12)])
    result = dict(version=1, room=dict(size=[width, height, depth],
        enclosure='open' if room.get('enclosure') == 'open' else 'room',
        wallColor=color(room.get('wallColor'), '#e5dfd2'),
        floorColor=color(room.get('floorColor'), '#b59b7c')), objects=[])
    objects = raw['objects']
    if any(isinstance(item, dict) and ('bbox_2d' in item or 'bbox' in item) for item in objects):
        objects = grounded_objects(objects)
    for i, item in enumerate(objects[:28]):
        if not isinstance(item, dict):
            continue
        kind = item.get('kind', 'object')
        if kind not in KINDS:
            kind = 'object'
        if kind == 'building' and result['room']['enclosure'] == 'room':
            continue
        size = vector(item.get('size'), [.8, .8, .8], [(.12, width * .65), (.08, height * .92), (.1, depth * .65)])
        yaw = number(item.get('yaw'), 0, -360, 360)
        position = item.get('position')
        if isinstance(position, list) and len(position) == 3:
            position = [position[0], position[2]]
        if 'x' in item and 'z' in item:
            position = [number(item['x'], 0, -1, 1) * width * .42,
                        number(item['z'], 0, -1, 1) * depth * .42]
        x, z = vector(position, [0, 0], [(-width / 2, width / 2), (-depth / 2, depth / 2)])
        if kind == 'rug':
            size[1] = .018
        angle = math.radians(yaw)
        half_x = (abs(math.cos(angle)) * size[0] + abs(math.sin(angle)) * size[2]) / 2
        half_z = (abs(math.sin(angle)) * size[0] + abs(math.cos(angle)) * size[2]) / 2
        # Even rotated furniture must fit inside the room, not slice through walls.
        fit = min(1., (width - .5) / (2 * half_x), (depth - .5) / (2 * half_z))
        size[0] *= fit
        size[2] *= fit
        half_x *= fit
        half_z *= fit
        x = max(-width / 2 + half_x + .12, min(width / 2 - half_x - .12, x))
        z = max(-depth / 2 + half_z + .12, min(depth / 2 - half_z - .12, z))
        result['objects'].append(dict(id=f'item-{i:02d}', kind=kind,
            label=str(item.get('label', kind))[:70], size=size, position=[x, z], yaw=yaw,
            color=color(item.get('color'), '#b7afa0'),
            wall=item.get('wall') if item.get('wall') in ('back', 'left', 'right') else 'back',
            elevation=number(item.get('elevation'), 1.1, .1, height - .2),
            shape='round' if item.get('shape') == 'round' else 'rectangular'))
    if not result['objects']:
        raise ValueError('인식한 공간 요소가 없습니다. 벽·바닥·가구가 함께 보이는 사진으로 다시 시도해 주세요.')
    if any(item['kind'] in WALL_ITEMS | {'sofa', 'armchair', 'bed', 'cabinet', 'shelf', 'desk', 'rug', 'screen', 'counter'}
           for item in result['objects']):
        result['room']['enclosure'] = 'room'
    separate_objects(result)
    return result


def parse_spec(text):
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end < start:
        raise ValueError('공간 배치 응답이 올바르지 않습니다. 다시 생성해 주세요.')
    try:
        return normalize_spec(json.loads(text[start:end + 1]))
    except (json.JSONDecodeError, RecursionError) as error:
        raise ValueError('공간 배치를 완성하지 못했습니다. 다른 사진으로 다시 시도해 주세요.') from error
