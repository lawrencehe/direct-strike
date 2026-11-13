# 弹药箱：把 Tripo 底模（tripo/model.glb，任务号 22fd052d，参考图 refer/box.png）修整成游戏用的母版。
#   blender -b --factory-startup --python assets-src/models/map/ammo-crate/build.py
# 然后由 assets-src/maps/yard/props/build.sh crate 压缩到 assets/maps/yard/props/ammo-crate.glb。
# 游戏里的碰撞写在 maps/yard.json 里（方块即可），模型只管显示。
#
# Tripo 出的是"碎片汤"：一个箱子拆成 200 多个不相连的小网格共用一张贴图。
# 这里删掉悬浮碎粒后全部合成一个网格，缩放到真实尺寸（长 0.6 米，宽高约 0.33），
# 原点放底面中心，Decimate 减面到 3000 左右（近处道具），贴图保留 Tripo 生成的 PBR。
import bpy, bmesh, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'tripo', 'model.glb')
OUT = os.path.join(HERE, 'ammo-crate.glb')

SCALE = 0.6          # bbox x 从 1.0 缩到 0.6 米（宽高随之 0.33/0.33）
TARGET_FACES = 3000   # 近处道具的目标面数
MIN_COMP_FACES = 6    # 少于这个面数的连通分量当碎粒删掉


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    src = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    mat = src.data.materials[0]
    bm = bmesh.new(); bm.from_mesh(src.data); bm.transform(src.matrix_world)
    bm.faces.ensure_lookup_table()

    # 连通分量 → 删碎粒（悬浮的小碎片）
    seen, comps, dropped = set(), [], 0
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            x = stack.pop(); comp.append(x)
            for e in x.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index); stack.append(g)
        comps.append(comp)
    drop = set()
    for comp in comps:
        if len(comp) < MIN_COMP_FACES:
            dropped += len(comp)
            drop.update(f.index for f in comp)
    if drop:
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in drop], context='FACES')
        print('DROP', dropped, 'faces')
    bm.faces.ensure_lookup_table()

    # 原点放底面中心（水平居中，z 从底面算起），再缩放到米
    lo = Vector([min(v.co[k] for v in bm.verts) for k in range(3)])
    hi = Vector([max(v.co[k] for v in bm.verts) for k in range(3)])
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for v in bm.verts:
        v.co = Vector((v.co.x - cx, v.co.y - cy, v.co.z - lo.z)) * SCALE

    me = bpy.data.meshes.new('ammo_crate')
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new('ammo_crate', me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.data.objects.remove(src)

    # Decimate 减面（不跨 UV 缝合线塌陷，保贴图不花）
    ratio = min(1.0, TARGET_FACES / max(1, len(me.polygons)))
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    mod.delimit = {'SEAM'}
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)

    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True,
                              export_apply=True, export_image_format='AUTO')
    print('PART ammo_crate', len(ob.data.polygons), 'faces')
    print('WROTE', OUT)


main()
