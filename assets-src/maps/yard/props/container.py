# ============================================================
# 集装箱（20 尺干货箱）建模 + 烘焙（#50）
#   blender -b --factory-startup --python assets-src/maps/yard/props/container.py
#
# 外形和碰撞盒一样大：长 6、宽 2.44、高 2.6 米（js/world.js 的 C_L / C_W / C_H），原点在底面中心，
# Blender 里长边沿 x，门在 +x 端；导出 glb 后在游戏里长边沿 x、门朝 +x。
# 材质：油漆（按地图里的颜色）+ Poly Haven 的锈（rust_coarse_01，CC0）+ 程序生成的锈斑、雨水锈痕、底部脏污、边角掉漆，
# 烘焙成贴图。几何和法线、粗糙度所有颜色共用，颜色贴图每种颜色一张（箱号也画在上面）。
# 输出：tools/out/props/container.glb（带第一种颜色）和 container_<颜色>_diff.png，build.sh 再压缩进 assets/maps/yard/props/。
# ============================================================
import bpy, sys, os, json, math, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from lib import Mesh, corrugation

L, W, H = 6.0, 2.44, 2.6
TEX = int(os.environ.get('TEX', 2048))   # 烘焙贴图边长（调试时 TEX=512 跑得快）
POST = 0.16                 # 角柱截面
CAST = (0.178, 0.162, 0.118)  # 角件（长、宽、高）

# 地图里用到的颜色和箱号：每种颜色烘一张颜色贴图，箱号取这种颜色第一个箱子的
yard = json.load(open(os.path.join(lib.ROOT, 'maps/yard.json')))
VARIANTS = {}
for o in yard['objects']:
    if o['type'] == 'container':
        VARIANTS.setdefault(o['color'].lstrip('#').lower(), o.get('label', ''))

lib.reset()


# ---------- 几何 ----------
def build():
    m = Mesh()
    x0, x1, y0, y1 = -L / 2, L / 2, -W / 2, W / 2

    # 角柱：四个角从底角件到顶角件
    for x in (x0, x1 - POST):
        for y in (y0, y1 - POST):
            m.box(x, y, CAST[2], x + POST, y + POST, H - CAST[2], skip=('-z', '+z'))
    # 角件：八个角稍微凸出一点
    e = 0.006
    for x in (x0 - e, x1 - CAST[0] + e):
        for y in (y0 - e, y1 - CAST[1] + e):
            for z in (0, H - CAST[2]):
                m.box(x, y, z, x + CAST[0], y + CAST[1], z + CAST[2])

    # 底梁、顶梁（两条长边）
    for y in (y0, y1 - 0.1):
        m.box(x0 + CAST[0], y, 0.0, x1 - CAST[0], y + 0.1, 0.16)                  # 底侧梁
        m.box(x0 + CAST[0], y + 0.01, H - 0.1, x1 - CAST[0], y + 0.09, H, skip=('-z',))  # 顶侧梁
    # 叉车槽：底侧梁上两个方口（凹进去的深色框）
    for cx in (-1.0, 1.0):
        for y, s in ((y0, -1), (y1, 1)):
            yy = y - s * 0.004
            m.box(cx - 0.18, min(yy, yy + s * 0.012), 0.02, cx + 0.18, max(yy, yy + s * 0.012), 0.14)
    # 两端的上下横梁
    for x, top_h, bot_h in ((x0, 0.12, 0.16), (x1 - 0.14, 0.22, 0.16)):
        m.box(x, y0 + CAST[1], H - top_h, x + 0.14, y1 - CAST[1], H, skip=('-z',))
        m.box(x, y0 + CAST[1], 0.0, x + 0.14, y1 - CAST[1], bot_h)

    # 侧板：竖向梯形瓦楞（截面沿 x），外表面在 y=±(W/2-0.012)，向里凹 3.6 厘米
    prof = corrugation(L - 2 * POST, 0.278, 0.036, 0.072, 0.07, start=x0 + POST)
    for side in (-1, 1):
        yo = side * (W / 2 - 0.012)
        pts = [(p, yo - side * q) for p, q in prof]
        m.sheet(pts, 0.16, H - 0.1, 'z', (0, side, 0))
    # 前端板（-x 端）：瓦楞截面沿 y
    prof = corrugation(W - 2 * POST, 0.23, 0.035, 0.06, 0.06, start=y0 + POST)
    xo = x0 + 0.012
    m.sheet([(xo + q, p) for p, q in prof], 0.16, H - 0.12, 'z', (-1, 0, 0))   # 截面沿 y，所以 (x, y) = (深度, p)
    # 顶板：很浅的横向瓦楞，低于顶梁 1 厘米
    prof = corrugation(L - 2 * CAST[0], 0.6, 0.012, 0.25, 0.25, start=x0 + CAST[0])
    zt = H - 0.012
    m.sheet([(p, zt - q) for p, q in prof], y0 + 0.08, y1 - 0.08, 'y', (0, 0, 1))
    # 底面（看不见，只为封口不漏光）
    m.box(x0 + 0.1, y0 + 0.1, 0.02, x1 - 0.1, y1 - 0.1, 0.021, skip=('+z', '-x', '+x', '-y', '+y'))

    # ---------- 门（+x 端）：两扇门板，横向压筋，四根锁杆 ----------
    xd = x1 - 0.03            # 门板外表面
    gap = 0.008
    leaf_z0, leaf_z1 = 0.16, H - 0.22
    for side in (-1, 1):
        ya, yb = (gap, W / 2 - POST) if side > 0 else (-(W / 2 - POST), -gap)
        m.box(xd - 0.03, ya, leaf_z0, xd, yb, leaf_z1, skip=('-x',))
        # 横向压筋：门板上四条凸起的横条
        for k in range(4):
            zc = leaf_z0 + (leaf_z1 - leaf_z0) * (k + 0.5) / 4
            m.box(xd - 0.002, ya + 0.06, zc - 0.17, xd + 0.018, yb - 0.06, zc + 0.17, skip=('-x',))
        # 铰链：门外沿四个
        yo = W / 2 - POST if side > 0 else -(W / 2 - POST)
        for zc in (0.45, 1.05, 1.65, 2.2):
            m.box(xd, yo - 0.05, zc - 0.07, xd + 0.05, yo + 0.05, zc + 0.07)
        # 锁杆：每扇门两根，上下有锁扣，中间三个导向卡，一个把手
        for frac in (0.22, 0.72):
            yb_ = side * (gap + (W / 2 - POST - gap) * frac)
            xb = xd + 0.045
            m.cylinder((xb, yb_, 0.06), (xb, yb_, H - 0.06), 0.0135, seg=8)
            for zc in (0.08, H - 0.08):                       # 锁扣（凸轮座）
                m.box(xb - 0.03, yb_ - 0.05, zc - 0.05, xb + 0.03, yb_ + 0.05, zc + 0.05)
            for zc in (0.55, 1.4, 2.05):                       # 导向卡
                m.box(xd, yb_ - 0.035, zc - 0.03, xb + 0.022, yb_ + 0.035, zc + 0.03)
            hz = 1.1                                           # 把手：从锁杆朝门中缝伸
            d = -side * 0.32
            m.cylinder((xb, yb_, hz), (xb + 0.04, yb_ + d * 0.15, hz), 0.012, seg=6)
            m.cylinder((xb + 0.04, yb_ + d * 0.15, hz), (xb + 0.04, yb_ + d, hz), 0.012, seg=6)
            m.box(xd, yb_ + d - 0.04, hz - 0.06, xb + 0.06, yb_ + d + 0.04, hz + 0.06)   # 把手卡座
    return m.to_object('container')


ob = build()
lib.uv_unwrap(ob, margin=0.003)

# AO 要有地面才对：烘 AO 时临时垫一块地
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
ground = bpy.context.active_object

# ---------- 程序材质（只用来烘焙） ----------
rust = lib.polyhaven('rust_coarse_01')
paint_ref = lib.polyhaven('rusty_painted_metal')

mat = bpy.data.materials.new('container_proc')
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

# AO（先放一张白图，烘完 AO 再换上）
ao_node = N.n('ShaderNodeTexImage')
ao_node.image = bpy.data.images.new('white', 4, 4)
ao_node.image.generated_color = (1, 1, 1, 1)
uvn = N.n('ShaderNodeUVMap')
N.link(uvn.outputs[0], ao_node.inputs['Vector'])
ao = ao_node.outputs['Color']

# 边：倒角法线和真实法线的差，越大越是棱角
bev = N.n('ShaderNodeBevel', samples=8)
bev.inputs['Radius'].default_value = 0.015
dot = N.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
N.link(bev.outputs[0], dot.inputs[0]); N.link(geo.outputs['Normal'], dot.inputs[1])
edge_raw = N.bw(N.ramp(N.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.01, 0.12))
# 倒角节点要发很多光线，很慢：先单独烘成一张图（edge_img），后面的材质只读这张图
edge_node = lib.image_node(N, bpy.data.images['white'])
edge = N.bw(edge_node.outputs['Color'])

big = N.bw(N.ramp(N.noise(tc.outputs['Object'], 0.9, 6, 0.55), 0.6, 0.74))       # 大块锈斑
fine = N.noise(tc.outputs['Object'], 14.0, 10, 0.7)                                 # 细碎的边界
bottom = N.bw(N.ramp(z, 0.0, 0.55, (1, 1, 1, 1), (0, 0, 0, 1)))                    # 底部 0.55 米
cav = N.bw(N.ramp(ao, 0.55, 0.95, (1, 1, 1, 1), (0, 0, 0, 1)))                     # 缝隙、凹槽

acc = N.math('ADD', N.math('MULTIPLY', edge, 0.9), N.math('MULTIPLY', big, 0.6))
acc = N.math('ADD', acc, N.math('MULTIPLY', bottom, 0.8))
acc = N.math('ADD', acc, N.math('MULTIPLY', cav, 0.45))
acc = N.math('ADD', acc, N.math('MULTIPLY', N.math('SUBTRACT', fine, 0.5), 0.9))
rust_mask = N.bw(N.ramp(acc, 0.55, 0.72))

# 雨水锈痕：x、y 方向细、z 方向拉长的噪声，越往上越浓（从顶上往下流）
streak_coords = N.scaled_obj((7.0, 7.0, 0.35))
streak = N.bw(N.ramp(N.noise(streak_coords, 1.0, 6, 0.6), 0.52, 0.75))
streak = N.math('MULTIPLY', streak, N.bw(N.ramp(z, 0.4, 2.6)))

# 油漆：底色 × 晒褪色（大块噪声变浅）
paint_rgb = N.n('ShaderNodeRGB')
fade = N.bw(N.ramp(N.noise(tc.outputs['Object'], 0.6, 3, 0.5), 0.35, 0.75))
paint = N.mix(N.math('MULTIPLY', fade, 0.14), paint_rgb.outputs[0], (0.55, 0.52, 0.48, 1))
# 油漆上的细节：参考贴图的明暗（压痕、旧漆的斑驳），归一到 1 附近再乘
pref = N.image(paint_ref['diff'], N.scaled_obj(1 / 2.2), box=True)
pdet = N.math('ADD', N.math('MULTIPLY', N.bw(pref.outputs['Color']), 0.9), 0.72)
pm = N.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
pm.inputs['Factor'].default_value = 1.0
N.link(paint, pm.inputs[6])
cmb = N.n('ShaderNodeCombineColor')
for i in range(3):
    N.link(pdet, cmb.inputs[i])
N.link(cmb.outputs[0], pm.inputs[7])
paint = pm.outputs[2]

# 箱号：贴花图，按物体坐标投到两侧长边的左上角
decal = N.n('ShaderNodeTexImage', extension='CLIP')
sepn = N.n('ShaderNodeSeparateXYZ')
N.link(geo.outputs['Normal'], sepn.inputs[0])
sgn = N.math('MULTIPLY', N.math('SIGN', sep.outputs['Y']), -1.0)        # +y 那面从外面看，右手边是 -x
u = N.math('DIVIDE', N.math('ADD', N.math('MULTIPLY', sep.outputs['X'], sgn), L / 2 - 0.4), 2.6)
v = N.math('DIVIDE', N.math('SUBTRACT', z, H - 0.78), 0.5)
uvc = N.n('ShaderNodeCombineXYZ')
N.link(u, uvc.inputs[0]); N.link(v, uvc.inputs[1])
N.link(uvc.outputs[0], decal.inputs['Vector'])
side_face = N.math('GREATER_THAN', N.math('ABSOLUTE', sepn.outputs['Y']), 0.5)
label_a = N.math('MULTIPLY', decal.outputs['Alpha'], side_face)
label_a = N.math('MULTIPLY', label_a, N.math('SUBTRACT', 1.0, N.math('MULTIPLY', rust_mask, 1.0)), clamp=True)
label_a = N.math('MULTIPLY', label_a, N.bw(N.ramp(fine, 0.35, 0.5)))           # 字也有掉漆
paint = N.mix(label_a, paint, (0.8, 0.79, 0.75, 1))

# 锈：Poly Haven 的锈贴图，按真实尺寸盒式投影（一张覆盖 1.6 米）
rtex = N.image(rust['diff'], N.scaled_obj(1 / 1.6), box=True)
color = N.mix(rust_mask, paint, rtex.outputs['Color'])
color = N.mix(N.math('MULTIPLY', streak, 0.55), color, (0.22, 0.12, 0.06, 1))
color = N.mix(N.math('MULTIPLY', bottom, 0.35), color, (0.18, 0.15, 0.12, 1))      # 底部溅的泥
color = N.mix(N.math('MULTIPLY', cav, 0.4), color, (0.0, 0.0, 0.0, 1), 'MULTIPLY')   # 缝里发暗
N.link(color, bs.inputs['Base Color'])

# 粗糙度：油漆 0.55~0.7，锈 0.9
rr = N.math('ADD', 0.55, N.math('MULTIPLY', fade, 0.15))
rr = N.math('ADD', N.math('MULTIPLY', rr, N.math('SUBTRACT', 1.0, rust_mask)), N.math('MULTIPLY', rust_mask, 0.92))
rr = N.math('ADD', rr, N.math('MULTIPLY', streak, 0.08), clamp=True)
N.link(rr, bs.inputs['Roughness'])

# 凹凸：锈的地方起皮（锈贴图的明暗当高度），油漆面有轻微的凹痕
bump1 = N.n('ShaderNodeBump')
bump1.inputs['Distance'].default_value = 0.004
N.link(N.math('MULTIPLY', rust_mask, 0.9), bump1.inputs['Strength'])
N.link(N.bw(rtex.outputs['Color']), bump1.inputs['Height'])
bump2 = N.n('ShaderNodeBump')
bump2.inputs['Strength'].default_value = 0.15
bump2.inputs['Distance'].default_value = 0.01
N.link(N.noise(tc.outputs['Object'], 3.0, 4, 0.5), bump2.inputs['Height'])
N.link(bump2.outputs[0], bump1.inputs['Normal'])
N.link(bump1.outputs[0], bs.inputs['Normal'])


def hex_lin(h):
    """#rrggbb（sRGB）→ Blender 线性颜色"""
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1,)


def label_image(text):
    path = os.path.join(lib.OUT, f'label_{text.replace(" ", "_")}.png')
    subprocess.run(['magick', '-size', '2600x500', 'xc:none', '-fill', 'white',
                    '-font', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                    '-pointsize', '230', '-annotate', '+20+240', text,
                    '-pointsize', '120', '-annotate', '+30+430', '22G1   MAX GROSS 30480 KG', path], check=True)
    return bpy.data.images.load(path)


# ---------- 烘焙 ----------
# AO 和棱边遮罩要追踪光线，各烘一次（AO 是低频的，1024 就够）；后面的烘焙每像素采样 1 次就行
ao_img = lib.new_image('container_ao', TEX // 2, data=True)
lib.bake(ob, mat, 'AO', ao_img, samples=24)
ao_node.image = ao_img
bpy.data.objects.remove(ground)
edge_img = lib.new_image('container_edge', TEX, data=True)
lib.bake_value(ob, mat, edge_raw, edge_img, samples=6)
edge_node.image = edge_img

rough_path = lib.bake(ob, mat, 'ROUGHNESS', lib.new_image('container_rough', TEX, data=True), samples=1)
nor_path = lib.bake(ob, mat, 'NORMAL', lib.new_image('container_nor', TEX, data=True), samples=1)
diff_paths = {}
for hx, label in VARIANTS.items():
    paint_rgb.outputs[0].default_value = hex_lin(hx)
    decal.image = label_image(label)
    diff_paths[hx] = lib.bake(ob, mat, 'DIFFUSE', lib.new_image(f'container_{hx}_diff', TEX), samples=1)

# ---------- 导出 ----------
first = next(iter(VARIANTS))
ob.data.materials.clear()
ob.data.materials.append(lib.final_material('container', diff_paths[first], rough_path, nor_path))
lib.export_glb([ob], os.path.join(lib.OUT, 'container.glb'))
print('三角形', sum(len(p.vertices) - 2 for p in ob.data.polygons), '颜色', list(VARIANTS))
