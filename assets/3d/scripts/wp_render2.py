"""Background renderer: layered bowl + all eight fish states.

    Blender -b wp_scene.blend -P wp_render2.py -- <out_root> <jobs> <samples>

jobs: comma separated from  bowl,fish  (or a single state name)
"""

import sys
import os
import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp3d"
JOBS = ARGS[1].split(",") if len(ARGS) > 1 else ["bowl", "fish"]
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 220

BOWL_RES = (1280, 960)
FISH_RES = (320, 320)
STATES = [("idle", 1, 12), ("eat", 101, 8), ("sleep", 201, 6),
          ("hungry", 301, 8), ("dead", 401, 6), ("happy", 501, 8),
          ("excited", 601, 8), ("curious", 701, 6)]

sc = bpy.context.scene
DECOR = set(sc.get("wp_decor_front", []))
GLASS = bpy.data.objects["ENV_bowl_glass"]
GRAVEL = bpy.data.objects["PRP_gravel"]
CATCHER = bpy.data.objects["ENV_shadow_catcher"]
MESHES = [o for o in bpy.data.objects if o.type == 'MESH']


def use_gpu():
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
        return [d.name for d in p.devices if d.use]
    except Exception as exc:                                   # noqa: BLE001
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


def set_material(ob, name):
    ob.data.materials.clear()
    ob.data.materials.append(bpy.data.materials[name])


def reset_visibility():
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = False
    for o in MESHES:
        o.hide_render = False
        o.visible_camera = True
    CATCHER.visible_camera = True
    set_material(GLASS, "WP_glass")
    set_material(GRAVEL, "WP_gravel")
    set_material(bpy.data.objects["ENV_bowl_water"], "WP_water")
    sc.cycles.film_transparent_glass = False


def only_collection(*names):
    keep = set(names) | {"WP_Rig"}
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = c.name not in keep


def build_mask_materials():
    """Two materials that turn the beauty render into a near/far matte.

    WP_mask_solid emits white on surfaces nearer than the fish plane (y < 0)
    and black beyond it. WP_mask_clear is a plain refraction shader with the
    glass IOR, so the glass and water bend the camera ray exactly as they do
    in the beauty pass but add nothing of their own. The matte therefore lines
    up with the beauty pixel for pixel, refraction included.
    """
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


def shoot(camera, res, path, frame=1):
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.frame_set(frame)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)


print("WP_GPU %s" % (use_gpu(),), flush=True)
base()

if "bowl" in JOBS:
    stage = os.path.join(OUT, "bowl")

    # ---- reference: the complete scene, ordinary glass ---------------------
    reset_visibility()
    only_collection("WP_Bowl")
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_full.png"))

    # ---- bg: the complete bowl with ordinary glass. The front reflections
    #      are divided back out of it in post (see finish2.un_composite), so
    #      the three layers add them exactly once. Suppressing them in the
    #      shader does not work: once Transmission is 1 the Principled
    #      reflection is driven by IOR and Specular IOR Level is ignored.
    #      Rendered twice so the contact shadow can be isolated. ------------
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_bg_shadow.png"))
    CATCHER.hide_render = True
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_bg_clean.png"))
    CATCHER.hide_render = False

    # ---- near/far matte: white wherever the camera ray (refracted exactly as
    #      in the beauty pass) lands on a solid nearer than the fish plane.
    #      decor_front is then cut from the bg pixels themselves, so the
    #      composite is exact by construction rather than re-rendered. -------
    reset_visibility()
    only_collection("WP_Bowl")
    saved_mats = {o.name: [m.name if m else None for m in o.data.materials]
                  for o in MESHES}
    build_mask_materials()
    for o in MESHES:
        if o.name in ("ENV_bowl_glass", "ENV_bowl_water"):
            set_material(o, "WP_mask_clear")    # refracts, contributes nothing
        else:
            set_material(o, "WP_mask_solid")    # white if y<0 else black
    CATCHER.hide_render = True
    old_world = sc.world
    sc.world = black_world()
    sc.render.film_transparent = False
    old_s = sc.cycles.samples
    sc.cycles.samples = max(48, SAMPLES // 4)
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mask.png"))
    sc.cycles.samples = old_s
    sc.render.film_transparent = True
    sc.world = old_world
    CATCHER.hide_render = False
    for o in MESHES:
        o.data.materials.clear()
        for mn in saved_mats[o.name]:
            o.data.materials.append(bpy.data.materials[mn] if mn else None)

    # ---- glass: front half of the shell alone. Every other object is fully
    #      hidden, not merely hidden from camera: a refracted ray is not a
    #      camera ray, so visible_camera=False still lets it hit the water and
    #      come back opaque, which veils the fish. With them gone the ray
    #      escapes to the world and only the Fresnel reflection carries alpha.
    reset_visibility()
    only_collection("WP_Bowl")
    sc.cycles.film_transparent_glass = True
    set_material(GLASS, "WP_glass_front")
    for o in MESHES:
        o.hide_render = (o.name != "ENV_bowl_glass")
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_glass.png"))

    reset_visibility()

if "memorial" in JOBS:
    stage = os.path.join(OUT, "bowl")
    # Same bowl, same camera, same layer role as bg: a full backdrop drawn
    # instead of bg. The marker sits inside the water, so the silhouette and
    # therefore the click-through rect are unchanged, and the glass and
    # decor_front passes stay valid over it.
    reset_visibility()
    only_collection("WP_Bowl", "WP_Memorial")
    set_material(bpy.data.objects["ENV_bowl_water"], "WP_water_memorial")
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mem_shadow.png"))
    CATCHER.hide_render = True
    shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mem_clean.png"))
    CATCHER.hide_render = False
    reset_visibility()

if "fish" in JOBS or any(s[0] in JOBS for s in STATES):
    reset_visibility()
    only_collection("WP_Fish")
    wanted = [s for s in STATES if "fish" in JOBS or s[0] in JOBS]
    for name, first, count in wanted:
        for i in range(count):
            shoot("CAM_fish", FISH_RES,
                  os.path.join(OUT, "fish", name, "%s_%04d.png" % (name, i + 1)),
                  frame=first + i)
    reset_visibility()

print("WP_DONE", flush=True)
