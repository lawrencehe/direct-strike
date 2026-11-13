# 油桶：把 Tripo 底模（tripo/model.glb，任务号 be421d3f，文字生成）修整成游戏用的母版（#98）。
#   blender -b --factory-startup --python assets-src/models/map/steel-drum/build.py
# 然后由 assets-src/maps/yard/props/build.sh drum 压缩到 assets/maps/yard/props/steel-drum.glb。
# 游戏里的碰撞仍是半径 0.3、高 0.9 的圆柱 / 方块（js/world.js 的 barrel、barrelLying），模型只管显示。
#
# 底模是一个完整的网格（没有碎片），自带 2048 的颜色 / ORM / 法线贴图。
# 这里只做：原点放底面中心，等比缩放到高 0.9 米（直径含桶箍约 0.61），Decimate 减面到 2000 左右。
import bpy, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'tripo', 'model.glb')
OUT = os.path.join(HERE, 'steel-drum.glb')

HEIGHT = 0.9          # 和地图里油桶的碰撞高度一样
TARGET_FACES = 2000   # 地图上有 7 个，面数压低一些


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.data.objects):
        if o is not ob:
            bpy.data.objects.remove(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = ob.data.name = 'steel_drum'

    me = ob.data
    lo = Vector([min(v.co[k] for v in me.vertices) for k in range(3)])
    hi = Vector([max(v.co[k] for v in me.vertices) for k in range(3)])
    s = HEIGHT / (hi.z - lo.z)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for v in me.vertices:
        v.co = Vector((v.co.x - cx, v.co.y - cy, v.co.z - lo.z)) * s

    # 减面：不跨 UV 缝塌陷，贴图不花
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = min(1.0, TARGET_FACES / max(1, len(me.polygons)))
    mod.delimit = {'SEAM', 'UV'}
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in me.polygons:
        p.use_smooth = True

    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True,
                              export_apply=True, export_image_format='AUTO')
    d = ob.dimensions
    print('PART steel_drum', len(me.polygons), 'faces', 'size', tuple(round(x, 3) for x in d))
    print('WROTE', OUT)


main()
