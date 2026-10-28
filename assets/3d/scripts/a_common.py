"""Shared render setup for the candidate-A scripts (a_preview.py, a_render.py).

Mirrors wp_render2.base()/quality() so the look-dev previews and the deliveries are sampled the
same way; the only knob that moves between them is the sample count."""

import os
import bpy

sc = bpy.context.scene


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


def base(samples):
    sc.render.engine = 'CYCLES'
    sc.render.film_transparent = True
    sc.cycles.samples = samples
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
    c.adaptive_min_samples = min(64, samples)
    c.max_bounces = 16
    c.transmission_bounces = 24
    c.diffuse_bounces = 6
    c.glossy_bounces = 6
    c.volume_bounces = 2
    c.sample_clamp_indirect = 30.0
    c.blur_glossy = 0.2
    c.caustics_reflective = True
    c.caustics_refractive = True
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.denoising_quality = 'HIGH'
    try:
        c.denoising_use_gpu = True
    except AttributeError:
        pass


def show_collections(*names):
    """Render exactly these WP_ collections (plus whatever is not a WP_ collection)."""
    keep = set(names)
    for c in bpy.data.collections:
        if c.name.startswith("WP_"):
            c.hide_render = c.name not in keep
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = False
            o.visible_camera = True


def rig(night):
    """Day rig or night rig, and the matching world."""
    bpy.data.collections["WP_Rig"].hide_render = night
    bpy.data.collections["WP_RigNight"].hide_render = not night
    sc.world = bpy.data.worlds[sc["wp_night_world"]] if night else bpy.data.worlds["WP_World"]


def shoot(camera, res, path, frame=1, subframe=0.0):
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.frame_set(int(frame), subframe=subframe)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)
