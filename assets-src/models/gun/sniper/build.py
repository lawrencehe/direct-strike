# ============================================================
# 狙击枪第一人称枪模：把 Tripo 生成的底模加工成游戏用的 glb（#110）
#
# 原始模型：tripo/sniper-ac402a4d/model.glb（负责人用 Tripo 生成，见 assets/LICENSES.md）
# 运行：blender -b --factory-startup -P assets-src/models/gun/sniper/build.py -- 输出.glb
# 然后：node tools/glb.mjs optimize 输出.glb assets/models/gun/sniper.glb --texture-size 1024
#
# Tripo 出的是一整个网格（一张贴图），长轴是 Blender 的 X：枪托在 -X、枪口在 +X，上方 +Z，
# 拉机柄在 -Y 一侧（转过来以后是枪的右侧），全长 1.0。
# 游戏里开枪、换弹的动作是 weapon.js 用代码做的，所以按坐标把面拆成三个网格（和 AK、M4 一样）：
#   body  枪身（枪托、机匣、瞄准镜、枪管）
#   mag   弹匣（扳机护圈前面、枪身下沿以下的部分），原点放在弹匣顶部中间，换弹时绕这里转
#   bolt  拉机柄（机匣右侧伸出来的握球），开枪后拉栓时往后拉
#   丢掉：两脚架（第一人称里从护木下面垂下来挡画面）、游离顶点
# 下面的 *_BOX 都是原始模型坐标（量法：assets-src/models/gun/sniper/ 下渲染侧视图对网格读数）。
#
# 坐标约定和 AK、M4 一样（gunmodel.js）：glTF 坐标 x 向右，y 向上，枪口朝 -z；另导出空节点 muzzle 标出枪口。
# ============================================================
import bpy, bmesh, mathutils, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'tripo/sniper-ac402a4d/model.glb')
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/sniper.glb'

LENGTH = 1.15         # 全长（米），真枪 1.1 ~ 1.2
GRIP_Z = 0.12         # 握把（原始 X = GRIP_X）放到 glTF z = 0.12，和 AK、M4 的握把差不多远，手的位置好对
GRIP_X = -0.253
BORE_Y = 0.012        # 枪管轴线高度（glTF y）

# 原始坐标的框：(xmin, xmax, ymin, ymax, zmin, zmax)，按面的中心判断
MAG_BOX = (-0.168, -0.052, -1, 1, -1, -0.019)        # 弹匣：扳机护圈前、枪身下沿以下
BOLT_BOX = (-0.24, -0.185, -1, -0.029, -0.04, 0.014) # 拉机柄握球：机匣右侧（-Y）伸出来的部分
BIPOD_BOX = (0.17, 0.28, -1, 1, -1, -0.022)          # 两脚架：护木下面

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mat_world = src.matrix_world.copy()


def inside(c, b):
    return b[0] <= c.x <= b[1] and b[2] <= c.y <= b[3] and b[4] <= c.z <= b[5]


def extract(name, keep):
    """复制原网格，只留 keep(面中心) 为真的面，去掉没有面的顶点"""
    me = src.data.copy()
    me.name = name
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(mat_world)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    return me


meshes = {
    'mag': extract('mag', lambda c: inside(c, MAG_BOX)),
    'bolt': extract('bolt', lambda c: inside(c, BOLT_BOX)),
    'body': extract('body', lambda c: not (inside(c, MAG_BOX) or inside(c, BOLT_BOX) or inside(c, BIPOD_BOX))),
}

# 枪口：最前面 1% 的顶点的中心就是枪管轴线
vs = [v.co for v in meshes['body'].vertices]
x0, x1 = min(v.x for v in vs), max(v.x for v in vs)
tip = [v for v in vs if v.x > x1 - (x1 - x0) * 0.01]
bore_y = (min(v.y for v in tip) + max(v.y for v in tip)) / 2
bore_z = (min(v.z for v in tip) + max(v.z for v in tip)) / 2
scale = LENGTH / (x1 - x0)

# 绕 Z 转 90 度：枪口从 +X 转到 +Y（导出成 glTF 就是 -Z），原来的 -Y 侧转到 +X（枪的右侧）。
# 握把落在 Blender y = -GRIP_Z（glTF z = GRIP_Z），枪管轴线在 z = BORE_Y
turn = mathutils.Matrix.Rotation(math.radians(90), 4, 'Z')
fit = (mathutils.Matrix.Translation((0, -GRIP_Z, BORE_Y))
       @ mathutils.Matrix.Scale(scale, 4)
       @ turn
       @ mathutils.Matrix.Translation((-GRIP_X, -bore_y, -bore_z)))
for me in meshes.values():
    me.transform(fit)
muzzle_pos = fit @ mathutils.Vector((x1, bore_y, bore_z))


def bbox(me):
    cs = [v.co for v in me.vertices]
    return (mathutils.Vector([min(c[i] for c in cs) for i in range(3)]),
            mathutils.Vector([max(c[i] for c in cs) for i in range(3)]))


col = bpy.data.collections.new('sniper')
bpy.context.scene.collection.children.link(col)
for name, me in meshes.items():
    me.materials.clear()
    me.materials.append(src.data.materials[0])
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    mn, mx = bbox(me)
    if name == 'mag':        # 弹匣顶部中间
        pivot = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))
    elif name == 'bolt':     # 握球中心
        pivot = (mn + mx) / 2
    else:
        continue
    me.transform(mathutils.Matrix.Translation(-pivot))
    ob.location = pivot

muzzle = bpy.data.objects.new('muzzle', None)
muzzle.location = muzzle_pos
col.objects.link(muzzle)

for o in list(bpy.data.objects):
    if o.name not in col.objects:
        bpy.data.objects.remove(o, do_unlink=True)

for name, me in meshes.items():
    mn, mx = bbox(me)
    loc = bpy.data.objects[name].location
    print(f'RESULT: {name} 面 {len(me.polygons)}  范围(glTF) x {mn.x + loc.x:.3f}~{mx.x + loc.x:.3f}  '
          f'y {mn.z + loc.z:.3f}~{mx.z + loc.z:.3f}  z {-(mx.y + loc.y):.3f}~{-(mn.y + loc.y):.3f}')
print(f'RESULT: 枪口(glTF) z {-muzzle_pos.y:.3f} y {muzzle_pos.z:.3f}  缩放 {scale:.4f}')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_skins=False,
                          export_yup=True, export_apply=True)
print(f'RESULT: 导出 {OUT}')
