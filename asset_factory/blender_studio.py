"""RoomFit studio furniture generator.

Reference-driven construction (see docs/asset-factory.md, "Studio library"):
every model is assembled from physically sized parts -- rounded boxes with analytic
normals, swept profiles, lathed shells, filleted slabs, draped cloth and sewn
pillows. Textures are original procedural PBR maps from studio_textures.py, mapped
in metric UV space and embedded into the GLB. The common blender_generate.main()
normalizes, renders the orthographic 2D views from this same geometry and exports.

Authoring coordinates: X = width (right), Y = up, Z = depth (+Z = front), metres,
pivot at the bottom centre. Blender receives (x, -z, y).
"""
import sys, json, math
from pathlib import Path
import bpy
import numpy as np

FACTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(FACTORY))
import blender_generate as C

TEX = FACTORY / "textures" / "studio-v1"
SPEC = {}
IMAGES = {}
RNG = np.random.default_rng(7)

# --------------------------------------------------------------------------- materials
# key: base colour, roughness, metallic, texture set, tile (m along U, V), normal strength,
#      sheen, clearcoat (weight, roughness). Primary materials receive the variant colour.
LIBRARY = {
    "oak": dict(color="#b8986f", rough=.58, tex="oak", tile=(.9, .6), normal=.45),
    "oak_end": dict(color="#b8986f", rough=.7, tex="endgrain", tile=(.2, .2), normal=.5),
    "bark": dict(color="#76604c", rough=.85, tex="oak", tile=(.25, .1), normal=.9),
    "upholstery": dict(rough=.95, tex="upholstery", tile=(.05, .05), normal=.45, sheen=.14),
    "velvet": dict(rough=.9, tex="velvet", tile=(.2, .2), normal=.35, sheen=.32),
    "linen_white": dict(color="#f0ece5", rough=.95, tex="linen", tile=(.045, .045), normal=.5, sheen=.08),
    "linen_milk": dict(color="#e7e0d4", rough=.95, tex="linen", tile=(.045, .045), normal=.5, sheen=.08),
    "linen_grey": dict(color="#9a958f", rough=.95, tex="linen", tile=(.045, .045), normal=.5, sheen=.1),
    "linen_sage": dict(color="#9aa58f", rough=.95, tex="linen", tile=(.045, .045), normal=.5, sheen=.1),
    "linen_beige": dict(color="#cdbda5", rough=.95, tex="linen", tile=(.045, .045), normal=.5, sheen=.08),
    "knit_beige": dict(color="#cdb99c", rough=.97, tex="knit", tile=(.14, .14), normal=.8, sheen=.1),
    "knit_grey": dict(color="#8d8986", rough=.97, tex="knit", tile=(.14, .14), normal=.8, sheen=.1),
    "velvet_sage": dict(color="#7b8a74", rough=.88, tex="velvet", tile=(.2, .2), normal=.35, sheen=.3),
    "velvet_graphite": dict(color="#55575a", rough=.88, tex="velvet", tile=(.2, .2), normal=.35, sheen=.3),
    "velvet_sand": dict(color="#c4ad8e", rough=.88, tex="velvet", tile=(.2, .2), normal=.35, sheen=.3),
    "steel_black": dict(color="#232427", rough=.48, tex="powder", tile=(.04, .04), normal=.3),
    "steel_graphite": dict(color="#3d3f42", rough=.42, tex="powder", tile=(.04, .04), normal=.3),
    "chrome": dict(color="#f4f4f4", rough=.07, metal=1),
    "brushed": dict(color="#c8c8c6", rough=.3, metal=1, tex="brushed", tile=(.08, .08), normal=.25),
    "brass": dict(color="#c29a5f", rough=.28, metal=1, tex="brushed", tile=(.08, .08), normal=.2),
    "ceramic": dict(color="#f4f2ee", rough=.16, coat=(.8, .04)),
    "plastic_white": dict(color="#efeeea", rough=.38),
    "rubber": dict(color="#2a2b2c", rough=.78),
    "glass_dark": dict(color="#121618", rough=.04, coat=(1, .02)),
    "display": dict(color="#0c0f10", rough=.08, coat=(1, .02)),
    "enamel_white": dict(color="#efede8", rough=.3, coat=(.4, .1)),
    "paint_white": dict(color="#ece8e1", rough=.55, tex="paint", tile=(.2, .2), normal=.2),
    "paint_milk": dict(color="#e4ddd1", rough=.55, tex="paint", tile=(.2, .2), normal=.2),
    "stone": dict(color="#ece8df", rough=.32, tex="stone", tile=(.6, .6), normal=.15, coat=(.3, .08)),
    "stoneware": dict(color="#d9d1c4", rough=.8, tex="stoneware", tile=(.25, .25), normal=.4),
    "soil": dict(color="#ffffff", rough=.95, tex="soil", tile=(.15, .15), normal=.8),
    "leaf": dict(color="#ffffff", rough=.5, tex="leaf", tile=(1, 1), normal=.5, double=True),
    "book_sage": dict(color="#8b9884", rough=.7), "book_sand": dict(color="#d2bf9f", rough=.7),
    "book_clay": dict(color="#b47d62", rough=.7), "book_ink": dict(color="#3f4752", rough=.7),
    "book_cream": dict(color="#ece4d3", rough=.75), "book_olive": dict(color="#6f7258", rough=.7),
    "paper": dict(color="#f1ebdd", rough=.9),
    "felt": dict(color="#38383a", rough=.95),
    "bulb": dict(color="#fff4dc", rough=.2, emit=.6),
}
PRIMARY_KIND = {
    "bed-double": "velvet", "bed-single": "oak", "bed-kids": "paint_white",
    "sofa": "upholstery", "sofa-small": "upholstery", "sofa-corner": "upholstery", "armchair": "upholstery", "chair": "upholstery",
    "desk": "oak", "table": "oak", "coffee": "oak", "wardrobe": "oak", "dresser": "oak", "nightstand": "oak",
    "shelf": "oak", "wall-shelf": "oak", "kitchen": "oak", "sink": "oak",
    "bath": "enamel_white", "toilet": "ceramic", "fridge": "enamel_white", "washer": "enamel_white", "stove": "enamel_white",
    "lamp": "linen_white", "plant": "stoneware", "rug": "rug",
}
LIBRARY["rug"] = dict(rough=.97, tex="rug", tile=(.5, .5), normal=.7, sheen=.12)


def info(key):
    if key in ("primary", "primary_end"):
        base = PRIMARY_KIND[SPEC["asset_id"]]
        if key == "primary_end":
            base = base + "_end" if base + "_end" in LIBRARY else base
        return LIBRARY[base]
    return LIBRARY[key]


def is_wood(key):
    return info(key).get("tex") in ("oak", "endgrain") and key != "bark"


def image(name):
    if name not in IMAGES:
        img = bpy.data.images.load(str(TEX / name))
        img.colorspace_settings.name = "sRGB" if "_albedo" in name else "Non-Color"
        img.pack()
        IMAGES[name] = img
    return IMAGES[name]


def create_material(key):
    data = info(key)
    if key in ("primary", "primary_end"):
        variant = SPEC["material_variants"][0]
        color, rough = variant["color"], variant["roughness"]
    else:
        color, rough = data.get("color", "#ffffff"), data["rough"]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    mat["slot"] = "primary" if key.startswith("primary") else key
    mat.diffuse_color = C.rgb(color)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = C.rgb(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = data.get("metal", 0)
    tex = data.get("tex")
    files = json.loads((TEX / "index.json").read_text())["sets"].get(tex, {}) if tex else {}
    if "albedo" in files:
        albedo = nodes.new("ShaderNodeTexImage")
        albedo.image = image(files["albedo"])
        tint = nodes.new("ShaderNodeMix")
        tint.name = "RoomFit tint"
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1
        tint.inputs[6].default_value = C.rgb(color)
        links.new(albedo.outputs["Color"], tint.inputs[7])
        links.new(tint.outputs[2], bsdf.inputs["Base Color"])
    if "roughness" in files:
        rough_tex = nodes.new("ShaderNodeTexImage")
        rough_tex.image = image(files["roughness"])
        multiply = nodes.new("ShaderNodeMath")
        multiply.name = "RoomFit roughness"
        multiply.operation = "MULTIPLY"
        multiply.inputs[1].default_value = rough
        links.new(rough_tex.outputs["Color"], multiply.inputs[0])
        links.new(multiply.outputs[0], bsdf.inputs["Roughness"])
    if "normal" in files:
        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.image = image(files["normal"])
        bump = nodes.new("ShaderNodeNormalMap")
        bump.inputs["Strength"].default_value = data.get("normal", .4)
        links.new(normal_tex.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if data.get("sheen"):
        # glTF carries the sheen colour (weight is folded into it), Blender uses weight 1.
        bsdf.inputs["Sheen Weight"].default_value = 1
        bsdf.inputs["Sheen Tint"].default_value = (data["sheen"],) * 3 + (1,)
        bsdf.inputs["Sheen Roughness"].default_value = .55
    if data.get("coat"):
        bsdf.inputs["Coat Weight"].default_value = data["coat"][0]
        bsdf.inputs["Coat Roughness"].default_value = data["coat"][1]
    if data.get("emit"):
        bsdf.inputs["Emission Color"].default_value = C.rgb(color)
        bsdf.inputs["Emission Strength"].default_value = data["emit"]
    if data.get("double"):
        mat.use_backface_culling = False
    else:
        mat.use_backface_culling = False
    return mat


def material(key):
    if key not in C.MATERIALS:
        C.MATERIALS[key] = create_material(key)
    return C.MATERIALS[key]


# --------------------------------------------------------------------------- mesh core
def emit(name, verts, faces, uvs=None, normals=None, mats=("primary",), face_mat=None, collision=True, feature=None, loop_uvs=None):
    """Create a Blender mesh from authoring-space arrays.

    verts (N,3) authoring coords, faces: index lists (CCW seen from outside),
    uvs (N,2) per-vertex UVs already divided by the material tile, normals (N,3)
    exact vertex normals (custom split normals) or None for smooth averaging."""
    verts = np.asarray(verts, float)
    me = bpy.data.meshes.new(name)
    blender = np.column_stack((verts[:, 0], -verts[:, 2], verts[:, 1]))
    me.from_pydata(blender.tolist(), [], [list(map(int, f)) for f in faces])
    me.update()
    me.validate(clean_customdata=False)
    for key in mats:
        me.materials.append(material(key))
    if face_mat is not None:
        me.polygons.foreach_set("material_index", np.asarray(face_mat, dtype=np.int32))
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    if uvs is not None or loop_uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        if loop_uvs is None:
            loop_vertex = np.zeros(len(me.loops), dtype=np.int32)
            me.loops.foreach_get("vertex_index", loop_vertex)
            loop_uvs = np.asarray(uvs, float)[loop_vertex]
        layer.data.foreach_set("uv", np.asarray(loop_uvs, float).reshape(-1))
    if normals is not None:
        n = np.asarray(normals, float)
        n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        me.normals_split_custom_set_from_vertices(np.column_stack((n[:, 0], -n[:, 2], n[:, 1])).tolist())
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj["collision"] = collision
    obj["feature"] = feature or name.split("_")[0]
    C.OBJECTS.append(obj)
    return obj


def orient_faces(verts, faces, normals):
    """Flip faces whose winding disagrees with the analytic normals."""
    verts, normals = np.asarray(verts), np.asarray(normals)
    out = []
    for f in faces:
        a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
        geo = np.cross(b - a, c - a)
        if np.linalg.norm(geo) < 1e-14 and len(f) > 3:
            geo = np.cross(verts[f[2]] - a, verts[f[3]] - a)
        out.append(tuple(reversed(f)) if np.dot(geo, normals[list(f)].sum(axis=0)) < 0 else tuple(f))
    return out


def jacobian_normals(points, normals, deform, eps=1e-5):
    """Transform normals through a smooth deformation: n' = J^-T n."""
    J = np.zeros((len(points), 3, 3))
    for i in range(3):
        d = np.zeros(3); d[i] = eps
        J[:, :, i] = (deform(points + d) - deform(points - d)) / (2 * eps)
    inv_t = np.transpose(np.linalg.inv(J), (0, 2, 1))
    n = np.einsum("nij,nj->ni", inv_t, normals)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def euler(rot):
    rx, ry, rz = rot
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X


def axis_samples(e, r, segments, K):
    core = e - r
    inner = np.linspace(-core, core, segments + 1) if core > 1e-7 else np.array([0.0])
    band = core + r * np.tan(np.radians(45 * np.arange(1, K + 1) / K))
    return np.concatenate([-band[::-1], inner, band])


def rbox(name, size, center, r=.003, mat="primary", seg=(1, 1, 1), K=None, deform=None, rot=None, grain=None, collision=True, feature=None, uv_offset=(0, 0)):
    """Rounded box with exact normals and per-face metric UVs (wood grain aware)."""
    e = np.array(size, float) / 2
    r = max(.0004, min(r, e.min() * .98))
    core = e - r
    K = K or int(np.clip(round(r / .012), 1, 4))  # analytic normals keep few bands smooth
    samples = [axis_samples(e[i], r, seg[i], K) for i in range(3)]
    wood = is_wood(mat)
    end_key = mat + "_end" if wood and not mat.endswith("_end") else mat
    g = "xyz".index(grain) if grain else int(np.argmax(size))
    verts, norms, uvs, faces, fmat = [], [], [], [], []
    base = 0
    tile = np.array(info(mat).get("tile", (1, 1)))
    end_tile = np.array(info(end_key).get("tile", (1, 1)))
    for a in range(3):
        for s in (-1, 1):
            b, c = [(1, 2), (2, 0), (0, 1)][a]
            if s < 0:
                b, c = c, b
            U, V = np.meshgrid(samples[b], samples[c], indexing="ij")
            q = np.zeros(U.shape + (3,))
            q[..., a] = s * e[a]; q[..., b] = U; q[..., c] = V
            cp = np.clip(q, -core, core)
            d = q - cp
            n = d / np.linalg.norm(d, axis=-1, keepdims=True)
            p = cp + r * n
            ni, nj = U.shape
            plane = [i for i in range(3) if i != a]
            end_face = wood and g == a
            if wood:
                uax = g if g in plane else plane[0]
                vax = [i for i in plane if i != uax][0]
                t = end_tile if end_face else tile
            else:
                uax, vax = (0, 2) if a == 1 else ((2 if a == 0 else 0), 1)
                t = tile
            uv = np.stack((q[..., uax] / t[0] + uv_offset[0], q[..., vax] / t[1] + uv_offset[1]), axis=-1)
            verts.append(p.reshape(-1, 3)); norms.append(n.reshape(-1, 3)); uvs.append(uv.reshape(-1, 2))
            for i in range(ni - 1):
                for j in range(nj - 1):
                    k = base + i * nj + j
                    faces.append((k, k + nj, k + nj + 1, k + 1))
                    fmat.append(1 if end_face else 0)
            base += ni * nj
    P, N, UV = np.concatenate(verts), np.concatenate(norms), np.concatenate(uvs)
    if deform is not None:
        N = jacobian_normals(P, N, deform)
        P = deform(P)
    if rot is not None:
        R = euler(rot)
        P, N = P @ R.T, N @ R.T
    P = P + np.asarray(center, float)
    faces = orient_faces(P, faces, N)
    mats = (mat, end_key) if end_key != mat else (mat,)
    return emit(name, P, faces, UV, N, mats, fmat if len(mats) > 1 else None, collision, feature)


def box(name, size, bottom_center, r=.003, mat="primary", **kw):
    x, y, z = bottom_center
    return rbox(name, size, (x, y + size[1] / 2, z), r, mat, **kw)


def rrect_outline(w, d, radius, n=8):
    """Closed rounded rectangle (x, z) with outward normals, counter-clockwise from +X."""
    radius = min(radius, w / 2 - 1e-5, d / 2 - 1e-5)
    pts, nrm = [], []
    for cx, cz, start in ((w / 2 - radius, d / 2 - radius, 0), (-w / 2 + radius, d / 2 - radius, 90), (-w / 2 + radius, -d / 2 + radius, 180), (w / 2 - radius, -d / 2 + radius, 270)):
        for i in range(n + 1):
            a = math.radians(start + 90 * i / n)
            pts.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
            nrm.append((math.cos(a), math.sin(a)))
    return np.array(pts), np.array(nrm)


def loft(name, loops, mat="primary", cap_bottom=True, cap_top=True, collision=True, feature=None, grain=0, close=False):
    """Connect a stack of rings. loops: list of (points (M,2) xz, normals2d (M,2), y, profile_normal (h, v)).
    Ring normal = h * outline normal + v * up. M must be equal for all loops."""
    M = len(loops[0][0])
    tile = np.array(info(mat).get("tile", (1, 1)))
    verts, norms, uvs = [], [], []
    for pts, nrm, y, (h, v) in loops:
        closed = np.vstack((pts, pts[:1]))
        seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        for i in range(M + 1):
            j = i % M
            verts.append((pts[j][0], y, pts[j][1]))
            norms.append((h * nrm[j][0], v, h * nrm[j][1]))
            uvs.append((s[i] / tile[0], 0))
    verts, norms, uvs = np.array(verts), np.array(norms, float), np.array(uvs)
    # V coordinate: arc length along the profile, averaged around the ring.
    rows = len(loops)
    acc = 0
    for k in range(1, rows):
        step = np.linalg.norm(verts[k * (M + 1):(k + 1) * (M + 1)] - verts[(k - 1) * (M + 1):k * (M + 1)], axis=1).mean()
        acc += step
        uvs[k * (M + 1):(k + 1) * (M + 1), 1] = acc / tile[1]
    faces = []
    for k in range(rows - 1):
        for i in range(M):
            a = k * (M + 1) + i
            faces.append((a, a + 1, a + M + 2, a + M + 1))
    if close:
        for i in range(M):
            a = (rows - 1) * (M + 1) + i
            faces.append((a, a + 1, i + 1, i))
    extra_v, extra_n, extra_uv = [], [], []
    base = len(verts)
    for which, flag in ((0, cap_bottom), (rows - 1, cap_top)):
        if not flag:
            continue
        pts, nrm, y, _ = loops[which]
        normal = (0, -1 if which == 0 else 1, 0)
        centre = (pts[:, 0].mean(), y, pts[:, 1].mean())
        idx0 = base + len(extra_v)
        extra_v.append(centre); extra_n.append(normal); extra_uv.append((centre[0] / tile[0], centre[2] / tile[1]) if grain == 0 else (centre[2] / tile[0], centre[0] / tile[1]))
        for j in range(M):
            extra_v.append((pts[j][0], y, pts[j][1])); extra_n.append(normal)
            extra_uv.append((pts[j][0] / tile[0], pts[j][1] / tile[1]) if grain == 0 else (pts[j][1] / tile[0], pts[j][0] / tile[1]))
        for j in range(M):
            faces.append((idx0, idx0 + 1 + j, idx0 + 1 + (j + 1) % M))
    if extra_v:
        verts = np.vstack((verts, extra_v)); norms = np.vstack((norms, extra_n)); uvs = np.vstack((uvs, extra_uv))
    faces = orient_faces(verts, faces, norms)
    return verts, faces, uvs, norms


def slab(name, w, d, t, plan_r, edge_r, bottom_center, mat="primary", K=3, n=10, grain="x", collision=True, feature=None, edge_top=None, rot=None):
    """Filleted panel / tabletop: rounded plan corners and rounded top & bottom edges.
    End faces (normal along the grain) use the end-grain material for wood."""
    pts, nrm = rrect_outline(w, d, plan_r, n)
    eb, et = min(edge_r, t / 2 * .98), min(edge_top or edge_r, t / 2 * .98)
    loops = []
    for i in range(K + 1):
        a = math.radians(90 - 90 * i / K)
        loops.append((pts - nrm * eb * (1 - math.cos(a)), nrm, eb * (1 - math.sin(a)), (math.cos(a), -math.sin(a))))
    for i in range(K + 1):
        a = math.radians(90 * i / K)
        loops.append((pts - nrm * et * (1 - math.cos(a)), nrm, t - et + et * math.sin(a), (math.cos(a), math.sin(a))))
    verts, faces, uvs, norms = loft(name, loops, mat, grain=0 if grain == "x" else 1)
    if grain == "z":
        pass
    wood = is_wood(mat)
    fmat = None
    mats = (mat,)
    if wood:
        g = 0 if grain == "x" else 2
        fmat = [1 if abs(norms[list(f)].mean(axis=0)[g]) > .72 and abs(norms[list(f)].mean(axis=0)[1]) < .5 else 0 for f in faces]
        mats = (mat, mat + "_end")
        if grain == "z":
            # Side UVs follow the perimeter; swap top/bottom so grain runs along Z.
            pass
    R = euler(rot) if rot is not None else np.eye(3)
    verts = verts @ R.T + np.asarray(bottom_center, float)
    norms = norms @ R.T
    return emit(name, verts, faces, uvs, norms, mats, fmat, collision, feature)


def sweep(name, path, profile, up=(0, 1, 0), mat="steel_black", closed=False, caps=True, collision=True, feature=None):
    """Sweep a closed 2D profile ((a, b), normals) along a polyline with mitred joints."""
    P = np.asarray(path, float)
    prof, pn = profile
    up = np.asarray(up, float)
    n = len(P)
    seg = [P[(i + 1) % n] - P[i] for i in range(n if closed else n - 1)]
    seg = [s / np.linalg.norm(s) for s in seg]
    tile = np.array(info(mat).get("tile", (1, 1)))
    verts, norms, uvs = [], [], []
    L = 0
    M = len(prof)
    perim = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(np.vstack((prof, prof[:1])), axis=0), axis=1))])
    for i in range(n):
        if closed:
            t_in, t_out = seg[i - 1], seg[i]
        else:
            t_in = seg[max(0, i - 1)]; t_out = seg[min(i, n - 2)]
        t = t_in + t_out
        t /= np.linalg.norm(t)
        side = np.cross(t, up)
        if np.linalg.norm(side) < 1e-6:
            side = np.cross(t, (1, 0, 0))
        side /= np.linalg.norm(side)
        nrm = np.cross(side, t)
        miter = 1 / max(.3, float(np.dot(t, t_out)))
        bend = t_out - t_in
        bend_dir = bend / np.linalg.norm(bend) if np.linalg.norm(bend) > 1e-8 else side
        if i > 0:
            L += np.linalg.norm(P[i] - P[i - 1])
        for j in range(M + 1):
            a, b = prof[j % M]
            offset = side * a + nrm * b
            # stretch the profile along the bend direction to keep the wall thickness
            along = np.dot(offset, bend_dir)
            offset = offset + bend_dir * along * (miter - 1)
            verts.append(P[i] + offset)
            na, nb = pn[j % M]
            norms.append(side * na + nrm * nb)
            uvs.append((L / tile[0], perim[j] / tile[1]))
    if closed:
        L += np.linalg.norm(P[0] - P[-1])
        for j in range(M + 1):
            verts.append(verts[j]); norms.append(norms[j]); uvs.append((L / tile[0], perim[j] / tile[1]))
    rings = n + (1 if closed else 0)
    faces = []
    for i in range(rings - 1):
        for j in range(M):
            a = i * (M + 1) + j
            faces.append((a, a + 1, a + M + 2, a + M + 1))
    verts, norms, uvs = list(verts), list(norms), list(uvs)
    if caps and not closed:
        for ring, sign in ((0, -1), (rings - 1, 1)):
            t = seg[0] if ring == 0 else seg[-1]
            centre = P[0] if ring == 0 else P[-1]
            c = len(verts)
            verts.append(centre); norms.append(t * sign); uvs.append((0, 0))
            for j in range(M):
                verts.append(verts[ring * (M + 1) + j]); norms.append(t * sign); uvs.append((prof[j][0] / tile[0], prof[j][1] / tile[1]))
            for j in range(M):
                faces.append((c, c + 1 + j, c + 1 + (j + 1) % M))
    verts, norms = np.array(verts), np.array(norms)
    faces = orient_faces(verts, faces, norms)
    return emit(name, verts, faces, np.array(uvs), norms, (mat,), None, collision, feature)


def circle_profile(r, n=12):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.column_stack((np.cos(a) * r, np.sin(a) * r)), np.column_stack((np.cos(a), np.sin(a)))


def rrect_profile(w, h, r, n=3):
    pts, nrm = rrect_outline(w, h, r, n)
    return pts, nrm


def lathe(name, profile, centre=(0, 0, 0), mat="steel_black", segments=48, scale=(1, 1), collision=True, feature=None, closed_profile=False, rot=None):
    """Revolve a (radius, y) profile around +Y. Repeated points create creases."""
    prof = [tuple(p) for p in profile]
    m = len(prof)
    # 2D normals per profile point (outward), one-sided at creases.
    def tangent(i):
        prev = np.subtract(prof[i], prof[i - 1]) if (i > 0 or closed_profile) else None
        nxt = np.subtract(prof[(i + 1) % m], prof[i]) if (i < m - 1 or closed_profile) else None
        if prev is not None and np.linalg.norm(prev) < 1e-9:
            prev = None
        if nxt is not None and np.linalg.norm(nxt) < 1e-9:
            nxt = None
        if prev is not None and nxt is not None and np.linalg.norm(np.subtract(prof[i], prof[i - 1])) > 1e-9 and np.linalg.norm(np.subtract(prof[(i + 1) % m], prof[i])) > 1e-9:
            t = prev / np.linalg.norm(prev) + nxt / np.linalg.norm(nxt)
        else:
            t = prev if prev is not None else nxt
        return t / np.linalg.norm(t)
    tangents = []
    for i in range(m):
        dup_next = i < m - 1 and np.linalg.norm(np.subtract(prof[i + 1], prof[i])) < 1e-9
        dup_prev = i > 0 and np.linalg.norm(np.subtract(prof[i], prof[i - 1])) < 1e-9
        if dup_next and i > 0:
            t = np.subtract(prof[i], prof[i - 1]); t = t / np.linalg.norm(t)
        elif dup_prev and i < m - 1:
            t = np.subtract(prof[i + 1], prof[i]); t = t / np.linalg.norm(t)
        else:
            t = tangent(i)
        tangents.append(t)
    tile = np.array(info(mat).get("tile", (1, 1)))
    rmax = max(p[0] for p in prof) or 1
    arc = np.concatenate([[0], np.cumsum([np.linalg.norm(np.subtract(prof[i + 1], prof[i])) for i in range(m - 1)])])
    verts, norms, uvs, faces = [], [], [], []
    index = {}
    for i, (r, y) in enumerate(prof):
        dr, dy = tangents[i]
        nr, ny = dy, -dr
        if r < 1e-9:
            index[i] = [len(verts)] * (segments + 1)
            verts.append((0, y, 0)); norms.append((0, np.sign(ny) or 1, 0)); uvs.append((.5, arc[i] / tile[1]))
            continue
        row = []
        for k in range(segments + 1):
            a = 2 * math.pi * k / segments
            ca, sa = math.cos(a), math.sin(a)
            row.append(len(verts))
            verts.append((r * ca * scale[0], y, r * sa * scale[1]))
            norms.append((nr * ca / scale[0], ny, nr * sa / scale[1]))
            # wood grain runs along the turned part, not around it
            uvs.append((arc[i] / tile[0], a * rmax / tile[1]) if is_wood(mat) else (a * rmax / tile[0], arc[i] / tile[1]))
        index[i] = row
    pairs = [(i, i + 1) for i in range(m - 1)] + ([(m - 1, 0)] if closed_profile else [])
    for i, j in pairs:
        for k in range(segments):
            quad = [index[i][k], index[j][k], index[j][k + 1], index[i][k + 1]]
            uniq = []
            for q in quad:
                if q not in uniq:
                    uniq.append(q)
            if len(uniq) >= 3:
                faces.append(tuple(uniq))
    verts, norms = np.array(verts, float), np.array(norms, float)
    if rot is not None:
        R = euler(rot)
        verts, norms = verts @ R.T, norms @ R.T
    verts = verts + np.asarray(centre, float)
    faces = orient_faces(verts, faces, norms)
    return emit(name, verts, faces, np.array(uvs), norms, (mat,), None, collision, feature)


def grid_faces(nu, nv, base=0, flip=False):
    faces = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = base + i * nv + j
            f = (a, a + nv, a + nv + 1, a + 1)
            faces.append(tuple(reversed(f)) if flip else f)
    return faces


def surface_normals(S):
    du = np.gradient(S, axis=0)
    dv = np.gradient(S, axis=1)
    n = np.cross(du, dv)
    return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-12)


def cloth_slab(name, S, thickness, mat, uv, up_hint=(0, 1, 0), hem=3, collision=True, feature=None):
    """Thick cloth from a centre surface S (nu, nv, 3): top, bottom and a rolled hem."""
    nu, nv, _ = S.shape
    n = surface_normals(S)
    if np.mean(np.sum(n * np.asarray(up_hint), axis=-1)) < 0:
        n = -n
    half = thickness / 2
    top, bottom = S + n * half, S - n * half
    verts = [top.reshape(-1, 3), bottom.reshape(-1, 3)]
    norms = [n.reshape(-1, 3), -n.reshape(-1, 3)]
    uvs = [uv.reshape(-1, 2), uv.reshape(-1, 2)]
    faces = grid_faces(nu, nv) + grid_faces(nu, nv, nu * nv, True)
    # Border loop (i, j) around the grid, with an outward tangent direction.
    loop = [(0, j) for j in range(nv)] + [(i, nv - 1) for i in range(1, nu)] + [(nu - 1, j) for j in range(nv - 2, -1, -1)] + [(i, 0) for i in range(nu - 2, 0, -1)]
    centre = S.reshape(-1, 3).mean(axis=0)
    base = 2 * nu * nv
    ring_v, ring_n, ring_uv = [], [], []
    L = len(loop)
    for (i, j) in loop:
        p, nn = S[i, j], n[i, j]
        if i == 0:
            o = S[0, j] - S[1, j]
        elif i == nu - 1:
            o = S[nu - 1, j] - S[nu - 2, j]
        elif j == 0:
            o = S[i, 0] - S[i, 1]
        else:
            o = S[i, nv - 1] - S[i, nv - 2]
        o = o - nn * np.dot(o, nn)
        o /= np.linalg.norm(o) + 1e-12
        for k in range(1, hem):
            a = math.pi / 2 - math.pi * k / hem
            ring_v.append(p + nn * half * math.sin(a) + o * half * math.cos(a))
            ring_n.append(nn * math.sin(a) + o * math.cos(a))
            ring_uv.append(uv[i, j])
    verts.append(np.array(ring_v)); norms.append(np.array(ring_n)); uvs.append(np.array(ring_uv))
    H = hem - 1
    for idx in range(L):
        (i0, j0), (i1, j1) = loop[idx], loop[(idx + 1) % L]
        t0, t1 = i0 * nv + j0, i1 * nv + j1
        b0, b1 = nu * nv + t0, nu * nv + t1
        chain0 = [t0] + [base + idx * H + k for k in range(H)] + [b0]
        chain1 = [t1] + [base + ((idx + 1) % L) * H + k for k in range(H)] + [b1]
        for k in range(len(chain0) - 1):
            faces.append((chain0[k], chain0[k + 1], chain1[k + 1], chain1[k]))
    V, N, UV = np.concatenate(verts), np.concatenate(norms), np.concatenate(uvs)
    faces = orient_faces(V, faces, N)
    return emit(name, V, faces, UV, N, (mat,), None, collision, feature)


def pillow_points(w, d, t, rot, seed, ears=.05, nu=18, nv=16):
    """Positions of a pillow built at the origin and rotated (used to plan contact)."""
    rng = np.random.default_rng(seed)
    u = np.linspace(-1, 1, nu)[:, None] * np.ones((1, nv))
    v = np.ones((nu, 1)) * np.linspace(-1, 1, nv)[None, :]
    x = w / 2 * u * (1 - ears * (1 - v ** 2))
    z = d / 2 * v * (1 - ears * (1 - u ** 2))
    shape = np.clip(1 - u * u, 0, 1) ** .6 * np.clip(1 - v * v, 0, 1) ** .6
    half = t / 2 * shape + .002
    P = np.concatenate([np.stack((x, s * half, z), -1).reshape(-1, 3) for s in (1, -1)])
    return P @ euler(rot).T


def pillow(name, w, d, t, centre, mat, rot=(0, 0, 0), seed=0, ears=.05, nu=18, nv=16, clamp=None, piping=None, sag=0.0):
    """Sewn pillow lying in XZ: thickness profile, pulled-in edges, corner ears and
    soft creases. `clamp(points) -> points` resolves contact with supporting cushions."""
    rng = np.random.default_rng(seed)
    u = np.linspace(-1, 1, nu)[:, None] * np.ones((1, nv))
    v = np.ones((nu, 1)) * np.linspace(-1, 1, nv)[None, :]
    peak_u, peak_v = rng.uniform(-.12, .12), rng.uniform(-.12, .12)
    x = w / 2 * u * (1 - ears * (1 - v ** 2))
    z = d / 2 * v * (1 - ears * (1 - u ** 2))
    shape = np.clip(1 - u * u, 0, 1) ** .6 * np.clip(1 - v * v, 0, 1) ** .6
    bias = 1 + .12 * (u * peak_u + v * peak_v)
    creases = .05 * (np.abs(u * v) ** 1.5) * np.sin(np.arctan2(v, u) * 7 + rng.uniform(0, 6))
    half = t / 2 * (shape * bias + creases * shape) + .002
    tile = np.array(info(mat).get("tile", (1, 1)))
    verts, faces = [], []
    for side in (1, -1):
        y = side * half - sag * shape * (1 if side > 0 else 1)
        P = np.stack((x, y, z), axis=-1)
        verts.append(P)
    top, bottom = verts
    bottom = bottom.copy()
    bottom[0, :, :] = top[0, :, :]; bottom[-1, :, :] = top[-1, :, :]
    bottom[:, 0, :] = top[:, 0, :]; bottom[:, -1, :] = top[:, -1, :]
    P = np.concatenate((top.reshape(-1, 3), bottom.reshape(-1, 3)))
    UV = np.concatenate((np.stack((x / tile[0], z / tile[1]), -1).reshape(-1, 2), np.stack((-x / tile[0], z / tile[1]), -1).reshape(-1, 2)))
    faces = grid_faces(nu, nv) + grid_faces(nu, nv, nu * nv, True)
    # weld the shared border of the bottom shell onto the top shell
    remap = np.arange(len(P))
    for i in range(nu):
        for j in range(nv):
            if i in (0, nu - 1) or j in (0, nv - 1):
                remap[nu * nv + i * nv + j] = i * nv + j
    faces = [tuple(int(remap[k]) for k in f) for f in faces]
    R = euler(rot)
    P = P @ R.T + np.asarray(centre, float)
    if clamp is not None:
        P = clamp(P)
    # orientation: top shell normal must point along the rotated +Y
    n_ref = R @ np.array((0, 1, 0))
    a, b, c = P[faces[len(faces) // 4][0]], P[faces[len(faces) // 4][1]], P[faces[len(faces) // 4][2]]
    if np.dot(np.cross(b - a, c - a), n_ref) < 0:
        faces = [tuple(reversed(f)) for f in faces]
    obj = emit(name, P, faces, UV, None, (mat,), None, True, "pillow")
    if piping:
        ring = [P[i * nv + 0] for i in range(nu)] + [P[(nu - 1) * nv + j] for j in range(1, nv)] + [P[i * nv + nv - 1] for i in range(nu - 2, -1, -1)] + [P[j] for j in range(nv - 2, 0, -1)]
        sweep(name + "_piping", ring, circle_profile(piping, 8), up=R @ np.array((0, 1, 0)), mat=mat, closed=True, collision=False, feature="seam")
    return obj


def fillet(points, radius, n=4, closed=False):
    """Round the corners of a polyline with circular arcs."""
    P = [np.asarray(p, float) for p in points]
    out = []
    count = len(P)
    for i in range(count):
        if not closed and i in (0, count - 1):
            out.append(P[i]); continue
        a, b, c = P[i - 1], P[i], P[(i + 1) % count]
        u, v = a - b, c - b
        lu, lv = np.linalg.norm(u), np.linalg.norm(v)
        u, v = u / lu, v / lv
        ang = math.acos(np.clip(np.dot(u, v), -1, 1))
        if ang > math.pi - 1e-3:
            out.append(b); continue
        dist = min(radius / math.tan(ang / 2), lu * .45, lv * .45)
        p0, p1 = b + u * dist, b + v * dist
        for k in range(n + 1):
            s = k / n
            # quadratic Bezier approximates the arc closely for these small radii
            out.append((1 - s) ** 2 * p0 + 2 * (1 - s) * s * b + s * s * p1)
    return out


# --------------------------------------------------------------------------- shared parts
def tapered_leg(name, top, height, r_top, r_bottom, mat="oak", splay=(0, 0)):
    """Round tapered leg from a floor point (top + splay) up to `top` (x, y_top, z)."""
    x, y, z = top
    dx, dz = splay
    base = np.array((x + dx, 0.0, z + dz))
    v = np.array((x, y, z)) - base
    length = float(np.linalg.norm(v))
    v /= length
    rx = math.asin(np.clip(v[2], -1, 1))
    rz = math.asin(np.clip(-v[0] / math.cos(rx), -1, 1))
    lift = r_bottom * math.sqrt(max(0.0, 1 - v[1] ** 2))  # keep the tilted foot above the floor
    prof = [(0, 0), (r_bottom * .92, 0), (r_bottom, .0025), (r_top, length - .002), (r_top * .96, length), (0, length)]
    return lathe(name, prof, base + (0, lift, 0), mat, 20, rot=(rx, 0, rz), feature="leg")


def bar_handle(name, x, y, z_face, length, vertical=False, mat="steel_black", r=.006, stand=.032):
    """Pull handle on two posts screwed into a front face at z_face."""
    if vertical:
        path = [(x, y - length / 2, z_face - .002), (x, y - length / 2, z_face + stand), (x, y + length / 2, z_face + stand), (x, y + length / 2, z_face - .002)]
        up = (1, 0, 0)
    else:
        path = [(x - length / 2, y, z_face - .002), (x - length / 2, y, z_face + stand), (x + length / 2, y, z_face + stand), (x + length / 2, y, z_face - .002)]
        up = (0, 1, 0)
    return sweep(name, fillet(path, .009, 4), circle_profile(r, 12), up=up, mat=mat, feature="handle")


def knob(name, x, y, z_face, r=.018, depth=.022, mat="chrome", axis="z"):
    prof = [(0, 0), (r * .85, 0), (r, depth * .15), (r, depth * .8), (r * .9, depth), (0, depth)]
    rot = (math.pi / 2, 0, 0) if axis == "z" else None
    return lathe(name, prof, (x, y, z_face), mat, 28, rot=rot, feature="control")


# --------------------------------------------------------------------------- beds
def mattress_top_fn(hx, hz, top, crown, cz=0.0):
    def f(x, z):
        a = np.clip(1 - (x / hx) ** 2, 0, 1)
        b = np.clip(1 - ((z - cz) / hz) ** 2, 0, 1)
        return top + crown * a * b
    return f


def mattress(name, w, d, t, bottom_y, cz, mat="linen_white", r=.045, crown=.01):
    hx, hz = w / 2, d / 2
    def deform(P):
        P = P.copy()
        a = np.clip(1 - (P[:, 0] / hx) ** 2, 0, 1)
        b = np.clip(1 - (P[:, 2] / hz) ** 2, 0, 1)
        up = np.clip((P[:, 1] + t / 2) / t, 0, 1) ** 2
        P[:, 1] += crown * a * b * up
        # slight side bulge of the border
        side = 1 - (2 * P[:, 1] / t) ** 2
        P[:, 0] *= 1 + .006 * np.clip(side, 0, 1)
        P[:, 2] *= 1 + .003 * np.clip(side, 0, 1)
        return P
    rbox(name, (w, t, d), (0, bottom_y + t / 2, cz), r, mat, seg=(10, 2, 12), K=3, deform=deform, feature="mattress")
    # Quilted border tape: two piping lines along the top and bottom edge.
    for k, yy in (("top", bottom_y + t - r * .3), ("bottom", bottom_y + r * .3)):
        inset = r * (1 - math.sqrt(1 - .7 ** 2)) - .001
        pts, nrm = rrect_outline(w - 2 * inset, d - 2 * inset, r - inset, 6)
        ring = [(p[0], yy, p[1] + cz) for p in pts]
        sweep(f"{name}_tape_{k}", ring, circle_profile(.0035, 8), mat=mat, closed=True, collision=False, feature="seam")
    return mattress_top_fn(hx - r, hz - r, bottom_y + t, crown, cz)


def drape(name, mat, top_fn, x_flat, z_head, z_flat_end, R, top_y, offset, thickness, drop_side, drop_foot, width_extent, nfx=24, nfz=22, seed=1, folds=1.0, cover_foot=True, edge_flare=.03, hang_offset=0.0):
    """Cloth lying on an analytic support (flat region |x|<x_flat, z<z_flat_end) and
    wrapping its rounded edges (radius R) before hanging down. Displacement is
    outward-only, so the cloth never enters the support."""
    rng = np.random.default_rng(seed)
    Rw = R + offset + thickness / 2
    arc = Rw * math.pi / 2
    def axis_s(flat, hang):
        inner = np.linspace(-flat, flat, nfx)
        wrap = flat + np.linspace(0, arc, 7)[1:]
        hang_s = flat + arc + np.linspace(0, hang, 6)[1:]
        right = np.concatenate([wrap, hang_s])
        return np.concatenate([-right[::-1], inner, right])
    s = axis_s(x_flat, max(drop_side, .001))
    if cover_foot:
        tz_in = np.linspace(z_head, z_flat_end, nfz)
        tz = np.concatenate([tz_in, z_flat_end + np.linspace(0, arc, 7)[1:], z_flat_end + arc + np.linspace(0, drop_foot, 6)[1:]])
    else:
        tz = np.linspace(z_head, z_flat_end, nfz)
    S = np.zeros((len(s), len(tz), 3))
    ph = rng.uniform(0, 6, 4)
    for i, sv in enumerate(s):
        for j, tv in enumerate(tz):
            dx = max(0.0, abs(sv) - x_flat)
            dz = max(0.0, tv - z_flat_end) if cover_foot else 0.0
            L = math.hypot(dx, dz)
            if L < 1e-9:
                x, z = sv, tv
                y = top_fn(np.array(sv), np.array(tv)) + offset + thickness / 2
                hang = 0.0
                ox, oz = 0.0, 0.0
            else:
                ox, oz = (dx / L) * math.copysign(1, sv), dz / L
                grow = hang_offset * min(1.0, L / arc)
                if L <= arc:
                    phi = L / Rw
                    hor, y = (Rw + grow) * math.sin(phi), top_y - R + (Rw + grow) * math.cos(phi)
                    hang = 0.0
                else:
                    hang = L - arc
                    hor, y = Rw + grow + edge_flare * (hang / max(drop_side, .01)) ** 1.5, top_y - R - hang
                bx = math.copysign(x_flat, sv) if abs(sv) > x_flat else sv
                bz = z_flat_end if (cover_foot and tv > z_flat_end) else tv
                x, z = bx + ox * hor, bz + oz * hor
            # soft top wrinkles (upward only) and hanging folds (outward only)
            u = sv / width_extent
            wr = .0035 * (.5 + .5 * math.sin(u * 17 + tv * 5 + ph[0])) * (.6 + .4 * math.sin(tv * 9 + ph[1])) * folds
            y += wr if hang == 0 else 0
            if hang > 0 or L > arc * .6:
                k = hang / max(drop_side, drop_foot, .01)
                along = tv if abs(sv) > x_flat else sv
                corner = 1.0 if (dx > 0 and dz > 0) else 0.0
                f = (.5 + .5 * math.sin(along / .11 * 2 * math.pi + ph[2] + .7 * math.sin(along * 7))) * (.006 + .012 * corner) * folds
                x += ox * f * (k + .2)
                z += oz * f * (k + .2)
            S[i, j] = (x, y, z)
    uv = np.stack(np.meshgrid(s, tz, indexing="ij"), -1)
    tile = np.array(info(mat).get("tile", (1, 1)))
    return cloth_slab(name, S, thickness, mat, uv / tile, feature="quilt")


def flat_quilt(name, mat, top_fn, half_w, z0, z1, offset, thickness, seed=0, nx=26, nz=34):
    """Quilt lying only on the mattress top (for beds enclosed by guard panels):
    soft upward wrinkles, rolled hem, never below the support."""
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 6, 3)
    xs = np.linspace(-half_w, half_w, nx)
    zs = np.linspace(z0, z1, nz)
    X, Z = np.meshgrid(xs, zs, indexing="ij")
    base = top_fn(X, Z) + offset + thickness / 2
    wr = .004 * (.5 + .5 * np.sin(X / half_w * 9 + Z * 6 + ph[0])) * (.6 + .4 * np.sin(Z * 11 + ph[1]))
    S = np.stack((X, base + wr, Z), -1)
    tile = np.array(info(mat).get("tile", (1, 1)))
    return cloth_slab(name, S, thickness, mat, np.stack((X, Z), -1) / tile, feature="quilt")


def heightfield_clamp(points_list, res=.01, axis=2, margin=.003, direction=1):
    """Return a clamp that pushes points in front of (axis, +direction) the given surfaces."""
    P = np.concatenate(points_list)
    others = [i for i in range(3) if i != axis]
    lo = P[:, others].min(axis=0) - .05
    grid = {}
    for p in P:
        key = tuple(np.floor((p[others] - lo) / res).astype(int))
        val = p[axis] * direction
        grid[key] = max(grid.get(key, -1e9), val)
    def clamp(Q):
        Q = Q.copy()
        for k, q in enumerate(Q):
            key = np.floor((q[others] - lo) / res).astype(int)
            best = -1e9
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    best = max(best, grid.get((key[0] + di, key[1] + dj), -1e9))
            if best > -1e8 and q[axis] * direction < best + margin:
                Q[k, axis] = (best + margin) * direction
        return Q
    return clamp


def object_points(obj):
    co = np.zeros(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return np.column_stack((co[:, 0], co[:, 2], -co[:, 1]))


def lean_pillow(name, w, h, t, x, base_fn, back_z, mat, lean, seed, yaw=0.0, piping=None, ears=.05, sink=.012, front_of=None):
    """Pillow standing on its long edge, leaning back by `lean` radians against back_z."""
    rot = (math.pi / 2 - lean, yaw, 0)
    # Build at origin to measure, then place: bottom on the support, back on back_z.
    shape = pillow_points(w, h, t, rot, seed, ears)
    y0 = base_fn(np.array(x), np.array(back_z + .2)) - sink
    cy = y0 - shape[:, 1].min()
    cz = back_z - shape[:, 2].min()
    if front_of is not None:
        # Slide forward until the pillow only compresses its support by ~12 mm.
        probe = pillow_points(w, h, t, rot, seed, ears) + (x, cy, cz)
        push = float(np.max(front_of(probe)[:, 2] - probe[:, 2]))
        cz += max(0.0, push - .012)
    def clamp(P):
        P = P.copy()
        support = base_fn(P[:, 0], P[:, 2]) - .001
        P[:, 1] = np.maximum(P[:, 1], support)
        P[:, 2] = np.maximum(P[:, 2], back_z + .001)
        if front_of is not None:
            P = front_of(P)
        return P
    return pillow(name, w, h, t, (x, cy, cz), mat, rot, seed, ears, clamp=clamp, piping=piping)


def bed_double(w, d, h):
    """Upholstered bed after the grey velvet reference: 4x2 quilted headboard
    panels, rail with piping, mattress set into the frame, layered bedding."""
    rail_t, rail_top, base_y = .075, .37, .045
    head_core, tile_t, foot_t = .06, .05, .06
    zb, zf = -d / 2, d / 2
    m_w, m_d, m_t = 1.6, 2.0, .23
    m_z0 = zb + head_core + tile_t + .005
    m_cz = m_z0 + m_d / 2
    m_bottom = .29
    # feet: dark wooden blocks recessed under the rails
    for i, (fx, fz) in enumerate([(sx * (w / 2 - .09), sz * (d / 2 - .12)) for sx in (-1, 1) for sz in (-1, 1)] + [(0, zb + .3), (0, zf - .3)]):
        box(f"foot_{i}", (.05, base_y, .05), (fx, 0, fz), .006, "oak", grain="y", feature="leg")
    # slatted base deck the mattress rests on (spans to the rails)
    box("support_deck", (w - 2 * rail_t + .01, .025, d - head_core - foot_t + .01), (0, m_bottom - .025, (zb + head_core + zf - foot_t) / 2), .003, "oak", grain="z", feature="base")
    box("support_beam", (.06, m_bottom - .025 - base_y, d - .4), (0, base_y, 0), .003, "oak", grain="z", feature="base")
    def rail_deform(L):
        def f(P):
            P = P.copy()
            # upholstered rails: slightly domed top, taut sides
            top = np.clip((P[:, 1] / ((rail_top - base_y) / 2)), 0, 1)
            P[:, 1] += .004 * top * np.clip(1 - (P[:, 2 if L == "z" else 0] / ((d if L == "z" else w) / 2)) ** 2, 0, 1)
            return P
        return f
    for sx in (-1, 1):
        box(f"side_rail_{sx}", (rail_t, rail_top - base_y, d - head_core), (sx * (w / 2 - rail_t / 2), base_y, (zb + head_core + zf) / 2), .022, seg=(1, 2, 8), deform=rail_deform("z"), feature="frame")
    box("foot_rail", (w - 2 * rail_t + .002, rail_top - base_y, foot_t), (0, base_y, zf - foot_t / 2), .022, seg=(8, 2, 1), deform=rail_deform("x"), feature="frame")
    # piping along the outer top edges of the rails
    yb = rail_top - .006
    pts = fillet([(-w / 2 + .006, yb, zb + head_core + .002), (-w / 2 + .006, yb, zf - .006), (w / 2 - .006, yb, zf - .006), (w / 2 - .006, yb, zb + head_core + .002)], .02, 5)
    sweep("rail_piping", pts, circle_profile(.0038, 8), mat="primary", collision=False, feature="seam")
    # headboard core and quilted tiles
    head_h = h - base_y
    box("headboard", (w, head_h, head_core), (0, base_y, zb + head_core / 2), .02, feature="headboard")
    cols, rows = 4, 2
    tile_bottom, tile_top = m_bottom + m_t - .03, h - .035
    tw = (w - .07) / cols
    th = (tile_top - tile_bottom) / rows
    for r_ in range(rows):
        for c_ in range(cols):
            x = -w / 2 + .035 + tw * (c_ + .5)
            y = tile_bottom + th * (r_ + .5)
            def tdeform(P, tw=tw, th=th):
                P = P.copy()
                a = np.clip(1 - (P[:, 0] / (tw / 2)) ** 2, 0, 1)
                b = np.clip(1 - (P[:, 1] / (th / 2)) ** 2, 0, 1)
                front = np.clip(P[:, 2] / (tile_t / 2), 0, 1)
                P[:, 2] += .012 * (a * b) ** .8 * front
                return P
            rbox(f"headboard_panel_{r_}_{c_}", (tw - .003, th - .003, tile_t - .012), (x, y, zb + head_core + (tile_t - .012) / 2 - .001), .02, seg=(6, 5, 1), K=3, deform=tdeform, feature="headboard")
    # lower headboard band behind the mattress
    box("headboard_band", (w - .07, tile_bottom - base_y - .02, tile_t - .02), (0, base_y + .01, zb + head_core + (tile_t - .02) / 2 - .001), .01, feature="headboard")
    top_fn = mattress("mattress", m_w, m_d, m_t, m_bottom, m_cz, crown=.012)
    m_top = m_bottom + m_t
    R = .045
    x_flat = m_w / 2 - R
    z_end = m_cz + m_d / 2 - R
    duvet_t, duvet_off = .032, .006
    head = m_cz - m_d / 2 + .62
    drape("duvet", "linen_milk", top_fn, x_flat, head, z_end, R, m_top, duvet_off, duvet_t, m_top - rail_top - R - .022, m_top - rail_top - R - .022, m_w / 2, seed=3)
    # folded-back cuff at the head of the duvet
    duvet_fn = lambda x, z: top_fn(x, z) + duvet_off + duvet_t + .0035
    drape("duvet_cuff", "linen_white", duvet_fn, x_flat, head, head + .24, R + duvet_off + duvet_t, m_top + duvet_off + duvet_t, .002, .016, .06, 0, m_w / 2, nfz=10, seed=5, folds=.6, cover_foot=False, hang_offset=.008)
    # knitted throw across the foot, over the duvet
    drape("throw", "knit_beige", duvet_fn, x_flat, m_cz + .38, m_cz + .82, R + duvet_off + duvet_t, m_top + duvet_off + duvet_t, .002, .014, .075, 0, m_w / 2, nfz=14, seed=9, folds=1.6, cover_foot=False, edge_flare=.04, hang_offset=.009)
    base_fn = lambda x, z: top_fn(x, z) + 0 * x
    back = zb + head_core + tile_t
    sleep = []
    for i, sx in enumerate((-1, 1)):
        sleep.append(lean_pillow(f"pillow_sleep_{i}", .70, .50, .15, sx * .39 + (.01 if i else -.008), base_fn, back + .002, "linen_white", math.radians(36 + 5 * i), 11 + i, yaw=sx * .03))
    front_clamp = heightfield_clamp([object_points(o) for o in sleep], .012, 2, .004)
    for i, sx in enumerate((-1, 1)):
        lean_pillow(f"pillow_decor_{i}", .46, .46, .13, sx * .36, base_fn, back + .12, "velvet_sage", math.radians(24 - 4 * i), 21 + i, yaw=-sx * .08, piping=.004, ears=.04, front_of=front_clamp)
    decor = [o for o in C.OBJECTS if o.name.startswith("pillow_decor_")]
    clamp2 = heightfield_clamp([object_points(o) for o in sleep + decor], .012, 2, .004)
    lean_pillow("pillow_lumbar", .52, .30, .12, .04, base_fn, back + .2, "velvet_graphite", math.radians(16), 31, yaw=.05, piping=.0035, ears=.03, front_of=clamp2)


def bed_single(w, d, h):
    """Solid oak single bed after the pine/oak reference: square posts, two-board
    headboard, low footboard, side rails and two under-bed drawers."""
    post = .06
    rail_t, rail_bottom, rail_top = .03, .17, .36
    zb, zf = -d / 2, d / 2
    foot_h = .5
    for sx in (-1, 1):
        for sz, ph in ((-1, h), (1, foot_h)):
            x, z = sx * (w / 2 - post / 2), sz * (d / 2 - post / 2)
            box(f"post_{sx}_{sz}", (post, ph, post), (x, 0, z), .006, "primary", seg=(1, 4, 1), grain="y", feature="leg")
    # headboard: two wide boards between the posts and a hidden lower rail
    inner_w = w - 2 * post + .004
    for name, y0, y1 in (("headboard_top", .69, .82), ("headboard_mid", .53, .64), ("headboard_low", rail_bottom, rail_top)):
        box(name, (inner_w, y1 - y0, .022), (0, y0, zb + post / 2), .004, "primary", grain="x", feature="headboard")
    box("footboard", (inner_w, .09, .022), (0, .335, zf - post / 2), .004, "primary", grain="x", feature="headboard")
    box("foot_rail", (inner_w, .15, .022), (0, rail_bottom, zf - post / 2), .004, "primary", grain="x", feature="frame")
    for sx in (-1, 1):
        box(f"side_rail_{sx}", (rail_t, rail_top - rail_bottom, d - 2 * post + .004), (sx * (w / 2 - rail_t / 2), rail_bottom, 0), .004, "primary", grain="z", feature="frame")
        box(f"slat_ledger_{sx}", (.02, .025, d - 2 * post), (sx * (w / 2 - rail_t - .01), .27, 0), .002, "oak", grain="z", feature="frame")
    m_w, m_d, m_t, m_bottom = .9, 2.0, .2, .295
    for i in range(13):
        z = zb + post + .07 + i * (m_d - .14) / 12
        box(f"slat_{i}", (w - 2 * rail_t - .002, .018, .06), (0, .277, z), .002, "oak", grain="x", feature="base")
    # two drawers on the +X side under the rail
    dw = (d - 2 * post - .03) / 2
    for i in range(2):
        z = zb + post + .01 + dw * (i + .5) + i * .01
        box(f"drawer_box_{i}", (w - .1, .13, dw - .02), (w / 2 - .03 - (w - .1) / 2 + .001, .03, z), .003, "oak", grain="z", feature="drawer")
        box(f"drawer_front_{i}", (.02, .142, dw), (w / 2 - .02, .026, z), .004, "primary", grain="z", feature="drawer")
        # finger pull: a softened groove block in front
        rbox(f"drawer_pull_{i}", (.006, .02, .14), (w / 2 - .007, .14, z), .003, "oak_end", feature="handle")
        for k, zz in enumerate((z - dw * .35, z + dw * .35)):
            lathe(f"drawer_wheel_{i}_{k}", [(0, 0), (.013, 0), (.015, .008), (.013, .016), (0, .016)], (w / 2 - .05, .015, zz), "rubber", 14, rot=(0, 0, math.pi / 2), feature="leg")
    top_fn = mattress("mattress", m_w, m_d, m_t, m_bottom, 0, crown=.01)
    m_top = m_bottom + m_t
    R = .045
    drape("duvet", "linen_grey", top_fn, m_w / 2 - R, -m_d / 2 + .55, m_d / 2 - R, R, m_top, .006, .03, m_top - rail_top - R - .02, .0, m_w / 2, seed=13, folds=1.3, edge_flare=0.0)
    duvet_fn = lambda x, z: top_fn(x, z) + .006 + .03 + .0035
    drape("duvet_cuff", "linen_white", duvet_fn, m_w / 2 - R, -m_d / 2 + .55, -m_d / 2 + .75, R + .036, m_top + .036, .002, .016, .05, 0, m_w / 2, nfz=10, seed=15, folds=.6, cover_foot=False, hang_offset=.009)
    back = zb + post / 2 + .011
    p1 = lean_pillow("pillow_sleep", .70, .50, .15, -.02, top_fn, back + .002, "linen_white", math.radians(38), 41, yaw=.04)
    clamp = heightfield_clamp([object_points(p1)], .012, 2, .004)
    lean_pillow("pillow_decor", .45, .45, .13, .08, top_fn, back + .1, "knit_grey", math.radians(24), 43, yaw=-.12, ears=.04, front_of=clamp)


def bed_kids(w, d, h):
    """Painted kids bed after the white guard-rail reference: rounded head and
    foot boards with hand slots, side guards, deep drawer and soft bedding."""
    pt = .02
    zb, zf = -d / 2, d / 2
    m_w, m_d, m_t, m_bottom = .8, 1.6, .12, .25
    for z, name in ((zb + pt / 2, "headboard"), (zf - pt / 2, "footboard")):
        board_panel(name, w, h, pt, z, slot=(h - .17, .42, .055))
    # wall-side guard (full length) and front guard near the head with a slot
    side_h = h - .02
    for sx, length, z0 in ((-1, d - 2 * pt, 0), (1, .62, zb + pt + .31)):
        guard_panel(f"side_guard_{sx}", length, side_h, pt, sx * (w / 2 - pt / 2), z0, slot=sx < 0, bottom=.1 if sx < 0 else m_bottom - .12)
    box("rail_front", (pt, .14, d - 2 * pt - .62), (w / 2 - pt / 2, m_bottom - .12, zb + pt + .62 + (d - 2 * pt - .62) / 2), .006, "primary", grain="z", feature="frame")
    box("drawer_front", (pt, m_bottom - .14, d - 2 * pt - .1), (w / 2 - pt / 2 + .002, .02, 0), .006, "primary", grain="z", feature="drawer")
    box("drawer_body", (w - 2 * pt - .02, m_bottom - .16, d - 2 * pt - .12), (pt / 2, .03, 0), .003, "paint_white", feature="drawer")
    rbox("drawer_grip", (.006, .02, .28), (w / 2 + .002, m_bottom - .17, 0), .003, "paint_milk", feature="handle")
    for i in range(9):
        z = zb + pt + .08 + i * (m_d - .16) / 8
        box(f"slat_{i}", (w - 2 * pt + .002, .016, .055), (0, m_bottom - .016, z), .002, "oak", grain="x", feature="base")
    for sx in (-1, 1):
        box(f"ledger_{sx}", (.02, .03, d - 2 * pt), (sx * (w / 2 - pt - .01), m_bottom - .046, 0), .002, "oak", grain="z", feature="frame")
    top_fn = mattress("mattress", m_w, m_d, m_t, m_bottom, 0, crown=.008, r=.035)
    m_top = m_bottom + m_t
    R = .035
    flat_quilt("duvet", "linen_beige", top_fn, m_w / 2 - R - .004, -m_d / 2 + .45, m_d / 2 - .03, .004, .03, seed=17)
    p = lean_pillow("pillow_sleep", .58, .36, .13, 0, top_fn, zb + pt + .002, "linen_beige", math.radians(48), 51)
    clamp = heightfield_clamp([object_points(p)], .012, 2, .004)
    lean_pillow("pillow_decor", .32, .3, .1, -.1, top_fn, zb + pt + .1, "knit_beige", math.radians(36), 53, yaw=.15, ears=.04, front_of=clamp)


def panel_curve(name, outline, holes, thickness, offset, mat, plane="xy", bevel=.004, feature="frame"):
    """Extrude a 2D outline with holes into a panel with rounded edges (Blender curve).
    plane 'xy': u->x, v->y, thickness along z;  'zy': u->z, v->y, thickness along x;
    'xz': u->x, v->-z, thickness along y. `offset` is the panel centre on that axis."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = max(.0001, thickness / 2 - bevel)
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    curve.resolution_u = 6
    for ring in [outline] + holes:
        spline = curve.splines.new("POLY")
        spline.points.add(len(ring) - 1)
        for pt, (u, v) in zip(spline.points, ring):
            pt.co = (u, v, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    me = obj.data
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    u, v, t = co[:, 0], co[:, 1], co[:, 2]
    if plane == "xy":
        auth = np.column_stack((u, v, offset + t)); mirrored = False
    elif plane == "zy":
        auth = np.column_stack((offset + t, v, u)); mirrored = True
    else:
        auth = np.column_stack((u, offset + t, -v)); mirrored = False
    me.vertices.foreach_set("co", np.column_stack((auth[:, 0], -auth[:, 2], auth[:, 1])).reshape(-1))
    me.update()
    if mirrored:
        me.flip_normals()
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    tile = np.array(info(mat).get("tile", (1, 1)))
    layer = me.uv_layers.new(name="UVMap")
    loops = np.zeros(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", loops)
    a = auth[loops]
    uv = {"xy": (0, 1), "zy": (2, 1), "xz": (0, 2)}[plane]
    layer.data.foreach_set("uv", (np.column_stack((a[:, uv[0]], a[:, uv[1]])) / tile).reshape(-1))
    me.materials.append(material(mat))
    me.set_sharp_from_angle(angle=math.radians(40))
    obj.name = name
    obj["collision"] = True
    obj["feature"] = feature
    C.OBJECTS.append(obj)
    return obj


def stadium(cx, cy, length, height, n=8):
    r = height / 2
    pts = []
    for side, start in ((1, -90), (-1, 90)):
        x0 = cx + side * (length / 2 - r)
        for i in range(n + 1):
            a = math.radians(start + 180 * i / n)
            pts.append((x0 + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rounded_top_outline(w, h, r, n=8):
    pts = [(-w / 2, 0), (w / 2, 0)]
    for cx, start in ((w / 2 - r, 0), (-w / 2 + r, 90)):
        for i in range(n + 1):
            a = math.radians(start + 90 * i / n)
            pts.append((cx + r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def board_panel(name, w, h, t, z, slot):
    y, length, sh = slot
    panel_curve(name, rounded_top_outline(w, h, .06), [list(reversed(stadium(0, y, length, sh)))], t, z, "primary", "xy")


def guard_panel(name, length, h, t, x, zc, slot, bottom=.1):
    outline = [(zc - length / 2, bottom), (zc + length / 2, bottom)]
    r = .05
    for cz, start in ((zc + length / 2 - r, 0), (zc - length / 2 + r, 90)):
        for i in range(9):
            a = math.radians(start + 90 * i / 8)
            outline.append((cz + r * math.cos(a), h - r + r * math.sin(a)))
    holes = [list(reversed(stadium(zc, h - .1, length - .2, .05)))] if slot else []
    panel_curve(name, outline, holes, t, x, "primary", "zy")


# --------------------------------------------------------------------------- upholstery
def cushion(name, size, center, r, mat="primary", crown=.012, front_roll=0.0, seg=(10, 3, 10), rot=None, lean=0.0, piping=None, feature="cushion"):
    w, t, dd = size
    def deform(P):
        P = P.copy()
        a = np.clip(1 - (P[:, 0] / (w / 2)) ** 2, 0, 1)
        b = np.clip(1 - (P[:, 2] / (dd / 2)) ** 2, 0, 1)
        up = np.clip((P[:, 1] + t / 2) / t, 0, 1)
        P[:, 1] += crown * (a * b) ** .7 * up ** 2
        # border bulges a little, like a filled cushion
        mid = np.clip(1 - (2 * P[:, 1] / t) ** 2, 0, 1)
        P[:, 0] *= 1 + .012 * mid * b
        P[:, 2] *= 1 + .012 * mid * a
        if front_roll:
            P[:, 1] -= front_roll * np.clip(P[:, 2] / (dd / 2), 0, 1) ** 4 * up
        if lean:
            P[:, 2] -= (P[:, 1] + t / 2) * math.tan(lean)
        return P
    obj = rbox(name, size, center, r, mat, seg=seg, K=3, deform=deform, rot=rot, feature=feature)
    if piping:
        for yy in (t / 2 - r * .29, -t / 2 + r * .29):
            pts, nrm = rrect_outline(w - r * .58, dd - r * .58, r * .7, 5)
            ring = deform(np.column_stack((pts[:, 0], np.full(len(pts), yy), pts[:, 1])))
            if rot is not None:
                ring = ring @ euler(rot).T
            sweep(name + f"_welt_{'top' if yy > 0 else 'bottom'}", ring + np.asarray(center), circle_profile(piping, 8), mat=mat, closed=True, collision=False, feature="seam")
    return obj


def sofa_family(w, d, h, kind):
    """Soft modern sofa / armchair: upholstered plinth and arms, separate seat and
    back cushions with welts, scatter cushions and solid oak legs."""
    arm = .17 if kind == "sofa" else .14 if kind == "sofa-small" else .15
    leg_h = .1 if kind != "armchair" else .16
    seat_bottom = leg_h + .2
    back_d = .17
    seats = 3 if kind == "sofa" else 2 if kind == "sofa-small" else 1
    arm_h = .62 if kind != "armchair" else .63
    # legs
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (w / 2 - .08), sz * (d / 2 - .08)
            if kind == "armchair":
                tapered_leg(f"leg_{sx}_{sz}", (x, leg_h + .002, z), leg_h, .022, .014, "oak", (sx * .025, sz * .025))
            else:
                lathe(f"leg_{sx}_{sz}", [(0, 0), (.016, 0), (.019, .004), (.024, leg_h - .004), (.025, leg_h + .003), (0, leg_h + .003)], (x, 0, z), "oak", 20, feature="leg")
    inner = w - 2 * arm
    box("plinth", (inner + .02, seat_bottom - leg_h, d - .02), (0, leg_h, 0), .03, feature="base")
    for sx in (-1, 1):
        def arm_deform(P, sx=sx):
            P = P.copy()
            top = np.clip(P[:, 1] / ((arm_h - leg_h) / 2), 0, 1)
            P[:, 0] += -sx * .012 * top ** 3  # arm tops roll slightly inwards
            P[:, 1] += .006 * top * np.clip(1 - (P[:, 2] / (d / 2)) ** 2, 0, 1)
            return P
        box(f"arm_{sx}", (arm, arm_h - leg_h, d), (sx * (w / 2 - arm / 2), leg_h, 0), .055, seg=(2, 4, 6), deform=arm_deform, feature="arm")
        # welt framing the front face of the arm
        loop, _ = rrect_outline(arm - .03, arm_h - leg_h - .03, .045, 5)
        ring = [(sx * (w / 2 - arm / 2) + p[0], leg_h + (arm_h - leg_h) / 2 + p[1], d / 2 - .002) for p in loop]
        sweep(f"arm_welt_{sx}", ring, circle_profile(.0035, 8), up=(0, 0, 1), mat="primary", closed=True, collision=False, feature="seam")
    box("back_frame", (inner + .02, h - leg_h, back_d), (0, leg_h, -d / 2 + back_d / 2), .05, feature="back")
    seat_t = .16
    seat_d = d - back_d - .015
    cw = inner / seats
    seat_top = seat_bottom + seat_t
    for i in range(seats):
        x = -inner / 2 + cw * (i + .5)
        cushion(f"seat_cushion_{i}", (cw - .004, seat_t, seat_d), (x, seat_bottom + seat_t / 2, -d / 2 + back_d + seat_d / 2), .045, crown=.016, front_roll=.008, seg=(10, 3, 10), piping=.0034, feature="seat")
        back_cushion(f"back_cushion_{i}", cw - .006, h - seat_top - .03, .19, x, seat_top - .003, -d / 2 + back_d, math.radians(9))
    # scatter cushions leaning on the back cushions
    backs = [o for o in C.OBJECTS if o.name.startswith("back_cushion_")]
    clamp = heightfield_clamp([object_points(o) for o in backs], .012, 2, .004)
    seat_fn = lambda x, z: np.full(np.shape(x), seat_top + .01)
    if kind == "armchair":
        lean_pillow("scatter_cushion", .42, .32, .13, 0, seat_fn, -d / 2 + back_d + .1, "velvet_sand", math.radians(24), 61, yaw=.06, piping=.0035, front_of=clamp)
    else:
        for i, sx in enumerate((-1, 1)):
            x = sx * (inner / 2 - .26)
            lean_pillow(f"scatter_cushion_{i}", .45, .45, .14, x, seat_fn, -d / 2 + back_d + .1, "velvet_sand" if i == 0 else "linen_beige", math.radians(24 + 5 * i), 63 + i, yaw=-sx * .1, piping=.0035 if i == 0 else None, front_of=clamp)


def back_cushion(name, w, hgt, t, x, y0, z_back, lean):
    def deform(P):
        P = P.copy()
        a = np.clip(1 - (P[:, 0] / (w / 2)) ** 2, 0, 1)
        b = np.clip(1 - ((P[:, 1]) / (hgt / 2)) ** 2, 0, 1)
        front = np.clip(P[:, 2] / (t / 2), 0, 1)
        P[:, 2] += .03 * (a * b) ** .8 * front
        mid = np.clip(1 - (2 * P[:, 2] / t) ** 2, 0, 1)
        P[:, 0] *= 1 + .012 * mid * b
        # leaning back: shear z by height
        P[:, 2] -= (P[:, 1] + hgt / 2) * math.tan(lean)
        # the top rolls slightly forward
        P[:, 2] += .02 * np.clip((P[:, 1] - hgt * .3) / (hgt * .2), 0, 1) ** 2
        return P
    cz = z_back + t / 2 + hgt * math.tan(lean) + .002
    obj = rbox(name, (w, hgt, t), (x, y0 + hgt / 2, cz), .06, "primary", seg=(8, 8, 2), K=3, deform=deform, feature="cushion")
    return obj


def sofa_corner(w, d, h):
    arm, leg_h, back_d = .17, .1, .17
    body_d = .95
    seat_bottom, seat_t = leg_h + .2, .16
    seat_top = seat_bottom + seat_t
    arm_h = .62
    chaise_w = .95
    zb = -d / 2
    for i, (x, z) in enumerate([(-w / 2 + .08, zb + .08), (-w / 2 + .08, d / 2 - .08), (-w / 2 + chaise_w - .08, d / 2 - .08), (w / 2 - .08, zb + .08), (w / 2 - .08, zb + body_d - .08), (-w / 2 + chaise_w + .05, zb + body_d - .08)]):
        lathe(f"leg_{i}", [(0, 0), (.016, 0), (.019, .004), (.024, leg_h - .004), (.025, leg_h + .003), (0, leg_h + .003)], (x, 0, z), "oak", 20, feature="leg")
    # plinths: chaise (full depth) and main section
    box("plinth_chaise", (chaise_w - arm + .01, seat_bottom - leg_h, d - .01), (-w / 2 + arm + (chaise_w - arm) / 2 - .005, leg_h, 0), .03, feature="base")
    box("plinth_main", (w - chaise_w - arm + .01, seat_bottom - leg_h, body_d - .01), (-w / 2 + chaise_w + (w - chaise_w - arm) / 2, leg_h, zb + body_d / 2 - .005), .03, feature="base")
    box("arm_left", (arm, arm_h - leg_h, d), (-w / 2 + arm / 2, leg_h, 0), .055, feature="arm")
    box("arm_right", (arm, arm_h - leg_h, body_d), (w / 2 - arm / 2, leg_h, zb + body_d / 2), .055, feature="arm")
    for name, x, zc, dd in (("arm_welt_left", -w / 2 + arm / 2, d / 2, None), ("arm_welt_right", w / 2 - arm / 2, zb + body_d, None)):
        loop, _ = rrect_outline(arm - .03, arm_h - leg_h - .03, .045, 5)
        sweep(name, [(x + p[0], leg_h + (arm_h - leg_h) / 2 + p[1], zc - .002) for p in loop], circle_profile(.0035, 8), up=(0, 0, 1), mat="primary", closed=True, collision=False, feature="seam")
    box("back_frame", (w - 2 * arm + .02, h - leg_h, back_d), (0, leg_h, zb + back_d / 2), .05, feature="back")
    # chaise seat
    cw = chaise_w - arm
    cushion("seat_cushion_chaise", (cw - .004, seat_t, d - back_d - .015), (-w / 2 + arm + cw / 2, seat_bottom + seat_t / 2, zb + back_d + (d - back_d - .015) / 2), .045, crown=.016, front_roll=.008, seg=(8, 3, 16), piping=.0034, feature="seat")
    main_w = w - chaise_w - arm
    for i in range(2):
        x = -w / 2 + chaise_w + main_w * (i + .5) / 2
        cushion(f"seat_cushion_{i}", (main_w / 2 - .004, seat_t, body_d - back_d - .015), (x, seat_bottom + seat_t / 2, zb + back_d + (body_d - back_d - .015) / 2), .045, crown=.016, front_roll=.008, seg=(10, 3, 10), piping=.0034, feature="seat")
    lean = math.radians(9)
    xs = [(-w / 2 + arm + cw / 2, cw)] + [(-w / 2 + chaise_w + main_w * (i + .5) / 2, main_w / 2) for i in range(2)]
    for i, (x, bw) in enumerate(xs):
        back_cushion(f"back_cushion_{i}", bw - .006, h - seat_top - .03, .19, x, seat_top - .003, zb + back_d, lean)
    backs = [o for o in C.OBJECTS if o.name.startswith("back_cushion_")]
    clamp = heightfield_clamp([object_points(o) for o in backs], .012, 2, .004)
    seat_fn = lambda x, z: np.full(np.shape(x), seat_top + .01)
    for i, (x, mat) in enumerate(((-w / 2 + arm + cw / 2 + .05, "velvet_sand"), (w / 2 - arm - .3, "linen_beige"))):
        lean_pillow(f"scatter_cushion_{i}", .45, .45, .14, x, seat_fn, zb + back_d + .1, mat, math.radians(24 + 4 * i), 71 + i, yaw=.1 - .2 * i, piping=.0035 if i == 0 else None, front_of=clamp)


# --------------------------------------------------------------------------- chair
def chair(w, d, h):
    """Dining chair after the channel-stitched shell reference: wrap-around padded
    back with vertical channels, welted seat, tapered black steel legs."""
    seat_h, seat_t = .47, .085
    seat_bottom = seat_h - seat_t
    leg_top = seat_bottom - .022
    T = .055
    rec = math.tan(math.radians(9))
    y_low = seat_bottom + .004
    rec_top = (h - y_low) * rec
    radius_x = w / 2 - T / 2 - .012
    radius_z = d * .40
    theta_max = math.radians(98)
    zc = -d / 2 + radius_z + T / 2 + rec_top
    # --- seat: rounded box mapped into the shell's inner ellipse at the back
    sw = w / 1.012
    z_front = d / 2 - .004
    rxi, rzi = radius_x - T / 2 - .006, radius_z - T / 2 - .006
    z_rear = zc - rzi * .97
    sd = z_front - z_rear
    seat_cz = (z_front + z_rear) / 2
    def half_width(z):
        zz = np.clip((z - zc) / rzi, -1, 0)
        back = rxi * np.sqrt(np.clip(1 - zz ** 2, .06, 1))
        ramp = np.clip((z - zc + .02) / .17, 0, 1)
        ramp = ramp * ramp * (3 - 2 * ramp)
        return back + (sw / 2 - rxi) * ramp
    def seat_deform(P):
        P = P.copy()
        P[:, 0] = P[:, 0] / (sw / 2) * half_width(P[:, 2] + seat_cz)
        a = np.clip(1 - (P[:, 0] / (sw / 2)) ** 2, 0, 1)
        b = np.clip(1 - (P[:, 2] / (sd / 2)) ** 2, 0, 1)
        up = np.clip((P[:, 1] + seat_t / 2) / seat_t, 0, 1)
        P[:, 1] += .014 * (a * b) ** .7 * up ** 2
        P[:, 1] -= .01 * np.clip(P[:, 2] / (sd / 2), 0, 1) ** 4 * up
        mid = np.clip(1 - (2 * P[:, 1] / seat_t) ** 2, 0, 1)
        P[:, 0] *= 1 + .01 * mid
        P[:, 2] *= 1 + .006 * mid
        return P
    rbox("seat", (sw, seat_t, sd), (0, seat_h - seat_t / 2, seat_cz), .032, "primary", seg=(12, 3, 14), K=4, deform=seat_deform, feature="seat")
    inset = .032 * (1 - math.sqrt(1 - .7 ** 2)) - .0008
    zs = np.linspace(-sd / 2 + .03, sd / 2 - inset, 40)
    left = [(-1, z) for z in zs]
    ring_local = [(sx * (sw / 2 - inset), seat_t / 2 - .032 * .3, z) for sx, z in left] + [(sw / 2 - inset, seat_t / 2 - .032 * .3, z) for z in zs[::-1]]
    welt = seat_deform(np.array(ring_local)) + (0, seat_h - seat_t / 2, seat_cz)
    sweep("seat_welt", welt, circle_profile(.003, 8), mat="primary", closed=True, collision=False, feature="seam")
    # --- wrap-around shell back: a rounded box bent along an elliptical plan curve
    arc_len = 2 * theta_max * (radius_x + radius_z) / 2
    Hb = 1.0
    def shell_deform(P):
        theta = P[:, 0] / (arc_len / 2) * theta_max
        x0, z0 = np.sin(theta) * radius_x, zc - np.cos(theta) * radius_z
        dx, dz = np.cos(theta) * radius_x, np.sin(theta) * radius_z
        tl = np.sqrt(dx * dx + dz * dz)
        nx, nz = dz / tl, -dx / tl          # outward normal of the plan curve
        frac = np.clip(np.abs(theta) / theta_max, 0, 1)
        side = np.clip((frac - .3) / .25, 0, 1); side = side * side * (3 - 2 * side)
        y_bot = y_low + (seat_h - .016 - y_low) * side
        y_top = h - (h - (seat_h + .19)) * frac ** 2.2
        hfrac = np.clip(P[:, 1] / Hb + .5, 0, 1)
        y = y_bot + hfrac * (y_top - y_bot)
        tt = P[:, 2]
        inner = np.clip(-tt / (T / 2), 0, 1)
        channels = 7
        band = np.abs(P[:, 0]) < arc_len * .28
        phase = (P[:, 0] / (arc_len * .56) + .5) * channels
        pad = np.sin(np.clip(phase % 1, 0, 1) * np.pi) ** .6 * band
        body = np.clip(np.sin(hfrac * np.pi) * 1.8, 0, 1)
        tt = tt - inner * (.009 * pad) * body
        recline = (y - y_low) * rec * np.cos(theta) ** 2
        X = x0 + nx * tt
        Z = z0 + nz * tt - recline
        return np.column_stack((X, y, Z))
    rbox("back_shell", (arc_len, Hb, T), (0, 0, 0), .024, "primary", seg=(150, 12, 1), K=3, deform=shell_deform, feature="back")
    # --- steel base: seat frame, legs with felt glides, straps carrying the shell
    fz0, fz1 = -.11, .2
    box("seat_frame", (w * .7, .022, fz1 - fz0), (0, leg_top, (fz0 + fz1) / 2), .004, "steel_black", feature="frame")
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = (sx * w * .3, fz1 - .03) if sz > 0 else (sx * w * .24, fz0 + .05)
            splay = (sx * .03, .035) if sz > 0 else (sx * .022, -.05)
            tapered_leg(f"leg_{sx}_{sz}", (x, leg_top + .004, z), leg_top, .0125, .0085, "steel_black", splay)
            lathe(f"glide_{sx}_{sz}", [(0, 0), (.0095, 0), (.01, .004), (.0085, .006), (0, .006)], (x + splay[0], 0, z + splay[1]), "felt", 14, feature="leg")
    for sx in (-1, 1):
        x = sx * w * .2
        ox, oz = radius_x + T / 2, radius_z + T / 2
        z_s = zc - oz * math.sqrt(max(0.0, 1 - (x / ox) ** 2)) - .0032
        cos2 = 1 - (x / ox) ** 2
        top_y = y_low + .1
        sweep(f"back_strap_{sx}", [(x, leg_top, z_s), (x, top_y, z_s - (top_y - y_low) * rec * cos2)], rrect_profile(.006, .03, .0015, 2), up=(1, 0, 0), mat="steel_black", feature="frame")
        box(f"back_bracket_{sx}", (.03, .006, fz0 - z_s + .004), (x, leg_top, (fz0 + z_s) / 2), .0015, "steel_black", feature="frame")


# --------------------------------------------------------------------------- tables
def table(w, d, h):
    """Dining table after the oak + black steel reference: thick oak top with
    rounded corners, trapezoid sled legs and a longitudinal steel rail."""
    top_t = .036
    slab("tabletop", w, d, top_t, .045, .009, (0, h - top_t, 0), "primary", grain="x", feature="tabletop")
    lift = .004
    y_top_bar = h - top_t - .02
    for sx in (-1, 1):
        x = sx * (w / 2 - .2)
        zt, zb = d * .3, d * .4
        loop = fillet([(x, y_top_bar, -zt), (x, y_top_bar, zt), (x, lift + .02, zb), (x, lift + .02, -zb)], .012, 4, closed=True)
        sweep(f"sled_leg_{sx}", loop, rrect_profile(.04, .07, .004, 3), up=(1, 0, 0), mat="steel_black", closed=True, feature="leg")
        for sz in (-1, 1):
            lathe(f"glide_{sx}_{sz}", [(0, 0), (.016, 0), (.017, .002), (.015, lift + .002), (0, lift + .002)], (x, 0, sz * (zb - .05)), "felt", 16, feature="leg")
    box("rail", (w - .4 - .06, .03, .05), (0, h - top_t - .03, 0), .004, "steel_black", feature="frame")


def desk(w, d, h):
    """Writing desk: oak top, black steel frame, hanging oak drawer and cable tray."""
    top_t = .025
    slab("tabletop", w, d, top_t, .012, .006, (0, h - top_t, 0), "primary", grain="x", feature="tabletop")
    leg = .03
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(f"leg_{sx}_{sz}", (leg, h - top_t - .002, leg), (sx * (w / 2 - .04), 0, sz * (d / 2 - .04)), .003, "steel_black", seg=(1, 2, 1), feature="leg")
    ring = fillet([(-w / 2 + .04, h - top_t - .015, -d / 2 + .04), (w / 2 - .04, h - top_t - .015, -d / 2 + .04), (w / 2 - .04, h - top_t - .015, d / 2 - .04), (-w / 2 + .04, h - top_t - .015, d / 2 - .04)], .004, 2, closed=True)
    sweep("apron_frame", ring, rrect_profile(.02, .03, .002, 2), mat="steel_black", closed=True, feature="frame")
    dw, dh = .42, .12
    x = w / 2 - .06 - dw / 2
    case_d, case_z = d - .14, -.01
    box("drawer_case", (dw, dh + .03, case_d), (x, h - top_t - .03 - dh, case_z), .003, "primary", grain="z", feature="drawer")
    case_front = case_z + case_d / 2
    box("drawer_front", (dw - .006, dh - .006, .018), (x, h - top_t - .03 - dh + .003, case_front + .009), .003, "primary", grain="x", feature="drawer")
    bar_handle("drawer_handle", x, h - top_t - .03 - dh / 2, case_front + .018, .16)
    box("cable_tray", (w * .45, .006, .12), (-w * .15, h - top_t - .03 - .07, -d / 2 + .1), .002, "steel_black", feature="frame")
    for sx in (-1, 1):
        box(f"tray_hanger_{sx}", (.006, .1, .03), (-w * .15 + sx * w * .2, h - top_t - .1, -d / 2 + .1), .001, "steel_black", feature="frame")


def coffee(w, d, h):
    top_t = .03
    slab("tabletop", w, d, top_t, .09, .01, (0, h - top_t, 0), "primary", grain="x", feature="tabletop")
    slab("lower_shelf", w - .1, d - .1, .018, .07, .005, (0, .1, 0), "primary", grain="x", feature="top")
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (w / 2 - .07), sz * (d / 2 - .07)
            lathe(f"leg_{sx}_{sz}", [(0, 0), (.014, 0), (.016, .004), (.022, h - top_t - .006), (.024, h - top_t + .001), (0, h - top_t + .001)], (x, 0, z), "oak", 20, feature="leg")


# --------------------------------------------------------------------------- cabinets
def wardrobe(w, d, h):
    plinth = .08
    door_t = .019
    cd = d - door_t - .002
    zc = -d / 2 + cd / 2
    t = .018
    box("side_left", (t, h, cd), (-w / 2 + t / 2, 0, zc), .0015, "primary", grain="y", feature="frame")
    box("side_right", (t, h, cd), (w / 2 - t / 2, 0, zc), .0015, "primary", grain="y", feature="frame")
    box("top", (w - 2 * t + .002, t, cd), (0, h - t, zc), .0015, "primary", grain="x", feature="top")
    box("bottom", (w - 2 * t + .002, t, cd), (0, plinth, zc), .0015, "primary", grain="x", feature="frame")
    box("back_panel", (w - 2 * t + .002, h - plinth - t, .008), (0, plinth, -d / 2 + .004), .001, "primary", grain="y", feature="frame")
    box("plinth", (w - 2 * t + .002, plinth, t), (0, 0, zc + cd / 2 - .04), .0015, "oak", grain="x", feature="base")
    doors = 3
    gap = .003
    dw = (w - gap * (doors + 1)) / doors
    for i in range(doors):
        x = -w / 2 + gap + dw / 2 + i * (dw + gap)
        y0 = plinth + .002
        box(f"door_{i}", (dw, h - y0 - gap, door_t), (x, y0, d / 2 - door_t / 2), .002, "primary", seg=(1, 2, 1), grain="y", feature="door")
        hx = x + (dw / 2 - .05) * (1 if i == 0 else -1)
        bar_handle(f"handle_{i}", hx, 1.05, d / 2, .36, vertical=True, r=.0065, stand=.035)


def chest(w, d, h, rows, leg_h, kind):
    """Dresser / nightstand on tapered legs with full-overlay drawer fronts."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (w / 2 - .05), sz * (d / 2 - .05)
            tapered_leg(f"leg_{sx}_{sz}", (x, leg_h + .002, z), leg_h, .017, .011, "oak", (sx * .012, sz * .012))
    t = .018
    face_t = .018
    cd = d - face_t
    zc = -d / 2 + cd / 2
    body = h - leg_h
    box("base_frame", (w - .03, .03, cd - .03), (0, leg_h - .002, zc), .002, "oak", grain="x", feature="base")
    box("side_left", (t, body - t, cd), (-w / 2 + t / 2, leg_h, zc), .0015, "primary", grain="y", feature="frame")
    box("side_right", (t, body - t, cd), (w / 2 - t / 2, leg_h, zc), .0015, "primary", grain="y", feature="frame")
    slab("top", w, d, t, .005, .004, (0, h - t, 0), "primary", grain="x", feature="top")
    box("bottom", (w - 2 * t + .002, t, cd), (0, leg_h, zc), .0015, "primary", grain="x", feature="frame")
    box("back_panel", (w - 2 * t + .002, body - 2 * t, .006), (0, leg_h + t, -d / 2 + .004), .001, "primary", grain="y", feature="frame")
    gap = .003
    front_zone = body - t - 2 * gap
    if kind == "nightstand":
        fh = .15
        fronts = [(h - t - gap - fh / 2, fh)]
        # open niche below: shelf visible inside
        box("niche_shelf", (w - 2 * t + .002, t, cd - .02), (0, h - t - gap - fh - t - .002, zc - .01), .0015, "primary", grain="x", feature="frame")
    else:
        fh = (front_zone - gap * (rows - 1)) / rows
        fronts = [(leg_h + gap + fh / 2 + i * (fh + gap), fh) for i in range(rows)]
    for i, (y, fh) in enumerate(fronts):
        box(f"drawer_front_{i}", (w - 2 * gap, fh, face_t), (0, y - fh / 2, d / 2 - face_t / 2), .002, "primary", grain="x", feature="drawer")
        bar_handle(f"handle_{i}", 0, y + (fh * .18 if kind != "nightstand" else 0), d / 2, min(.16, w * .3), r=.0055, stand=.028, mat="brass")


def bookcase(w, d, h, kind):
    t = .02
    if kind == "wall-shelf":
        box("side_left", (t, h, d), (-w / 2 + t / 2, 0, 0), .0015, "primary", grain="y", feature="frame")
        box("side_right", (t, h, d), (w / 2 - t / 2, 0, 0), .0015, "primary", grain="y", feature="frame")
        box("top", (w - 2 * t + .002, t, d), (0, h - t, 0), .0015, "primary", grain="x", feature="top")
        box("bottom", (w - 2 * t + .002, t, d), (0, 0, 0), .0015, "primary", grain="x", feature="top")
        box("back_panel", (w - 2 * t + .002, h - 2 * t + .002, .008), (0, t - .001, -d / 2 + .004), .001, "paint_milk", feature="frame")
        books(-w / 2 + t + .03, t, .0, w * .42, h - 2 * t - .015, d * .75, seed=3)
        vase("vase", w / 2 - t - .1, t, 0, .05, .14)
        return
    plinth = .06
    box("side_left", (t, h, d), (-w / 2 + t / 2, 0, 0), .0015, "primary", grain="y", feature="frame")
    box("side_right", (t, h, d), (w / 2 - t / 2, 0, 0), .0015, "primary", grain="y", feature="frame")
    box("top", (w - 2 * t + .002, t, d), (0, h - t, 0), .0015, "primary", grain="x", feature="top")
    box("plinth", (w - 2 * t + .002, plinth, t), (0, 0, d / 2 - t / 2 - .01), .0015, "primary", grain="x", feature="base")
    box("back_panel", (w - 2 * t + .002, h - t - plinth, .008), (0, plinth, -d / 2 + .004), .001, "paint_milk", feature="frame")
    levels = 5
    span = (h - t - plinth) / levels
    shelf_y = [plinth + span * i for i in range(levels)]
    for i, y in enumerate(shelf_y):
        box(f"shelf_{i}", (w - 2 * t + .002, t, d - .012), (0, y, .002), .0015, "primary", grain="x", feature="top")
    inner = w - 2 * t
    books(-w / 2 + t + .01, shelf_y[1] + t, 0, inner * .55, span - t - .02, d * .78, seed=5)
    books(w / 2 - t - .01 - inner * .4, shelf_y[3] + t, 0, inner * .4, span - t - .03, d * .78, seed=7)
    books(-w / 2 + t + .02, shelf_y[0] + t, 0, inner * .3, span - t - .03, d * .8, seed=9, lying=True)
    vase("vase", w / 2 - t - .12, shelf_y[1] + t, 0, .06, .2)
    vase("bowl", -w / 2 + t + .14, shelf_y[3] + t, 0, .085, .07, bowl=True)
    books(-w / 2 + t + .25, shelf_y[2] + t, 0, inner * .45, span - t - .05, d * .8, seed=11)


def books(x0, y0, z, length, max_h, depth, seed=0, lying=False):
    rng = np.random.default_rng(seed)
    covers = ["book_sage", "book_sand", "book_clay", "book_ink", "book_cream", "book_olive"]
    if lying:
        y = y0
        for i in range(int(rng.integers(3, 5))):
            th = rng.uniform(.02, .035)
            bw, bd = rng.uniform(.2, .26), rng.uniform(.15, .19)
            rbox(f"book_lying_{seed}_{i}", (bw, th, bd), (x0 + length / 2 + rng.uniform(-.01, .01), y + th / 2, z + rng.uniform(-.01, .01)), .002, covers[int(rng.integers(len(covers)))], feature="decor", rot=(0, rng.uniform(-.06, .06), 0))
            y += th
        return
    x = x0
    i = 0
    while x < x0 + length - .02:
        th = rng.uniform(.016, .042)
        bh = min(max_h, rng.uniform(.16, .26))
        bd = min(depth, rng.uniform(.13, .19))
        rbox(f"book_{seed}_{i}", (th, bh, bd), (x + th / 2, y0 + bh / 2, z + depth / 2 - bd / 2 - .005), .0015, covers[int(rng.integers(len(covers)))], feature="decor")
        x += th + .0005
        i += 1


def vase(name, x, y, z, r, hgt, bowl=False):
    if bowl:
        prof = [(0, 0), (r * .5, 0), (r * .8, hgt * .3), (r, hgt), (r * .93, hgt), (r * .72, hgt * .35), (r * .4, hgt * .1), (0, hgt * .1)]
    else:
        prof = [(0, 0), (r * .7, 0), (r, hgt * .35), (r * .85, hgt * .75), (r * .45, hgt * .92), (r * .5, hgt), (r * .42, hgt), (r * .36, hgt * .85), (0, hgt * .82)]
    lathe(name, prof, (x, y, z), "stoneware", 36, feature="decor")


def kitchen(w, d, h):
    """Base run of 600 mm modules: drawer stack, sink unit and door units, a quartz
    worktop with a real cut-out, inset brushed-steel sink and mixer."""
    plinth, kick = .1, .05
    top_t = .038
    face_t = .019
    body_top = h - top_t
    cd = d - .02 - face_t
    zc = -d / 2 + cd / 2
    t = .018
    modules = int(round(w / .6))
    mw = w / modules
    for i in range(modules + 1):
        x = min(max(-w / 2 + mw * i, -w / 2 + t / 2), w / 2 - t / 2)
        box(f"panel_{i}", (t, body_top - plinth, cd), (x, plinth, zc), .0015, "paint_milk", feature="frame")
    box("bottom", (w - t, t, cd), (0, plinth, zc), .0015, "paint_milk", feature="frame")
    box("back_panel", (w - t, body_top - plinth, .006), (0, plinth, -d / 2 + .003), .001, "paint_milk", feature="frame")
    box("plinth", (w - .004, plinth - .002, t), (0, 0, zc + cd / 2 - kick), .0015, "steel_graphite", feature="base")
    gap = .003
    fronts_y0 = plinth + gap
    fz = d / 2 - .02 - face_t / 2
    for m in range(modules):
        x = -w / 2 + mw * (m + .5)
        fw = mw - gap
        if m == 0:
            heights = [.18, .25, (body_top - fronts_y0 - .43 - 3 * gap)]
            y = body_top - gap
            for k, fh in enumerate(heights):
                box(f"drawer_{m}_{k}", (fw, fh, face_t), (x, y - fh, fz), .002, "primary", grain="x", feature="drawer")
                bar_handle(f"handle_{m}_{k}", x, y - .04, fz + face_t / 2, .22, r=.006, stand=.03)
                y -= fh + gap
        else:
            fh = body_top - fronts_y0 - gap
            box(f"door_{m}", (fw, fh, face_t), (x, fronts_y0, fz), .002, "primary", grain="y", feature="door")
            bar_handle(f"handle_{m}", x + (fw / 2 - .05) * (-1 if m % 2 else 1), body_top - .14, fz + face_t / 2, .2, vertical=True, r=.006, stand=.03)
    sx0, sw_, sd_, szc = -w / 2 + mw * 1.5, .52, .44, .01
    hole, _ = rrect_outline(sw_ - .04, sd_ - .04, .03, 8)
    outer, _ = rrect_outline(w, d, .004, 2)
    panel_curve("worktop", [(p[0], -p[1]) for p in outer], [[(p[0] + sx0, -(p[1] + szc)) for p in hole[::-1]]], top_t, body_top + top_t / 2, "stone", "xz", bevel=.003, feature="top")
    sink_bowl("sink", sx0, h, szc, sw_, sd_, .19, "brushed", rim=.025)
    mixer("mixer", sx0, h, szc - sd_ / 2 - .03, .26, "brushed")


def sink_bowl(name, x, top_y, z, w, d, depth, mat, rim=.02):
    loops = []
    out, on = rrect_outline(w, d, .04, 8)
    loops.append((out + (x, z), on, top_y, (1, 0)))
    loops.append((out - on * .002 + (x, z), on, top_y + .003, (0, 1)))
    inner, inn = rrect_outline(w - 2 * rim, d - 2 * rim, .035, 8)
    loops.append((inner + on * 0 + (x, z), inn, top_y + .003, (0, 1)))
    loops.append((inner + (x, z), inn, top_y - .004, (-1, 0)))
    bottom_o, bn = rrect_outline(w - 2 * rim - .02, d - 2 * rim - .02, .03, 8)
    loops.append((bottom_o + (x, z), bn, top_y - depth + .01, (-1, 0)))
    loops.append((bottom_o - bn * .01 + (x, z), bn, top_y - depth, (0, 1)))
    verts, faces, uvs, norms = loft(name, loops, mat, cap_bottom=False, cap_top=False)
    # bottom of the bowl: fan towards the drain, normal up
    emit(name, *_close_bottom(verts, faces, uvs, norms, len(out), top_y - depth), (mat,), None, True, "basin")
    lathe(name + "_drain", [(0, 0), (.04, 0), (.042, .002), (.03, .003), (0, .003)], (x, top_y - depth - .001, z), "chrome", 24, feature="basin")


def _close_bottom(verts, faces, uvs, norms, M, y):
    verts, norms, uvs = list(verts), list(norms), list(uvs)
    last = len(verts) - (M + 1)
    c = len(verts)
    ring = np.array(verts[last:last + M])
    verts.append((ring[:, 0].mean(), y, ring[:, 2].mean())); norms.append((0, 1, 0)); uvs.append((0, 0))
    for j in range(M):
        faces.append((c, last + (j + 1) % M, last + j))
    verts, norms = np.array(verts), np.array(norms)
    faces = orient_faces(verts, faces, norms)
    return verts, faces, np.array(uvs), norms


def mixer(name, x, deck_y, z, height, mat="chrome", spout=.2, lever=True, direction=(0, 1)):
    dx, dz = direction
    lathe(name + "_base", [(0, 0), (.026, 0), (.027, .006), (.02, .012), (.019, height * .35), (0, height * .35)], (x, deck_y, z), mat, 28, feature="tap")
    end = (x + dx * spout, deck_y + height, z + dz * spout)
    path = fillet([(x, deck_y + height * .3, z), (x, deck_y + height, z), end, (end[0], deck_y + height - .06, end[2])], .05, 8)
    sweep(name + "_spout", path, circle_profile(.011, 16), up=(dz, 0, -dx), mat=mat, feature="tap")
    if lever:
        y1 = deck_y + height * .33
        # single lever on the side of the body
        sx, sz = dz, -dx
        sweep(name + "_lever", fillet([(x, y1, z), (x + sx * .02, y1 + .015, z + sz * .02), (x + sx * .075, y1 + .025, z + sz * .075)], .01, 4), circle_profile(.006, 10), up=(-sz, 0, sx), mat=mat, feature="tap")


# --------------------------------------------------------------------------- bathroom
def vanity(w, d, h):
    """Floor vanity in oak with a ceramic integrated basin top and a chrome mixer."""
    leg_h = .12
    top_t, top_y = .045, h - .045
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(f"leg_{sx}_{sz}", (.03, leg_h + .002, .03), (sx * (w / 2 - .045), 0, sz * (d / 2 - .06)), .004, "oak", grain="y", feature="leg")
    t = .018
    cd = d - .04
    zc = -d / 2 + cd / 2 + .005
    body_h = top_y - leg_h
    box("side_left", (t, body_h, cd), (-w / 2 + .01 + t / 2, leg_h, zc), .0015, "primary", grain="y", feature="frame")
    box("side_right", (t, body_h, cd), (w / 2 - .01 - t / 2, leg_h, zc), .0015, "primary", grain="y", feature="frame")
    box("bottom", (w - .02 - 2 * t + .002, t, cd), (0, leg_h, zc), .0015, "primary", grain="x", feature="frame")
    box("back_panel", (w - .02 - 2 * t + .002, body_h, .008), (0, leg_h, zc - cd / 2 + .004), .001, "primary", grain="y", feature="frame")
    fz = zc + cd / 2 + .009
    box("drawer_front", (w - .026, body_h - .006, .018), (0, leg_h + .003, fz), .002, "primary", grain="x", feature="drawer")
    bar_handle("drawer_handle", 0, top_y - .06, fz + .009, .26, r=.006, mat="chrome")
    # ceramic top: rounded slab with a lofted bowl
    out, on = rrect_outline(w, d, .02, 8)
    bowl_w, bowl_d, depth = w - .14, d - .2, .13
    bz = .03
    ib, inn = rrect_outline(bowl_w, bowl_d, .1, 8)
    M = len(out)
    loops = [(out, on, top_y, (1, 0)), (out - on * .006, on, top_y + top_t - .003, (.7, .7)), (out - on * .012, on, top_y + top_t, (0, 1))]
    loops += [(ib + (0, bz) + inn * .012, inn, top_y + top_t, (0, 1)), (ib + (0, bz), inn, top_y + top_t - .01, (-.7, .7)), (ib * .96 + (0, bz), inn, top_y + top_t - depth * .55, (-.8, .5)), (ib * .78 + (0, bz), inn, top_y + top_t - depth * .95, (-.4, .9)), (ib * .3 + (0, bz), inn, top_y + top_t - depth, (0, 1))]
    verts, faces, uvs, norms = loft("basin_top", loops, "ceramic", cap_bottom=False, cap_top=False)
    v2, f2, uv2, n2 = _close_bottom(verts, faces, uvs, norms, M, top_y + top_t - depth)
    # move the bottom-cap centre onto the drain axis (shifted bowl)
    emit("basin_top", v2, f2, uv2, n2, ("ceramic",), None, True, "basin")
    lathe("drain", [(0, 0), (.019, 0), (.02, .002), (0, .003)], (0, top_y + top_t - depth + .0005, bz), "chrome", 20, feature="basin")
    mixer("mixer", 0, top_y + top_t, -d / 2 + .05, .2, "chrome", spout=.12)


def bath(w, d, h):
    """Built-in acrylic bath: enamelled apron panel, rolled rim, a sloped back rest
    at the head end, flat standing area, drain, overflow and deck mixer."""
    apron_h = h - .04
    # Enamelled apron panels around a hollow frame; the shell hangs inside them.
    pt = .02
    box("apron_front", (w, apron_h, pt), (0, 0, d / 2 - pt / 2 - .002), .004, "primary", feature="frame")
    box("apron_back", (w, apron_h, pt), (0, 0, -d / 2 + pt / 2 + .002), .004, "primary", feature="frame")
    for sx in (-1, 1):
        box(f"apron_end_{sx}", (pt, apron_h, d - 2 * pt - .004), (sx * (w / 2 - pt / 2), 0, 0), .004, "primary", feature="frame")
    def outline(xmin, xmax, depth, radius):
        pts, nrm = rrect_outline(xmax - xmin, depth, radius, 8)
        return pts + ((xmin + xmax) / 2, 0), nrm
    out, on = rrect_outline(w, d, .03, 8)
    lo = h - .045
    loops = [(out, on, lo, (1, 0)), (out - on * .004, on, h - .006, (.7, .7)), (out - on * .012, on, h, (0, 1))]
    ib, inn = outline(-w / 2 + .065, w / 2 - .065, d - .14, .14)
    loops += [(ib + inn * .012, inn, h, (0, 1)), (ib, inn, h - .012, (-.7, .7))]
    for xmin, xmax, dep, y, pn in ((-w / 2 + .11, w / 2 - .075, d - .17, h - .18, (-.95, .2)), (-w / 2 + .26, w / 2 - .085, d - .22, h - .36, (-.9, .3)), (-w / 2 + .42, w / 2 - .1, d - .28, .1, (-.6, .75))):
        pts, n2 = outline(xmin, xmax, dep, .14)
        loops.append((pts, n2, y, pn))
    bot, bn = outline(-w / 2 + .47, w / 2 - .13, d - .33, .12)
    loops.append((bot, bn, .07, (0, 1)))
    verts, faces, uvs, norms = loft("bath_shell", loops, "enamel_white", cap_bottom=False, cap_top=False)
    v2, f2, uv2, n2 = _close_bottom(verts, faces, uvs, norms, len(out), .07)
    emit("bath_shell", v2, f2, uv2, n2, ("enamel_white",), None, True, "basin")
    lathe("drain", [(0, 0), (.035, 0), (.036, .002), (0, .003)], (w / 2 - .22, .0705, 0), "chrome", 24, feature="basin")
    lathe("overflow", [(0, 0), (.032, 0), (.032, .004), (.028, .008), (0, .008)], (w / 2 - .077, h - .12, 0), "chrome", 24, rot=(0, 0, math.pi / 2), feature="basin")
    mixer("mixer", w / 2 - .032, h, 0, .14, "chrome", spout=.09, direction=(-1, 0))


def toilet(w, d, h):
    """Close-coupled toilet: lofted ceramic bowl and foot, seat and closed lid,
    cistern with dual flush button."""
    rim_y = .405
    zf = d / 2
    bowl_len = d - .1
    cz = zf - bowl_len / 2
    def oval(wid, length, n=40, back_flat=.35):
        a = np.linspace(0, 2 * np.pi, n, endpoint=False)
        x = np.cos(a) * wid / 2
        z = np.sin(a) * length / 2
        # egg shape: narrower towards the front (+z)
        x *= 1 - .18 * np.clip(np.sin(a), 0, 1) ** 2
        z = np.where(np.sin(a) < 0, z * (1 - back_flat * np.cos(a) ** 8), z)
        pts = np.column_stack((x, z))
        nrm = np.gradient(pts, axis=0)
        nrm = np.column_stack((nrm[:, 1], -nrm[:, 0]))
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        if np.mean(np.sum(nrm * pts, axis=1)) < 0:
            nrm = -nrm
        return pts, nrm
    loops = []
    for k, (wid, length, y, pn, zoff) in enumerate(((.21, .32, 0, (.6, -.8), -.06), (.2, .3, .02, (1, 0), -.06), (.19, .3, .12, (1, 0), -.04), (.26, .4, .27, (.8, .3), -.01), (w - .01, bowl_len, rim_y - .02, (.6, .8), 0), (w - .025, bowl_len - .015, rim_y, (0, 1), 0))):
        pts, nrm = oval(wid, length)
        loops.append((pts + (0, cz + zoff), nrm, y, pn))
    verts, faces, uvs, norms = loft("bowl", loops, "primary", cap_bottom=True, cap_top=True)
    emit("bowl", verts, faces, uvs, norms, ("primary",), None, True, "basin")
    # seat ring and closed lid
    pts, nrm = oval(w - .03, bowl_len - .03)
    seat = [(pts + (0, cz + .005), nrm, rim_y + .002, (1, 0)), (pts * .985 + (0, cz + .005), nrm, rim_y + .022, (.5, .85)), (pts * .9 + (0, cz + .005), nrm, rim_y + .024, (0, 1))]
    verts, faces, uvs, norms = loft("seat", seat, "plastic_white", cap_bottom=True, cap_top=True)
    emit("seat", verts, faces, uvs, norms, ("plastic_white",), None, True, "seat")
    lid = [(pts * .99 + (0, cz + .005), nrm, rim_y + .025, (1, 0)), (pts * .97 + (0, cz + .005), nrm, rim_y + .045, (.6, .8)), (pts * .75 + (0, cz + .005), nrm, rim_y + .055, (.15, .99)), (pts * .2 + (0, cz + .005), nrm, rim_y + .058, (0, 1))]
    verts, faces, uvs, norms = loft("lid", lid, "plastic_white", cap_bottom=True, cap_top=True)
    emit("lid", verts, faces, uvs, norms, ("plastic_white",), None, True, "seat")
    # cistern, resting on the rear deck of the bowl
    ct = .17
    cz0 = -d / 2 + ct / 2
    rbox("cistern", (w * .9, h - rim_y - .012, ct), (0, rim_y + (h - rim_y - .012) / 2 - .002, cz0), .03, "primary", seg=(4, 4, 2), K=5, feature="tank")
    rbox("cistern_lid", (w * .92, .02, ct + .01), (0, h - .01, cz0), .009, "primary", seg=(3, 1, 2), K=3, feature="tank")
    box("deck", (w * .7, .03, .12), (0, rim_y - .028, -d / 2 + .1), .01, "primary", feature="tank")
    lathe("flush_button", [(0, 0), (.026, 0), (.026, .003), (.024, .005), (0, .005)], (0, h, cz0), "chrome", 32, feature="tank")
    box("flush_split", (.002, .0015, .046), (0, h + .005, cz0), .0005, "rubber", collision=False, feature="seam")
    lathe("hinge_l", [(0, 0), (.009, 0), (.009, .03), (0, .03)], (-.06, rim_y + .03, -d / 2 + ct + .02), "chrome", 16, rot=(0, 0, math.pi / 2), feature="seat")
    lathe("hinge_r", [(0, 0), (.009, 0), (.009, .03), (0, .03)], (.09, rim_y + .03, -d / 2 + ct + .02), "chrome", 16, rot=(0, 0, math.pi / 2), feature="seat")


# --------------------------------------------------------------------------- appliances
def fridge(w, d, h):
    """Bottom-freezer fridge: enamelled cabinet, two thick doors with gaskets and
    5 mm gaps, brushed bar handles on posts, display, ventilation grille."""
    door_t, stand, hr = .06, .03, .0085
    door_front = d / 2 - stand - hr
    body_front = door_front - door_t - .002
    body_d = body_front + d / 2
    zc = -d / 2 + body_d / 2
    rbox("body", (w, h, body_d), (0, h / 2, zc), .012, "primary", seg=(1, 2, 1), feature="body")
    box("plinth_grille", (w - .03, .06, .006), (0, .012, body_front), .002, "steel_graphite", feature="body")
    for k in range(5):
        box(f"grille_slot_{k}", (w - .1, .004, .002), (0, .022 + k * .009, body_front + .003), .0008, "rubber", collision=False, feature="seam")
    gap = .005
    fz = body_front + .002 + door_t / 2
    doors = (("door_freezer", .075, .7), ("door_fridge", .075 + .7 + gap, h - .075 - .7 - gap - .004))
    for name, y0, hh in doors:
        rbox(name, (w - .004, hh, door_t), (0, y0 + hh / 2, fz), .014, "primary", seg=(1, 2, 1), K=3, feature="door")
        box(name + "_gasket", (w - .02, hh - .016, .005), (0, y0 + .008, body_front + .0005), .002, "rubber", feature="door")
        bar_handle(name + "_handle", w / 2 - .045, y0 + hh * (.8 if "freezer" in name else .3), door_front, min(.3, hh * .45), vertical=True, mat="brushed", r=hr, stand=stand)
    rbox("display", (.09, .04, .004), (w / 2 - .15, doors[1][1] + doors[1][2] * .84, door_front + .001), .002, "display", feature="control")


def washer(w, d, h):
    """Front-loading washer: chrome porthole bezel, convex dark glass, control panel
    with detergent drawer, display and program knob, service hatch."""
    fz = d / 2 - .05
    body_d = fz + d / 2
    zc = -d / 2 + body_d / 2
    rbox("body", (w, h - .02, body_d), (0, (h - .02) / 2, zc), .012, "primary", seg=(1, 2, 1), feature="body")
    rbox("top_panel", (w, .02, body_d + .005), (0, h - .01, zc + .0025), .006, "primary", seg=(1, 1, 1), feature="top")
    box("control_panel", (w - .01, .11, .018), (0, h - .02 - .115, fz + .002), .006, "enamel_white", feature="control")
    box("detergent_drawer", (.18, .085, .02), (-w / 2 + .11, h - .02 - .105, fz + .01), .006, "plastic_white", feature="control")
    box("drawer_grip", (.12, .012, .004), (-w / 2 + .11, h - .02 - .1, fz + .02), .002, "rubber", collision=False, feature="seam")
    rbox("display", (.12, .045, .004), (.04, h - .02 - .06, fz + .012), .003, "display", feature="control")
    knob("program_knob", w / 2 - .09, h - .02 - .06, fz + .011, .028, .025, "chrome")
    cy = .4
    ring = [(.236, 0), (.236, .012), (.23, .028), (.215, .036), (.19, .036), (.18, .03), (.178, .02), (.2, .015), (.2, 0)]
    lathe("door_bezel", ring, (0, cy, fz + .002), "chrome", 64, rot=(math.pi / 2, 0, 0), closed_profile=True, feature="door")
    lathe("door_glass", [(0, .048), (.09, .044), (.15, .034), (.182, .022), (.182, .018), (0, .018)], (0, cy, fz), "glass_dark", 48, rot=(math.pi / 2, 0, 0), feature="door")
    lathe("drum_gasket", [(.2, 0), (.2, .002), (.17, .006), (0, .006)], (0, cy, fz - .002), "rubber", 48, rot=(math.pi / 2, 0, 0), feature="door")
    box("door_handle", (.035, .1, .025), (.215, cy - .05, fz + .014), .008, "plastic_white", feature="door")
    box("service_hatch", (.14, .07, .006), (-w / 2 + .1, .03, fz + .002), .006, "enamel_white", feature="body")
    box("kick", (w - .01, .02, .006), (0, 0, fz - .001), .002, "steel_graphite", feature="body")


def stove(w, d, h):
    """Freestanding gas cooker: brushed hob with four burners under two cast iron
    grates, control knobs, glass oven door with bar handle, storage drawer."""
    door_front = d / 2 - .048
    fz = door_front - .03
    body_d = fz + d / 2
    zc = -d / 2 + body_d / 2
    hob_y = h - .051
    rbox("body", (w, hob_y, body_d), (0, hob_y / 2, zc), .01, "primary", seg=(1, 2, 1), feature="body")
    slab("hob", w, body_d + .004, .008, .012, .003, (0, hob_y, zc + .002), "brushed", grain="x", feature="top")
    hob_top = hob_y + .008
    burners = [(-.14, -.11, .05), (.14, -.11, .04), (-.14, .12, .04), (.14, .12, .035)]
    for i, (x, z, r) in enumerate(burners):
        lathe(f"burner_{i}", [(0, 0), (r * 1.5, 0), (r * 1.5, .003), (r * 1.05, .008), (r, .016), (r * .98, .02), (0, .02)], (x, hob_top, z + zc), "steel_graphite", 32, feature="burner")
        lathe(f"burner_cap_{i}", [(0, 0), (r * .95, 0), (r * .92, .006), (r * .6, .009), (0, .01)], (x, hob_top + .02, z + zc), "steel_black", 32, feature="burner")
    grate_y = h - .005
    gd = body_d - .04
    for gx in (-1, 1):
        x0 = gx * w / 4
        gw = w / 2 - .02
        loop = fillet([(x0 - gw / 2, grate_y, zc - gd / 2), (x0 + gw / 2, grate_y, zc - gd / 2), (x0 + gw / 2, grate_y, zc + gd / 2), (x0 - gw / 2, grate_y, zc + gd / 2)], .02, 4, closed=True)
        sweep(f"grate_frame_{gx}", loop, rrect_profile(.012, .01, .003, 2), mat="steel_black", closed=True, feature="grate")
        sweep(f"grate_bar_{gx}", [(x0 - gw / 2 + .004, grate_y, zc), (x0 + gw / 2 - .004, grate_y, zc)], rrect_profile(.01, .01, .003, 2), mat="steel_black", feature="grate")
        for i, (bx, bz, r) in enumerate(burners):
            if np.sign(bx) != gx:
                continue
            bz += zc
            edge_z = zc - gd / 2 + .004 if bz < zc else zc + gd / 2 - .004
            for k, (ex, ez) in enumerate(((x0 - gw / 2 + .004, bz), (x0 + gw / 2 - .004, bz), (bx, edge_z), (bx, zc))):
                direction = np.array((ex - bx, ez - bz)); direction /= np.linalg.norm(direction)
                start = (bx + direction[0] * .032, grate_y, bz + direction[1] * .032)
                sweep(f"grate_finger_{i}_{k}", [start, (ex, grate_y, ez)], rrect_profile(.009, .01, .003, 2), mat="steel_black", feature="grate")
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(f"grate_foot_{gx}_{sx}_{sz}", (.012, grate_y - hob_top, .012), (x0 + sx * (gw / 2 - .01), hob_top, zc + sz * (gd / 2 - .01)), .003, "rubber", feature="grate")
    panel_y = hob_y - .06
    box("control_strip", (w - .02, .08, .006), (0, panel_y - .04, fz), .003, "brushed", feature="control")
    for i in range(5):
        knob(f"knob_{i}", -w / 2 + .07 + i * (w - .14) / 4, panel_y, fz + .003, .019, .026, "steel_black")
    door_top, door_bottom = panel_y - .055, .16
    rbox("oven_door", (w - .01, door_top - door_bottom, .03), (0, (door_top + door_bottom) / 2, fz + .015), .01, "primary", seg=(1, 1, 1), feature="door")
    rbox("oven_glass", (w - .1, (door_top - door_bottom) * .62, .004), (0, (door_top + door_bottom) / 2 - .02, door_front + .001), .008, "glass_dark", feature="door")
    bar_handle("oven_handle", 0, door_top - .04, door_front, w - .14, mat="brushed", r=.008, stand=.04)
    box("drawer", (w - .01, door_bottom - .035, .02), (0, .03, fz + .01), .004, "primary", feature="drawer")
    box("drawer_grip", (w * .5, .012, .006), (0, door_bottom - .035, fz + .023), .002, "steel_graphite", feature="handle")
    box("plinth", (w - .03, .03, .02), (0, 0, fz - .03), .002, "steel_graphite", feature="base")


# --------------------------------------------------------------------------- decor
def lamp(w, d, h):
    """Floor lamp: weighted metal base, brass stem, linen drum shade with real
    wall thickness, spider and socket."""
    base_r = .14
    lathe("base", [(0, 0), (base_r - .004, 0), (base_r, .004), (base_r, .018), (base_r - .006, .026), (.03, .028), (0, .03)], (0, 0, 0), "steel_graphite", 64, feature="base")
    shade_h, r_bot, r_top = .3, w / 2, w / 2 * .86
    shade_y0 = h - shade_h
    stem_top = shade_y0 + shade_h * .62
    lathe("stem", [(0, .028), (.0095, .028), (.0095, stem_top - .01), (.0095, stem_top), (0, stem_top)], (0, 0, 0), "brass", 24, feature="stem")
    lathe("socket", [(0, 0), (.02, 0), (.02, .055), (.017, .06), (0, .06)], (0, stem_top, 0), "brass", 24, feature="stem")
    lathe("bulb", [(0, 0), (.012, 0), (.03, .03), (.032, .05), (.025, .075), (0, .085)], (0, stem_top + .06, 0), "bulb", 24, collision=False, feature="bulb")
    th = .003
    prof = [(r_bot - th, shade_y0), (r_bot + .0005, shade_y0), (r_bot + .001, shade_y0 + .004), (r_top + .001, h - .004), (r_top + .0005, h), (r_top - th, h), (r_top - th, h - .004), (r_bot - th, shade_y0 + .004)]
    lathe("shade", prof, (0, 0, 0), "primary", 72, closed_profile=True, feature="shade")
    ring_y = shade_y0 + shade_h * .64
    ring_r = r_bot - th - (r_bot - r_top) * .64 - .002
    sweep("spider_ring", [(ring_r * math.cos(a), ring_y, ring_r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 48, endpoint=False)], circle_profile(.002, 8), mat="brass", closed=True, feature="support")
    for k in range(3):
        a = k * 2 * math.pi / 3 + .3
        sweep(f"spider_arm_{k}", [(0.016 * math.cos(a), stem_top + .045, .016 * math.sin(a)), (ring_r * math.cos(a), ring_y, ring_r * math.sin(a))], circle_profile(.0018, 8), mat="brass", feature="support")


def plant(w, d, h):
    """Fiddle-leaf fig in a stoneware pot: trunk, five branches and ~40 individually
    shaped leaves of varying size, direction and droop."""
    rng = np.random.default_rng(23)
    pot_h, pot_r = .3, .15
    lathe("pot", [(0, 0), (pot_r * .78, 0), (pot_r * .8, .006), (pot_r, pot_h * .55), (pot_r * .99, pot_h), (pot_r * .93, pot_h), (pot_r * .9, pot_h - .03), (0, pot_h - .03)], (0, 0, 0), "primary", 48, feature="pot")
    lathe("soil", [(0, 0), (pot_r * .9 - .002, 0), (pot_r * .9 - .002, .006), (0, .012)], (0, pot_h - .036, 0), "soil", 36, feature="soil")
    soil_y = pot_h - .024
    sweep("trunk", [(0, soil_y - .01, 0), (.008, .45, .004), (-.006, .6, .008), (.003, .74, -.003)], circle_profile(.011, 10), mat="bark", feature="stem")
    nodes = [(np.array((0, y, 0)), None) for y in np.linspace(.4, .72, 7)]
    for k in range(5):
        ang = k * 2 * math.pi / 5 + .4
        a = np.array((0, .5 + k * .045, 0))
        b = a + np.array((math.cos(ang) * .1, .13 + .02 * (k % 2), math.sin(ang) * .1))
        mid = (a + b) / 2 + np.array((0, .02, 0))
        sweep(f"branch_{k}", [a, mid, b], circle_profile(.006, 8), mat="bark", feature="stem")
        nodes += [(a + (b - a) * t, b - a) for t in (.35, .6, .85, 1.0)]
    leaves = 0
    for node, direction in nodes:
        for c in range(2 if direction is None else 1):
            base = rng.uniform(0, 2 * math.pi) if direction is None else math.atan2(direction[2], direction[0])
            ang = base + (c * math.pi if direction is None else rng.uniform(-.9, .9))
            length = rng.uniform(.15, .22)
            leaf(f"leaf_{leaves}", node, ang, rng.uniform(.15, .85), length, length * rng.uniform(.55, .66), rng)
            leaves += 1
    fit_foliage(w, d, h, soil_y)


def fit_foliage(w, d, h, soil_y):
    """Fit the canopy into the catalogue envelope without touching the pot."""
    objs = [o for o in C.OBJECTS if o.name.startswith(("leaf_", "branch_", "trunk"))]
    pts = np.concatenate([object_points(o) for o in objs])
    fx = ((w / 2) / max(pts[:, 0].max(), 1e-3), (w / 2) / max(-pts[:, 0].min(), 1e-3))
    fz = ((d / 2) / max(pts[:, 2].max(), 1e-3), (d / 2) / max(-pts[:, 2].min(), 1e-3))
    fy = (h - soil_y) / (pts[:, 1].max() - soil_y)
    print("ROOMFIT_FOLIAGE_FIT", fx, fz, fy)
    for o in objs:
        P = object_points(o)
        P[:, 0] = np.where(P[:, 0] > 0, P[:, 0] * fx[0], P[:, 0] * fx[1])
        P[:, 2] = np.where(P[:, 2] > 0, P[:, 2] * fz[0], P[:, 2] * fz[1])
        P[:, 1] = np.where(P[:, 1] > soil_y, soil_y + (P[:, 1] - soil_y) * fy, P[:, 1])
        o.data.vertices.foreach_set("co", np.column_stack((P[:, 0], -P[:, 2], P[:, 1])).reshape(-1))
        o.data.update()


def leaf(name, node, ang, rise, length, width, rng):
    """Fiddle-leaf shaped blade with petiole, folded midrib, lengthwise arc and twist."""
    pet = .035
    dirv = np.array((math.cos(ang) * math.cos(rise), math.sin(rise), math.sin(ang) * math.cos(rise)))
    base = np.array(node) + dirv * pet
    sweep(name + "_petiole", [np.array(node), (np.array(node) + base) / 2 + np.array((0, .006, 0)), base], circle_profile(.0028, 6), mat="leaf", feature="stem")
    nu, nv = 14, 7
    side = np.cross(dirv, (0, 1, 0)); side /= np.linalg.norm(side) + 1e-9
    upv = np.cross(side, dirv)
    droop = rng.uniform(.25, .7)
    twist = rng.uniform(-.25, .25)
    fold = rng.uniform(.18, .32)
    verts, uvs = [], []
    for i in range(nu + 1):
        t = i / nu
        # fiddle shape: wide near the tip, narrowing towards the base
        half = width / 2 * (np.sin(np.pi * min(1, t * 1.05)) ** .8) * (.55 + .6 * t) * (1 - .15 * np.exp(-((t - .35) / .12) ** 2))
        bend = -droop * t * t * length * .5
        for j in range(nv + 1):
            s = j / nv * 2 - 1
            wv = s * half
            lift = abs(s) * half * fold + .01 * math.sin(s * 3 + t * 6) * half
            ca, sa = math.cos(twist * t), math.sin(twist * t)
            sv = side * ca + upv * sa
            uvv = upv * ca - side * sa
            p = base + dirv * (t * length) + uvv * (bend + lift) + sv * wv
            verts.append(p)
            uvs.append((t, (s + 1) / 2))
    faces = grid_faces(nu + 1, nv + 1)
    V = np.array(verts)
    N = surface_normals(V.reshape(nu + 1, nv + 1, 3)).reshape(-1, 3)
    if np.mean(N[:, 1]) < 0:
        N = -N
    faces = orient_faces(V, faces, N)
    emit(name, V, faces, np.array(uvs), N, ("leaf",), None, True, "leaf")


def rug(w, d, h):
    """Low-pile rug: field with a bound edge and knotted fringe on the short ends."""
    fringe = .05
    bw = w - 2 * fringe
    pile = h - .002
    rbox("rug_field", (bw - .045, pile, d - .045), (0, pile / 2, 0), .002, "primary", seg=(1, 1, 1), feature="rug")
    loop, _ = rrect_outline(bw - .025, d - .025, .012, 4)
    sweep("rug_binding", [(p[0], h / 2 - .0003, p[1]) for p in loop], rrect_profile(.026, h - .0006, .0035, 2), up=(0, 1, 0), mat="linen_beige", closed=True, feature="rug")
    rng = np.random.default_rng(31)
    n = int((d - .06) / .022)
    for sx in (-1, 1):
        for i in range(n):
            z = -d / 2 + .03 + i * (d - .06) / (n - 1)
            x0 = sx * (bw / 2 - .006)
            x1 = sx * (bw / 2 + fringe * rng.uniform(.82, 1))
            dz = rng.uniform(-.006, .006)
            sweep(f"fringe_{sx}_{i}", [(x0, .0022, z), ((x0 + x1) / 2, .0021, z + dz * .5), (x1, .0021, z + dz)], circle_profile(.0021, 6), up=(0, 1, 0), mat="linen_beige", feature="rug")


# --------------------------------------------------------------------------- dispatch
def build(spec):
    global SPEC
    SPEC = spec
    w, d, h = (spec["dimensions"][k] / 1000 for k in ("width_mm", "depth_mm", "height_mm"))
    a = spec["asset_id"]
    table_ = {
        "bed-double": bed_double, "bed-single": bed_single, "bed-kids": bed_kids,
        "chair": chair, "table": table, "desk": desk, "coffee": coffee,
        "wardrobe": wardrobe, "kitchen": kitchen, "sink": vanity, "bath": bath, "toilet": toilet,
        "fridge": fridge, "washer": washer, "stove": stove, "lamp": lamp, "plant": plant, "rug": rug,
    }
    if a in table_:
        table_[a](w, d, h)
    elif a in ("sofa", "sofa-small", "armchair"):
        sofa_family(w, d, h, a)
    elif a == "sofa-corner":
        sofa_corner(w, d, h)
    elif a == "dresser":
        chest(w, d, h, 3, .16, "dresser")
    elif a == "nightstand":
        chest(w, d, h, 1, .14, "nightstand")
    elif a in ("shelf", "wall-shelf"):
        bookcase(w, d, h, a)
    else:
        raise ValueError("No studio generator for " + a)
    material("primary")


def setup(spec):
    global SPEC
    SPEC = spec
    C.MATERIALS = {}
    C.material = lambda name, color, roughness=.7, metalness=0, weave=False: material(name)


if __name__ == "__main__":
    spec = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
    SPEC = spec
    C.build = build
    C.STUDIO = True
    C.main()
