"""Candidate C: export the fish and the water body from wp_scene.blend as glTF for the live layer.

    Blender -b wp_scene.blend -P c_export.py -- <out_dir>

Writes <out_dir>/fish.glb (every HERO_fish_* mesh, modifiers applied, with its Principled material)
and <out_dir>/water.glb (ENV_bowl_water + ENV_waterline). Y-up as glTF wants; the app's mapping
module converts Blender's Z-up bowl frame.

Also writes <out_dir>/fish-rig.json: each part's name, its matrix relative to RIG_fish_root and its
bbox in root space, so the TypeScript spine knows where the nose, the tail hinge and the fin roots
are without guessing from the geometry.
"""
import json
import os
import sys
import bpy
from mathutils import Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp3d-c-export"
os.makedirs(OUT, exist_ok=True)

sc = bpy.context.scene
sc.frame_set(1)  # the idle pose's first frame: root and tail rest rotations


def select_only(names):
    bpy.ops.object.select_all(action='DESELECT')
    for n in names:
        o = bpy.data.objects[n]
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]


def export(names, path):
    select_only(names)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,          # subsurf + solidify baked into the mesh
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print("WP_WROTE %s (%d bytes)" % (path, os.path.getsize(path)), flush=True)


FISH = [o.name for o in bpy.data.objects if o.name.startswith("HERO_fish_")]
# The two rig empties go too, so the glTF keeps the hierarchy: RIG_fish_root > HERO_fish_body > fins,
# eyes, mouth; RIG_fish_tail > HERO_fish_tail. The live layer bends everything in the root's frame.
export(["RIG_fish_root", "RIG_fish_tail"] + FISH, os.path.join(OUT, "fish.glb"))
# A lighter copy for shipping: one subdivision level instead of two. The fish is at most ~190 CSS px
# long on screen, and smooth normals carry the curvature at that size.
for n in FISH:
    for m in bpy.data.objects[n].modifiers:
        if m.type == 'SUBSURF':
            m.render_levels = 1
            m.levels = 1
export(["RIG_fish_root", "RIG_fish_tail"] + FISH, os.path.join(OUT, "fish-lite.glb"))
export(["ENV_bowl_water", "ENV_waterline"], os.path.join(OUT, "water.glb"))

root = bpy.data.objects["RIG_fish_root"]
root_inv = root.matrix_world.inverted()
rig = {"root_world": [list(r) for r in root.matrix_world], "parts": {}}
for n in FISH:
    o = bpy.data.objects[n]
    rel = root_inv @ o.matrix_world
    bb = [rel @ Matrix.Translation((0, 0, 0)) @ __import__('mathutils').Vector(v) for v in o.bound_box]
    rig["parts"][n] = {
        "matrix_root": [list(r) for r in rel],
        "bbox_root": [[round(min(v[i] for v in bb), 5), round(max(v[i] for v in bb), 5)] for i in range(3)],
        "material": o.data.materials[0].name if o.data.materials else None,
    }
tail = bpy.data.objects["RIG_fish_tail"]
rig["tail_hinge_root"] = list(root_inv @ tail.matrix_world.translation)
with open(os.path.join(OUT, "fish-rig.json"), "w") as f:
    json.dump(rig, f, indent=1)
print("WP_DONE", flush=True)
