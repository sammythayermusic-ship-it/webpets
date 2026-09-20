"""Project the real 3D geometry through the delivery cameras.

Writes the 3D-derived half of the two geometry.json files. Nothing here is
measured off rendered pixels: every number comes from projecting actual mesh
vertices through the orthographic delivery camera, so glass and water are
never confused with each other.

    Blender -b wp_scene.blend -P geom.py -- <out_json_dir>
"""

import sys
import json
import os
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
BOWL_RES = (1280, 960)
FISH_RES = (320, 320)
STATES = [("idle", 1, 12), ("eat", 101, 8), ("sleep", 201, 6),
          ("hungry", 301, 8), ("dead", 401, 6), ("happy", 501, 8),
          ("excited", 601, 8), ("curious", 701, 6)]

sc = bpy.context.scene
for c in bpy.data.collections:
    c.hide_render = False
    c.hide_viewport = False


def project(cam, res, co):
    """World point -> art pixel coordinates for an orthographic camera."""
    n = world_to_camera_view(sc, cam, Vector(co))
    return (n.x * res[0], (1.0 - n.y) * res[1])


def mm_per_px(cam, res):
    return cam.data.ortho_scale / max(res) * 1000.0


def evaluated_verts(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps)
    me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


# --------------------------------------------------------------- bowl ----
cam_b = bpy.data.objects["CAM_bowl"]
sc.frame_set(1)

water = bpy.data.objects["ENV_bowl_water"]
wv = evaluated_verts(water)
water_top_z = max(v.z for v in wv)
# Subdivision domes the flat cap, so selecting "vertices at the top z" returns
# only the centre. Take the cap's outer rim instead: the largest radius inside
# a band below the summit, then project the true near and far edges of the
# surface disc. The camera is tilted 9 degrees, so those differ by ~200 px.
band = [v for v in wv if v.z > water_top_z - 0.006]
surface_r = max((v.x ** 2 + v.y ** 2) ** 0.5 for v in band)
ring_px = [project(cam_b, BOWL_RES, (0.0, -surface_r, water_top_z)),
           project(cam_b, BOWL_RES, (0.0, surface_r, water_top_z))]

gravel = bpy.data.objects["PRP_gravel"]
gv = evaluated_verts(gravel)
# top of the bed at the bowl's centre: highest vertex near the axis
centre_top = max((v.z for v in gv if v.x * v.x + v.y * v.y < 0.020 ** 2),
                 default=0.0)

# inner face of the glass shell = the swimmable cavity. Taken from the water
# body's own maximum radius, which is the inner wall by construction.
inner_r = max((v.x ** 2 + v.y ** 2) ** 0.5 for v in wv)
inner_r_z = max(((v.x ** 2 + v.y ** 2) ** 0.5, v.z) for v in wv)[1]
bottom_z = min(v.z for v in gv)

cx, _ = project(cam_b, BOWL_RES, (0.0, 0.0, inner_r_z))
_, cy = project(cam_b, BOWL_RES, (0.0, 0.0, inner_r_z))
rx = abs(project(cam_b, BOWL_RES, (inner_r, 0.0, inner_r_z))[0] - cx)
ry = abs(project(cam_b, BOWL_RES, (0.0, 0.0, inner_r_z))[1]
         - project(cam_b, BOWL_RES, (0.0, 0.0, inner_r_z + inner_r))[1])

waterline_centre = project(cam_b, BOWL_RES, (0.0, 0.0, water_top_z))
bowl = {
    "resolution": list(BOWL_RES),
    "camera": "CAM_bowl",
    "projection": "orthographic",
    "mmPerPx": round(mm_per_px(cam_b, BOWL_RES), 5),
    "waterlineY": round(waterline_centre[1], 1),
    "waterlineY_nearEdge": round(max(p[1] for p in ring_px), 1),
    "waterlineY_farEdge": round(min(p[1] for p in ring_px), 1),
    "floorY": round(project(cam_b, BOWL_RES, (0.0, 0.0, centre_top))[1], 1),
    "innerEllipse": {"cx": round(cx, 1), "cy": round(cy, 1),
                     "rx": round(rx, 1), "ry": round(ry, 1)},
    "_world": {"waterline_z": round(water_top_z, 5),
               "gravel_top_centre_z": round(centre_top, 5),
               "inner_radius_m": round(inner_r, 5),
               "inner_radius_at_z": round(inner_r_z, 5),
               "bowl_bottom_z": round(bottom_z, 5)},
}

# --------------------------------------------------------------- fish ----
cam_f = bpy.data.objects["CAM_fish"]
body = bpy.data.objects["HERO_fish_body"]
fishcol = bpy.data.collections["WP_Fish"]

bx0 = by0 = 1e9
bx1 = by1 = -1e9
per_state = {}
for name, first, count in STATES:
    sx0 = sy0 = 1e9
    sx1 = sy1 = -1e9
    for f in range(first, first + count):
        sc.frame_set(f)
        for v in evaluated_verts(body):          # body ONLY: no fins, no tail
            px, py = project(cam_f, FISH_RES, v)
            sx0 = min(sx0, px); sx1 = max(sx1, px)
            sy0 = min(sy0, py); sy1 = max(sy1, py)
    per_state[name] = [round(sx0, 1), round(sy0, 1), round(sx1, 1), round(sy1, 1)]
    bx0, by0 = min(bx0, sx0), min(by0, sy0)
    bx1, by1 = max(bx1, sx1), max(by1, sy1)

sc.frame_set(1)
root_px = project(cam_f, FISH_RES, (0.0, 0.0, 0.0))
fish = {
    "resolution": list(FISH_RES),
    "camera": "CAM_fish",
    "projection": "orthographic",
    "mmPerPx": round(mm_per_px(cam_f, FISH_RES), 5),
    "fps": sc.render.fps,
    "facing": "right",
    "bodyBox": [round(bx0, 1), round(by0, 1), round(bx1, 1), round(by1, 1)],
    "bodyBox_perState": per_state,
    "anchor": {"x": round(root_px[0], 2), "y": round(root_px[1], 2),
               "source": "RIG_fish_root at rest, i.e. the mirror axis"},
    "states": {n: {"frames": c, "loop": n not in ("eat",)}
               for n, _, c in STATES},
}

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "_geom_bowl.json"), "w") as fh:
    json.dump(bowl, fh, indent=1)
with open(os.path.join(OUT, "_geom_fish.json"), "w") as fh:
    json.dump(fish, fh, indent=1)
print("WP_GEOM_OK", flush=True)
