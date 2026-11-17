"""Step 4 (animation quality): the hamster states it was missing, keyed onto the same rig and rendered
the same way as wp_cage.py's six.

    Blender -b wp_scene.blend -P h_anim.py -- <out_dir> <states|all|check> <samples>

States (frames, then whether it loops):
  turn 7      a real turn: yaw from facing right (-50 deg) through facing you (-90) to the mirror of
              facing right (-130), so its last frame IS the flipped first frame and the player can
              hand over to the mirrored sprite with nothing jumping
  liedown 8   idle -> sleep, with a yawn on the way down
  wake 6      sleep -> idle, with a stretch
  die 8       idle -> dead: a wobble, then it topples onto its side, with a small settle
  startle 5   a flinch: crouch, jump, land
  dig 6 loop  making its bed: head down, front paws scraping in turn
  drink 6 loop  up on its hind legs at the bottle's spout, licking
  run 8 loop  a bound in place, for the wheel
  eat 8 loop  the old chew, now with cheek pouches that fill and bounce
`check` renders frame 1001 (idle's first) to compare with the shipped idle_0001.png.

Keyed in NEW frame blocks from 2001 on, every channel keyed in every block, LINEAR, as wp_cage.py
does, so no block bleeds into another and the shipped states' frames are untouched. The .blend is
never saved. Every oscillator is a cosine or carries a phase offset, for the reason wp_cage.py's
animate_hamster gives (a loop's first and middle frames must not land on the same pose).
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp-anim"
JOBS = ARGS[1].split(",") if len(ARGS) > 1 else ["all"]
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 128
RES = (320, 320)
HAM_YAW = math.radians(-50.0)
# wp_cage.py: WALK_STRIDE_PX 20 at 0.440 m / 320 px, divided by HAM_SCALE 1.18, quarter-stride amp.
FOOT_AMP = (20.0 / 4.0) * (0.440 / 320.0) / 1.18

sc = bpy.context.scene
O = bpy.data.objects
rig = O["RIG_ham_root"]
body = O["HERO_ham_body"]
ears = [O["HERO_ham_ear_l"], O["HERO_ham_ear_r"]]
eyes = [O["HERO_ham_eye_l"], O["HERO_ham_eye_r"], O["HERO_ham_glint_l"], O["HERO_ham_glint_r"]]
cheeks = [O["HERO_ham_cheek_l"], O["HERO_ham_cheek_r"]]
limbs = {n: O[f"HERO_ham_{n}"] for n in ("paw_l", "paw_r", "foot_l", "foot_r")}
seed = O.get("HERO_ham_seed")

# The rest pose, read off idle's first frame where every oscillator is at a known value.
sc.frame_set(1001)
Z0 = rig.location.z - 0.0012 * math.sin(0.0)
X0, Y0 = rig.location.x, rig.location.y
EAR0 = [e.rotation_euler[1] for e in ears]
LIMB0 = {n: tuple(o.location) for n, o in limbs.items()}
CHEEK0 = [tuple(c.scale) for c in cheeks]

STATES = []  # (name, first frame, count, loop)


def pose(**kw):
    """A full pose with every channel at rest unless given."""
    p = dict(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, sx=1.0, sz=1.0, ear=0.0, eye=1.0, cheek=1.0,
             seed=0.0, limbs=None)
    p.update(kw)
    if p["limbs"] is None:
        p["limbs"] = {n: (0.0, 0.0, 0.0) for n in limbs}
    return p


def key(f, p):
    """Key one frame: rig placement relative to rest, yaw relative to facing right, body squash,
    ears relative to their rest pitch, the blink, cheek pouches, the seed, and limb offsets."""
    rig.location = (X0 + p["x"], Y0 + p["y"], Z0 + p["z"])
    rig.rotation_euler = (p["rx"], p["ry"], HAM_YAW + p["rz"])
    rig.keyframe_insert("location", frame=f)
    rig.keyframe_insert("rotation_euler", frame=f)
    body.scale = (p["sx"], body.scale[1], p["sz"])
    body.keyframe_insert("scale", frame=f)
    for e, base in zip(ears, EAR0):
        r = e.rotation_euler
        e.rotation_euler = (r[0], base + p["ear"], r[2])
        e.keyframe_insert("rotation_euler", frame=f)
    for e in eyes:
        e.scale = (e.scale[0], e.scale[1], p["eye"])
        e.keyframe_insert("scale", frame=f)
    for c, base in zip(cheeks, CHEEK0):
        c.scale = tuple(v * p["cheek"] for v in base)
        c.keyframe_insert("scale", frame=f)
    if seed is not None:
        seed.scale = (p["seed"],) * 3
        seed.keyframe_insert("scale", frame=f)
    for n, o in limbs.items():
        b = LIMB0[n]
        d = p["limbs"][n]
        o.location = (b[0] + d[0], b[1] + d[1], b[2] + d[2])
        o.keyframe_insert("location", frame=f)


def block(name, f0, n, loop, fn):
    for i in range(n):
        key(f0 + i, fn(i, n))
    STATES.append((name, f0, n, loop))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def mix(p, q, t):
    out = {}
    for k in p:
        if k == "limbs":
            out[k] = {n: tuple(lerp(p[k][n][i], q[k][n][i], t) for i in range(3)) for n in p[k]}
        else:
            out[k] = lerp(p[k], q[k], t)
    return out


R = math.radians
IDLE = pose()
# sleep's frame 0, from wp_cage.py's sleep block at t = 0
SLEEP = pose(ry=R(7.8), z=-0.0105 + 0.0022, sz=0.88 + 0.034, sx=1.10 - 0.020, ear=R(32.5), eye=0.06,
             rz=R(1.5 * math.sin(0.7)))
DEAD = pose(rx=R(84), ry=R(-8), z=-0.0135, ear=R(14), eye=0.05)


def paws(dx_l, dz_l, dx_r=None, dz_r=None, fx_l=0.0, fz_l=0.0, fx_r=None, fz_r=None):
    dx_r = dx_l if dx_r is None else dx_r
    dz_r = dz_l if dz_r is None else dz_r
    fx_r = fx_l if fx_r is None else fx_r
    fz_r = fz_l if fz_r is None else fz_r
    return {"paw_l": (dx_l, 0.0, dz_l), "paw_r": (dx_r, 0.0, dz_r), "foot_l": (fx_l, 0.0, fz_l), "foot_r": (fx_r, 0.0, fz_r)}


# ---- turn: right -> facing you -> mirrored right ----------------------------------------------
def turn(i, n):
    t = i / (n - 1)
    s = smooth(t)
    # a little hop in the middle of the turn, and the ears trailing the head by a frame
    hop = math.sin(math.pi * t)
    return pose(rz=R(-80.0) * s, z=0.0018 * hop, sz=1.0 + 0.03 * hop, sx=1.0 - 0.02 * hop,
                ear=R(10.0) * math.sin(math.pi * max(0.0, t - 0.15) / 0.85) if t > 0.15 else 0.0,
                limbs=paws(0.0, 0.002 * hop, fz_l=0.0016 * hop))


# ---- liedown: a yawn, then down into the curl -------------------------------------------------
def liedown(i, n):
    t = i / (n - 1)
    yawn = math.sin(math.pi * min(1.0, t / 0.45)) if t < 0.45 else 0.0
    down = smooth((t - 0.3) / 0.7)
    p = mix(IDLE, SLEEP, down)
    p["ry"] += R(-9.0) * yawn          # nose up for the yawn
    p["eye"] = lerp(1.0 - 0.75 * yawn, 0.06, down)
    p["sz"] += 0.03 * yawn
    p["ear"] += R(8.0) * yawn
    return p


# ---- wake: up out of the curl, a long stretch, eyes open ---------------------------------------
def wake(i, n):
    t = i / (n - 1)
    up = smooth(t / 0.6)
    p = mix(SLEEP, IDLE, up)
    stretch = math.sin(math.pi * min(1.0, max(0.0, (t - 0.25) / 0.75)))
    p["sx"] += 0.10 * stretch
    p["sz"] -= 0.06 * stretch
    p["ry"] += R(4.0) * stretch
    p["eye"] = 0.06 if t < 0.2 else lerp(0.5, 1.0, smooth((t - 0.2) / 0.5))
    p["ear"] += R(-10.0) * stretch
    p["limbs"] = paws(0.006 * stretch, 0.0, fx_l=-0.004 * stretch)
    return p


# ---- die: a wobble, then over onto its side with a small settle --------------------------------
def die(i, n):
    t = i / (n - 1)
    if t < 0.3:
        w = t / 0.3
        p = mix(IDLE, pose(sz=0.95, ear=R(12.0), eye=0.5), w)
        p["rz"] += R(4.0) * math.sin(w * math.pi * 2)
        return p
    fall = (t - 0.3) / 0.7
    g = fall * fall                     # it falls, it does not glide
    p = mix(pose(sz=0.95, ear=R(12.0), eye=0.5), DEAD, min(1.0, g))
    if fall > 0.75:                     # it lands a hair past its rest and settles back
        p["rx"] += R(5.0) * math.sin(math.pi * (fall - 0.75) / 0.25)
    return p


# ---- startle: crouch, jump, land ---------------------------------------------------------------
def startle(i, n):
    z = [0.0, -0.0030, 0.0110, 0.0070, -0.0015][i]
    sz = [1.0, 0.90, 1.08, 1.03, 0.93][i]
    sx = [1.0, 1.06, 0.95, 0.98, 1.05][i]
    return pose(z=z, sz=sz, sx=sx, ear=R([0, 20, 38, 30, 14][i]), eye=[1.0, 1.15, 1.25, 1.15, 1.0][i],
                ry=R([0, 5, -10, -5, 3][i]), limbs=paws(0.0, [0, 0, 0.003, 0.002, 0][i], fz_l=[0, 0, 0.0025, 0.001, 0][i]))


# ---- dig: head down, front paws scraping in turn ------------------------------------------------
def dig(i, n):
    t = i / n
    a = math.cos(t * math.tau)
    b = math.cos(t * math.tau + math.pi)
    return pose(ry=R(18.0 + 3.0 * math.cos(t * math.tau * 2 + 0.4)), z=-0.0035, sz=0.95, sx=1.04,
                rz=R(2.5 * math.sin(t * math.tau + 0.8)), ear=R(10.0 + 4.0 * math.cos(t * math.tau + 1.4)),
                limbs=paws(0.0045 * a, 0.0012 * max(0.0, a), 0.0045 * b, 0.0012 * max(0.0, b)))


# ---- drink: up on its hind legs at the spout, licking ------------------------------------------
def drink(i, n):
    t = i / n
    lick = math.cos(t * math.tau)
    return pose(ry=R(-30.0 + 2.5 * lick), z=0.0060 + 0.0006 * lick, sz=1.04, sx=0.97,
                rz=R(1.5 * math.sin(t * math.tau + 0.6)), ear=R(-4.0 + 3.0 * math.cos(t * math.tau + 1.1)),
                eye=0.55 if i == 2 else 0.8,
                limbs=paws(0.002, 0.012 + 0.0015 * lick))


# ---- run: a bound in place (front pair together, hind pair together) ---------------------------
def run(i, n):
    t = i / n
    c = math.cos(t * math.tau)
    s = math.sin(t * math.tau)
    front = (FOOT_AMP * 1.4 * c, 0.0, 0.0035 * max(0.0, s))
    hind = (-FOOT_AMP * 1.4 * c, 0.0, 0.0030 * max(0.0, -s))
    return pose(ry=R(-1.0 + 6.0 * math.cos(t * math.tau + 0.5)), z=0.0010 + 0.0022 * abs(math.cos(t * math.tau + 0.3)),
                sx=1.0 + 0.045 * c, sz=1.0 - 0.03 * c, ear=R(14.0 + 4.0 * math.cos(t * math.tau - 1.2)),
                limbs={"paw_l": front, "paw_r": front, "foot_l": hind, "foot_r": hind})


# ---- eat: the chew, now with the pouches filling and bouncing ----------------------------------
def eat(i, n):
    t = i / n
    chew = math.cos(t * math.tau)
    return pose(ry=R(13.0 + 6.0 * chew), rz=R(2.2 * math.sin(t * math.tau + 1.2)), z=-0.0045 + 0.0022 * chew,
                sz=1.0 + 0.022 * chew, sx=1.0 - 0.010 * chew, seed=1.0,
                ear=R(-6 + 4.0 * math.cos(t * math.tau + 0.6)), eye=0.14 if i == 6 else 1.0,
                # the pouches: full, and bulging a little more on each closing of the jaw, half a
                # cycle behind it (soft things lag)
                cheek=1.22 + 0.07 * math.cos(t * math.tau - 1.3),
                limbs=paws(0.0045 - 0.0018 * chew, 0.0165 + 0.0030 * chew))


BLOCKS = [("turn", 7, False, turn), ("liedown", 8, False, liedown), ("wake", 6, False, wake),
          ("die", 8, False, die), ("startle", 5, False, startle), ("dig", 6, True, dig),
          ("drink", 6, True, drink), ("run", 8, True, run), ("eat", 8, True, eat)]

for k, (name, n, loop, fn) in enumerate(BLOCKS):
    block(name, 2001 + 100 * k, n, loop, fn)
for ob in [rig, body, *ears, *eyes, *cheeks, *limbs.values()] + ([seed] if seed is not None else []):
    for fc in wb.fcurves_of(ob):
        for kp in fc.keyframe_points:
            if kp.co[0] >= 2001:
                kp.interpolation = 'CONSTANT' if ob is seed else 'LINEAR'


# ---- render -------------------------------------------------------------------------------------
def use_gpu():
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception:  # noqa: BLE001
        sc.cycles.device = 'CPU'


use_gpu()
sc.render.engine = 'CYCLES'
sc.render.film_transparent = True
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.002
sc.cycles.adaptive_min_samples = min(SAMPLES, 64)
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.color_depth = '8'
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.resolution_percentage = 100
sc.render.filter_size = 1.5
sc.camera = O["CAM_hamster"]
for c in bpy.data.collections:
    if c.name.startswith("WP_"):
        c.hide_render = c.name not in ("WP_Hamster", "WP_Rig")


def shoot(path, frame):
    sc.frame_set(frame)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WP_WROTE %s" % path, flush=True)


if "check" in JOBS:
    shoot(os.path.join(OUT, "check", "idle_0001.png"), 1001)
for name, f0, n, loop in STATES:
    if "all" in JOBS or name in JOBS:
        for i in range(n):
            shoot(os.path.join(OUT, name, "%s_%04d.png" % (name, i + 1)), f0 + i)
print("WP_STATES " + ";".join("%s:%d:%d" % (s[0], s[2], 1 if s[3] else 0) for s in STATES), flush=True)
print("WP_DONE", flush=True)
