"""Build the live goldfish from code, export it for the live layer, and render a look preview.

    python3 assets/3d/scripts/gf_maps.py assets/live/goldfish        # the maps first
    Blender -b --factory-startup -P assets/3d/scripts/gf_build.py -- assets/live/goldfish [preview.png] [samples]

Starts from an EMPTY scene (it never opens or saves wp_scene.blend). Writes:
  <out>/goldfish.glb    every part as its own mesh under the two rig empties the live layer expects
                        (RIG_fish_root > HERO_fish_*; RIG_fish_tail > HERO_fish_tail), UVs and normals,
                        no images (the app loads the maps beside it), extras per fin:
                        wp_flutter (1 dorsal/anal, 2 paired, 3 tail), wp_root (root-space point the fin
                        hinges at, glTF axes) and wp_len (its longest ray, m)
  <out>/rig.json        each part's bbox in root space (glTF axes), the tail hinge, the mesh length
  [preview.png]         a Cycles render of the fish with the maps applied, side and three-quarter
                        views, for judging the look without building the app

Parts and names follow the September fish so the spine and the materials find them:
HERO_fish_body, _eye_l/_r, _mouth, _fin_dorsal, _fin_anal, _fin_pec_l/_r, _fin_pel_l/_r (new), _tail.
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gf_shape as G  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "assets/live/goldfish")
PREVIEW = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else None
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 64

NX = 128          # body sections along the length
NT = 72           # around


# ------------------------------------------------------------------------------------ helpers
def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            coll.remove(b)


def mesh_object(name, verts, faces, uvs=None, parent=None, smooth=True, colors=None, closed=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if closed:
        # Outward normals, whatever order the generator wound the faces in. Cycles draws both sides,
        # so a sphere wound inside-out looks right in the preview; the live layer culls back faces,
        # and the first goldfish had no eyes.
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
    if uvs is not None:
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uv.data[li].uv = uvs[vi]
    if colors is not None:
        attr = me.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(colors):
            attr.data[i].color = c
        me.color_attributes.active_color = attr
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def to_gltf(p):
    """Blender (x, y, z) -> glTF/three (x, z, -y)."""
    return [p[0], p[2], -p[1]]


# ------------------------------------------------------------------------------------ body
def build_body(root):
    import numpy as np

    us = np.linspace(0.0, 1.0, NX)
    # a little denser at the snout, where the curvature is
    us = us + 0.035 * np.sin(np.pi * us) * us
    us = (us - us[0]) / (us[-1] - us[0])
    verts, uvs, faces = [], [], []
    for i, u in enumerate(us):
        x = float(G.x_of_u(u))
        for j in range(NT + 1):
            v = j / NT
            th = float(G.theta_of_v(v))
            y, z = G.section(x, th)
            verts.append((x, float(y), float(z)))
            uvs.append((float(u), v))
    ring = NT + 1
    for i in range(NX - 1):
        for j in range(NT):
            a = i * ring + j
            b = a + 1
            c = a + ring + 1
            d = a + ring
            faces.append((a, b, c, d))
    # snout: rings that round the end over to a small flat where the mouth sits
    base = (NX - 1) * ring
    x0 = G.X_NOSE
    steps = 5
    prev = base
    for s in range(1, steps + 1):
        f = s / steps
        ang = f * math.pi / 2 * 0.92
        k = math.cos(ang)
        xs = x0 + 0.0012 * math.sin(ang)
        start = len(verts)
        for j in range(NT + 1):
            px, py, pz = verts[base + j]
            zc = float(G.centre_z(x0))
            verts.append((xs, py * k, zc + (pz - zc) * k))
            uvs.append((1.0, j / NT))
        for j in range(NT):
            faces.append((prev + j, prev + j + 1, start + j + 1, start + j))
        prev = start
    tip = len(verts)
    verts.append((x0 + 0.0012, 0.0, float(G.centre_z(x0))))
    uvs.append((1.0, 0.5))
    for j in range(NT):
        faces.append((prev + j, prev + j + 1, tip))
    # tail base: a shallow cap the caudal fin's root covers
    cap = len(verts)
    verts.append((G.X_CAUDAL - 0.0006, 0.0, float(G.centre_z(G.X_CAUDAL))))
    uvs.append((0.0, 0.5))
    for j in range(NT):
        faces.append((j + 1, j, cap))
    ob = mesh_object("HERO_fish_body", verts, faces, uvs, parent=root, closed=True)
    return ob


# ------------------------------------------------------------------------------------ eyes
def build_eye(root, side):
    cx, cy, cz = G.eye_centre(side)
    r = G.EYE_R
    verts, uvs, faces = [], [], []
    nu, nv = 32, 16
    # a sphere whose pole points out of the head (along y), flattened a little: an eye, not a bead
    for i in range(nv + 1):
        a = math.pi * i / nv
        for j in range(nu + 1):
            b = 2 * math.pi * j / nu
            lx = r * math.sin(a) * math.cos(b)
            lz = r * math.sin(a) * math.sin(b)
            ly = r * math.cos(a) * 0.78 * (-side)
            verts.append((cx + lx, cy - ly, cz + lz))
            uvs.append((0.5 + lx / (2 * r), 0.5 + lz / (2 * r)))
    for i in range(nv):
        for j in range(nu):
            a0 = i * (nu + 1) + j
            faces.append((a0, a0 + 1, a0 + nu + 2, a0 + nu + 1))
    return mesh_object("HERO_fish_eye_" + ("l" if side < 0 else "r"), verts, faces, uvs, parent=root, closed=True)


# ------------------------------------------------------------------------------------ mouth
def build_mouth(root):
    """Lips: a flattened ring round the snout tip, and a dark throat disc just inside it. One mesh,
    vertex-coloured, so the live layer's gape (a scale about the mesh) opens both together."""
    x0 = G.X_NOSE + 0.0009
    zc = float(G.centre_z(G.X_NOSE))
    R, rr = 0.0015, 0.00052
    verts, faces, cols = [], [], []
    nu, nv = 32, 10
    for i in range(nu):
        a = 2 * math.pi * i / nu
        for j in range(nv):
            b = 2 * math.pi * j / nv
            rad = R + rr * math.cos(b)
            verts.append((x0 + rr * math.sin(b) * 0.8, rad * math.cos(a), zc + rad * math.sin(a) * 0.68))
            cols.append((0.80, 0.24, 0.10, 1.0))
    for i in range(nu):
        for j in range(nv):
            a = i * nv + j
            b = i * nv + (j + 1) % nv
            c = ((i + 1) % nu) * nv + (j + 1) % nv
            d = ((i + 1) % nu) * nv + j
            faces.append((a, b, c, d))
    centre = len(verts)
    verts.append((x0 - 0.0004, 0.0, zc))
    cols.append((0.08, 0.02, 0.02, 1.0))
    ring0 = len(verts)
    for i in range(nu):
        a = 2 * math.pi * i / nu
        verts.append((x0 + 0.0001, (R - rr * 0.6) * math.cos(a), zc + (R - rr * 0.6) * math.sin(a) * 0.68))
        cols.append((0.16, 0.04, 0.04, 1.0))
    for i in range(nu):
        faces.append((centre, ring0 + i, ring0 + (i + 1) % nu))
    # The live layer's gape scales this object about its ORIGIN, so the origin is the mouth's centre.
    verts = [(v[0] - x0, v[1], v[2] - zc) for v in verts]
    ob = mesh_object("HERO_fish_mouth", verts, faces, None, parent=root, colors=cols)
    ob.location = (x0, 0.0, zc)
    return ob


# ------------------------------------------------------------------------------------ fins
def build_fin(name, fin, parent, origin=(0.0, 0.0, 0.0)):
    nu = fin["rays"] * 2 + 1
    nv = 12
    verts, uvs, faces = [], [], []
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u = i / nu
            p = G.fin_point(fin, u, v)
            verts.append((p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]))
            uvs.append((u * fin["rays"] / 4.0, v))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    ob = mesh_object(name, verts, faces, uvs, parent=parent)
    roots = [fin["root"](i / 8) for i in range(9)]
    rc = [sum(p[k] for p in roots) / len(roots) for k in range(3)]
    length = max(math.dist(fin["root"](i / 8), fin["edge"](i / 8)) for i in range(9))
    ob["wp_flutter"] = fin["flutter"]
    ob["wp_root"] = to_gltf(rc)
    ob["wp_len"] = length
    return ob


# ------------------------------------------------------------------------------------ materials (preview + export names)
def image(path, colorspace):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    return img


def nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    p = nt.nodes.get("Principled BSDF")
    return nt, p


def set_in(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def tex(nt, img, extension='REPEAT'):
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.extension = extension
    return t


def flip_green(nt, color_out):
    """The maps are in three.js's derivative frame (+y down the image); Blender's tangent frame has
    +y up the image. One minus green converts."""
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    comb = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(color_out, sep.inputs[0])
    nt.links.new(sep.outputs[0], comb.inputs[0])
    nt.links.new(sep.outputs[1], inv.inputs[1])
    nt.links.new(inv.outputs[0], comb.inputs[1])
    nt.links.new(sep.outputs[2], comb.inputs[2])
    return comb.outputs[0]


def body_material():
    m = bpy.data.materials.new("GF_body")
    nt, p = nodes(m)
    col = tex(nt, image(os.path.join(OUT, "body_color.jpg"), 'sRGB'), 'EXTEND')
    nrm = tex(nt, image(os.path.join(OUT, "body_normal.jpg"), 'Non-Color'), 'EXTEND')
    orm = tex(nt, image(os.path.join(OUT, "body_orm.png"), 'Non-Color'), 'EXTEND')
    nt.links.new(col.outputs[0], p.inputs["Base Color"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(flip_green(nt, nrm.outputs[0]), nm.inputs["Color"])
    nt.links.new(nm.outputs[0], p.inputs["Normal"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], p.inputs["Roughness"])
    nt.links.new(sep.outputs[2], p.inputs["Metallic"])
    set_in(p, "Coat Weight", 0.6)
    set_in(p, "Coat Roughness", 0.12)
    set_in(p, "Subsurface Weight", 0.08)
    set_in(p, "Subsurface Radius", (1.0, 0.35, 0.15))
    set_in(p, "Subsurface Scale", 0.002)
    return m


def fin_material():
    m = bpy.data.materials.new("GF_fin")
    nt, p = nodes(m)
    col = tex(nt, image(os.path.join(OUT, "fin_color.png"), 'sRGB'))
    nrm = tex(nt, image(os.path.join(OUT, "fin_normal.png"), 'Non-Color'))
    nt.links.new(col.outputs[0], p.inputs["Base Color"])
    nt.links.new(col.outputs[1], p.inputs["Alpha"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(flip_green(nt, nrm.outputs[0]), nm.inputs["Color"])
    nt.links.new(nm.outputs[0], p.inputs["Normal"])
    set_in(p, "Roughness", 0.45)
    set_in(p, "Transmission Weight", 0.25)
    set_in(p, "Coat Weight", 0.2)
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = 'BLENDED'
    return m


def eye_material():
    m = bpy.data.materials.new("GF_eye")
    nt, p = nodes(m)
    col = tex(nt, image(os.path.join(OUT, "eye.png"), 'sRGB'), 'EXTEND')
    nt.links.new(col.outputs[0], p.inputs["Base Color"])
    set_in(p, "Roughness", 0.35)
    set_in(p, "Coat Weight", 1.0)
    set_in(p, "Coat Roughness", 0.03)
    return m


def mouth_material():
    m = bpy.data.materials.new("GF_mouth")
    nt, p = nodes(m)
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs[0], p.inputs["Base Color"])
    set_in(p, "Roughness", 0.4)
    set_in(p, "Coat Weight", 0.5)
    return m


# ------------------------------------------------------------------------------------ build
clear_scene()
root = empty("RIG_fish_root", (0, 0, 0))
hinge = empty("RIG_fish_tail", G.TAIL_HINGE, parent=root)
body = build_body(root)
eyes = [build_eye(root, -1), build_eye(root, 1)]
mouth = build_mouth(root)
fins = []
for name, fin in G.fins().items():
    if name == "HERO_fish_tail":
        fins.append(build_fin(name, fin, hinge, origin=G.TAIL_HINGE))
    else:
        fins.append(build_fin(name, fin, root))

mb, mf, me, mm = body_material(), fin_material(), eye_material(), mouth_material()
body.data.materials.append(mb)
for e in eyes:
    e.data.materials.append(me)
mouth.data.materials.append(mm)
for f in fins:
    f.data.materials.append(mf)

parts = [body] + eyes + [mouth] + fins
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------ export
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for o in [root, hinge] + parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = root
glb = os.path.join(OUT, "goldfish.glb")
kw = dict(
    filepath=glb,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
    export_materials='EXPORT',
    export_image_format='NONE',
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
    export_extras=True,
)
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print("WP_WROTE %s (%d bytes)" % (glb, os.path.getsize(glb)), flush=True)

rig = {"tail_hinge_root": to_gltf(G.TAIL_HINGE), "parts": {}}
lo = [1e9] * 3
hi = [-1e9] * 3
for o in parts:
    m = o.matrix_world
    pts = [to_gltf(m @ v.co) for v in o.data.vertices]
    bb = [[round(min(p[i] for p in pts), 5), round(max(p[i] for p in pts), 5)] for i in range(3)]
    rig["parts"][o.name] = {"bbox_root": bb, "verts": len(o.data.vertices)}
    for i in range(3):
        lo[i] = min(lo[i], bb[i][0])
        hi[i] = max(hi[i], bb[i][1])
rig["length_m"] = round(hi[0] - lo[0], 5)
rig["verts_total"] = sum(len(o.data.vertices) for o in parts)
with open(os.path.join(OUT, "rig.json"), "w") as fh:
    json.dump(rig, fh, indent=1)
print("WP_RIG length %.4f m, %d verts" % (rig["length_m"], rig["verts_total"]), flush=True)


# ------------------------------------------------------------------------------------ preview
def preview(path):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'METAL'
        sc.cycles.device = 'GPU'
    except Exception:  # noqa: BLE001
        sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 1400
    sc.render.resolution_y = 800
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new("GF_world")
    world.use_nodes = True
    bgn = world.node_tree.nodes["Background"]
    bgn.inputs[0].default_value = (0.30, 0.52, 0.62, 1.0)
    bgn.inputs[1].default_value = 0.55
    sc.world = world

    def light(name, kind, energy, color, loc, size=0.05):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        sc.collection.objects.link(ob)
        d = Vector((0, 0, 0)) - Vector(loc)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return ob

    light("GF_key", 'AREA', 6.0, (1.0, 0.93, 0.82), (-0.10, -0.22, 0.30), 0.12)
    light("GF_fill", 'AREA', 2.5, (0.7, 0.82, 1.0), (0.25, -0.18, 0.02), 0.2)
    light("GF_rim", 'AREA', 6.0, (1.0, 0.8, 0.6), (0.05, 0.25, 0.12), 0.1)

    cam_d = bpy.data.cameras.new("GF_cam")
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = 0.135
    cam = bpy.data.objects.new("GF_cam", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    shots = []
    # the bowl camera's view of a fish facing right: its LEFT (-y) side, from slightly above
    for tag, loc in (("side", (0.0, -0.5, 0.04)), ("three_quarter", (0.30, -0.38, 0.12))):
        cam.location = loc
        d = Vector((0.0, 0.0, 0.0)) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        out = path.replace(".png", "-%s.png" % tag)
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        shots.append(out)
        print("WP_PREVIEW %s" % out, flush=True)
    return shots


if PREVIEW:
    preview(PREVIEW)
print("WP_DONE", flush=True)
