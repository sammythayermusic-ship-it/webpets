"""Bake-off candidate A, look-dev: write a copy of wp_scene.blend with the "rendered ceiling" look.

    Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/a_look.py -- assets/3d/wp_scene-a-look.blend

Never saves over the original. Everything here is rebuildable: run it again and the copy is
regenerated from the untouched source. What it changes, and why, is in docs/DECISIONS.md under
"bake-off candidate A".

  glass    real dielectric: Principled transmission 1, IOR 1.5, roughness that rises toward the rim
           (Layer Weight -> Map Range -> Roughness), nearly untinted
  water    a NEW mesh: the old lathe's side profile plus a dense top disc (64 x 40) so the surface
           can be displaced; the old object is deleted and the new one takes its name. Transmission
           1, IOR 1.333, roughness 0 (MNEE wants a smooth interface), absorption volume for depth.
           Displace modifier limited to the surface by a vertex group, driven by an empty that
           moves in a circle over LOOP_FRAMES frames, so the ripple animation loops exactly.
  meniscus the waterline ring becomes a bright glassy lip instead of flat pale paint
  caustics Cycles shadow caustics (MNEE): key light casts, water + glass cast, gravel + pebbles receive
  fish     procedural scale relief and tone on the body, subsurface up, a wet coat; fin rays
           (radial sine in each fin's own space) driving bump + transmission; a coated eye with a
           pupil and a gold iris ring from the eye's own normal
  night    a second light rig in WP_RigNight (cool moon key, warm desk-lamp fill, dim blue bounce)
           and a night world, rendered as its own plates by a_render.py
  fps      24. Fish states are rendered on half-frames of the 12 fps keys (linear interpolation),
           which doubles every state's frame count without touching the rig.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "assets/3d/wp_scene-a-look.blend"

LOOP_FIRST = 2001
LOOP_FRAMES = 96          # 4 s at 24 fps
SEG = 64                  # around the water; the disc shares the rim ring with the lathe
DISC_RINGS = 40

sc = bpy.context.scene
sc.render.fps = 24


# ----------------------------------------------------------------------------- helpers

def principled(mat):
    return mat.node_tree.nodes["Principled BSDF"]


def set_in(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def new_node(nt, idname, **props):
    n = nt.nodes.new(idname)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def link(nt, a, a_out, b, b_in):
    nt.links.new(a.outputs[a_out], b.inputs[b_in])


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------------------- glass

def glass_look(mat):
    """Nearly clear dielectric whose roughness rises at grazing angles: the rim of a real bowl is
    never as sharp as its face, which is most of what separates rendered glass from a glass BSDF."""
    nt = mat.node_tree
    b = principled(mat)
    set_in(b, "Base Color", (0.94, 0.975, 0.99, 1.0))
    set_in(b, "IOR", 1.5)
    set_in(b, "Transmission Weight", 1.0)
    set_in(b, "Specular IOR Level", 0.5)
    lw = new_node(nt, "ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    mr = new_node(nt, "ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 1.0
    mr.inputs["To Min"].default_value = 0.012     # face
    mr.inputs["To Max"].default_value = 0.11      # rim
    link(nt, lw, "Fresnel", mr, "Value")
    link(nt, mr, "Result", b, "Roughness")


for name in ("WP_glass", "WP_glass_front"):
    glass_look(bpy.data.materials[name])


# ----------------------------------------------------------------------------- water mesh

def water_profile(old):
    """(z, r) of the old lathe, one entry per ring, so the new water has the same silhouette."""
    pts = {}
    for v in old.data.vertices:
        z = round(v.co.z, 5)
        pts[z] = max(pts.get(z, 0.0), math.hypot(v.co.x, v.co.y))
    return sorted(pts.items())


def build_water(old):
    prof = water_profile(old)
    col = old.users_collection[0]
    bm = bmesh.new()
    rings = []
    for z, r in prof:
        if r < 1e-6:
            rings.append(bm.verts.new((0.0, 0.0, z)))
            continue
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * s / SEG), r * math.sin(2 * math.pi * s / SEG), z)) for s in range(SEG)])
    for lo, hi in zip(rings, rings[1:]):
        if not isinstance(lo, list):
            for s in range(SEG):
                bm.faces.new((lo, hi[s], hi[(s + 1) % SEG]))
        elif not isinstance(hi, list):
            for s in range(SEG):
                bm.faces.new((lo[(s + 1) % SEG], lo[s], hi))
        else:
            for s in range(SEG):
                t = (s + 1) % SEG
                bm.faces.new((lo[s], lo[t], hi[t], hi[s]))
    # The top disc, inward from the rim ring. Dense so the displacement has something to move.
    z_top, r_top = prof[-1]
    disc = [rings[-1]]
    for i in range(DISC_RINGS - 1, 0, -1):
        r = r_top * i / DISC_RINGS
        disc.append([bm.verts.new((r * math.cos(2 * math.pi * s / SEG), r * math.sin(2 * math.pi * s / SEG), z_top)) for s in range(SEG)])
    pole = bm.verts.new((0.0, 0.0, z_top))
    for outer, inner in zip(disc, disc[1:]):
        for s in range(SEG):
            t = (s + 1) % SEG
            bm.faces.new((outer[t], outer[s], inner[s], inner[t]))
    for s in range(SEG):
        bm.faces.new((disc[-1][(s + 1) % SEG], disc[-1][s], pole))
    bm.normal_update()
    me = bpy.data.meshes.new("ENV_bowl_water_A")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("ENV_bowl_water", me)
    col.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    # Surface weight: 1 across the middle, pinned to 0 at the glass so the ripple never opens a gap.
    vg = ob.vertex_groups.new(name="A_surface")
    for v in me.vertices:
        if abs(v.co.z - z_top) > 1e-6:
            continue
        rho = math.hypot(v.co.x, v.co.y) / r_top
        w = 1.0 - smoothstep(0.80, 1.0, rho)
        if w > 0:
            vg.add([v.index], w, 'REPLACE')
    return ob, z_top, r_top


old_water = bpy.data.objects["ENV_bowl_water"]
WATER_MAT = old_water.data.materials[0]
water, WATER_Z, WATER_R = build_water(old_water)
bpy.data.objects.remove(old_water, do_unlink=True)
water.name = "ENV_bowl_water"            # the new mesh takes the old name once the old one is gone
water.data.materials.append(WATER_MAT)
water.cycles.is_caustics_caster = True

# The ripple: a legacy Clouds texture read in the space of an empty that circles once per loop.
drive = bpy.data.objects.new("A_water_drive", None)
sc.collection.objects.link(drive)
drive.empty_display_size = 0.02
tex = bpy.data.textures.new("A_ripple", 'CLOUDS')
tex.noise_scale = 0.045
tex.noise_depth = 2
tex.noise_basis = 'IMPROVED_PERLIN'
disp = water.modifiers.new("A_ripple", 'DISPLACE')
disp.texture = tex
disp.texture_coords = 'OBJECT'
disp.texture_coords_object = drive
disp.direction = 'Z'
disp.mid_level = 0.5
disp.strength = 0.0042          # +-2.1 mm about the still level; 1.1 mm was invisible from a camera 9 degrees above the surface
disp.vertex_group = "A_surface"
sub = water.modifiers.new("Subdivision", 'SUBSURF')
sub.levels = 1
sub.render_levels = 1
# Circle of radius 0.05 in texture space over LOOP_FRAMES frames; frame LOOP_FIRST + LOOP_FRAMES
# lands back on the start pose, so the sequence loops with no seam. Keyed per frame, linear.
for i in range(LOOP_FRAMES + 1):
    a = 2 * math.pi * i / LOOP_FRAMES
    drive.location = (0.06 * math.cos(a) + 0.37, 0.06 * math.sin(a) + 0.11, 0.0)
    drive.keyframe_insert("location", frame=LOOP_FIRST + i)
# (keys made linear below, once linearize() exists)


# ----------------------------------------------------------------------------- water material

def water_look(mat):
    nt = mat.node_tree
    b = principled(mat)
    set_in(b, "Base Color", (0.985, 0.995, 1.0, 1.0))
    set_in(b, "IOR", 1.333)
    set_in(b, "Roughness", 0.0)
    set_in(b, "Transmission Weight", 1.0)
    set_in(b, "Specular IOR Level", 0.5)
    out = nt.nodes["Material Output"]
    vol = new_node(nt, "ShaderNodeVolumeAbsorption")
    # Clear water: a faint blue-green absorption that only shows over the full depth. Density 7 read
    # as milk; the bowl is 22 cm across and real tap water does not tint in 22 cm.
    vol.inputs["Color"].default_value = (0.82, 0.95, 0.97, 1.0)
    vol.inputs["Density"].default_value = 2.6
    link(nt, vol, "Volume", out, "Volume")


water_look(WATER_MAT)
mem = bpy.data.materials.get("WP_water_memorial")
if mem is not None:
    water_look(mem)
    principled(mem).inputs["Base Color"].default_value = (0.86, 0.90, 0.90, 1.0)


# ----------------------------------------------------------------------------- meniscus

ring = bpy.data.objects["ENV_waterline"]
men = bpy.data.materials["WP_waterline"]
b = principled(men)
set_in(b, "Base Color", (0.90, 0.94, 0.97, 1.0))
set_in(b, "Roughness", 0.55)
set_in(b, "IOR", 1.333)
set_in(b, "Transmission Weight", 1.0)
set_in(b, "Specular IOR Level", 0.5)
# Lifted a hair so the lip sits on the still water rather than inside it, and scaled so it reads
# as a meniscus that climbs the glass rather than as a hoop floating in the middle of the bowl.
ring.location.z = WATER_Z + 0.0006
ring.scale = (1.01, 1.01, 0.26)


# ----------------------------------------------------------------------------- caustics
#
# MNEE (Cycles "shadow caustics") was the first plan and it is wired below behind USE_MNEE so it can
# be measured again. Measured with a_diag_caustic.py at 48 samples: the gravel with the key as a
# caustic light differs from the gravel without it by a mean of 0.02-0.03 (0..1), the same as two
# renders of identical settings differ by denoiser noise. The bowl's floor sits behind two
# refractive interfaces and the key reaches it mostly through the open top; whatever MNEE adds
# is below what 32 samples can resolve. So instead:
#   - every dielectric (glass, water, meniscus) lets SHADOW rays through untouched (Light Path ->
#     Is Shadow Ray -> Transparent), so the lamps light the inside of the bowl directly, the way a
#     lit tank is lit, instead of only by bounced paths the denoiser then smears; and
#   - the caustic pattern is PROJECTED: a spot above the opening carries a Voronoi "distance to
#     edge" web as a gobo, two layers drifting on closed circles over the loop so frame N+1 of the
#     loop meets frame 0 with no seam. It is deterministic and noise-free at any sample count,
#     which a real caustic through moving water at 32 samples is not.
USE_MNEE = False

water.cycles.is_caustics_caster = USE_MNEE
bpy.data.objects["ENV_bowl_glass"].cycles.is_caustics_caster = USE_MNEE
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if o.name == "PRP_gravel" or o.name.startswith("PRP_pebble") or o.name.startswith("PRP_plant"):
        o.cycles.is_caustics_receiver = USE_MNEE
# Cycles' own caustic paths (camera -> diffuse -> through the water -> lamp) are off: with the
# dielectrics passing shadow rays the direct light already gets in, and on the plane test those
# paths only added 20% brightness as sparkle that the denoiser turns into a glow that differs from
# frame to frame. A 96-frame loop must not flicker.
sc.cycles.caustics_reflective = USE_MNEE
sc.cycles.caustics_refractive = USE_MNEE
bpy.data.objects["LGT_key"].data.cycles.is_caustics_light = USE_MNEE


def shadow_transparent(mat):
    """Shadow rays pass through this material as if it were not there."""
    nt = mat.node_tree
    out = nt.nodes["Material Output"]
    surf = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
    if surf is None:
        return
    lp = new_node(nt, "ShaderNodeLightPath")
    tr = new_node(nt, "ShaderNodeBsdfTransparent")
    mix = new_node(nt, "ShaderNodeMixShader")
    nt.links.new(surf, mix.inputs[1])
    link(nt, tr, "BSDF", mix, 2)
    link(nt, lp, "Is Shadow Ray", mix, "Fac")
    link(nt, mix, "Shader", out, "Surface")


for name in ("WP_glass", "WP_glass_front", "WP_water", "WP_water_memorial", "WP_waterline"):
    m = bpy.data.materials.get(name)
    if m is not None:
        shadow_transparent(m)


def caustic_gobo(name, collection, energy, color, loc, size_deg=52.0, phase=0.0):
    """A spot light carrying an animated caustic web. The web is two Voronoi distance-to-edge
    layers in the lamp's projection plane (Normal.xy / Normal.z), each drifting round a circle
    over the loop; the circle closes, so the loop closes."""
    lt = bpy.data.lights.new(name, 'SPOT')
    lt.energy = energy
    lt.color = color
    lt.spot_size = math.radians(size_deg)
    lt.spot_blend = 0.35
    # EXACTLY zero. A spot in Blender 4+ is a sphere of this radius and the lamp shader's Normal is
    # the normal at the sampled point on that sphere, so any radius at all turns the projected
    # coordinate into per-sample noise: 6 cm erased the web, 4 mm dithered it, 0 projects it clean.
    lt.shadow_soft_size = 0.0
    lt.use_nodes = True
    nt = lt.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = new_node(nt, "ShaderNodeOutputLight")
    emit = new_node(nt, "ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    tc = new_node(nt, "ShaderNodeTexCoord")
    sep = new_node(nt, "ShaderNodeSeparateXYZ")
    link(nt, tc, "Normal", sep, "Vector")
    px = new_node(nt, "ShaderNodeMath"); px.operation = 'DIVIDE'
    py = new_node(nt, "ShaderNodeMath"); py.operation = 'DIVIDE'
    link(nt, sep, "X", px, 0); link(nt, sep, "Z", px, 1)
    link(nt, sep, "Y", py, 0); link(nt, sep, "Z", py, 1)
    comb = new_node(nt, "ShaderNodeCombineXYZ")
    link(nt, px, "Value", comb, "X")
    link(nt, py, "Value", comb, "Y")
    total = new_node(nt, "ShaderNodeMath"); total.operation = 'ADD'
    layers = []
    # Distance-to-edge peaks at about half a cell (0.5/scale), so a line width is a FRACTION of that:
    # 0.13/scale is a thin bright filament, 0.5/scale would be the whole cell. Cells of ~3 cm and
    # ~2 cm on the gravel (0.66 m below the lamp), which is what a bowl's caustics are.
    # Drift radius 0.03 units = 2 cm on the gravel: the web wanders, it does not race. The 4D W
    # wobble is a sine over the loop (back at its start on the last frame), which makes the cells
    # themselves breathe between frames instead of only sliding.
    # Cells ~4 cm and ~2.5 cm, filaments a fifth of a cell: at the Medium window a grid px is ~2
    # screen px and a 13%-of-cell line was a single pixel.
    for i, (scale, radius, direction, width) in enumerate(((16.0, 0.03, 1.0, 0.2 / 16.0), (26.0, 0.02, -1.0, 0.2 / 26.0))):
        mp = new_node(nt, "ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        mp.inputs["Rotation"].default_value = (0.0, 0.0, 0.9 * i)
        link(nt, comb, "Vector", mp, "Vector")
        vor = new_node(nt, "ShaderNodeTexVoronoi")
        vor.feature = 'DISTANCE_TO_EDGE'
        vor.voronoi_dimensions = '4D'
        vor.inputs["Randomness"].default_value = 0.85
        vor.inputs["Scale"].default_value = 1.0   # the Mapping carries the scale; the node's own 5.0 stacked on it (measured: 5x too fine)
        link(nt, mp, "Vector", vor, "Vector")
        web = new_node(nt, "ShaderNodeMapRange")       # 1 on a cell edge, 0 inside the cell
        web.inputs["From Min"].default_value = 0.0
        web.inputs["From Max"].default_value = width
        web.inputs["To Min"].default_value = 1.0
        web.inputs["To Max"].default_value = 0.0
        web.interpolation_type = 'SMOOTHSTEP'
        link(nt, vor, "Distance", web, "Value")
        # the lines are brightest where they cross: square the layer so the web has highlights
        sq = new_node(nt, "ShaderNodeMath"); sq.operation = 'POWER'; sq.inputs[1].default_value = 1.6
        link(nt, web, "Result", sq, 0)
        layers.append(sq)
        # drift: a circle in the projection plane, closing after LOOP_FRAMES frames
        for f in range(LOOP_FRAMES + 1):
            a = direction * 2 * math.pi * f / LOOP_FRAMES + phase
            mp.inputs["Location"].default_value = (radius * math.cos(a), radius * math.sin(a), 0.0)
            mp.inputs["Location"].keyframe_insert("default_value", frame=LOOP_FIRST + f)
            vor.inputs["W"].default_value = 0.35 * math.sin(a + 0.7 * i)
            vor.inputs["W"].keyframe_insert("default_value", frame=LOOP_FIRST + f)
    link(nt, layers[0], "Value", total, 0)
    link(nt, layers[1], "Value", total, 1)
    # base light + web: the spot is also the daylight through the open top, the web rides on it
    scaled = new_node(nt, "ShaderNodeMath"); scaled.operation = 'MULTIPLY_ADD'
    scaled.inputs[1].default_value = 2.8       # web gain
    scaled.inputs[2].default_value = 0.10      # floor
    link(nt, total, "Value", scaled, 0)
    link(nt, scaled, "Value", emit, "Strength")
    link(nt, emit, "Emission", out, "Surface")
    ob = bpy.data.objects.new(name, lt)
    collection.objects.link(ob)
    ob.location = loc
    # aim at the centre of the gravel bed
    target = Vector((0.0, 0.0, 0.06))
    ob.rotation_euler = (target - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def linearize(ob_or_id):
    ad = ob_or_id.animation_data
    if ad is None or ad.action is None:
        return
    act = ad.action
    curves = []
    if hasattr(act, "fcurves"):
        curves = list(act.fcurves)
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    curves += list(cb.fcurves)
    except AttributeError:
        pass
    for fc in curves:
        for k in fc.keyframe_points:
            k.interpolation = 'LINEAR'


linearize(drive)

# Only what is under the water receives the web (light linking): the first render put it on the
# wooden stand outside the bowl, where no caustic has ever been.
receivers = bpy.data.collections.new("A_CausticReceivers")
for o in bpy.data.objects:
    if o.type == 'MESH' and (o.name == "PRP_gravel" or o.name.startswith("PRP_pebble") or o.name.startswith("PRP_plant")):
        receivers.objects.link(o)


def receive_only(lamp):
    lamp.light_linking.receiver_collection = receivers


# From the front-above, not overhead: the camera sits 9 degrees above the water and sees the dished
# gravel top only as a sliver between pebbles, so an overhead web landed where nothing shows it.
# Raking in from the front it crosses the blades, the pebble faces and the near band of gravel.
caustic_day = caustic_gobo("LGT_caustic", bpy.data.collections["WP_Rig"], 30.0, (0.86, 0.95, 1.0), (-0.06, -0.50, 0.52))
linearize(caustic_day.data.node_tree)
receive_only(caustic_day)


# ----------------------------------------------------------------------------- fish

def fish_body_look(mat):
    """Scales as relief and tone, a little subsurface, a wet coat.

    Voronoi F1 distance in the body's own space with a 0.35 randomness: cells about 2 mm across,
    which at the 320 px delivery is ~6 px, big enough to read as scales and small enough not to
    read as a pattern. The distance-to-centre turned into a rounded cap is the relief; the same
    mask darkens the base colour a few percent toward each scale's edge."""
    nt = mat.node_tree
    b = principled(mat)
    ramp = nt.nodes["Color Ramp"]           # the belly gradient, kept
    tc = new_node(nt, "ShaderNodeTexCoord")
    mapping = new_node(nt, "ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.25)   # scales a little wider than tall
    link(nt, tc, "Object", mapping, "Vector")
    vor = new_node(nt, "ShaderNodeTexVoronoi")
    vor.feature = 'F1'
    # 230: cells ~4.3 mm, ~9 px at the 320 px delivery. 520 was 2 mm, which the eye read as cloth.
    vor.inputs["Scale"].default_value = 230.0
    vor.inputs["Randomness"].default_value = 0.22
    link(nt, mapping, "Vector", vor, "Vector")
    # rounded cap: 1 at the cell centre, 0 at its edge
    cap = new_node(nt, "ShaderNodeMapRange")
    cap.inputs["From Min"].default_value = 0.0
    cap.inputs["From Max"].default_value = 0.62
    cap.inputs["To Min"].default_value = 1.0
    cap.inputs["To Max"].default_value = 0.0
    cap.interpolation_type = 'SMOOTHSTEP'
    link(nt, vor, "Distance", cap, "Value")
    bump = new_node(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.32
    bump.inputs["Distance"].default_value = 0.0004
    link(nt, cap, "Result", bump, "Height")
    link(nt, bump, "Normal", b, "Normal")
    # tone: edge of every scale 7% darker
    tone = new_node(nt, "ShaderNodeMixRGB")
    tone.blend_type = 'MULTIPLY'
    tone.inputs["Fac"].default_value = 0.07
    tone.inputs["Color2"].default_value = (0.15, 0.08, 0.05, 1.0)
    inv = new_node(nt, "ShaderNodeMath")
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    link(nt, cap, "Result", inv, 1)
    # Fac = 0.07 * (1 - cap)
    fac = new_node(nt, "ShaderNodeMath")
    fac.operation = 'MULTIPLY'
    fac.inputs[1].default_value = 0.09
    link(nt, inv, "Value", fac, 0)
    link(nt, fac, "Value", tone, "Fac")
    link(nt, ramp, "Color", tone, "Color1")
    link(nt, tone, "Color", b, "Base Color")
    set_in(b, "Subsurface Weight", 0.32)
    set_in(b, "Subsurface Radius", (0.012, 0.0045, 0.002))
    set_in(b, "Subsurface Scale", 0.09)
    set_in(b, "Roughness", 0.38)
    set_in(b, "Coat Weight", 0.45)
    set_in(b, "Coat Roughness", 0.12)
    set_in(b, "Sheen Weight", 0.12)
    set_in(b, "Specular IOR Level", 0.45)


def fish_fin_look(mat):
    """Rays: sin(N * atan2(z, x)) in each fin's own space, which radiates from the fin's root at
    its local origin. Drives a bump and the opacity: the rays are the fleshy, more opaque part,
    the membrane between them lets light through."""
    nt = mat.node_tree
    b = principled(mat)
    tc = new_node(nt, "ShaderNodeTexCoord")
    sep = new_node(nt, "ShaderNodeSeparateXYZ")
    link(nt, tc, "Object", sep, "Vector")
    ang = new_node(nt, "ShaderNodeMath")
    ang.operation = 'ARCTAN2'
    link(nt, sep, "Z", ang, 0)
    link(nt, sep, "X", ang, 1)
    mul = new_node(nt, "ShaderNodeMath")
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 24.0
    link(nt, ang, "Value", mul, 0)
    sin = new_node(nt, "ShaderNodeMath")
    sin.operation = 'SINE'
    link(nt, mul, "Value", sin, 0)
    rays = new_node(nt, "ShaderNodeMapRange")       # 0 between rays .. 1 on a ray
    rays.inputs["From Min"].default_value = -1.0
    rays.inputs["From Max"].default_value = 1.0
    rays.inputs["To Min"].default_value = 0.0
    rays.inputs["To Max"].default_value = 1.0
    rays.interpolation_type = 'SMOOTHSTEP'
    link(nt, sin, "Value", rays, "Value")
    bump = new_node(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.00025
    link(nt, rays, "Result", bump, "Height")
    link(nt, bump, "Normal", b, "Normal")
    trans = new_node(nt, "ShaderNodeMapRange")       # membrane 0.62 .. ray 0.28
    trans.inputs["From Min"].default_value = 0.0
    trans.inputs["From Max"].default_value = 1.0
    trans.inputs["To Min"].default_value = 0.62
    trans.inputs["To Max"].default_value = 0.28
    link(nt, rays, "Result", trans, "Value")
    link(nt, trans, "Result", b, "Transmission Weight")
    # rays a shade deeper
    tone = new_node(nt, "ShaderNodeMixRGB")
    tone.blend_type = 'MIX'
    tone.inputs["Color1"].default_value = (0.96, 0.40, 0.12, 1.0)   # membrane, warmer
    tone.inputs["Color2"].default_value = (0.86, 0.22, 0.05, 1.0)   # ray
    link(nt, rays, "Result", tone, "Fac")
    link(nt, tone, "Color", b, "Base Color")
    set_in(b, "Subsurface Weight", 0.3)
    set_in(b, "Subsurface Radius", (0.010, 0.004, 0.002))
    set_in(b, "Subsurface Scale", 0.06)
    set_in(b, "Roughness", 0.3)
    set_in(b, "IOR", 1.38)
    set_in(b, "Coat Weight", 0.3)
    set_in(b, "Coat Roughness", 0.1)


def fish_eye_look(mat):
    """A pupil and a gold iris ring from the eye's own normal (|y| in object space, which is
    the axis the eye faces along), under a sharp wet coat."""
    nt = mat.node_tree
    b = principled(mat)
    tc = new_node(nt, "ShaderNodeTexCoord")
    norm = new_node(nt, "ShaderNodeVectorMath")
    norm.operation = 'NORMALIZE'
    link(nt, tc, "Object", norm, 0)
    sep = new_node(nt, "ShaderNodeSeparateXYZ")
    link(nt, norm, "Vector", sep, "Vector")
    ab = new_node(nt, "ShaderNodeMath")
    ab.operation = 'ABSOLUTE'
    link(nt, sep, "Y", ab, 0)
    ramp = new_node(nt, "ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    e = cr.elements
    e[0].position = 0.0
    e[0].color = (0.05, 0.035, 0.03, 1.0)       # back of the eye, dark
    e[1].position = 0.60
    e[1].color = (0.08, 0.05, 0.03, 1.0)
    e2 = e.new(0.66); e2.color = (0.85, 0.55, 0.12, 1.0)   # gold iris
    e3 = e.new(0.80); e3.color = (0.70, 0.40, 0.08, 1.0)
    e4 = e.new(0.86); e4.color = (0.01, 0.008, 0.012, 1.0)  # pupil
    link(nt, ab, "Value", ramp, "Fac")
    link(nt, ramp, "Color", b, "Base Color")
    set_in(b, "Roughness", 0.25)
    set_in(b, "Coat Weight", 1.0)
    set_in(b, "Coat Roughness", 0.015)
    set_in(b, "Coat IOR", 1.42)
    set_in(b, "Specular IOR Level", 0.5)


fish_body_look(bpy.data.materials["WP_fish_body"])
fish_fin_look(bpy.data.materials["WP_fish_fin"])
fish_eye_look(bpy.data.materials["WP_fish_eye"])


# ----------------------------------------------------------------------------- pebbles

for pm in bpy.data.materials:
    if pm.name.startswith("WP_pebble_"):
        pb = principled(pm)
        r, g, b_, a = pb.inputs["Base Color"].default_value
        lum = 0.3 * r + 0.59 * g + 0.11 * b_
        # 25% toward their own luminance: river stones, not sweets. Rougher and slightly coated: wet.
        pb.inputs["Base Color"].default_value = (r + (lum - r) * 0.25, g + (lum - g) * 0.25, b_ + (lum - b_) * 0.25, a)
        set_in(pb, "Roughness", 0.5)
        set_in(pb, "Coat Weight", 0.3)
        set_in(pb, "Coat Roughness", 0.25)


# ----------------------------------------------------------------------------- plants

for name in ("WP_plant_a", "WP_plant_b"):
    pm = bpy.data.materials.get(name)
    if pm is None:
        continue
    pb = principled(pm)
    # A leaf is a few cells thick: light comes through it. Subsurface with a green radius and a
    # faint wet coat are what separate a plant from a strip of green plastic.
    # No subsurface: on a blade one cell thick the random walk comes straight out the far side
    # and the leaf glows lime under any light from above. Measured with the gobo alone.
    set_in(pb, "Subsurface Weight", 0.0)
    set_in(pb, "Subsurface Radius", (0.004, 0.012, 0.003))
    set_in(pb, "Subsurface Scale", 0.05)
    set_in(pb, "Transmission Weight", 0.0)
    set_in(pb, "Roughness", 0.36)
    set_in(pb, "Coat Weight", 0.25)
    set_in(pb, "Coat Roughness", 0.2)
    r, g, b_, a = pb.inputs["Base Color"].default_value
    pb.inputs["Base Color"].default_value = (r * 0.55, g * 0.58, b_ * 0.55, a)
    # veins: a stretched noise bump, so the blade is not a flat extrusion
    pnt = pm.node_tree
    ptc = new_node(pnt, "ShaderNodeTexCoord")
    pmap = new_node(pnt, "ShaderNodeMapping")
    pmap.inputs["Scale"].default_value = (18.0, 18.0, 160.0)
    link(pnt, ptc, "Object", pmap, "Vector")
    pnoise = new_node(pnt, "ShaderNodeTexNoise")
    pnoise.inputs["Scale"].default_value = 3.0
    pnoise.inputs["Detail"].default_value = 3.0
    link(pnt, pmap, "Vector", pnoise, "Vector")
    pbump = new_node(pnt, "ShaderNodeBump")
    pbump.inputs["Strength"].default_value = 0.25
    pbump.inputs["Distance"].default_value = 0.0006
    link(pnt, pnoise, "Fac", pbump, "Height")
    link(pnt, pbump, "Normal", pb, "Normal")


# ----------------------------------------------------------------------------- day rig touch-up

bounce = bpy.data.lights.new("LGT_bounce", 'AREA')
bounce.energy = 3.0
bounce.color = (1.0, 0.93, 0.85)
bounce.size = 2.0
bounce.shape = 'DISK'
bo = bpy.data.objects.new("LGT_bounce", bounce)
bpy.data.collections["WP_Rig"].objects.link(bo)
bo.location = (0.2, -1.0, -0.45)
bo.rotation_euler = (-1.25, 0.0, 0.2)   # pointing up at the underside of the bowl
# Two key levels, because the dielectrics now pass shadow rays and the bowl's inside is lit by the
# key directly: 125 W (the fish's level, and the baseline's) blows the gravel out. The fish is
# rendered alone and composited into the water, so it keeps the brighter key; a_common.rig() picks
# the level by job.
bpy.data.lights["LGT_key"].size = 0.45    # a touch smaller: sharper surface highlights, still a soft shadow
# Measured on the plant crop with each light alone (a_diag, 8 samples): the key at 62 W drives a
# 0.15-albedo leaf to 0.43, i.e. the inside sat ~2.5x over a mid-tone exposure once the dielectrics
# passed shadow rays. Everything that reaches the inside comes down together.
sc["wp_key_bowl"] = 26.0
sc["wp_key_fish"] = 90.0
bpy.data.lights["LGT_rim"].energy = 18.0
bpy.data.lights["LGT_fill"].energy = 12.0
bpy.data.lights["LGT_key"].energy = sc["wp_key_bowl"]


# ----------------------------------------------------------------------------- night rig

night = bpy.data.collections.new("WP_RigNight")
sc.collection.children.link(night)
night.hide_render = True


def add_light(name, kind, energy, color, size, loc, rot, caustic=False):
    lt = bpy.data.lights.new(name, kind)
    lt.energy = energy
    lt.color = color
    lt.size = size
    lt.shape = 'DISK'
    lt.cycles.is_caustics_light = caustic
    ob = bpy.data.objects.new(name, lt)
    night.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


# Moon: cool, high, from behind-left so the glass gets a cold rim and the water a pale sheet.
add_light("LGT_moon", 'AREA', 12.0, (0.62, 0.74, 1.0), 1.4, (-0.55, 0.55, 1.35), (0.62, 0.0, -2.4), caustic=True)
# Desk lamp: warm, small, front-right and low, the one thing that keeps the scene from going flat.
add_light("LGT_lamp", 'AREA', 26.0, (1.0, 0.68, 0.38), 1.5, (0.95, -1.05, 1.05), (0.95, 0.0, 0.72), caustic=True)
# Dim blue bounce from below-front.
add_light("LGT_night_fill", 'AREA', 8.0, (0.55, 0.65, 1.0), 2.0, (0.0, -1.0, -0.3), (-1.3, 0.0, 0.0))
# The moonlight's caustic web, dim and cool; the same drift so the night loop crossfades in phase.
caustic_night = caustic_gobo("LGT_caustic_night", night, 8.0, (0.62, 0.76, 1.0), (-0.06, -0.50, 0.52))
linearize(caustic_night.data.node_tree)
receive_only(caustic_night)
# A lamp seen straight through two walls of glass is a hard disc hanging in the water. The glass
# still reflects them (glossy rays); refracted rays do not see them.
for ln in ("LGT_lamp", "LGT_moon"):
    bpy.data.objects[ln].visible_transmission = False
# The lamp's mirror image in the concave back wall sat in the middle of the water as a disc, at
# any lamp size. It lights surfaces only; the moon (behind, high) is what the glass reflects.
bpy.data.objects["LGT_lamp"].visible_glossy = False

# Night world: a much darker, cooler sky.
w_day = sc.world
w_night = w_day.copy()
w_night.name = "WP_World_Night"
w_night.use_fake_user = True          # a world nothing uses yet is dropped on save without this
bg = w_night.node_tree.nodes["Background"]
bg.inputs["Strength"].default_value = 0.08
cr = w_night.node_tree.nodes["Color Ramp"].color_ramp
for el in cr.elements:
    r, g, b_, a = el.color
    el.color = (r * 0.45, g * 0.55, min(1.0, b_ * 0.95), a)
sc["wp_night_world"] = w_night.name
sc["wp_loop_first"] = LOOP_FIRST
sc["wp_loop_frames"] = LOOP_FRAMES

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT), copy=True)
print("A_LOOK_SAVED", os.path.abspath(OUT), flush=True)
