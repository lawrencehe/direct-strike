# 中央战斗平台：把 Tripo 底模（tripo/model.glb）修整成游戏用的母版。
#   blender -b --python assets-src/models/map/central-platform/build.py            # 输出 central-platform.glb（母版）
#   blender -b --python assets-src/models/map/central-platform/build.py -- debug   # 每个部件涂一种纯色，输出 debug.glb 检查拆分
# 然后由 assets-src/maps/yard/props/build.sh platform 压缩到 assets/maps/yard/props/central-platform.glb（#50）。
# 游戏里的碰撞（台面、台阶、掩体、栏杆）写在 maps/yard.json 里那个 model 对象下面的 proxy，见 docs/maps.md 的"道具模型"。
#
# Tripo 出的是一整块"碎片汤"：1100 多个互不相连的小网格共用一张贴图，没有按物体分开。
# 这里按每个碎片的包围盒中心落在哪个区域，把它归到一个部件（glb 里的一个子节点）：
#   base      台子、楼梯、栏杆、棚子的立柱、台下的油桶
#   canopy    伪装网棚顶
#   lamp_l / lamp_r   两根灯柱
#   cover     台上的沙袋墙和箱子（掩体）
# 拆成节点是为了游戏里能单独隐藏或换掉某一块；碎片边界不规整，单独拿出来复用到别处不够干净，
# 真要复用的道具（沙袋、箱子、灯柱）应该单独生成。
# 参考图前景里的枪也被生成进了模型（台子右前方地上），这里删掉。
import bpy, bmesh, sys, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'tripo', 'model.glb')
DEBUG = 'debug' in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else False
OUT = os.path.join(HERE, 'debug.glb' if DEBUG else 'central-platform.glb')

# 以下坐标都是 Tripo 原始单位（Blender 坐标，Z 向上，-Y 是楼梯一侧），模型宽 1.0
DECK_Z = -0.095        # 台面高度
GROUND_Z = -0.245      # 地面
SCALE = 9.5            # 缩放到米：台面高 1.43 m，占地 9.5 × 7.4 m，网棚顶约 3.8 m

def in_box(c, lo, hi):
    return all(lo[k] <= c[k] <= hi[k] for k in range(3))

LAMPS = {'lamp_l': (-0.40, 0.15), 'lamp_r': (0.335, 0.305)}

def classify(ctr, size, nfaces):
    x, y, z = ctr
    # 参考图前景的枪：台子右前方地上
    if x > 0.35 and y < -0.15 and z < DECK_Z - 0.03:
        return None
    for name, (lx, ly) in LAMPS.items():
        if abs(x - lx) < 0.045 and abs(y - ly) < 0.045 and z > DECK_Z + 0.02:
            return name
    if z > 0.12 and max(size[0], size[1]) > 0.0:
        return 'canopy'
    thin_post = max(size[0], size[1]) < 0.025 and size[2] > 0.06
    flat = size[2] < 0.012
    if (DECK_Z + 0.015 < z < 0.12 and -0.34 < x < 0.31 and -0.26 < y < 0.35
            and not thin_post and not flat and max(size) < 0.22):
        return 'cover'
    return 'base'

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    src = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    mat = src.data.materials[0]
    bm = bmesh.new(); bm.from_mesh(src.data); bm.transform(src.matrix_world)
    bm.faces.ensure_lookup_table()

    # 连通分量 → 部件
    groups = {}
    seen = set()
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
        vs = [v.co for ff in comp for v in ff.verts]
        lo = Vector([min(v[k] for v in vs) for k in range(3)])
        hi = Vector([max(v[k] for v in vs) for k in range(3)])
        name = classify((lo + hi) / 2, hi - lo, len(comp))
        groups.setdefault(name, []).extend(ff.index for ff in comp)

    dropped = len(groups.pop(None, []))
    print('DROP', dropped, 'faces')
    colors = {'base': (0.6, 0.6, 0.6, 1), 'canopy': (0.1, 0.7, 0.1, 1), 'lamp_l': (0.9, 0.1, 0.1, 1),
              'lamp_r': (0.9, 0.5, 0.1, 1), 'cover': (0.1, 0.3, 0.9, 1)}

    # 删掉枪以后的水平包围盒中心，作为原点
    kept = {i for idx in groups.values() for i in idx}
    xs = [v.co.x for i in kept for v in bm.faces[i].verts]
    ys = [v.co.y for i in kept for v in bm.faces[i].verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

    root = bpy.data.objects.new('central_platform', None)
    bpy.context.scene.collection.objects.link(root)
    uv = bm.loops.layers.uv.active
    for name, idx in sorted(groups.items()):
        keep = set(idx)
        nb = bm.copy()
        nb.faces.ensure_lookup_table()
        bmesh.ops.delete(nb, geom=[f for f in nb.faces if f.index not in keep], context='FACES')
        # 原点放在整座台子底面中心：水平居中，高度从地面算起，再缩放到米
        for v in nb.verts:
            v.co = Vector((v.co.x - cx, v.co.y - cy, v.co.z - GROUND_Z)) * SCALE
        me = bpy.data.meshes.new(name)
        nb.to_mesh(me); nb.free()
        if DEBUG:
            m = bpy.data.materials.new(name); m.diffuse_color = colors[name]
            m.use_nodes = True
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colors[name]
            me.materials.append(m)
        else:
            me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        print('PART', name, len(me.polygons), 'faces')
    bpy.data.objects.remove(src)
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY' and o is not root:
            bpy.data.objects.remove(o)

    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True,
                              export_apply=True, export_image_format='AUTO')
    print('WROTE', OUT)

main()
