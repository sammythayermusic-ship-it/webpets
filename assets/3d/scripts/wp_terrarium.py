"""Build the hamster's glass terrarium into wp_scene.blend.

    Blender -b wp_scene.blend -P wp_terrarium.py -- <out.blend>

Built to `assets/reference/habitats-hires/hamster-terrarium.png`: a glass tank in a warm wooden
frame, deep multi-tone bedding, a wooden house, a wheel, a food bowl, a wall hopper and a bottle.

WHY THIS EXISTS ALONGSIDE THE CAGE. The cage had 4x the bowl's object count and still read as cheap,
and the audit said why: not one of its twelve materials contained a single texture node, and 95% of
its screen area was opaque flat plastic. The bowl gets away with flat pebble materials because they
sit on a Voronoi-textured gravel bed and are seen through refracting glass. This habitat brings both
of those to the hamster -- `wb.voronoi_scatter` for the bedding and the bowl's own WP_glass for the
tank -- which is the substance of the difference, not the absence of bars.

IT SHARES THE CAGE'S CAMERA SCALE ON PURPOSE. A species has ONE sprite set in the manifest, so the
hamster rendered for the cage has to be the right size here too. CAM_terr therefore reuses CAM_cage's
ortho and pitch exactly and only re-aims; the tank is sized to fill the frame at that scale rather
than the scale being sized to the tank.

Metres, Z-up, radians. Ground plane z = GROUND, matching the bowl's stand and the shared catcher.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_build as wb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/wp_terr.blend"

GROUND = -0.049

# Sized to fill the frame at the cage's 0.440/320 m per logical px: 0.410 m is 298 of 320 px wide.
TANK_W = 0.348
TANK_D = 0.215
# NO LID, AT ANY HEIGHT. The first build put a full wooden lid on the tank and the render came back
# two thirds lid: at the 34 degree pitch this camera is locked to, a horizontal plate across the top
# of a box occludes everything under it. The concept art gets away with one because it is drawn from
# much lower down, nearly edge-on to it.
#
# The pitch is not negotiable. A species has ONE sprite set in the manifest, so this habitat and the
# cage must share a camera angle or the hamster is drawn from the wrong elevation in one of them.
# The tank is therefore the thing that adapts -- open-topped, and sized so the interior reads.
#
# The second build then over-corrected to 90 mm walls and produced a letterbox: 4:1 glass against the
# concept's 1.8:1. 118 mm is the balance -- tall enough that the front pane is a real surface at
# 68 logical px, short enough to see the floor over it.
# A LOW FRONT WALL AND A TALL BACK -- an open-front vivarium, which is a real shape and also the only
# one the geometry allows. At the 34 degree pitch this camera is locked to, four constraints fight:
# a wheel has to be about as tall as the animal (80 mm), bedding has to be deep enough that the near
# rail does not cut the visible floor in half, the rail needs headroom over the bedding for the props,
# and the whole thing has to stay inside 240 logical px. Solving those together gives a tank 249 px
# tall, and there is no arrangement of a uniform-height box that closes.
#
# Dropping only the FRONT wall unties it. The near rail then sits a few mm above the bedding instead
# of 80 mm above it, so it reads as the rim just behind the near edge rather than a bar across the
# middle, and the back keeps the height the props need.
GLASS_H = 0.130           # back and sides
GLASS_H_FRONT = 0.056     # the near wall, deliberately low
# A TALL wooden base, not a trim strip. This is the one thing the cage got structurally right: its
# opaque tub filled the bottom third, so the glass above it was all interior. With a short base the
# front pane occupies the lower half of the frame and shows nothing but a cross-section of bedding --
# dead space, while the hamster is squeezed into a strip above the front rail. Trading pane height
# for base height moves the whole interior up into the frame.
RAIL_H = 0.042            # the wooden base the glass sits in
TOP_H = 0.012             # the wooden top frame
GLASS_T = 0.0035          # pane thickness

TANK_PITCH_DEG = 34.0     # CAM_cage's, so the shared hamster sprite stays correct
TERR_ORTHO = 0.440
TERR_SHIFT_X = 15.0 * (0.440 / 320.0)   # 15 logical px, to fit the cast shadow

# DEEP. The bedding surface sits near the TOP of the glass, which is both what the concept shows and
# what fixes the composition. The near top rail projects `cos(pitch) x its height above the bedding`
# up the screen while the floor only spans `sin(pitch) x the tank depth`, so a rail standing 76 mm
# over the bedding cuts the visible floor clean in half. Filling the tank leaves it 24 mm up, where
# it reads as the rim just behind the near edge -- and the thick cross-section of shavings you then
# see through the front pane is the concept's look, not a compromise.
BED_TOP = GROUND + RAIL_H + 0.046          # the bedding surface the hamster walks on
WOOD = (0.240, 0.108, 0.045)
WOOD_DARK = (0.120, 0.050, 0.020)


def materials():
    m = {}
    # The bowl's glass, REPLICATED rather than referenced. WP_glass is a two-node Principled and
    # these are its exact values, so this is the same material -- but it is a separate datablock, and
    # that matters: WP_glass is on the fish bowl, and tinting a shared material to suit this tank
    # would silently restyle every shipped goldfish frame.
    m['glass'] = wb.toy_material("WP_terr_glass", (0.8228, 0.9216, 0.9560),
                                 roughness=0.030, sheen=0.0, transmission=1.0, specular=0.30)
    # The front pane is a touch deeper, which is the cheapest way to say "you are looking THROUGH
    # something". Without it the bedding seen through the pane renders as bright as the bedding seen
    # over the rail, and the tank reads as having a basement rather than a front.
    m['glass_front'] = wb.toy_material("WP_terr_glass_front", (0.660, 0.800, 0.870),
                                       roughness=0.035, sheen=0.0, transmission=1.0, specular=0.34)
    m['wood'] = wb.wood_grain(
        wb.toy_material("WP_terr_wood", WOOD, roughness=0.55, sheen=0.12),
        base=WOOD, dark=WOOD_DARK, scale=16.0, stretch=12.0, bump_strength=0.35)
    m['wood_dark'] = wb.wood_grain(
        wb.toy_material("WP_terr_wood_dark", WOOD_DARK, roughness=0.60, sheen=0.10),
        base=WOOD_DARK, dark=(0.070, 0.028, 0.012), scale=20.0, stretch=10.0, bump_strength=0.30)
    # The bedding. One material over every chip, coloured per-cell from a WORLD-space Voronoi, so the
    # pile varies chip to chip instead of banding into the three flat tones the cage used.
    m['bed'] = wb.voronoi_scatter(
        wb.toy_material("WP_terr_bed", (0.80, 0.64, 0.40), roughness=0.82, sheen=0.08),
        ramp_stops=[(0.14, (0.470, 0.320, 0.150)),
                    (0.48, (0.740, 0.560, 0.310)),
                    (0.82, (0.920, 0.815, 0.610))],
        scale=110.0, bump_strength=0.6, bump_distance=0.003, roughness=0.82)
    m['tub'] = wb.toy_material("WP_terr_tub", (0.020, 0.115, 0.250), roughness=0.36, sheen=0.28)
    m['tub_dark'] = wb.toy_material("WP_terr_tub_dark", (0.008, 0.060, 0.150), roughness=0.33, sheen=0.30)
    m['metal'] = wb.toy_material("WP_terr_metal", (0.74, 0.77, 0.82), roughness=0.26,
                                 metallic=0.65, specular=0.5)
    m['water'] = wb.toy_material("WP_terr_water", (0.52, 0.80, 0.92), roughness=0.03,
                                 transmission=1.0, specular=0.5)
    m['seed'] = wb.voronoi_scatter(
        wb.toy_material("WP_terr_seed", (0.62, 0.44, 0.18), roughness=0.62),
        ramp_stops=[(0.2, (0.420, 0.250, 0.080)), (0.7, (0.720, 0.520, 0.220))],
        scale=380.0, bump_strength=0.4, bump_distance=0.0012, roughness=0.62)
    return m


def build_tank(col, glass_col, front_col, m):
    """Wooden base frame, four glass panes, wooden top frame and a vented lid."""
    hw, hd = TANK_W / 2, TANK_D / 2

    base = wb.rounded_box("ENV_terr_base", TANK_W, TANK_D, RAIL_H, 0.004, col)
    base.location = (0, 0, GROUND + RAIL_H / 2)
    wb.assign(base, m['wood'])
    for i, (nx, ny) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        foot = wb.rounded_box(f"ENV_terr_foot_{i}", 0.030, 0.024, 0.010, 0.003, col)
        foot.location = (nx * (hw - 0.026), ny * (hd - 0.020), GROUND - 0.004)
        wb.assign(foot, m['wood_dark'])

    z0 = GROUND + RAIL_H
    zc = z0 + GLASS_H / 2
    # Back and sides live in `bg`. The FRONT pane is built into its own collection and is absent from
    # bg entirely -- which is what saves this habitat the bowl's five-pass build. The bowl's glass is
    # a closed shell, so its near reflections are unavoidably in the beauty pass and have to be
    # divided back out in post; a flat pane is a separate object, so hiding it leaves nothing to undo.
    back = wb.rounded_box("ENV_terr_glass_back", TANK_W - 0.004, GLASS_T, GLASS_H, 0.0008, col, segments=2)
    back.location = (0, hd - GLASS_T, zc)
    wb.assign(back, m['glass'])
    for tag, sx in (("l", -1), ("r", 1)):
        side = wb.rounded_box(f"ENV_terr_glass_{tag}", GLASS_T, TANK_D - 0.004, GLASS_H, 0.0008, col, segments=2)
        side.location = (sx * (hw - GLASS_T), 0, zc)
        wb.assign(side, m['glass'])
    front = wb.rounded_box("ENV_terr_glass_front", TANK_W - 0.004, GLASS_T, GLASS_H_FRONT, 0.0008,
                           glass_col, segments=2)
    front.location = (0, -(hd - GLASS_T), z0 + GLASS_H_FRONT / 2)
    wb.assign(front, m['glass_front'])
    # The near wall gets its own low rail, capping the short pane.
    frail = wb.rounded_box("ENV_terr_rail_front", TANK_W + 0.008, 0.014, TOP_H, 0.004, col)
    frail.location = (0, -(hd - 0.001), z0 + GLASS_H_FRONT + TOP_H / 2)
    wb.assign(frail, m['wood'])
    front_col.objects.link(frail)

    z1 = z0 + GLASS_H
    for i, (nx, ny) in enumerate(((1, 0), (-1, 0), (0, 1))):
        along_x = nx == 0
        w = TANK_W + 0.008 if along_x else 0.014
        d = 0.014 if along_x else TANK_D + 0.008
        rail = wb.rounded_box(f"ENV_terr_rail_{i}", w, d, TOP_H, 0.004, col)
        rail.location = (nx * (hw - 0.001), ny * (hd - 0.001), z1 + TOP_H / 2)
        wb.assign(rail, m['wood'])

    return z0, z1


def build_bedding(col, m, rng):
    """A deep pile of shavings, all one Voronoi-coloured material."""
    hw, hd = TANK_W / 2 - 0.010, TANK_D / 2 - 0.010
    slab = wb.rounded_box("PRP_terr_bed_base", TANK_W - 0.014, TANK_D - 0.014, 0.044, 0.004, col)
    slab.location = (0, 0, BED_TOP - 0.024)
    wb.assign(slab, m['bed'])
    n = 520
    for i in range(n):
        w = rng.uniform(0.008, 0.019)
        d = rng.uniform(0.005, 0.010)
        h = rng.uniform(0.0022, 0.0042)
        chip = wb.rounded_box(f"PRP_terr_bed_{i}", w, d, h, min(w, d, h) * 0.32, col, segments=2)
        chip.location = (rng.uniform(-hw, hw), rng.uniform(-hd, hd),
                         BED_TOP - 0.004 + 0.006 * (rng.random() ** 2) + rng.uniform(-0.002, 0.003))
        chip.rotation_euler = (rng.uniform(-0.35, 0.35), rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi))
        wb.assign(chip, m['bed'])


def build_house(col, m):
    """The wooden house on the left. It is also the `bed` site: the sleep errand now has somewhere
    to go, instead of a bare patch of bedding."""
    cx, cy = -0.118, 0.026
    W, D, H = 0.092, 0.074, 0.074
    body = wb.rounded_box("PRP_terr_house", W, D, H, 0.005, col)
    body.location = (cx, cy, BED_TOP + H / 2 - 0.008)
    wb.assign(body, m['wood'])
    roof = wb.rounded_box("PRP_terr_house_roof", W + 0.012, D + 0.012, 0.010, 0.004, col)
    roof.location = (cx, cy, BED_TOP + H - 0.006)
    wb.assign(roof, m['wood_dark'])
    door = wb.cylinder("PRP_terr_house_door", 0.019, 0.016, col, verts=24)
    door.rotation_euler = (math.radians(90), 0, 0)
    door.location = (cx + 0.004, cy - D / 2 - 0.002, BED_TOP + 0.014)
    wb.assign(door, m['wood_dark'])


def build_wheel(col, m):
    """The same open drum of rungs the cage got, which is behaviourally load-bearing: the wheel is an
    errand and `speciesData.wheelKm` counts what it earns."""
    cx, cy = -0.014, 0.056
    R, HALF_D = 0.040, 0.012
    cz = BED_TOP + R * 0.92
    for k in range(22):
        a = 2 * math.pi * k / 22
        rung = wb.cylinder(f"PRP_terr_rung_{k}", 0.0022, HALF_D * 2, col, verts=10)
        rung.rotation_euler = (math.radians(90), 0, 0)
        rung.location = (cx + math.cos(a) * R, cy, cz + math.sin(a) * R)
        wb.assign(rung, m['tub'])
    for tag, oy in (("f", -HALF_D), ("b", HALF_D)):
        hoop = wb.torus(f"PRP_terr_hoop_{tag}", R, 0.0030, col, major_seg=48)
        hoop.rotation_euler = (math.radians(90), 0, 0)
        hoop.location = (cx, cy + oy, cz)
        wb.assign(hoop, m['tub_dark'])
    back = wb.cylinder("PRP_terr_wheel_back", R - 0.002, 0.003, col, verts=48)
    back.rotation_euler = (math.radians(90), 0, 0)
    back.location = (cx, cy + HALF_D + 0.002, cz)
    wb.assign(back, m['tub'])
    hub = wb.cylinder("PRP_terr_wheel_hub", 0.0075, 0.008, col, verts=24)
    hub.rotation_euler = (math.radians(90), 0, 0)
    hub.location = (cx, cy + HALF_D - 0.003, cz)
    wb.assign(hub, m['tub_dark'])
    for sx in (-1, 1):
        leg = wb.rounded_box(f"PRP_terr_wheel_leg_{'l' if sx < 0 else 'r'}", 0.004, 0.004,
                             cz - BED_TOP + 0.012, 0.0015, col, segments=3)
        leg.location = (cx + sx * 0.030, cy + HALF_D + 0.004, BED_TOP + (cz - BED_TOP) / 2 - 0.006)
        leg.rotation_euler = (0, math.radians(-14 * sx), 0)
        wb.assign(leg, m['metal'])


def build_bowl_and_hopper(col, m, rng):
    """A ceramic food bowl in the middle, and the wall hopper on the right that doubles as the
    pantry gauge -- clear-bodied, because the cage's was a solid box with the fill sealed inside it
    and you could not tell a full hopper from an empty one."""
    bx, by = 0.060, 0.010
    dish = wb.cylinder("PRP_terr_bowl", 0.030, 0.012, col, verts=40)
    dish.location = (bx, by, BED_TOP + 0.002)
    wb.assign(dish, m['tub'])
    rim = wb.torus("PRP_terr_bowl_rim", 0.030, 0.0030, col, major_seg=44)
    rim.location = (bx, by, BED_TOP + 0.008)
    wb.assign(rim, m['tub_dark'])
    for i in range(26):
        a, r = rng.uniform(0, math.tau), rng.uniform(0, 0.022)
        g = wb.rounded_box(f"PRP_terr_bowlseed_{i}", 0.0044, 0.0030, 0.0026, 0.0010, col, segments=2)
        g.location = (bx + math.cos(a) * r, by + math.sin(a) * r, BED_TOP + 0.009)
        g.rotation_euler = (0, 0, rng.uniform(0, math.pi))
        wb.assign(g, m['seed'])

    hx, hy = 0.150, 0.082
    W, D, H = 0.034, 0.026, 0.070
    body = wb.rounded_box("PRP_terr_hopper", W, D, H, 0.004, col)
    body.location = (hx, hy, BED_TOP + 0.030 + H / 2)
    wb.assign(body, m['glass'])
    lid = wb.rounded_box("PRP_terr_hopper_lid", W + 0.004, D + 0.004, 0.008, 0.003, col)
    lid.location = (hx, hy, BED_TOP + 0.030 + H + 0.002)
    wb.assign(lid, m['tub_dark'])
    for i in range(90):
        g = wb.rounded_box(f"PRP_terr_grain_{i}", 0.0042, 0.0030, 0.0028, 0.0010, col, segments=2)
        g.location = (hx + rng.uniform(-0.011, 0.011), hy + rng.uniform(-0.007, 0.007),
                      BED_TOP + 0.033 + rng.uniform(0.0, H * 0.42))
        g.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, math.pi))
        wb.assign(g, m['seed'])


def build_bottle(col, m, z1):
    """Hung on the back rail rather than on bars, since there are none."""
    cx, cy = 0.108, TANK_D / 2 - 0.016
    H = 0.056
    top_z = z1 - 0.010
    body = wb.cylinder("PRP_terr_bottle", 0.0125, H, col, verts=28)
    body.location = (cx, cy, top_z - H / 2)
    wb.assign(body, m['glass'])
    water = wb.cylinder("PRP_terr_bottle_water", 0.0110, H * 0.66, col, verts=28)
    water.location = (cx, cy, top_z - H + H * 0.66 / 2 + 0.003)
    wb.assign(water, m['water'])
    cap = wb.cylinder("PRP_terr_bottle_cap", 0.0135, 0.010, col, verts=28)
    cap.location = (cx, cy, top_z + 0.004)
    wb.assign(cap, m['tub'])
    spout = wb.cylinder("PRP_terr_bottle_spout", 0.0030, 0.036, col, verts=14)
    spout.rotation_euler = (math.radians(24), 0, 0)
    spout.location = (cx, cy - 0.008, top_z - H - 0.012)
    wb.assign(spout, m['metal'])


def build_memorial(col, m):
    post = wb.cylinder("PRP_terr_mem_post", 0.0022, 0.040, col, verts=12)
    post.location = (0.004, -0.012, BED_TOP + 0.018)
    wb.assign(post, m['metal'])
    flag = wb.rounded_box("PRP_terr_mem_flag", 0.020, 0.0016, 0.013, 0.0006, col, segments=3)
    flag.location = (0.015, -0.012, BED_TOP + 0.031)
    wb.assign(flag, wb.toy_material("WP_terr_mem_flag", (0.62, 0.20, 0.22), roughness=0.5, sheen=0.4))


def build_lights():
    """Lights aimed at THIS habitat, which the cage never had.

    All three rig lights converge on (0, 0, 0.0855) -- the fish bowl's centre. This tank's subject is
    its floor, 6-8 cm lower, and from there the fill light sits at 7.8 degrees of elevation and
    therefore delivers 13.6% of its energy to a horizontal surface. The cage was effectively lit by
    one light, which is exactly the condition under which untextured chips collapse into one tone.

    Two additions, not a replacement: `only_collection` always keeps WP_Rig, so the key still does the
    modelling and these only fill what it cannot reach.
    """
    wb.clear_collection("WP_TerrLight")
    col = wb.get_collection("WP_TerrLight")
    floor = bpy.data.lights.new("LGT_terr_floor", type='AREA')
    floor.shape = 'RECTANGLE'
    floor.size, floor.size_y = 0.60, 0.30
    floor.energy = 26.0
    floor.color = (0.78, 0.86, 1.0)
    floor.use_shadow = False
    ob = bpy.data.objects.new("LGT_terr_floor", floor)
    ob.location = (-0.22, -0.40, 0.26)
    ob.rotation_euler = (math.radians(58), 0.0, math.radians(-26))
    col.objects.link(ob)

    edge = bpy.data.lights.new("LGT_terr_edge", type='AREA')
    edge.shape = 'RECTANGLE'
    edge.size, edge.size_y = 0.90, 0.10
    edge.energy = 18.0
    edge.color = (1.0, 0.94, 0.86)
    edge.use_shadow = False
    ob2 = bpy.data.objects.new("LGT_terr_edge", edge)
    ob2.location = (0.30, -0.46, 0.10)
    ob2.rotation_euler = (math.radians(86), 0.0, math.radians(34))
    col.objects.link(ob2)


def build_camera():
    """CAM_cage's lens and pitch, re-aimed. Same ortho on purpose -- see the module docstring."""
    src = bpy.data.objects['CAM_bowl']
    dist = abs(src.location.y)
    pitch = math.radians(TANK_PITCH_DEG)
    aim_z = GROUND + 0.085
    cam = bpy.data.objects.get("CAM_terr")
    if cam is None:
        data = bpy.data.cameras.new("CAM_terr")
        cam = bpy.data.objects.new("CAM_terr", data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = TERR_ORTHO
    cam.data.clip_start, cam.data.clip_end = src.data.clip_start, src.data.clip_end
    # Offset sideways. The shared key light sits up and to the LEFT, so the contact shadow falls to
    # the right -- and at alpha above 0.5 that shadow is part of `opaqueRect`, the click-through
    # contract, exactly as it is for the cage. The tank itself spans 29-291 of 320 with room to
    # spare; it was the shadow running off the right edge that was clipping. Moving the light is not
    # an option (it is the bowl's), so the camera moves instead.
    cam.location = (TERR_SHIFT_X, src.location.y, aim_z + dist * math.tan(pitch))
    cam.rotation_euler = (math.radians(90.0) - pitch, 0.0, 0.0)


def share_ground():
    catcher = bpy.data.objects.get("ENV_shadow_catcher")
    if catcher is None:
        return
    col = wb.get_collection("WP_Ground")
    if catcher.name not in col.objects:
        col.objects.link(catcher)


def main():
    rng = random.Random(20260921)
    for name in ("WP_Terrarium", "WP_TerrariumGlass", "WP_TerrariumMemorial"):
        wb.clear_collection(name)
    col = wb.get_collection("WP_Terrarium")
    glass_col = wb.get_collection("WP_TerrariumGlass")
    front_col = wb.get_collection("WP_TerrariumFront")
    for ob in list(front_col.objects):
        front_col.objects.unlink(ob)      # unlink, never clear: these are shared with WP_Terrarium
    m = materials()
    z0, z1 = build_tank(col, glass_col, front_col, m)
    build_bedding(col, m, rng)
    build_house(col, m)
    build_wheel(col, m)
    build_bowl_and_hopper(col, m, rng)
    build_bottle(col, m, z1)
    build_memorial(wb.get_collection("WP_TerrariumMemorial"), m)
    build_lights()
    build_camera()
    share_ground()
    print("WP_TERR_OBJECTS", len(col.objects), "GLASS", len(glass_col.objects),
          "FRONT", len(front_col.objects))
    print("WP_BED_TOP", round(BED_TOP, 5))
    bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
    print("WP_SAVED", OUT)


main()
