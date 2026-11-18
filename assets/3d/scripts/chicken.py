"""Step 5: the chicken (a chick, then a hen), its brooder and its coop.

    Blender -b wp_scene.blend -P chicken.py -- <out_dir> <jobs> <samples>

jobs, comma separated:
  brooder, coop   the habitat plates for day, dawn, dusk and night (bg and decor_front), and the day
                  memorial
  chick, hen      every state of each as 320x320 frames
  geom            measured positions in grid px, as <out>/chicken-geom.json
  all             everything

Built from primitives by code, in the loaded scene, every run; nothing is saved into the .blend.
Both birds face +X and are turned 50 degrees toward the camera, like the hamster. Each is parts on a
rig with two joints: `upper` (everything above the legs, pivoting at the hips, so a peck tips the
body while the feet stay put) and `head` (pivoting at the base of the neck). Metres, Z up.
"""
import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402
import s5_common as s5  # noqa: E402
from s5_common import R, GROUND, ball, rod, smooth, mix  # noqa: E402

OUT, JOBS, SAMPLES = s5.args()
ALL = "all" in JOBS
VARIANTS = os.environ.get("WP_VARIANTS", "day,dawn,dusk,night").split(",")
rng = random.Random(11)
YAW = R(-50.0)


def materials():
    m = {}
    m['wood'] = bpy.data.materials["WP_terr_wood"]
    m['wood_dark'] = bpy.data.materials["WP_terr_wood_dark"]
    m['metal'] = wb.toy_material("S5_metal", (0.20, 0.21, 0.23), roughness=0.34, metallic=0.75, specular=0.5)
    m['seed'] = bpy.data.materials["WP_terr_seed"]
    m['straw'] = wb.voronoi_scatter(
        wb.toy_material("S5_straw", (0.36, 0.26, 0.08), roughness=0.8, sheen=0.1),
        ramp_stops=[(0.15, (0.200, 0.130, 0.035)), (0.5, (0.360, 0.255, 0.075)), (0.85, (0.520, 0.400, 0.150))],
        scale=120.0, bump_strength=0.6, bump_distance=0.003, roughness=0.8)
    m['dirt'] = wb.voronoi_scatter(
        wb.toy_material("S5_dirt", (0.09, 0.055, 0.03), roughness=0.92),
        ramp_stops=[(0.2, (0.050, 0.030, 0.016)), (0.6, (0.090, 0.056, 0.030)), (0.9, (0.130, 0.085, 0.048))],
        scale=150.0, bump_strength=0.6, bump_distance=0.002, roughness=0.92)
    m['dust'] = wb.toy_material("S5_dust", (0.150, 0.105, 0.065), roughness=0.95)
    m['red'] = wb.toy_material("S5_red", (0.300, 0.020, 0.016), roughness=0.35, sheen=0.2)
    m['roof'] = wb.wood_grain(wb.toy_material("S5_roof", (0.150, 0.030, 0.022), roughness=0.6),
                              base=(0.150, 0.030, 0.022), dark=(0.070, 0.014, 0.010), scale=18.0, stretch=10.0, bump_strength=0.3)
    m['white'] = wb.toy_material("S5_paint", (0.55, 0.52, 0.45), roughness=0.6)
    m['dark'] = wb.toy_material("S5_door_dark", (0.012, 0.008, 0.006), roughness=0.9)
    m['clear'] = bpy.data.materials.get("WP_cage_bottle") or bpy.data.materials["WP_terr_glass"]
    m['bulb'] = wb.toy_material("S5_bulb", (0.9, 0.25, 0.08), roughness=0.3, emission=(1.0, 0.32, 0.10), emission_strength=3.0)
    m['glow'] = wb.toy_material("S5_door_glow", (0.014, 0.009, 0.006), roughness=0.9, emission=(1.0, 0.62, 0.28), emission_strength=0.0)
    # the hen
    m['hen'] = wb.toy_material("S5_hen", (0.200, 0.062, 0.020), roughness=0.55, sheen=0.35, sss=0.08)
    m['hen_wing'] = wb.toy_material("S5_hen_wing", (0.120, 0.036, 0.012), roughness=0.55, sheen=0.4)
    m['hen_tail'] = wb.toy_material("S5_hen_tail", (0.040, 0.020, 0.014), roughness=0.4, sheen=0.5)
    m['comb'] = wb.toy_material("S5_comb", (0.420, 0.018, 0.018), roughness=0.4, sheen=0.3, sss=0.25, sss_color=(0.9, 0.2, 0.2))
    m['beak'] = wb.toy_material("S5_beak", (0.520, 0.270, 0.030), roughness=0.35)
    m['shank'] = wb.toy_material("S5_shank", (0.480, 0.270, 0.035), roughness=0.45)
    m['eye'] = wb.toy_material("S5_bird_eye", (0.010, 0.008, 0.008), roughness=0.1, specular=0.6)
    m['glint'] = wb.toy_material("S5_bird_glint", (1, 1, 1), roughness=0.1, emission=(1, 1, 1), emission_strength=1.4)
    # A deep golden yellow, not a pale one: the rig is hot, and a chick the colour of its straw is lost on it.
    m['chick'] = wb.toy_material("S5_chick", (0.440, 0.215, 0.010), roughness=0.6, sheen=0.35, sss=0.1, sss_color=(1.0, 0.7, 0.2))
    m['egg'] = wb.toy_material("S5_egg", (0.55, 0.40, 0.28), roughness=0.4)
    return m


# ---------------------------------------------------------------- shared pieces
def box(name, w, d, h, col, mat, loc, rot=(0.0, 0.0, 0.0), r=0.003):
    ob = wb.rounded_box(name, w, d, h, r, col)
    wb.assign(ob, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def scatter(col, mat, name, n, x0, x1, y0, y1, z, size=(0.010, 0.0022, 0.0012), skip=None):
    """Straw or shavings: thin chips lying every which way on a floor."""
    for i in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if skip and skip(x, y):
            continue
        ob = wb.rounded_box(f"{name}_{i}", size[0] * rng.uniform(0.6, 1.3), size[1], size[2], 0.0004, col)
        ob.location = (x, y, z + rng.uniform(0.0, 0.004))
        ob.rotation_euler = (rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0, math.pi))
        wb.assign(ob, mat)


def prism(name, w, d, h, col, mat, loc):
    """A pitched roof: a triangular prism, ridge along X, with a little overhang built in."""
    bm = bmesh.new()
    hw, hd = w / 2, d / 2
    v = [bm.verts.new(p) for p in ((-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (-hw, 0, h), (hw, 0, h))]
    for f in ((0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)):
        bm.faces.new([v[i] for i in f])
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, col)
    bev = ob.modifiers.new("Bevel", 'BEVEL')
    bev.width = 0.0015
    bev.segments = 2
    wb.assign(ob, mat)
    ob.location = loc
    return ob


# ---------------------------------------------------------------- the brooder
BR_W, BR_D = 0.300, 0.190
BR_WALL = 0.080            # back and sides
BR_FRONT = 0.030           # the near wall, low, so you can see in
BR_FLOOR = GROUND + 0.026  # top of the bedding
BR_LAMP = (-0.075, 0.020)  # the warm spot under the lamp
BR_FEED = (0.060, 0.030)
BR_WATER = (0.110, 0.045)


def build_brooder(m):
    col = s5.collection("S5_Brooder")
    front = s5.collection("S5_BrooderFront")
    mem = s5.collection("S5_BrooderMemorial")
    hw, hd, t = BR_W / 2, BR_D / 2, 0.008
    box("S5_br_base", BR_W, BR_D, 0.012, col, m['wood_dark'], (0, 0, GROUND + 0.006))
    box("S5_br_back", BR_W, t, BR_WALL, col, m['wood'], (0, hd - t / 2, GROUND + BR_WALL / 2))
    for s in (-1, 1):
        box(f"S5_br_side_{s}", t, BR_D, BR_WALL, col, m['wood'], (s * (hw - t / 2), 0, GROUND + BR_WALL / 2))
        # the side walls step down to the low front
    box("S5_br_front", BR_W, t, BR_FRONT + 0.014, front, m['wood'], (0, -(hd - t / 2), GROUND + (BR_FRONT + 0.014) / 2))
    # bedding: a slab and a scatter of shavings
    box("S5_br_bed", BR_W - 2 * t, BR_D - 2 * t, 0.014, col, m['straw'], (0, 0, BR_FLOOR - 0.007), r=0.002)
    scatter(col, m['straw'], "S5_br_chip", 380, -hw + 0.016, hw - 0.016, -hd + 0.016, hd - 0.016, BR_FLOOR)
    # the heat lamp: a clamp on the back wall, an arm, a dome, a red bulb that is a real light
    lx, ly = BR_LAMP
    top = GROUND + BR_WALL
    rod("S5_br_lamp_arm_a", (lx, hd - 0.004, top - 0.006), (lx, hd - 0.004, top + 0.050), 0.0022, col, m['metal'])
    rod("S5_br_lamp_arm_b", (lx, hd - 0.004, top + 0.050), (lx, ly + 0.012, top + 0.062), 0.0022, col, m['metal'])
    dome = wb.lathe("S5_br_lamp_dome", [(0.006, top + 0.066), (0.014, top + 0.060), (0.030, top + 0.040), (0.034, top + 0.030)],
                    col, segments=40, close_bottom=False, close_top=True)
    dome.location = (lx, ly, 0.0)
    sol = dome.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.0012
    wb.assign(dome, m['red'])
    ball("S5_br_lamp_bulb", (0.012, 0.012, 0.014), col, m['bulb'], (lx, ly, top + 0.040))
    ld = bpy.data.lights.new("LGT_brooder_lamp", 'SPOT')
    ld.color = (1.0, 0.42, 0.16)
    ld.spot_size = R(105)
    ld.spot_blend = 0.6
    ld.shadow_soft_size = 0.02
    lo = bpy.data.objects.new("LGT_brooder_lamp", ld)
    lo.location = (lx, ly, top + 0.034)
    col.objects.link(lo)
    # the feeder: a red tray under a jar of grain; the waterer: the same with water
    fx, fy = BR_FEED
    tray = wb.lathe("S5_br_feed_tray", [(0.0, BR_FLOOR), (0.024, BR_FLOOR), (0.026, BR_FLOOR + 0.008), (0.022, BR_FLOOR + 0.008), (0.020, BR_FLOOR + 0.003), (0.0, BR_FLOOR + 0.003)], col, segments=32)
    tray.location = (fx, fy, 0)
    wb.assign(tray, m['red'])
    jar = wb.cylinder("S5_br_feed_jar", 0.014, 0.036, col, verts=24)
    jar.location = (fx, fy, BR_FLOOR + 0.024)
    wb.assign(jar, m['clear'])
    grain = wb.cylinder("S5_br_feed_grain", 0.0125, 0.026, col, verts=20)
    grain.location = (fx, fy, BR_FLOOR + 0.019)
    wb.assign(grain, m['seed'])
    ring = wb.torus("S5_br_feed_grain_ring", 0.019, 0.0028, col)
    ring.location = (fx, fy, BR_FLOOR + 0.0045)
    wb.assign(ring, m['seed'])
    wx, wy = BR_WATER
    wtray = wb.lathe("S5_br_water_tray", [(0.0, BR_FLOOR), (0.017, BR_FLOOR), (0.019, BR_FLOOR + 0.006), (0.0, BR_FLOOR + 0.004)], col, segments=28)
    wtray.location = (wx, wy, 0)
    wb.assign(wtray, m['red'])
    wj = wb.cylinder("S5_br_water_jar", 0.011, 0.030, col, verts=20)
    wj.location = (wx, wy, BR_FLOOR + 0.020)
    wb.assign(wj, m['clear'])
    s5.flag(mem, (0.0, 0.0, BR_FLOOR), "S5_br_mem")
    return lo


# ---------------------------------------------------------------- the coop
CO_W, CO_D = 0.330, 0.205
CO_FLOOR = GROUND + 0.022
HOUSE = dict(x=-0.100, y=0.040, w=0.112, d=0.100, h=0.080)
NEST = dict(x=0.108, y=0.058, w=0.078, d=0.062, h=0.046)
CO_FEED = (0.020, 0.052)
CO_DUST = (0.040, -0.040)


def build_coop(m):
    col = s5.collection("S5_Coop")
    front = s5.collection("S5_CoopFront")
    mem = s5.collection("S5_CoopMemorial")
    hw, hd, t = CO_W / 2, CO_D / 2, 0.008
    # the tray: a wooden frame with a dirt floor
    box("S5_co_base", CO_W, CO_D, 0.014, col, m['wood_dark'], (0, 0, GROUND + 0.007))
    box("S5_co_dirt", CO_W - 2 * t, CO_D - 2 * t, 0.010, col, m['dirt'], (0, 0, CO_FLOOR - 0.005), r=0.002)
    box("S5_co_rail_back", CO_W, t, 0.030, col, m['wood'], (0, hd - t / 2, GROUND + 0.015))
    for s in (-1, 1):
        box(f"S5_co_rail_side_{s}", t, CO_D, 0.030, col, m['wood'], (s * (hw - t / 2), 0, GROUND + 0.015))
    box("S5_co_rail_front", CO_W, t, 0.030, front, m['wood'], (0, -(hd - t / 2), GROUND + 0.015))
    # a picket fence along the back, right of the house
    for i in range(9):
        x = -0.030 + i * 0.022
        box(f"S5_co_picket_{i}", 0.010, 0.004, 0.050, col, m['white'], (x, hd - 0.012, CO_FLOOR + 0.025), r=0.0015)
    box("S5_co_fence_rail", 0.196, 0.003, 0.006, col, m['white'], (0.058, hd - 0.0145, CO_FLOOR + 0.034), r=0.001)
    # the dust bath: a shallow bowl of fine dry earth
    dust = wb.cylinder("S5_co_dust", 0.030, 0.002, col, verts=32)
    dust.location = (CO_DUST[0], CO_DUST[1], CO_FLOOR + 0.0006)
    dust.scale = (1.0, 0.8, 1.0)
    wb.assign(dust, m['dust'])
    scatter(col, m['straw'], "S5_co_straw", 150, -hw + 0.016, hw - 0.016, -hd + 0.016, hd - 0.016, CO_FLOOR,
            skip=lambda x, y: math.hypot(x - CO_DUST[0], (y - CO_DUST[1]) / 0.8) < 0.034)
    # the house
    H = HOUSE
    box("S5_co_house", H['w'], H['d'], H['h'], col, m['wood'], (H['x'], H['y'], CO_FLOOR + H['h'] / 2))
    prism("S5_co_roof", H['w'] + 0.022, H['d'] + 0.018, 0.040, col, m['roof'], (H['x'], H['y'], CO_FLOOR + H['h']))
    door_y = H['y'] - H['d'] / 2 - 0.0006
    box("S5_co_door", 0.050, 0.002, 0.060, col, m['dark'], (H['x'] + 0.010, door_y, CO_FLOOR + 0.030), r=0.008)
    # a warm panel just inside the door, off by day: at night it is the light the hen roosts by
    box("S5_co_door_glow", 0.044, 0.001, 0.054, col, m['glow'], (H['x'] + 0.010, door_y - 0.0012, CO_FLOOR + 0.029), r=0.007)
    box("S5_co_ramp", 0.044, 0.030, 0.003, col, m['wood_dark'], (H['x'] + 0.010, door_y - 0.016, CO_FLOOR + 0.002), rot=(R(8), 0, 0), r=0.001)
    ld = bpy.data.lights.new("LGT_coop_door", 'POINT')
    ld.color = (1.0, 0.62, 0.30)
    ld.shadow_soft_size = 0.02
    lo = bpy.data.objects.new("LGT_coop_door", ld)
    lo.location = (H['x'] + 0.010, door_y - 0.030, CO_FLOOR + 0.030)
    col.objects.link(lo)
    # the nesting box: open at the front, full of straw, where the eggs gather
    N = NEST
    box("S5_co_nest_back", N['w'], 0.005, N['h'], col, m['wood'], (N['x'], N['y'] + N['d'] / 2, CO_FLOOR + N['h'] / 2))
    for s in (-1, 1):
        box(f"S5_co_nest_side_{s}", 0.005, N['d'], N['h'], col, m['wood'], (N['x'] + s * N['w'] / 2, N['y'], CO_FLOOR + N['h'] / 2))
    box("S5_co_nest_top", N['w'] + 0.010, N['d'] + 0.008, 0.005, col, m['roof'], (N['x'], N['y'], CO_FLOOR + N['h'] + 0.0025), rot=(R(-8), 0, 0))
    box("S5_co_nest_lip", N['w'], 0.004, 0.012, col, m['wood'], (N['x'], N['y'] - N['d'] / 2, CO_FLOOR + 0.006))
    box("S5_co_nest_straw", N['w'] - 0.008, N['d'] - 0.006, 0.012, col, m['straw'], (N['x'], N['y'], CO_FLOOR + 0.008), r=0.004)
    scatter(col, m['straw'], "S5_co_nest_chip", 60, N['x'] - 0.032, N['x'] + 0.032, N['y'] - 0.024, N['y'] + 0.022, CO_FLOOR + 0.014, size=(0.012, 0.0016, 0.001))
    # the hanging feeder: a galvanised tube over a pan, on a post
    fx, fy = CO_FEED
    rod("S5_co_feed_post", (fx, fy + 0.018, CO_FLOOR), (fx, fy + 0.018, CO_FLOOR + 0.078), 0.0030, col, m['wood_dark'])
    rod("S5_co_feed_arm", (fx, fy + 0.018, CO_FLOOR + 0.076), (fx, fy, CO_FLOOR + 0.076), 0.0022, col, m['wood_dark'])
    rod("S5_co_feed_chain", (fx, fy, CO_FLOOR + 0.076), (fx, fy, CO_FLOOR + 0.056), 0.0008, col, m['metal'], verts=6)
    tube = wb.cylinder("S5_co_feed_tube", 0.013, 0.040, col, verts=24)
    tube.location = (fx, fy, CO_FLOOR + 0.036)
    wb.assign(tube, m['metal'])
    pan = wb.lathe("S5_co_feed_pan", [(0.0, CO_FLOOR + 0.008), (0.022, CO_FLOOR + 0.008), (0.025, CO_FLOOR + 0.016), (0.021, CO_FLOOR + 0.015), (0.019, CO_FLOOR + 0.011), (0.0, CO_FLOOR + 0.011)], col, segments=32)
    pan.location = (fx, fy, 0)
    wb.assign(pan, m['red'])
    ring = wb.torus("S5_co_feed_grain", 0.0175, 0.0026, col)
    ring.location = (fx, fy, CO_FLOOR + 0.0125)
    wb.assign(ring, m['seed'])
    # the memorial: the flag, and one last egg in the nest
    s5.flag(mem, (0.0, -0.030, CO_FLOOR), "S5_co_mem")
    ball("S5_co_mem_egg", (0.0068, 0.0052, 0.0052), mem, m['egg'], (N['x'], N['y'] - 0.012, CO_FLOOR + 0.018), rot=(0, R(10), 0.4))
    return lo


def nest_slots():
    """Where up to seven eggs sit, front row first, as world points on the nest's straw."""
    N = NEST
    z = CO_FLOOR + 0.019
    out = []
    for i, dx in enumerate((-0.021, -0.007, 0.007, 0.021)):
        out.append((N['x'] + dx, N['y'] - 0.016, z))
    for dx in (-0.014, 0.0, 0.014):
        out.append((N['x'] + dx, N['y'] - 0.002, z + 0.002))
    return out


# ---------------------------------------------------------------- the birds
def joint(name, col, rig, at):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    e.parent = rig
    e.location = at
    return e


def attach(ob, joint_, pivot):
    """Parent a part built at rig-local coordinates to a joint at rig-local `pivot`."""
    ob.parent = joint_
    ob.location = (ob.location.x - pivot[0], ob.location.y - pivot[1], ob.location.z - pivot[2])


HEN_SCALE = 0.80


def build_hen(m):
    col = s5.collection("S5_Hen")
    rig = bpy.data.objects.new("RIG_hen_root", None)
    col.objects.link(rig)
    rig.rotation_euler = (0, 0, YAW)
    rig.scale = (HEN_SCALE,) * 3
    hip = (0.000, 0.0, -0.014)
    nk = (0.017, 0.0, 0.012)
    upper = joint("RIG_hen_upper", col, rig, hip)
    headj = joint("RIG_hen_head", col, upper, (nk[0] - hip[0], 0.0, nk[2] - hip[2]))
    wb.belly_gradient(m['hen'], (0.200, 0.062, 0.020), (0.400, 0.230, 0.100), -0.022, 0.010, space_object=rig)
    wb.fur_surface(m['hen'], scale=260.0, strength=0.45, distance=0.0016, sheen=0.45, space_object=rig)
    sections = [(-0.036, 0.000, 0.000, 0.013), (-0.029, 0.008, 0.010, 0.010), (-0.016, 0.016, 0.018, 0.004),
                (-0.002, 0.0195, 0.0210, 0.000), (0.010, 0.0180, 0.0190, 0.001), (0.019, 0.013, 0.014, 0.005), (0.026, 0.000, 0.000, 0.008)]
    body = wb.tapered_body("HERO_hen_body", sections, col, segments=28, rings=18)
    wb.add_subsurf(body, 1)
    wb.assign(body, m['hen'])
    up, hd = [body], []
    up.append(ball("HERO_hen_neck", (0.0088, 0.0086, 0.0135), col, m['hen'], (0.0195, 0.0, 0.0175), rot=(0, R(24), 0)))
    # tail: three dark feathers fanned up
    for i, (dy, tilt, ln) in enumerate(((0.0, 58, 0.016), (0.0045, 48, 0.013), (-0.0045, 48, 0.013))):
        up.append(ball(f"HERO_hen_tail_{i}", (ln, 0.0030, 0.0062), col, m['hen_tail'],
                       (-0.034 - 0.004 * math.cos(R(tilt)), dy, 0.020 + 0.006 * math.sin(R(tilt))), rot=(0, R(tilt), dy * 30)))
    parts = {}
    for side, s in (('l', 1), ('r', -1)):
        wing = ball(f"HERO_hen_wing_{side}", (0.0150, 0.0042, 0.0105), col, m['hen_wing'], (-0.004, s * 0.0180, 0.0045), rot=(s * R(8), R(8), 0))
        up.append(wing)
        parts[f'wing_{side}'] = (wing, 'scale')
        eye = ball(f"HERO_hen_eye_{side}", (0.0017, 0.0017, 0.0017), col, m['eye'], (0.0300, s * 0.0080, 0.0330), seg=10, rings=8)
        glint = ball(f"HERO_hen_glint_{side}", (0.0006, 0.0006, 0.0006), col, m['glint'], (0.0306, s * 0.0093, 0.0338), seg=8, rings=6)
        hd += [eye, glint]
        parts[f'eye_{side}'] = (eye, 'scale')
        parts[f'glint_{side}'] = (glint, 'scale')
        hd.append(ball(f"HERO_hen_wattle_{side}", (0.0022, 0.0014, 0.0034), col, m['comb'], (0.0320, s * 0.0020, 0.0235)))
        leg = rod(f"HERO_hen_leg_{side}", (0.002, s * 0.0075, -0.0150), (0.004, s * 0.0075, -0.0345), 0.0017, col, m['shank'], verts=8)
        foot = ball(f"HERO_hen_foot_{side}", (0.0072, 0.0052, 0.0010), col, m['shank'], (0.0070, s * 0.0078, -0.0346))
        leg.parent = rig
        foot.parent = rig
        parts[f'leg_{side}'] = (leg, 'loc')
        parts[f'foot_{side}'] = (foot, 'loc')
    hd.append(ball("HERO_hen_head", (0.0100, 0.0092, 0.0096), col, m['hen'], (0.0265, 0.0, 0.0310)))
    hd.append(ball("HERO_hen_beak", (0.0062, 0.0030, 0.0024), col, m['beak'], (0.0375, 0.0, 0.0300), rot=(0, R(8), 0), seg=12, rings=8))
    hd.append(ball("HERO_hen_beak_low", (0.0042, 0.0024, 0.0014), col, m['beak'], (0.0360, 0.0, 0.0282), rot=(0, R(10), 0), seg=12, rings=8))
    for i, (x, z, r) in enumerate(((0.0300, 0.0402, 0.0032), (0.0262, 0.0420, 0.0036), (0.0222, 0.0408, 0.0030))):
        hd.append(ball(f"HERO_hen_comb_{i}", (r, 0.0014, r * 1.05), col, m['comb'], (x, 0.0, z), seg=12, rings=8))
    for o in up:
        attach(o, upper, hip)
    for o in hd:
        attach(o, headj, nk)
    parts['upper_rot'] = (upper, 'rot')
    parts['upper_loc'] = (upper, 'loc')
    parts['head_rot'] = (headj, 'rot')
    parts['head_loc'] = (headj, 'loc')
    return col, rig, body, parts, 0.0346 * HEN_SCALE, 0.0033 * HEN_SCALE


def build_chick(m):
    col = s5.collection("S5_Chick")
    rig = bpy.data.objects.new("RIG_chick_root", None)
    col.objects.link(rig)
    rig.rotation_euler = (0, 0, YAW)
    hip = (0.000, 0.0, -0.009)
    nk = (0.007, 0.0, 0.006)
    upper = joint("RIG_chick_upper", col, rig, hip)
    headj = joint("RIG_chick_head", col, upper, (nk[0] - hip[0], 0.0, nk[2] - hip[2]))
    wb.fur_surface(m['chick'], scale=300.0, strength=0.6, distance=0.0016, sheen=0.7, space_object=rig)
    body = ball("HERO_chick_body", (0.0150, 0.0132, 0.0135), col, m['chick'], (-0.001, 0.0, 0.000), seg=24, rings=16)
    wb.add_subsurf(body, 1)
    up, hd = [body], []
    up.append(ball("HERO_chick_tail", (0.0050, 0.0040, 0.0040), col, m['chick'], (-0.0145, 0.0, 0.0050)))
    parts = {}
    for side, s in (('l', 1), ('r', -1)):
        wing = ball(f"HERO_chick_wing_{side}", (0.0078, 0.0026, 0.0056), col, m['chick'], (-0.002, s * 0.0128, 0.0010), rot=(s * R(10), R(10), 0))
        up.append(wing)
        parts[f'wing_{side}'] = (wing, 'scale')
        eye = ball(f"HERO_chick_eye_{side}", (0.0015, 0.0015, 0.0015), col, m['eye'], (0.0158, s * 0.0078, 0.0150), seg=10, rings=8)
        glint = ball(f"HERO_chick_glint_{side}", (0.0005, 0.0005, 0.0005), col, m['glint'], (0.0163, s * 0.0089, 0.0157), seg=8, rings=6)
        hd += [eye, glint]
        parts[f'eye_{side}'] = (eye, 'scale')
        parts[f'glint_{side}'] = (glint, 'scale')
        leg = rod(f"HERO_chick_leg_{side}", (0.001, s * 0.0050, -0.0100), (0.002, s * 0.0050, -0.0200), 0.0012, col, m['shank'], verts=8)
        foot = ball(f"HERO_chick_foot_{side}", (0.0048, 0.0036, 0.0008), col, m['shank'], (0.0042, s * 0.0052, -0.0202))
        leg.parent = rig
        foot.parent = rig
        parts[f'leg_{side}'] = (leg, 'loc')
        parts[f'foot_{side}'] = (foot, 'loc')
    hd.append(ball("HERO_chick_head", (0.0108, 0.0102, 0.0104), col, m['chick'], (0.0100, 0.0, 0.0140)))
    hd.append(ball("HERO_chick_beak", (0.0036, 0.0024, 0.0020), col, m['beak'], (0.0210, 0.0, 0.0125), rot=(0, R(8), 0), seg=12, rings=8))
    for o in up:
        attach(o, upper, hip)
    for o in hd:
        attach(o, headj, nk)
    parts['upper_rot'] = (upper, 'rot')
    parts['upper_loc'] = (upper, 'loc')
    parts['head_rot'] = (headj, 'rot')
    parts['head_loc'] = (headj, 'loc')
    return col, rig, body, parts, 0.0202, 0.0020


def bird_states(P, hen, step, lift):
    """States for either bird. `step` is the fore-aft reach of a foot in a walk, `lift` its rise."""
    def legs(l=(0.0, 0.0), r=(0.0, 0.0)):
        return {'leg_l': (l[0] * 0.6, 0.0, l[1] * 0.6), 'foot_l': (l[0], 0.0, l[1]),
                'leg_r': (r[0] * 0.6, 0.0, r[1] * 0.6), 'foot_r': (r[0], 0.0, r[1])}

    def face(eye=1.0, wing=1.0, tip=0.0, head=(0.0, 0.0, 0.0), nod=0.0, look=0.0, up=(0.0, 0.0, 0.0), roll=0.0, sit=0.0, **kw):
        """`tip`: the body pitched forward about the hips (radians); `nod` and `look`: the head's
        pitch and yaw; `head`, `up`: offsets of the head and of the whole upper body."""
        d = {'upper_rot': (roll, tip, 0.0), 'upper_loc': up, 'head_rot': (0.0, nod, look), 'head_loc': head,
             'wing_l': (wing, wing, wing), 'wing_r': (wing, wing, wing)}
        for s in ('l', 'r'):
            d[f'eye_{s}'] = (1.0, 1.0, eye)
            d[f'glint_{s}'] = (1.0, 1.0, eye)
        d.update(legs(**kw))
        if sit:
            for s in ('l', 'r'):
                # the rig's own drop is in world metres, a limb's offset in the rig's scaled space
                d[f'leg_{s}'] = (0.0, 0.0, sit / P.rig.scale.z)
                d[f'foot_{s}'] = (0.0, 0.0, sit / P.rig.scale.z)
        return d

    k = 1.0 if hen else 0.6          # amplitudes scale with the bird
    SIT = -0.014 * k                  # how far it lowers to sit: the legs fold out of sight
    IDLE = P.pose(parts=face())
    DEAD = P.pose(rx=R(86), z=-0.020 * k, ry=R(-6), parts=face(eye=0.08, head=(0.0, 0.0, -0.002 * k)))

    def idle(i, n):
        t = i / n
        b = math.cos(t * math.tau)
        # a bird's head moves in jumps: it holds, then is somewhere else
        look = R([0, 0, 14, 14, 14, -8, -8, 0][i])
        return P.pose(sz=1.0 + 0.012 * b, parts=face(eye=0.1 if i == 6 else 1.0, look=look, nod=R(2 * b), up=(0.0, 0.0, 0.0004 * b)))

    def walk(i, n):
        t = i / n
        a = math.cos(t * math.tau)
        s = math.sin(t * math.tau)
        left = (step * a, lift * max(0.0, -s))
        right = (-step * a, lift * max(0.0, s))
        # the head holds still in space while the body moves under it, then snaps forward: the bob
        bob = 0.0026 * k * math.cos(t * math.tau * 2)
        return P.pose(z=0.0010 * k * abs(math.sin(t * math.tau)), parts=face(head=(bob, 0.0, 0.0), tip=R(3 + 2 * math.cos(t * math.tau * 2 + 0.6)),
                                                                              l=left, r=right, nod=R(-2)))

    def peck(i, n):
        d = [0.0, 0.55, 1.0, 0.85, 1.0, 0.3][i]     # down, tap, lift a little, tap again, up
        return P.pose(parts=face(tip=R(38) * d, nod=R(34) * d, eye=0.5 if d > 0.8 else 1.0, head=(0.002 * k * d, 0.0, -0.002 * k * d)))

    def scratch(i, n):
        t = i / n
        a = math.cos(t * math.tau)
        back = (-step * 1.5 * (0.5 - 0.5 * a), lift * 0.8 * max(0.0, math.sin(t * math.tau)))
        return P.pose(parts=face(tip=R(14), nod=R(16), l=back, up=(0.0, 0.0, -0.001), look=R(6 * math.sin(t * math.tau))))

    def dustbathe(i, n):
        t = i / n
        w = math.sin(t * math.tau)
        return P.pose(z=SIT * 0.9, rz=R(5 * w), parts=face(roll=R(16 * w), wing=1.0 + 0.30 * (0.5 + 0.5 * math.cos(t * math.tau * 2)),
                                                           eye=0.35, nod=R(8), head=(0.0, 0.0, -0.002), up=(0.0, 0.0, 0.0006 * w), sit=-SIT * 0.9))

    def sleep(i, n):
        t = i / n
        b = math.cos(t * math.tau)
        return P.pose(z=SIT, sz=1.0 + 0.020 * b, sx=1.0 - 0.008 * b,
                      parts=face(eye=0.06, wing=1.06, nod=R(26), head=(-0.004 * k, 0.0, -0.006 * k), up=(0.0, 0.0, 0.0005 * b), sit=-SIT))

    def hungry(i, n):
        t = i / n
        return P.pose(sz=1.05, sx=1.05, parts=face(wing=1.14, eye=0.14 if i == 2 else 0.75, nod=R(14), head=(0.0, 0.0, -0.003 * k),
                                                   look=R(10 * math.sin(t * math.tau + 0.4)), tip=R(6)))

    def die(i, n):
        t = i / (n - 1)
        if t < 0.3:
            w = t / 0.3
            return P.pose(rz=R(4 * math.sin(w * math.tau)), parts=face(eye=1.0 - 0.6 * w, nod=R(18 * w), wing=1.0 + 0.1 * w))
        g = min(1.0, ((t - 0.3) / 0.7) ** 2)
        p = mix(P.pose(parts=face(eye=0.4, nod=R(18), wing=1.1)), DEAD, g)
        if g > 0.8:
            p["rx"] += R(4.0) * math.sin(math.pi * (g - 0.8) / 0.2)
        return p

    def turn(i, n):
        t = i / (n - 1)
        s = smooth(t)
        hop = math.sin(math.pi * t)
        # the head gets there first
        return P.pose(rz=R(-80.0) * s, z=0.0012 * k * hop, parts=face(look=R(-24) * math.sin(math.pi * t), l=(0.0, lift * 0.5 * hop), wing=1.0 + 0.08 * hop))

    P.block("idle", 8, True, idle)
    P.block("walk", 8, True, walk)
    P.block("eat", 6, True, peck)
    P.block("sleep", 6, True, sleep)
    P.block("hungry", 6, True, hungry)
    P.block("dead", 1, True, lambda i, n: DEAD)
    P.block("die", 6, False, die)
    P.block("turn", 7, False, turn)
    if hen:
        P.block("scratch", 6, True, scratch)
        P.block("dustbathe", 8, True, dustbathe)
    P.finish()
    _ = IDLE


# ---------------------------------------------------------------- run
s5.setup(SAMPLES)
M = materials()
geom = {}
BIRD_STATES = ("idle", "walk", "eat", "sleep", "hungry", "dead", "die", "turn", "scratch", "dustbathe")


def plates(name, cols_bg, front, mem, cam, lamp, glow=None):
    for v in VARIANTS:
        s5.light(v)
        if lamp is not None:
            lamp[0].data.energy = lamp[1][v]
        if glow is not None:
            bsdf = glow.node_tree.nodes.get("Principled BSDF")
            bsdf.inputs["Emission Strength"].default_value = 6.0 if v == "night" else 0.0
        s5.only(*cols_bg, front, "WP_Ground")
        s5.shoot(cam, os.path.join(OUT, name, v, "bg.png"))
        if v == "day":
            s5.only(*cols_bg, front, "WP_Ground", mem)
            s5.shoot(cam, os.path.join(OUT, name, "memorial", "bg.png"))
        s5.only(front)
        s5.CATCHER.hide_render = True
        s5.shoot(cam, os.path.join(OUT, name, v, "decor_front.png"))


if ALL or "brooder" in JOBS or "geom" in JOBS:
    lamp = build_brooder(M)
    cam = s5.camera("CAM_brooder", s5.ORTHO, (0.0, 0.0, GROUND + 0.062), shift=(0.0, -6.0))
    hw, hd = BR_W / 2, BR_D / 2
    geom["brooder"] = {
        "floorLeft": s5.project(cam, (-hw + 0.030, -0.030, BR_FLOOR)),
        "floorRight": s5.project(cam, (hw - 0.030, -0.030, BR_FLOOR)),
        "lamp": s5.project(cam, (BR_LAMP[0], -0.030, BR_FLOOR)),
        "feeder": s5.project(cam, (BR_FEED[0] - 0.034, -0.030, BR_FLOOR)),
        "water": s5.project(cam, (BR_WATER[0] - 0.030, -0.030, BR_FLOOR)),
        "bulb": s5.project(cam, (BR_LAMP[0], BR_LAMP[1], GROUND + BR_WALL + 0.036)),
        "foodRow": s5.project(cam, (0.0, -0.058, BR_FLOOR)),
    }
    if ALL or "brooder" in JOBS:
        # the lamp is always on: by day it is a warm pool on the bedding, at night it is the light
        plates("brooder", ("S5_Brooder",), "S5_BrooderFront", "S5_BrooderMemorial", cam,
               (lamp, {"day": 5.0, "dawn": 6.0, "dusk": 6.0, "night": 8.0}))

if ALL or "coop" in JOBS or "geom" in JOBS:
    door = build_coop(M)
    cam = s5.camera("CAM_coop", s5.ORTHO, (0.0, 0.0, GROUND + 0.062), shift=(0.0, -4.0))
    hw = CO_W / 2
    H = HOUSE
    walk_y = -0.036
    geom["coop"] = {
        "floorLeft": s5.project(cam, (-hw + 0.034, walk_y, CO_FLOOR)),
        "floorRight": s5.project(cam, (hw - 0.034, walk_y, CO_FLOOR)),
        "door": s5.project(cam, (H['x'] + 0.010, walk_y, CO_FLOOR)),
        "doorRect": s5.rect_of(cam, [bpy.data.objects["S5_co_door"]]),
        "feeder": s5.project(cam, (CO_FEED[0] - 0.036, walk_y, CO_FLOOR)),
        "dust": s5.project(cam, (CO_DUST[0], walk_y, CO_FLOOR)),
        "nest": [s5.project(cam, p) for p in nest_slots()],
        "ridge": [s5.project(cam, (H['x'] - 0.040, H['y'], CO_FLOOR + H['h'] + 0.040)), s5.project(cam, (H['x'] + 0.040, H['y'], CO_FLOOR + H['h'] + 0.040))],
        "foodRow": s5.project(cam, (0.0, -0.066, CO_FLOOR)),
    }
    if ALL or "coop" in JOBS:
        plates("coop", ("S5_Coop",), "S5_CoopFront", "S5_CoopMemorial", cam,
               (door, {"day": 0.0, "dawn": 0.0, "dusk": 0.3, "night": 1.2}), glow=M['glow'])

if geom:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "chicken-geom.json"), "w") as fh:
        json.dump(geom, fh, indent=1)
    print("WP_GEOM %s" % json.dumps(geom), flush=True)

for kind, builder, step, lift in (("hen", build_hen, 0.0060, 0.0050), ("chick", build_chick, 0.0036, 0.0030)):
    if not (ALL or kind in JOBS):
        continue
    col, rig, body, parts, feet, aim_up = builder(M)
    rig.location = (0.0, 0.0, 0.040)
    P = s5.Poser(rig, YAW, body, parts)
    bird_states(P, kind == "hen", step, lift)
    cam = s5.camera(f"CAM_{kind}", s5.ORTHO * s5.FRAME_PX / 320.0, (0.0, 0.0, 0.040 + aim_up), shift=(-3.0 if kind == "hen" else -1.0, 0.0))
    s5.light("day")
    s5.only(col.name)
    s5.CATCHER.hide_render = True
    P.render(cam, os.path.join(OUT, kind), ["all"], key="all")
print("WP_DONE", flush=True)
