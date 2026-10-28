"""Candidate C: dump the scene so the plate/export scripts can be written against facts.

    Blender -b wp_scene.blend -P c_dump.py
"""
import bpy, json, math
sc = bpy.context.scene
out = {"collections": {}, "objects": {}, "cameras": {}, "lights": {}, "materials": [], "custom": {}}
for c in bpy.data.collections:
    out["collections"][c.name] = [o.name for o in c.objects]
for o in bpy.data.objects:
    d = {"type": o.type, "loc": [round(v, 5) for v in o.location], "rot": [round(math.degrees(v), 2) for v in o.rotation_euler],
         "scale": [round(v, 4) for v in o.scale], "parent": o.parent.name if o.parent else None,
         "colls": [c.name for c in o.users_collection], "hide_render": o.hide_render}
    if o.type == 'MESH':
        d["verts"] = len(o.data.vertices); d["polys"] = len(o.data.polygons)
        d["mats"] = [m.name if m else None for m in o.data.materials]
        d["mods"] = [(m.type, m.name) for m in o.modifiers]
        bb = [o.matrix_world @ __import__('mathutils').Vector(v) for v in o.bound_box]
        d["bbox_world"] = [[round(min(v[i] for v in bb), 5), round(max(v[i] for v in bb), 5)] for i in range(3)]
    if o.type == 'CAMERA':
        cam = o.data
        out["cameras"][o.name] = {"type": cam.type, "ortho_scale": cam.ortho_scale, "lens": cam.lens, "clip": [cam.clip_start, cam.clip_end],
                                  "shift": [cam.shift_x, cam.shift_y], "loc": d["loc"], "rot": d["rot"],
                                  "matrix_world": [[round(x, 6) for x in row] for row in o.matrix_world]}
    if o.type == 'LIGHT':
        l = o.data
        out["lights"][o.name] = {"type": l.type, "energy": l.energy, "color": list(l.color), "size": getattr(l, "size", None),
                                 "angle": getattr(l, "angle", None), "loc": d["loc"], "rot": d["rot"], "matrix_world": [[round(x, 6) for x in row] for row in o.matrix_world]}
    if o.type == 'ARMATURE':
        d["bones"] = [(b.name, [round(v,4) for v in b.head_local], [round(v,4) for v in b.tail_local]) for b in o.data.bones]
    out["objects"][o.name] = d
for m in bpy.data.materials:
    info = {"name": m.name, "nodes": []}
    if m.use_nodes:
        for n in m.node_tree.nodes:
            e = {"type": n.type, "name": n.name}
            if n.type == 'BSDF_PRINCIPLED':
                e["in"] = {k: (list(n.inputs[k].default_value) if hasattr(n.inputs[k].default_value, '__len__') else n.inputs[k].default_value)
                           for k in ("Base Color", "Roughness", "IOR", "Transmission Weight", "Alpha", "Subsurface Weight", "Coat Weight", "Metallic", "Emission Strength")}
            info["nodes"].append(e)
    out["materials"].append(info)
for k in sc.keys():
    try:
        out["custom"][k] = list(sc[k]) if hasattr(sc[k], '__iter__') and not isinstance(sc[k], str) else sc[k]
    except Exception as ex:
        out["custom"][k] = str(ex)
out["world"] = sc.world.name if sc.world else None
out["frame"] = [sc.frame_start, sc.frame_end, sc.render.fps]
out["render"] = {"res": [sc.render.resolution_x, sc.render.resolution_y], "engine": sc.render.engine}
print("WP_DUMP_BEGIN")
print(json.dumps(out, indent=1, default=str))
print("WP_DUMP_END")
