"""Validate the actual compressed web artifact after decoding it in Blender."""
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy

job = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(job / 'scene.glb'))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
assert meshes, 'Decoded GLB contains no geometry'
faces = 0
for obj in meshes:
    assert obj.get('stableSolid'), f'Unverified mesh in GLB: {obj.name}'
    assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # glTF splits vertices at normal/material seams. Weld only in this diagnostic
    # copy to test geometric closure; never repair or overwrite the export.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    assert all(edge.is_manifold for edge in bm.edges), f'Open decoded surface: {obj.name}'
    assert all(face.calc_area() > 1e-12 for face in bm.faces), f'Collapsed decoded face: {obj.name}'
    faces += len(bm.faces)
    bm.free()
metadata = json.loads((job / 'scene.json').read_text())
metadata['qualityGate']['exportRoundTrip'] = True
(job / 'scene.json.tmp').write_text(json.dumps(metadata, ensure_ascii=False))
(job / 'scene.json.tmp').replace(job / 'scene.json')
print(f'GLB_ROUNDTRIP_VERIFIED: {len(meshes)} closed meshes, {faces} faces', flush=True)
