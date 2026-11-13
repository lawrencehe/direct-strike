# ============================================================
# 模块化沙袋墙：用 Tripo 生成的单个沙袋拼出直段、转角、U 形（#50、#72）
#   blender -b --factory-startup --python assets-src/models/map/sandbag/build.py
#   调试时 TEX=512 跑得快
#
# 底模：tripo/model.glb，参考图 tripo/reference-bag.png（从负责人用 AI 画的沙袋墙 reference-full.jpg 里裁出的一个袋子）。
# 只生成一个袋子，形状由这个脚本拼，所以想要什么形状就在 MODULES 里加一条折线，不用再花积分。
#
# 流程：
# 1. 导入 Tripo 的袋子（1.9 万面），合并重复顶点、删掉悬空碎片，缩放到 BAG_L × BAG_W × BAG_H，
#    减面到 BAG_TRIS 左右当低模，原点在底面中心，长边沿 x。
# 2. 材质：Tripo 的贴图偏糊、带烘进去的光影，不用。换成 Poly Haven 的麻布（hessian_230，CC0），
#    和高模上的褶皱、缝线、扎口一起从高模烘到低模的一套贴图上（颜色 / 粗糙度 / 法线）。所有模块共用这一套。
# 3. 拼墙：每个模块是一条折线（墙的中线），墙厚 DEPTH = 两排袋子，ROWS 层高 HEIGHT；
#    上下层错开半个袋子，墙头的奇数层横放一个袋子封口，拐角处两边的墙一层压一层（咬合）。
#    每个袋子随机掉头、转一点、大小差一点，看着不像复制粘贴。
# 4. 每个袋子的颜色深浅（新旧）、底下几层的沙土、袋子之间缝里的 AO 烘进顶点色，
#    导出成 glTF 的 COLOR_0，three.js 会把它乘到贴图上。这样多加模块只多几何，不多贴图。
#
# 输出：tools/out/props/sandbag-tripo.glb（游戏用，所有模块都在原点，按节点名取）
#       tools/out/props/sandbag-tripo-preview.glb（预览用，模块排开）
# 模块的坐标（Blender：x 长、y 宽、z 高；导出 glTF 后 y 变成 -z）：原点在占地的中心、底面高度 0。
# ============================================================
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../../../maps/yard/props'))
import lib

SRC = os.path.join(HERE, 'tripo/model.glb')
TEX = int(os.environ.get('TEX', 1024))
HEIGHT, DEPTH = 0.9, 0.6            # 墙高、墙厚（和地图里沙袋墙的碰撞方块一样）
ROWS = 5
BAG_L, BAG_W = 0.56, DEPTH / 2      # 装满后的长、宽（米）
BAG_H = HEIGHT / ROWS               # 每层高
SQUASH = 1.12                       # 袋子高度放大一点，上下层压在一起不留缝
BAG_TRIS = 260                      # 低模面数

h = DEPTH / 2
# 模块：名字 → 墙中线的折线（米）。两头是墙头，中间的点是拐角
MODULES = {
    'len_2': [(-1.0, 0), (1.0, 0)],
    'len_3': [(-1.5, 0), (1.5, 0)],
    'len_4': [(-2.0, 0), (2.0, 0)],
    # L 形转角：占地 2 × 2，两条边沿 -y 和 -x
    'corner': [(1.0, -1.0 + h), (-1.0 + h, -1.0 + h), (-1.0 + h, 1.0)],
    # U 形：占地 3 × 2，开口朝 +y
    'u': [(-1.5 + h, 1.0), (-1.5 + h, -1.0 + h), (1.5 - h, -1.0 + h), (1.5 - h, 1.0)],
}
GAME_MODULES = ['len_2', 'len_3', 'len_4']   # 导出进游戏的模块，其余只在预览里

sc = lib.reset()
random.seed(11)


# ---------- 1. 高模、低模 ----------
def select_only(*obs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
select_only(*meshes)
if len(meshes) > 1:
    bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(bpy.data.objects):
    if o is not hi:
        bpy.data.objects.remove(o)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
hi.name = 'bag_hi'
hi.data.materials.clear()

bm = bmesh.new()
bm.from_mesh(hi.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)        # glTF 在 UV 缝上拆开的顶点并回去
# 悬空碎片：按连通块分，删掉小于最大块 5% 的
bm.verts.ensure_lookup_table()
seen, parts = set(), []
for v in bm.verts:
    if v in seen:
        continue
    st, part = [v], []
    seen.add(v)
    while st:
        x = st.pop()
        part.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y not in seen:
                seen.add(y)
                st.append(y)
    parts.append(part)
parts.sort(key=len, reverse=True)
for p in parts[1:]:
    if len(p) < len(parts[0]) * 0.05:
        print('DROP 碎片', len(p), '个顶点')
        bmesh.ops.delete(bm, geom=p, context='VERTS')
# 缩放到袋子尺寸，原点放底面中心
lo = Vector((min(v.co[i] for v in bm.verts) for i in range(3)))
hi_ = Vector((max(v.co[i] for v in bm.verts) for i in range(3)))
size = hi_ - lo
print('Tripo 袋子原始尺寸', tuple(round(s, 3) for s in size))
scale = Vector((BAG_L / size.x, BAG_W / size.y, BAG_H / size.z))
for v in bm.verts:
    c = v.co - Vector(((lo.x + hi_.x) / 2, (lo.y + hi_.y) / 2, lo.z))
    v.co = Vector((c.x * scale.x, c.y * scale.y, c.z * scale.z))
bm.to_mesh(hi.data)
bm.free()
for p in hi.data.polygons:
    p.use_smooth = True

# 低模：减面，展 UV
lo_ob = hi.copy()
lo_ob.data = hi.data.copy()
lo_ob.name = 'bag_lo'
sc.collection.objects.link(lo_ob)
for uv in list(lo_ob.data.uv_layers):
    lo_ob.data.uv_layers.remove(uv)
lo_ob.data.uv_layers.new(name='UVMap')
dec = lo_ob.modifiers.new('dec', 'DECIMATE')
dec.ratio = BAG_TRIS / max(1, sum(len(p.vertices) - 2 for p in hi.data.polygons))
dec.use_collapse_triangulate = True
select_only(lo_ob)
bpy.ops.object.modifier_apply(modifier='dec')
lib.uv_unwrap(lo_ob, margin=0.006)
print('低模三角形', sum(len(p.vertices) - 2 for p in lo_ob.data.polygons))

# ---------- 2. 材质：麻布，从高模烘到低模 ----------
hess = lib.polyhaven('hessian_230')
mat = bpy.data.materials.new('bag_proc')
hi.data.materials.append(mat)
N = lib.Nodes(mat)
out = N.n('ShaderNodeOutputMaterial')
bs = N.n('ShaderNodeBsdfPrincipled')
N.link(bs.outputs[0], out.inputs['Surface'])
obj = N.n('ShaderNodeTexCoord').outputs['Object']
# 麻布：一张贴图覆盖 0.35 米（织纹比真实的粗一些，远处才看得出是麻袋）；颜色取参考图里的土黄
htex = N.image(hess['diff'], N.scaled_obj(1 / 0.35), box=True)
hb = N.math('ADD', N.math('MULTIPLY', N.bw(htex.outputs['Color']), 1.2), 0.55)
cmb = N.n('ShaderNodeCombineColor')
for i in range(3):
    N.link(hb, cmb.inputs[i])
base = N.mix(N.bw(N.ramp(N.noise(obj, 9.0, 3, 0.5), 0.35, 0.65)), (0.5, 0.36, 0.19, 1), (0.44, 0.32, 0.18, 1))
color = N.mix(1.0, base, cmb.outputs[0], 'MULTIPLY')
# 零星的深色污渍
dirt = N.bw(N.ramp(N.noise(obj, 14.0, 6, 0.65), 0.55, 0.8))
color = N.mix(N.math('MULTIPLY', dirt, 0.45), color, (0.17, 0.13, 0.09, 1))
N.link(color, bs.inputs['Base Color'])
N.link(N.math('ADD', 0.86, N.math('MULTIPLY', dirt, 0.08)), bs.inputs['Roughness'])
bump = N.n('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.45
bump.inputs['Distance'].default_value = 0.002
N.link(N.bw(htex.outputs['Color']), bump.inputs['Height'])
N.link(bump.outputs[0], bs.inputs['Normal'])

lo_mat = bpy.data.materials.new('bag_bake')
lo_mat.use_nodes = True
lo_ob.data.materials.append(lo_mat)


def bake_hi_to_lo(kind, img, samples=1):
    sc.cycles.samples = samples
    nt = lo_mat.node_tree
    tgt = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage')
    tgt.name = '__bake__'
    tgt.image = img
    nt.nodes.active = tgt
    select_only(hi, lo_ob, active=lo_ob)
    kw = dict(type=kind, margin=8, use_clear=True, use_selected_to_active=True,
              cage_extrusion=0.03, max_ray_distance=0.08)
    if kind == 'DIFFUSE':
        kw['pass_filter'] = {'COLOR'}
    if kind == 'NORMAL':
        kw['normal_space'] = 'TANGENT'
    print('烘焙', kind, img.name, f'{img.size[0]}px', flush=True)
    bpy.ops.object.bake(**kw)
    img.filepath_raw = os.path.join(lib.OUT, img.name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img.filepath_raw


diff = bake_hi_to_lo('DIFFUSE', lib.new_image('sandbag_bag_diff', TEX))
rough = bake_hi_to_lo('ROUGHNESS', lib.new_image('sandbag_bag_rough', TEX, data=True))
nor = bake_hi_to_lo('NORMAL', lib.new_image('sandbag_bag_nor', TEX, data=True))
bpy.data.objects.remove(hi)

# 导出用的材质：三张图，颜色再乘顶点色
final = lib.final_material('sandbag', diff, rough, nor)
F = final.node_tree
bsdf = next(n for n in F.nodes if n.type == 'BSDF_PRINCIPLED')
dimg = bsdf.inputs['Base Color'].links[0].from_node
vc = F.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
mx = F.nodes.new('ShaderNodeMix')
mx.data_type, mx.blend_type = 'RGBA', 'MULTIPLY'
mx.inputs['Factor'].default_value = 1.0
F.links.new(dimg.outputs['Color'], mx.inputs[6])
F.links.new(vc.outputs['Color'], mx.inputs[7])
F.links.new(mx.outputs[2], bsdf.inputs['Base Color'])

# ---------- 3. 拼墙 ----------
TPL_CO = [v.co.copy() for v in lo_ob.data.vertices]
uvl = lo_ob.data.uv_layers.active.data
TPL_F = [([lo_ob.data.loops[i].vertex_index for i in p.loop_indices], [uvl[i].uv.copy() for i in p.loop_indices])
         for p in lo_ob.data.polygons]


def add_bag(bm, uv, tag, center, yaw, length, width, row):
    """在 bm 里放一个袋子：center 是底面中心，长 length（沿 yaw 方向）、宽 width"""
    j = lambda a: random.uniform(-a, a)
    m = (Matrix.Translation(Vector((center[0] + j(0.012), center[1] + j(0.015), row * BAG_H)))
         @ Matrix.Rotation(yaw + (math.pi if random.random() < 0.5 else 0) + j(0.07), 4, 'Z')
         @ Matrix.Rotation(j(0.04), 4, 'X') @ Matrix.Rotation(j(0.03), 4, 'Y')
         @ Matrix.Diagonal((length / BAG_L * random.uniform(1.08, 1.14), width / BAG_W * random.uniform(0.96, 1.06),
                            SQUASH * random.uniform(0.95, 1.06), 1)))
    vs = [bm.verts.new(m @ c) for c in TPL_CO]
    bid = len(BAGS)
    BAGS.append(row)
    for idx, uvs in TPL_F:
        try:
            f = bm.faces.new([vs[i] for i in idx])
        except ValueError:
            continue
        f.smooth = True
        f[tag] = bid
        for l, u in zip(f.loops, uvs):
            l[uv].uv = u


def build(name, pts):
    global BAGS
    BAGS = []
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    tag = bm.faces.layers.int.new('bag')
    pts = [Vector((x, y)) for x, y in pts]
    nseg = len(pts) - 1
    for row in range(ROWS):
        odd = row % 2 == 1
        for s in range(nseg):
            a, b = pts[s], pts[s + 1]
            d = (b - a).normalized()
            nrm = Vector((-d.y, d.x))
            yaw = math.atan2(d.y, d.x)
            # 两头：墙头 'free'；拐角处这一层谁压在上面（伸到外沿）轮流换
            ends = []
            for k, ci in ((0, s), (1, s + 1)):
                if ci == 0 or ci == nseg:
                    ends.append(('free', 0.0))
                else:
                    owner = (ci - 1 if (ci + row) % 2 == 0 else ci) == s
                    ends.append(('corner', h if owner else -h))
            start = a - d * ends[0][1]
            L = (b - a).length + ends[0][1] + ends[1][1]
            n = max(1, round(L / BAG_L))
            step = L / n
            slots = []          # (沿长度的中心, 长度, 横放)
            if not odd:
                slots = [((i + 0.5) * step, step, False) for i in range(n)]
            else:
                slots = [((i + 1) * step, step, False) for i in range(n - 1)]
                for k, pos in ((0, step / 4), (1, L - step / 4)):
                    slots.append((pos, step / 2, ends[k][0] == 'free'))
            for pos, ln, header in slots:
                c = start + d * pos
                if header:      # 墙头横放一个袋子封口
                    add_bag(bm, uv, tag, c, yaw + math.pi / 2, DEPTH, ln, row)
                else:
                    for side in (-1, 1):
                        add_bag(bm, uv, tag, c + nrm * side * DEPTH / 4, yaw, ln, BAG_W, row)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.data.materials.append(final)
    return ob, BAGS


bpy.data.objects.remove(lo_ob)
mods = {name: build(name, pts) for name, pts in MODULES.items()}

# ---------- 4. 顶点色：AO × 新旧深浅 × 底下的沙土 ----------
bpy.ops.mesh.primitive_plane_add(size=30)
ground = bpy.context.active_object
ground.data.materials.append(bpy.data.materials.new('ground'))
for i, (name, (ob, bags)) in enumerate(mods.items()):
    for o2, _ in mods.values():
        o2.hide_render = o2 is not ob
    me = ob.data
    ao = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    sc.cycles.samples = 48
    select_only(ob)
    print('烘焙 AO →顶点色', name, flush=True)
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
    # 每个袋子一个颜色：新的偏黄、旧的偏灰褐，个别深一些
    tint = []
    for row in bags:
        t = random.random()
        c = Vector((1.0, 0.97, 0.9)).lerp(Vector((0.88, 0.84, 0.78)), t) * random.uniform(0.86, 1.06)
        if random.random() < 0.12:
            c *= 0.8
        low = max(0.0, 1 - row / 2.0)                     # 最下面两层沾沙土，更暗更褐
        c = c.lerp(Vector((0.62, 0.52, 0.4)), 0.45 * low)
        tint.append(c)
    vbag = [0] * len(me.vertices)
    bag_attr = me.attributes['bag'].data
    for p in me.polygons:
        for vi in p.vertices:
            vbag[vi] = bag_attr[p.index].value
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    for vi in range(len(me.vertices)):
        a = ao.data[vi].color[0]
        a = 0.35 + 0.65 * min(1.0, a * 1.15)               # AO 别压得太黑
        c = tint[vbag[vi]] * a
        col.data[vi].color = (c.x, c.y, c.z, 1.0)
    me.color_attributes.remove(me.color_attributes['ao'])
    me.attributes.remove(me.attributes['bag'])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    print('PART', name, '袋子', len(bags), '三角形', sum(len(p.vertices) - 2 for p in me.polygons))
bpy.data.objects.remove(ground)
for ob, _ in mods.values():
    ob.hide_render = False


def export(objs, path):
    select_only(*objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_animations=False, export_skins=False, export_yup=True,
                              export_image_format='AUTO', export_apply=True, export_vertex_color='ACTIVE')
    print('WROTE', path, os.path.getsize(path) // 1024, 'KB')


objs = [ob for ob, _ in mods.values()]
# 游戏只用直段（world.js 的 sandbags 按 len_<长度> 取节点）；转角和 U 形先只出预览，地图要用时再加进来，省下载体积
export([mods[n][0] for n in GAME_MODULES], os.path.join(lib.OUT, 'sandbag-tripo.glb'))
# 预览：排开（x 方向一字排，转角和 U 形放后面一排）
place = {'len_2': (-5.5, 3), 'len_3': (-1.5, 3), 'len_4': (3.5, 3), 'corner': (-3, -1.5), 'u': (1.5, -1.5)}
for ob in objs:
    ob.location = (*place[ob.name], 0)
export(objs, os.path.join(lib.OUT, 'sandbag-tripo-preview.glb'))
