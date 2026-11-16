# 原型：每种东西在 Blender 里长什么样（#115）。
# 地图里的物体是"集合实例"（空物体指向一个原型集合），所以几十个集装箱共用一份网格，改颜色就是换一个原型。
# 有游戏模型的（集装箱、隔离墩、沙袋墙、油桶、弹药箱、中央平台）用插件包里还原过的 glb，和游戏里一样；
# 其他的（轮胎、木托盘、货车、灯柱…）用简单形状，尺寸和游戏里的碰撞一致。
# 原型都放在隐藏的集合"DS 原型"里，不导出。
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import schema

ROOT = 'DS 原型'
KIT_DIR = os.path.dirname(os.path.abspath(__file__))


def assets_dir(map_id):
    return os.path.join(KIT_DIR, 'assets', map_id or 'yard')


# ---------- 材质 ----------
def flat_mat(name, rgb, alpha=1.0, emit=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = 0.8
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    m.diffuse_color = (*rgb, alpha)   # 视图里"实体"模式显示的颜色
    return m


def hex_rgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# ---------- 网格 ----------
def unit_box_mesh():
    """1 × 1 × 1 的方块，原点在底面中心（和游戏里 pos 的 y 指底部一致）。缩放就是尺寸"""
    me = bpy.data.meshes.get('ds_unit_box')
    if me:
        return me
    me = bpy.data.meshes.new('ds_unit_box')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    bm.to_mesh(me)
    bm.free()
    return me


def unit_plane_mesh():
    me = bpy.data.meshes.get('ds_unit_plane')
    if me:
        return me
    me = bpy.data.meshes.new('ds_unit_plane')
    me.from_pydata([(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [], [(0, 1, 2, 3)])
    return me


def unit_disc_mesh():
    """半径 1 的圆片（水洼、油渍按半径缩放）"""
    me = bpy.data.meshes.get('ds_unit_disc')
    if me:
        return me
    me = bpy.data.meshes.new('ds_unit_disc')
    n = 32
    me.from_pydata([(math.cos(i / n * 2 * math.pi), math.sin(i / n * 2 * math.pi), 0) for i in range(n)], [], [tuple(range(n))])
    return me


def _mesh_obj(coll, name, build, mat, matrix=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    if matrix is not None:
        bm.transform(matrix)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def box(coll, name, w, d, h, x, y, z, mat):
    """Blender 坐标：w 沿 X、d 沿 Y、h 沿 Z，(x, y, z) 是底面中心"""
    def b(bm):
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(x, y, z + h / 2), verts=bm.verts)
    return _mesh_obj(coll, name, b, mat)


def cyl(coll, name, r, h, x, y, z, mat, seg=16, matrix=None):
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
        if matrix is not None:
            bm.transform(matrix)
        bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts)
    return _mesh_obj(coll, name, b, mat)


def cone(coll, name, r, h, x, y, z, mat, matrix=None):
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r, radius2=0, depth=h)
        if matrix is not None:
            bm.transform(matrix)
        bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts)
    return _mesh_obj(coll, name, b, mat)


# ---------- 原型集合 ----------
def root():
    c = bpy.data.collections.get(ROOT)
    if not c:
        c = bpy.data.collections.new(ROOT)
        bpy.context.scene.collection.children.link(c)
    # 原型不显示在场景里（只通过实例出现）
    lc = _find_layer_coll(bpy.context.view_layer.layer_collection, ROOT)
    if lc:
        lc.exclude = True
    return c


def _find_layer_coll(lc, name):
    if lc.collection.name == name:
        return lc
    for ch in lc.children:
        r = _find_layer_coll(ch, name)
        if r:
            return r
    return None


def _new_proto(key):
    c = bpy.data.collections.new(f'原型 {key}')
    root().children.link(c)
    c['ds_proto'] = key
    return c


_glb_cache = {}


def _import_glb(path):
    """导入一个 glb，返回导入的物体列表，从场景里拿下来（只留数据）。同一个文件只导入一次"""
    if path in _glb_cache and all(o.name in bpy.data.objects for o in _glb_cache[path]):
        return _glb_cache[path]
    if not os.path.exists(path):
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
    _glb_cache[path] = objs
    return objs


def _link_tree(objs, coll):
    """把导入的一组物体复制进原型集合，保留父子关系"""
    copies = {}
    for o in objs:
        n = o.copy()
        coll.objects.link(n)
        copies[o] = n
    for o, n in copies.items():
        if o.parent in copies:
            n.parent = copies[o.parent]
            n.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        else:
            n.parent = None
            n.matrix_world = o.matrix_world.copy()


def _model_obj(map_id, models, mtype):
    if not models or mtype not in models:
        return None
    return _import_glb(os.path.join(assets_dir(map_id), models[mtype]))


def ensure(key, ctx):
    """原型 key 对应的集合，没有就建。ctx = {'map_id', 'models'}（地图文件里的 id 和 models）"""
    for c in bpy.data.collections:
        if c.get('ds_proto') == key:
            return c
    c = _new_proto(key)
    kind, _, variant = key.partition(':')
    build = BUILDERS.get(kind)
    if build:
        build(c, variant, ctx)
    return c


# 每个原型的造型。坐标都是 Blender 的：X 向东，Y 向北，Z 向上，原点在物体底面中心
def _container(c, color, ctx):
    objs = _model_obj(ctx['map_id'], ctx['models'], 'container')
    if not objs:
        box(c, 'container', 6, 2.44, 2.6, 0, 0, 0, flat_mat(f'ds 集装箱 {color}', hex_rgb(color or '#888888')))
        return
    for o in objs:
        if o.type != 'MESH':
            continue
        n = o.copy()
        c.objects.link(n)
        n.matrix_world = o.matrix_world
        # 每种颜色一张颜色贴图（和游戏一样，container_<颜色>_diff.png）
        tex = os.path.join(assets_dir(ctx['map_id']), os.path.dirname(ctx['models']['container']), f'container_{(color or "").lstrip("#").lower()}_diff.png')
        if os.path.exists(tex) and n.data.materials:
            base = n.data.materials[0]
            m = bpy.data.materials.get(f'ds 集装箱 {color}') or base.copy()
            m.name = f'ds 集装箱 {color}'
            for nd in m.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.outputs['Color'].links and any(l.to_socket.name == 'Base Color' for l in nd.outputs['Color'].links):
                    nd.image = bpy.data.images.load(tex, check_existing=True)
            m.diffuse_color = (*hex_rgb(color), 1)
            n.data = n.data.copy()
            n.data.materials[0] = m


def _simple_model(mtype, fallback):
    def build(c, variant, ctx):
        objs = _model_obj(ctx['map_id'], ctx['models'], mtype)
        if not objs:
            return fallback(c, variant, ctx)
        _link_tree(objs, c)
    return build


def _jersey_fallback(c, v, ctx):
    box(c, 'jersey', 2.4, 0.5, 0.85, 0, 0, 0, flat_mat('ds concreteDark', schema.MATERIALS['concreteDark']))


def _platform_fallback(c, v, ctx):
    box(c, 'platform', 7.3, 5.7, 1.4, 0, 0, 0, flat_mat('ds concrete', schema.MATERIALS['concrete']))


def _sandbags(c, length, ctx):
    objs = _model_obj(ctx['map_id'], ctx['models'], 'sandbags')
    part = objs and next((o for o in objs if o.name.split('.')[0] == f'len_{length}'), None)
    if not part:
        box(c, 'sandbags', float(length or 3), 0.6, 0.9, 0, 0, 0, flat_mat('ds sandbag', schema.MATERIALS['sandbag']))
        return
    n = part.copy()
    n.parent = None
    c.objects.link(n)
    n.matrix_world = part.matrix_world


def _drum(c, paint, ctx, lying=False):
    objs = _model_obj(ctx['map_id'], ctx['models'], 'drum')
    rgb = schema.MATERIALS.get(paint or 'barrelRed', (0.5, 0.2, 0.2))
    # 倒着的桶和游戏一样：桶底中心为原点，绕游戏的 z 轴（Blender 的 -Y）转 90° 让桶身朝西，往东挪半个桶长、抬高一个半径，整体转 0.4
    lie = Matrix.Translation((0, 0, 0.3)) @ Matrix.Rotation(0.4, 4, 'Z') @ Matrix.Translation((0.45, 0, 0))
    if not objs:
        if lying:
            o = cyl(c, 'drum', 0.3, 0.9, 0, 0, 0, flat_mat(f'ds {paint}', rgb), matrix=Matrix.Translation((0, 0, -0.45)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y'))
            o.matrix_world = lie
        else:
            cyl(c, 'drum', 0.3, 0.9, 0, 0, 0, flat_mat(f'ds {paint}', rgb))
        return
    src = next(o for o in objs if o.type == 'MESH')
    n = src.copy()
    n.data = src.data.copy()
    # 漆色：游戏里在 shader 里换颜色，这里简单地把贴图乘上漆色（看个大概）
    m = bpy.data.materials.get(f'ds 油桶 {paint}')
    if not m:
        m = src.data.materials[0].copy()
        m.name = f'ds 油桶 {paint}'
        nt = m.node_tree
        bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
        link = bsdf.inputs['Base Color'].links[0] if bsdf.inputs['Base Color'].links else None
        if link:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 0.85
            nt.links.new(link.from_socket, mix.inputs['A'])
            mix.inputs['B'].default_value = (*[min(1, v * 2.2) for v in rgb], 1)
            nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        m.diffuse_color = (*rgb, 1)
    n.data.materials[0] = m
    c.objects.link(n)
    if lying:
        # 和游戏一样：绕 z 放倒，桶身朝 -x，往 +x 挪半个桶长，再整体抬高到半径
        n.matrix_world = lie @ Matrix.Rotation(-math.pi / 2, 4, 'Y') @ src.matrix_world
    else:
        n.matrix_world = src.matrix_world


def _ammo_crates(c, v, ctx):
    objs = _model_obj(ctx['map_id'], ctx['models'], 'ammoCrate')
    L, D, H, gap = 0.6, 0.33, 0.34, 0.02
    layers = [(2, 3), (2, 2), (1, 1)]
    src = objs and next((o for o in objs if o.type == 'MESH'), None)
    n = 0
    for k, (cols, rows) in enumerate(layers):
        for ci in range(cols):
            for ri in range(rows):
                lx = (ci - (cols - 1) / 2) * (L + gap)
                lz = (ri - (rows - 1) / 2) * (D + gap)
                if src:
                    o = src.copy()
                    c.objects.link(o)
                    rot = math.pi if (n * 5) % 3 == 0 else 0
                    o.matrix_world = Matrix.Translation((lx, -lz, k * H)) @ Matrix.Rotation(rot, 4, 'Z') @ src.matrix_world
                else:
                    box(c, 'crate', L, D, H, lx, -lz, k * H, flat_mat('ds wood', schema.MATERIALS['wood']))
                n += 1


def _tires(c, v, ctx):
    m = flat_mat('ds rubber', schema.MATERIALS['rubber'])
    for i in range(3):   # 三个轮胎摞起来（游戏里是圆环，这里用扁圆柱看个大概）
        cyl(c, f'tire{i}', 0.47, 0.24, 0, 0, 0.01 + i * 0.26, m)


def _pallets(c, v, ctx):
    m = flat_mat('ds wood', schema.MATERIALS['wood'])
    for i in range(5):
        box(c, f'pallet{i}', 1.2, 1.0, 0.13, 0, 0, i * 0.14, m)
    box(c, 'crate', 0.9, 0.8, 0.9, 0, 0, 0.7, m)


def _cable(c, v, ctx):
    m = flat_mat('ds wood', schema.MATERIALS['wood'])
    cyl(c, 'flange0', 0.75, 0.15, 0, 0, 0, m)
    cyl(c, 'core', 0.3, 0.8, 0, 0, 0.15, m)
    cyl(c, 'flange1', 0.75, 0.15, 0, 0, 0.95, m)


def _truck(c, color, ctx):
    body = flat_mat(f'ds 货车 {color}', hex_rgb(color or '#2f5d8c'))
    dark = flat_mat('ds metalDark', schema.MATERIALS['metalDark'])
    # 车头朝北（Blender +Y）：车头一块高的、后面货斗
    box(c, 'cab', 2.4, 2.2, 2.6, 0, 2.6, 0.5, body)
    box(c, 'bed', 2.5, 5.2, 0.4, 0, -1.2, 0.9, dark)
    box(c, 'cargo', 2.4, 2.0, 1.0, 0, -2.1, 2.0, flat_mat('ds wood', schema.MATERIALS['wood']))
    for y in (2.6, -2.4):
        for x in (-1.05, 1.05):
            cyl(c, 'wheel', 0.5, 0.35, x, y, 0.5, dark, matrix=Matrix.Rotation(math.pi / 2, 4, 'Y'))


def _lamp(c, v, ctx):
    m = flat_mat('ds metalDark', schema.MATERIALS['metalDark'])
    cyl(c, 'pole', 0.08, 7, 0, 0, 0, m)
    box(c, 'lamp', 0.5, 0.3, 0.18, 0, 0, 6.7, flat_mat('ds 灯', (1, 0.95, 0.8), emit=2))


def _crane(c, v, ctx):
    m = flat_mat('ds metalDark', schema.MATERIALS['metalDark'])
    box(c, 'legL', 1.2, 1.2, 26, -10, 0, 0, m)
    box(c, 'legR', 1.2, 1.2, 26, 10, 0, 0, m)
    box(c, 'beam', 26, 1.6, 1.6, 0, 0, 25, m)


def _tower(c, v, ctx):
    cyl(c, 'leg', 0.6, 18, 0, 0, 0, flat_mat('ds metalDark', schema.MATERIALS['metalDark']))
    cyl(c, 'tank', 4, 5, 0, 0, 18, flat_mat('ds metal', schema.MATERIALS['metal']))


# 玩法实体：醒目的颜色，箭头指向朝向（Blender +Y = 游戏的北 = yaw 0）
SPAWN_COLORS = {'': (0.08, 0.40, 0.85), 'start': (0.05, 0.75, 0.25), 'fallback': (0.95, 0.45, 0.05)}


def _person(c, rgb, name):
    m = flat_mat(f'ds {name}', rgb, emit=0.6)
    cyl(c, 'body', 0.3, 1.75, 0, 0, 0, m)
    cone(c, 'arrow', 0.35, 0.9, 0, 0.75, 1.0, m, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'))


def _spawn(c, v, ctx):
    _person(c, SPAWN_COLORS.get(v, SPAWN_COLORS['']), f'出生点 {v or "普通"}')


def _range(c, v, ctx):
    _person(c, (0.95, 0.55, 0.1), '训练场出生点')


def _nav(c, v, ctx):
    m = flat_mat('ds 巡逻点', (0.15, 0.65, 0.2), emit=0.6)
    cyl(c, 'disc', 0.3, 0.06, 0, 0, 0, m)
    cyl(c, 'pole', 0.04, 1.0, 0, 0, 0, m)


def _target(c, v, ctx):
    m = flat_mat('ds 靶子', (0.85, 0.15, 0.1), emit=0.4)
    box(c, 'base', 0.6, 0.4, 0.15, 0, 0, 0, m)
    box(c, 'plate', 0.7, 0.05, 0.9, 0, 0, 0.55, m)
    box(c, 'head', 0.34, 0.05, 0.34, 0, 0, 1.47, m)


def _note(c, v, ctx):
    m = flat_mat('ds 备注', (1.0, 0.8, 0.1), emit=1.0)
    cyl(c, 'pin', 0.04, 2.2, 0, 0, 0, m)
    cone(c, 'flag', 0.35, 0.6, 0, 0, 2.4, m, matrix=Matrix.Rotation(math.pi, 4, 'X'))


BUILDERS = {
    'container': _container,
    'jersey': _simple_model('jersey', _jersey_fallback),
    'model': lambda c, v, ctx: _simple_model(v, _platform_fallback)(c, v, ctx),
    'sandbags': _sandbags,
    'barrel': _drum,
    'barrelLying': lambda c, v, ctx: _drum(c, 'barrelRed', ctx, lying=True),
    'ammoCrates': _ammo_crates,
    'tires': _tires,
    'palletStack': _pallets,
    'cableReel': _cable,
    'truck': _truck,
    'lampPost': _lamp,
    'crane': _crane,
    'waterTower': _tower,
    'spawn': _spawn,
    'rangeSpawn': _range,
    'nav': _nav,
    'target': _target,
    'note': _note,
}


def key_for(kind, f):
    """物体 → 原型 key（同一 key 的物体共用一个原型）"""
    if kind == 'container':
        return f'container:{(f.get("color") or "#888888").lower()}'
    if kind == 'sandbags':
        return f'sandbags:{f.get("len", 3)}'
    if kind == 'barrel':
        return f'barrel:{f.get("material", "barrelRed")}'
    if kind == 'truck':
        return f'truck:{(f.get("color") or "#2f5d8c").lower()}'
    if kind == 'model':
        return f'model:{f.get("model", "")}'
    if kind == 'spawn':
        return 'spawn:' + ('start' if f.get('start') else 'fallback' if f.get('fallback') else '')
    return kind
