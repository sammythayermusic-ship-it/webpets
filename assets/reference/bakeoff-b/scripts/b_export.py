"""Candidate B (live 3D): export the bowl, the fish, the memorial and the bowl camera to one GLB.

    Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/b_export.py -- <out.glb> [bake_samples]

Writes <out.glb> plus the baked gravel maps beside it, and saves the prepared scene as
assets/3d/wp_scene-b-export.blend. NEVER saves over wp_scene.blend.

What this does to the scene before exporting, and why (see docs/DECISIONS.md, candidate B):
  - freezes every modifier into the mesh so the geometry can be edited afterwards;
  - keeps only the OUTER surface of the solidified glass, so Three can draw one mesh twice (back faces
    as the far wall, front faces as the reflecting near glass) without the inner shell showing;
  - joins the 134 pebbles, the plant blades, the stand and the memorial into one mesh each with vertex
    colours -- draw calls, not triangles, are what cost at idle;
  - bakes the gravel's procedural colour / bump / AO to textures, because glTF has no node trees;
  - bakes the fish body's belly gradient to vertex colours from the ramp's own stops;
  - zeroes the small transmission on fins and plants: a transmissive material is rendered in Three's
    transparent pass and would VANISH when seen through the transmissive water;
  - clears the fish's animation at frame 1 and resets the root, so the rest pose is exported clean.
"""

import os
import sys

import bpy
import bmesh
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.abspath("assets/3d/export/bowl_fish.glb")
BAKE_SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 32
OUT_DIR = os.path.dirname(OUT)
BAKE_RES = 1024
os.makedirs(OUT_DIR, exist_ok=True)

sc = bpy.context.scene
OBJ = bpy.data.objects


def log(msg):
    print("WP_B " + msg, flush=True)


def use_gpu():
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception as exc:  # noqa: BLE001
        sc.cycles.device = 'CPU'
        log("gpu unavailable: %s" % exc)


# ------------------------------------------------------------------ freezing

def freeze(ob):
    """Replace ob.data with its evaluated mesh (modifiers applied, local coords) and drop the modifiers."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    mats = [m for m in ob.data.materials]
    old = ob.data
    ob.data = me
    ob.modifiers.clear()
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return me


def set_levels(ob, levels):
    for m in ob.modifiers:
        if m.type == 'SUBSURF':
            m.levels = levels
            m.render_levels = levels


def smooth(me):
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))


# --------------------------------------------------------------- joining with colour

def principled_color(mat):
    b = mat.node_tree.nodes.get("Principled BSDF")
    return tuple(b.inputs["Base Color"].default_value)[:3] if b else (0.8, 0.8, 0.8)


def join_with_colors(name, objects, collection, material, color_of):
    """One mesh in WORLD space from several frozen objects, each coloured by `color_of(ob)` -> (r,g,b).

    Built with from_pydata rather than the join operator so it runs headless and so the colour layer
    is written exactly once per vertex. The originals are removed afterwards.
    """
    verts, faces, cols = [], [], []
    for ob in objects:
        me = ob.data
        base = len(verts)
        mw = ob.matrix_world
        col = color_of(ob)
        for v in me.vertices:
            verts.append(tuple(mw @ v.co))
            cols.append(col)
        for p in me.polygons:
            faces.append(tuple(base + i for i in p.vertices))
    out = bpy.data.meshes.new(name)
    out.from_pydata(verts, [], faces)
    out.validate()
    out.update()
    smooth(out)
    attr = out.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    for i, c in enumerate(cols):
        attr.data[i].color = (c[0], c[1], c[2], 1.0)
    out.materials.append(material)
    new = bpy.data.objects.new(name, out)
    collection.objects.link(new)
    for ob in objects:
        bpy.data.objects.remove(ob, do_unlink=True)
    return new


def vertex_color_material(name, roughness=0.6, sheen=0.0, specular=0.5):
    """Principled driven by the mesh's Col attribute. glTF exports that as COLOR_0 + a white base."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = specular
    if sheen > 0 and "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    return mat


# ------------------------------------------------------------------- the fish

def ramp_color(fac, elements, interp):
    """Blender ColorRamp evaluation for the stops the body material actually has."""
    pts = sorted(elements, key=lambda e: e[0])
    if fac <= pts[0][0]:
        return pts[0][1]
    if fac >= pts[-1][0]:
        return pts[-1][1]
    for (p0, c0), (p1, c1) in zip(pts, pts[1:]):
        if p0 <= fac <= p1:
            t = 0.0 if p1 == p0 else (fac - p0) / (p1 - p0)
            if interp == 'EASE':
                t = (3.0 - 2.0 * t) * t * t
            return tuple(a + (b - a) * t for a, b in zip(c0, c1))
    return pts[-1][1]


def bake_body_gradient(body):
    mat = body.data.materials[0]
    nt = mat.node_tree
    rng = next(n for n in nt.nodes if n.bl_idname == 'ShaderNodeMapRange')
    ramp = next(n for n in nt.nodes if n.bl_idname == 'ShaderNodeValToRGB')
    lo = rng.inputs["From Min"].default_value
    hi = rng.inputs["From Max"].default_value
    stops = [(e.position, tuple(e.color)[:3]) for e in ramp.color_ramp.elements]
    me = body.data
    attr = me.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    for v in me.vertices:
        fac = max(0.0, min(1.0, (v.co.z - lo) / (hi - lo)))
        c = ramp_color(fac, stops, ramp.color_ramp.interpolation)
        attr.data[v.index].color = (c[0], c[1], c[2], 1.0)
    live = vertex_color_material("WP_fish_body_live", roughness=0.40, sheen=0.25, specular=0.45)
    me.materials.clear()
    me.materials.append(live)
    log("fish body gradient baked to %d vertex colours (z %.3f..%.3f)" % (len(me.vertices), lo, hi))


def prepare_fish():
    sc.frame_set(1)
    fish = [o for o in bpy.data.collections["WP_Fish"].objects]
    for o in fish:
        # Evaluate at frame 1 and then forget the clips: the rest pose is what the live rig deforms.
        if o.animation_data:
            o.animation_data_clear()
    root = OBJ["RIG_fish_root"]
    root.location = (0.0, 0.0, 0.0)
    root.rotation_euler = (0.0, 0.0, 0.0)
    tail = OBJ["RIG_fish_tail"]
    tail.rotation_euler = (0.0, 0.0, 0.0)
    set_levels(OBJ["HERO_fish_mouth"], 1)
    set_levels(OBJ["HERO_fish_eye_l"], 1)
    set_levels(OBJ["HERO_fish_eye_r"], 1)
    for o in fish:
        if o.type == 'MESH':
            freeze(o)
            smooth(o.data)
    bake_body_gradient(OBJ["HERO_fish_body"])
    fin = bpy.data.materials["WP_fish_fin"]
    b = fin.node_tree.nodes["Principled BSDF"]
    b.inputs["Transmission Weight"].default_value = 0.0
    b.inputs["Alpha"].default_value = 1.0
    return fish


# ------------------------------------------------------------------- the glass

def strip_inner_shell(glass):
    me = glass.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    doomed = []
    for f in bm.faces:
        c = f.calc_center_median()
        radial = Vector((c.x, c.y, 0.0))
        if radial.length < 1e-6:
            continue
        radial.normalize()
        # Inward-facing side wall = the solidify's inner surface. Rim and caps have little radial
        # normal and survive.
        if f.normal.dot(radial) < -0.25:
            doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(me)
    bm.free()
    me.update()
    log("glass: removed %d inner faces, %d remain" % (len(doomed), len(me.polygons)))


# ------------------------------------------------------------------ the gravel

def planar_uv(me, radius=0.11):
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x + radius) / (2 * radius), (co.y + radius) / (2 * radius))


def bake_image(ob, mat, name, kind, colorspace, **bake_kw):
    img = bpy.data.images.new(name, BAKE_RES, BAKE_RES, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.name = "B_BAKE_TARGET"
    nt.nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type=kind, margin=12, use_clear=True, **bake_kw)
    nt.nodes.remove(tex)
    path = os.path.join(OUT_DIR, name + ".png")
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    log("baked %s (%s) -> %s" % (name, kind, path))
    return img


def bake_gravel(gravel):
    import numpy as np
    me = gravel.data
    planar_uv(me)
    src = me.materials[0]
    sc.render.engine = 'CYCLES'
    use_gpu()
    sc.cycles.samples = BAKE_SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    sc.render.bake.use_pass_color = True
    # AO reach: pebbles are ~2 cm, the bowl wall is right there; 8 cm catches both without going grey.
    sc.world.light_settings.distance = 0.08
    color = bake_image(gravel, src, "b_gravel_color", 'DIFFUSE', 'sRGB', pass_filter={'COLOR'})
    normal = bake_image(gravel, src, "b_gravel_normal", 'NORMAL', 'Non-Color', normal_space='TANGENT')
    ao = bake_image(gravel, src, "b_gravel_ao", 'AO', 'Non-Color')
    # Multiply AO into the colour so both quality tiers carry the contact darkening under the pebbles
    # and along the glass with no extra map at runtime.
    n = BAKE_RES * BAKE_RES * 4
    c = np.empty(n, dtype=np.float32)
    a = np.empty(n, dtype=np.float32)
    color.pixels.foreach_get(c)
    ao.pixels.foreach_get(a)
    c = c.reshape(-1, 4)
    a = a.reshape(-1, 4)
    occ = np.clip(a[:, :1], 0.0, 1.0) ** 0.8
    c[:, :3] *= 0.72 + 0.28 * occ
    color.pixels.foreach_set(c.ravel())
    color.save()
    live = bpy.data.materials.new("WP_gravel_live")
    live.use_nodes = True
    nt = live.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = color
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = normal
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 1.0
    nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    me.materials.clear()
    me.materials.append(live)
    # The AO image is folded in; leave it unreferenced so the exporter does not ship it twice.
    bpy.data.images.remove(ao)


# ------------------------------------------------------------------------ main

def main():
    sc.render.resolution_x, sc.render.resolution_y = 1280, 960
    sc.render.resolution_percentage = 100
    bowl = bpy.data.collections["WP_Bowl"]
    memorial = bpy.data.collections["WP_Memorial"]

    # Hide everything that is not the fish bowl so bakes and the export see only it.
    for c in bpy.data.collections:
        if c.name.startswith("WP_") and c.name not in ("WP_Bowl", "WP_Fish", "WP_Rig", "WP_Memorial"):
            c.hide_render = True
            c.hide_viewport = True
            for o in c.objects:
                o.hide_set(True)
                o.hide_render = True

    fish = prepare_fish()

    glass = OBJ["ENV_bowl_glass"]
    water = OBJ["ENV_bowl_water"]
    gravel = OBJ["PRP_gravel"]
    waterline = OBJ["ENV_waterline"]
    set_levels(glass, 2)
    set_levels(water, 2)
    set_levels(gravel, 2)
    for o in (glass, water, gravel, waterline):
        freeze(o)
        smooth(o.data)
    strip_inner_shell(glass)

    pebbles = [o for o in bowl.objects if o.name.startswith("PRP_pebble")]
    plants = [o for o in bowl.objects if o.name.startswith("PRP_plant_blade")]
    stand = [o for o in bowl.objects if o.name.startswith("PRP_stand")]
    for o in pebbles + plants + stand:
        if o.name.startswith("PRP_pebble"):
            set_levels(o, 1)
        freeze(o)
    for o in list(memorial.objects):
        freeze(o)

    bake_gravel(gravel)

    # Pebble colours: the bake sees the originals, so the join happens after the bake.
    peb_mat = vertex_color_material("WP_pebbles_live", roughness=0.45, specular=0.4)
    join_with_colors("PRP_pebbles", pebbles, bowl, peb_mat, lambda o: principled_color(o.data.materials[0]))
    plant_mat = vertex_color_material("WP_plants_live", roughness=0.42, sheen=0.3, specular=0.35)
    join_with_colors("PRP_plants", plants, bowl, plant_mat, lambda o: principled_color(o.data.materials[0]))
    wood_mat = vertex_color_material("WP_stand_live", roughness=0.6, specular=0.3)
    join_with_colors("PRP_stand", stand, bowl, wood_mat, lambda o: principled_color(o.data.materials[0]))
    mem_mat = vertex_color_material("WP_memorial_live", roughness=0.5, specular=0.35)
    join_with_colors("PRP_memorial", list(memorial.objects), memorial, mem_mat,
                     lambda o: principled_color(o.data.materials[0]))

    for m in ("WP_plant_a", "WP_plant_b"):
        b = bpy.data.materials[m].node_tree.nodes["Principled BSDF"]
        b.inputs["Transmission Weight"].default_value = 0.0

    # Selection for export.
    bpy.ops.object.select_all(action='DESELECT')
    wanted = [glass, water, gravel, waterline, OBJ["PRP_pebbles"], OBJ["PRP_plants"], OBJ["PRP_stand"],
              OBJ["PRP_memorial"], OBJ["CAM_bowl"]] + [o for o in fish if o.name in OBJ]
    for o in wanted:
        o.hide_set(False)
        o.hide_render = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = glass
    counts = {o.name: (len(o.data.vertices), len(o.data.polygons)) for o in wanted if o.type == 'MESH'}
    log("export set: %s" % counts)
    log("triangles (approx, quads x2): %d" % sum(f * 2 for _, f in counts.values()))

    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_yup=True,
        export_cameras=True,
        export_lights=False,
        export_materials='EXPORT',
        export_image_format='WEBP',
        export_image_quality=88,
        export_normals=True,
        export_tangents=True,
        export_vertex_color='ACTIVE',
        export_attributes=False,
        export_extras=False,
    )
    log("wrote %s (%d bytes)" % (OUT, os.path.getsize(OUT)))
    copy = os.path.join(os.path.dirname(os.path.dirname(OUT)), "wp_scene-b-export.blend")
    bpy.ops.wm.save_as_mainfile(filepath=copy, copy=True)
    log("saved prepared scene copy %s" % copy)
    log("DONE")


main()
