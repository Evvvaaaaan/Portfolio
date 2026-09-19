"""Run with Blender after opening a generated .blend file."""
import bpy
import bmesh
import json
import math

meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
cameras = [obj for obj in bpy.context.scene.objects if obj.type == 'CAMERA']
images = [image for image in bpy.data.images if image.type == 'IMAGE' and image.name.startswith(('texture-', 'generated-'))]
assert meshes and sum(len(obj.data.polygons) for obj in meshes) > 1000
assert cameras and bpy.context.scene.camera
if bpy.context.scene.get('representation') == 'closed-solids-v1':
    assert not images, 'Solid reconstruction must not project photographs onto depth sheets'
    for obj in meshes:
        assert obj.get('stableSolid'), obj.name
        assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(e.is_manifold for e in bm.edges), obj.name
        assert all(f.calc_area() > 1e-12 for f in bm.faces), obj.name
        bm.free()
else:
    assert images and all(image.packed_file for image in images), 'Textures must be packed into the .blend'
    assert all(obj.data.uv_layers for obj in meshes), 'Every surface needs photographic UVs'
assert all(not obj.data.validate(clean_customdata=False) for obj in meshes), 'Exported meshes must already be valid'
assert bpy.context.scene.get('scale') == 'Relative, not surveyed dimensions'
print('BLENDER_VERIFIED ' + json.dumps(dict(meshes=len(meshes), cameras=len(cameras),
                                           packedTextures=len(images),
                                           triangles=sum(len(obj.data.polygons) for obj in meshes))))
