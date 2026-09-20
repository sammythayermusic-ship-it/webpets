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


def materials():
    m = {}
    m['tub'] = wb.toy_material("WP_cage_tub", BLUE, roughness=0.38, sheen=0.30)
    m['tub_rim'] = wb.toy_material("WP_cage_rim", BLUE_DARK, roughness=0.33, sheen=0.35)
    m['tub_light'] = wb.toy_material("WP_cage_blue_light", BLUE_LIGHT, roughness=0.36, sheen=0.30)
    # Actual metal. These were grey plastic -- `toy_material` pinned Metallic to 0 for every
    # surface in the project -- and chrome wire is most of what reads as "cage". Roughness is kept
    # well off zero so the bars pick up a soft brushed highlight instead of mirroring the world,
    # which at 2.7 px wide would just read as noise.
    # Satin steel, not chrome. Metallic 0.95 rendered these BRONZE: a metal has no diffuse colour
    # of its own, so a thin rough bar in a warm key and a warm-low world reflects almost nothing but
    # that warmth. Holding some diffuse back (0.55) keeps a neutral base under the reflection, and a
    # brighter, cooler base colour stops it drifting gold.
    m['wire'] = wb.toy_material("WP_cage_wire", (0.880, 0.905, 0.945), roughness=0.28, sheen=0.0,
                                metallic=0.55, specular=0.5)
    m['metal'] = wb.toy_material("WP_cage_metal", (0.74, 0.77, 0.82), roughness=0.26,
                                 metallic=0.65, specular=0.5)
    # Transmission only, alpha 1.0. Carrying BOTH meant Alpha mixed in a Transparent BSDF *before*
    # the Principled's own transmission, so a third of the bottle was pure pass-through -- and with
    # film_transparent on, that ate the habitat's own alpha and let the desktop show through the
    # water bottle. Measured at alpha 152 in places against 255 for solid plastic.
    m['bottle'] = wb.toy_material("WP_cage_bottle", (0.92, 0.96, 0.98), roughness=0.09,
                                  transmission=1.0, specular=0.5)
    m['water'] = wb.toy_material("WP_cage_water", (0.52, 0.80, 0.92), roughness=0.03,
                                 transmission=1.0, specular=0.5)
    # Wood shavings: three tones so the bedding is not one flat colour, exactly as the gravel is a
    # palette rather than a texture.
    # Darker and more golden, with the gap between tones widened. The old palette sat between 0.81
    # and 0.93 -- three shades of pale cream that averaged into one flat sheet once the steeper
    # camera put half the cage floor on screen. The concept's bedding is golden with visible shadow
    # between the shavings, and contrast is what produces that.
    m['bed_a'] = wb.toy_material("WP_bed_a", (0.760, 0.590, 0.345), roughness=0.78, sheen=0.08)
    m['bed_b'] = wb.toy_material("WP_bed_b", (0.610, 0.450, 0.250), roughness=0.82, sheen=0.08)
    m['bed_c'] = wb.toy_material("WP_bed_c", (0.880, 0.755, 0.530), roughness=0.74, sheen=0.10)
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
    floor = wb.rounded_box("ENV_cage_floor", CAGE_W - 2 * WALL, CAGE_D - 2 * WALL, 0.008, 0.003, col)
    floor.location = (0.0, 0.0, GROUND + 0.010)
    wb.assign(floor, m['tub'])

    for i, (nx, ny) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        along_x = nx == 0
        w = CAGE_W if along_x else WALL
        d = WALL if along_x else CAGE_D
        wall = wb.rounded_box(f"ENV_cage_wall_{i}", w, d, TUB_H, 0.004, col)
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
        rim = wb.rounded_box(f"ENV_cage_rim_{i}", w, d, 0.013, 0.005, col)
        rim.location = (
            nx * (CAGE_W / 2 - 0.002),
            ny * (CAGE_D / 2 - 0.002),
            GROUND + TUB_H + 0.004,
        )
        wb.assign(rim, m['tub_rim'])

    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        f = wb.rounded_box(f"ENV_cage_foot_{i}", 0.026, 0.020, 0.014, 0.005, col)
        f.location = (sx * (CAGE_W / 2 - 0.028), sy * (CAGE_D / 2 - 0.022), GROUND + 0.005)
        wb.assign(f, m['tub_rim'])
    return floor


def build_bars(col, m):
    """The wire top: vertical bars on all four sides, horizontal rails, and a carry handle."""
    z0 = GROUND + TUB_H + 0.008
    z1 = z0 + BAR_H
    # 0.0026 put the bars at 4 logical px, thick enough to dominate every frame. The concept's read
    # as delicate wire at roughly half that; 0.0018 is 2.7 px, which still survives the downscale.
    r = 0.0018

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
    # THE NEAR FACE HAS NO VERTICAL BARS. A hamster is inside its cage, so the near bars have to
    # draw over it -- and fifteen of them crossing the animal is simply unpleasant to look at. The
    # back grid, both side faces, the roof and the handle say "cage" on their own; this is what the
    # concept art does in the hamster's zone too.
    #
    # The corner posts are not lost with them: `bar_f_0` and `bar_f_14` were byte-identical
    # duplicates of `bar_l_0` and `bar_r_0`, which the side loop below still builds. Dropping the
    # front row therefore also removes four coincident pairs that were z-fighting at the corners.
    n_back = 15
    for i in range(n_back):
        x = -hw + (2 * hw) * i / (n_back - 1)
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
        # i=0 and i=n-1 land exactly on ENV_cage_rail_l / _r, built two lines above. Two coincident
        # wires do not look like one wire: they z-fight and render double-darkened.
        if i in (0, n_roof - 1):
            continue
        x = -hw + (2 * hw) * i / (n_roof - 1)
        bar(f"ENV_cage_roof_{i}", (x, -hd, z1), (x, hd, z1))

    handle = wb.torus("ENV_cage_handle", 0.030, 0.0026, col, major_seg=28)
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
    base = wb.rounded_box("PRP_bed_base", CAGE_W - 2 * WALL - 0.002, CAGE_D - 2 * WALL - 0.002,
                       0.012, 0.004, col)
    base.location = (0.0, 0.0, top - 0.010)
    wb.assign(base, m['bed_b'])

    n = 420
    for i in range(n):
        w = rng.uniform(0.007, 0.016)
        d = rng.uniform(0.004, 0.008)
        h = rng.uniform(0.0015, 0.0030)
        chip = wb.rounded_box(f"PRP_bed_{i}", w, d, h, min(w, d, h) * 0.35, col, segments=2)
        x = rng.uniform(-CAGE_W / 2 + WALL + 0.004, CAGE_W / 2 - WALL - 0.004)
        y = rng.uniform(-CAGE_D / 2 + WALL + 0.004, CAGE_D / 2 - WALL - 0.004)
        # Piled slightly deeper toward the back, so the bed has a front-to-back gradient rather than
        # reading as a flat sheet.
        # Sits lower than it did. At 34 degrees the camera sees the whole floor, so the same pile
        # that read as a thin scatter at 25 read as a thick slab that had swallowed the wheel's
        # bottom and half the hopper.
        z = top - 0.006 + 0.004 * (y / CAGE_D + 0.5) + rng.uniform(-0.0015, 0.0020)
        chip.location = (x, y, z)
        chip.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.25, 0.25), rng.uniform(0, math.pi))
        wb.assign(chip, mats[i % 3])
        # A strict three-tone round-robin over 420 chips bands visibly. Scaling each chip a little
        # makes its shading land differently even where the material repeats, which is the cheapest
        # stand-in for the per-pebble colour variation the bowl's gravel gets from its Voronoi ramp.
        k = rng.uniform(0.84, 1.14)
        chip.scale = (k, k, rng.uniform(0.85, 1.20))


# How far the delivery camera looks DOWN, in degrees.
#
# The bowl uses 9, which is right for a sphere: it reads from almost any angle and a low camera keeps
# the glass tall in frame. A cage is a box with its contents on the floor, and at 9 degrees you see the
# front wall and nothing inside it -- the bedding, the wheel's base and the hamster's feet all hide
# behind the tub. The concept render looks down about 25, which is what lets you see into it, so the
# cage gets its own angle rather than inheriting one that was chosen for a different shape.
# 34, not 25. Pitch is the only free depth cue a front-on camera has: it takes the visible
# bedding from 64 logical px to 85, so the floor reads as a surface the hamster stands ON rather
# than an edge it stands in front of. The cost is height -- the cage projects 235 px into a 240 px
# grid at 34 degrees -- which is why CAGE_ORTHO widens to 0.44 and brings it back to about 224,
# leaving room for the contact shadow underneath.
CAGE_PITCH_DEG = 34.0

BED_TOP = GROUND + TUB_H + 0.004


def build_wheel(col, m):
    """The exercise wheel, left of centre: an open drum of rungs on a wire stand.

    Rebuilt from a closed disc. The old one was a solid drum with a lighter disc face and eight
    spokes laid across it, which read as a wagon wheel or a hubcap -- a flat blue circle sitting in
    the cage. The concept's wheel is a *cage of rungs* you can see through to the far side, and at
    67 logical px across this is the second-largest object in the habitat, so what it reads as
    matters nearly as much as the hamster.

    An open drum also earns its shading for free: the rungs on the near side catch the key light,
    the ones on the far side fall into shadow, and the gap between them lets the bedding show
    through. A disc can only ever be one flat tone.
    """
    cx, cy = -0.088, 0.022
    R = 0.050
    cz = BED_TOP + R * 0.92
    HALF_D = 0.013                       # half the drum's depth along Y

    # The running surface: rungs around the circumference, like a treadmill rolled into a circle.
    # 22 at 0.0022 radius is 3.3 logical px per rung with a 9 px gap -- coarse enough to survive the
    # downscale as distinct bars rather than blurring into a grey band.
    n_rung = 22
    for k in range(n_rung):
        a = 2 * math.pi * k / n_rung
        rung = wb.cylinder(f"PRP_wheel_rung_{k}", 0.0022, HALF_D * 2, col, verts=10)
        rung.rotation_euler = (math.radians(90), 0, 0)
        rung.location = (cx + math.cos(a) * R, cy, cz + math.sin(a) * R)
        wb.assign(rung, m['tub_light'])

    # Two hoops holding the rungs, near and far. The near one is the wheel's silhouette.
    for tag, oy in (("f", -HALF_D), ("b", HALF_D)):
        hoop = wb.torus(f"PRP_wheel_hoop_{tag}", R, 0.0030, col, major_seg=48)
        hoop.rotation_euler = (math.radians(90), 0, 0)
        hoop.location = (cx, cy + oy, cz)
        wb.assign(hoop, m['tub'])

    # A back plate, so you see a coloured interior through the rungs rather than the cage wall.
    back = wb.cylinder("PRP_wheel_back", R - 0.002, 0.003, col, verts=48)
    back.rotation_euler = (math.radians(90), 0, 0)
    back.location = (cx, cy + HALF_D + 0.002, cz)
    wb.assign(back, m['tub'])

    # Four spokes on the BACK plate only -- visible through the open front, and they give the wheel
    # a centre to rotate about visually. On the front they would just re-close the disc.
    for k in range(4):
        a = k * math.pi / 2
        sp = wb.rounded_box(f"PRP_wheel_spoke_{k}", R * 0.84, 0.0030, 0.0030, 0.0012, col, segments=3)
        sp.location = (cx + math.cos(a) * R * 0.42, cy + HALF_D, cz + math.sin(a) * R * 0.42)
        sp.rotation_euler = (0, -a, 0)
        wb.assign(sp, m['tub_rim'])

    hub = wb.cylinder("PRP_wheel_hub", 0.0075, 0.008, col, verts=24)
    hub.rotation_euler = (math.radians(90), 0, 0)
    hub.location = (cx, cy + HALF_D - 0.003, cz)
    wb.assign(hub, m['tub_rim'])

    # Stand: two legs and an axle, so the wheel is held rather than floating.
    for sx in (-1, 1):
        leg = wb.rounded_box(f"PRP_wheel_leg_{'l' if sx < 0 else 'r'}", 0.004, 0.004,
                          cz - BED_TOP + 0.010, 0.0015, col, segments=3)
        leg.location = (cx + sx * 0.030, cy + HALF_D + 0.004, BED_TOP + (cz - BED_TOP) / 2 - 0.005)
        leg.rotation_euler = (0, math.radians(-14 * sx), 0)
        wb.assign(leg, m['metal'])
    axle = wb.cylinder("PRP_wheel_axle", 0.0030, 0.034, col, verts=16)
    axle.rotation_euler = (math.radians(90), 0, 0)
    axle.location = (cx, cy + 0.004, cz)
    wb.assign(axle, m['metal'])


def build_bottle(col, m, bar_top):
    """The water bottle, hanging on the bars right of centre: body, water, cap, spout."""
    cx, cy = 0.042, CAGE_D / 2 - 0.012
    top_z = BED_TOP + 0.108
    H = 0.054
    body = wb.cylinder("PRP_bottle_body", 0.0125, H, col, verts=28)
    body.location = (cx, cy, top_z - H / 2)
    wb.assign(body, m['bottle'])

    water = wb.cylinder("PRP_bottle_water", 0.0112, H * 0.66, col, verts=28)
    water.location = (cx, cy, top_z - H + H * 0.66 / 2 + 0.002)
    wb.assign(water, m['water'])

    cap = wb.cylinder("PRP_bottle_cap", 0.0135, 0.010, col, verts=28)
    cap.location = (cx, cy, top_z + 0.004)
    wb.assign(cap, m['tub'])

    spout = wb.cylinder("PRP_bottle_spout", 0.0030, 0.038, col, verts=14)
    spout.rotation_euler = (math.radians(24), 0, 0)
    spout.location = (cx, cy - 0.009, top_z - H - 0.014)
    wb.assign(spout, m['metal'])

    for sx in (-1, 1):
        clip = wb.rounded_box(f"PRP_bottle_clip_{'l' if sx < 0 else 'r'}", 0.004, 0.016, 0.004, 0.0015,
                           col, segments=3)
        clip.location = (cx + sx * 0.013, cy + 0.006, top_z - 0.008)
        wb.assign(clip, m['wire'])


def build_hopper(col, m, rng):
    """The seed hopper on the right: a clear feeder with a blue base and lid.

    Rebuilt because the old one could not do its job. `PRP_hopper_fill` is the pantry readout --
    how much food is left -- and it was placed inside `PRP_hopper`, a SOLID opaque box. The fill and
    all fourteen seeds were sealed inside geometry light could not reach, and the little window slab
    on the front face looked through the outside of that box at more of the same box. Zoomed in, the
    hopper rendered as a featureless blue rectangle: a full hopper and an empty one looked identical.

    Now the body is transmissive and the seed mass sits inside it, so the level reads at a glance --
    which is what the concept does and what the pantry is supposed to communicate.
    """
    cx, cy = 0.102, 0.010
    W, D, H = 0.034, 0.026, 0.070

    base = wb.rounded_box("PRP_hopper_base", W + 0.004, D + 0.004, 0.010, 0.003, col)
    base.location = (cx, cy, BED_TOP + 0.005)
    wb.assign(base, m['tub'])

    body = wb.rounded_box("PRP_hopper", W, D, H - 0.006, 0.004, col)
    body.location = (cx, cy, BED_TOP + 0.008 + (H - 0.006) / 2)
    wb.assign(body, m['bottle'])

    lid = wb.rounded_box("PRP_hopper_lid", W + 0.003, D + 0.003, 0.007, 0.0025, col)
    lid.location = (cx, cy, BED_TOP + H + 0.004)
    wb.assign(lid, m['tub_rim'])

    # The seed mass, as loose grain. The first version kept a solid slab AND scattered grains
    # inside it, so the slab hid every grain and the hopper read as a smooth yellow block behind
    # glass. The grains ARE the mass now: 90 of them at 2.9 x 2.0 logical px, packed into the lower
    # 45% of the body, so the level reads and the surface looks like food rather than paint.
    grains = []
    for i in range(90):
        g = wb.rounded_box(f"PRP_hopper_grain_{i}", 0.0040, 0.0028, 0.0026, 0.0010, col, segments=2)
        g.location = (cx + rng.uniform(-0.011, 0.011),
                      cy + rng.uniform(-0.007, 0.007),
                      BED_TOP + 0.011 + rng.uniform(0.0, H * 0.42))
        g.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, math.pi))
        wb.assign(g, m['seed'])
        grains.append(g)
    # Kept under the name the pantry gauge will look for, as an empty at the top of the grain pile.
    fill = bpy.data.objects.get("PRP_hopper_fill")
    if fill is None:
        fill = bpy.data.objects.new("PRP_hopper_fill", None)
        col.objects.link(fill)
    fill.empty_display_size = 0.01
    fill.location = (cx, cy, BED_TOP + 0.011 + H * 0.42)

    # A few loose seeds spilled at the foot of it, which is what sells a feeder as used.
    for i in range(14):
        sd = wb.rounded_box(f"PRP_seed_{i}", 0.0038, 0.0026, 0.0022, 0.0009, col, segments=2)
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
# Darkened again, and this time against a measurement rather than an impression. At 0.560 the red
# channel rendered at sRGB 252 -- CLIPPED -- and the belly at 0.820 came out only 15 luminance levels
# from the back. A sprite whose darkest pixel is 153 and whose p10-p90 spread is 42 has no shadow
# anywhere on it, which is exactly why it read as a bar of soap: the concept gets 91 levels of
# spread, and the goldfish 57. Lowering both ends buys that range back, and stops the highlight
# clipping that was quietly turning the fur pink.
FUR_TOP = (0.395, 0.200, 0.060)
FUR_BELLY = (0.700, 0.580, 0.408)


# How far the hamster is turned toward the camera, in degrees.
#
# It used to be zero: a pure side-on profile, which showed exactly one eye and read as a bar of
# soap. Turning it toward the lens shows both eyes and the muzzle, which is where all the character
# is. It cannot go much past this -- the sprite is mirrored about its vertical axis when the animal
# turns around, so the pose has to read from either side, and a near-front-on hamster has no legible
# direction of travel once flipped. It also costs frame width: the projected silhouette grows as
# `length*cos(yaw) + width*sin(yaw)`, and it has to stay clear of an 80 logical px frame.
#
# -50, not -30, and the reason is geometric rather than aesthetic. An eye is only drawn if its centre
# lies on the camera-facing side of the head's centre plane, and at -30 the far eye sits 0.006 m
# BEHIND it -- the head itself swallows it, whatever the muzzle does. Turning further brings it
# round; so does moving both eyes forward onto the muzzle line, and the two together clear it at -50
# with room to spare. That costs silhouette width, which is what HAM_SCALE below pays for.
HAM_YAW_DEG = -50.0
HAM_SCALE = 1.18

# One full walk cycle carries the hamster this far across the habitat, in logical px. It is declared
# to the renderer as `stridePx` in the manifest, and the foot amplitude below is solved from it.
WALK_STRIDE_PX = 20.0
# Half the ground a planted foot covers, in the rig's own (pre-scale) metres. A foot down for half
# the cycle must travel back S/2 while the body goes forward S/2, so the half-amplitude is S/4.
WALK_FOOT_AMP = (WALK_STRIDE_PX / 4.0) * (0.440 / 320.0) / HAM_SCALE
# How high a foot lifts on the swing. 3 mm is about 2 logical px -- enough to read as clearing the
# ground, little enough not to look like a prance.
WALK_FOOT_LIFT = 0.0030
WALK_PAW_LIFT = 0.0024
# Amplitude of the body bob, two per cycle. The strongest locomotion cue at this size.
WALK_BOB = 0.0022
# World +X in the rig's own frame, which is the axis a stride must be keyed along. See the walk block.
WALK_U_X = math.cos(math.radians(50.0))
WALK_U_Y = math.sin(math.radians(50.0))
# 4.7 logical px, in metres at the cage's 0.44/320 m per px.
HAM_CENTRE_SHIFT = 4.7 * (0.440 / 320.0)


def build_hamster(col, m):
    """The hamster: a lofted body with a real head group -- muzzle, cheeks, ears, two eyes.

    Same construction family as the goldfish -- a lofted body from cross-sections, subdivided, with
    a top-to-belly colour ramp -- so the two animals are siblings rather than one render and one
    something-else. Faces +X, because the sprite player mirrors about that axis.

    The head is a separate group rather than the front end of one tapered blob. That is the whole
    difference between this and the version it replaces: with head and body as a single loft there
    is nowhere to put a muzzle, nowhere for cheeks, and no neck to separate them, so the profile
    showed one eye on a smooth lump and nothing else.
    """
    # Every part is built at the LOCAL origin and placed by the rig. The first version offset each
    # part by z0 and then also set the rig to z0, cancelling it with
    # `matrix_parent_inverse = rig.matrix_world.inverted()` -- which is the documented keep-transform
    # idiom and silently wrong here, because `matrix_world` is stale until the depsgraph updates and
    # background Blender never ran one. The offset applied twice and the hamster rendered half a body
    # above where the camera was pointing.
    z0 = BED_TOP + 0.031

    # (x, half_y, half_z, centre_z). Mostly rump, tapering to a neck at +0.020 where the head group
    # takes over. The old table ran all the way to a point at +0.036 -- that point WAS the head.
    sections = [
        (-0.034, 0.000, 0.000, 0.004),
        (-0.029, 0.014, 0.015, 0.002),
        (-0.019, 0.024, 0.025, 0.000),
        (-0.006, 0.027, 0.028, -0.001),
        (0.006, 0.026, 0.026, -0.001),
        (0.014, 0.022, 0.022, 0.001),
        (0.020, 0.017, 0.018, 0.004),          # neck: the head sphere overlaps from here forward
    ]
    # segments/rings dropped from 40/24 and subsurf from 2 to 1. The body was ~15k quads for a
    # 60 logical px sprite while the wheel drum beside it was a bare 40-gon; this is still far more
    # than the silhouette can show.
    body = wb.tapered_body("HERO_ham_body", sections, col, segments=28, rings=18)
    wb.add_subsurf(body, 1)
    body.location = (0.0, 0.0, 0.0)

    rig = bpy.data.objects.get("RIG_ham_root")
    if rig is None:
        rig = bpy.data.objects.new("RIG_ham_root", None)
        col.objects.link(rig)
    rig.empty_display_size = 0.02
    rig.location = (0.0, 0.0, z0)
    rig.rotation_euler = (0.0, 0.0, 0.0)
    # The turn toward the camera costs frame width -- the silhouette projects about 76 logical px at
    # -50 into an 80 px frame, which leaves nothing for the edge-clearance gate. Scaling the rig is
    # the one-line way to buy it back: rig.location.z is keyed in parent space so the animation is
    # untouched, and the per-state body.scale keys simply multiply on top. It also lands the hamster
    # nearer the size the concept actually draws it at, which is 53 px against a cage of this width.
    rig.scale = (HAM_SCALE, HAM_SCALE, HAM_SCALE)

    # One shared texture space for every furred part, anchored on the rig. See belly_gradient's
    # docstring: without this the ears and tail sample their own tiny local space and come out a
    # flat mid-tone that does not match the body they are attached to.
    fur = wb.toy_material("WP_ham_fur", FUR_TOP, roughness=0.46, sheen=0.28, sss=0.14)
    wb.belly_gradient(fur, FUR_TOP, FUR_BELLY, -0.026, 0.026, space_object=rig)
    wb.fur_surface(fur, scale=240.0, strength=0.50, distance=0.0018, sheen=0.55, space_object=rig)
    wb.assign(body, fur)

    # (0.92, 0.58, 0.55) is not pink here, it is WHITE. This rig drives roughly 1.5x, so a red
    # channel of 0.92 lands past 1.0 and clips -- which is why the inner ears rendered cream and why
    # the paws used to read as pale mittens rather than skin. Darkened until it lands near the
    # concept's own (244, 172, 152) instead of clipping off the top of the range.
    inner = wb.toy_material("WP_ham_inner", (0.520, 0.145, 0.085), roughness=0.40, sheen=0.22, sss=0.30)
    eye_m = wb.toy_material("WP_ham_eye", (0.010, 0.008, 0.012), roughness=0.10, specular=0.6)
    glint_m = wb.toy_material("WP_ham_glint", (1, 1, 1), roughness=0.10,
                              emission=(1, 1, 1), emission_strength=1.4)
    nose_m = wb.toy_material("WP_ham_nose", (0.330, 0.045, 0.038), roughness=0.30, sheen=0.15,
                             specular=0.45)

    parts = []

    # ---- head group -----------------------------------------------------------------------
    head = wb.sphere("HERO_ham_head", 0.0205, 0.0185, 0.0180, col, segments=26, rings=16)
    head.location = (0.0295, 0.0, 0.0065)
    wb.assign(head, fur)
    parts.append(head)

    # Muzzle and cheeks. These are what turn a sphere into a face: without them the nose sits on a
    # bare curve and there is no jaw for the eyes to sit above.
    muzzle = wb.sphere("HERO_ham_muzzle", 0.0098, 0.0086, 0.0066, col, segments=20, rings=12)
    muzzle.location = (0.0442, 0.0, -0.0008)
    wb.assign(muzzle, fur)
    parts.append(muzzle)

    for tag, sy in (("l", 1), ("r", -1)):
        cheek = wb.sphere(f"HERO_ham_cheek_{tag}", 0.0098, 0.0090, 0.0082, col, segments=18, rings=12)
        cheek.location = (0.0355, sy * 0.0112, -0.0005)
        wb.assign(cheek, fur)
        parts.append(cheek)

        # Ears are discs flat in their own LOCAL Z, then stood up and cupped outward. The old ones
        # were flat in local Y, which is the axis `animate_hamster` keys for the ear flick -- so the
        # flick was spinning a near-circular disc about its own normal and changed nothing at all.
        # With the disc flat in Z, local Y lies in its plane and the same keys now tilt it visibly.
        ear = wb.sphere(f"HERO_ham_ear_{tag}", 0.0104, 0.0096, 0.0030, col, segments=20, rings=12)
        ear.location = (0.0242, sy * 0.0125, 0.0250)
        ear.rotation_euler = (sy * math.radians(-52), 0.0, sy * math.radians(-16))
        wb.assign(ear, fur)
        parts.append(ear)

        # The pink inner ear HAS NEVER RENDERED. It was a smaller ellipsoid (ry 0.0014) offset
        # 0.0014 inside a shell of half-thickness 0.0034 -- completely enclosed by the ear, with no
        # surface reaching daylight. That is why there is no pink on the sprite anywhere.
        #
        # Parented to the ear and offset along the ear's OWN local +Z, which is the outward face, so
        # it protrudes 0.8 mm however the ear is rotated and rides the flick for free. Offsetting in
        # rig space instead is what made the original wrong: after the ear rotates, a rig-space
        # offset no longer points along the ear's normal.
        # Thicker than the ear it sits in, rather than offset to one face. Offsetting means the pink
        # shows on one side only -- and at this yaw the two ears face opposite ways, so one of them
        # always presented its shadowed back. Poking through both faces costs nothing and reads from
        # either side; the fur rim around it is what still makes it an ear.
        ear_in = wb.sphere(f"HERO_ham_ear_in_{tag}", 0.0062, 0.0057, 0.0040, col, segments=16, rings=10)
        ear_in.parent = ear
        ear_in.location = (0.0, 0.0, 0.0)
        wb.assign(ear_in, inner)
        parts.append(ear_in)

        # Eyes. The old pair cleared the head surface by 0.16 mm -- 0.12 logical px -- which is the
        # near-tangent case that renders a ragged intersection ring. These sit on the head sphere,
        # whose surface at this angle is ~0.0165 out, and protrude a full millimetre.
        eye = wb.sphere(f"HERO_ham_eye_{tag}", 0.0056, 0.0056, 0.0060, col, segments=18, rings=12)
        eye.location = (0.0420, sy * 0.0125, 0.0150)
        wb.assign(eye, eye_m)
        parts.append(eye)

        glint = wb.sphere(f"HERO_ham_glint_{tag}", 0.0017, 0.0017, 0.0017, col, segments=10, rings=7)
        glint.location = (0.0452, sy * 0.0142, 0.0182)
        wb.assign(glint, glint_m)
        parts.append(glint)

        # Paws and feet in FUR, not the pink inner-ear material. At 9 x 6 and 11 x 8 logical px they
        # are among the largest colour blocks on the sprite, and in pink they read as mittens.
        paw = wb.sphere(f"HERO_ham_paw_{tag}", 0.0066, 0.0046, 0.0038, col, segments=16, rings=10)
        paw.location = (0.0225, sy * 0.0120, -0.0208)
        wb.assign(paw, fur)
        parts.append(paw)

        # Moved out and down. At the authored (+/-0.0182, -0.0218) these were ENTIRELY INSIDE the
        # body: the loft is 0.02515 half-wide at x=-0.014 and reaches to z=-0.02654, so a foot
        # reaching y=0.0236 with its sole at -0.0258 was narrower than the flank and higher than the
        # belly. They have never rendered, in any state -- which is also why animating them would
        # have changed nothing. Now the sole clears the belly by 3 mm and the foot stands 1.75 mm
        # proud of the flank.
        foot = wb.sphere(f"HERO_ham_foot_{tag}", 0.0080, 0.0054, 0.0040, col, segments=16, rings=10)
        foot.location = (-0.0140, sy * 0.0215, -0.0255)
        wb.assign(foot, fur)
        parts.append(foot)

    nose = wb.sphere("HERO_ham_nose", 0.0036, 0.0034, 0.0027, col, segments=16, rings=10)
    nose.location = (0.0528, 0.0, 0.0012)
    wb.assign(nose, nose_m)
    parts.append(nose)

    tail = wb.sphere("HERO_ham_tail", 0.0050, 0.0034, 0.0034, col, segments=14, rings=9)
    tail.location = (-0.0340, 0.0, 0.004)
    wb.assign(tail, fur)
    parts.append(tail)

    # A sunflower seed held between the paws. Hidden by default and shown only in the states that
    # want it, because a hamster carrying a seed while asleep or dead reads as a mistake.
    seed = wb.rounded_box("HERO_ham_seed", 0.0072, 0.0044, 0.0038, 0.0016, col, segments=4)
    seed.location = (0.0286, 0.0, -0.0196)
    seed.rotation_euler = (0, math.radians(18), 0)
    wb.assign(seed, m['seed'])
    parts.append(seed)

    # Identity parent inverse on purpose: the children are authored in the rig's own space, so the
    # rig's transform is meant to apply to them in full.
    for ob in [body] + parts:
        ob.parent = rig
    named = {'body': body, 'head': head, 'seed': seed}
    for ob in parts:
        if ob.name.startswith('HERO_ham_ear_in_'):
            continue
        # `foot` joins the list for the walk: the hind feet have always existed in the mesh but were
        # never in this dict, so nothing could key them. A quadruped walk needs all four.
        for key, suffix in (('ear', 'ear_'), ('eye', 'eye_'), ('glint', 'glint_'),
                            ('paw', 'paw_'), ('foot', 'foot_')):
            if ob.name.startswith('HERO_ham_' + suffix):
                named[f"{key}_{ob.name[-1]}"] = ob
    return rig, named


# Frame blocks, continuing wp_render2's 100-apart spacing past the fish's 1..701.
HAM_STATES = [("idle", 1001, 12), ("eat", 1101, 8), ("hungry", 1201, 8),
              ("sleep", 1301, 6), ("dead", 1401, 1), ("walk", 1501, 8)]


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
    foot_l, foot_r = parts['foot_l'], parts['foot_r']
    limbs = {'paw_l': paw_l, 'paw_r': paw_r, 'foot_l': foot_l, 'foot_r': foot_r}
    for ob in (rig, body, ear_l, ear_r, eye_l, eye_r, glint_l, glint_r, paw_l, paw_r, foot_l, foot_r):
        wb.clear_anim(ob)
    if parts.get('seed') is not None:
        wb.clear_anim(parts['seed'])

    z0 = rig.location.z
    rot_x, rot_y, rot_z = {}, {}, {}
    z, sx, sz = {}, {}, {}
    ear_pitch = {}
    eye_sz = {}
    paw_z, paw_x = {}, {}
    # Per-limb offsets, {limb name: {frame: (dx, dy, dz)}}. Every state but `walk` moves the two sides
    # together and just mirrors paw_x/paw_z into all four; the walk is the only thing that needs the
    # diagonal pairs to disagree, and it writes here directly.
    limb_off = {k: {} for k in ('paw_l', 'paw_r', 'foot_l', 'foot_r')}
    seed_sz = {}
    seed = parts.get('seed')
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
        seed_sz[f] = 1.0
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
        seed_sz[f] = 1.0
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
        seed_sz[f] = 0.0
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
        seed_sz[f] = 0.0
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

    # ---- walk: a diagonal-pair gait, authored so a planted foot does not slide -------
    #
    # The arithmetic is the whole point. The renderer advances this cycle on GROUND COVERED, not on a
    # clock -- `stridePx` in the manifest says one cycle carries the hamster WALK_STRIDE_PX. So for a
    # foot to be genuinely planted while it is down, it must travel backwards in the animal's own
    # space by exactly as far as the animal travels forwards in the world.
    #
    # Over a cycle the body advances S. A foot planted for a fraction beta of that cycle must move
    # back S*beta in local space. With beta = 0.5 and S = 20 px that is 10 px of local travel, and a
    # local +X displacement reaches the screen scaled by HAM_SCALE and foreshortened by cos(HAM_YAW),
    # which is what WALK_FOOT_AMP solves for. Change the stride and that constant changes with it, or
    # the feet skate.
    #
    # Diagonal pairs (front-left with hind-right) rather than a lateral sequence: at 63 logical px a
    # four-beat lateral walk reads as a shuffle, while two beats read clearly as steps.
    f0, n = 1501, 8
    for i in range(n):
        f = f0 + i
        phase = i / n

        # THE STRIDE IS KEYED ALONG THE GROUND, NOT ALONG THE SPINE. This is the thing that is easy
        # to get wrong and impossible to see in the viewport. The hamster is yawed 50 degrees toward
        # the camera, so "backwards along its own -X" is not "backwards along the direction it is
        # travelling": a foot slid along local -X tracks horizontally but also CLIMBS, because local
        # X carries a vertical component through this camera. Measured on the first version: the
        # planted foot held to 0.33 px horizontally and rose 7.87 px over the same stance.
        #
        # World +X expressed in the rig's own frame is (cos 50, sin 50, 0), so a displacement D along
        # that unit vector is exactly D of world travel and nothing else.
        #
        # The rig also pitches about its own origin while the limbs hang ~21 mm below it, which swings
        # them fore-and-aft. Rather than approximate that away, x_t is SOLVED so the foot's world X
        # lands on base + D exactly, pitch included.
        pitch = math.radians(-1.0 + 2.6 * math.cos(math.tau * 2 * phase))
        # The oscillating part of the body bob. A planted foot must not ride up and down with the
        # body, so stance cancels it; a swinging foot is in the air and should follow. Divided by the
        # rig scale because the rig's own z is in parent space while a limb's offset is local.
        bob_osc = -WALK_BOB * math.cos(math.tau * 2 * phase)

        def limb(ph, bx, by, bz, lift):
            """(dx, dy, dz) for a limb at cycle phase `ph`, as an offset from its authored position.

            The limb's pose is authored as where it should END UP once the rig has pitched, and then
            run BACKWARDS through that pitch to find what to key. Inverting the rotation is exact and
            handles both axes at once -- the earlier version solved only x and left the foot rising
            1.3 px over its stance, because pitching a limb that hangs below the pivot moves it
            vertically just as surely as horizontally.
            """
            ph = ph % 1.0
            if ph < 0.5:                       # planted: travels backwards exactly as fast as the
                d = WALK_FOOT_AMP * (1.0 - 4.0 * ph)   # body travels forwards, so it does not move
                dz = -bob_osc / HAM_SCALE      # and does not ride the body's bob either
            else:
                sw = (ph - 0.5) / 0.5          # swinging: forward again, lifted clear
                d = WALK_FOOT_AMP * (-1.0 + 2.0 * sw)
                dz = lift * math.sin(math.pi * sw)
            want_x, want_z = bx + WALK_U_X * d, bz + dz
            c, si = math.cos(pitch), math.sin(pitch)
            x_t = want_x * c - want_z * si
            z_t = want_x * si + want_z * c
            return (x_t - bx, WALK_U_Y * d, z_t - bz)

        for name, ph_off, lift in (('paw_l', 0.0, WALK_PAW_LIFT), ('foot_r', 0.0, WALK_FOOT_LIFT),
                                   ('paw_r', 0.5, WALK_PAW_LIFT), ('foot_l', 0.5, WALK_FOOT_LIFT)):
            ob = limbs[name]
            limb_off[name][f] = limb(phase + ph_off, ob.location.x, ob.location.y, ob.location.z, lift)

        # Two bobs per cycle, lowest as each pair lands and highest at mid-stance. At 63 px the legs
        # are 10 px blobs and the bob is doing at least as much of the work as they are.
        # Roll and yaw are kept SMALL on purpose. They read as life, but every degree of yaw swings
        # a planted foot sideways -- a foot 25 mm off the rig centre moves 0.8 logical px per 2.6
        # degrees -- and that shows up directly as drift in a foot that is supposed to be nailed to
        # the ground. Pitch is free: it moves the foot vertically, not along the direction of travel.
        # Roll is keyed flat. It needs about 3.5 degrees to move the top of the back a single screen
        # px, so at any amplitude that reads it is a cartoon -- but even 1.4 degrees swings a planted
        # foot 0.4 px vertically, because the feet sit 21 mm off the roll axis. It buys nothing and
        # costs the thing this cycle exists to protect. Keyed to 0 rather than omitted, so the curve
        # cannot bleed across the 100-frame gap from a neighbouring state.
        rot_x[f] = 0.0
        rot_y[f] = pitch
        rot_z[f] = math.radians(1.1 * math.sin(math.tau * phase + 0.5))
        z[f] = z0 - 0.0016 + bob_osc
        sz[f] = 1.0 + 0.016 * math.cos(math.tau * 2 * phase)
        sx[f] = 1.0 - 0.010 * math.cos(math.tau * 2 * phase)
        # Ears lag the body by a quarter cycle, which is what soft things do.
        ear_pitch[f] = math.radians(-4.0 + 7.0 * math.cos(math.tau * 2 * phase - 1.4))
        eye_sz[f] = 1.0
        seed_sz[f] = 0.0
        paw_z[f] = 0.0
        paw_x[f] = 0.0

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
        seed_sz[f] = 0.0
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
    # The turn toward the camera is a BASELINE, added to every state rather than written into each
    # one. Baking it into the five blocks separately would mean five places to get it wrong, and the
    # per-state values above are all small look-around motions that read as offsets from a rest pose.
    yaw = math.radians(HAM_YAW_DEG)
    wb.key_curve(rig, 'rotation_euler', 2, {f: yaw + v for f, v in rot_z.items()})
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
    # Fill the shared paw motion into all four limbs for every frame the walk did not already write.
    # The hind feet inherit nothing from paw_x/paw_z in the old states (they did not move before and
    # should not start), so only the front paws take the shared values.
    for f, v in paw_x.items():
        limb_off['paw_l'].setdefault(f, (v, 0.0, paw_z.get(f, 0.0)))
        limb_off['paw_r'].setdefault(f, (v, 0.0, paw_z.get(f, 0.0)))
        limb_off['foot_l'].setdefault(f, (0.0, 0.0, 0.0))
        limb_off['foot_r'].setdefault(f, (0.0, 0.0, 0.0))
    for name, ob in limbs.items():
        bx, by, bz = ob.location.x, ob.location.y, ob.location.z
        off = limb_off[name]
        wb.key_curve(ob, 'location', 0, {f: bx + d[0] for f, d in off.items()})
        wb.key_curve(ob, 'location', 1, {f: by + d[1] for f, d in off.items()})
        wb.key_curve(ob, 'location', 2, {f: bz + d[2] for f, d in off.items()})

    if seed is not None:
        for axis in (0, 1, 2):
            wb.key_curve(seed, 'scale', axis, seed_sz)
        wb.set_interpolation(seed, 'CONSTANT')

    for ob in (rig, body, ear_l, ear_r, eye_l, eye_r, glint_l, glint_r, paw_l, paw_r, foot_l, foot_r):
        wb.set_interpolation(ob, 'LINEAR')
    return sum(n for _, _, n in HAM_STATES)


def share_front_rim():
    """Link the near-side tub rim and wall into WP_CageFront, to be drawn OVER the pet.

    This used to be the fifteen near-side vertical bars, and that was the right instinct applied to
    the wrong objects. A hamster is inside its cage, so whatever stands between it and the camera
    has to draw over it -- but fifteen bars crossing the animal is exactly what made the cage
    unpleasant to look at, and those bars are gone from the model entirely now.

    What genuinely does stand in front of the hamster is the front of the tub. Its feet sit at world
    z ~= 0.0329 and the front rim lips over at 0.0335, so the rim overlaps them by a pixel or two --
    and with the rim living only in `bg`, which draws BELOW the pet, the sprite was painting its
    feet on top of the rim they are standing behind.

    The objects are LINKED, not moved. They stay in WP_Cage so `bg` still contains the whole cage
    and the rim is simply drawn twice; cutting it out of `bg` would change that layer's alpha
    bounding box, and that box is `opaqueRect`, the window's click-through contract.
    """
    col = wb.get_collection("WP_CageFront")
    # Unlink, never wb.clear_collection(): these objects are SHARED with WP_Cage, and
    # clear_collection deletes objects rather than unlinking them -- it would take the tub's front
    # rim out of the scene altogether.
    for ob in list(col.objects):
        col.objects.unlink(ob)
    want = {"ENV_cage_rim_3", "ENV_cage_wall_3"}
    for ob in bpy.data.objects:
        if ob.name in want and ob.name not in col.objects:
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
    post = wb.cylinder("PRP_cage_mem_post", 0.0022, 0.040, col, verts=12)
    post.location = (0.004, -0.012, BED_TOP + 0.018)
    wb.assign(post, m['metal'])
    flag = wb.rounded_box("PRP_cage_mem_flag", 0.020, 0.0016, 0.013, 0.0006, col, segments=3)
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
    wb.clear_collection("WP_CageLight")


# What one grid pixel is worth in metres, fixed by the cage camera: 0.420 m of world across the
# habitat's 320 logical px.
CAGE_ORTHO = 0.440
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
    for name, ortho, aim_z in (("CAM_cage", CAGE_ORTHO, 0.055),
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
        # CAM_hamster is nudged sideways. Turning the animal 50 degrees toward the camera swung its
        # head and shoulders off the rig's own axis, so the drawn silhouette sat 2.3-5.6 logical px
        # right of frame centre -- and the renderer MIRRORS the sprite about that centre when the
        # hamster walks the other way, so the whole animal would hop sideways by twice the offset
        # every time it turned. 4.7 px of camera shift centres the set; the residual spread between
        # states is what the art gate's +/-3 px tolerance exists to absorb.
        #
        # Shifting the camera rather than the model keeps the geometry honest, and costs nothing
        # downstream: the frame centre is what the app positions, so a hamster centred in its frame
        # is a hamster centred on its logical position, whatever the rig is doing inside.
        shift_x = HAM_CENTRE_SHIFT if name == "CAM_hamster" else 0.0
        cam.location = (shift_x, src.location.y, aim_z + dist * math.tan(pitch))
        cam.rotation_euler = (math.radians(90.0) - pitch, 0.0, 0.0)


def main():
    rng = random.Random(20260920)
    wb.clear_collection("WP_Cage")
    col = wb.get_collection("WP_Cage")
    m = materials()
    build_tub(col, m)
    z0, z1 = build_bars(col, m)
    build_bedding(col, m, rng)
    build_wheel(col, m)
    build_bottle(col, m, z1)
    build_hopper(col, m, rng)
    wb.clear_collection("WP_Hamster")
    hcol = wb.get_collection("WP_Hamster")
    wb.clear_collection("WP_CageMemorial")
    build_memorial(wb.get_collection("WP_CageMemorial"), m)
    share_ground()
    print("WP_FRONT_RIM", share_front_rim())
    rig, ham_parts = build_hamster(hcol, m)
    ham_rest_z = rig.location.z          # the authored rest height, before any state pose moves it
    print("WP_HAM_FRAMES", animate_hamster(rig, ham_parts))
    build_lights()
    build_cameras(ham_rest_z)
    print("WP_CAGE_OBJECTS", len(col.objects), "WP_HAMSTER_OBJECTS", len(hcol.objects))
    bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
    print("WP_SAVED", OUT)


main()
