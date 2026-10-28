"""Candidate A diagnostic: does Cycles' MNEE (shadow caustics) contribute anything on the gravel?

    Blender -b assets/3d/wp_scene-a-look.blend -P assets/3d/scripts/a_diag_caustic.py -- <out_dir> [samples]

Renders a border crop of the gravel under several variants and prints the mean absolute difference
of each against the caustics-off render, so the answer is a number rather than an impression.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import a_common as C

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp-a-caustic"
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 48
sc = bpy.context.scene
LOOP = int(sc["wp_loop_first"])
print("WP_GPU", C.use_gpu(), flush=True)
C.base(SAMPLES)
C.show_collections("WP_Bowl", "WP_Rig")
C.rig(False)
sc.render.use_border = True
sc.render.use_crop_to_border = True
sc.render.border_min_x, sc.render.border_max_x = 0.30, 0.70
sc.render.border_min_y, sc.render.border_max_y = 0.30, 0.50

key = bpy.data.objects["LGT_key"]
glass = bpy.data.objects["ENV_bowl_glass"]
water = bpy.data.objects["ENV_bowl_water"]
wmat = bpy.data.materials["WP_water"]
gmat = bpy.data.materials["WP_glass"]
world = sc.world


def load(p):
    im = bpy.data.images.load(p)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
    bpy.data.images.remove(im)
    return px[:, :, :3]


def shot(name):
    p = os.path.join(OUT, name + ".png")
    C.shoot("CAM_bowl", (1280, 960), p, frame=LOOP)
    return load(p)


results = {}
key.data.cycles.is_caustics_light = False
off = shot("off")
key.data.cycles.is_caustics_light = True
results["on"] = shot("on")
# no glass as caster: water only
glass.cycles.is_caustics_caster = False
results["water_only"] = shot("water_only")
glass.cycles.is_caustics_caster = True
# world off, so the gravel is lit by the key alone and any caustic is the whole picture
bg = world.node_tree.nodes["Background"].inputs["Strength"]
old = bg.default_value
bg.default_value = 0.0
results["no_world_on"] = shot("no_world_on")
key.data.cycles.is_caustics_light = False
results["no_world_off"] = shot("no_world_off")
key.data.cycles.is_caustics_light = True
bg.default_value = old
# a point light instead of the area, world still on
key.data.type = 'POINT'
key.data.shadow_soft_size = 0.08
results["point_on"] = shot("point_on")
key.data.cycles.is_caustics_light = False
results["point_off"] = shot("point_off")

print("WP_DIAG samples=%d" % SAMPLES)
for k, v in results.items():
    ref = off
    if k == "no_world_on":
        ref = results["no_world_off"]
    if k == "point_on":
        ref = results["point_off"]
    d = np.abs(v - ref)
    print("WP_DIAG %-14s mean=%.4f p99=%.4f max=%.3f  brightness=%.4f" % (k, d.mean(), np.percentile(d, 99), d.max(), v.mean()))
