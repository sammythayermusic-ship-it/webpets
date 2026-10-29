"""Candidate C (hybrid): the still plates, rendered for an EMPTY bowl.

    Blender -b wp_scene.blend -P c_plates.py -- <stage_dir> <variants> <samples>

variants: comma separated from  day,night,memorial   (default all three)

Same five-pass scheme as wp_render2.py's bowl job (it is proven, and finish2.un_composite depends on
it), with two differences that are the whole point of the candidate:

  * the water body and the waterline ring are HIDDEN in every pass. The live Three.js layer draws the
    water, so the plates must show what sits behind and in front of it: stand, glass shell, gravel,
    pebbles, plants. A baked water would fight the live one.
  * every plate has a night variant: the same geometry under a cool, dim, moonlit rig, so the app
    can crossfade plates instead of tinting day art blue.

Nothing here saves the .blend. Writes go to <stage_dir> only; c_finish.py turns the passes into the
delivered PNGs under assets/habitats/fish/bowl/.
"""
import os
import sys
import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp3d-c"
VARIANTS = ARGS[1].split(",") if len(ARGS) > 1 else ["day", "night", "memorial"]
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 32
RES = (1280, 960)

sc = bpy.context.scene
GLASS = bpy.data.objects["ENV_bowl_glass"]
GRAVEL = bpy.data.objects["PRP_gravel"]
WATER = bpy.data.objects["ENV_bowl_water"]
WATERLINE = bpy.data.objects["ENV_waterline"]
CATCHER = bpy.data.objects["ENV_shadow_catcher"]
MESHES = [o for o in bpy.data.objects if o.type == 'MESH']
# Objects that never appear in a candidate-C plate, whatever the pass.
ABSENT = {WATER.name, WATERLINE.name}


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
    c.adaptive_min_samples = min(SAMPLES, 24)
    c.max_bounces = 16
    c.transmission_bounces = 24
    c.diffuse_bounces = 6
    c.glossy_bounces = 6
    c.sample_clamp_indirect = 30.0
    c.blur_glossy = 0.2
    # Caustic-ready: the key is allowed to cast caustics through the glass onto the gravel, which is
    # what puts the bright crescent at the back of the bed even with the water absent.
    c.caustics_reflective = True
    c.caustics_refractive = True
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.denoising_quality = 'HIGH'
    try:
        c.denoising_use_gpu = True
    except AttributeError:
        pass


def set_material(ob, name):
    ob.data.materials.clear()
    ob.data.materials.append(bpy.data.materials[name])


def reset_visibility():
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = False
    for o in MESHES:
        o.hide_render = o.name in ABSENT
        o.visible_camera = True
    CATCHER.visible_camera = True
    set_material(GLASS, "WP_glass")
    set_material(GRAVEL, "WP_gravel")
    sc.cycles.film_transparent_glass = False


def only_collection(*names):
    keep = set(names) | {"WP_Rig"}
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = c.name not in keep


# ------------------------------------------------------------------ lighting
LIGHT_DAY = {}


def remember_lights():
    for name in ("LGT_key", "LGT_fill", "LGT_rim"):
        l = bpy.data.objects[name].data
        LIGHT_DAY[name] = (l.energy, tuple(l.color), l.size)
    w = sc.world.node_tree.nodes.get("Background")
    if w is not None:
        LIGHT_DAY["world"] = (w.inputs["Strength"].default_value, tuple(w.inputs["Color"].default_value))


def bounce_light():
    """A broad, weak, warm card under the front of the bowl: the desk bouncing the key back up into the
    stand and the underside of the gravel dish. Motivated by the shadow catcher plane, which is the
    desk. Added to the rig for both variants."""
    name = "LGT_bounce_c"
    ob = bpy.data.objects.get(name)
    if ob is None:
        data = bpy.data.lights.new(name, 'AREA')
        ob = bpy.data.objects.new(name, data)
        bpy.data.collections["WP_Rig"].objects.link(ob)
    ob.data.shape = 'SQUARE'
    ob.data.size = 2.4
    ob.location = (0.0, -0.75, -0.55)
    ob.rotation_euler = (-0.45, 0.0, 0.0)   # tilted to look up and back at the bowl
    return ob


def rig(variant):
    key, fill, rim = (bpy.data.objects[n].data for n in ("LGT_key", "LGT_fill", "LGT_rim"))
    bounce = bounce_light().data
    w = sc.world.node_tree.nodes.get("Background")
    if variant == "night":
        # Moonlight: one cool, soft, dim key from high left; a faint violet fill; a cyan rim from behind
        # that keeps the glass edge readable against a dark desk. Ambient falls to a blue trace.
        key.energy, key.color, key.size = 16.0, (0.62, 0.72, 1.0), 1.1
        fill.energy, fill.color = 4.0, (0.40, 0.42, 0.95)
        rim.energy, rim.color = 26.0, (0.45, 0.78, 1.0)
        bounce.energy, bounce.color = 1.2, (0.5, 0.6, 1.0)
        if w is not None:
            s, c = LIGHT_DAY["world"]
            w.inputs["Strength"].default_value = s * 0.14
            w.inputs["Color"].default_value = (c[0] * 0.55, c[1] * 0.65, c[2] * 1.0, 1.0)
    else:
        for name in ("LGT_key", "LGT_fill", "LGT_rim"):
            e, c, s = LIGHT_DAY[name]
            l = bpy.data.objects[name].data
            l.energy, l.color, l.size = e, c, s
        bounce.energy, bounce.color = 9.0, (1.0, 0.93, 0.82)
        if w is not None:
            s, c = LIGHT_DAY["world"]
            w.inputs["Strength"].default_value = s
            w.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)


# ------------------------------------------------------------- mask + world
def build_mask_materials():
    m = bpy.data.materials.get("WP_mask_solid")
    if m is None:
        m = bpy.data.materials.new("WP_mask_solid")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    lt = nt.nodes.new("ShaderNodeMath")
    lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = 0.0
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], lt.inputs[0])
    nt.links.new(lt.outputs[0], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs[0], out.inputs[0])
    c = bpy.data.materials.get("WP_mask_clear")
    if c is None:
        c = bpy.data.materials.new("WP_mask_clear")
    c.use_nodes = True
    nt2 = c.node_tree
    nt2.nodes.clear()
    out2 = nt2.nodes.new("ShaderNodeOutputMaterial")
    ref = nt2.nodes.new("ShaderNodeBsdfRefraction")
    ref.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    ref.inputs["Roughness"].default_value = 0.0
    ref.inputs["IOR"].default_value = 1.45
    nt2.links.new(ref.outputs[0], out2.inputs[0])


def black_world():
    w = bpy.data.worlds.get("WP_BlackWorld")
    if w is None:
        w = bpy.data.worlds.new("WP_BlackWorld")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    bg.inputs["Strength"].default_value = 0.0
    nt.links.new(bg.outputs[0], o.inputs[0])
    return w


def shoot(path):
    sc.camera = bpy.data.objects["CAM_bowl"]
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.frame_set(1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)


def bowl_passes(stage, memorial=False):
    colls = ("WP_Bowl", "WP_Memorial") if memorial else ("WP_Bowl",)
    # bg, twice: with the catcher (for the contact shadow) and without.
    reset_visibility()
    only_collection(*colls)
    if memorial:
        set_material(WATER, "WP_water_memorial")  # hidden anyway; kept for parity
    shoot(os.path.join(stage, "_bg_shadow.png"))
    CATCHER.hide_render = True
    shoot(os.path.join(stage, "_bg_clean.png"))
    CATCHER.hide_render = False

    # near/far matte through the (empty) glass.
    reset_visibility()
    only_collection(*colls)
    saved = {o.name: [m.name if m else None for m in o.data.materials] for o in MESHES}
    build_mask_materials()
    for o in MESHES:
        set_material(o, "WP_mask_clear" if o.name == GLASS.name else "WP_mask_solid")
    CATCHER.hide_render = True
    old_world = sc.world
    sc.world = black_world()
    sc.render.film_transparent = False
    old_s = sc.cycles.samples
    sc.cycles.samples = max(24, SAMPLES // 2)
    shoot(os.path.join(stage, "_mask.png"))
    sc.cycles.samples = old_s
    sc.render.film_transparent = True
    sc.world = old_world
    CATCHER.hide_render = False
    for o in MESHES:
        o.data.materials.clear()
        for mn in saved[o.name]:
            o.data.materials.append(bpy.data.materials[mn] if mn else None)

    # glass: the front half of the shell alone, reflections on alpha.
    reset_visibility()
    only_collection(*colls)
    sc.cycles.film_transparent_glass = True
    set_material(GLASS, "WP_glass_front")
    for o in MESHES:
        o.hide_render = (o.name != GLASS.name)
    shoot(os.path.join(stage, "_glass.png"))
    reset_visibility()


print("WP_GPU %s" % (use_gpu(),), flush=True)
base()
remember_lights()
for v in VARIANTS:
    if v == "memorial":
        rig("day")
        bowl_passes(os.path.join(OUT, "memorial"), memorial=True)
    else:
        rig(v)
        bowl_passes(os.path.join(OUT, v))
print("WP_DONE", flush=True)
