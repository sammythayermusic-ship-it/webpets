"""Look-dev previews for candidate A: whole bowl with the fish in it, day and night, plus one
fish frame. Fast and small; not a delivery.

    Blender -b assets/3d/wp_scene-a-look.blend -P assets/3d/scripts/a_preview.py -- <out_dir> [samples] [jobs]
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import a_common as C

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp-a-preview"
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 24
JOBS = ARGS[2].split(",") if len(ARGS) > 2 else ["day", "night", "fish"]
sc = bpy.context.scene
LOOP = sc["wp_loop_first"]

print("WP_GPU", C.use_gpu(), flush=True)
C.base(SAMPLES)
if "day" in JOBS:
    C.show_collections("WP_Bowl", "WP_Fish", "WP_Rig")
    C.rig(False)
    C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "day_full.png"), frame=LOOP)
if "night" in JOBS:
    C.show_collections("WP_Bowl", "WP_Fish", "WP_RigNight")
    C.rig(True)
    C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "night_full.png"), frame=LOOP)
if "fish" in JOBS:
    C.show_collections("WP_Fish", "WP_Rig")
    C.rig(False, fish=True)
    C.shoot("CAM_fish", (320, 320), os.path.join(OUT, "fish_idle_1.png"), frame=1)
    C.shoot("CAM_fish", (640, 640), os.path.join(OUT, "fish_idle_big.png"), frame=3, subframe=0.5)
if "caustic" in JOBS:
    # Is MNEE contributing at all? The same gravel under the key alone, caustics on and off.
    C.show_collections("WP_Bowl", "WP_Rig")
    C.rig(False)
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = 0.26, 0.74
    sc.render.border_min_y, sc.render.border_max_y = 0.24, 0.48
    for on in (True, False):
        bpy.data.lights["LGT_key"].cycles.is_caustics_light = on
        C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "caustic_%s.png" % ("on" if on else "off")), frame=LOOP)
    bpy.data.lights["LGT_key"].cycles.is_caustics_light = True
    sc.render.use_border = False
    sc.render.use_crop_to_border = False
if "gobo" in JOBS:
    # What the caustic projector alone paints: every other light off, world black.
    C.show_collections("WP_Bowl", "WP_Rig")
    C.rig(False)
    saved = {o.name: o.hide_render for o in bpy.data.objects if o.type == 'LIGHT'}
    for o in bpy.data.objects:
        if o.type == 'LIGHT':
            o.hide_render = (o.name != "LGT_caustic")
    bg = sc.world.node_tree.nodes["Background"].inputs["Strength"]
    old = bg.default_value
    bg.default_value = 0.0
    C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "gobo_only.png"), frame=LOOP)
    bg.default_value = old
    for o in bpy.data.objects:
        if o.type == 'LIGHT':
            o.hide_render = saved[o.name]
if "loop" in JOBS:
    C.show_collections("WP_Bowl", "WP_Rig")
    C.rig(False)
    for f in (LOOP, LOOP + 24, LOOP + 48):
        C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "loop_%d.png" % (f - LOOP)), frame=f)
print("WP_DONE", flush=True)
