# ============================================================
# M4 第一人称枪模：把原始模型加工成游戏用的 glb
#
# 原始模型：m4-download.glb（模型文件内标注作者 H.John、CC0，见 assets/LICENSES.md）
# 运行：blender -b --factory-startup -P assets-src/models/gun/m4.py -- 输出.glb
# 然后：node tools/glb.mjs optimize 输出.glb assets/models/gun/m4.glb --texture-size 2048
#
# 原始模型按零件分好了物体（Receiver、Stock、Scope、Magazine、BoltCarrier、ChargingHandle、Sling），
# 长轴是 Blender 的 Y、枪口朝 -Y、上方 +Z，全长只有 0.67 米（真枪约 0.84 米）。
# 游戏里的开枪、换弹动作是 weapon.js 用代码做的，所以合并成三个网格：
#   body  枪身（机匣、枪托、瞄具、拉机柄）
#   mag   弹匣，原点放在弹匣顶部中间，换弹时绕这里转
#   bolt  枪机框（从抛壳窗能看到，开枪时往后跳）
#   丢掉：枪背带 Sling（第一人称里挡画面）
#
# 坐标约定和 AK 一样（gunmodel.js）：glTF 坐标 x 向右，y 向上，枪口朝 -z。
# 握把放在和 AK 差不多的位置，这样手的位置、枪在画面里的摆法基本能沿用：
#   枪口中心在 (0, BORE_Y, MUZZLE_Z)，全长 LENGTH
# 另外导出一个空节点 muzzle 标出枪口位置，给枪口火焰用。
# ============================================================
import bpy, bmesh, mathutils, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'm4-download.glb')
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/m4.glb'

LENGTH = 0.84         # 全长（枪托拉开）
MUZZLE_Z = -0.42      # 枪口（glTF 坐标）
BORE_Y = 0.012        # 枪管轴线高度

PARTS = {             # 原始物体名前缀 → 部件名；不在表里的丢掉
    'Receiver': 'body', 'Stock': 'body', 'Scope': 'body', 'ChargingHandle': 'body',
    'Magazine': 'mag',
    'BoltCarrier': 'bolt',
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# 原始材质都是 HASHED（半透明抖动），改成不透明
for m in bpy.data.materials:
    m.blend_method = 'OPAQUE'

# 1. 每个零件按世界坐标拍平，按部件合并
# 绕 Z 转 180 度：枪口从 -Y 转到 +Y（导出成 glTF 就是 -Z）
turn = mathutils.Matrix.Rotation(math.radians(180), 4, 'Z')
groups = {}
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    part = next((p for k, p in PARTS.items() if o.name.startswith(k)), None)
    if not part:
        continue
    me = o.data.copy()
    me.transform(turn @ o.matrix_world)
    groups.setdefault(part, []).append(me)

def merge(name, parts):
    bm = bmesh.new()
    mats = []
    for me in parts:
        # 材质编号要换成合并后网格里的编号
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        bm.from_mesh(me)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for m in mats:
        out.materials.append(m)
    return out

meshes = {name: merge(name, parts) for name, parts in groups.items()}

# 2. 缩放平移：按枪身前后两端对齐（Blender 坐标里枪口要落在 y = -MUZZLE_Z、z = BORE_Y）
body = meshes['body']
ys = [v.co.y for v in body.vertices]
y0, y1 = min(ys), max(ys)               # y1 是枪口
scale = LENGTH / (y1 - y0)
tip = [v.co for v in body.vertices if v.co.y > y1 - (y1 - y0) * 0.01]   # 枪口最前面 1% 的顶点
bore_x = (min(c.x for c in tip) + max(c.x for c in tip)) / 2
bore_z = (min(c.z for c in tip) + max(c.z for c in tip)) / 2
fit = (mathutils.Matrix.Translation((0, -MUZZLE_Z, BORE_Y))
       @ mathutils.Matrix.Scale(scale, 4)
       @ mathutils.Matrix.Translation((-bore_x, -y1, -bore_z)))
for me in meshes.values():
    me.transform(fit)

# 3. 建物体；弹匣和枪机框的原点挪到合适的位置（网格反向平移，物体放回原处）
def bbox(me):
    cs = [v.co for v in me.vertices]
    return (mathutils.Vector([min(c[i] for c in cs) for i in range(3)]),
            mathutils.Vector([max(c[i] for c in cs) for i in range(3)]))

col = bpy.data.collections.new('m4')
bpy.context.scene.collection.children.link(col)
for name, me in meshes.items():
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    mn, mx = bbox(me)
    if name == 'mag':        # 弹匣顶部中间
        pivot = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))
    elif name == 'bolt':     # 枪机框中心
        pivot = (mn + mx) / 2
    else:
        continue
    me.transform(mathutils.Matrix.Translation(-pivot))
    ob.location = pivot

muzzle = bpy.data.objects.new('muzzle', None)
muzzle.location = (0, -MUZZLE_Z, BORE_Y)
col.objects.link(muzzle)

# 4. 删掉导入的其他东西，只导出这个集合
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
