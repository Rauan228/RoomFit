"""Blender-only authoring. Every output comes from this normalized mesh collection."""
import bpy
import sys, json, math
from pathlib import Path
from mathutils import Vector


def rgb(hex_color):
    def linear(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    return (*[linear(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)], 1)


def material(name, color, roughness=.7, metalness=0, weave=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgb(color)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgb(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    mat["slot"] = "primary" if name == "primary" else name
    if weave:
        # A real tangent-space normal texture is shared by Blender and GLB.
        size = 128
        image = bpy.data.images.new(name + "_normal", width=size, height=size)
        image.colorspace_settings.name = "Non-Color"
        pixels = []
        for y in range(size):
            for x in range(size):
                nx = math.sin(x * .23 + math.sin(y * .035) * 1.8) * .08 if weave == "wood" else math.sin(x * math.pi / 2) * .11
                ny = math.cos(x * .2 + math.sin(y * .035) * 1.8) * .045 if weave == "wood" else math.cos(y * math.pi / 2) * .11
                pixels.extend((.5 + nx, .5 + ny, math.sqrt(max(0, 1 - nx * nx - ny * ny)) * .5 + .5, 1))
        image.pixels.foreach_set(pixels)
        image.pack()
        texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = .35
        mat.node_tree.links.new(texture.outputs["Color"], normal.inputs["Color"])
        mat.node_tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


OBJECTS = []
MATERIALS = {}


def finish(obj, name, mat, bevel=0, collision=True, feature=None):
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Crafted edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
        modifier.affect = "EDGES"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    modifier = obj.modifiers.new("Surface normals", "WEIGHTED_NORMAL")
    modifier.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(MATERIALS[mat])
    obj["collision"] = collision
    obj["feature"] = feature or name.split("_")[0]
    OBJECTS.append(obj)
    return obj


def box(name, size, pos, mat="primary", bevel=.015, collision=True, feature=None):
    w, h, d = size
    if min(size) <= 0:
        return
    x, y, z = pos
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.dimensions = (w, d, h)
    return finish(obj, name, mat, min(bevel, min(size) * .42), collision, feature)


def cylinder(name, size, pos, mat="metal"):
    w, h, d = size
    x, y, z = pos
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=2, location=(x, -z, y))
    obj = bpy.context.object
    obj.scale = (w / 2, d / 2, h / 2)
    return finish(obj, name, mat, min(h, w, d) * .04)


def sphere(name, size, pos, mat="primary", rotation=0):
    w, h, d = size
    x, y, z = pos
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.scale = (w / 2, d / 2, h / 2)
    obj.rotation_euler.z = rotation
    return finish(obj, name, mat)


def piping(name, width, depth, x, height, z, mat="stitch"):
    # Sewing is actual geometry, not an unrelated mark on the top image.
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = .002
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    points = [(x - width / 2, height, z - depth / 2), (x + width / 2, height, z - depth / 2), (x + width / 2, height, z + depth / 2), (x - width / 2, height, z + depth / 2)]
    spline.points.add(3)
    spline.use_cyclic_u = True
    for vertex, (px, py, pz) in zip(spline.points, points):
        vertex.co = (px, -pz, py, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return finish(bpy.context.object, name, mat, collision=False, feature="seam")


def build(spec):
    w, d, h = [spec["dimensions"][key] / 1000 for key in ("width_mm", "depth_mm", "height_mm")]
    kind = spec["type"]
    leg_t = min(w, d) * .065
    def legs(height, inset=.1):
        for sx in (-1, 1):
            for sz in (-1, 1):
                cylinder(f"leg_{sx}_{sz}", (leg_t, height, leg_t), (sx * w * (.5 - inset), height / 2, sz * d * (.5 - inset)), "wood")
    if kind in ("sofa", "armchair", "sofa-corner"):
        corner = kind == "sofa-corner"
        body_d = min(d, .95)
        back_z = -d / 2 + body_d * .105
        if corner:
            for n, (x, z) in enumerate([(-w*.4, -d*.4), (-w*.4, d*.4), (w*.4, -d*.4), (w*.4, -d/2 + body_d*.82)]):
                cylinder(f"leg_{n}", (leg_t,h*.14,leg_t), (x,h*.07,z), "wood")
        else:
            legs(h * .14)
        if corner:
            box("chaise_base", (w * .33, h * .24, d), (-w * .335, h * .25, 0), "wood", .025)
            box("main_base", (w * .67, h * .24, body_d), (w * .165, h * .25, -d / 2 + body_d / 2), "wood", .025)
        else:
            box("base", (w, h * .24, d), (0, h * .25, 0), "wood", .03)
        box("back", (w, h * .67, body_d * .21), (0, h * .665, back_z), bevel=.065)
        for sx in (-1, 1):
            arm_d = d if corner and sx < 0 else body_d
            box(f"arm_{sx}", (w * .065, h * .52, arm_d), (sx * w * .4675, h * .4, -d / 2 + arm_d / 2), bevel=.045)
        count = 1 if kind == "armchair" else 3 if w >= 2 else 2
        inner = w * .85
        for n in range(count):
            x = (n - (count - 1) / 2) * inner / count
            seat_d = d * .86 if corner and n == 0 else body_d * .72
            seat_z = -d / 2 + body_d * .26 + seat_d / 2
            seat_w = inner / count * .965
            box(f"seat_{n}", (seat_w, h * .17, seat_d), (x, h * .455, seat_z), bevel=.06)
            piping(f"seam_seat_{n}", seat_w * .94, seat_d * .94, x, h * .54, seat_z)
            box(f"cushion_{n}", (seat_w, h * .41, body_d * .19), (x, h * .735, -d / 2 + body_d * .23), bevel=.065)
        for sx in (-1, 1):
            sphere(f"pillow_{sx}", (inner / count * .72, h * .24, body_d * .2), (sx * inner * .33 if count > 1 else 0, h * .64, -d / 2 + body_d * .34))
    elif kind == "bed":
        legs(h * .15)
        box("frame", (w, h * .29, d), (0, h * .28, 0), "wood", .025)
        box("headboard", (w, h, d * .04), (0, h / 2, -d * .48), "primary", .035)
        box("mattress", (w * .96, h * .3, d * .94), (0, h * .575, d * .005), "linen", .05)
        box("quilt", (w * .97, h * .075, d * .64), (0, h * .7525, d * .14), "primary", .035)
        piping("seam_quilt", w * .94, d * .61, 0, h * .791, d * .14)
        for n in range(1 if w < 1.25 else 2):
            count = 1 if w < 1.25 else 2
            x = (n - (count - 1) / 2) * w * .48
            box(f"pillow_{n}", (w * .81 / count, h * .16, d * .18), (x, h * .8, -d * .32), "linen", .06)
            piping(f"seam_pillow_{n}", w * .77 / count, d * .16, x, h * .873, -d * .32)
        for line in range(1, 5):
            box(f"quilt_stitch_{line}", (w * .91, .0018, .0018), (0, h * .791, -d * .12 + d * .115 * line), "stitch", .0002, False, "seam")
    elif kind in ("desk", "table", "coffee"):
        legs(h * .94, .11)
        box("tabletop", (w, h * .06, d), (0, h * .97, 0), "primary", .025 if kind == "desk" else .055)
        if kind == "desk":
            box("drawer", (w * .24, h * .2, d * .82), (w * .3, h * .81, 0), "wood", .015)
            box("handle", (w * .1, .012, .025), (w * .3, h * .82, d * .405), "metal", .006)
    elif kind == "chair":
        legs(h * .49, .12)
        box("seat", (w, h * .09, d), (0, h * .535, 0), bevel=.035)
        box("back", (w, h * .45, d * .11), (0, h * .775, -d * .445), bevel=.032)
    elif kind in ("wardrobe", "dresser", "nightstand", "shelf", "kitchen", "wall-shelf"):
        t = min(w, h, d) * .075
        box("top", (w, t, d), (0, h - t / 2, 0), "primary", .006)
        box("bottom", (w, t, d), (0, t / 2, 0), "primary", .006)
        for sx in (-1, 1):
            box(f"side_{sx}", (t, h, d), (sx * (w - t) / 2, h / 2, 0), "primary", .005)
        box("back", (w, h, t), (0, h / 2, -(d - t) / 2), "wood", .004)
        if kind in ("shelf", "wall-shelf"):
            levels = 1 if kind == "wall-shelf" else max(3, round(h / .4))
            for n in range(1, levels):
                box(f"shelf_{n}", (w - t, t * .7, d * .96), (0, h * n / levels, 0), "primary", .005)
            if kind == "shelf":
                for n in range(4):
                    box(f"book_{n}", (w * .065, h * .15, d * .55), (-w * .22 + n * w * .072, h / levels + t*.35 + h * .075, 0), "linen", .003)
        else:
            rows = 3 if kind in ("dresser", "nightstand") else 1
            columns = max(2, round(w / .65)) if kind in ("wardrobe", "kitchen") else 1
            for column in range(1, columns):
                box(f"divider_{column}", (t, h-t*2, d), ((column-columns/2)*(w-t)/columns, h/2, 0), "wood", .005)
            for row in range(rows):
                for col in range(columns):
                    x = (col - (columns - 1) / 2) * (w - t) / columns
                    y = t + (row + .5) * (h - t * 2) / rows
                    box(f"front_{row}_{col}", ((w - t * 1.2) / columns * .97, (h - t * 2) / rows * .97, t), (x, y, (d - t) / 2), "primary", .008)
                    box(f"handle_{row}_{col}", (min(.12, w / columns * .25), .012, .025), (x, y, d / 2 - .008), "metal", .006)
    elif kind in ("fridge", "washer", "stove"):
        box("body", (w, h, d), (0, h / 2, 0), "primary", .017)
        if kind == "fridge":
            for n, (hh, yy) in enumerate(((h * .28, h * .85), (h * .67, h * .345))):
                box(f"door_{n}", (w * .96, hh, d * .035), (0, yy, d * .48), "linen", .012)
                box(f"handle_{n}", (.015, h * .12, .022), (w * .36, yy, d * .485), "metal", .006)
        else:
            box("control", (w * .87, h * .07, d * .018), (0, h * .9, d * .49), "metal", .008)
            if kind == "washer":
                sphere("glass", (w * .65, h * .47, d * .025), (0, h * .46, d * .487), "glass")
            else:
                box("oven", (w * .82, h * .53, d * .018), (0, h * .4, d * .49), "glass", .025)
                for sx in (-1, 1):
                    for sz in (-1, 1):
                        cylinder(f"burner_{sx}_{sz}", (w * .27, .014, d * .27), (sx * w * .24, h - .007, sz * d * .24))
    elif kind in ("bath", "sink"):
        rim_bottom = h*.62 if kind == "sink" else 0
        rim_height = h*.16 if kind == "sink" else h
        if kind == "sink":
            box("vanity", (w*.89,h*.62,d*.85), (0,h*.31,0), "wood", .02)
        box("base", (w * .98, h * .1, d * .98), (0, h * .05, 0), "linen", .035)
        for sx in (-1, 1):
            box(f"rim_x_{sx}", (w * .065, rim_height, d), (sx * w * .4675, rim_bottom + rim_height/2, 0), "primary", .025)
        for sz in (-1, 1):
            box(f"rim_z_{sz}", (w, rim_height, d * .065), (0, rim_bottom + rim_height/2, sz * d * .4675), "primary", .025)
        box("basin", (w * .9, .025, d * .9), (0, h * .635 if kind == "sink" else h*.2, 0), "linen", .01)
        cylinder("tap", (.025, h * .24, .025), (w * .31, h * .88, -d * .4675), "metal")
    elif kind == "toilet":
        sphere("bowl", (w, h * .6, d * .76), (0, h * .3, d * .12), "primary")
        sphere("seat", (w, h * .08, d * .72), (0, h * .59, d * .12), "linen")
        box("tank", (w * .92, h, d * .23), (0, h / 2, -d * .385), "primary", .035)
        box("pedestal_bridge", (w*.55,h*.42,d*.2), (0,h*.21,-d*.26), "primary", .025)
        cylinder("flush", (.04, .004, .04), (0, h - .002, -d * .385), "metal")
    elif kind == "lamp":
        cylinder("base", (w * .74, h * .035, d * .74), (0, h * .0175, 0))
        cylinder("stem", (w * .045, h * .82, d * .045), (0, h * .43, 0))
        cylinder("shade", (w, h * .2, d), (0, h * .9, 0), "primary")
    elif kind == "plant":
        cylinder("pot", (w * .56, h * .32, d * .56), (0, h * .16, 0), "primary")
        cylinder("soil", (w * .49, h * .025, d * .49), (0, h * .315, 0), "wood")
        cylinder("stem", (.013, h * .6, .013), (0, h * .6, 0), "leaf")
        for n in range(12):
            angle = n * math.pi / 4
            level = .58 if n < 8 else .82
            sphere(f"leaf_{n}", (w * .48, h * .12, d * .23), (math.cos(angle) * w * .22, h * level, math.sin(angle) * d * .22), "leaf", -angle)
    elif kind == "rug":
        box("rug", (w, h, d), (0, h / 2, 0), "primary", .004)
        piping("border", w * .94, d * .94, 0, h * .95, 0)
    else:
        raise ValueError("No approved generator for type: " + kind)


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    spec_path, output = Path(args[0]), Path(args[1])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    global MATERIALS
    MATERIALS = {
        "primary": material("primary", spec["material_variants"][0]["color"], weave="wood" if spec["type"] in ("desk", "table", "coffee", "wardrobe", "dresser", "nightstand", "shelf", "kitchen", "wall-shelf") else spec["type"] in ("sofa", "sofa-corner", "bed", "armchair", "chair", "rug")),
        "wood": material("wood", "#a38360", .52, weave="wood"),
        "linen": material("linen", "#eee8dc", .82, weave=True),
        "metal": material("metal", "#5a615c", .28, .78),
        "stitch": material("stitch", "#d4c8b4", .85),
        "leaf": material("leaf", "#3c6546", .5),
        "glass": material("glass", "#253c3b", .19, .12),
    }
    build(spec)
    bpy.context.view_layer.update()
    vertices = [obj.matrix_world @ Vector(corner) for obj in OBJECTS for corner in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in vertices) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in vertices) for i in range(3)))
    dims = spec["dimensions"]
    target = Vector((dims["width_mm"] / 1000, dims["depth_mm"] / 1000, dims["height_mm"] / 1000))
    root = bpy.data.objects.new("RoomFit_" + spec["asset_id"], None)
    bpy.context.collection.objects.link(root)
    for obj in OBJECTS:
        obj.parent = root
        obj["asset_id"] = spec["asset_id"]
        obj["generation_version"] = spec["generation_version"]
    root.scale = tuple(target[i] / (hi[i] - lo[i]) for i in range(3))
    root.location = (-(hi.x + lo.x) / 2 * root.scale.x, -(hi.y + lo.y) / 2 * root.scale.y, -lo.z * root.scale.z)
    root["asset_id"] = spec["asset_id"]
    root["generation_version"] = spec["generation_version"]
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.seed = 17
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 6
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.world.color = (.18, .18, .18)
    world = bpy.data.worlds.new("RoomFit studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.7, .74, .78, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .25
    scene.world = world
    max_dim = max(target)
    for n, (position, energy, size) in enumerate([((max_dim * 1.2, -max_dim, max_dim * 2), 75 * max_dim ** 2, max_dim * 1.6), ((-max_dim, -max_dim * .2, max_dim), 32 * max_dim ** 2, max_dim), ((0, max_dim, max_dim * 1.6), 46 * max_dim ** 2, max_dim)]):
        bpy.ops.object.light_add(type="AREA", location=position)
        light = bpy.context.object
        light.name = f"Studio_{n}"
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, target.z / 2)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(0, 0, target.z + max_dim * 2))
    camera = bpy.context.object
    camera.name = "Orthographic top"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(target.x, target.y) * 1.002
    camera.rotation_euler = (0, 0, 0)
    scene.camera = camera
    render_info = {}
    primary = MATERIALS["primary"].node_tree.nodes.get("Principled BSDF")
    for variant in spec["material_variants"]:
        folder = output / "2d" / variant["id"]
        folder.mkdir(parents=True, exist_ok=True)
        primary.inputs["Base Color"].default_value = rgb(variant["color"])
        primary.inputs["Roughness"].default_value = variant["roughness"]
        longest = 1024
        scene.render.resolution_x = round(longest * target.x / max(target.x, target.y))
        scene.render.resolution_y = round(longest * target.y / max(target.x, target.y))
        corners = camera.data.view_frame(scene=scene)
        render_info[variant["id"]] = {"frame_width_mm": (max(p.x for p in corners) - min(p.x for p in corners)) * 1000, "frame_depth_mm": (max(p.y for p in corners) - min(p.y for p in corners)) * 1000}
        scene.render.filepath = str(folder / "top_view_1024.png")
        bpy.ops.render.render(write_still=True)
    (output / "render-info.json").write_text(json.dumps(render_info), encoding="utf-8")
    # Coordinate encoding catches an upside-down or mirrored orthographic render,
    # even for a symmetric silhouette. No decorative shadow is part of this pass.
    coordinates = bpy.data.materials.new("Validation world coordinates")
    coordinates.use_nodes = True
    nodes, links = coordinates.node_tree.nodes, coordinates.node_tree.links
    nodes.clear()
    position = nodes.new("ShaderNodeNewGeometry")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(position.outputs["Position"], separate.inputs["Vector"])
    combine = nodes.new("ShaderNodeCombineXYZ")
    for source, destination, factor in (("X", "X", 1 / target.x), ("Y", "Y", -1 / target.y)):
        multiply = nodes.new("ShaderNodeMath")
        multiply.operation = "MULTIPLY_ADD"
        multiply.inputs[1].default_value = factor
        multiply.inputs[2].default_value = .5
        links.new(separate.outputs[source], multiply.inputs[0])
        links.new(multiply.outputs[0], combine.inputs[destination])
    combine.inputs["Z"].default_value = .25
    emission = nodes.new("ShaderNodeEmission")
    links.new(combine.outputs["Vector"], emission.inputs["Color"])
    surface = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs["Emission"], surface.inputs["Surface"])
    scene.view_layers[0].material_override = coordinates
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    (output / "validation").mkdir(exist_ok=True)
    scene.render.filepath = str(output / "validation/coordinates.png")
    bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override = None
    scene.view_settings.view_transform = "AgX"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    primary.inputs["Base Color"].default_value = rgb(spec["material_variants"][0]["color"])
    primary.inputs["Roughness"].default_value = spec["material_variants"][0]["roughness"]
    for view, location in {"front": (0, -max_dim * 3, target.z * .55), "side": (max_dim * 3, 0, target.z * .55), "isometric": (max_dim * 2.4, -max_dim * 2.8, max_dim * 2)}.items():
        camera.location = location
        camera.rotation_euler = (Vector((0, 0, target.z / 2)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = max_dim * 1.55
        scene.render.resolution_x = scene.render.resolution_y = 512
        scene.render.filepath = str(output / "previews" / (view + ".png"))
        bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in OBJECTS:
        obj.select_set(True)
    (output / "3d").mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output / "3d" / "model.glb"), export_format="GLB", use_selection=True, export_yup=True, export_extras=True, export_materials="EXPORT", export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "source" / "model.blend"), compress=True)
    print("ROOMFIT_ASSET_GENERATED=" + spec["asset_id"])


if __name__ == "__main__":
    main()
