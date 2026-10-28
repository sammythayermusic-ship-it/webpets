"""Inspect wp_scene.blend: collections, objects, cameras, lights, materials. Read-only."""
import bpy, json, math
sc = bpy.context.scene
out = {"collections": {}, "cameras": {}, "lights": [], "materials": [], "scene": {}}
for c in bpy.data.collections:
    out["collections"][c.name] = [(o.name, o.type, len(o.data.vertices) if o.type=='MESH' else None,
        [m.name for m in o.data.materials] if o.type=='MESH' else None,
        [m.type for m in o.modifiers], o.parent.name if o.parent else None) for o in c.objects]
for o in bpy.data.objects:
    if o.type == 'CAMERA':
        cam = o.data
        out["cameras"][o.name] = {"type": cam.type, "ortho_scale": cam.ortho_scale, "lens": cam.lens,
            "sensor": cam.sensor_width, "loc": list(o.location), "rot": [math.degrees(a) for a in o.rotation_euler],
            "matrix_world": [list(r) for r in o.matrix_world], "clip": [cam.clip_start, cam.clip_end], "shift": [cam.shift_x, cam.shift_y]}
    if o.type == 'LIGHT':
        L = o.data
        out["lights"].append({"name": o.name, "type": L.type, "energy": L.energy, "color": list(L.color),
            "loc": list(o.location), "rot": [math.degrees(a) for a in o.rotation_euler],
            "size": getattr(L, "size", None), "angle": getattr(L, "angle", None), "spot_size": getattr(L, "spot_size", None)})
    if o.type == 'ARMATURE':
        out.setdefault("armatures", {})[o.name] = [(b.name, list(b.head_local), list(b.tail_local), b.parent.name if b.parent else None) for b in o.data.bones]
for m in bpy.data.materials:
    info = {"name": m.name, "users": m.users}
    if m.use_nodes:
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            info["bsdf"] = {k: (list(b.inputs[k].default_value) if hasattr(b.inputs[k].default_value, '__len__') else b.inputs[k].default_value)
                for k in ["Base Color","Roughness","Transmission Weight","IOR","Alpha","Metallic","Subsurface Weight","Coat Weight","Emission Strength"] if k in b.inputs}
            info["linked"] = [l.to_socket.name for l in m.node_tree.links if l.to_node == b]
        info["nodes"] = [n.bl_idname for n in m.node_tree.nodes]
    out["materials"].append(info)
w = sc.world
if w and w.use_nodes:
    bg = w.node_tree.nodes.get("Background")
    out["scene"]["world_bg"] = {"color": list(bg.inputs[0].default_value), "strength": bg.inputs[1].default_value} if bg else None
out["scene"]["frame_range"] = [sc.frame_start, sc.frame_end]
out["scene"]["custom"] = {k: (list(v) if hasattr(v, '__iter__') and not isinstance(v, str) else v) for k, v in sc.items() if not k.startswith('_')}
# fish rig: actions
for o in bpy.data.objects:
    ad = o.animation_data
    if ad and ad.action:
        out.setdefault("animated", []).append((o.name, ad.action.name, list(ad.action.frame_range)))
print("WP_JSON " + json.dumps(out, default=str))
