# ============================================================
# AK47 第一人称枪模：把 Sketchfab 下载的原始模型加工成游戏用的 glb
#
# 原始模型：ak47-sketchfab.glb，作者 wburton，CC BY 4.0（署名见 assets/LICENSES.md）
# 运行：blender -b --factory-startup -P assets-src/models/gun/ak47.py -- 输出.glb
# 然后：node tools/glb.mjs optimize 输出.glb assets/models/gun/ak47.glb --texture-size 2048
#
# 原始模型是一整块蒙皮网格，每个零件绑在一根骨骼上，还带 9 段骨骼动画。
# 游戏里的开枪、换弹动作是 weapon.js 用代码做的（枪身后坐、拉机柄后跳、弹匣拔出），
# 所以这里把零件拆成独立的网格，去掉骨骼和动画：
#   body  枪身（骨骼 Bone_00）
#   mag   弹匣（Bone.001），原点放在弹匣顶部中间，换弹时绕这里转
#   bolt  拉机柄（Bone.003）
#   丢掉：备用弹匣（Bone.002，原作者换弹动画用的第二个弹匣）和两颗子弹（Bone.004、Bone.005）
#
# 坐标和尺寸对齐原来代码拼的 AK（gunmodel.js 的 buildAK），这样手的位置、枪口火焰、
# 换弹动作的参数基本能沿用：
#   glTF 坐标：x 向右，y 向上，枪口朝 -z
#   枪口中心在 (0, 0.012, -0.53)，枪托尾部在 z = 0.428（全长 0.958）
# 另外导出一个空节点 muzzle 标出枪口位置，给枪口火焰用。
# ============================================================
import bpy, bmesh, mathutils, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ak47-sketchfab.glb')
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/ak47.glb'

MUZZLE_Z = -0.53      # 枪口（glTF 坐标）
STOCK_Z = 0.428       # 枪托尾部
BORE_Y = 0.012        # 枪管轴线高度

PARTS = {             # 骨骼名 → 部件名；不在表里的零件丢掉
    'Bone_00': 'body',
    'Bone.001_02': 'mag',
    'Bone.003_03': 'bolt',
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
src = next(o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups)
arm.animation_data_clear()
for pb in arm.pose.bones:
    pb.matrix_basis.identity()

# 1. 把蒙皮网格按静止姿势"拍平"成普通网格（世界坐标）
dg = bpy.context.evaluated_depsgraph_get()
flat = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
flat.transform(src.matrix_world)

# 原始模型的长轴是 Blender 的 Z、枪口朝 -Z、下方是 -Y。绕 X 轴转 90 度后：
# 枪口朝 +Y（导出成 glTF 就是 -Z），上方是 +Z
flat.transform(mathutils.Matrix.Rotation(math.radians(90), 4, 'X'))

# 2. 每个顶点归给权重最大的骨骼
names = [g.name for g in src.vertex_groups]
owner = {}
for v in flat.vertices:
    if v.groups:
        g = max(v.groups, key=lambda g: g.weight)
        owner[v.index] = names[g.group]

def part_mesh(bone):
    bm = bmesh.new()
    bm.from_mesh(flat)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if owner.get(v.index) != bone], context='VERTS')
    me = bpy.data.meshes.new(PARTS[bone])
    bm.to_mesh(me)
    bm.free()
    for m in src.data.materials:       # bmesh 只带材质编号，材质本身要重新挂上
        me.materials.append(m)
    return me

meshes = {name: part_mesh(bone) for bone, name in PARTS.items()}

# 3. 缩放平移：按枪身的枪口和枪托尾部对齐
body = meshes['body']
ys = [v.co.y for v in body.vertices]
y0, y1 = min(ys), max(ys)               # y1 是枪口
scale = (STOCK_Z - MUZZLE_Z) / (y1 - y0)
tip = [v.co for v in body.vertices if v.co.y > y1 - (y1 - y0) * 0.01]   # 枪口最前面 1% 的顶点
bore_x = (min(c.x for c in tip) + max(c.x for c in tip)) / 2
bore_z = (min(c.z for c in tip) + max(c.z for c in tip)) / 2
# Blender 坐标里枪口要落在 y = -MUZZLE_Z、z = BORE_Y
fit = (mathutils.Matrix.Translation((0, -MUZZLE_Z, BORE_Y))
       @ mathutils.Matrix.Scale(scale, 4)
       @ mathutils.Matrix.Translation((-bore_x, -y1, -bore_z)))
for me in meshes.values():
    me.transform(fit)

# 4. 建物体；弹匣和拉机柄的原点挪到合适的位置（网格反向平移，物体放回原处）
def bbox(me):
    cs = [v.co for v in me.vertices]
    return (mathutils.Vector([min(c[i] for c in cs) for i in range(3)]),
            mathutils.Vector([max(c[i] for c in cs) for i in range(3)]))

col = bpy.data.collections.new('ak47')
bpy.context.scene.collection.children.link(col)
for name, me in meshes.items():
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if name == 'mag':        # 弹匣顶部中间
        mn, mx = bbox(me)
        pivot = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))
    elif name == 'bolt':     # 拉机柄中心
        mn, mx = bbox(me)
        pivot = (mn + mx) / 2
    else:
        continue
    me.transform(mathutils.Matrix.Translation(-pivot))
    ob.location = pivot

muzzle = bpy.data.objects.new('muzzle', None)
muzzle.location = (0, -MUZZLE_Z, BORE_Y)
col.objects.link(muzzle)

# 5. 删掉导入的其他东西，只导出这个集合
for o in list(bpy.data.objects):
    if o.name not in col.objects:
        bpy.data.objects.remove(o, do_unlink=True)

for name, me in meshes.items():
    mn, mx = bbox(me)
    loc = bpy.data.objects[name].location
    print(f'RESULT: {name} 顶点 {len(me.vertices)}  范围(glTF) x {mn.x + loc.x:.3f}~{mx.x + loc.x:.3f}  '
          f'y {mn.z + loc.z:.3f}~{mx.z + loc.z:.3f}  z {-(mx.y + loc.y):.3f}~{-(mn.y + loc.y):.3f}')
print(f'RESULT: 缩放 {scale:.6f}')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_skins=False,
                          export_yup=True, export_apply=True)
print(f'RESULT: 导出 {OUT}')
