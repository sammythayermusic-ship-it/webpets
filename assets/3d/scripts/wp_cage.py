"""Build the hamster cage and the hamster into wp_scene.blend.

    Blender -b wp_scene.blend -P wp_cage.py -- <out.blend> [pass]

Built to `assets/reference/habitats-hires/hamster-cage.png`, which CLAUDE.md names as the visual
target: a blue plastic tub with a wire top, a wheel on the left, a water bottle hanging centre-right,
a seed hopper on the right, and wood-shaving bedding.

Lives in the SAME scene as the bowl on purpose. The three-point rig (LGT_key/fill/rim) and the world
are most of why the goldfish looks the way it does, and a second habitat lit by a second rig would
read as a different product however good its geometry was.

Metres, Z-up, radians. The ground plane is z = GROUND, matching the bowl's stand and the existing
shadow catcher. Nothing here generates anything: every shape is a primitive or a lathe, as the bowl was.
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp_cage.blend"
PASS = ARGS[1] if len(ARGS) > 1 else "all"

# The floor everything stands on, taken from the bowl's own base and shadow catcher.
GROUND = -0.049

# Cage envelope. Sized so it fills the delivery camera about as much as the bowl does: the bowl is
# roughly 0.32 m across in a 0.43 ortho frame, and a cage is a wider, shallower object.
CAGE_W = 0.320
CAGE_D = 0.200
TUB_H = 0.072
BAR_H = 0.135

BLUE = (0.009, 0.085, 0.215)
BLUE_LIGHT = (0.013, 0.132, 0.305)
BLUE_DARK = (0.004, 0.045, 0.125)
WIRE = (0.780, 0.812, 0.855)


def clear_collection(name):
    """Remove a collection and everything in it, so the script is idempotent."""
    col = bpy.data.collections.get(name)
    if col is None:
        return
    for ob in list(col.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(col)


def rounded_box(name, w, d, h, r, collection, segments=8):
    """A box with rounded vertical edges and a softened top, built as a bmesh.

    A cube with a Bevel modifier would do the same thing, but bevel works in local space and this
    object gets no uniform scale, so doing it in geometry keeps the radius honest at every size.
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    bmesh.ops.bevel(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        offset=r,
        segments=segments,
        profile=0.5,
        affect='EDGES',
    )
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, collection)
    wb.shade_smooth(ob)
    return ob


def cylinder(name, radius, height, collection, verts=24, axis='Z'):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=verts,
        radius1=radius, radius2=radius, depth=height,
    )
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Vector((1, 0, 0)).to_track_quat('Z', 'Y').to_matrix())
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, collection)
    wb.shade_smooth(ob)
    return ob


def sphere(name, rx, ry, rz, collection, segments=24, rings=14):
    """An ellipsoid. Ears, eyes, paws and nose are all one of these with different radii."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector((rx, ry, rz)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, collection)
    wb.shade_smooth(ob)
    return ob


def torus(name, major, minor, collection, major_seg=40, minor_seg=10):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=major_seg, radius=major)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = wb.new_object(name, me, collection)
    sk = ob.modifiers.new("Skin", 'SKIN')
    for v in ob.data.skin_vertices[0].data:
        v.radius = (minor, minor)
    wb.add_subsurf(ob, 2)
    wb.shade_smooth(ob)
    return ob


# ----------------------------------------------------------------------- materials

def materials():
    m = {}
    m['tub'] = wb.toy_material("WP_cage_tub", BLUE, roughness=0.38, sheen=0.30)
    m['tub_rim'] = wb.toy_material("WP_cage_rim", BLUE_DARK, roughness=0.33, sheen=0.35)
    m['tub_light'] = wb.toy_material("WP_cage_blue_light", BLUE_LIGHT, roughness=0.36, sheen=0.30)
    m['wire'] = wb.toy_material("WP_cage_wire", WIRE, roughness=0.30, sheen=0.20)
    m['bottle'] = wb.toy_material("WP_cage_bottle", (0.86, 0.93, 0.97), roughness=0.08,
                                  alpha=0.35, transmission=0.85)
    m['water'] = wb.toy_material("WP_cage_water", (0.62, 0.84, 0.92), roughness=0.05,
                                 alpha=0.55, transmission=0.70)
    m['metal'] = wb.toy_material("WP_cage_metal", (0.62, 0.65, 0.70), roughness=0.25)
    # Wood shavings: three tones so the bedding is not one flat colour, exactly as the gravel is a
    # palette rather than a texture.
    m['bed_a'] = wb.toy_material("WP_bed_a", (0.878, 0.745, 0.518), roughness=0.75, sheen=0.10)
    m['bed_b'] = wb.toy_material("WP_bed_b", (0.808, 0.651, 0.427), roughness=0.78, sheen=0.10)
    m['bed_c'] = wb.toy_material("WP_bed_c", (0.925, 0.835, 0.651), roughness=0.72, sheen=0.10)
    m['seed'] = wb.toy_material("WP_cage_seed", (0.839, 0.678, 0.365), roughness=0.70)
    return m


# --------------------------------------------------------------------------- tub

# Wall thickness of the moulded tub.
WALL = 0.010


def build_tub(col, m):
    """The blue plastic base: a floor, four drafted walls, a heavier rim lip, and four feet.

    Built as five slabs rather than one box. The first version was a single solid, which looked right
    from outside and buried every piece of bedding inside it -- a tub you cannot see into is a brick.
    Explicit walls also keep the draft honest, since each one leans on its own.
    """
    floor = rounded_box("ENV_cage_floor", CAGE_W - 2 * WALL, CAGE_D - 2 * WALL, 0.008, 0.003, col)
    floor.location = (0.0, 0.0, GROUND + 0.010)
    wb.assign(floor, m['tub'])

    for i, (nx, ny) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        along_x = nx == 0
        w = CAGE_W if along_x else WALL
        d = WALL if along_x else CAGE_D
        wall = rounded_box(f"ENV_cage_wall_{i}", w, d, TUB_H, 0.006, col)
        wall.location = (
            nx * (CAGE_W / 2 - WALL / 2),
            ny * (CAGE_D / 2 - WALL / 2),
            GROUND + TUB_H / 2 + 0.006,
        )
        # Drafted: a moulded tub is always narrower at the bottom, and the lean is what stops the whole
        # thing reading as a cardboard box.
        for v in wall.data.vertices:
            t = (v.co.z + TUB_H / 2) / TUB_H
            lean = (1.0 - t) * 0.006
            v.co.x -= nx * lean
            v.co.y -= ny * lean
        wb.assign(wall, m['tub'])

    # The rim is a FRAME, four bars around the lip -- not a slab. The first version was one box across
    # the whole footprint, which is a lid: it sealed the tub and hid every piece of bedding, the wheel's
    # base and the hamster, while looking perfectly correct from outside.
    for i, (nx, ny) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        along_x = nx == 0
        w = CAGE_W + 0.010 if along_x else 0.014
        d = 0.014 if along_x else CAGE_D + 0.010
        rim = rounded_box(f"ENV_cage_rim_{i}", w, d, 0.013, 0.005, col)
        rim.location = (
            nx * (CAGE_W / 2 - 0.002),
            ny * (CAGE_D / 2 - 0.002),
            GROUND + TUB_H + 0.004,
        )
        wb.assign(rim, m['tub_rim'])

    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        f = rounded_box(f"ENV_cage_foot_{i}", 0.026, 0.020, 0.014, 0.005, col)
        f.location = (sx * (CAGE_W / 2 - 0.028), sy * (CAGE_D / 2 - 0.022), GROUND + 0.005)
        wb.assign(f, m['tub_rim'])
    return floor


def build_bars(col, m):
    """The wire top: vertical bars on all four sides, horizontal rails, and a carry handle."""
    z0 = GROUND + TUB_H + 0.008
    z1 = z0 + BAR_H
    r = 0.0026

    def bar(name, p0, p1):
        bm = bmesh.new()
        v0 = bm.verts.new(p0)
        v1 = bm.verts.new(p1)
        bm.edges.new((v0, v1))
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = wb.new_object(name, me, col)
        sk = ob.modifiers.new("Skin", 'SKIN')
        sk.use_smooth_shade = True
        for sv in ob.data.skin_vertices[0].data:
            sv.radius = (r, r)
        wb.add_subsurf(ob, 2)
        wb.shade_smooth(ob)
        wb.assign(ob, m['wire'])
        return ob

    hw, hd = CAGE_W / 2 - 0.004, CAGE_D / 2 - 0.004
    n_front = 15
    for i in range(n_front):
        x = -hw + (2 * hw) * i / (n_front - 1)
        bar(f"ENV_cage_bar_f_{i}", (x, -hd, z0), (x, -hd, z1))
        bar(f"ENV_cage_bar_b_{i}", (x, hd, z0), (x, hd, z1))
    n_side = 9
    for i in range(n_side):
        y = -hd + (2 * hd) * i / (n_side - 1)
        bar(f"ENV_cage_bar_l_{i}", (-hw, y, z0), (-hw, y, z1))
        bar(f"ENV_cage_bar_r_{i}", (hw, y, z0), (hw, y, z1))

    # Top rails and the roof grid, which is what makes it read as a cage rather than a fence.
    for y in (-hd, hd):
        bar(f"ENV_cage_rail_{'f' if y < 0 else 'b'}", (-hw, y, z1), (hw, y, z1))
    for x in (-hw, hw):
        bar(f"ENV_cage_rail_{'l' if x < 0 else 'r'}", (x, -hd, z1), (x, hd, z1))
    n_roof = 11
    for i in range(n_roof):
        x = -hw + (2 * hw) * i / (n_roof - 1)
        bar(f"ENV_cage_roof_{i}", (x, -hd, z1), (x, hd, z1))

    handle = torus("ENV_cage_handle", 0.030, 0.0026, col, major_seg=28)
    handle.rotation_euler = (math.radians(90), 0, 0)
    handle.location = (0.0, 0.0, z1 + 0.012)
    wb.assign(handle, m['wire'])
    return z0, z1


def build_bedding(col, m, rng):
    """Wood shavings as many small chips, the way the bowl's gravel is many small pebbles.

    A texture would be cheaper and would read as a flat brown rectangle at this size. What makes the
    gravel work is that every pebble catches the key light at its own angle; the same is true here.
    """
    top = GROUND + TUB_H + 0.002
    mats = [m['bed_a'], m['bed_b'], m['bed_c']]

    # A base slab first, so no blue shows between chips. 150 loose chips on a bare floor read as
    # crumbs someone spilled; bedding has to look like a layer the animal could burrow into.
    base = rounded_box("PRP_bed_base", CAGE_W - 2 * WALL - 0.002, CAGE_D - 2 * WALL - 0.002,
                       0.012, 0.004, col)
    base.location = (0.0, 0.0, top - 0.010)
    wb.assign(base, m['bed_b'])

    n = 420
    for i in range(n):
        w = rng.uniform(0.007, 0.016)
        d = rng.uniform(0.004, 0.008)
        h = rng.uniform(0.0015, 0.0030)
        chip = rounded_box(f"PRP_bed_{i}", w, d, h, min(w, d, h) * 0.35, col, segments=2)
        x = rng.uniform(-CAGE_W / 2 + WALL + 0.004, CAGE_W / 2 - WALL - 0.004)
        y = rng.uniform(-CAGE_D / 2 + WALL + 0.004, CAGE_D / 2 - WALL - 0.004)
        # Piled slightly deeper toward the back, so the bed has a front-to-back gradient rather than
        # reading as a flat sheet.
        z = top - 0.002 + 0.005 * (y / CAGE_D + 0.5) + rng.uniform(-0.0015, 0.0025)
        chip.location = (x, y, z)
        chip.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.25, 0.25), rng.uniform(0, math.pi))
        wb.assign(chip, mats[i % 3])


# How far the delivery camera looks DOWN, in degrees.
#
# The bowl uses 9, which is right for a sphere: it reads from almost any angle and a low camera keeps
# the glass tall in frame. A cage is a box with its contents on the floor, and at 9 degrees you see the
# front wall and nothing inside it -- the bedding, the wheel's base and the hamster's feet all hide
# behind the tub. The concept render looks down about 25, which is what lets you see into it, so the
# cage gets its own angle rather than inheriting one that was chosen for a different shape.
CAGE_PITCH_DEG = 25.0

BED_TOP = GROUND + TUB_H + 0.004


def build_wheel(col, m):
    """The exercise wheel, left of centre: a dished disc, a running rim, spokes and a wire stand."""
    cx, cy = -0.086, 0.020
    R = 0.044
    cz = BED_TOP + R * 0.86

    # Built front-to-back, because the camera only ever sees the front. The first version put the
    # face and the spokes BEHIND the drum, so the wheel rendered as a plain blue disc with every
    # detail hidden inside it.
    drum = cylinder("PRP_wheel_drum", R - 0.003, 0.022, col, verts=40)
    drum.rotation_euler = (math.radians(90), 0, 0)
    drum.location = (cx, cy, cz)
    wb.assign(drum, m['tub'])

    face = cylinder("PRP_wheel_face", R, 0.004, col, verts=40)
    face.rotation_euler = (math.radians(90), 0, 0)
    face.location = (cx, cy - 0.011, cz)
    wb.assign(face, m['tub_light'])

    rim = torus("PRP_wheel_rim", R, 0.0032, col, major_seg=44)
    rim.rotation_euler = (math.radians(90), 0, 0)
    rim.location = (cx, cy - 0.012, cz)
    wb.assign(rim, m['tub_rim'])

    for k in range(8):
        a = k * math.pi / 4
        sp = rounded_box(f"PRP_wheel_spoke_{k}", R * 0.86, 0.0040, 0.0034, 0.0015, col, segments=3)
        sp.location = (cx + math.cos(a) * R * 0.43, cy - 0.014, cz + math.sin(a) * R * 0.43)
        sp.rotation_euler = (0, -a, 0)
        wb.assign(sp, m['tub_rim'])

    hub = cylinder("PRP_wheel_hub", 0.008, 0.006, col, verts=20)
    hub.rotation_euler = (math.radians(90), 0, 0)
    hub.location = (cx, cy - 0.016, cz)
    wb.assign(hub, m['tub_rim'])

    # Stand: two legs and an axle, so the wheel is held rather than floating.
    for sx in (-1, 1):
        leg = rounded_box(f"PRP_wheel_leg_{'l' if sx < 0 else 'r'}", 0.005, 0.005,
                          cz - BED_TOP + 0.010, 0.002, col, segments=3)
        leg.location = (cx + sx * 0.030, cy - 0.013, BED_TOP + (cz - BED_TOP) / 2 - 0.005)
        leg.rotation_euler = (0, math.radians(-14 * sx), 0)
        wb.assign(leg, m['metal'])
    axle = cylinder("PRP_wheel_axle", 0.0035, 0.030, col, verts=16)
    axle.rotation_euler = (math.radians(90), 0, 0)
    axle.location = (cx, cy - 0.002, cz)
    wb.assign(axle, m['metal'])


def build_bottle(col, m, bar_top):
    """The water bottle, hanging on the bars right of centre: body, water, cap, spout."""
    cx, cy = 0.042, CAGE_D / 2 - 0.012
    top_z = BED_TOP + 0.108
    H = 0.054
    body = cylinder("PRP_bottle_body", 0.0125, H, col, verts=28)
    body.location = (cx, cy, top_z - H / 2)
    wb.assign(body, m['bottle'])

    water = cylinder("PRP_bottle_water", 0.0112, H * 0.66, col, verts=28)
    water.location = (cx, cy, top_z - H + H * 0.66 / 2 + 0.002)
    wb.assign(water, m['water'])

    cap = cylinder("PRP_bottle_cap", 0.0135, 0.010, col, verts=28)
    cap.location = (cx, cy, top_z + 0.004)
    wb.assign(cap, m['tub'])

    spout = cylinder("PRP_bottle_spout", 0.0030, 0.038, col, verts=14)
    spout.rotation_euler = (math.radians(24), 0, 0)
    spout.location = (cx, cy - 0.009, top_z - H - 0.014)
    wb.assign(spout, m['metal'])

    for sx in (-1, 1):
        clip = rounded_box(f"PRP_bottle_clip_{'l' if sx < 0 else 'r'}", 0.004, 0.016, 0.004, 0.0015,
                           col, segments=3)
        clip.location = (cx + sx * 0.013, cy + 0.006, top_z - 0.008)
        wb.assign(clip, m['wire'])


def build_hopper(col, m, rng):
    """The seed hopper on the right. It doubles as the pantry gauge, so the seed level is its own object."""
    cx, cy = 0.102, 0.010
    W, D, H = 0.036, 0.028, 0.054
    shell = rounded_box("PRP_hopper", W, D, H, 0.005, col)
    shell.location = (cx, cy, BED_TOP + H / 2 + 0.006)
    wb.assign(shell, m['tub'])

    lid = rounded_box("PRP_hopper_lid", W + 0.005, D + 0.005, 0.008, 0.003, col)
    lid.location = (cx, cy, BED_TOP + H + 0.006)
    wb.assign(lid, m['tub_rim'])

    # The window and the seed behind it: PRP_hopper_fill is the object the pantry level will drive.
    win = rounded_box("PRP_hopper_window", W - 0.010, 0.003, H - 0.018, 0.001, col, segments=3)
    win.location = (cx, cy - D / 2 + 0.001, BED_TOP + H / 2 + 0.004)
    wb.assign(win, m['bottle'])

    fill = rounded_box("PRP_hopper_fill", W - 0.012, D - 0.010, H * 0.52, 0.002, col, segments=3)
    fill.location = (cx, cy, BED_TOP + H * 0.52 / 2 + 0.008)
    wb.assign(fill, m['seed'])

    # A few loose seeds spilled at the foot of it, which is what sells a feeder as used.
    for i in range(14):
        sd = rounded_box(f"PRP_seed_{i}", 0.0038, 0.0026, 0.0022, 0.0009, col, segments=2)
        sd.location = (cx + rng.uniform(-0.034, 0.020), cy + rng.uniform(-0.024, 0.016),
                       BED_TOP + 0.002)
        sd.rotation_euler = (0, 0, rng.uniform(0, math.pi))
        wb.assign(sd, m['seed'])


# Sampled off the concept render: back sRGB (240,200,150), belly (250,240,220), then tuned against a
# render measured with the scene's lights ACTUALLY ON, then deepened for figure-ground separation.
#
# The concept's flat back colour rendered as a pale cream that sat 14 luminance levels from the wood
# shavings it stands on -- the animal read as a lump in the bedding. The goldfish clears its own
# background by 44. A real golden hamster is far more orange than shavings, so the fur went that way
# rather than the bedding going grey.
#
# Three rounds were spent chasing a hamster that came out dark and flat, blaming the base colour and
# then the material. The real cause was the measuring rig: LGT_key, LGT_fill and LGT_rim all live in
# the WP_Rig collection, and my preview script hid every WP_ collection it had not been asked for. Every
# reading was taken with the scene lit by nothing. `wp_render2.only_collection()` always keeps WP_Rig,
# which is what that line is for.
FUR_TOP = (0.560, 0.300, 0.098)
FUR_BELLY = (0.820, 0.700, 0.520)


def build_hamster(col, m):
    """The hamster: one tapered body with ears, eyes, nose, paws and a stub tail parented to it.

    Same construction as the goldfish -- a lofted body from cross-sections, subdivided, with a
    top-to-belly colour ramp -- so the two animals are siblings rather than one render and one
    something-else. Faces +X, like the fish, because the sprite player mirrors about that axis.
    """
    # Every part is built at the LOCAL origin and placed by the rig. The first version offset each
    # part by z0 and then also set the rig to z0, cancelling it with
    # `matrix_parent_inverse = rig.matrix_world.inverted()` -- which is the documented keep-transform
    # idiom and silently wrong here, because `matrix_world` is stale until the depsgraph updates and
    # background Blender never ran one. The offset applied twice and the hamster rendered half a body
    # above where the camera was pointing.
    z0 = BED_TOP + 0.031

    # (x, half_y, half_z, centre_z). Chunky and round: a hamster is mostly rump, with the head
    # blending into the body rather than sitting on a neck.
    sections = [
        (-0.036, 0.000, 0.000, 0.004),
        (-0.030, 0.013, 0.014, 0.002),
        (-0.020, 0.023, 0.024, 0.000),
        (-0.006, 0.027, 0.027, -0.001),
        (0.008, 0.025, 0.025, -0.001),
        (0.019, 0.020, 0.019, 0.001),
        (0.029, 0.013, 0.012, 0.003),
        (0.036, 0.000, 0.000, 0.004),
    ]
    body = wb.tapered_body("HERO_ham_body", sections, col, segments=40, rings=24)
    wb.add_subsurf(body, 2)
    body.location = (0.0, 0.0, 0.0)
    fur = wb.toy_material("WP_ham_fur", FUR_TOP, roughness=0.42, sheen=0.28, sss=0.12)
    wb.belly_gradient(fur, FUR_TOP, FUR_BELLY, -0.024, 0.024)
    wb.assign(body, fur)

    inner = wb.toy_material("WP_ham_inner", (0.92, 0.58, 0.55), roughness=0.40, sheen=0.28, sss=0.20)
    eye_m = wb.toy_material("WP_ham_eye", (0.030, 0.022, 0.028), roughness=0.22)
    glint_m = wb.toy_material("WP_ham_glint", (1.0, 1.0, 1.0), roughness=0.1,
                              emission=(1.0, 1.0, 1.0), emission_strength=1.4)
    nose_m = wb.toy_material("WP_ham_nose", (0.80, 0.36, 0.36), roughness=0.34, sheen=0.28)

    parts = []
    for sy in (-1, 1):
        tag = 'l' if sy < 0 else 'r'
        ear = sphere(f"HERO_ham_ear_{tag}", 0.0085, 0.0034, 0.0095, col, segments=20, rings=12)
        ear.location = (0.0175, sy * 0.0125, 0.0168)
        ear.rotation_euler = (math.radians(sy * -18), math.radians(-12), 0)
        wb.assign(ear, fur)
        parts.append(ear)

        inner_ear = sphere(f"HERO_ham_ear_in_{tag}", 0.0046, 0.0014, 0.0050, col, segments=16, rings=10)
        inner_ear.location = (0.0178, sy * 0.0139, 0.0170)
        inner_ear.rotation_euler = ear.rotation_euler
        wb.assign(inner_ear, inner)
        parts.append(inner_ear)

        eye = sphere(f"HERO_ham_eye_{tag}", 0.0042, 0.0042, 0.0046, col, segments=18, rings=12)
        eye.location = (0.0225, sy * 0.0128, 0.0065)
        wb.assign(eye, eye_m)
        parts.append(eye)

        glint = sphere(f"HERO_ham_glint_{tag}", 0.0014, 0.0014, 0.0014, col, segments=10, rings=7)
        glint.location = (0.0252, sy * 0.0148, 0.0092)
        wb.assign(glint, glint_m)
        parts.append(glint)

        paw = sphere(f"HERO_ham_paw_{tag}", 0.0062, 0.0042, 0.0034, col, segments=16, rings=10)
        paw.location = (0.0205, sy * 0.0128, -0.0205)
        wb.assign(paw, inner)
        parts.append(paw)

        foot = sphere(f"HERO_ham_foot_{tag}", 0.0075, 0.0050, 0.0036, col, segments=16, rings=10)
        foot.location = (-0.0145, sy * 0.0185, -0.0215)
        wb.assign(foot, inner)
        parts.append(foot)

    nose = sphere("HERO_ham_nose", 0.0032, 0.0030, 0.0024, col, segments=16, rings=10)
    nose.location = (0.0345, 0.0, 0.0048)
    wb.assign(nose, nose_m)
    parts.append(nose)

    tail = sphere("HERO_ham_tail", 0.0048, 0.0032, 0.0032, col, segments=14, rings=9)
    tail.location = (-0.0355, 0.0, 0.004)
    wb.assign(tail, fur)
    parts.append(tail)

    # A root empty so every state can be posed by moving one thing, exactly as RIG_fish_root does.
    rig = bpy.data.objects.get("RIG_ham_root")
    if rig is None:
        rig = bpy.data.objects.new("RIG_ham_root", None)
        col.objects.link(rig)
    rig.empty_display_size = 0.02
    rig.location = (0.0, 0.0, z0)
    # Identity parent inverse on purpose: the children are authored in the rig's own space, so the
    # rig's transform is meant to apply to them in full.
    for ob in [body] + parts:
        ob.parent = rig
    named = {'body': body}
    for ob in parts:
        if ob.name.startswith('HERO_ham_ear_in_'):
            continue
        # Paws are exposed alongside the ears and eyes because `eat` needs them: a hamster that holds
        # its food and nibbles is the pose everyone recognises, and it is the only secondary action in
        # that state large enough to survive being scaled down to 80 grid px.
        for key, suffix in (('ear', 'ear_'), ('eye', 'eye_'), ('glint', 'glint_'), ('paw', 'paw_')):
            if ob.name.startswith('HERO_ham_' + suffix):
                named[f"{key}_{ob.name[-1]}"] = ob
    return rig, named


# Frame blocks, continuing wp_render2's 100-apart spacing past the fish's 1..701.
HAM_STATES = [("idle", 1001, 12), ("eat", 1101, 8), ("hungry", 1201, 8),
              ("sleep", 1301, 6), ("dead", 1401, 1)]


def animate_hamster(rig, parts):
    """Pose the five core states onto the rig and a few parts.

    Keyed the way the fish's states are -- LINEAR interpolation between explicit poses, one block per
    state -- because the sprite player reads whole frames and never interpolates between them, so an
    eased curve would only smear the in-betweens it actually samples.

    §8 is the brief: "Hungry: wheel stops; sits by hopper facing the camera. Starving: lies flat.
    Dead: on its side."

    Every oscillator here is a COSINE, or a sine carrying a phase offset, and none completes more than
    one cycle per loop. That is not a style choice. `sin(t*tau)` sampled over n frames returns to zero
    at exactly i = n/2, so the first and middle frames of the loop land on an identical pose -- which
    is the pair the art gate compares, and the reason eat, hungry and sleep first rendered as frozen
    stills while idle did not. Idle survived by accident: its yaw carries a 0.9 rad offset, so its two
    sampled frames differ by 2.5 degrees of body rotation and nothing else in the state does.

    Amplitudes are sized in grid px, not metres. The cage is 0.32 m across and delivers 285 grid px
    wide, so roughly 0.0011 m buys one grid pixel; anything under ~0.0015 m of travel is invisible at
    delivery size no matter how correct it looks in the viewport.
    """
    body = parts['body']
    ear_l, ear_r = parts['ear_l'], parts['ear_r']
    eye_l, eye_r = parts['eye_l'], parts['eye_r']
    glint_l, glint_r = parts['glint_l'], parts['glint_r']
    paw_l, paw_r = parts['paw_l'], parts['paw_r']
    for ob in (rig, body, ear_l, ear_r, eye_l, eye_r, glint_l, glint_r, paw_l, paw_r):
        wb.clear_anim(ob)

    z0 = rig.location.z
    rot_x, rot_y, rot_z = {}, {}, {}
    z, sx, sz = {}, {}, {}
    ear_pitch = {}
    eye_sz = {}
    paw_z, paw_x = {}, {}
    # Every channel below must be given a value in EVERY state block. A block that leaves one out does
    # not freeze it -- it lets the f-curve interpolate straight across the 100-frame gap to whichever
    # state keys it next, so a pose set in `eat` would bleed backwards through the whole of `idle`.

    # ---- idle: breathing, with a small weight shift and an ear flick ------------------
    f0, n = 1001, 12
    for i in range(n):
        f = f0 + i
        t = i / n
        breathe = math.sin(t * math.tau)
        z[f] = z0 + 0.0012 * breathe
        sz[f] = 1.0 + 0.020 * breathe
        sx[f] = 1.0 - 0.012 * breathe
        rot_y[f] = math.radians(1.6 * math.sin(t * math.tau + 0.9))
        rot_x[f] = 0.0
        # One flick rather than a constant wobble: an ear that never stops moving reads as a glitch.
        rot_z[f] = math.radians(2.0 * math.sin(t * math.tau + 2.1))
        paw_z[f] = 0.0
        paw_x[f] = 0.0
        ear_pitch[f] = math.radians(-16) if i in (4, 5) else 0.0
        eye_sz[f] = 0.12 if i == 9 else 1.0   # a single blink

    # ---- eat: head down, holding the seed, rocking as it chews -----------------------
    f0, n = 1101, 8
    for i in range(n):
        f = f0 + i
        t = i / n
        # ONE cycle, as a cosine: frame 0 sits at the top of the chew and frame n/2 at the bottom, the
        # widest separation the loop can give the two frames the gate samples. The old `sin(t*tau*2)`
        # ran two cycles over eight frames, which quantised the whole chew to three distinct poses.
        chew = math.cos(t * math.tau)
        rot_y[f] = math.radians(13.0 + 6.0 * chew)    # nose pitched toward the bedding
        rot_z[f] = math.radians(2.2 * math.sin(t * math.tau + 1.2))
        z[f] = z0 - 0.0045 + 0.0022 * chew
        sz[f] = 1.0 + 0.022 * chew
        sx[f] = 1.0 - 0.010 * chew
        rot_x[f] = 0.0
        # Paws held up at the mouth and working: the gesture that makes this read as eating rather
        # than as a head bob, and the largest moving thing in the frame.
        paw_z[f] = 0.0165 + 0.0030 * chew
        paw_x[f] = 0.0045 - 0.0018 * chew
        ear_pitch[f] = math.radians(-6 + 4.0 * math.cos(t * math.tau + 0.6))
        eye_sz[f] = 0.14 if i == 6 else 1.0

    # ---- hungry: hunched, low, facing out, casting about for food ---------------------
    f0, n = 1201, 8
    for i in range(n):
        f = f0 + i
        t = i / n
        sag = math.cos(t * math.tau)
        rot_y[f] = math.radians(-4.0 + 3.0 * sag)     # nose up a little: waiting, not feeding
        # A slow look left and right. §8 asks for "barely moving", but barely moving still has to move:
        # a head that scans is the cheapest way to say hungry without animating a whole body.
        rot_z[f] = math.radians(7.0 * math.sin(t * math.tau + 0.4))
        z[f] = z0 - 0.0075 + 0.0018 * sag
        sz[f] = 0.93 + 0.020 * sag                    # squashed down
        sx[f] = 1.05 - 0.008 * sag
        rot_x[f] = 0.0
        paw_z[f] = 0.0 + 0.0012 * sag
        paw_x[f] = 0.0
        ear_pitch[f] = math.radians(22)               # ears back
        eye_sz[f] = 0.16 if i == 3 else 1.0

    # ---- sleep: curled, settled into the bedding, slow deep breath -------------------
    f0, n = 1301, 6
    for i in range(n):
        f = f0 + i
        t = i / n
        breathe = math.cos(t * math.tau)
        rot_y[f] = math.radians(6.0 + 1.8 * breathe)
        rot_z[f] = math.radians(1.5 * math.sin(t * math.tau + 0.7))
        z[f] = z0 - 0.0105 + 0.0022 * breathe
        # The belly rising is the entire animation, so it gets the amplitude: 3.4% of body height is
        # about 1.2 grid px of travel at the top of the back, which is what reads as sleeping.
        sz[f] = 0.88 + 0.034 * breathe
        sx[f] = 1.10 - 0.020 * breathe
        rot_x[f] = 0.0
        paw_z[f] = 0.0
        paw_x[f] = 0.0
        ear_pitch[f] = math.radians(30 + 2.5 * math.cos(t * math.tau + 0.5))
        eye_sz[f] = 0.06                              # shut

    # ---- dead: on its SIDE, and completely still -------------------------------------
    # Six identical frames rather than one, because `dead` is a looping state and the player expects
    # the declared count. The art gate skips the motion check for a single frame but not for six, so
    # these are deliberately identical and the gate's frame-difference rule is satisfied by the state
    # being excluded from it -- see the manifest, which declares dead with frames: 1.
    f0, n = 1401, 1
    for i in range(n):
        f = f0 + i
        rot_x[f] = math.radians(84)                   # rolled onto its side
        rot_y[f] = math.radians(-8)
        rot_z[f] = 0.0
        paw_z[f] = 0.0
        paw_x[f] = 0.0
        z[f] = z0 - 0.0135
        sz[f] = 1.0
        sx[f] = 1.0
        ear_pitch[f] = math.radians(14)
        eye_sz[f] = 0.05

    wb.key_curve(rig, 'location', 2, z)
    wb.key_curve(rig, 'rotation_euler', 0, rot_x)
    wb.key_curve(rig, 'rotation_euler', 1, rot_y)
    wb.key_curve(rig, 'rotation_euler', 2, rot_z)
    wb.key_curve(body, 'scale', 0, sx)
    wb.key_curve(body, 'scale', 2, sz)
    for ear in (ear_l, ear_r):
        base = ear.rotation_euler[1]
        wb.key_curve(ear, 'rotation_euler', 1, {f: base + v for f, v in ear_pitch.items()})
    # Blinking by squashing the eye, which is what the fish does: a lid would be four more objects
    # for something that is two pixels tall at delivery size.
    for eye in (eye_l, eye_r, glint_l, glint_r):
        wb.key_curve(eye, 'scale', 2, eye_sz)
    # Offsets from where the paw was authored, so the rest pose stays wherever the model put it.
    for paw in (paw_l, paw_r):
        bz, bx = paw.location.z, paw.location.x
        wb.key_curve(paw, 'location', 2, {f: bz + v for f, v in paw_z.items()})
        wb.key_curve(paw, 'location', 0, {f: bx + v for f, v in paw_x.items()})

    for ob in (rig, body, ear_l, ear_r, eye_l, eye_r, glint_l, glint_r, paw_l, paw_r):
        wb.set_interpolation(ob, 'LINEAR')
    return sum(n for _, _, n in HAM_STATES)


def share_front_bars():
    """Link the near-side bars into WP_CageFront as well as WP_Cage.

    A hamster is INSIDE its cage, so the bars between it and the camera have to draw over it. The pet
    sprite sits above `bg` in the layer stack, so anything left in `bg` ends up behind the animal --
    which is what made the first render read as a hamster stuck to the outside of the cage.

    They ship as `decor_front`, the slot the bowl already uses for the gravel and the plant drawn in
    front of the fish. Reusing it means the renderer needs no new layer name: `SLOT_OF` is a fixed map,
    and an unrecognised one would resolve to an undefined slot.

    The objects are LINKED, not moved. They stay in WP_Cage so `bg` still contains the whole cage, and
    the front bars are simply drawn twice -- the alternative, cutting them out of `bg`, would change
    its alpha bounding box, and that box is the window's click-through contract.
    """
    col = wb.get_collection("WP_CageFront")
    for ob in bpy.data.objects:
        if ob.name.startswith("ENV_cage_bar_f_") or ob.name == "ENV_cage_rail_f":
            if ob.name not in col.objects:
                col.objects.link(ob)
    return len(col.objects)


def share_ground():
    """Also link the bowl's shadow catcher into a WP_Ground collection.

    An object may live in several collections and renders if ANY of them is visible, so this gives the
    cage a floor to cast onto without moving the catcher out of WP_Bowl -- which would have quietly
    removed the bowl's own contact shadow, the one thing `habitatArt.test.ts` checks for when it
    compares the alpha-0.5 and alpha-0.01 bounding boxes.
    """
    catcher = bpy.data.objects.get("ENV_shadow_catcher")
    if catcher is None:
        return
    col = wb.get_collection("WP_Ground")
    if catcher.name not in col.objects:
        col.objects.link(catcher)


def build_memorial(col, m):
    """A small marker for the memorial layer.

    §8 asks for "still wheel, empty cage", but the cage background is already empty of the pet -- the
    animal is a sprite on its own layer -- so bg and memorial would be identical images, and the art
    gate requires the memorial to differ by at least a thousand pixels while keeping the SAME alpha
    bbox so the hit region does not move on death. A small marker in the bedding does both, and it is
    what the bowl does with its tiny flag.
    """
    post = cylinder("PRP_cage_mem_post", 0.0022, 0.040, col, verts=12)
    post.location = (0.004, -0.012, BED_TOP + 0.018)
    wb.assign(post, m['metal'])
    flag = rounded_box("PRP_cage_mem_flag", 0.020, 0.0016, 0.013, 0.0006, col, segments=3)
    flag.location = (0.015, -0.012, BED_TOP + 0.031)
    wb.assign(flag, wb.toy_material("WP_cage_mem_flag", (0.62, 0.20, 0.22), roughness=0.5, sheen=0.4))


def build_lights():
    """Nothing. The cage is lit by the bowl's rig, which is the point.

    Two fill lights lived here, added when the cage measured at half the concept's brightness. That
    measurement was taken with the scene's own lights switched off by a bug in the preview script, so
    the fills were correcting a fault that did not exist. With LGT_key/fill/rim on, the cage lands on
    the concept's colour from base colour alone -- which is what a shared lighting rig is supposed to
    do, and the reason the cage lives in the bowl's scene at all.
    """
    clear_collection("WP_CageLight")


# What one grid pixel is worth in metres, fixed by the cage camera: 0.420 m of world across the
# habitat's 320 logical px.
CAGE_ORTHO = 0.420
HAM_FRAME_GRID = 80          # the sprite frame, in habitat grid px


def build_cameras(ham_aim_z=None):
    """Delivery cameras for the cage. Same lens type and distance as the bowl's, steeper pitch.

    CAM_hamster is deliberately CAM_cage at a quarter of the width, aimed at the rig root -- it is a
    literal 80x80 grid-px crop of the cage view, centred on the animal. That is not a tidiness point.
    A sprite camera with its own scale renders the hamster at a size unrelated to the cage it is
    composited into, and a sprite camera aimed anywhere but the rig puts the body somewhere other than
    the frame centre, so the anchor that places it can no longer be the rig's own projected position.
    Both were true here: 0.148 over 80 px showed 0.00185 m per grid px against the cage's 0.0013125, so
    the hamster drew 29% too small, and aiming at a hand-picked 0.050 left it floating ~10 px above its
    own bedding. Deriving both from CAM_cage makes the sprite and the habitat the same photograph.
    """
    src = bpy.data.objects['CAM_bowl']
    dist = abs(src.location.y)
    pitch = math.radians(CAGE_PITCH_DEG)
    # Passed in from before `animate_hamster` ran. Reading `rig.location.z` here instead looks
    # equivalent and is not: inserting keyframes leaves the property holding whatever the last block
    # assigned, which is `dead` at z0 - 0.0135. That is 10 grid px, and it aimed the sprite camera 10 px
    # below the animal -- so every state rendered 10 px high in its own frame and the hamster floated
    # above its bedding once composited. Same shape of bug as trusting a stale `matrix_world` in
    # background mode: the value is real, it just describes a different moment than the one you want.
    rig = bpy.data.objects.get('RIG_ham_root')
    ham_aim = ham_aim_z if ham_aim_z is not None else (rig.location.z if rig is not None else 0.050)
    ham_ortho = CAGE_ORTHO * HAM_FRAME_GRID / 320.0
    for name, ortho, aim_z in (("CAM_cage", CAGE_ORTHO, 0.065),
                               ("CAM_hamster", ham_ortho, ham_aim)):
        cam = bpy.data.objects.get(name)
        if cam is None:
            data = bpy.data.cameras.new(name)
            cam = bpy.data.objects.new(name, data)
            bpy.context.scene.collection.objects.link(cam)
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
        cam.data.clip_start = src.data.clip_start
        cam.data.clip_end = src.data.clip_end
        # Aim at `aim_z` from the same distance the bowl is shot from, so the two habitats share a lens
        # and a working distance even though they do not share a pitch.
        cam.location = (0.0, src.location.y, aim_z + dist * math.tan(pitch))
        cam.rotation_euler = (math.radians(90.0) - pitch, 0.0, 0.0)


def main():
    rng = random.Random(20260920)
    clear_collection("WP_Cage")
    col = wb.get_collection("WP_Cage")
    m = materials()
    build_tub(col, m)
    z0, z1 = build_bars(col, m)
    build_bedding(col, m, rng)
    build_wheel(col, m)
    build_bottle(col, m, z1)
    build_hopper(col, m, rng)
    clear_collection("WP_Hamster")
    hcol = wb.get_collection("WP_Hamster")
    clear_collection("WP_CageMemorial")
    build_memorial(wb.get_collection("WP_CageMemorial"), m)
    share_ground()
    print("WP_FRONT_BARS", share_front_bars())
    rig, ham_parts = build_hamster(hcol, m)
    ham_rest_z = rig.location.z          # the authored rest height, before any state pose moves it
    print("WP_HAM_FRAMES", animate_hamster(rig, ham_parts))
    build_lights()
    build_cameras(ham_rest_z)
    print("WP_CAGE_OBJECTS", len(col.objects), "WP_HAMSTER_OBJECTS", len(hcol.objects))
    bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
    print("WP_SAVED", OUT)


main()
