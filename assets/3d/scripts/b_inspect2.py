"""Second look: fish and bowl geometry numbers needed to plan the live export. Read-only."""
import bpy, json
from mathutils import Vector
sc = bpy.context.scene
sc.frame_set(1)
dg = bpy.context.evaluated_depsgraph_get()
out = {}
def bbox(o, world=True):
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    if world:
        pts = [ev.matrix_world @ v.co for v in me.vertices]
    else:
        pts = [v.co.copy() for v in me.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    n = len(me.vertices); f = len(me.polygons)
    ev.to_mesh_clear()
    return {"min": list(mn), "max": list(mx), "verts": n, "faces": f}
for name in ["HERO_fish_body","HERO_fish_tail","HERO_fish_mouth","HERO_fish_eye_l","HERO_fish_eye_r","HERO_fish_fin_dorsal","HERO_fish_fin_anal","HERO_fish_fin_pec_l","HERO_fish_fin_pec_r","HERO_fish_eyeglint_l","ENV_bowl_glass","ENV_bowl_water","ENV_waterline","PRP_gravel","PRP_stand_ring","PRP_stand_leg_0","PRP_plant_blade_0","PRP_pebble_00","ENV_shadow_catcher","PRP_memorial_post","PRP_memorial_flag"]:
    o = bpy.data.objects[name]
    out[name] = {"world": bbox(o), "local": bbox(o, False), "loc": list(o.location), "rot": list(o.rotation_euler), "scale": list(o.scale),
                 "matrix_world": [list(r) for r in o.matrix_world], "parent": o.parent.name if o.parent else None,
                 "mods": [(m.type, getattr(m,'levels',None), getattr(m,'thickness',None), getattr(m,'strength',None)) for m in o.modifiers]}
for name in ["RIG_fish_root","RIG_fish_tail"]:
    o = bpy.data.objects[name]
    out[name] = {"loc": list(o.location), "rot": list(o.rotation_euler), "scale": list(o.scale), "matrix_world": [list(r) for r in o.matrix_world], "parent": o.parent.name if o.parent else None}
# fish body material ramp
m = bpy.data.materials["WP_fish_body"]
nt = m.node_tree
for n in nt.nodes:
    if n.bl_idname == 'ShaderNodeMapRange':
        out["body_ramp_range"] = [n.inputs["From Min"].default_value, n.inputs["From Max"].default_value]
    if n.bl_idname == 'ShaderNodeValToRGB':
        out["body_ramp"] = {"interp": n.color_ramp.interpolation, "elements": [(e.position, list(e.color)) for e in n.color_ramp.elements]}
    if n.bl_idname == 'ShaderNodeTexCoord':
        out["body_ramp_space_object"] = n.object.name if n.object else None
# gravel material nodes
g = bpy.data.materials["WP_gravel"]
out["gravel_nodes"] = [(n.bl_idname, n.name, {k.name: (list(k.default_value) if hasattr(k.default_value,'__len__') else k.default_value) for k in n.inputs if hasattr(k,'default_value')}) for n in g.node_tree.nodes]
# glass profile check: is the glass open at top?
gl = bpy.data.objects["ENV_bowl_glass"]
me = gl.data
zs = sorted(set(round(v.co.z,4) for v in me.vertices))
out["glass_z_levels"] = [zs[0], zs[-1], len(zs)]
out["glass_edges_boundary"] = sum(1 for e in me.edges if len([p for p in me.polygons if e.index in p.edge_keys and False])==0) if False else None
# water
w = bpy.data.objects["ENV_bowl_water"]
out["water_z"] = [min(v.co.z for v in w.data.vertices), max(v.co.z for v in w.data.vertices)]
out["pebble_materials"] = sorted(set(o.data.materials[0].name for o in bpy.data.objects if o.name.startswith("PRP_pebble")))
out["pebble_colors"] = {mn: list(bpy.data.materials[mn].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value) for mn in out["pebble_materials"]}
print("WP_JSON " + json.dumps(out, default=str))
