# ============================================================
# 水泥隔离墩（新泽西式）建模 + 烘焙（#50）
#   blender -b --factory-startup --python assets-src/maps/yard/props/jersey.py
#
# 长 2.4 米（Blender 里沿 x），底宽 0.56、高 0.84、顶宽 0.17，原点在底面中心；顶上两个钢筋吊环。
# 碰撞盒仍是地图里原来的 2.4 × 0.85 × 0.5 方块（底部两边各宽出 3 厘米，不影响走位）。
# 材质：Poly Haven 的脏混凝土（dirty_concrete，CC0）+ 程序生成的棱角磕碰（露出浅色碴口）、底部泥渍、雨水痕，烘焙成贴图。
# 输出 tools/out/props/jersey.glb，build.sh 压缩进 assets/maps/yard/props/。
# ============================================================
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from lib import Mesh

LEN = 2.4
TEX = int(os.environ.get('TEX', 1024))

# 半个断面（y ≥ 0），从底到顶：竖直的小脚 → 缓坡 → 陡坡 → 顶面倒角
HALF = [(0.28, 0.0), (0.28, 0.075), (0.175, 0.25), (0.092, 0.81), (0.07, 0.84)]

lib.reset()


def build():
    m = Mesh()
    bm = m.bm
    prof = HALF + [(-y, z) for y, z in reversed(HALF)]          # 完整断面（从右下绕到左下）
    ends = []
    for x in (-LEN / 2, LEN / 2):
        # 端头倒一点角：端面比本体小 1.5 厘米
        ends.append([bm.verts.new((x, y, z)) for y, z in prof])
    inner = []
    for x in (-LEN / 2 + 0.02, LEN / 2 - 0.02):
        inner.append([bm.verts.new((x, y, z)) for y, z in prof])
    # 端面略缩小
    for ring, x in ((ends[0], -LEN / 2), (ends[1], LEN / 2)):
        for v in ring:
            v.co.y *= 0.95
            v.co.z = v.co.z * 0.98
    n = len(prof)
    for a, b in ((ends[0], inner[0]), (inner[0], inner[1]), (inner[1], ends[1])):
        for i in range(n - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.faces.new(ends[0])
    bm.faces.new(list(reversed(ends[1])))
    bm.faces.new([ends[0][0], ends[0][-1], inner[0][-1], inner[0][0]])   # 底面（看不见，封口）
    bm.faces.new([inner[0][0], inner[0][-1], inner[1][-1], inner[1][0]])
    bm.faces.new([inner[1][0], inner[1][-1], ends[1][-1], ends[1][0]])
    # 吊环：顶上两个倒 U 形钢筋
    for cx in (-0.6, 0.6):
        r, top = 0.06, 0.84
        pts = [(cx - r, top - 0.01), (cx - r, top + 0.05)]
        for k in range(1, 6):
            t = math.pi - math.pi * k / 6
            pts.append((cx + r * math.cos(t), top + 0.05 + r * math.sin(t)))
        pts += [(cx + r, top + 0.05), (cx + r, top - 0.01)]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            m.cylinder((x0, 0, z0), (x1, 0, z1), 0.008, seg=6, caps=False)
    return m.to_object('jersey', sharp_deg=30)


ob = build()
lib.uv_unwrap(ob, margin=0.006)
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
ground = bpy.context.active_object

conc = lib.polyhaven('dirty_concrete')
mat = bpy.data.materials.new('jersey_proc')
ob.data.materials.append(mat)
N = lib.Nodes(mat)
out = N.n('ShaderNodeOutputMaterial')
bs = N.n('ShaderNodeBsdfPrincipled')
N.link(bs.outputs[0], out.inputs['Surface'])
geo = N.n('ShaderNodeNewGeometry')
tc = N.n('ShaderNodeTexCoord')
sep = N.n('ShaderNodeSeparateXYZ')
N.link(tc.outputs['Object'], sep.inputs[0])
z = sep.outputs['Z']
obj = tc.outputs['Object']

white = bpy.data.images.new('white', 4, 4)
white.generated_color = (1, 1, 1, 1)
ao_node = lib.image_node(N, white)
ao = ao_node.outputs['Color']

bev = N.n('ShaderNodeBevel', samples=8)
bev.inputs['Radius'].default_value = 0.025
dot = N.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
N.link(bev.outputs[0], dot.inputs[0]); N.link(geo.outputs['Normal'], dot.inputs[1])
edge_raw = N.bw(N.ramp(N.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.005, 0.08))
edge_node = lib.image_node(N, white)
edge = N.bw(edge_node.outputs['Color'])

# 混凝土：贴图一张覆盖 1.8 米，按物体坐标盒式投影；整体压暗一点，和场地里的水泥墩一致
ctex = N.image(conc['diff'], N.scaled_obj(1 / 1.8), box=True)
crough = N.image(conc['rough'], N.scaled_obj(1 / 1.8), colorspace='Non-Color', box=True)
base = N.mix(1.0, ctex.outputs['Color'], (0.62, 0.6, 0.57, 1), 'MULTIPLY')

# 磕碰：棱角上大块、细碎的噪声决定哪里掉了一块，露出浅色的碴口
chip_noise = N.noise(obj, 9.0, 8, 0.7)
chip = N.bw(N.ramp(N.math('ADD', N.math('MULTIPLY', edge, 1.1), N.math('MULTIPLY', N.math('SUBTRACT', chip_noise, 0.5), 1.2)), 0.6, 0.68))
color = N.mix(N.math('MULTIPLY', chip, 0.75), base, (0.55, 0.53, 0.5, 1))

# 底部泥渍（溅起来的土），往上渐淡
mud = N.bw(N.ramp(N.math('ADD', z, N.math('MULTIPLY', N.noise(obj, 6.0, 5, 0.6), 0.12)), 0.08, 0.3, (1, 1, 1, 1), (0, 0, 0, 1)))
color = N.mix(N.math('MULTIPLY', mud, 0.7), color, (0.2, 0.16, 0.12, 1))
# 雨水痕：竖向拉长的噪声，从顶往下
streak = N.bw(N.ramp(N.noise(N.scaled_obj((9.0, 9.0, 0.6)), 1.0, 5, 0.6), 0.5, 0.75))
color = N.mix(N.math('MULTIPLY', streak, 0.35), color, (0.12, 0.11, 0.1, 1))
# 缝里、吊环下面发暗
cav = N.bw(N.ramp(ao, 0.5, 0.95, (1, 1, 1, 1), (0, 0, 0, 1)))
color = N.mix(N.math('MULTIPLY', cav, 0.5), color, (0, 0, 0, 1), 'MULTIPLY')
# 钢筋吊环：生锈的铁（细圆柱，按高度判断：顶面以上就是吊环）
steel = N.math('GREATER_THAN', z, 0.845)
color = N.mix(steel, color, (0.16, 0.08, 0.04, 1))
N.link(color, bs.inputs['Base Color'])

rr = N.math('ADD', N.math('MULTIPLY', N.bw(crough.outputs['Color']), 0.3), 0.68)
rr = N.math('ADD', rr, N.math('MULTIPLY', mud, 0.08), clamp=True)
N.link(rr, bs.inputs['Roughness'])

# 盒式投影没法直接用法线贴图（切线方向不对），用颜色贴图的明暗当高度做凹凸；磕碰处再凹下去一块
bump = N.n('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.6
bump.inputs['Distance'].default_value = 0.004
N.link(N.math('SUBTRACT', N.bw(ctex.outputs['Color']), N.math('MULTIPLY', chip, 0.6)), bump.inputs['Height'])
N.link(bump.outputs[0], bs.inputs['Normal'])

ao_img = lib.new_image('jersey_ao', TEX // 2, data=True)
lib.bake(ob, mat, 'AO', ao_img, samples=24)
ao_node.image = ao_img
bpy.data.objects.remove(ground)
edge_img = lib.new_image('jersey_edge', TEX, data=True)
lib.bake_value(ob, mat, edge_raw, edge_img, samples=6)
edge_node.image = edge_img

diff = lib.bake(ob, mat, 'DIFFUSE', lib.new_image('jersey_diff', TEX), samples=1)
rough = lib.bake(ob, mat, 'ROUGHNESS', lib.new_image('jersey_rough', TEX, data=True), samples=1)
nor = lib.bake(ob, mat, 'NORMAL', lib.new_image('jersey_nor', TEX, data=True), samples=1)

ob.data.materials.clear()
ob.data.materials.append(lib.final_material('jersey', diff, rough, nor))
lib.export_glb([ob], os.path.join(lib.OUT, 'jersey.glb'))
print('三角形', sum(len(p.vertices) - 2 for p in ob.data.polygons))
