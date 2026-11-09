# ============================================================
# SG 手枪第一人称枪模：把原始模型加工成游戏用的 glb
#
# 原始模型：sg-handgun-download.glb（模型文件内标注作者 H.John、CC0，见 assets/LICENSES.md），
# 原始 FBX 和贴图在 sg-handgun/ 下。
# 运行：blender -b --factory-startup -P assets-src/models/gun/sg.py -- 输出.glb
# 然后：node tools/glb.mjs optimize 输出.glb assets/models/gun/sg.glb --texture-size 1024
#
# 原始模型单位是厘米，长轴是 Blender 的 X、枪口朝 +X、上方 +Z，物体名没有意义（Solid_xxx），
# 按位置和材质分成三个网格：
#   slide  套筒（开枪时往后坐）：材质 Frame_Back / Frame_Top / Frame_Front_Top / BackOfCylinder /
#          Side_Bar_001 / Side_Bar_002 / FrontSight / RearSight
#   mag    弹匣：原始模型只有底板（材质 Mag），这里补一个弹匣体（插在握把里，平时看不见），
#          原点放在弹匣顶部中间，换弹时整个抽出来
#   body   其余（套筒座、握把、扳机、击锤、枪管）
#
# 坐标约定和 gunmodel.js 的手枪一样：glTF 坐标 x 向右，y 向上，枪口朝 -z，
# 枪口中心在 (0, BORE_Y, MUZZLE_Z)，全长 LENGTH。另外导出空节点 muzzle 标出枪口位置。
# ============================================================
import bpy, bmesh, mathutils, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sg-handgun-download.glb')
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/sg.glb'

LENGTH = 0.205        # 全长（真枪约 0.2 米）
MUZZLE_Z = -0.135     # 枪口（glTF 坐标）
BORE_Y = 0.03         # 枪管轴线高度

SLIDE = {'Frame_Back', 'Frame_Top', 'Frame_Front_Top', 'BackOfCylinder',
         'Side_Bar_001', 'Side_Bar_002', 'FrontSight', 'RearSight'}
MAG = {'Mag'}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# 原始材质都是 HASHED（半透明抖动），改成不透明
for m in bpy.data.materials:
    m.blend_method = 'OPAQUE'

# 1. 每个零件按世界坐标拍平，按部件分组
# 绕 Z 转 90 度：枪口从 +X 转到 +Y（导出成 glTF 就是 -Z）
turn = mathutils.Matrix.Rotation(math.radians(90), 4, 'Z')
groups = {'body': [], 'slide': [], 'mag': []}
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    names = {m.name for m in o.data.materials if m}
    part = 'slide' if names & SLIDE else 'mag' if names & MAG else 'body'
    me = o.data.copy()
    me.transform(turn @ o.matrix_world)
    groups[part].append(me)

def merge(name, parts):
    bm = bmesh.new()
    mats = []
    for me in parts:
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

def bbox(me):
    cs = [v.co for v in me.vertices]
    return (mathutils.Vector([min(c[i] for c in cs) for i in range(3)]),
            mathutils.Vector([max(c[i] for c in cs) for i in range(3)]))

# 2. 补弹匣体：从底板顶面往上到套筒座下沿，沿握把的倾斜方向（按握把两侧的饰片 Mag_Detail 量）
mag = meshes['mag']
mn, mx = bbox(mag)
detail = [v.co for o in groups['body'] for v in o.vertices
          if any(m and m.name.startswith('Mag_Detail') for m in o.materials)]
lo = [c for c in detail if c.z < min(d.z for d in detail) + 1]
hi = [c for c in detail if c.z > max(d.z for d in detail) - 1]
slope = ((sum(c.y for c in hi) / len(hi)) - (sum(c.y for c in lo) / len(lo))) / \
        ((sum(c.z for c in hi) / len(hi)) - (sum(c.z for c in lo) / len(lo)))   # 往上每升 1，y 变多少
top_z = 4.0                                   # 套筒座下沿附近（厘米）
w = (mx.x - mn.x) * 0.6                       # 弹匣比底板窄
d = (mx.y - mn.y) * 0.8
cy = (mn.y + mx.y) / 2
bm = bmesh.new()
bm.from_mesh(mag)
z0 = mx.z
vs = [bm.verts.new((sx * w / 2, cy + (sy * d / 2) + slope * (z - z0), z))
      for z in (z0, top_z) for sy in (-1, 1) for sx in (-1, 1)]
for f in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]:
    bm.faces.new([vs[i] for i in f])
bm.to_mesh(mag)
bm.free()

# 3. 缩放平移：按整把枪的前后两端对齐（Blender 坐标里枪口要落在 y = -MUZZLE_Z、z = BORE_Y）
allv = [v.co for me in meshes.values() for v in me.vertices]
y0, y1 = min(c.y for c in allv), max(c.y for c in allv)   # y1 是枪口
scale = LENGTH / (y1 - y0)
# 枪口：套筒最前面 2% 的顶点的中心
tip = [v.co for v in meshes['slide'].vertices if v.co.y > y1 - (y1 - y0) * 0.02]
bore_x = (min(c.x for c in tip) + max(c.x for c in tip)) / 2
bore_z = (min(c.z for c in tip) + max(c.z for c in tip)) / 2
fit = (mathutils.Matrix.Translation((0, -MUZZLE_Z, BORE_Y))
       @ mathutils.Matrix.Scale(scale, 4)
       @ mathutils.Matrix.Translation((-bore_x, -y1, -bore_z)))
for me in meshes.values():
    me.transform(fit)

# 4. 建物体；弹匣原点挪到顶部中间（网格反向平移，物体放回原处）
col = bpy.data.collections.new('sg')
bpy.context.scene.collection.children.link(col)
for name, me in meshes.items():
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if name == 'mag':
        mn, mx = bbox(me)
        pivot = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))
        me.transform(mathutils.Matrix.Translation(-pivot))
        ob.location = pivot

muzzle = bpy.data.objects.new('muzzle', None)
muzzle.location = (0, -MUZZLE_Z, BORE_Y)
col.objects.link(muzzle)

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
