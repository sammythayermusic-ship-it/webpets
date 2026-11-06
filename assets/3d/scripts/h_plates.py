"""Step 3 (environments): what the hamster homes and the bowl need to come alive.

    Blender -b wp_scene.blend -P h_plates.py -- <out_dir> <jobs> <samples>

jobs, comma separated:
  terr_plates, cage_plates   bg, decor_front (and glass for the terrarium) for day, dawn, dusk and
                             night, plus the day memorial. The rotating part of the wheel is hidden
                             from the camera (it still casts its shadow): the wheel is its own layer.
  terr_wheel, cage_wheel     the rotating part of the wheel alone, turning through one loop, for each
                             of the four light sets, cropped to the wheel. Everything else is a
                             holdout, so whatever stands in front of the wheel still hides it.
  plants                     the bowl's plant blades as a mask seen through the same glass: G is
                             coverage, R is height up the blade (0 at the gravel, 1 at the tip). The
                             water pass sways and bends exactly those pixels.
  snail, moth                the two background creatures, as small sprite sequences.
  geom                       measured points (bottle spout, wheel hub, house door, the light bar),
                             projected through each habitat's camera into grid px.

The light rigs are c_plates.py's, so the four homes share one sky: a low warm key from the right at
dawn, from the left at dusk, moonlight at night. At night the homes have one more light, a slim bar
under the back top rail (a terrarium hood light; clipped under the roof in the cage). It is built
here, in code, every run; the .blend is never saved. By day the bar is there, unlit.

Nothing here generates anything: every shape is a primitive, a lathe or a sphere.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp-h"
JOBS = ARGS[1].split(",") if len(ARGS) > 1 else ["terr_plates"]
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 96
VARIANTS = os.environ.get("WP_VARIANTS", "day,dawn,dusk,night").split(",")
RES = (1280, 960)
GRID = (320, 240)

sc = bpy.context.scene
CATCHER = bpy.data.objects["ENV_shadow_catcher"]
MESHES = [o for o in bpy.data.objects if o.type == 'MESH']

HABITATS = {
    "terrarium": {
        "camera": "CAM_terr",
        "coll": "WP_Terrarium",
        "front": "WP_TerrariumFront",
        "glass": "WP_TerrariumGlass",
        "memorial": "WP_TerrariumMemorial",
        # wp_render2 rendered the shipped plates WITHOUT WP_TerrLight (only_collection hid it), and
        # without c_plates' bounce card; the first trial with both came back washed out and lost the
        # tank's cast shadow. Neither is used here.
        "extra": (),
        "rotating": ("PRP_terr_rung_", "PRP_terr_hoop_", "PRP_terr_wheel_back", "PRP_terr_wheel_hub"),
        "hub": "PRP_terr_wheel_hub",
        "hoop": "PRP_terr_hoop_f",
        # One rung's turn loops: 22 rungs, nothing else on the wheel breaks the symmetry.
        "loop_deg": 360.0 / 22.0,
        "frames": 8,
        # Grid rect the wheel layer is cropped to (the site, with a margin for the turn and the rim).
        "crop": (98, 36, 76, 74),
        "spout": "PRP_terr_bottle_spout",
        "water": "PRP_terr_bottle_water",
        "door": "PRP_terr_house_door",
    },
    "cage": {
        "camera": "CAM_cage",
        "coll": "WP_Cage",
        "front": "WP_CageFront",
        "glass": None,
        "memorial": "WP_CageMemorial",
        "extra": (),
        "rotating": ("PRP_wheel_rung_", "PRP_wheel_hoop_", "PRP_wheel_spoke_", "PRP_wheel_back",
                     "PRP_wheel_hub", "PRP_wheel_axle"),
        "hub": "PRP_wheel_hub",
        "hoop": "PRP_wheel_hoop_f",
        # 22 rungs and 4 spokes: the pattern repeats every 180 degrees (11 rungs, 2 spokes), and 44
        # frames make one rung exactly four frames.
        "loop_deg": 180.0,
        "frames": 44,
        "crop": (52, 56, 90, 90),
        "spout": "PRP_bottle_spout",
        "water": "PRP_bottle_water",
        "door": None,
    },
}


# ------------------------------------------------------------------ render setup (c_plates.py's)
def use_gpu():
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
        return [d.name for d in p.devices if d.use]
    except Exception as exc:  # noqa: BLE001
        sc.cycles.device = 'CPU'
        return "CPU: %s" % exc


def base():
    sc.render.engine = 'CYCLES'
    sc.render.film_transparent = True
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 25
    sc.render.resolution_percentage = 100
    sc.render.use_overwrite = True
    sc.render.filter_size = 1.5
    c = sc.cycles
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.002
    c.adaptive_min_samples = min(SAMPLES, 64)
    c.max_bounces = 16
    c.transmission_bounces = 24
    c.diffuse_bounces = 6
    c.glossy_bounces = 6
    c.sample_clamp_indirect = 30.0
    c.blur_glossy = 0.2
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.denoising_quality = 'HIGH'
    try:
        c.denoising_use_gpu = True
    except AttributeError:
        pass


def reset_visibility():
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = False
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = False
            o.visible_camera = True
            o.is_holdout = False
    CATCHER.visible_camera = True
    sc.cycles.film_transparent_glass = False
    sc.render.use_border = False
    sc.render.use_crop_to_border = False


def only_collection(*names):
    keep = set(n for n in names if n) | {"WP_Rig"}
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = c.name not in keep


def shoot(camera, path, res=RES):
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.frame_set(1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)


# ------------------------------------------------------------------ lighting (c_plates.py's rigs)
LIGHT_DAY = {}
LIGHT_POSE = {}
AIM = Vector((0.0, 0.0, 0.25))


def remember():
    for name in ("LGT_key", "LGT_fill", "LGT_rim"):
        o = bpy.data.objects[name]
        LIGHT_POSE[name] = (tuple(o.location), tuple(o.rotation_euler))
        LIGHT_DAY[name] = (o.data.energy, tuple(o.data.color), o.data.size)
    w = sc.world.node_tree.nodes.get("Background")
    if w is not None:
        LIGHT_DAY["world"] = (w.inputs["Strength"].default_value, tuple(w.inputs["Color"].default_value))
    for o in bpy.data.objects:
        if o.name.startswith("LGT_terr_"):
            LIGHT_DAY[o.name] = (o.data.energy, tuple(o.data.color))


def aim_light(name, loc):
    o = bpy.data.objects[name]
    o.location = loc
    o.rotation_euler = (AIM - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def bounce_light():
    name = "LGT_bounce_c"
    ob = bpy.data.objects.get(name)
    if ob is None:
        data = bpy.data.lights.new(name, 'AREA')
        ob = bpy.data.objects.new(name, data)
        bpy.data.collections["WP_Rig"].objects.link(ob)
    ob.data.shape = 'SQUARE'
    ob.data.size = 2.4
    ob.location = (0.0, -0.75, -0.55)
    ob.rotation_euler = (-0.45, 0.0, 0.0)
    return ob


def rig(variant):
    """c_plates.rig, plus the terrarium's two helper lights scaled with the key."""
    key, fill, rim = (bpy.data.objects[n].data for n in ("LGT_key", "LGT_fill", "LGT_rim"))
    bounce = bounce_light().data
    w = sc.world.node_tree.nodes.get("Background")
    for name, (loc, rot) in LIGHT_POSE.items():
        o = bpy.data.objects[name]
        o.location = loc
        o.rotation_euler = rot
    helper = 1.0
    if variant == "dawn":
        aim_light("LGT_key", (1.05, -0.55, 0.30))
        key.energy, key.color, key.size = 95.0, (1.0, 0.74, 0.56), 0.42
        fill.energy, fill.color = 10.0, (0.55, 0.70, 1.0)
        rim.energy, rim.color = 18.0, (0.6, 0.78, 1.0)
        bounce.energy, bounce.color = 4.0, (1.0, 0.8, 0.7)
        world = (0.45, (0.85, 0.9, 1.0))
        helper = 0.35
    elif variant == "dusk":
        aim_light("LGT_key", (-1.0, 0.35, 0.28))
        key.energy, key.color, key.size = 110.0, (1.0, 0.58, 0.32), 0.40
        fill.energy, fill.color = 9.0, (0.62, 0.52, 0.95)
        rim.energy, rim.color = 30.0, (1.0, 0.62, 0.40)
        bounce.energy, bounce.color = 5.0, (1.0, 0.72, 0.5)
        world = (0.35, (1.0, 0.8, 0.7))
        helper = 0.3
    elif variant == "night":
        key.energy, key.color, key.size = 16.0, (0.62, 0.72, 1.0), 1.1
        fill.energy, fill.color = 4.0, (0.40, 0.42, 0.95)
        rim.energy, rim.color = 26.0, (0.45, 0.78, 1.0)
        bounce.energy, bounce.color = 1.2, (0.5, 0.6, 1.0)
        world = (0.14, (0.55, 0.65, 1.0))
        helper = 0.0
    else:
        for name in ("LGT_key", "LGT_fill", "LGT_rim"):
            e, c, s = LIGHT_DAY[name]
            l = bpy.data.objects[name].data
            l.energy, l.color, l.size = e, c, s
        bounce.energy, bounce.color = 9.0, (1.0, 0.93, 0.82)
        world = (1.0, (1.0, 1.0, 1.0))
    bounce.energy = 0.0
    if w is not None:
        s, c = LIGHT_DAY["world"]
        w.inputs["Strength"].default_value = s * world[0]
        w.inputs["Color"].default_value = (c[0] * world[1][0], c[1] * world[1][1], c[2] * world[1][2], 1.0)
    for o in bpy.data.objects:
        if o.name in LIGHT_DAY and o.name.startswith("LGT_terr_"):
            e, c = LIGHT_DAY[o.name]
            o.data.energy = e * helper
    set_hood(variant == "night")


# ------------------------------------------------------------------ the night light
HOOD = {}
HOOD_COLOR = (1.0, 0.78, 0.52)   # a warm 2700 K bulb
HOOD_LIGHT_W = 1.6
HOOD_PANEL = 5.0


def world_bbox(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def build_hood(habitat):
    """A slim light bar under the back top rail (terrarium) or the back of the roof (cage)."""
    h = HABITATS[habitat]
    col = bpy.data.collections[h["coll"]]
    if habitat == "terrarium":
        rails = [o for o in col.all_objects if o.name.startswith("ENV_terr_rail_") and o.name != "ENV_terr_rail_front"]
        back = max(rails, key=lambda o: o.location.y)
        lo, hi = world_bbox(back)
        y = lo.y - 0.010
        z_top = lo.z
        length, x = 0.200, 0.035
    else:
        roof = [o for o in col.all_objects if o.name.startswith("ENV_cage_roof")]
        lo = Vector((min(world_bbox(o)[0].x for o in roof), min(world_bbox(o)[0].y for o in roof), min(world_bbox(o)[0].z for o in roof)))
        hi = Vector((max(world_bbox(o)[1].x for o in roof), max(world_bbox(o)[1].y for o in roof), max(world_bbox(o)[1].z for o in roof)))
        y = hi.y - 0.022
        z_top = lo.z - 0.002
        length, x = 0.180, 0.030
    housing_m = wb.toy_material("WP_hood_housing", (0.16, 0.16, 0.17), roughness=0.32, metallic=0.6, specular=0.5)
    panel_m = bpy.data.materials.get("WP_hood_panel") or wb.toy_material(
        "WP_hood_panel", (0.95, 0.92, 0.86), roughness=0.4, emission=HOOD_COLOR, emission_strength=0.0)
    housing = wb.rounded_box(f"PRP_{habitat}_hood", length, 0.014, 0.008, 0.003, col)
    housing.location = (x, y, z_top - 0.004)
    wb.assign(housing, housing_m)
    panel = wb.rounded_box(f"PRP_{habitat}_hood_panel", length - 0.010, 0.016, 0.0024, 0.0008, col)
    panel.location = (x, y - 0.001, z_top - 0.0088)
    wb.assign(panel, panel_m)
    ld = bpy.data.lights.new(f"LGT_{habitat}_hood", 'AREA')
    ld.shape = 'RECTANGLE'
    ld.size, ld.size_y = length - 0.012, 0.010
    ld.color = HOOD_COLOR
    lo_ = bpy.data.objects.new(f"LGT_{habitat}_hood", ld)
    lo_.location = (x, y, z_top - 0.010)
    col.objects.link(lo_)
    HOOD[habitat] = {"housing": housing, "panel": panel, "light": lo_, "panel_m": panel_m,
                     "ends": [Vector((x - length / 2 + 0.006, y, z_top - 0.009)), Vector((x + length / 2 - 0.006, y, z_top - 0.009))]}
    MESHES.extend([housing, panel])


def set_hood(on):
    for hd in HOOD.values():
        hd["light"].data.energy = HOOD_LIGHT_W if on else 0.0
        bsdf = hd["panel_m"].node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Emission Strength"].default_value = HOOD_PANEL if on else 0.0


# ------------------------------------------------------------------ the habitats
def rotating(habitat):
    prefixes = HABITATS[habitat]["rotating"]
    col = bpy.data.collections[HABITATS[habitat]["coll"]]
    return [o for o in col.all_objects if o.type == 'MESH' and any(o.name.startswith(p) for p in prefixes)]


def plates(habitat, variant):
    h = HABITATS[habitat]
    stage = os.path.join(OUT, habitat, variant)
    spin = rotating(habitat)
    reset_visibility()
    only_collection(h["coll"], "WP_Ground", *h["extra"])
    for o in spin:
        o.visible_camera = False
    shoot(h["camera"], os.path.join(stage, "bg.png"))
    if variant == "day":
        only_collection(h["coll"], "WP_Ground", h["memorial"], *h["extra"])
        shoot(h["camera"], os.path.join(OUT, habitat, "memorial", "bg.png"))
    reset_visibility()
    only_collection(h["front"], *h["extra"])
    shoot(h["camera"], os.path.join(stage, "decor_front.png"))
    if h["glass"]:
        reset_visibility()
        sc.cycles.film_transparent_glass = True
        only_collection(h["glass"], *h["extra"])
        for o in MESHES:
            o.hide_render = not o.name.startswith("ENV_terr_glass_front")
        shoot(h["camera"], os.path.join(stage, "glass.png"))
    reset_visibility()


def axis_and_pivot(habitat):
    h = HABITATS[habitat]
    hub = bpy.data.objects[h["hub"]]
    lo, hi = world_bbox(hub)
    pivot = (lo + hi) / 2
    hoop = bpy.data.objects[h["hoop"]]
    axis = (hoop.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    return axis, pivot


def wheel(habitat, variant):
    h = HABITATS[habitat]
    spin = rotating(habitat)
    names = {o.name for o in spin}
    axis, pivot = axis_and_pivot(habitat)
    base_m = {o.name: o.matrix_world.copy() for o in spin}
    reset_visibility()
    only_collection(h["coll"], "WP_Ground", *h["extra"])
    CATCHER.hide_render = True
    # list() first: setting a render flag invalidates the collection's object cache, and iterating
    # `all_objects` while doing it stops after the first object (the first trial set two of 688).
    for o in list(bpy.data.collections[h["coll"]].all_objects):
        if o.type == 'MESH' and o.name not in names:
            o.is_holdout = True
    x, y, w, hgt = h["crop"]
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x = x / GRID[0]
    sc.render.border_max_x = (x + w) / GRID[0]
    sc.render.border_min_y = 1.0 - (y + hgt) / GRID[1]
    sc.render.border_max_y = 1.0 - y / GRID[1]
    n = h["frames"]
    for i in range(n):
        ang = math.radians(h["loop_deg"]) * i / n
        R = Matrix.Translation(pivot) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-pivot)
        for o in spin:
            o.matrix_world = R @ base_m[o.name]
        bpy.context.view_layer.update()
        shoot(h["camera"], os.path.join(OUT, habitat, "wheel", variant, "f_%02d.png" % i))
    for o in spin:
        o.matrix_world = base_m[o.name]
    CATCHER.hide_render = False
    reset_visibility()


# ------------------------------------------------------------------ the bowl's plants
def plants():
    bowl = bpy.data.collections["WP_Bowl"]
    glass = bpy.data.objects["ENV_bowl_glass"]
    absent = {"ENV_bowl_water", "ENV_waterline"}
    objs = list(bowl.all_objects)  # see wheel(): never iterate all_objects while changing flags
    blades = [o for o in objs if o.name.startswith("PRP_plant_")]
    zs = [world_bbox(o) for o in blades]
    z0 = min(lo.z for lo, _ in zs)
    z1 = max(hi.z for _, hi in zs)
    # Height up the blade as emission R; coverage as G. Everything else black; the glass refracts
    # only, so the mask lines up with the plate pixel for pixel (wp_render2's WP_mask_clear).
    m = bpy.data.materials.get("WP_plant_mask") or bpy.data.materials.new("WP_plant_mask")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = z0
    mr.inputs["From Max"].default_value = z1
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    comb.inputs["Y"].default_value = 1.0
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], comb.inputs["X"])
    nt.links.new(comb.outputs[0], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs[0])
    black = bpy.data.materials.get("WP_mask_black") or bpy.data.materials.new("WP_mask_black")
    black.use_nodes = True
    bn = black.node_tree
    bn.nodes.clear()
    bo = bn.nodes.new("ShaderNodeOutputMaterial")
    be = bn.nodes.new("ShaderNodeEmission")
    be.inputs["Color"].default_value = (0, 0, 0, 1)
    bn.links.new(be.outputs[0], bo.inputs[0])
    clear = bpy.data.materials.get("WP_mask_clear")
    if clear is None:
        clear = bpy.data.materials.new("WP_mask_clear")
        clear.use_nodes = True
        cn = clear.node_tree
        cn.nodes.clear()
        co = cn.nodes.new("ShaderNodeOutputMaterial")
        rf = cn.nodes.new("ShaderNodeBsdfRefraction")
        rf.inputs["Roughness"].default_value = 0.0
        rf.inputs["IOR"].default_value = 1.45
        cn.links.new(rf.outputs[0], co.inputs[0])
    reset_visibility()
    only_collection("WP_Bowl")
    saved = {o.name: [s.material for s in o.material_slots] for o in objs if o.type == 'MESH'}
    for o in objs:
        if o.type != 'MESH':
            continue
        o.hide_render = o.name in absent
        mat = m if o in blades else (clear if o == glass else black)
        o.data.materials.clear()
        o.data.materials.append(mat)
    CATCHER.hide_render = True
    old_world, old_ft, old_s = sc.world, sc.render.film_transparent, sc.cycles.samples
    old_vt = sc.view_settings.view_transform
    w = bpy.data.worlds.new("WP_plant_world")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    sc.world = w
    sc.render.film_transparent = False
    lights = [o for o in bpy.data.objects if o.type == 'LIGHT']
    saved_e = {o.name: o.data.energy for o in lights}
    for o in lights:
        o.data.energy = 0.0
    sc.cycles.samples = 32
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = 'Standard'
    shoot("CAM_bowl", os.path.join(OUT, "bowl", "plants.png"))
    sc.world, sc.render.film_transparent, sc.cycles.samples = old_world, old_ft, old_s
    sc.view_settings.view_transform = old_vt
    for o in lights:
        o.data.energy = saved_e[o.name]
    sc.cycles.use_denoising = True
    CATCHER.hide_render = False
    for o in objs:
        if o.name in saved:
            o.data.materials.clear()
            for mat in saved[o.name]:
                o.data.materials.append(mat)
    reset_visibility()
    print("WP_PLANT_Z %.4f %.4f" % (z0, z1), flush=True)


# ------------------------------------------------------------------ the critters
def critter_camera(name, width_m, height_m, pitch_deg):
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    cd.ortho_scale = max(width_m, height_m * 1.0)
    cam = bpy.data.objects.new(name, cd)
    bpy.data.collections["WP_Rig"].objects.link(cam)
    p = math.radians(pitch_deg)
    cam.location = (0.0, -0.5 * math.cos(p), 0.5 * math.sin(p))
    cam.rotation_euler = (math.pi / 2 - p, 0.0, 0.0)
    return cam


def snail():
    col = wb.get_collection("WP_Critter")
    body_m = wb.toy_material("WP_snail_body", (0.09, 0.08, 0.07), roughness=0.4, sheen=0.1, sss=0.1,
                             sss_color=(0.5, 0.42, 0.34), coat=0.15, coat_roughness=0.15)
    shell_m = wb.toy_material("WP_snail_shell", (0.30, 0.13, 0.04), roughness=0.28, coat=0.5, coat_roughness=0.1)
    band_m = wb.toy_material("WP_snail_band", (0.10, 0.045, 0.015), roughness=0.3, coat=0.5)
    eye_m = wb.toy_material("WP_snail_eye", (0.03, 0.03, 0.03), roughness=0.2, coat=1.0)
    foot = wb.sphere("CR_snail_foot", 0.0085, 0.0030, 0.0026, col)
    foot.location = (0.0, 0.0, 0.0026)
    wb.assign(foot, body_m)
    head = wb.sphere("CR_snail_head", 0.0030, 0.0026, 0.0028, col)
    head.location = (0.0072, 0.0, 0.0036)
    wb.assign(head, body_m)
    tents = []
    for i, (dy, tilt) in enumerate(((-0.0010, 0.55), (0.0010, 0.75))):
        t = wb.cylinder(f"CR_snail_tent_{i}", 0.00045, 0.0050, col, verts=10)
        t.location = (0.0088, dy, 0.0060)
        t.rotation_euler = (0.0, tilt, 0.0)
        wb.assign(t, body_m)
        e = wb.sphere(f"CR_snail_eye_{i}", 0.0007, 0.0007, 0.0007, col)
        e.location = (0.0088 + 0.0025 * math.sin(tilt), dy, 0.0060 + 0.0025 * math.cos(tilt))
        wb.assign(e, eye_m)
        tents.append((t, e, tilt))
    # The shell is a coil: spheres along a logarithmic spiral in the side plane, shrinking toward the
    # apex, so it reads as whorls rather than a ring.
    cx, cz, turns, n = -0.0014, 0.0068, 2.4, 34
    for i in range(n):
        t = i / (n - 1)
        th = t * turns * 2 * math.pi
        k = math.exp(-1.15 * t * turns)
        r = 0.0038 * k
        sp = wb.sphere(f"CR_snail_shell_{i}", 0.0022 * k + 0.0003, 0.0026 * k + 0.0004, 0.0022 * k + 0.0003, col, segments=16, rings=10)
        sp.location = (cx + r * math.cos(th), -0.0005 * t, cz + r * math.sin(th))
        wb.assign(sp, band_m if i % 6 == 5 else shell_m)
    cam = critter_camera("CAM_snail", 0.024, 0.016, 4.0)
    cam.location.z += 0.006
    reset_visibility()
    only_collection("WP_Critter")
    # Four crawl frames: the foot stretches forward and the head with it, the feelers sway.
    for i, k in enumerate((0.0, 0.5, 1.0, 0.5)):
        foot.scale = (1.0 + 0.07 * k, 1.0, 1.0 - 0.06 * k)
        foot.location.x = 0.0006 * k
        head.location.x = 0.0072 + 0.0012 * k
        for t, e, tilt in tents:
            a = tilt + 0.12 * math.sin(i * math.pi / 2)
            t.location.x = 0.0088 + 0.0012 * k
            t.rotation_euler = (0.0, a, 0.0)
            e.location = (t.location.x + 0.0025 * math.sin(a), t.location.y, 0.0060 + 0.0025 * math.cos(a))
        bpy.context.view_layer.update()
        shoot("CAM_snail", os.path.join(OUT, "critters", "snail", "f_%02d.png" % i), res=(96, 64))
    reset_visibility()
    col.hide_render = True


def moth():
    col = wb.get_collection("WP_Critter_moth")
    wing_m = wb.toy_material("WP_moth_wing", (0.18, 0.15, 0.11), roughness=0.85, sheen=0.3, sss=0.15,
                             sss_color=(0.9, 0.8, 0.6))
    hind_m = wb.toy_material("WP_moth_hind", (0.24, 0.21, 0.16), roughness=0.85, sheen=0.3, sss=0.15,
                             sss_color=(0.9, 0.8, 0.6))
    body_m = wb.toy_material("WP_moth_body", (0.20, 0.16, 0.11), roughness=0.9, sheen=0.7)
    body = wb.sphere("CR_moth_body", 0.0018, 0.0062, 0.0018, col)
    wb.assign(body, body_m)
    head = wb.sphere("CR_moth_head", 0.0015, 0.0014, 0.0014, col)
    head.location = (0.0, 0.0060, 0.0003)
    wb.assign(head, body_m)
    wings = []
    for side in (-1, 1):
        fore = wb.fan(f"CR_moth_fore_{side}", [(0.0, 0.0), (0.0110, 0.0035), (0.0125, -0.0010), (0.0060, -0.0040), (0.0, -0.0010)],
                      col, thickness=0.0004, subsurf=2)
        hind = wb.fan(f"CR_moth_hind_{side}", [(0.0, -0.0010), (0.0080, -0.0030), (0.0070, -0.0075), (0.0020, -0.0070), (0.0, -0.0040)],
                      col, thickness=0.0004, subsurf=2)
        wb.assign(fore, wing_m)
        wb.assign(hind, hind_m)
        for w_ in (fore, hind):
            w_.scale.x = side
            w_.location = (0.0008 * side, 0.0015, 0.0)
        wings.append((fore, hind, side))
    for i, ant_side in enumerate((-1, 1)):
        a = wb.cylinder(f"CR_moth_ant_{i}", 0.00018, 0.0045, col, verts=6)
        a.location = (0.0010 * ant_side, 0.0080, 0.0012)
        a.rotation_euler = (-1.1, 0.0, 0.35 * ant_side)
        wb.assign(a, body_m)
    cam = critter_camera("CAM_moth", 0.026, 0.022, 70.0)
    reset_visibility()
    only_collection("WP_Critter_moth")
    for i, flap in enumerate((60.0, 25.0, -12.0, 25.0)):
        for fore, hind, side in wings:
            for w_ in (fore, hind):
                # The fan is built in XZ; -90 degrees about X lays it flat with its outline's z forward.
                w_.rotation_euler = (-math.pi / 2, math.radians(-flap) * side, 0.0)
        bpy.context.view_layer.update()
        shoot("CAM_moth", os.path.join(OUT, "critters", "moth", "f_%02d.png" % i), res=(104, 88))
    reset_visibility()
    col.hide_render = True


# ------------------------------------------------------------------ measurements
def project(camera, co):
    v = world_to_camera_view(sc, bpy.data.objects[camera], co)
    return [round(v.x * GRID[0], 2), round((1.0 - v.y) * GRID[1], 2)]


def rect_of(camera, ob):
    pts = [project(camera, ob.matrix_world @ v.co) for v in ob.data.vertices]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return {"x": round(min(xs), 1), "y": round(min(ys), 1), "w": round(max(xs) - min(xs), 1), "h": round(max(ys) - min(ys), 1)}


def geom():
    sc.render.resolution_x, sc.render.resolution_y = RES
    out = {}
    for habitat, h in HABITATS.items():
        cam = h["camera"]
        g = {}
        axis, pivot = axis_and_pivot(habitat)
        hoop = bpy.data.objects[h["hoop"]]
        g["wheelHub"] = project(cam, pivot)
        r = rect_of(cam, hoop)
        g["wheelRect"] = r
        sp = bpy.data.objects[h["spout"]]
        low = min((sp.matrix_world @ v.co for v in sp.data.vertices), key=lambda p: p.z)
        g["spoutTip"] = project(cam, low)
        g["bottleWater"] = rect_of(cam, bpy.data.objects[h["water"]])
        if h["door"]:
            g["door"] = rect_of(cam, bpy.data.objects[h["door"]])
        if habitat in HOOD:
            g["hood"] = [project(cam, p) for p in HOOD[habitat]["ends"]]
        out[habitat] = g
    path = os.path.join(OUT, "geom.json")
    os.makedirs(OUT, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1)
    print("WP_GEOM %s" % json.dumps(out), flush=True)


# ------------------------------------------------------------------ run
print("WP_GPU %s" % (use_gpu(),), flush=True)
base()
remember()
for hab in ("terrarium", "cage"):
    build_hood(hab)
if "geom" in JOBS:
    geom()
if "plants" in JOBS:
    rig("day")
    plants()
if "snail" in JOBS:
    rig("day")
    snail()
if "moth" in JOBS:
    rig("day")
    moth()
for hab, short in (("terrarium", "terr"), ("cage", "cage")):
    for v in VARIANTS:
        if f"{short}_plates" in JOBS:
            rig(v)
            plates(hab, v)
        if f"{short}_wheel" in JOBS:
            rig(v)
            wheel(hab, v)
print("WP_DONE", flush=True)
