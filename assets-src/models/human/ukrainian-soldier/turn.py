# 把模型绕竖轴转 180°，删掉原带的空动画
import bpy,sys,math
i,o=sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=i)
for ob in bpy.data.objects:
  if ob.parent is None:
    ob.rotation_mode='XYZ'; ob.rotation_euler.z+=math.pi
  if ob.animation_data: ob.animation_data.action=None; [ob.animation_data.nla_tracks.remove(t) for t in list(ob.animation_data.nla_tracks)]
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=o, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_image_format='AUTO', export_force_sampling=False)
print('RESULT ok')
