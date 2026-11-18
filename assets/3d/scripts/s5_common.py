"""Step 5 (frog and chicken): what frog.py and chicken.py share.

Render setup, the four light sets (c_plates.py's rigs, as h_plates.py uses them for the hamster
homes), cameras cut from the cage's (same lens, same 34 degree pitch, so a sprite is a literal crop of
its habitat's view), projection into the 320x240 grid, and a small pose-keying kit for an animal made
of parts on one rig (h_anim.py's, generalised).

Nothing here saves the .blend: every Step 5 object is built in the loaded scene by code, each run.
"""
import math
import os
import sys

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402

GRID = (320, 240)
GROUND = -0.049
PITCH = math.radians(34.0)
ORTHO = 0.440               # metres across the 320 px grid, the cage's
M_PER_PX = ORTHO / GRID[0]
FRAME_PX = 80               # the sprite frame, grid px
R = math.radians

sc = bpy.context.scene
CATCHER = bpy.data.objects["ENV_shadow_catcher"]


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = a[0] if a else "/tmp/wp-s5"
    jobs = a[1].split(",") if len(a) > 1 else ["all"]
    samples = int(a[2]) if len(a) > 2 else 96
    return out, jobs, samples


# ------------------------------------------------------------------ render setup
def setup(samples):
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception:  # noqa: BLE001
        sc.cycles.device = 'CPU'
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
    c.adaptive_min_samples = min(samples, 64)
    c.max_bounces = 16
    c.transmission_bounces = 24
    c.diffuse_bounces = 6
    c.glossy_bounces = 6
    c.sample_clamp_indirect = 30.0
    c.blur_glossy = 0.2
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.denoising_quality = 'HIGH'
    try:
        c.denoising_use_gpu = True
    except AttributeError:
        pass
    remember()


def only(*names):
    """Render only these collections (and the rig's lights)."""
    keep = set(n for n in names if n) | {"WP_Rig"}
    for c in bpy.data.collections:
        if c.name.startswith(("WP_", "S5_")):
            c.hide_render = c.name not in keep
    sc.cycles.film_transparent_glass = False
    CATCHER.hide_render = False


def shoot(camera, path, res=(1280, 960), frame=None):
    sc.camera = camera
    sc.render.resolution_x, sc.render.resolution_y = res
    if frame is not None:
        sc.frame_set(frame)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)


def collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        sc.collection.children.link(col)
    return col


# ------------------------------------------------------------------ cameras
def camera(name, ortho, aim, shift=(0.0, 0.0)):
    """An orthographic camera at the cage's pitch and distance, aimed at world point `aim`.

    `shift` moves the picture by grid px (x right, y down) without changing the angle.
    """
    src = bpy.data.objects['CAM_bowl']
    dist = abs(src.location.y)
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        bpy.data.collections["WP_Rig"].objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    cam.data.clip_start = src.data.clip_start
    cam.data.clip_end = src.data.clip_end
    ax, ay, az = aim
    # px right on screen = the camera moving LEFT in world x; px down = the camera moving up its own
    # vertical, which at this pitch is (0, sin, cos) in world.
    dx = -shift[0] * M_PER_PX
    up = shift[1] * M_PER_PX
    cam.location = (ax + dx, src.location.y + ay + up * math.sin(PITCH), az + dist * math.tan(PITCH) + up * math.cos(PITCH))
    cam.rotation_euler = (math.radians(90.0) - PITCH, 0.0, 0.0)
    bpy.context.view_layer.update()
    return cam


def project(cam, co, res=(1280, 960)):
    """World point -> grid px (x, y), y down."""
    sc.render.resolution_x, sc.render.resolution_y = res
    v = world_to_camera_view(sc, cam, Vector(co))
    return [round(v.x * GRID[0], 2), round((1.0 - v.y) * GRID[1], 2)]


def rect_of(cam, obs):
    pts = []
    for ob in obs:
        if ob.type != 'MESH':
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [project(cam, ev.matrix_world @ v.co) for v in me.vertices]
        ev.to_mesh_clear()
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return {"x": round(min(xs), 1), "y": round(min(ys), 1), "w": round(max(xs) - min(xs), 1), "h": round(max(ys) - min(ys), 1)}


# ------------------------------------------------------------------ the four light sets
LIGHT_DAY = {}
LIGHT_POSE = {}
AIM = Vector((0.0, 0.0, 0.25))


def remember():
    for name in ("LGT_key", "LGT_fill", "LGT_rim"):
        o = bpy.data.objects[name]
        LIGHT_POSE[name] = (tuple(o.location), tuple(o.rotation_euler))
        LIGHT_DAY[name] = (o.data.energy, tuple(o.data.color), o.data.size)
    w = sc.world.node_tree.nodes.get("Background")
    if w is not None:
        LIGHT_DAY["world"] = (w.inputs["Strength"].default_value, tuple(w.inputs["Color"].default_value))


def _aim(name, loc):
    o = bpy.data.objects[name]
    o.location = loc
    o.rotation_euler = (AIM - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def light(variant):
    """day | dawn | dusk | night, exactly as h_plates.py lights the hamster homes."""
    key, fill, rim = (bpy.data.objects[n].data for n in ("LGT_key", "LGT_fill", "LGT_rim"))
    w = sc.world.node_tree.nodes.get("Background")
    for name, (loc, rot) in LIGHT_POSE.items():
        o = bpy.data.objects[name]
        o.location = loc
        o.rotation_euler = rot
    if variant == "dawn":
        _aim("LGT_key", (1.05, -0.55, 0.30))
        key.energy, key.color, key.size = 95.0, (1.0, 0.74, 0.56), 0.42
        fill.energy, fill.color = 10.0, (0.55, 0.70, 1.0)
        rim.energy, rim.color = 18.0, (0.6, 0.78, 1.0)
        world = (0.45, (0.85, 0.9, 1.0))
    elif variant == "dusk":
        _aim("LGT_key", (-1.0, 0.35, 0.28))
        key.energy, key.color, key.size = 110.0, (1.0, 0.58, 0.32), 0.40
        fill.energy, fill.color = 9.0, (0.62, 0.52, 0.95)
        rim.energy, rim.color = 30.0, (1.0, 0.62, 0.40)
        world = (0.35, (1.0, 0.8, 0.7))
    elif variant == "night":
        key.energy, key.color, key.size = 16.0, (0.62, 0.72, 1.0), 1.1
        fill.energy, fill.color = 4.0, (0.40, 0.42, 0.95)
        rim.energy, rim.color = 26.0, (0.45, 0.78, 1.0)
        world = (0.14, (0.55, 0.65, 1.0))
    else:
        for name in ("LGT_key", "LGT_fill", "LGT_rim"):
            e, c, s = LIGHT_DAY[name]
            l = bpy.data.objects[name].data
            l.energy, l.color, l.size = e, c, s
        world = (1.0, (1.0, 1.0, 1.0))
    b = bpy.data.objects.get("LGT_bounce_c")
    if b is not None:
        b.data.energy = 0.0
    for o in bpy.data.objects:
        if o.name.startswith("LGT_terr_"):
            o.data.energy = 0.0
    if w is not None:
        s, c = LIGHT_DAY["world"]
        w.inputs["Strength"].default_value = s * world[0]
        w.inputs["Color"].default_value = (c[0] * world[1][0], c[1] * world[1][1], c[2] * world[1][2], 1.0)


# ------------------------------------------------------------------ small builders
def place(ob, loc, rot=(0.0, 0.0, 0.0), scale=None):
    ob.location = loc
    ob.rotation_euler = rot
    if scale is not None:
        ob.scale = scale
    return ob


def ball(name, r, col, mat, loc, rot=(0.0, 0.0, 0.0), seg=20, rings=12):
    """An ellipsoid with radii r = (rx, ry, rz) at loc."""
    ob = wb.sphere(name, r[0], r[1], r[2], col, segments=seg, rings=rings)
    wb.assign(ob, mat)
    return place(ob, loc, rot)


def rod(name, a, b, radius, col, mat, verts=10):
    """A cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    ob = wb.cylinder(name, radius, (b - a).length, col, verts=verts)
    ob.location = (a + b) / 2
    ob.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    wb.assign(ob, mat)
    return ob


def parent(rig, obs):
    for o in obs:
        o.parent = rig


def flag(col, at, name="MEM"):
    """The memorial's tiny flag: a post and a pennant."""
    post_m = bpy.data.materials.get("WP_memorial_post") or wb.toy_material("WP_memorial_post", (0.5, 0.36, 0.2))
    flag_m = bpy.data.materials.get("WP_memorial_flag") or wb.toy_material("WP_memorial_flag", (0.9, 0.9, 0.86))
    x, y, z = at
    post = rod(f"{name}_post", (x, y, z), (x, y, z + 0.034), 0.0011, col, post_m, verts=8)
    pennant = wb.rounded_box(f"{name}_flag", 0.016, 0.0008, 0.010, 0.0003, col)
    pennant.location = (x + 0.008, y, z + 0.028)
    wb.assign(pennant, flag_m)
    return [post, pennant]


# ------------------------------------------------------------------ posing an animal of parts
class Poser:
    """Keys whole poses onto a rig and its parts, one frame block per state.

    channels: the rig's location and rotation (relative to rest), `body` squash (sx, sz), and any
    number of named part channels given as {name: (object, 'loc'|'rot'|'scale', rest)}; a pose sets
    them by name as offsets from rest (loc, rot) or as multipliers (scale).
    """

    def __init__(self, rig, yaw, body, parts):
        self.rig, self.yaw, self.body, self.parts = rig, yaw, body, parts
        self.rest_loc = tuple(rig.location)
        self.rest = {}
        for name, (ob, kind) in parts.items():
            self.rest[name] = tuple(getattr(ob, {'loc': 'location', 'rot': 'rotation_euler', 'scale': 'scale'}[kind]))
        self.body_rest = tuple(body.scale)
        self.states = []
        self.next = 2001

    def pose(self, **kw):
        p = dict(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, sx=1.0, sz=1.0, parts={})
        p.update(kw)
        return p

    def key(self, f, p):
        rig = self.rig
        rig.location = (self.rest_loc[0] + p["x"], self.rest_loc[1] + p["y"], self.rest_loc[2] + p["z"])
        rig.rotation_euler = (p["rx"], p["ry"], self.yaw + p["rz"])
        rig.keyframe_insert("location", frame=f)
        rig.keyframe_insert("rotation_euler", frame=f)
        b = self.body_rest
        self.body.scale = (b[0] * p["sx"], b[1], b[2] * p["sz"])
        self.body.keyframe_insert("scale", frame=f)
        for name, (ob, kind) in self.parts.items():
            rest = self.rest[name]
            v = p["parts"].get(name)
            if kind == 'scale':
                m = (1.0, 1.0, 1.0) if v is None else (v if isinstance(v, tuple) else (v, v, v))
                ob.scale = (rest[0] * m[0], rest[1] * m[1], rest[2] * m[2])
                ob.keyframe_insert("scale", frame=f)
            else:
                d = (0.0, 0.0, 0.0) if v is None else v
                val = (rest[0] + d[0], rest[1] + d[1], rest[2] + d[2])
                if kind == 'loc':
                    ob.location = val
                    ob.keyframe_insert("location", frame=f)
                else:
                    ob.rotation_euler = val
                    ob.keyframe_insert("rotation_euler", frame=f)

    def block(self, name, n, loop, fn):
        f0 = self.next
        for i in range(n):
            self.key(f0 + i, fn(i, n))
        self.states.append((name, f0, n, loop))
        self.next += 100

    def finish(self):
        obs = [self.rig, self.body] + [ob for ob, _ in self.parts.values()]
        for ob in obs:
            for fc in wb.fcurves_of(ob):
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'

    def render(self, cam, out, jobs, key="all"):
        for name, f0, n, loop in self.states:
            if key in jobs or name in jobs:
                for i in range(n):
                    shoot(cam, os.path.join(out, name, "%s_%04d.png" % (name, i + 1)), res=(320, 320), frame=f0 + i)
        print("WP_STATES " + ";".join("%s:%d:%d" % (s[0], s[2], 1 if s[3] else 0) for s in self.states), flush=True)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(p, q, t):
    """Blend two poses made by Poser.pose."""
    out = {}
    for k in p:
        if k == "parts":
            names = set(p[k]) | set(q[k])
            out[k] = {}
            for n in names:
                a, b = p[k].get(n), q[k].get(n)
                if isinstance(a, tuple) or isinstance(b, tuple):
                    a = a if isinstance(a, tuple) else ((0.0, 0.0, 0.0) if a is None else (a, a, a))
                    b = b if isinstance(b, tuple) else ((0.0, 0.0, 0.0) if b is None else (b, b, b))
                    out[k][n] = tuple(lerp(a[i], b[i], t) for i in range(3))
                else:
                    out[k][n] = lerp(1.0 if a is None else a, 1.0 if b is None else b, t)
        else:
            out[k] = lerp(p[k], q[k], t)
    return out
