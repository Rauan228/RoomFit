"""Read the exported GLB, not a separately authored contour or thumbnail."""
import json, struct, hashlib, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import Polygon
from shapely.ops import unary_union


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_glb(path):
    raw = Path(path).read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError("Invalid GLB header")
    offset, document, binary = 12, None, None
    while offset < length:
        count, kind = struct.unpack_from("<II", raw, offset)
        block = raw[offset + 8:offset + 8 + count]
        if kind == 0x4E4F534A:
            document = json.loads(block)
        elif kind == 0x004E4942:
            binary = block
        offset += 8 + count
    if document is None or binary is None:
        raise ValueError("GLB must contain embedded mesh data")
    return document, binary


def accessor(doc, binary, index):
    access = doc["accessors"][index]
    view = doc["bufferViews"][access["bufferView"]]
    types = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
    count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[access["type"]]
    dtype = np.dtype(types[access["componentType"]])
    start = view.get("byteOffset", 0) + access.get("byteOffset", 0)
    stride = view.get("byteStride", count * dtype.itemsize)
    return np.ndarray((access["count"], count), dtype=dtype, buffer=binary, offset=start, strides=(stride, dtype.itemsize)).copy()


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    rotation = np.array([[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)], [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)], [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]])
    result = np.eye(4)
    result[:3, :3] = rotation @ np.diag(node.get("scale", [1, 1, 1]))
    result[:3, 3] = node.get("translation", [0, 0, 0])
    return result


def geometry(path):
    doc, binary = read_glb(path)
    meshes = []
    def visit(index, parent):
        node = doc["nodes"][index]
        matrix = parent @ node_matrix(node)
        if "mesh" in node:
            for primitive in doc["meshes"][node["mesh"]]["primitives"]:
                positions = accessor(doc, binary, primitive["attributes"]["POSITION"])
                positions = (np.column_stack((positions, np.ones(len(positions)))) @ matrix.T)[:, :3] * 1000
                triangles = accessor(doc, binary, primitive["indices"]).reshape(-1, 3) if "indices" in primitive else np.arange(len(positions)).reshape(-1, 3)
                meshes.append({"name": node.get("name", "mesh"), "extras": node.get("extras", {}), "vertices": positions, "triangles": triangles})
        for child in node.get("children", []):
            visit(child, matrix)
    for index in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(index, np.eye(4))
    return doc, meshes


def projection(meshes):
    polygons = []
    for mesh in meshes:
        points = mesh["vertices"][:, [0, 2]]
        for indices in mesh["triangles"]:
            p = Polygon(points[indices])
            if p.area > .001:
                polygons.append(p)
    if not polygons:
        raise ValueError("Mesh has no nonzero top projection")
    return unary_union(polygons).buffer(0)


def rings(shape, dimensions):
    width, depth = dimensions["width_mm"], dimensions["depth_mm"]
    shape = shape.simplify(.75, preserve_topology=True)
    polygons = [shape] if shape.geom_type == "Polygon" else list(shape.geoms)
    result = []
    for p in sorted(polygons, key=lambda p: p.area, reverse=True):
        if p.area < 1:
            continue
        result.append({"outer": [{"x": round(min(1, max(0, x / width + .5)), 7), "y": round(min(1, max(0, z / depth + .5)), 7)} for x, z in list(p.exterior.coords)[:-1]], "holes": [[{"x": round(x / width + .5, 7), "y": round(z / depth + .5, 7)} for x, z in list(hole.coords)[:-1]] for hole in p.interiors if Polygon(hole).area > 1]})
    return result


def mask(shape, frame, size):
    image = Image.new("L", size)
    draw = ImageDraw.Draw(image)
    polygons = [shape] if shape.geom_type == "Polygon" else list(shape.geoms)
    def pixels(coords):
        return [(round((x / frame["frame_width_mm"] + .5) * size[0]), round((z / frame["frame_depth_mm"] + .5) * size[1])) for x, z in coords]
    for p in polygons:
        draw.polygon(pixels(p.exterior.coords), fill=255)
        for hole in p.interiors:
            draw.polygon(pixels(hole.coords), fill=0)
    return np.asarray(image) > 127


def validate(spec, folder):
    glb = folder / "3d/model.glb"
    doc, meshes = geometry(glb)
    all_points = np.concatenate([mesh["vertices"] for mesh in meshes])
    low, high = all_points.min(axis=0), all_points.max(axis=0)
    dimensions = spec["dimensions"]
    expected = np.array([dimensions["width_mm"], dimensions["height_mm"], dimensions["depth_mm"]])
    silhouette = projection(meshes)
    physical = [mesh for mesh in meshes if mesh["extras"].get("collision", True)]
    structural_shapes = [projection([mesh]) for mesh in physical]
    heights = [(float(m["vertices"][:,1].min()), float(m["vertices"][:,1].max())) for m in physical]
    connected = {0}
    while True:
        previous = len(connected)
        for index in range(len(physical)):
            if index in connected:
                continue
            for other in list(connected):
                vertical_gap = max(heights[index][0], heights[other][0]) - min(heights[index][1], heights[other][1])
                if vertical_gap <= 6 and structural_shapes[index].distance(structural_shapes[other]) <= 2:
                    connected.add(index)
                    break
        if len(connected) == previous:
            break
    collision = projection(physical)
    render_info = json.loads((folder / "render-info.json").read_text())
    variant_results = []
    for variant in spec["material_variants"]:
        image = Image.open(folder / "2d" / variant["id"] / "top_view_1024.png").convert("RGBA")
        actual = np.asarray(image)[:, :, 3] > 127
        expected_mask = mask(silhouette, render_info[variant["id"]], image.size)
        iou = float(np.logical_and(actual, expected_mask).sum() / max(1, np.logical_or(actual, expected_mask).sum()))
        variant_results.append({"id": variant["id"], "silhouette_iou": round(iou, 5), "transparent_background": int(np.asarray(image)[:, :, 3].min()) == 0, "geometry_mask_sha256": hashlib.sha256(actual.tobytes()).hexdigest()})
    material = next((m for m in doc["materials"] if m.get("extras", {}).get("slot") == "primary"), None)
    if material is None:
        raise ValueError("GLB lost the primary material slot")
    def linear(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    color = spec["material_variants"][0]["color"]
    expected_color = [linear(int(color[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    color_error = max(abs(a-b) for a, b in zip(expected_color, material["pbrMetallicRoughness"].get("baseColorFactor", [1,1,1,1])[:3]))
    coordinate_image = np.asarray(Image.open(folder / "validation/coordinates.png").convert("RGBA")) / 255
    encoded = coordinate_image[:, :, :2]
    decoded = np.where(encoded <= .04045, encoded / 12.92, ((encoded + .055) / 1.055) ** 2.4)
    ih, iw = coordinate_image.shape[:2]
    frame = render_info["original"]
    yy, xx = np.mgrid[:ih, :iw]
    expected_coordinates = np.stack((((xx + .5) / iw - .5) * frame["frame_width_mm"] / dimensions["width_mm"] + .5, ((yy + .5) / ih - .5) * frame["frame_depth_mm"] / dimensions["depth_mm"] + .5), axis=2)
    interior = coordinate_image[:, :, 3] > .999
    coordinate_error = float(np.max(np.abs(decoded[interior] - expected_coordinates[interior])))
    provenance_path = folder / "source/render-provenance.json"
    provenance = json.loads(provenance_path.read_text()) if provenance_path.exists() else {}
    provenance_valid = provenance.get("asset_id") == spec["asset_id"] and provenance.get("generation_version") == spec["generation_version"] and bool(provenance.get("files")) and all(sha(folder / path) == digest for path, digest in provenance.get("files", {}).items())
    rotations = []
    for angle in (0, 45, 90, 180, 270):
        a = math.radians(angle)
        # 2D positive rotation maps to negative Three.js yaw.
        p = all_points[:, [0, 2]]
        plan = p @ np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])
        yaw = -a
        world = all_points @ np.array([[math.cos(yaw), 0, -math.sin(yaw)], [0,1,0], [math.sin(yaw),0,math.cos(yaw)]])
        error = float(np.max(np.abs(plan - world[:, [0,2]])))
        rotations.append({"angle": angle, "max_error_mm": round(error, 8)})
    triangle_count = sum(len(mesh["triangles"]) for mesh in meshes)
    bounds_error = float(np.max(np.abs((high-low)-expected)))
    pivot_error = float(max(abs((high[0]+low[0])/2), abs((high[2]+low[2])/2), abs(low[1])))
    # This coordinate pass is 8-bit sRGB with reconstruction filtering. It detects
    # mirrors/axis inversions; the independent GLB bounds check provides mm accuracy.
    checks = {"renderer_provenance": provenance_valid, "dimensions": bounds_error <= 1, "pivot": pivot_error <= 1, "silhouettes": all(v["silhouette_iou"] >= .97 and v["transparent_background"] for v in variant_results), "variant_geometry": len({v["geometry_mask_sha256"] for v in variant_results}) == 1, "orientation_not_mirrored": coordinate_error <= .015, "material": color_error < .001, "rotation": all(v["max_error_mm"] < .0001 for v in rotations), "geometry_budget": triangle_count <= 60000 and glb.stat().st_size <= 4_000_000, "valid_footprints": collision.is_valid and collision.area > 1 and silhouette.is_valid}
    volumes, features = [], []
    checks["structural_parts_connected"] = len(connected) == len(physical)
    for index, mesh in enumerate(physical):
        points = mesh["vertices"]
        shape = structural_shapes[index]
        volumes.append({"min_height_mm": round(float(points[:,1].min()), 3), "max_height_mm": round(float(points[:,1].max()), 3), "footprints": rings(shape, dimensions)})
        if mesh["extras"].get("feature") in ("seat", "mattress", "quilt", "cushion", "tabletop", "top", "pillow"):
            features.extend(rings(shape, dimensions))
    report = {"asset_id": spec["asset_id"], "generation_version": spec["generation_version"], "status": "approved" if all(checks.values()) else "rejected", "checks": checks, "dimension_error_mm": round(bounds_error, 6), "pivot_error_mm": round(pivot_error, 6), "material_error": round(color_error, 6), "coordinate_pass_max_error": round(coordinate_error, 6), "triangles": triangle_count, "glb_bytes": glb.stat().st_size, "model_sha256": sha(glb), "variants": variant_results, "rotations": rotations, "renderer": "Blender orthographic / transparent / no ground shadow", "blender_version": "4.5.14 LTS"}
    footprints = {"visual": rings(silhouette, dimensions), "collision": rings(collision, dimensions), "volumes": volumes, "technical_features": features, "clearance_zones": []}
    if spec["clearance_mm"]:
        clearance = spec["clearance_mm"]
        footprints["clearance_zones"] = [{"kind": "front_access", "depth_mm": clearance, "points": [{"x": 0, "y": 1}, {"x": 1, "y": 1}, {"x": 1, "y": 1 + clearance / dimensions["depth_mm"]}, {"x": 0, "y": 1 + clearance / dimensions["depth_mm"]}]}]
    return report, footprints
