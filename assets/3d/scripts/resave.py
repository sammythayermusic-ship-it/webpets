import bpy, sys
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index("--")+1], copy=True)
