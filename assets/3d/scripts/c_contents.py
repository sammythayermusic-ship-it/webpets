"""Candidate C: the CONTENTS mask of the bowl, for the live water pass.

    Blender -b wp_scene.blend -P c_contents.py -- <out_png> [samples]

Renders CAM_bowl with the glass, the water and the waterline hidden, film transparent, and writes
the ALPHA as an 8-bit grey PNG (1280x960, 4x the grid): 1 where gravel, pebbles, plants or the stand
are directly visible, 0 where the camera looks through the (absent) glass at nothing. The live
water shader uses it to decide, per pixel, whether the bg plate holds a thing (keep it, tinted by
the water) or the back wall of an empty glass shell (replace it with the water body). Nothing in
the bg plate's alpha can tell those apart: the glass is opaque to the film.

Nothing here saves the .blend.
"""
import os
import sys
import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp3d-c/contents.png"
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 16

sc = bpy.context.scene
HIDE = {"ENV_bowl_glass", "ENV_bowl_water", "ENV_waterline", "ENV_shadow_catcher"}

try:
    p = bpy.context.preferences.addons['cycles'].preferences
    p.compute_device_type = 'METAL'
    p.get_devices()
    for d in p.devices:
        d.use = (d.type == 'METAL')
    sc.cycles.device = 'GPU'
except Exception as exc:  # noqa: BLE001
    print("WP_GPU CPU: %s" % exc)

sc.render.engine = 'CYCLES'
sc.render.film_transparent = True
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 1280, 960
sc.render.resolution_percentage = 100
sc.render.filter_size = 1.5
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.color_depth = '8'
for c in bpy.data.collections:
    if c.name.startswith("WP_"):
        c.hide_render = c.name not in ("WP_Bowl", "WP_Rig")
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = o.name in HIDE
sc.camera = bpy.data.objects["CAM_bowl"]
sc.frame_set(1)
stage = OUT + ".rgba.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sc.render.filepath = stage
bpy.ops.render.render(write_still=True)

# alpha -> grey, via Blender's own image API so this needs no PIL
img = bpy.data.images.load(stage)
w, h = img.size
px = list(img.pixels)
grey = bpy.data.images.new("wp_contents", w, h, alpha=False)
out = [0.0] * (w * h * 4)
for i in range(w * h):
    a = px[i * 4 + 3]
    out[i * 4] = a
    out[i * 4 + 1] = a
    out[i * 4 + 2] = a
    out[i * 4 + 3] = 1.0
grey.pixels = out
grey.filepath_raw = OUT
grey.file_format = 'PNG'
sc.render.image_settings.color_mode = 'BW'
grey.save_render(OUT, scene=sc)
os.remove(stage)
print("WP_WROTE %s" % OUT, flush=True)
print("WP_DONE", flush=True)
