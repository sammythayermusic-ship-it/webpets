"""Background renderer for the WebPets fish-bowl assets.

Run as:
    Blender -b <scene.blend> -P wp_render.py -- <out_root> <jobs>

<jobs> is a comma-separated list of job names: bowl, idle, eat, sleep, review.
"""

import sys
import os
import bpy


ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_ROOT = ARGS[0] if ARGS else "/tmp/wp3d"
JOBS = (ARGS[1].split(",") if len(ARGS) > 1 else ["bowl", "idle"])
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 220

sc = bpy.context.scene


def use_gpu():
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
        return [d.name for d in prefs.devices if d.use]
    except Exception as exc:                     # noqa: BLE001
        sc.cycles.device = 'CPU'
        return "CPU fallback: %s" % exc


def show_only(name):
    for col in bpy.data.collections:
        if col.name.startswith("WP_"):
            hide = col.name not in (name, "WP_Rig")
            col.hide_render = hide
            col.hide_viewport = hide


def base_settings():
    sc.render.engine = 'CYCLES'
    sc.render.film_transparent = True
    sc.cycles.film_transparent_glass = False
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 25
    sc.render.resolution_percentage = 100
    sc.render.use_overwrite = True
    sc.render.filter_size = 1.5


def render_still(camera, res, path, frame=1):
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.frame_set(frame)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path)


def render_seq(camera, res, prefix, first, last):
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.frame_start, sc.frame_end, sc.frame_step = first, last, 1
    os.makedirs(os.path.dirname(prefix), exist_ok=True)
    sc.render.filepath = prefix
    bpy.ops.render.render(animation=True)
    print("WP_WROTE_SEQ %s %d-%d" % (prefix, first, last))


print("WP_GPU %s" % (use_gpu(),))
base_settings()

if "bowl" in JOBS:
    show_only("WP_Bowl")
    bpy.data.objects["ENV_shadow_catcher"].hide_render = False
    render_still("CAM_bowl", (960, 720),
                 os.path.join(OUT_ROOT, "bowl", "_bowl_shadow.png"), frame=1)
    # second pass with no catcher: gives a clean bowl matte so the contact
    # shadow can be isolated and art-directed in the finishing composite
    bpy.data.objects["ENV_shadow_catcher"].hide_render = True
    render_still("CAM_bowl", (960, 720),
                 os.path.join(OUT_ROOT, "bowl", "_bowl_clean.png"), frame=1)
    bpy.data.objects["ENV_shadow_catcher"].hide_render = False

if "fish1" in JOBS:
    show_only("WP_Fish")
    render_still("CAM_fish", (480, 480),
                 os.path.join(OUT_ROOT, "fish", "still.png"), frame=1)

if "idle" in JOBS:
    show_only("WP_Fish")
    render_seq("CAM_fish", (480, 480),
               os.path.join(OUT_ROOT, "fish", "idle", "idle_"), 1, 12)

if "eat" in JOBS:
    show_only("WP_Fish")
    render_seq("CAM_fish", (480, 480),
               os.path.join(OUT_ROOT, "fish", "eat", "eat_"), 101, 108)

if "sleep" in JOBS:
    show_only("WP_Fish")
    render_seq("CAM_fish", (480, 480),
               os.path.join(OUT_ROOT, "fish", "sleep", "sleep_"), 201, 206)

print("WP_DONE")
