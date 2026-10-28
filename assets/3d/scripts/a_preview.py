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
    C.rig(False)
    C.shoot("CAM_fish", (320, 320), os.path.join(OUT, "fish_idle_1.png"), frame=1)
    C.shoot("CAM_fish", (640, 640), os.path.join(OUT, "fish_idle_big.png"), frame=3, subframe=0.5)
if "loop" in JOBS:
    C.show_collections("WP_Bowl", "WP_Rig")
    C.rig(False)
    for f in (LOOP, LOOP + 24, LOOP + 48):
        C.shoot("CAM_bowl", (1280, 960), os.path.join(OUT, "loop_%d.png" % (f - LOOP)), frame=f)
print("WP_DONE", flush=True)
