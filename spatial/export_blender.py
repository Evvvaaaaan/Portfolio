"""Run inside Blender: create real editable, packed, textured scene artifacts."""
import json
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Matrix, Vector
from math import radians

job = Path(sys.argv[sys.argv.index("--") + 1])
completed = '--completed' in sys.argv
stem = 'completed' if completed else 'scene'
metadata = json.loads((job / "scene.json").read_text())
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = "Spatial Studio · Photo Reconstruction"
scene["reconstruction_notes"] = "\n".join(metadata["warnings"])
scene["engine"] = metadata["engine"]
scene["scale"] = "Relative, not surveyed dimensions"
if completed:
    scene['generated_completion'] = metadata['completion']['warning']
    scene['completion_model_license'] = metadata['completion']['license']


def to_blender(value):
    x, y, z = value
    return (x, -z, y)


surfaces = [(f'surface-{i}.npz', f'texture-{i}.jpg', False) for i in range(metadata['sourceCount'])]
if completed:
    surfaces += [(f'generated-surface-{i}.npz', f'generated-{i}.jpg', True) for i in range(metadata['completion']['viewCount'])]
for index, (surface, photograph, generated) in enumerate(surfaces):
    data = np.load(job / surface)
    if not len(data['faces']):
        continue
    vertices = data["vertices"][:, [0, 2, 1]].copy()
    vertices[:, 1] *= -1
    faces = data["faces"]
    mesh = bpy.data.meshes.new(f"Inferred surface {index + 1}")
    mesh.vertices.add(len(vertices))
    mesh.vertices.foreach_set("co", vertices.ravel())
    mesh.loops.add(faces.size)
    mesh.loops.foreach_set("vertex_index", faces.ravel())
    mesh.polygons.add(len(faces))
    mesh.polygons.foreach_set("loop_start", np.arange(len(faces), dtype=np.int32) * 3)
    mesh.polygons.foreach_set("loop_total", np.full(len(faces), 3, dtype=np.int32))
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Source photograph projection")
    uv_layer.data.foreach_set("uv", data["uv"][faces.ravel()].ravel())
    label = 'AI generated' if generated else 'Photo'
    obj = bpy.data.objects.new(f"{label} {index + 1:02d} · surface", mesh)
    scene.collection.objects.link(obj)
    obj["source"] = photograph
    obj['generated'] = generated
    obj["method"] = 'Local SDXL generative completion, not observed' if generated else "Joint depth and pose inference, discontinuity-filtered triangles"
    material = bpy.data.materials.new(f"Photographic appearance {index + 1}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(job / photograph))
    texture.image.pack()
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    obj.data.materials.append(material)

views = metadata['cameras'] + (metadata['completion']['cameras'] if completed else [])
for index, view in enumerate(views):
    camera_data = bpy.data.cameras.new(f"Source camera {index + 1}")
    camera = bpy.data.objects.new(f"Source camera {index + 1}", camera_data)
    scene.collection.objects.link(camera)
    camera.location = to_blender(view["position"])
    direction = (Vector(to_blender(view["target"])) - camera.location).normalized()
    up = Vector(to_blender(view["up"])).normalized()
    right = direction.cross(up).normalized()
    up = right.cross(direction).normalized()
    camera.rotation_euler = Matrix((right, up, -direction)).transposed().to_euler()
    camera_data.type = "PERSP"
    camera_data.sensor_fit = "VERTICAL"
    camera_data.sensor_height = 36
    camera_data.sensor_width = 36
    camera_data.angle = radians(view["fov"])
    camera_data.clip_start = .005
    camera_data.clip_end = 10000
    if index == 0:
        scene.camera = camera

scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.world.color = (.025, .025, .025)
scene.render.resolution_x = 1440
scene.render.resolution_y = round(1440 / metadata["cameras"][0]["aspect"])
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 94
scene.render.filepath = str(job / ('completed-preview.jpg' if completed else 'preview.jpg'))
bpy.ops.wm.save_as_mainfile(filepath=str(job / f"{stem}.blend"), compress=True)
bpy.ops.export_scene.gltf(filepath=str(job / f"{stem}.glb"), export_format="GLB", export_extras=True,
                          export_cameras=True, export_yup=True, export_image_format="JPEG",
                          export_jpeg_quality=95, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=16,
                          export_draco_texcoord_quantization=14)
bpy.ops.render.render(write_still=True)
triangles = sum(len(obj.data.polygons) for obj in scene.objects if obj.type == 'MESH')
print(f"SPATIAL_EXPORT_OK: {triangles} triangles; packed textures; {len(views)} cameras")
