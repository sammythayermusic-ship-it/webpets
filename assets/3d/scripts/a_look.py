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
tex.noise_scale = 0.028
tex.noise_depth = 2
tex.noise_basis = 'IMPROVED_PERLIN'
disp = water.modifiers.new("A_ripple", 'DISPLACE')
disp.texture = tex
disp.texture_coords = 'OBJECT'
disp.texture_coords_object = drive
disp.direction = 'Z'
disp.mid_level = 0.5
disp.strength = 0.0022          # +-1.1 mm about the still level: enough slope to bend the gravel
disp.vertex_group = "A_surface"
sub = water.modifiers.new("Subdivision", 'SUBSURF')
sub.levels = 1
sub.render_levels = 1
# Circle of radius 0.05 in texture space over LOOP_FRAMES frames; frame LOOP_FIRST + LOOP_FRAMES
# lands back on the start pose, so the sequence loops with no seam. Keyed per frame, linear.
for i in range(LOOP_FRAMES + 1):
    a = 2 * math.pi * i / LOOP_FRAMES
    drive.location = (0.05 * math.cos(a) + 0.37, 0.05 * math.sin(a) + 0.11, 0.0)
    drive.keyframe_insert("location", frame=LOOP_FIRST + i)
for fc in drive.animation_data.action.fcurves if hasattr(drive.animation_data.action, "fcurves") else []:
    for k in fc.keyframe_points:
        k.interpolation = 'LINEAR'
try:
    for layer in drive.animation_data.action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    for k in fc.keyframe_points:
                        k.interpolation = 'LINEAR'
except AttributeError:
    pass


# ----------------------------------------------------------------------------- water material

def water_look(mat):
    nt = mat.node_tree
    b = principled(mat)
    set_in(b, "Base Color", (0.93, 0.985, 1.0, 1.0))
    set_in(b, "IOR", 1.333)
    set_in(b, "Roughness", 0.0)
    set_in(b, "Transmission Weight", 1.0)
    set_in(b, "Specular IOR Level", 0.5)
    out = nt.nodes["Material Output"]
    vol = new_node(nt, "ShaderNodeVolumeAbsorption")
    vol.inputs["Color"].default_value = (0.70, 0.93, 0.96, 1.0)
    vol.inputs["Density"].default_value = 7.0
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
set_in(b, "Base Color", (0.88, 0.96, 1.0, 1.0))
set_in(b, "Roughness", 0.32)
set_in(b, "IOR", 1.333)
set_in(b, "Transmission Weight", 1.0)
set_in(b, "Specular IOR Level", 0.5)
# Lifted a hair so the lip sits on the still water rather than inside it, and scaled so it reads
# as a meniscus that climbs the glass rather than as a hoop floating in the middle of the bowl.
ring.location.z = WATER_Z + 0.0006
ring.scale = (1.02, 1.02, 0.55)


# ----------------------------------------------------------------------------- caustics

bpy.data.objects["ENV_bowl_glass"].cycles.is_caustics_caster = True
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if o.name == "PRP_gravel" or o.name.startswith("PRP_pebble") or o.name.startswith("PRP_plant"):
        o.cycles.is_caustics_receiver = True
sc.cycles.caustics_reflective = True
sc.cycles.caustics_refractive = True
for ln in ("LGT_key",):
    bpy.data.objects[ln].data.cycles.is_caustics_light = True


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
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.55)   # scales wider than tall
    link(nt, tc, "Object", mapping, "Vector")
    vor = new_node(nt, "ShaderNodeTexVoronoi")
    vor.feature = 'F1'
    vor.inputs["Scale"].default_value = 520.0
    vor.inputs["Randomness"].default_value = 0.35
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
    bump.inputs["Strength"].default_value = 0.45
    bump.inputs["Distance"].default_value = 0.00035
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
    mul.inputs[1].default_value = 34.0
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


# ----------------------------------------------------------------------------- day rig touch-up

bounce = bpy.data.lights.new("LGT_bounce", 'AREA')
bounce.energy = 7.0
bounce.color = (1.0, 0.93, 0.85)
bounce.size = 2.0
bounce.shape = 'DISK'
bo = bpy.data.objects.new("LGT_bounce", bounce)
bpy.data.collections["WP_Rig"].objects.link(bo)
bo.location = (0.2, -1.0, -0.45)
bo.rotation_euler = (-1.25, 0.0, 0.2)   # pointing up at the underside of the bowl
bpy.data.lights["LGT_key"].energy = 125.0
bpy.data.lights["LGT_key"].size = 0.45    # a touch smaller: sharper surface highlights, still a soft shadow


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
add_light("LGT_moon", 'AREA', 26.0, (0.62, 0.74, 1.0), 0.9, (-0.55, 0.55, 1.35), (0.62, 0.0, -2.4), caustic=True)
# Desk lamp: warm, small, front-right and low, the one thing that keeps the scene from going flat.
add_light("LGT_lamp", 'AREA', 34.0, (1.0, 0.64, 0.33), 0.22, (0.62, -0.75, 0.42), (1.22, 0.0, 0.72), caustic=True)
# Dim blue bounce from below-front.
add_light("LGT_night_fill", 'AREA', 3.0, (0.55, 0.65, 1.0), 2.0, (0.0, -1.0, -0.3), (-1.3, 0.0, 0.0))

# Night world: a much darker, cooler sky.
w_day = sc.world
w_night = w_day.copy()
w_night.name = "WP_World_Night"
w_night.use_fake_user = True          # a world nothing uses yet is dropped on save without this
bg = w_night.node_tree.nodes["Background"]
bg.inputs["Strength"].default_value = 0.045
cr = w_night.node_tree.nodes["Color Ramp"].color_ramp
for el in cr.elements:
    r, g, b_, a = el.color
    el.color = (r * 0.45, g * 0.55, min(1.0, b_ * 0.95), a)
sc["wp_night_world"] = w_night.name
sc["wp_loop_first"] = LOOP_FIRST
sc["wp_loop_frames"] = LOOP_FRAMES

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT), copy=True)
print("A_LOOK_SAVED", os.path.abspath(OUT), flush=True)
