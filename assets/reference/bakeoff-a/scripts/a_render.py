"""Bake-off candidate A: render every delivery from the look-dev copy of the scene.

    Blender -b assets/3d/wp_scene-a-look.blend -P assets/3d/scripts/a_render.py -- <stage_dir> <jobs> [samples]

jobs, comma separated:
  glass    the two glass passes (day, night) alone at 160 samples: alpha is not denoised
  plates   the day bowl: _full, _bg_shadow, _mask, _glass (the clean bg plate is loop frame 0)
  night    the night bowl: _nbg_shadow, _nbg_clean, _nglass under WP_RigNight and the night world
  memorial the day memorial backdrop: _mem_shadow, _mem_clean
  fish     all eight states at 24 fps: every integer key frame and the half-frame between, so the
           12 fps rig yields double the frames with no re-animation
  loop     the day water loop: LOOP_FRAMES clean bg renders with the ripple and the caustics moving
  nloop    the same under the night rig

The passes mirror wp_render2.py (same five-pass bowl, same mask trick, same reasons); a_finish.py
turns the stage into the shipped files. Static plates are rendered AT the loop's first frame so the
still bowl and frame 0 of the loop are the same picture.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import a_common as C

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp-a-stage"
JOBS = ARGS[1].split(",") if len(ARGS) > 1 else ["plates", "night", "memorial", "fish", "loop", "nloop"]
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 32

BOWL_RES = (1280, 960)
FISH_RES = (320, 320)
# (state, first key frame, 12 fps key count). Keys run first..first+count with a closing key at
# first+count that equals the first, so the half-frame after the last key is a real in-between.
STATES = [("idle", 1, 12), ("eat", 101, 8), ("sleep", 201, 6),
          ("hungry", 301, 8), ("dead", 401, 6), ("happy", 501, 8),
          ("excited", 601, 8), ("curious", 701, 6)]

sc = bpy.context.scene
LOOP = int(sc["wp_loop_first"])
LOOP_N = int(sc["wp_loop_frames"])
GLASS = bpy.data.objects["ENV_bowl_glass"]
WATER = bpy.data.objects["ENV_bowl_water"]
GRAVEL = bpy.data.objects["PRP_gravel"]
CATCHER = bpy.data.objects["ENV_shadow_catcher"]
MESHES = [o for o in bpy.data.objects if o.type == 'MESH']


def set_material(ob, name):
    ob.data.materials.clear()
    ob.data.materials.append(bpy.data.materials[name])


def reset():
    C.show_collections("WP_Bowl", "WP_Rig")
    CATCHER.hide_render = False
    CATCHER.visible_camera = True
    set_material(GLASS, "WP_glass")
    set_material(GRAVEL, "WP_gravel")
    set_material(WATER, "WP_water")
    sc.cycles.film_transparent_glass = False
    sc.render.use_border = False


def bowl_passes(stage, prefix, night):
    """shadow + clean beauty passes (+ the glass pass) for one lighting rig."""
    reset()
    C.show_collections("WP_Bowl", "WP_RigNight" if night else "WP_Rig")
    C.rig(night)
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, prefix + "bg_shadow.png"), frame=LOOP)
    CATCHER.hide_render = True
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, prefix + "bg_clean.png"), frame=LOOP)
    CATCHER.hide_render = False
    # glass: the front half of the shell alone, every other mesh fully hidden (a refracted ray is not
    # a camera ray; see wp_render2.py), film_transparent_glass so only the Fresnel carries alpha.
    sc.cycles.film_transparent_glass = True
    set_material(GLASS, "WP_glass_front")
    for o in MESHES:
        o.hide_render = (o.name != "ENV_bowl_glass")
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, prefix + "glass.png"), frame=LOOP)
    reset()


def build_mask_materials():
    """Near/far matte materials, as in wp_render2.py: white nearer than the fish plane, black beyond,
    with the glass and water as pure refractors so the matte lines up with the beauty pixel for pixel."""
    m = bpy.data.materials.get("WP_mask_solid") or bpy.data.materials.new("WP_mask_solid")
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
    c = bpy.data.materials.get("WP_mask_clear") or bpy.data.materials.new("WP_mask_clear")
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
    w = bpy.data.worlds.get("WP_BlackWorld") or bpy.data.worlds.new("WP_BlackWorld")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    bg.inputs["Strength"].default_value = 0.0
    nt.links.new(bg.outputs[0], o.inputs[0])
    return w


def mask_pass(stage):
    reset()
    C.rig(False)
    saved = {o.name: [m.name if m else None for m in o.data.materials] for o in MESHES}
    build_mask_materials()
    for o in MESHES:
        set_material(o, "WP_mask_clear" if o.name in ("ENV_bowl_glass", "ENV_bowl_water") else "WP_mask_solid")
    CATCHER.hide_render = True
    old_world = sc.world
    sc.world = black_world()
    sc.render.film_transparent = False
    old_s = sc.cycles.samples
    sc.cycles.samples = max(48, SAMPLES)
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mask.png"), frame=LOOP)
    sc.cycles.samples = old_s
    sc.render.film_transparent = True
    sc.world = old_world
    CATCHER.hide_render = False
    for o in MESHES:
        o.data.materials.clear()
        for mn in saved[o.name]:
            o.data.materials.append(bpy.data.materials[mn] if mn else None)
    reset()


# The loop ships cropped to the inside of the glass (a_finish.REGION, art px 308..972 x 76..732), so
# only that part of each frame is rendered: a border with a 16 px margin, the rest of the frame left
# empty, which is ~40% of the pixels and ~2.5x the frames per hour. Border y is bottom-up.
LOOP_BORDER = (292 / 1280.0, 988 / 1280.0, 1.0 - 748 / 960.0, 1.0 - 60 / 960.0)


def loop_pass(stage, prefix, night):
    reset()
    C.show_collections("WP_Bowl", "WP_RigNight" if night else "WP_Rig")
    C.rig(night)
    CATCHER.hide_render = True
    sc.render.use_border = True
    sc.render.use_crop_to_border = False
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = LOOP_BORDER
    for i in range(LOOP_N):
        path = os.path.join(stage, prefix, "%s_%04d.png" % (prefix.strip("/"), i + 1))
        # Resumable: a loop is an hour of GPU and a session can be cut off in the middle of it. A
        # frame that is already on disk is the same frame (same scene file, same seed) and is kept.
        if os.path.exists(path) and os.path.getsize(path) > 0:
            print("WP_KEPT %s" % path, flush=True)
            continue
        C.shoot("CAM_bowl", BOWL_RES, path, frame=LOOP + i)
    sc.render.use_border = False
    CATCHER.hide_render = False
    reset()


print("WP_GPU %s" % (C.use_gpu(),), flush=True)
C.base(SAMPLES)
stage = os.path.join(OUT, "bowl")

if "plates" in JOBS:
    reset()
    C.rig(False)
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_full.png"), frame=LOOP)
    bowl_passes(stage, "_", night=False)
    mask_pass(stage)

if "night" in JOBS:
    bowl_passes(stage, "_n", night=True)

if "glass" in JOBS:
    # The glass passes alone at a higher sample count. Their alpha is the Fresnel of a transparent
    # film and the denoiser does not touch alpha, so at 32 samples the front glass is a static grain
    # over everything behind it; two frames at 160 cost a minute and the grain is gone.
    old = sc.cycles.samples
    sc.cycles.samples = 160
    sc.cycles.adaptive_min_samples = 160
    for prefix, night in (("_", False), ("_n", True)):
        reset()
        C.show_collections("WP_Bowl", "WP_RigNight" if night else "WP_Rig")
        C.rig(night)
        sc.cycles.film_transparent_glass = True
        set_material(GLASS, "WP_glass_front")
        for o in MESHES:
            o.hide_render = (o.name != "ENV_bowl_glass")
        C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, prefix + "glass.png"), frame=LOOP)
        reset()
    sc.cycles.samples = old
    sc.cycles.adaptive_min_samples = min(64, old)

if "memorial" in JOBS:
    reset()
    C.show_collections("WP_Bowl", "WP_Memorial", "WP_Rig")
    C.rig(False)
    set_material(WATER, "WP_water_memorial")
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mem_shadow.png"), frame=LOOP)
    CATCHER.hide_render = True
    C.shoot("CAM_bowl", BOWL_RES, os.path.join(stage, "_mem_clean.png"), frame=LOOP)
    CATCHER.hide_render = False
    reset()

if "fish" in JOBS or any(s[0] in JOBS for s in STATES):
    reset()
    C.show_collections("WP_Fish", "WP_Rig")
    C.rig(False, fish=True)
    wanted = [s for s in STATES if "fish" in JOBS or s[0] in JOBS]
    for name, first, count in wanted:
        n = 0
        for i in range(count):
            for sub in (0.0, 0.5):
                n += 1
                C.shoot("CAM_fish", FISH_RES,
                        os.path.join(OUT, "fish", name, "%s_%04d.png" % (name, n)),
                        frame=first + i, subframe=sub)
    reset()

if "loop" in JOBS:
    loop_pass(OUT, "loop", night=False)

if "nloop" in JOBS:
    loop_pass(OUT, "nloop", night=True)

print("WP_DONE", flush=True)
