# ============================================================
# 沙袋墙建模 + 烘焙（#50）
#   blender -b --factory-startup --python assets-src/maps/yard/props/sandbag.py
#
# 地图里的沙袋墙高 0.9、厚 0.6 米，长 3 或 4 米。这里按长度各做一段墙（glb 里的节点叫 len_3、len_4），
# 原点在底面中心，长边沿 x（Blender 和游戏里都是）。碰撞仍按地图里的方块，模型只管显示。
# 每个沙袋是一个圆角、中间鼓、两头收口的软包，每层两排（顺着墙放），上下层错开半个袋子，
# 奇数层两头各补一个横放的袋子。每个袋子大小、角度随机一点，看着不像复制粘贴。
# 材质：Poly Haven 的麻布（hessian_230，CC0）+ 程序生成的脏污、沙土、颜色深浅，烘焙成贴图（袋子之间的缝靠烘焙 AO 压暗）。
# 输出 tools/out/props/sandbag.glb，build.sh 压缩进 assets/maps/yard/props/。
# ============================================================
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

LENGTHS = (3, 4)
HEIGHT, DEPTH = 0.9, 0.6
ROWS = 6
BAG_L, BAG_W = 0.56, 0.3            # 袋子装满后的长、宽（米）
BAG_H = HEIGHT / ROWS               # 每层的高度
TEX = int(os.environ.get('TEX', 2048))

lib.reset()
random.seed(7)


def bag_template():
    """一个沙袋的网格（顶点坐标、面），大小已经是 BAG_L × BAG_W × BAG_H，原点在底面中心。每个袋子复制它再变换"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        # 方块 → 圆角方块（超椭球），再做成软包：中间鼓、两头收口、底面被压平
        n = 4.0
        r = (abs(x) ** n + abs(y) ** n + abs(z) ** n) ** (1 / n)
        x, y, z = x / r, y / r, z / r
        end = max(0.0, abs(x) - 0.7) / 0.3                     # 两头 0..1
        y *= 1 - 0.35 * end * end
        z *= (1 - 0.45 * end * end) * (1 + 0.12 * (1 - x * x) * (1 - y * y))
        if z < -0.7:
            z = -0.7 - (z + 0.7) * 0.25                        # 底下被压平
        v.co = Vector((x * BAG_L / 2, y * BAG_W / 2, (z + 0.12) * BAG_H / 2 * 1.08))
    zmin = min(v.co.z for v in bm.verts)                       # 袋子底面放在 z=0（落地、不陷进地里）
    for v in bm.verts:
        v.co.z -= zmin
    bm.verts.index_update()
    tpl = ([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    return tpl


TEMPLATE = bag_template()


def bag_mesh(bm, mat):
    """在 bm 里加一个沙袋，mat 是放置用的变换；每个顶点再抖一点，袋子不会一模一样"""
    cos, faces = TEMPLATE
    jit = lambda: random.uniform(-1, 1) * 0.004
    vs = [bm.verts.new(mat @ (c + Vector((jit(), jit(), jit())))) for c in cos]
    for f in faces:
        bm.faces.new([vs[i] for i in f])


def wall(length):
    bm = bmesh.new()
    for row in range(ROWS):
        z = row * BAG_H
        odd = row % 2 == 1
        # 偶数层 n 个袋子铺满；奇数层少一个、错开半个袋子，两头空出的半个袋子位置各补一个横放的
        n = max(2, round(length / BAG_L))
        step = length / n
        for side in (-1, 1):                                   # 每层前后两排
            y = side * DEPTH / 4
            count = n - 1 if odd else n
            for i in range(count):
                x = -length / 2 + step * (i + (1.0 if odd else 0.5))
                s = step / BAG_L
                m = (Matrix.Translation((x + random.uniform(-0.015, 0.015), y + random.uniform(-0.02, 0.02), z))
                     @ Matrix.Rotation(random.uniform(-0.06, 0.06), 4, 'Z')
                     @ Matrix.Rotation(random.uniform(-0.04, 0.04), 4, 'X')
                     @ Matrix.Diagonal((s * random.uniform(1.0, 1.06), random.uniform(0.95, 1.05), random.uniform(0.95, 1.08), 1)))
                bag_mesh(bm, m)
        if odd:                                                # 两头横放的袋子
            for sx in (-1, 1):
                x = sx * (length / 2 - step / 4)
                m = (Matrix.Translation((x, 0, z)) @ Matrix.Rotation(math.pi / 2 + random.uniform(-0.05, 0.05), 4, 'Z')
                     @ Matrix.Diagonal((DEPTH / BAG_L, step / 2 / BAG_W * 1.05, random.uniform(0.95, 1.05), 1)))
                bag_mesh(bm, m)
    me = bpy.data.meshes.new(f'len_{length}')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(f'len_{length}', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


hess = lib.polyhaven('hessian_230')
objs = []
for length in LENGTHS:
    ob = wall(length)
    lib.uv_unwrap(ob, margin=0.002)
    objs.append(ob)

bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
ground = bpy.context.active_object
white = bpy.data.images.new('white', 4, 4)
white.generated_color = (1, 1, 1, 1)

results = {}
for ob in objs:
    # 墙之间离远一点，烘 AO 时互不遮挡
    others = [o for o in objs if o is not ob]
    for o in others:
        o.hide_render = True
    mat = bpy.data.materials.new(ob.name + '_proc')
    ob.data.materials.append(mat)
    N = lib.Nodes(mat)
    out = N.n('ShaderNodeOutputMaterial')
    bs = N.n('ShaderNodeBsdfPrincipled')
    N.link(bs.outputs[0], out.inputs['Surface'])
    tc = N.n('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    sep = N.n('ShaderNodeSeparateXYZ')
    N.link(obj, sep.inputs[0])
    z = sep.outputs['Z']
    ao_node = lib.image_node(N, white)
    ao = ao_node.outputs['Color']

    # 麻布：贴图一张覆盖 0.35 米（织纹比真实的粗一些，远处才看得出是麻袋）
    htex = N.image(hess['diff'], N.scaled_obj(1 / 0.35), box=True)
    # 麻布原色偏浅，按大块噪声在 土黄 / 灰褐 之间变（新旧袋子不一样）
    tint = N.mix(N.bw(N.ramp(N.noise(obj, 1.6, 2, 0.5), 0.35, 0.65)), (0.3, 0.24, 0.15, 1), (0.24, 0.22, 0.18, 1))
    hb = N.math('ADD', N.math('MULTIPLY', N.bw(htex.outputs['Color']), 1.2), 0.55)
    cmb = N.n('ShaderNodeCombineColor')
    for i in range(3):
        N.link(hb, cmb.inputs[i])
    color = N.mix(1.0, tint, cmb.outputs[0], 'MULTIPLY')
    # 脏污和沙土：底下几层更脏，零星的深色斑
    dirt = N.bw(N.ramp(N.noise(obj, 5.0, 6, 0.65), 0.5, 0.75))
    low = N.bw(N.ramp(z, 0.0, 0.5, (1, 1, 1, 1), (0, 0, 0, 1)))
    color = N.mix(N.math('MULTIPLY', N.math('ADD', N.math('MULTIPLY', dirt, 0.5), N.math('MULTIPLY', low, 0.35)), 1.0, clamp=True),
                  color, (0.17, 0.13, 0.09, 1))
    # 袋子之间的缝（AO）压暗
    cav = N.bw(N.ramp(ao, 0.35, 0.95, (1, 1, 1, 1), (0, 0, 0, 1)))
    color = N.mix(N.math('MULTIPLY', cav, 0.75), color, (0, 0, 0, 1), 'MULTIPLY')
    N.link(color, bs.inputs['Base Color'])
    N.link(N.math('ADD', 0.88, N.math('MULTIPLY', dirt, 0.08)), bs.inputs['Roughness'])
    bump = N.n('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    bump.inputs['Distance'].default_value = 0.002
    N.link(N.bw(htex.outputs['Color']), bump.inputs['Height'])
    bump2 = N.n('ShaderNodeBump')                             # 布面的皱褶
    bump2.inputs['Strength'].default_value = 0.35
    bump2.inputs['Distance'].default_value = 0.006
    N.link(N.noise(N.scaled_obj((14.0, 22.0, 22.0)), 1.0, 3, 0.5), bump2.inputs['Height'])
    N.link(bump2.outputs[0], bump.inputs['Normal'])
    N.link(bump.outputs[0], bs.inputs['Normal'])

    name = f'sandbag_{ob.name}'
    ao_img = lib.new_image(name + '_ao', TEX // 2, data=True)
    lib.bake(ob, mat, 'AO', ao_img, samples=24)
    ao_node.image = ao_img
    diff = lib.bake(ob, mat, 'DIFFUSE', lib.new_image(name + '_diff', TEX), samples=1)
    rough = lib.bake(ob, mat, 'ROUGHNESS', lib.new_image(name + '_rough', TEX, data=True), samples=1)
    nor = lib.bake(ob, mat, 'NORMAL', lib.new_image(name + '_nor', TEX, data=True), samples=1)
    results[ob] = (diff, rough, nor)
    for o in others:
        o.hide_render = False

bpy.data.objects.remove(ground)
for ob, (d, r, n) in results.items():
    ob.data.materials.clear()
    ob.data.materials.append(lib.final_material(ob.name, d, r, n))
    print(ob.name, '三角形', sum(len(p.vertices) - 2 for p in ob.data.polygons))
# 两段墙并排导出（位置都在原点，游戏里按名字取）
lib.export_glb(objs, os.path.join(lib.OUT, 'sandbag.glb'))
