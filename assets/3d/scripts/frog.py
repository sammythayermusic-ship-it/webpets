"""Step 5: the frog, its pond and its jar.

    Blender -b wp_scene.blend -P frog.py -- <out_dir> <jobs> <samples>

jobs, comma separated:
  pond, jar      the habitat plates for day, dawn, dusk and night (bg, plus glass for the jar), and
                 the day memorial
  frog           every frog state as 320x320 frames (or name single states)
  geom           measured positions (pad, rock, bank, water) in grid px, as <out>/geom.json
  all            everything

Built from primitives by code, in the loaded scene, every run; nothing is saved into the .blend.
The frog faces +X and is turned 50 degrees toward the camera, like the hamster, so the sprite player
can mirror it. Metres, Z up.
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
from s5_common import R, GROUND, ball, rod, place, smooth, mix  # noqa: E402

OUT, JOBS, SAMPLES = s5.args()
ALL = "all" in JOBS
VARIANTS = os.environ.get("WP_VARIANTS", "day,dawn,dusk,night").split(",")
rng = random.Random(7)

# ---------------------------------------------------------------- materials
def materials():
    m = {}
    m['stone'] = wb.voronoi_scatter(
        wb.toy_material("S5_stone", (0.11, 0.11, 0.12), roughness=0.78, sheen=0.05),
        ramp_stops=[(0.15, (0.045, 0.047, 0.052)), (0.5, (0.095, 0.097, 0.105)), (0.85, (0.160, 0.158, 0.155))],
        scale=70.0, bump_strength=0.5, bump_distance=0.003, roughness=0.78)
    m['rock'] = wb.voronoi_scatter(
        wb.toy_material("S5_rock", (0.13, 0.12, 0.11), roughness=0.7, sheen=0.05),
        ramp_stops=[(0.2, (0.060, 0.056, 0.052)), (0.6, (0.125, 0.115, 0.105)), (0.9, (0.200, 0.185, 0.165))],
        scale=140.0, bump_strength=0.6, bump_distance=0.002, roughness=0.7)
    m['moss'] = wb.voronoi_scatter(
        wb.toy_material("S5_moss", (0.04, 0.10, 0.02), roughness=0.9, sheen=0.35),
        ramp_stops=[(0.15, (0.010, 0.036, 0.007)), (0.5, (0.026, 0.080, 0.014)), (0.85, (0.060, 0.125, 0.024))],
        scale=160.0, bump_strength=0.8, bump_distance=0.003, roughness=0.9)
    m['soil'] = wb.toy_material("S5_soil", (0.030, 0.020, 0.012), roughness=0.9)
    # Water: dark, glossy, a little see-through blue-green, rippled by a noise bump.
    w = wb.toy_material("S5_water", (0.004, 0.035, 0.040), roughness=0.04, specular=0.6, coat=1.0, coat_roughness=0.02)
    nt = w.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 55.0
    noise.inputs["Detail"].default_value = 2.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    m['water'] = w
    m['pad'] = wb.toy_material("S5_pad", (0.022, 0.110, 0.022), roughness=0.35, sheen=0.2, coat=0.4, coat_roughness=0.1)
    m['pad_under'] = wb.toy_material("S5_pad_light", (0.050, 0.150, 0.030), roughness=0.4, coat=0.3)
    m['petal'] = wb.toy_material("S5_petal", (0.60, 0.22, 0.32), roughness=0.45, sheen=0.4, sss=0.3, sss_color=(1.0, 0.7, 0.8))
    m['pollen'] = wb.toy_material("S5_pollen", (0.70, 0.45, 0.04), roughness=0.6)
    m['reed'] = wb.toy_material("S5_reed", (0.050, 0.130, 0.025), roughness=0.55, sheen=0.2)
    m['cattail'] = wb.toy_material("S5_cattail", (0.090, 0.036, 0.012), roughness=0.85, sheen=0.5)
    m['glass'] = bpy.data.materials["WP_glass"]
    m['cork'] = wb.toy_material("S5_cork", (0.22, 0.14, 0.07), roughness=0.85)
    # the frog
    skin = wb.toy_material("S5_frog_skin", (0.018, 0.100, 0.012), roughness=0.30, sheen=0.15, sss=0.12,
                           sss_color=(0.2, 0.5, 0.08), coat=0.55, coat_roughness=0.12)
    m['skin'] = skin
    m['belly'] = wb.toy_material("S5_frog_belly", (0.30, 0.29, 0.15), roughness=0.35, sss=0.2, coat=0.4, coat_roughness=0.15)
    # limbs and spots: plain, so the legs do not take the belly's pale end of the gradient
    m['leg'] = wb.toy_material("S5_frog_leg", (0.022, 0.110, 0.014), roughness=0.32, sheen=0.15, coat=0.5, coat_roughness=0.12)
    m['spot'] = wb.toy_material("S5_frog_spot", (0.008, 0.045, 0.008), roughness=0.35, coat=0.5, coat_roughness=0.12)
    m['iris'] = wb.toy_material("S5_frog_iris", (0.72, 0.36, 0.03), roughness=0.15, specular=0.6, coat=1.0)
    m['pupil'] = wb.toy_material("S5_frog_pupil", (0.008, 0.008, 0.010), roughness=0.08, specular=0.6)
    m['glint'] = wb.toy_material("S5_frog_glint", (1, 1, 1), roughness=0.1, emission=(1, 1, 1), emission_strength=1.4)
    m['mouth'] = wb.toy_material("S5_frog_mouth", (0.16, 0.025, 0.03), roughness=0.4)
    return m


# ---------------------------------------------------------------- pieces
def disc(name, r, h, col, mat, loc, notch_deg=0.0, seg=48):
    """A flat disc; with a notch it is a lily pad."""
    bm = bmesh.new()
    a0 = math.radians(notch_deg / 2)
    a1 = math.tau - a0
    n = seg
    centre = bm.verts.new((0.0, 0.0, 0.0))
    ring = [bm.verts.new((r * math.cos(a0 + (a1 - a0) * i / n), r * math.sin(a0 + (a1 - a0) * i / n), 0.0)) for i in range(n + 1)]
    for i in range(n):
        bm.faces.new((centre, ring[i], ring[i + 1]))
    if notch_deg == 0.0:
        pass
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, col)
    sol = ob.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = h
    sol.offset = -1.0
    wb.assign(ob, mat)
    ob.location = loc
    return ob


def lily(col, m, at, name):
    """A small pink water lily: two rings of petals and a yellow heart."""
    x, y, z = at
    out = []
    for ring, (count, tilt, length) in enumerate(((7, 0.55, 0.0085), (5, 1.0, 0.0065))):
        for i in range(count):
            a = math.tau * i / count + ring * 0.4
            p = ball(f"{name}_petal_{ring}_{i}", (length, 0.0030, 0.0009), col, m['petal'],
                     (x + math.cos(a) * length * 0.6 * math.cos(tilt), y + math.sin(a) * length * 0.6 * math.cos(tilt), z + 0.002 + length * 0.6 * math.sin(tilt)),
                     rot=(0.0, -tilt, a), seg=12, rings=8)
            out.append(p)
    out.append(ball(f"{name}_heart", (0.0022, 0.0022, 0.0020), col, m['pollen'], (x, y, z + 0.004), seg=10, rings=8))
    return out


def cattail(col, m, at, height, lean, name):
    x, y, z = at
    top = (x + lean[0], y + lean[1], z + height)
    out = [rod(f"{name}_stalk", (x, y, z - 0.004), top, 0.0011, col, m['reed'], verts=8)]
    hx, hy = lean[0] * 0.8, lean[1] * 0.8
    out.append(rod(f"{name}_head", (x + hx * 0.72, y + hy * 0.72, z + height * 0.70), (x + hx * 0.97, y + hy * 0.97, z + height * 0.95), 0.0042, col, m['cattail'], verts=12))
    for k, (side, h) in enumerate(((-1, 0.75), (1, 0.62))):
        leaf = wb.rounded_box(f"{name}_leaf_{k}", 0.0036, 0.0008, height * h, 0.0003, col)
        leaf.location = (x + side * 0.004, y, z + height * h / 2 - 0.004)
        leaf.rotation_euler = (0.0, side * 0.20, rng.uniform(-0.5, 0.5))
        wb.assign(leaf, m['reed'])
        out.append(leaf)
    return out


def tuft(col, m, at, name, n=5, h=0.012):
    out = []
    for i in range(n):
        a = rng.uniform(0, math.tau)
        b = wb.rounded_box(f"{name}_{i}", 0.0016, 0.0006, h * rng.uniform(0.6, 1.0), 0.0002, col)
        b.location = (at[0] + math.cos(a) * 0.003, at[1] + math.sin(a) * 0.003, at[2] + h * 0.35)
        b.rotation_euler = (rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), a)
        wb.assign(b, m['reed'])
        out.append(b)
    return out


# ---------------------------------------------------------------- the pond
POND_R = 0.150           # outer radius of the basin
POND_H = 0.058           # height of its wall
BANK_Z = GROUND + POND_H - 0.004
WATER_C = (0.0, 0.030)   # the water is set back, leaving a mossy bank across the front
WATER_R = 0.104
WATER_Z = BANK_Z - 0.007
PAD_AT = (-0.022, -0.012)
ROCK_AT = (0.056, -0.004)


def build_pond(m):
    col = s5.collection("S5_Pond")
    mem = s5.collection("S5_PondMemorial")
    # the basin: a low stone bowl, lathed
    prof = [(0.0, GROUND), (POND_R - 0.012, GROUND), (POND_R + 0.004, GROUND + 0.016), (POND_R + 0.008, GROUND + 0.036),
            (POND_R + 0.003, GROUND + POND_H - 0.004), (POND_R - 0.002, GROUND + POND_H), (POND_R - 0.010, GROUND + POND_H - 0.001),
            (POND_R - 0.013, GROUND + 0.014), (0.0, GROUND + 0.014)]
    basin = wb.lathe("S5_pond_basin", prof, col, segments=72)
    wb.add_subsurf(basin, 1)
    wb.assign(basin, m['stone'])
    # the bank: a mossy slab filling the basin, with the water cut out of it
    bank = disc("S5_pond_bank", POND_R - 0.012, 0.010, col, m['moss'], (0, 0, BANK_Z), seg=72)
    cutter = wb.cylinder("S5_pond_cutter", WATER_R, 0.05, col, verts=64)
    cutter.location = (WATER_C[0], WATER_C[1], BANK_Z)
    cutter.hide_render = True
    cutter.display_type = 'WIRE'
    boo = bank.modifiers.new("Water", 'BOOLEAN')
    boo.operation = 'DIFFERENCE'
    boo.object = cutter
    # the pool's floor and the water over it
    disc("S5_pond_floor", WATER_R + 0.002, 0.002, col, m['soil'], (WATER_C[0], WATER_C[1], WATER_Z - 0.006), seg=48)
    disc("S5_pond_water", WATER_R + 0.001, 0.0015, col, m['water'], (WATER_C[0], WATER_C[1], WATER_Z), seg=64)
    # lily pads: the frog's, and three smaller
    disc("S5_pond_pad", 0.036, 0.0016, col, m['pad'], (PAD_AT[0], PAD_AT[1], WATER_Z + 0.0018), notch_deg=26).rotation_euler = (0, 0, R(205))
    for i, (x, y, r, a) in enumerate(((0.062, 0.082, 0.019, 40), (-0.074, 0.070, 0.022, 300), (0.004, 0.098, 0.015, 150), (-0.078, 0.018, 0.013, 95))):
        disc(f"S5_pond_pad_{i}", r, 0.0014, col, m['pad_under' if i % 2 else 'pad'], (x, y, WATER_Z + 0.0016), notch_deg=30).rotation_euler = (0, 0, R(a))
    lily(col, m, (0.066, 0.086, WATER_Z + 0.003), "S5_pond_lily")
    # the rock the frog hops to
    rock = ball("S5_pond_rock", (0.030, 0.026, 0.017), col, m['rock'], (ROCK_AT[0], ROCK_AT[1], WATER_Z + 0.004), rot=(0.1, -0.08, 0.5), seg=24, rings=14)
    wb.add_subsurf(rock, 1)
    ball("S5_pond_rock_b", (0.014, 0.012, 0.009), col, m['rock'], (ROCK_AT[0] + 0.030, ROCK_AT[1] + 0.016, WATER_Z + 0.002), rot=(0.2, 0.1, 1.1))
    # cattails across the back bank
    for i, (x, hgt, lx) in enumerate(((-0.090, 0.085, -0.006), (-0.062, 0.105, 0.002), (-0.030, 0.092, -0.003), (0.040, 0.100, 0.005), (0.074, 0.082, 0.008), (0.100, 0.070, 0.004))):
        y = math.sqrt(max(0.0, (POND_R - 0.024) ** 2 - x * x)) - 0.006
        cattail(col, m, (x, y, BANK_Z), hgt, (lx, 0.004), f"S5_pond_cat_{i}")
    # the front bank: tufts and pebbles at its two ends, clear in the middle where the crickets hop
    for i, (x, y) in enumerate(((-0.105, -0.070), (-0.118, -0.040), (0.108, -0.066), (0.122, -0.030), (-0.060, -0.118), (0.070, -0.116))):
        tuft(col, m, (x, y, BANK_Z), f"S5_pond_tuft_{i}")
    for i in range(16):
        a = rng.uniform(R(200), R(340))
        rr = rng.uniform(WATER_R + 0.018, POND_R - 0.022)
        x, y = math.cos(a) * rr, math.sin(a) * rr * 0.92 - 0.004
        if abs(x) < 0.085 and y > -0.125:
            continue
        ball(f"S5_pond_pebble_{i}", (rng.uniform(0.004, 0.007), rng.uniform(0.003, 0.006), 0.003), col, m['rock'], (x, y, BANK_Z + 0.001), rot=(0, 0, rng.uniform(0, 3)))
    s5.flag(mem, (PAD_AT[0], PAD_AT[1], WATER_Z + 0.002), "S5_pond_mem")
    return col


# ---------------------------------------------------------------- the jar
JAR_R = 0.098
JAR_H = 0.170
JAR_FLOOR = GROUND + 0.040      # the moss floor inside


def build_jar(m):
    col = s5.collection("S5_Jar")
    glass = s5.collection("S5_JarGlass")
    mem = s5.collection("S5_JarMemorial")
    # the shell: a wide jar with a shoulder and an open mouth, a thin wall
    # Walls only. A lathed base (a fan to the axis, solidified and subdivided) rendered as a toothed grey
    # disc over everything inside; the soil hides where the base would be.
    prof = [(JAR_R - 0.006, GROUND + 0.003), (JAR_R, GROUND + 0.014), (JAR_R, GROUND + JAR_H * 0.72),
            (JAR_R - 0.012, GROUND + JAR_H * 0.86), (JAR_R - 0.024, GROUND + JAR_H * 0.93), (JAR_R - 0.024, GROUND + JAR_H),
            (JAR_R - 0.020, GROUND + JAR_H + 0.004)]
    shell = wb.lathe("S5_jar_shell", prof, glass, segments=72, close_bottom=False, close_top=False)
    sol = shell.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.003
    wb.add_subsurf(shell, 1)
    wb.assign(shell, m['glass'])
    # inside: soil, a moss floor with a pool cut into it
    # Clean cylinders, not solidified fans: the fan's rim came out as a ring of teeth once the pool
    # was cut out of it, all the way round the front of the jar.
    soil = wb.cylinder("S5_jar_soil", JAR_R - 0.006, 0.030, col, verts=72)
    soil.location = (0, 0, JAR_FLOOR - 0.021)
    wb.assign(soil, m['soil'])
    moss = wb.cylinder("S5_jar_moss", JAR_R - 0.0055, 0.008, col, verts=72)
    moss.location = (0, 0, JAR_FLOOR - 0.004)
    wb.assign(moss, m['moss'])
    cutter = wb.cylinder("S5_jar_cutter", 0.046, 0.05, col, verts=48)
    cutter.location = (-0.020, 0.022, JAR_FLOOR)
    cutter.hide_render = True
    boo = moss.modifiers.new("Pool", 'BOOLEAN')
    boo.operation = 'DIFFERENCE'
    boo.object = cutter
    disc("S5_jar_water", 0.047, 0.0015, col, m['water'], (-0.020, 0.022, JAR_FLOOR - 0.004), seg=48)
    disc("S5_jar_pad", 0.026, 0.0014, col, m['pad'], (-0.026, 0.012, JAR_FLOOR - 0.0026), notch_deg=28).rotation_euler = (0, 0, R(200))
    rock = ball("S5_jar_rock", (0.024, 0.021, 0.014), col, m['rock'], (0.046, 0.002, JAR_FLOOR + 0.004), rot=(0.1, -0.06, 0.4), seg=24, rings=14)
    wb.add_subsurf(rock, 1)
    for i, (x, y, hgt) in enumerate(((-0.060, 0.060, 0.075), (-0.030, 0.076, 0.090), (0.030, 0.072, 0.070))):
        cattail(col, m, (x, y, JAR_FLOOR), hgt, (0.002 * (i - 1), 0.002), f"S5_jar_cat_{i}")
    for i, (x, y) in enumerate(((0.066, 0.040), (-0.074, -0.020), (0.060, -0.050))):
        tuft(col, m, (x, y, JAR_FLOOR), f"S5_jar_tuft_{i}")
    s5.flag(mem, (-0.026, 0.012, JAR_FLOOR - 0.002), "S5_jar_mem")
    return col


# ---------------------------------------------------------------- the frog
FROG_YAW = R(-50.0)
FROG_SCALE = 1.12
FEET_Z = -0.0165         # root-local height of the soles


def build_frog(m):
    col = s5.collection("S5_Frog")
    rig = bpy.data.objects.new("RIG_frog_root", None)
    col.objects.link(rig)
    rig.scale = (FROG_SCALE,) * 3
    rig.rotation_euler = (0.0, 0.0, FROG_YAW)
    wb.belly_gradient(m['skin'], (0.018, 0.100, 0.012), (0.150, 0.230, 0.060), -0.014, 0.003, space_object=rig)
    # body and head in one loft: a frog has no neck. Sitting up: the back slopes down to the rump.
    sections = [(-0.030, 0.000, 0.000, -0.008), (-0.024, 0.011, 0.007, -0.007), (-0.012, 0.019, 0.012, -0.003),
                (0.002, 0.021, 0.0135, 0.002), (0.012, 0.0195, 0.0120, 0.0065), (0.021, 0.015, 0.0085, 0.0085),
                (0.0275, 0.000, 0.000, 0.0085)]
    body = wb.tapered_body("HERO_frog_body", sections, col, segments=28, rings=18)
    wb.add_subsurf(body, 1)
    wb.assign(body, m['skin'])
    parts = {}
    obs = [body]
    # the pale throat, which pulses, and balloons in a croak
    throat = ball("HERO_frog_throat", (0.0085, 0.0100, 0.0052), col, m['belly'], (0.0135, 0.0, -0.0020), seg=18, rings=12)
    obs.append(throat)
    parts['throat'] = (throat, 'scale')
    # the mouth: a dark line under the snout that opens
    mouth = ball("HERO_frog_mouth", (0.0085, 0.0135, 0.0007), col, m['mouth'], (0.0185, 0.0, 0.0050), rot=(0, R(-6), 0), seg=16, rings=8)
    obs.append(mouth)
    parts['mouth'] = (mouth, 'scale')
    for side, s in (('l', 1), ('r', -1)):
        mound = ball(f"HERO_frog_mound_{side}", (0.0068, 0.0062, 0.0060), col, m['skin'], (0.0125, s * 0.0105, 0.0150))
        eye = ball(f"HERO_frog_eye_{side}", (0.0050, 0.0050, 0.0050), col, m['iris'], (0.0140, s * 0.0128, 0.0166))
        d = Vector((0.45, s * 0.85, 0.20)).normalized()
        pupil = ball(f"HERO_frog_pupil_{side}", (0.0030, 0.0014, 0.0022), col, m['pupil'],
                     (0.0140 + d.x * 0.0041, s * 0.0128 + d.y * 0.0041, 0.0166 + d.z * 0.0041), rot=(0, 0, math.atan2(d.y, d.x)), seg=12, rings=8)
        g = Vector((0.55, s * 0.6, 0.6)).normalized()
        glint = ball(f"HERO_frog_glint_{side}", (0.0009, 0.0009, 0.0009), col, m['glint'],
                     (0.0140 + g.x * 0.0049, s * 0.0128 + g.y * 0.0049, 0.0166 + g.z * 0.0049), seg=8, rings=6)
        obs += [mound, eye, pupil, glint]
        for n, o in (('eye', eye), ('pupil', pupil), ('glint', glint)):
            parts[f'{n}_{side}'] = (o, 'scale')
        # front leg: an arm down to a hand planted ahead of the shoulder
        arm = ball(f"HERO_frog_arm_{side}", (0.0042, 0.0040, 0.0078), col, m['leg'], (0.0118, s * 0.0178, -0.0082), rot=(s * R(-16), R(-22), 0))
        hand = ball(f"HERO_frog_hand_{side}", (0.0068, 0.0058, 0.0015), col, m['leg'], (0.0160, s * 0.0222, FEET_Z + 0.0012), rot=(0, 0, s * 0.45))
        obs += [arm, hand]
        parts[f'arm_{side}'] = (arm, 'loc')
        parts[f'hand_{side}'] = (hand, 'loc')
        # hind leg, folded: thigh along the flank, shin tucked under it, a long foot on the ground
        thigh = ball(f"HERO_frog_thigh_{side}", (0.0135, 0.0068, 0.0066), col, m['leg'], (-0.0125, s * 0.0205, -0.0055), rot=(0, R(22), s * R(18)))
        shin = ball(f"HERO_frog_shin_{side}", (0.0125, 0.0046, 0.0044), col, m['leg'], (-0.0150, s * 0.0262, -0.0118), rot=(0, R(-10), s * R(8)))
        foot = ball(f"HERO_frog_foot_{side}", (0.0118, 0.0052, 0.0013), col, m['leg'], (-0.0060, s * 0.0295, FEET_Z + 0.0011), rot=(0, 0, s * R(14)))
        obs += [thigh, shin, foot]
        for n, o in (('thigh', thigh), ('shin', shin), ('foot', foot)):
            parts[f'{n}_{side}'] = (o, 'loc')
    # a few darker spots along the back
    for i, (x, y, z, r) in enumerate(((-0.010, 0.006, 0.0105, 0.0032), (-0.002, -0.008, 0.0140, 0.0026), (-0.016, -0.007, 0.0060, 0.0028),
                                      (0.004, 0.009, 0.0150, 0.0022), (-0.020, 0.004, 0.0030, 0.0022))):
        obs.append(ball(f"HERO_frog_spot_{i}", (r, r * 0.8, 0.0012), col, m['spot'], (x, y, z), rot=(y * -18, R(-14), 0), seg=10, rings=6))
    s5.parent(rig, obs)
    return col, rig, body, parts


def frog_states(P):
    def legs(back=0.0, lift=0.0, front=0.0, flift=0.0):
        """Hind legs pushed back by `back` and raised by `lift`; hands forward by `front`, up `flift`."""
        d = {}
        for side in ('l', 'r'):
            d[f'thigh_{side}'] = (-back * 0.5, 0.0, lift * 0.6)
            d[f'shin_{side}'] = (-back * 0.9, 0.0, lift * 0.9)
            d[f'foot_{side}'] = (-back * 1.5, 0.0, lift)
            d[f'arm_{side}'] = (front * 0.6, 0.0, flift * 0.6)
            d[f'hand_{side}'] = (front, 0.0, flift)
        return d

    def eyes(open_=1.0):
        d = {}
        for side in ('l', 'r'):
            for n in ('eye', 'pupil', 'glint'):
                d[f'{n}_{side}'] = (1.0, 1.0, open_)
        return d

    def face(throat=1.0, mouth=1.0, eye=1.0, **limbs):
        d = {'throat': (throat, throat, throat), 'mouth': (1.0, 1.0, mouth)}
        d.update(eyes(eye))
        d.update(legs(**limbs))
        return d

    IDLE = P.pose(parts=face())
    SLEEP = P.pose(z=-0.0020, ry=R(5), sz=0.93, sx=1.04, parts=face(throat=0.95, eye=0.14))
    DEAD = P.pose(rx=R(180), z=0.0105, ry=R(4), parts=face(eye=0.10, back=0.004, front=0.002))

    def idle(i, n):
        t = i / n
        # the throat never stops: two quick flutters a cycle
        flutter = 1.0 + 0.10 * (0.5 + 0.5 * math.cos(t * math.tau * 2))
        return P.pose(z=0.0003 * math.cos(t * math.tau), sz=1.0 + 0.010 * math.cos(t * math.tau),
                      rz=R(0.8 * math.sin(t * math.tau + 0.9)), parts=face(throat=flutter, eye=0.12 if i == 5 else 1.0))

    def croak(i, n):
        t = i / n
        sac = 1.0 + 1.25 * (0.5 - 0.5 * math.cos(t * math.tau))
        return P.pose(ry=R(-5.0 * (sac - 1.0)), sz=1.0 - 0.03 * (sac - 1.0), sx=1.0 + 0.02 * (sac - 1.0),
                      z=0.0006 * (sac - 1.0), parts=face(throat=sac, mouth=0.9, eye=0.8 if 2 <= i <= 5 else 1.0))

    def hop(i, n):
        k = [  # z, pitch (deg, + nose down), sz, sx, hind back, hind lift, hands forward, hands lift
            (-0.0022, 5, 0.90, 1.05, 0.000, 0.0, 0.000, 0.0),      # crouch
            (0.0020, -18, 1.06, 0.97, 0.014, 0.001, 0.003, 0.004),  # push off: legs straight out behind
            (0.0055, -10, 1.08, 0.96, 0.018, 0.004, 0.005, 0.007),  # in the air, stretched
            (0.0050, 6, 1.02, 1.00, 0.010, 0.006, 0.007, 0.005),   # coming down, legs gathering
            (-0.0026, 9, 0.88, 1.07, 0.000, 0.0, 0.002, 0.0),      # landing squash
            (0.0000, 0, 1.00, 1.00, 0.000, 0.0, 0.000, 0.0),       # settled
        ][i]
        return P.pose(z=k[0], ry=R(k[1]), sz=k[2], sx=k[3], parts=face(back=k[4], lift=k[5], front=k[6], flift=k[7]))

    def snap(i, n):
        k = [  # lean forward (x), pitch, mouth, throat
            (0.0000, 2, 1.0, 1.0),
            (0.0045, -4, 9.0, 0.85),     # the lunge: mouth wide
            (0.0035, -3, 7.0, 0.9),      # tongue out (drawn by the app), mouth still open
            (0.0005, 3, 1.0, 1.35),      # the gulp
        ][i]
        return P.pose(x=k[0] * math.cos(-FROG_YAW), y=k[0] * math.sin(FROG_YAW), ry=R(k[1]), parts=face(mouth=k[2], throat=k[3], eye=0.6 if i == 3 else 1.0))

    def hungry(i, n):
        t = i / n
        return P.pose(z=-0.0026 + 0.0003 * math.cos(t * math.tau), ry=R(4), sz=0.90 + 0.008 * math.cos(t * math.tau), sx=1.05,
                      rz=R(3.0 * math.sin(t * math.tau + 0.4)), parts=face(throat=1.0 + 0.04 * math.cos(t * math.tau), eye=0.14 if i == 3 else 0.72))

    def sleep(i, n):
        t = i / n
        b = math.cos(t * math.tau)
        p = dict(SLEEP)
        p = P.pose(z=-0.0020 + 0.0003 * b, ry=R(5), sz=0.93 + 0.014 * b, sx=1.04 - 0.008 * b, parts=face(throat=0.95 + 0.05 * b, eye=0.14))
        return p

    def die(i, n):
        t = i / (n - 1)
        if t < 0.35:
            w = t / 0.35
            return P.pose(sz=1.0 - 0.06 * w, rz=R(4 * math.sin(w * math.tau)), parts=face(eye=1.0 - 0.6 * w))
        g = min(1.0, ((t - 0.35) / 0.65) ** 1.6)
        p = mix(P.pose(sz=0.94, parts=face(eye=0.4)), DEAD, g)
        p["z"] += 0.006 * math.sin(math.pi * g)   # it lifts as it rolls
        return p

    def turn(i, n):
        t = i / (n - 1)
        s = smooth(t)
        hop_ = math.sin(math.pi * t)
        return P.pose(rz=R(-80.0) * s, z=0.0016 * hop_, sz=1.0 + 0.03 * hop_, parts=face(lift=0.0012 * hop_, flift=0.0015 * hop_))

    P.block("idle", 8, True, idle)
    P.block("croak", 8, True, croak)
    P.block("hop", 6, False, hop)
    P.block("snap", 4, False, snap)
    P.block("hungry", 6, True, hungry)
    P.block("sleep", 6, True, sleep)
    P.block("dead", 1, True, lambda i, n: DEAD)
    P.block("die", 6, False, die)
    P.block("turn", 7, False, turn)
    P.finish()
    _ = IDLE


# ---------------------------------------------------------------- run
s5.setup(SAMPLES)
M = materials()
geom = {}

if ALL or "pond" in JOBS or "geom" in JOBS:
    build_pond(M)
    cam = s5.camera("CAM_pond", s5.ORTHO, (0.0, 0.0, GROUND + 0.060), shift=(0.0, -8.0))
    geom["pond"] = {
        "pad": s5.project(cam, (PAD_AT[0], PAD_AT[1], WATER_Z + 0.004)),
        "rock": s5.project(cam, (ROCK_AT[0], ROCK_AT[1], WATER_Z + 0.021)),
        "bankLeft": s5.project(cam, (-0.085, -0.108, BANK_Z + 0.002)),
        "bankMid": s5.project(cam, (0.0, -0.108, BANK_Z + 0.002)),
        "bankRight": s5.project(cam, (0.085, -0.108, BANK_Z + 0.002)),
        "water": s5.rect_of(cam, [bpy.data.objects["S5_pond_water"]]),
        "basin": s5.rect_of(cam, [bpy.data.objects["S5_pond_basin"]]),
    }
    if ALL or "pond" in JOBS:
        for v in VARIANTS:
            s5.light(v)
            s5.only("S5_Pond", "WP_Ground")
            s5.shoot(cam, os.path.join(OUT, "pond", v, "bg.png"))
            if v == "day":
                s5.only("S5_Pond", "WP_Ground", "S5_PondMemorial")
                s5.shoot(cam, os.path.join(OUT, "pond", "memorial", "bg.png"))

if ALL or "jar" in JOBS or "geom" in JOBS:
    build_jar(M)
    cam = s5.camera("CAM_jar", s5.ORTHO, (0.0, 0.0, GROUND + 0.085), shift=(0.0, -4.0))
    geom["jar"] = {
        "pad": s5.project(cam, (-0.026, 0.012, JAR_FLOOR + 0.002)),
        "rock": s5.project(cam, (0.046, 0.002, JAR_FLOOR + 0.019)),
        "bankLeft": s5.project(cam, (-0.060, -0.058, JAR_FLOOR + 0.002)),
        "bankMid": s5.project(cam, (0.0, -0.062, JAR_FLOOR + 0.002)),
        "bankRight": s5.project(cam, (0.060, -0.058, JAR_FLOOR + 0.002)),
        "water": s5.rect_of(cam, [bpy.data.objects["S5_jar_water"]]),
        "shell": s5.rect_of(cam, [bpy.data.objects["S5_jar_shell"]]),
    }
    if ALL or "jar" in JOBS:
        MIRRORED = {name: bpy.data.objects[name].visible_glossy for name in ("LGT_key", "LGT_fill", "LGT_rim")}
        print("WP_MIRRORED %s" % MIRRORED, flush=True)
        for v in VARIANTS:
            s5.light(v)
            # A low sun or the moon mirrors off the jar's curve as one large pale shape, right across
            # the frog. By day the lights are high and it does not. So in the other three lights the
            # glass is lit by them but does not mirror them; by day each light is as the scene has it.
            for name, was in MIRRORED.items():
                bpy.data.objects[name].visible_glossy = was if v == "day" else False
            s5.only("S5_Jar", "WP_Ground")
            s5.shoot(cam, os.path.join(OUT, "jar", v, "bg.png"))
            if v == "day":
                s5.only("S5_Jar", "WP_Ground", "S5_JarMemorial")
                s5.shoot(cam, os.path.join(OUT, "jar", "memorial", "bg.png"))
            # the glass alone, drawn over the frog: reflections on alpha, nothing behind it
            s5.only("S5_JarGlass")
            s5.CATCHER.hide_render = True
            s5.sc.cycles.film_transparent_glass = True
            s5.shoot(cam, os.path.join(OUT, "jar", v, "glass.png"))
        for name, was in MIRRORED.items():
            bpy.data.objects[name].visible_glossy = was

if geom:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "frog-geom.json"), "w") as fh:
        json.dump(geom, fh, indent=1)
    print("WP_GEOM %s" % json.dumps(geom), flush=True)

if ALL or "frog" in JOBS or any(j in JOBS for j in ("idle", "croak", "hop", "snap", "hungry", "sleep", "dead", "die", "turn")):
    col, rig, body, parts = build_frog(M)
    rig.location = (0.0, 0.0, 0.040)
    P = s5.Poser(rig, FROG_YAW, body, parts)
    frog_states(P)
    # the sprite camera: an 80 px crop of the habitat view, centred on the body
    cam = s5.camera("CAM_frog", s5.ORTHO * s5.FRAME_PX / 320.0, (0.0, 0.0, 0.040 - 0.001), shift=(-2.0, 0.0))
    s5.light("day")
    s5.only("S5_Frog")
    s5.CATCHER.hide_render = True
    P.render(cam, os.path.join(OUT, "frog"), JOBS, key="frog" if not ALL else "all")
print("WP_DONE", flush=True)
