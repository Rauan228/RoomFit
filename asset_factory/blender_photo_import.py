"""Private Tripo GLB -> normalized GLB + orthographic derivatives, offline only.

Separate from stock model authoring so concurrent catalog work does not invalidate it.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix


def main():
    source, settings_path, destination = [Path(a) for a in sys.argv[sys.argv.index("--")+1:]]
    spec = json.loads(settings_path.read_text(encoding="utf-8"))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not objects or len(objects) > 200:
        raise ValueError("Unsupported number of mesh parts")
    # Tripo v3 defaults to X-forward. RoomFit +Z-forward is Blender -Y.
    baseline_yaw = -90 if spec.get("source_forward", "+X") == "+X" else 0
    rotation = Matrix.Rotation(math.radians(baseline_yaw + spec.get("yaw", 0)), 4, "Z")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    worlds = {obj: rotation @ obj.matrix_world.copy() for obj in objects}
    for obj in objects:
        obj.data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
        world = worlds[obj]
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(world)
        # AI material colors/textures remain untouched; runtime does not recolor them.
        for mat in obj.data.materials:
            if mat and "slot" in mat:
                del mat["slot"]
    vertices = [v.co for obj in objects for v in obj.data.vertices]
    low = Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
    size = high-low
    if min(size) < 0.00001:
        raise ValueError("Degenerate imported geometry")
    d = spec["dimensions"]
    target = Vector((d["width_mm"]/1000, d["depth_mm"]/1000, d["height_mm"]/1000))
    factors = [target[i]/size[i] for i in range(3)]
    center = Vector(((high.x+low.x)/2, (high.y+low.y)/2, low.z))
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co = Vector(tuple((vertex.co[i]-center[i])*factors[i] for i in range(3)))
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj,do_unlink=True)
    # Persist resized pixels before glTF's exporter copies the image datablock.
    # Blender 3.6 can otherwise copy the stale packed bytes instead of resized data.
    texture_dir = destination / "source/textures"
    texture_dir.mkdir(parents=True, exist_ok=True)
    for image_index, image in enumerate(bpy.data.images):
        if image.source == "FILE" and image.size[0] and image.size[1]:
            largest = max(image.size)
            if largest > 1024:
                image.scale(round(image.size[0]*1024/largest), round(image.size[1]*1024/largest))
            image.filepath_raw = str(texture_dir / f"map-{image_index}.png")
            image.file_format = "PNG"
            image.save()
            image.reload()
            image.pack()
    destination.mkdir(parents=True, exist_ok=True)
    for folder in ("3d", "2d/original", "previews", "source"):
        (destination/folder).mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(destination/"3d/model.glb"), export_format="GLB", use_selection=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    # Legacy x86 VPS CPUs cannot run modern Blender/OIDN builds. The same
    # normalization/export also works in portable 3.6, with CPU denoising off.
    denoising = bpy.app.version >= (4, 0, 0)
    scene.cycles.use_denoising = denoising
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    beauty_transform = "AgX" if bpy.app.version >= (4, 0, 0) else "Filmic"
    scene.view_settings.view_transform = beauty_transform
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4
    span = max(target)
    for location, energy in [((span, -span, span*2), 90), ((-span, span, span*1.5), 55)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy*span*span
        light.data.shape = "DISK"
        light.data.size = span*1.5
        light.rotation_euler = (Vector((0,0,target.z*.4))-light.location).to_track_quat("-Z","Y").to_euler()
    bpy.ops.object.camera_add(location=(0,0,target.z+span*2))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.rotation_euler = (0,0,0)
    camera.data.ortho_scale = max(target.x,target.y)*1.008
    scene.camera = camera
    scene.render.resolution_x = max(1, round(1024*target.x/max(target.x,target.y)))
    scene.render.resolution_y = max(1, round(1024*target.y/max(target.x,target.y)))
    scene.render.resolution_percentage = 100
    frame = camera.data.view_frame(scene=scene)
    frame_mm = dict(frame_width_mm=(max(v.x for v in frame)-min(v.x for v in frame))*1000, frame_depth_mm=(max(v.y for v in frame)-min(v.y for v in frame))*1000)
    scene.render.filepath = str(destination/"2d/original/top_view_1024.png")
    bpy.ops.render.render(write_still=True)
    # Reuse the same world-coordinate encoding used by the stock asset validator.
    coordinates = bpy.data.materials.new("Photo coordinate validation")
    coordinates.use_nodes = True
    nodes, links = coordinates.node_tree.nodes, coordinates.node_tree.links
    nodes.clear()
    geometry = nodes.new("ShaderNodeNewGeometry")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geometry.outputs["Position"], separate.inputs["Vector"])
    combine = nodes.new("ShaderNodeCombineXYZ")
    for src, dst, factor in (("X","X",1/target.x),("Y","Y",-1/target.y)):
        multiply = nodes.new("ShaderNodeMath")
        multiply.operation = "MULTIPLY_ADD"
        multiply.inputs[1].default_value = factor
        multiply.inputs[2].default_value = .5
        links.new(separate.outputs[src],multiply.inputs[0])
        links.new(multiply.outputs[0],combine.inputs[dst])
    emission = nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(combine.outputs["Vector"],emission.inputs["Color"])
    links.new(emission.outputs["Emission"],output.inputs["Surface"])
    scene.view_layers[0].material_override = coordinates
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.filter_size = .01
    scene.render.dither_intensity = 0
    scene.render.filepath = str(destination/"coordinates.png")
    bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override = None
    scene.render.filter_size = 1.5
    scene.render.dither_intensity = 1
    scene.view_settings.view_transform = beauty_transform
    scene.cycles.samples = 16
    scene.cycles.use_denoising = denoising
    camera.location = (span*2.4,-span*2.8,span*2)
    camera.rotation_euler = (Vector((0,0,target.z/2))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.ortho_scale = span*1.55
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.filepath = str(destination/"previews/isometric.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination/"source/model.blend"), compress=True)
    (destination/"render-info.json").write_text(json.dumps({"frame":frame_mm,"scale_factors":factors,"source_size_m":list(size)}),encoding="utf-8")


if __name__ == "__main__":
    main()
