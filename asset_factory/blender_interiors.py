"""Reference-inspired interior furniture. Physical construction and portable PBR maps.

No photograph is used as a billboard. The common authoring pipeline renders every
2D finish from these very meshes and exports their materials and textures to GLB.
"""
import sys, math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_generate as C

TEXTURES = {}
MATERIAL_PROFILE = None


def texture_image(name, values, color_space="Non-Color"):
    height, width = values.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height)
    image.colorspace_settings.name = color_space
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = values[:, :, None] if values.ndim == 2 else values
    image.pixels.foreach_set(rgba.reshape(-1))
    image.pack()
    return image


def texture_set(kind):
    if kind in TEXTURES:
        return TEXTURES[kind]
    size = 512 if kind == "wood" else 256
    y, x = np.mgrid[0:size, 0:size] / size
    rng = np.random.default_rng({"wood": 92, "fabric": 43, "stone": 71}[kind])
    noise = rng.normal(0, .006, (size, size))
    if kind == "wood":
        # Continuous grain with uneven growth rings and two restrained natural knots.
        warped = x + .008 * np.sin(y * 2 * np.pi) + .0012 * np.sin(y * 10 * np.pi)
        grain = .021 * np.sin(warped * 86 * np.pi) + .008 * np.sin(warped * 226 * np.pi)
        knot = np.zeros_like(x)
        for cx, cy in ((.28, .34), (.73, .77)):
            r = np.sqrt(((x - cx) * 1.6) ** 2 + ((y - cy) * .57) ** 2)
            knot += .018 * np.cos(r * 190) * np.exp(-r * 16)
        level = np.clip(.87 + grain + knot + noise, .65, .98)
        relief = grain * .32 + knot * .3 + noise * .15
        roughness = np.clip(.87 + grain * .6 + noise, .72, .98)
    elif kind == "fabric":
        warp = np.sin(x * 128 * np.pi)
        weft = np.sin(y * 128 * np.pi)
        level = np.clip(.945 + .019 * warp * weft + noise, .87, .995)
        relief = (warp + weft) * .016 + noise * .3
        roughness = np.clip(.93 + noise * 2 + .025 * warp * weft, .8, 1)
    else:
        vein = np.sin((x + .25 * np.sin(y * 6)) * 17) ** 12
        level = np.clip(.965 - vein * .07 + noise * .5, .86, .99)
        relief = noise * .05
        roughness = np.clip(.93 + noise, .87, .97)
    gy, gx = np.gradient(relief)
    nx, ny = -gx * 14, -gy * 14
    length = np.sqrt(nx * nx + ny * ny + 1)
    normal = np.stack((nx / length * .5 + .5, ny / length * .5 + .5, 1 / length * .5 + .5), axis=2)
    # Color textures store sRGB; Blender and glTF decode them before the tint multiply.
    srgb = np.where(level <= .0031308, level * 12.92, 1.055 * level ** (1 / 2.4) - .055)
    result = (texture_image(kind + "_albedo", srgb, "sRGB"), texture_image(kind + "_normal", normal), texture_image(kind + "_roughness", roughness))
    TEXTURES[kind] = result
    return result


def material(name, color, roughness=.7, metalness=0, weave=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = C.rgb(color)
    mat["slot"] = "primary" if name == "primary" else name
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = C.rgb(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    kind = "wood" if weave == "wood" else "fabric" if weave else None
    if name == "primary" and MATERIAL_PROFILE in ("table", "coffee", "desk", "wardrobe", "dresser", "nightstand", "shelf", "kitchen", "wall-shelf"):
        kind = "wood"
    if name == "primary" and MATERIAL_PROFILE in ("bath", "sink", "toilet", "fridge", "washer", "stove"):
        kind = None
    if name == "linen" and MATERIAL_PROFILE in ("bath", "sink", "toilet", "fridge", "washer", "stove"):
        kind = None
        bsdf.inputs["Roughness"].default_value = .28
    if name == "primary" and MATERIAL_PROFILE == "lamp":
        kind = "fabric"
    if kind:
        mat["texture_kind"] = kind
        albedo, normal, rough = texture_set(kind)
        image = nodes.new("ShaderNodeTexImage")
        image.image = albedo
        tint = nodes.new("ShaderNodeMix")
        tint.name = "RoomFit tint"
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1
        tint.inputs[6].default_value = C.rgb(color)
        links.new(image.outputs["Color"], tint.inputs[7])
        links.new(tint.outputs[2], bsdf.inputs["Base Color"])
        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.image = normal
        bump = nodes.new("ShaderNodeNormalMap")
        bump.inputs["Strength"].default_value = .4 if kind == "fabric" else .27
        links.new(normal_tex.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        rough_tex = nodes.new("ShaderNodeTexImage")
        rough_tex.image = rough
        multiply = nodes.new("ShaderNodeMath")
        multiply.name = "RoomFit roughness"
        multiply.operation = "MULTIPLY"
        multiply.inputs[1].default_value = roughness
        links.new(rough_tex.outputs["Color"], multiply.inputs[0])
        links.new(multiply.outputs[0], bsdf.inputs["Roughness"])
    if kind == "fabric":
        # glTF exports the sheen tint, not Blender's separate weight. Encode the
        # same restrained sheen in the tint, with weight=1, for both renderers.
        bsdf.inputs["Sheen Weight"].default_value = 1
        bsdf.inputs["Sheen Tint"].default_value = (.16, .16, .16, 1)
        bsdf.inputs["Sheen Roughness"].default_value = .7
    if name == "glass":
        bsdf.inputs["Coat Weight"].default_value = .55
        bsdf.inputs["Coat Roughness"].default_value = .09
    return mat


def register(obj, name, mat="primary", collision=True, feature=None):
    obj.name = name
    obj.data.materials.append(C.MATERIALS[mat])
    obj["collision"] = collision
    obj["feature"] = feature or name.split("_")[0]
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    # Metric UVs keep fabric weave and wood grain at a consistent physical scale.
    uv = obj.data.uv_layers.new(name="Surface")
    tile = .28 if C.MATERIALS[mat].get("texture_kind") == "fabric" else .85
    for poly in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        for index in poly.loop_indices:
            p = obj.data.vertices[obj.data.loops[index].vertex_index].co
            wood_top = axis == 2 and C.MATERIALS[mat].get("texture_kind") == "wood"
            uv.data[index].uv = (p.y / tile, p.x / tile) if wood_top else (p.x / tile, p.y / tile) if axis == 2 else (p.x / tile, p.z / tile) if axis == 1 else (p.y / tile, p.z / tile)
    C.OBJECTS.append(obj)
    return obj


def finish(obj, name, mat, bevel=0, collision=True, feature=None):
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 5
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Weighted normals belong on manufactured panels, not on sculpted fabric.
    if bevel:
        for p in obj.data.polygons:
            p.use_smooth = True
        modifier = obj.modifiers.new("Panel normals", "WEIGHTED_NORMAL")
        modifier.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return register(obj, name, mat, collision, feature)


def mesh(name, vertices, faces, mat="primary", collision=True, feature=None):
    data = bpy.data.meshes.new(name)
    # Authoring coordinates: width X / height Y / front Z; Blender uses X/-Z/Y.
    data.from_pydata([(x, -z, y) for x, y, z in vertices], [], [list(reversed(face)) for face in faces])
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return register(obj, name, mat, collision, feature)


def tube(name, points, radius=.004, mat="stitch", collision=False, closed=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    spline.use_cyclic_u = closed
    for node, (x, y, z) in zip(spline.points, points):
        node.co = (x, -z, y, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return register(bpy.context.object, name, mat, collision, "seam" if not collision else None)


def rounded_loop(w, d, radius=.025, n=6):
    result = []
    radius = min(radius, w / 2, d / 2)
    for x, z, start in ((w/2-radius, d/2-radius, 0), (-w/2+radius, d/2-radius, 90), (-w/2+radius, -d/2+radius, 180), (w/2-radius, -d/2+radius, 270)):
        for i in range(n + 1):
            a = math.radians(start + i * 90 / n)
            result.append((x + radius * math.cos(a), z + radius * math.sin(a)))
    return result


def edge_seam(name, w, d, x, y, z, radius=.03, mat="stitch"):
    return tube(name, [(x+px, y, z+pz) for px, pz in rounded_loop(w, d, radius)], .0017, mat, False, True)


def pillow(name, size, pos, mat="primary", rotation=0, exponent=.52):
    w, h, d = size
    px, py, pz = pos
    nu, nv = 32, 16
    vertices, faces = [], []
    power = lambda v, p: math.copysign(abs(v) ** p, v)
    for j in range(nv + 1):
        v = -math.pi / 2 + math.pi * j / nv
        for i in range(nu):
            u = 2 * math.pi * i / nu
            x = w/2 * power(math.cos(v), exponent) * power(math.cos(u), exponent)
            z = d/2 * power(math.cos(v), exponent) * power(math.sin(u), exponent)
            y = h/2 * power(math.sin(v), .75)
            # Broad cloth compression and shallow creases, never a displaced box.
            y += h*.032*math.sin(x/max(w,.01)*24+z/max(d,.01)*9)*abs(math.sin(v))**2
            rx, rz = x*math.cos(rotation)-z*math.sin(rotation), x*math.sin(rotation)+z*math.cos(rotation)
            vertices.append((px+rx, py+y, pz+rz))
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i; b=j*nu+(i+1)%nu
            faces.append((a,b,b+nu,a+nu))
    return mesh(name, vertices, faces, mat)


def leg(name, top, bottom, radius=.022, mat="wood", top_radius=None):
    a, b = Vector((bottom[0], -bottom[2], bottom[1])), Vector((top[0], -top[2], top[1]))
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=top_radius or radius*.85, depth=(b-a).length, location=(a+b)/2)
    obj=bpy.context.object
    obj.rotation_euler=(b-a).to_track_quat("Z","Y").to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,mat,min(radius*.15,.004))


def legs(w,d,height,inset=.12,mat="wood",splay=.02,radius=.024):
    for sx in (-1,1):
        for sz in (-1,1):
            x,z=sx*w*(.5-inset),sz*d*(.5-inset)
            leg(f"leg_{sx}_{sz}",(x,height,z),(x+sx*splay,0,z+sz*splay),radius,mat)


def blanket_surface(x,z,w,d,h):
    a=abs(x)/(w*.945/2)
    b=abs(z-d*.018)/(d*.93/2)
    squared=a**(2/.24)+b**(2/.24)
    upper=max(0,1-squared)**.375
    mattress=h*.43+h*.09*upper
    mattress += h*.18*.032*math.sin(x/(w*.945)*24+(z-d*.018)/(d*.93)*9)*max(0,1-squared)
    outside=max(0,squared**(.24/2)-1)
    drape=h*.10*min(1,outside/.06)
    u=x/(w*.985)+.5
    v=(z/d+.19)/.685
    folds=(.009*math.sin(u*19+v*8)+.004*math.sin(u*45-v*24))*max(0,math.sin(math.pi*u))**.6*(.35+.65*v)+.013
    return mattress-drape+.008+folds


def cloth_grid(name,w,d,h,depth_start,depth_length,width,thickness,offset,mat,nx=36,nz=40):
    verts,faces=[],[]
    for layer in (0,1):
        for j in range(nz+1):
            z=depth_start+j/nz*depth_length
            for i in range(nx+1):
                x=(i/nx-.5)*width
                y=blanket_surface(x,z,w,d,h)+offset-(thickness if layer else 0)
                verts.append((x,y,z))
    count=(nx+1)*(nz+1)
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i
            faces.append((a,a+1,a+nx+2,a+nx+1))
            faces.append((a+count,a+nx+1+count,a+nx+2+count,a+1+count))
    border=[i for i in range(nx+1)]+[j*(nx+1)+nx for j in range(1,nz+1)]+[nz*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(nz-1,0,-1)]
    for a,b in zip(border,border[1:]+border[:1]):
        faces.append((a,a+count,b+count,b))
    mesh(name,verts,faces,mat,True,"quilt")
    tube(name+"_piping",[verts[i] for i in border],.0017,"stitch",False,True)


def quilt(w,d,h):
    # A continuous closed blanket drapes over both sides and the foot of the mattress.
    cloth_grid("quilt_draped",w,d,h,-d*.19,d*.685,w*.985,.004,0,"primary")
    # Folded throw with flowing hem; its shape is also present in the top render.
    cloth_grid("throw_fold",w,d,h,d*.005,d*.15,w*.965,.012,.014,"linen",32,8)


def bed(w,d,h,asset_id):
    upholstered=asset_id=="bed-double"
    base_mat="linen" if upholstered else "wood"
    foot=h*.14
    legs(w,d,foot,.08,"metal" if upholstered else "wood",0,.018)
    C.box("bed_platform",(w,h*.18,d*.97),(0,h*.22,d*.012),base_mat,.025)
    C.box("bed_support",(w*.93,h*.07,d*.92),(0,h*.325,d*.02),"wood",.01)
    pillow("mattress",(w*.945,h*.18,d*.93),(0,h*.43,d*.018),"linen",exponent=.24)
    edge_seam("mattress_piping",w*.926,d*.916,0,h*.507,d*.018,.04,"linen")
    if upholstered:
        C.box("headboard_frame",(w,h*.72,d*.053),(0,h*.64,-d*.4735),"linen",.035)
        count=6
        for i in range(count):
            x=(i-(count-1)/2)*w*.153
            pillow(f"headboard_panel_{i}",(w*.151,h*.64,d*.048),(x,h*.66,-d*.442),"linen",exponent=.36)
            for row in (.54,.80):
                C.sphere(f"tuft_button_{i}_{row}",(.011,.011,.004),(x,h*row,-d*.418),"linen")
        for i in range(count-1):
            x=(i-(count-2)/2)*w*.153
            tube(f"headboard_stitch_{i}",[(x,h*.38,-d*.413),(x,h*.93,-d*.413)],.0014)
    else:
        C.box("headboard",(w,h*.81,d*.043),(0,h*.595,-d*.4785),"wood",.019)
        C.box("headboard_inlay",(w*.89,h*.38,d*.019),(0,h*.71,-d*.447),"primary",.016)
        C.box("footboard",(w,h*.32,d*.04),(0,h*.31,d*.48),"wood",.015)
    count=2 if w>1.25 else 1
    for i in range(count):
        x=(i-(count-1)/2)*w*.47
        pillow(f"pillow_sleep_{i}",(w*.84/count,h*.115,d*.18),(x,h*.565,-d*.31),"linen",rotation=(i-.5)*.035)
        edge_seam(f"pillow_seam_{i}",w*.79/count,d*.165,x,h*.57,-d*.31,.06,"linen")
        pillow(f"pillow_decor_{i}",(w*.61/count,h*.16,d*.10),(x,h*.60,-d*.39),"primary",rotation=(i-.5)*.07)
    quilt(w,d,h)
    if asset_id=="bed-kids":
        for sx in (-1,1):
            for z in (-d*.34,d*.20):
                C.box(f"rail_post_{sx}_{z}",(.032,h*.29,.032),(sx*w*.47,h*.52,z),"wood",.008)
            C.box(f"side_guard_{sx}",(.03,h*.13,d*.58),(sx*w*.47,h*.625,-d*.065),"wood",.012)


def sofa(w,d,h,kind):
    corner=kind=="sofa-corner"
    body_d=min(d,.96)
    arm=min(w*.08,.15)
    inner=w-arm*2
    count=1 if kind=="armchair" else 2 if w<1.8 else 3
    if corner:
        C.box("frame_main",(w,h*.18,body_d),(0,h*.235,-d/2+body_d/2),"primary",.045)
        C.box("frame_chaise",(inner/count+arm,h*.18,d),(-w/2+(inner/count+arm)/2,h*.235,0),"primary",.045)
        for i,(x,z) in enumerate([(-w*.42,-d*.41),(-w*.42,d*.40),(w*.42,-d*.41),(w*.42,-d/2+body_d*.8)]):
            leg(f"leg_{i}",(x,h*.145,z),(x,0,z),.019,"wood")
    else:
        legs(w,d,h*.15,.09,"wood",.013,.022)
        C.box("upholstered_base",(w,h*.21,d),(0,h*.245,0),"primary",.045)
    C.box("back_frame",(w,h*.65,body_d*.17),(0,h*.675,-d/2+body_d*.085),"primary",.055)
    for sx in (-1,1):
        C.box(f"arm_{sx}",(arm,h*.47,body_d*.87),(sx*(w-arm)/2,h*.49,-d/2+body_d*.535),"primary",.06)
        tube(f"arm_piping_{sx}",[(sx*(w-arm)/2,h*.715,-d/2+body_d*.14),(sx*(w-arm)/2,h*.715,-d/2+body_d*.9)],.002)
    for i in range(count):
        x=(i-(count-1)/2)*inner/count
        depth=d*.84 if corner and i==0 else body_d*.71
        z=-d/2+body_d*.24+depth/2
        pillow(f"seat_{i}",(inner/count*.973,h*.18,depth),(x,h*.42,z),exponent=.30)
        edge_seam(f"seat_seam_{i}",inner/count*.945,depth*.965,x,h*.42,z,.055)
        pillow(f"cushion_back_{i}",(inner/count*.966,h*.45,body_d*.19),(x,h*.74,-d/2+body_d*.235),exponent=.40)
        if count>1:
            pillow(f"scatter_pillow_{i}",(inner/count*.51,h*.25,body_d*.18),(x+(i-.5)*.035,h*.59,-d/2+body_d*.40),"linen",rotation=(i-1)*.13)
    if kind=="armchair":
        pillow("scatter_pillow",(inner*.65,h*.22,body_d*.18),(0,h*.59,-d/2+body_d*.37),"linen",rotation=-.10)


def chair(w,d,h):
    legs(w*.83,d*.83,h*.49,.05,"metal",.035,.012)
    C.box("seat_support",(w*.73,.034,d*.69),(0,h*.48,d*.015),"metal",.012)
    pillow("seat",(w,h*.115,d*.9),(0,h*.55,d*.045),exponent=.38)
    # Curved padded back wraps gently around the sitter, with a supported lower edge.
    nu,nv=24,22
    vertices,faces=[],[]
    for side in (0,1):
        for j in range(nv+1):
            v=j/nv
            for i in range(nu+1):
                u=i/nu*2-1
                x=u*w*(.47-.04*v)
                y=h*(.57+.43*v)-h*.055*abs(u)**5*v
                z=-d*.33-d*.12*v+d*.22*u*u + side*d*.065
                z += d*.012*math.cos(u*6*math.pi)*math.sin(math.pi*v)
                vertices.append((x,y,z))
    count=(nu+1)*(nv+1)
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i
            faces += [(a,a+1,a+nu+2,a+nu+1),(a+count,a+nu+1+count,a+nu+2+count,a+1+count)]
    border=[i for i in range(nu+1)]+[j*(nu+1)+nu for j in range(1,nv+1)]+[nv*(nu+1)+i for i in range(nu-1,-1,-1)]+[j*(nu+1) for j in range(nv-1,0,-1)]
    for a,b in zip(border,border[1:]+border[:1]):
        faces.append((a,a+count,b+count,b))
    mesh("cushion_back",vertices,faces)
    for n in range(-2,3):
        u=n*.31
        tube(f"back_channel_{n}",[(u*w*(.47-.04*v),h*(.61+.36*v),-d*.33-d*.12*v+d*.22*u*u+d*.067) for v in np.linspace(0,1,20)],.0016)


def tables(w,d,h,kind):
    thickness=min(.045,h*.065)
    if kind=="coffee":
        C.box("tabletop",(w,thickness,d),(0,h-thickness/2,0),"primary",min(.095,d*.16))
        legs(w,d,h-thickness,.17,"wood",.035,.023)
    elif kind=="table":
        C.box("tabletop",(w,thickness,d),(0,h-thickness/2,0),"primary",.028)
        C.box("table_edge",(w*.98,.012,d*.98),(0,h-thickness-.006,0),"wood",.01)
        # Fine black steel U-frames, inspired by the supplied dining-table photographs.
        for sx in (-1,1):
            x=sx*w*.33
            C.box(f"u_foot_{sx}",(.055,.033,d*.81),(x,.0165,0),"metal",.006)
            for sz in (-1,1):
                C.box(f"u_upright_{sx}_{sz}",(.05,h-thickness-.02,.035),(x,(h-thickness+.013)/2,sz*d*.37),"metal",.005)
            C.box(f"u_top_{sx}",(.055,.025,d*.80),(x,h-thickness-.0125,0),"metal",.006)
    else:
        C.box("tabletop",(w,thickness,d),(0,h-thickness/2,0),"primary",.021)
        legs(w,d,h-thickness,.075,"metal",0,.015)
        C.box("rear_apron",(w*.83,.04,.025),(0,h-thickness-.023,-d*.38),"metal",.006)
        C.box("drawer_body",(w*.30,h*.16,d*.79),(w*.28,h-thickness-h*.08,0),"wood",.012)
        C.box("drawer_front",(w*.295,h*.155,.017),(w*.28,h-thickness-h*.08,d*.398),"primary",.006)
        handle("drawer_handle",w*.17,w*.28,h-thickness-h*.075,d*.417)


def handle(name,width,x,y,z):
    return tube(name,[(x-width/2,y,z-.012),(x-width/2,y,z),(x+width/2,y,z),(x+width/2,y,z-.012)],.0033,"metal",True)


def cabinets(w,d,h,kind):
    t=min(.025,min(w,d,h)*.10)
    bottom=.11 if kind in ("dresser","nightstand") else .075 if kind=="kitchen" else 0
    if bottom:
        legs(w,d,bottom,.10,"metal",0,.012)
    body=h-bottom
    C.box("top",(w,t,d),(0,h-t/2,0),"primary",.004)
    C.box("bottom",(w,t,d),(0,bottom+t/2,0),"primary",.004)
    C.box("back",(w,body,t),(0,bottom+body/2,-d/2+t/2),"wood",.003)
    for sx in (-1,1):
        C.box(f"side_{sx}",(t,body,d),(sx*(w-t)/2,bottom+body/2,0),"primary",.004)
    if kind in ("shelf","wall-shelf"):
        levels=1 if kind=="wall-shelf" else 5
        for n in range(1,levels):
            y=bottom+body*n/levels
            C.box(f"shelf_{n}",(w-t,t,d*.95),(0,y,0),"primary",.004)
        if kind=="shelf":
            for level in (1,3):
                for n in range(5):
                    width=w*.045; bh=body*.12
                    C.box(f"book_{level}_{n}",(width,bh,d*.58),(-w*.33+n*width*1.10,bottom+body*level/levels+t/2+bh/2,d*.07),"linen" if n%2 else "primary",.003)
                    tube(f"book_spine_{level}_{n}",[(-w*.33+n*width*1.10,bottom+body*level/levels+t/2+bh*.10,d*.365),(-w*.33+n*width*1.10,bottom+body*level/levels+t/2+bh*.85,d*.365)],.001,"stitch")
        return
    rows=3 if kind=="dresser" else 2 if kind=="nightstand" else 1
    columns=max(2,round(w/.65)) if kind in ("wardrobe","kitchen") else 1
    face_depth=.024
    for n in range(1,columns):
        C.box(f"divider_{n}",(t,body-t*2,d*.93),((n-columns/2)*(w-t)/columns,bottom+body/2,-d*.015),"wood",.003)
    for row in range(rows):
        for col in range(columns):
            fw=(w-t*2)/columns-.003
            fh=(body-t*2)/rows-.003
            x=(col-(columns-1)/2)*(w-t*2)/columns
            y=bottom+t+(row+.5)*(body-t*2)/rows
            C.box(f"front_{row}_{col}",(fw,fh,face_depth),(x,y,d/2-face_depth/2),"primary",.004)
            if kind=="wardrobe":
                hx=x+fw*.34*(-1 if col%2 else 1)
                tube(f"handle_{row}_{col}",[(hx,y-h*.08,d/2-.012),(hx,y-h*.08,d/2+.009),(hx,y+h*.08,d/2+.009),(hx,y+h*.08,d/2-.012)],.0035,"metal",True)
                C.box(f"door_inlay_{col}",(fw*.82,fh*.88,.007),(x,y,d/2+.002),"primary",.009)
            else:
                handle(f"handle_{row}_{col}",min(.18,fw*.45),x,y+fh*.20,d/2+.010)
    if kind=="kitchen":
        C.MATERIALS["stone"]=material("stone","#eeeae1",.35)
        C.box("worktop",(w,.035,d),(0,h-.003,0),"stone",.008)
        C.box("plinth",(w*.95,.085,d*.82),(0,.043,-d*.05),"wood",.004)


def appliance(w,d,h,kind):
    C.box("body",(w,h,d),(0,h/2,0),"primary",.023)
    if kind=="fridge":
        for n,(hh,yy) in enumerate(((h*.27,h*.855),(h*.70,h*.352))):
            C.box(f"door_{n}",(w*.968,hh,d*.035),(0,yy,d*.510),"linen",.012)
            tube(f"handle_{n}",[(w*.35,yy-hh*.15,d*.519),(w*.35,yy-hh*.15,d*.55),(w*.35,yy+hh*.15,d*.55),(w*.35,yy+hh*.15,d*.519)],.004,"metal",True)
        C.box("door_divider",(w*.93,.005,.01),(0,h*.71,d*.515),"metal",.001)
    else:
        C.box("control",(w*.86,h*.075,d*.025),(0,h*.91,d*.505),"metal",.006)
        for n in range(4 if kind=="stove" else 1):
            C.sphere(f"knob_{n}",(w*.065,h*.045,d*.031),((n-1.5)*w*.18 if kind=="stove" else w*.23,h*.91,d*.524),"linen")
        if kind=="washer":
            # Chrome ring, recessed rubber gasket and convex dark glass, all actual geometry.
            for suffix,radius,thickness,z,mat in (("rim",w*.335,.017,d*.516,"metal"),("gasket",w*.296,.008,d*.542,"glass")):
                tube("door_"+suffix,[(radius*math.cos(a),h*.46+radius*math.sin(a),z) for a in np.linspace(0,2*math.pi,65)[:-1]],thickness,mat,True,True)
            C.sphere("door_glass",(w*.60,h*.44,d*.045),(0,h*.46,d*.535),"glass")
            C.box("display",(w*.32,h*.044,d*.017),(-w*.22,h*.91,d*.524),"glass",.004)
        else:
            C.box("oven_glass",(w*.81,h*.54,d*.025),(0,h*.405,d*.508),"glass",.027)
            handle("oven_handle",w*.65,0,h*.715,d*.54)
            for sx in (-1,1):
                for sz in (-1,1):
                    C.cylinder(f"hob_{sx}_{sz}",(w*.275,.010,d*.27),(sx*w*.245,h-.005,sz*d*.245),"glass")
                    tube(f"hob_ring_{sx}_{sz}",[(sx*w*.245+w*.115*math.cos(a),h,sz*d*.245+d*.115*math.sin(a)) for a in np.linspace(0,2*math.pi,40)[:-1]],.0018,"metal",False,True)


def basin(name,w,d,h,base_y=0,mat="primary"):
    # Continuous rounded shell: outer wall, rim, concave interior, and closed bottom.
    loops=[(w*.87,d*.87,base_y), (w,d,base_y+h*.91), (w*.98,d*.98,base_y+h), (w*.81,d*.78,base_y+h*.97), (w*.68,d*.64,base_y+h*.26)]
    vertices=[]
    for lw,ld,y in loops:
        vertices += [(x,y,z) for x,z in rounded_loop(lw,ld,min(lw,ld)*.19,9)]
    count=len(vertices)//len(loops)
    faces=[]
    for j in range(len(loops)-1):
        for i in range(count):
            a=j*count+i; b=j*count+(i+1)%count
            faces.append((a,b,b+count,a+count))
    faces += [tuple(reversed(range(count))), tuple((len(loops)-1)*count+i for i in range(count))]
    return mesh(name,vertices,faces,mat)


def bathroom(w,d,h,kind):
    if kind=="bath":
        basin("bath_shell",w,d,h)
        C.cylinder("drain",(.055,.006,.055),(0,h*.267,-d*.24),"metal")
    elif kind=="sink":
        C.box("vanity",(w*.93,h*.65,d*.91),(0,h*.325,0),"wood",.021)
        C.box("drawer_front",(w*.87,h*.32,.024),(0,h*.42,d*.46),"primary",.009)
        handle("vanity_handle",w*.50,0,h*.55,d*.485)
        basin("sink_bowl",w,d,h*.18,h*.65,"linen")
        C.cylinder("drain",(.042,.004,.042),(0,h*.70,0),"metal")
        tube("faucet",[(w*.29,h*.77,-d*.42),(w*.29,h*.99,-d*.42),(w*.29,h,-d*.26),(w*.29,h*.93,-d*.26)],.010,"metal",True)
    else:
        C.sphere("pedestal",(w*.55,h*.40,d*.58),(0,h*.20,d*.07),"primary")
        C.sphere("bowl",(w,h*.40,d*.75),(0,h*.405,d*.125),"primary")
        C.sphere("seat_lid",(w*.975,h*.05,d*.725),(0,h*.617,d*.1375),"linen")
        C.box("tank",(w*.83,h*.76,d*.25),(0,h*.62,-d*.375),"primary",.039)
        C.box("tank_lid",(w*.88,h*.036,d*.27),(0,h*.982,-d*.365),"linen",.017)
        C.cylinder("flush",(.055,.004,.035),(0,h-.002,-d*.365),"metal")
        C.box("cistern_bridge",(w*.51,h*.46,d*.18),(0,h*.28,-d*.24),"primary",.021)


def decor(w,d,h,kind):
    if kind=="lamp":
        C.cylinder("base",(w*.60,.034,d*.60),(0,.017,0),"metal")
        C.cylinder("stem",(.012,h*.83,.012),(0,h*.42,0),"metal")
        # Tapered shade with an inner lip instead of a solid cylinder.
        ring=[]; faces=[]; n=64
        for radius,y in ((.5,h*.80),(.39,h),(.365,h),(.47,h*.80)):
            ring += [(w*radius*math.cos(a),y,d*radius*math.sin(a)) for a in np.linspace(0,2*math.pi,n,endpoint=False)]
        for j in range(3):
            for i in range(n):
                a=j*n+i; b=j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        for i in range(n):
            faces.append((i,(i+1)%n,3*n+(i+1)%n,3*n+i))
        mesh("shade",ring,faces,"primary")
        C.sphere("bulb",(.055,.09,.055),(0,h*.88,0),"linen")
    elif kind=="rug":
        C.box("rug",(w,h,d),(0,h/2,0),"primary",min(.01,h*.3))
        edge_seam("woven_border",w*.96,d*.96,0,h*.93,0,.021,"linen")
        for n in range(20):
            x=(n/19-.5)*w*.92
            tube(f"tuft_{n}",[(x,h*.75,-d*.499),(x+.002,h*.75,-d*.487)],.0012,"linen")
            tube(f"tuft_back_{n}",[(x,h*.75,d*.499),(x+.002,h*.75,d*.487)],.0012,"linen")
    else:
        # Tapered ceramic pot, soil, branching stems, and individually curved leaves.
        n=48; vertices=[]; faces=[]
        for radius,y in ((.22,0),(.285,h*.27),(.265,h*.29),(.245,h*.245)):
            vertices += [(w*radius*math.cos(a),y,d*radius*math.sin(a)) for a in np.linspace(0,2*math.pi,n,endpoint=False)]
        for j in range(3):
            for i in range(n):
                a=j*n+i; b=j*n+(i+1)%n
                faces.append((a,b,b+n,a+n))
        faces += [tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]
        mesh("ceramic_pot",vertices,faces,"primary")
        C.cylinder("soil",(w*.485,.012,d*.485),(0,h*.247,0),"wood")
        tube("trunk",[(0,h*.248,0),(.009,h*.52,.005),(-.012,h*.74,0),(0,h*.96,0)],.006,"wood",True)
        for k in range(18):
            angle=k*2.39996
            level=.39+k/18*.52
            start=(0,h*level,0)
            cx=math.cos(angle)*w*.24; cz=math.sin(angle)*d*.24
            end=(cx,h*(level+.10),cz)
            tube(f"branch_{k}",[start,(cx*.55,h*(level+.06),cz*.55),end],.0023,"leaf",True)
            vertices=[]; faces=[]
            rows,cols=8,4
            length=w*.34
            for j in range(rows+1):
                v=j/rows
                centerx=cx+math.cos(angle)*length*(v-.14)
                centerz=cz+math.sin(angle)*length*(v-.14)
                for i in range(cols+1):
                    u=i/cols*2-1
                    width=w*.105*math.sin(math.pi*v)**.7
                    vertices.append((centerx-math.sin(angle)*u*width,h*(level+.10)+h*.062*math.sin(math.pi*v)-h*.02*u*u,centerz+math.cos(angle)*u*width))
            for j in range(rows):
                for i in range(cols):
                    a=j*(cols+1)+i
                    faces.append((a,a+1,a+cols+2,a+cols+1))
            obj=mesh(f"leaf_{k}",vertices,faces,"leaf")
            obj.data.materials[0].use_nodes=True
            obj.data.materials[0].use_backface_culling=False


def build(spec):
    w,d,h=(spec["dimensions"][key]/1000 for key in ("width_mm","depth_mm","height_mm"))
    kind=spec["type"]
    if kind=="bed": bed(w,d,h,spec["asset_id"])
    elif kind in ("sofa","sofa-corner","armchair"): sofa(w,d,h,kind)
    elif kind=="chair": chair(w,d,h)
    elif kind in ("table","desk","coffee"): tables(w,d,h,kind)
    elif kind in ("wardrobe","dresser","nightstand","shelf","wall-shelf","kitchen"): cabinets(w,d,h,kind)
    elif kind in ("fridge","washer","stove"): appliance(w,d,h,kind)
    elif kind in ("bath","sink","toilet"): bathroom(w,d,h,kind)
    elif kind in ("plant","lamp","rug"): decor(w,d,h,kind)
    else: raise ValueError("No interior geometry for "+kind)


if __name__=="__main__":
    import json
    spec=json.loads(Path(sys.argv[sys.argv.index("--")+1]).read_text(encoding="utf-8"))
    MATERIAL_PROFILE=spec["type"]
    C.material=material
    C.finish=finish
    C.build=build
    C.main()
