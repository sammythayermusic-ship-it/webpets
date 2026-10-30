"""Candidate A diagnostic: which Texture Coordinate / Geometry output varies per point in a SPOT
light's shader (so it can carry a projected pattern)? A plane under a spot, a checker from each
candidate output, one small render each.

    Blender -b -P assets/3d/scripts/a_diag_gobo.py -- <out_dir>
"""
import os
import sys
import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/wp-a-gobo"
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 16
sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = 256
sc.render.film_transparent = False
bpy.ops.mesh.primitive_plane_add(size=2.0)
plane = bpy.context.object
cam_data = bpy.data.cameras.new("c")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new("c", cam_data)
sc.collection.objects.link(cam)
cam.location = (0, 0, 3)
sc.camera = cam
lt = bpy.data.lights.new("spot", 'SPOT')
lt.energy = 200.0
lt.spot_size = 1.2
lt.use_nodes = True
ob = bpy.data.objects.new("spot", lt)
sc.collection.objects.link(ob)
ob.location = (0, 0, 1.0)
w = bpy.data.worlds.new("w")
sc.world = w


def build(source, output):
    nt = lt.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputLight")
    em = nt.nodes.new("ShaderNodeEmission")
    src = nt.nodes.new(source)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(src.outputs[output], sep.inputs[0])
    px = nt.nodes.new("ShaderNodeMath"); px.operation = 'DIVIDE'
    py = nt.nodes.new("ShaderNodeMath"); py.operation = 'DIVIDE'
    nt.links.new(sep.outputs["X"], px.inputs[0]); nt.links.new(sep.outputs["Z"], px.inputs[1])
    nt.links.new(sep.outputs["Y"], py.inputs[0]); nt.links.new(sep.outputs["Z"], py.inputs[1])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(px.outputs[0], comb.inputs["X"]); nt.links.new(py.outputs[0], comb.inputs["Y"])
    chk = nt.nodes.new("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 6.0
    nt.links.new(comb.outputs[0], chk.inputs["Vector"])
    nt.links.new(chk.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs[0])


for source, output in (("ShaderNodeTexCoord", "Normal"), ("ShaderNodeNewGeometry", "Incoming"),
                       ("ShaderNodeNewGeometry", "Position"), ("ShaderNodeNewGeometry", "Normal"),
                       ("ShaderNodeTexCoord", "Generated"), ("ShaderNodeTexCoord", "Object")):
    build(source, output)
    p = os.path.join(OUT, "gobo_%s_%s.png" % (source[10:], output))
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    import numpy as np
    im = bpy.data.images.load(p)
    px = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)[:, :, 0]
    bpy.data.images.remove(im)
    print("WP_GOBO %-14s %-10s std=%.4f mean=%.4f" % (source[10:], output, px.std(), px.mean()), flush=True)
