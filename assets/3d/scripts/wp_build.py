"""Helper geometry builders for the WebPets fish-bowl scene.

Pure data-API mesh construction: lathes (surfaces of revolution), lofted
tube bodies driven by a taper profile, and flat tapered ribbons for leaves
and fins. Metres, Z-up, radians.
"""

import math
import bpy
import bmesh
from mathutils import Vector, Matrix


# ---------------------------------------------------------------- utilities

def lerp_profile(profile, t, key=0):
    """Linear interpolation over a list of tuples, keyed on element `key`."""
    pts = sorted(profile, key=lambda p: p[key])
    if t <= pts[0][key]:
        return pts[0]
    if t >= pts[-1][key]:
        return pts[-1]
    for a, b in zip(pts, pts[1:]):
        if a[key] <= t <= b[key]:
            span = b[key] - a[key]
            f = 0.0 if span == 0 else (t - a[key]) / span
            return tuple(av + (bv - av) * f for av, bv in zip(a, b))
    return pts[-1]


def new_object(name, mesh, collection):
    ob = bpy.data.objects.new(name, mesh)
    collection.objects.link(ob)
    return ob


def get_collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def shade_smooth(ob):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True


def add_subsurf(ob, levels=2, render=None):
    m = ob.modifiers.get("Subdivision")
    if m is None:
        m = ob.modifiers.new("Subdivision", 'SUBSURF')
    m.levels = levels
    m.render_levels = levels if render is None else render
    return m


# ------------------------------------------------------------------- lathe

def lathe(name, profile, collection, segments=48, close_bottom=True,
          close_top=True):
    """Revolve a (r, z) polyline around the Z axis.

    A profile endpoint with r == 0 becomes a pole. Otherwise the end is left
    open (useful for a shell that will be solidified).
    """
    bm = bmesh.new()
    rings = []
    poles = {}

    for i, (r, z) in enumerate(profile):
        if r <= 1e-9:
            v = bm.verts.new((0.0, 0.0, z))
            poles[i] = v
            rings.append(None)
            continue
        ring = []
        for s in range(segments):
            a = 2.0 * math.pi * s / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)

    bm.verts.ensure_lookup_table()

    for i in range(len(profile) - 1):
        lo, hi = rings[i], rings[i + 1]
        if lo is None and hi is None:
            continue
        if lo is None:
            p = poles[i]
            for s in range(segments):
                bm.faces.new((p, hi[s], hi[(s + 1) % segments]))
        elif hi is None:
            p = poles[i + 1]
            for s in range(segments):
                bm.faces.new((lo[(s + 1) % segments], lo[s], p))
        else:
            for s in range(segments):
                t = (s + 1) % segments
                bm.faces.new((lo[s], lo[t], hi[t], hi[s]))

    # flat caps for open (r > 0) ends when requested
    if close_bottom and rings[0] is not None:
        bm.faces.new(list(reversed(rings[0])))
    if close_top and rings[-1] is not None:
        bm.faces.new(rings[-1])

    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    return ob


# -------------------------------------------------------------- tapered body

def tapered_body(name, sections, collection, segments=32, rings=18):
    """Deform a UV sphere into a body defined by cross-sections.

    `sections` is a list of (x, half_y, half_z, centre_z), ordered by x. The
    first and last entries should have half_y == half_z == 0 so the nose and
    tail close cleanly on the sphere's poles.
    """
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings,
                              radius=1.0)
    bmesh.ops.rotate(bm, verts=bm.verts,
                     matrix=Matrix.Rotation(math.pi / 2.0, 3, 'Y'),
                     cent=(0, 0, 0))

    x_min = sections[0][0]
    x_max = sections[-1][0]

    for v in bm.verts:
        ux = max(-1.0, min(1.0, v.co.x))
        x = x_min + (ux + 1.0) * 0.5 * (x_max - x_min)
        _, hy, hz, cz = lerp_profile(sections, x, key=0)
        radial = math.sqrt(max(0.0, 1.0 - ux * ux))
        if radial < 1e-6:
            v.co = Vector((x, 0.0, cz))
        else:
            ny = v.co.y / radial
            nz = v.co.z / radial
            v.co = Vector((x, ny * hy, nz * hz + cz))

    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    return ob


# ------------------------------------------------------------------- ribbon

def ribbon(name, spine, collection, thickness=0.0025, subsurf=2):
    """Build a flat tapered strip.

    `spine` is a list of (point, right_vector, half_width); the strip is two
    vertices per station, solidified afterwards so it gains a rounded rim.
    """
    bm = bmesh.new()
    rows = []
    for co, right, hw in spine:
        c = Vector(co)
        r = Vector(right).normalized() * hw
        rows.append((bm.verts.new(c - r), bm.verts.new(c + r)))

    for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
        bm.faces.new((a0, a1, b1, b0))

    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    if thickness:
        m = ob.modifiers.new("Solidify", 'SOLIDIFY')
        m.thickness = thickness
        m.offset = 0.0
        m.use_rim = True
    if subsurf:
        add_subsurf(ob, subsurf)
    return ob


def fan(name, outline, collection, thickness=0.003, subsurf=2):
    """Build a flat fan/lobe from a closed 2-D outline in the XZ plane."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0.0, z)) for x, z in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    m = ob.modifiers.new("Solidify", 'SOLIDIFY')
    m.thickness = thickness
    m.offset = 0.0
    m.use_rim = True
    if subsurf:
        add_subsurf(ob, subsurf)
    return ob


# ---------------------------------------------------------------- materials

def toy_material(name, color, roughness=0.45, sheen=0.25, sss=0.0,
                 sss_color=None, alpha=1.0, transmission=0.0,
                 emission=None, emission_strength=0.0,
                 metallic=0.0, specular=0.30, coat=0.0, coat_roughness=0.03):
    """A matte vinyl-toy Principled material with a gentle sheen.

    `metallic` and `specular` are parameters rather than constants because they were constants,
    and that was a real bug: every surface in the project was pinned to `Metallic = 0.0`, so the
    cage's 64 chrome wire bars, its axle and the bottle spout all rendered as grey *plastic* --
    and chrome wire is most of what says "cage". `specular` was likewise pinned at 0.30 against
    Blender's 0.5 default, i.e. 60% of physical dielectric specular on everything.

    Both default to the old values on purpose. Changing them globally would silently restyle every
    shipped fish and bowl frame; callers that want metal ask for it.
    """
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    # START FROM A CLEAN TREE on every build. This used to keep whatever was already there and only
    # re-point the terminal links, while `belly_gradient` and `fur_surface` unconditionally added
    # nodes -- so every rebuild appended another chain to the same material. `WP_ham_fur` had reached
    # 121 nodes: 33 texture-coordinate nodes, 20 colour ramps and 13 bumps, of which 31, 19 and 12
    # respectively were orphaned. It still rendered correctly, but only because the last chain built
    # was the one left linked. A build script that is not idempotent is a build script that is
    # slowly lying to you.
    nt.nodes.clear()
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(bsdf.outputs[0], out.inputs[0])

    def setv(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value

    setv("Base Color", (*color, 1.0))
    setv("Roughness", roughness)
    setv("Metallic", metallic)
    setv("IOR", 1.45)
    setv("Alpha", alpha)
    setv("Sheen Weight", sheen)
    setv("Sheen Roughness", 0.35)
    setv("Specular IOR Level", specular)
    if coat > 0.0:
        setv("Coat Weight", coat)
        setv("Coat Roughness", coat_roughness)
    if sss > 0.0:
        setv("Subsurface Weight", sss)
        setv("Subsurface Radius", (0.010, 0.006, 0.004))
        setv("Subsurface Scale", 0.020)
        if sss_color:
            setv("Subsurface Radius", sss_color)
    if transmission > 0.0:
        setv("Transmission Weight", transmission)
    if emission:
        setv("Emission Color", (*emission, 1.0))
        setv("Emission Strength", emission_strength)
    if alpha < 1.0:
        mat.blend_method = 'BLEND' if hasattr(mat, "blend_method") else None
    return mat


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return mat


def belly_gradient(mat, top_color, bottom_color, lo, hi, space_object=None):
    """Drive Base Color from an object-space Z ramp (top -> bottom).

    `space_object` is the fix for a real defect. TexCoord's "Object" output without one means each
    object's OWN local space, so a material shared across several parts samples a different space on
    every one of them. The hamster's ears (local z +/-0.0095) and tail (+/-0.0032) share the body's
    fur material, whose ramp is built for the body's +/-0.024 -- so they only ever sampled the
    middle of it and rendered a flat mid-tone that did not match the head they sit on. Pointing
    every part at ONE object, the rig, makes the gradient a property of the animal instead of a
    property of whichever mesh happens to be sampling it.
    """
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexCoord")
    if space_object is not None:
        tex.object = space_object
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    rng = nt.nodes.new("ShaderNodeMapRange")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tex.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], rng.inputs["Value"])
    rng.inputs["From Min"].default_value = lo
    rng.inputs["From Max"].default_value = hi
    nt.links.new(rng.outputs[0], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.10
    ramp.color_ramp.elements[0].color = (*bottom_color, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*top_color, 1.0)
    ramp.color_ramp.interpolation = 'EASE'
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return ramp


def fur_surface(mat, scale=240.0, strength=0.50, distance=0.0018, sheen=0.55, space_object=None):
    """Break a flat material up with a noise bump and give it a soft fresnel sheen.

    The hamster had no texture of any kind -- no noise, no bump, no UVs -- so it read as moulded
    plastic rather than an animal. This is not fur: real hair at this delivery size would be well
    under a pixel and would only add noise. It is a shallow bump at a wavelength you can actually
    see, plus the sheen that makes a furred silhouette catch light at its edge.

    `scale` is in the texture's coordinate units. Those are the RIG's object space, and TexCoord's
    object output is the inverse matrix INCLUDING scale, so a scale of 240 is one period per 1/240 of
    an object-space metre = 4.17 mm, which the rig's 1.18 turns into 4.92 mm of world -- about 3.6
    logical px at delivery. That part was always right.

    What was wrong was the amplitude. `Strength x Distance x` the fBm's own ~0.35 swing is the actual
    relief, and at the original 0.24 x 0.0008 that came to 0.067 mm against a 4.92 mm wavelength: a
    73:1 ratio, about 2.5 degrees of normal perturbation, one to three levels out of 255 on a mostly
    diffuse surface -- and then OpenImageDenoise removed the remainder, because a sub-1% high
    frequency ripple is precisely what a denoiser is built to erase. The graph was connected and the
    feature size was right; the hamster looked like plastic because the bump was two orders of
    magnitude below visibility. Visible bump wants nearer 10-30:1; these defaults give 15.6:1.
    """
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexCoord")
    if space_object is not None:
        tex.object = space_object
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    nt.links.new(tex.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.25
    return mat


# ------------------------------------------------------------------ render

def set_visible(show, hide):
    """Show/hide whole collections for render AND viewport."""
    for name in show:
        c = bpy.data.collections.get(name)
        if c:
            c.hide_render = False
            c.hide_viewport = False
    for name in hide:
        c = bpy.data.collections.get(name)
        if c:
            c.hide_render = True
            c.hide_viewport = True


def render_still(path, camera, res, samples=None, engine=None):
    sc = bpy.context.scene
    if engine:
        sc.render.engine = engine
    sc.camera = bpy.data.objects[camera]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    if samples and sc.render.engine == 'CYCLES':
        sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def alpha_stats(path):
    """Read back a rendered PNG and report real alpha coverage."""
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    a = px[:, :, 3]
    edge = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
    stats = {
        "size": [w, h],
        "alpha_min": float(a.min()), "alpha_max": float(a.max()),
        "frac_fully_transparent": float((a < 0.004).mean()),
        "frac_fully_opaque": float((a > 0.996).mean()),
        "border_alpha_max": float(edge.max()),
        "opaque_bbox": None,
    }
    ys, xs = np.nonzero(a > 0.02)
    if len(xs):
        stats["opaque_bbox"] = [int(xs.min()), int(ys.min()),
                                int(xs.max()), int(ys.max())]
        stats["subject_w"] = int(xs.max() - xs.min() + 1)
        stats["subject_h"] = int(ys.max() - ys.min() + 1)
    bpy.data.images.remove(img)
    return stats


def review_copy(src, dst, bg=(0.46, 0.48, 0.52)):
    """Composite an alpha render over flat grey so the art can be judged."""
    import numpy as np
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    a = px[:, :, 3:4]
    rgb = px[:, :, :3] * a + np.array(bg, dtype=np.float32) * (1.0 - a)
    out = bpy.data.images.new("wp_review", width=w, height=h, alpha=False)
    flat = np.concatenate([rgb, np.ones_like(a)], axis=2).ravel()
    out.pixels = flat.tolist()
    out.filepath_raw = dst
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    return dst


# ----------------------------------------------------------------- animation

def fcurves_of(ob):
    """Blender 5.x slotted actions: walk layers/strips/channelbags."""
    ad = ob.animation_data
    if not ad or not ad.action:
        return []
    handle = ad.action_slot.handle if ad.action_slot else None
    out = []
    for layer in ad.action.layers:
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                if handle is not None and cb.slot_handle != handle:
                    continue
                out.extend(cb.fcurves)
    return out


def set_interpolation(ob, mode='LINEAR'):
    n = 0
    for fc in fcurves_of(ob):
        for kp in fc.keyframe_points:
            kp.interpolation = mode
            n += 1
    return n


def clear_anim(ob):
    if ob.animation_data:
        ob.animation_data_clear()


def key_curve(ob, path, index, frames_values, interp='LINEAR'):
    """Key one property channel from {frame: value}."""
    for f, v in sorted(frames_values.items()):
        if index is None:
            setattr(ob, path, v)
        else:
            getattr(ob, path)[index] = v
        ob.keyframe_insert(data_path=path, index=(-1 if index is None else index),
                           frame=f)
    return len(frames_values)


# --------------------------------------------------------------- textured materials
#
# The cage had twelve materials and not one texture node between them, which is most of why it read
# as cheap next to the bowl. The bowl's gravel runs TWO Voronoi evaluations at the same scale -- one
# into a bump so every grain has its own relief, one into a colour ramp so every grain has its own
# brown -- and that single material plus a ten-colour pebble palette is the bulk of the difference.
# These are that trick, generalised.


def voronoi_scatter(mat, ramp_stops, scale=92.0, bump_strength=0.55, bump_distance=0.004,
                    roughness=0.85, world_space=True):
    """Per-cell colour and per-cell relief from two Voronoi evaluations.

    `world_space` is the part that matters for a scatter of loose objects. Object or Generated
    coordinates restart at every object's own origin, so 400 bedding chips would each sample the SAME
    slice of noise and come out identical -- the texture would vary across a chip but not between
    chips, which is the opposite of what bedding needs. Reading world position instead lays one field
    across the whole pile, so each chip picks up whatever cell it happens to be lying in.
    """
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    src = nt.nodes.new("ShaderNodeNewGeometry") if world_space else nt.nodes.new("ShaderNodeTexCoord")
    out_socket = src.outputs["Position"] if world_space else src.outputs["Object"]

    shape = nt.nodes.new("ShaderNodeTexVoronoi")
    shape.feature = 'DISTANCE_TO_EDGE'
    shape.inputs["Scale"].default_value = scale
    shape.inputs["Randomness"].default_value = 0.9
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    nt.links.new(out_socket, shape.inputs["Vector"])
    nt.links.new(shape.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    tone = nt.nodes.new("ShaderNodeTexVoronoi")
    tone.feature = 'F1'
    tone.inputs["Scale"].default_value = scale
    tone.inputs["Randomness"].default_value = 0.9
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(out_socket, tone.inputs["Vector"])
    nt.links.new(tone.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Red"], ramp.inputs["Fac"])
    els = ramp.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    for k, (pos, col) in enumerate(ramp_stops):
        e = els[0] if k == 0 else els.new(pos)
        e.position = pos
        e.color = (*col, 1.0)
    ramp.color_ramp.interpolation = 'LINEAR'
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def wood_grain(mat, base, dark, scale=18.0, stretch=14.0, bump_strength=0.30):
    """Stretched noise into base colour and bump: grain running along the plank's long axis.

    The stretch is the whole thing -- wood is anisotropic and an unstretched noise reads as stone.
    Scaling the coordinate down along X by `stretch` before sampling makes the cells long and thin.
    """
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / stretch, 1.0, 1.0)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.55
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.30, (*dark, 1.0)
    els[1].position, els[1].color = 0.68, (*base, 1.0)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.0016
    nt.links.new(tex.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# --------------------------------------------------------------- shared primitives
#
# These moved here from wp_cage.py when the terrarium needed them too. They are generic geometry
# with no habitat in them, and duplicating a bevel helper across two habitats is how the two quietly
# stop matching.

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
        # Not optional. The tub walls are WALL=0.010 thick and asked for a 0.006 bevel, which needs
        # 0.012 of room -- the two opposing bevels crossed and produced inverted, self-intersecting
        # faces down the full height of all four walls. Clamping costs nothing anywhere else.
        clamp_overlap=True,
    )
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
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
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    return ob


def sphere(name, rx, ry, rz, collection, segments=24, rings=14):
    """An ellipsoid. Ears, eyes, paws and nose are all one of these with different radii."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector((rx, ry, rz)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    shade_smooth(ob)
    return ob


def torus(name, major, minor, collection, major_seg=40, minor_seg=10):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=major_seg, radius=major)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object(name, me, collection)
    sk = ob.modifiers.new("Skin", 'SKIN')
    # Without this the ring renders FACETED while every bar built by bar() renders smooth, because
    # bar() sets it and this did not. The wheel rim is the one shape in the cage that has to be a
    # clean circle, and at 67 px across it was the only visibly polygonal thing in frame. The
    # shade_smooth() call below cannot cover for it: the base mesh is an edge loop with no polygons
    # at all, so it is a no-op here.
    sk.use_smooth_shade = True
    for v in ob.data.skin_vertices[0].data:
        v.radius = (minor, minor)
    add_subsurf(ob, 2)
    shade_smooth(ob)
    return ob


# ----------------------------------------------------------------------- materials
