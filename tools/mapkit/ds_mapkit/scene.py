# 地图 JSON ↔ Blender 场景（#115）。
#
# 坐标换算：游戏 x 向东、y 向上、z 向南；Blender X 向东、Y 向北、Z 向上。
#   Blender (X, Y, Z) = 游戏 (x, -z, y)。绕竖轴的转角两边一样（从上往下看逆时针为正，0 朝北）。
# 物体的名字就是编号（C1、S1…）；Blender 复制出来的 "C1.001" 导出时自动换成新编号。
# 导出时按 ds.order 排序，没动过的东西在文件里的位置不变，git diff 只显示改了的行。
import json
import math
import re

import bpy
from mathutils import Matrix, Vector

from . import mapformat, protos, schema

ROOT = 'DS 地图'
COLLS = {
    'ground': '地面', 'fence': '围栏', 'objects': '物体', 'entities': '玩法', 'regions': '区域', 'backdrop': '远景',
    'helpers': '辅助（不导出）',
}
GROUND_KINDS = {'pad', 'puddle', 'stain'}
BACKDROP_KINDS = {'building', 'crane', 'waterTower'}
HALF_PI = math.pi / 2


def to_bl(x, y, z):
    return Vector((x, -z, y))


# ---------- 集合 ----------
def coll(key):
    root = bpy.data.collections.get(ROOT)
    if not root:
        root = bpy.data.collections.new(ROOT)
        bpy.context.scene.collection.children.link(root)
    name = COLLS[key]
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        root.children.link(c)
    return c


def coll_for(kind):
    if kind in GROUND_KINDS:
        return coll('ground')
    if kind == 'fence':
        return coll('fence')
    if kind in BACKDROP_KINDS:
        return coll('backdrop')
    if kind in schema.ENTITIES:
        return coll('entities')
    if kind == 'region':
        return coll('regions')
    return coll('objects')


def clear():
    """删掉上一张地图（DS 地图和原型集合里的所有东西）"""
    for name in [ROOT, protos.ROOT]:
        c = bpy.data.collections.get(name)
        if not c:
            continue
        for ch in list(c.children_recursive) + [c]:
            for o in list(ch.objects):
                bpy.data.objects.remove(o, do_unlink=True)
        for ch in list(c.children_recursive):
            bpy.data.collections.remove(ch)
        bpy.data.collections.remove(c)
    protos._glb_cache.clear()
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.images):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)


def base():
    """地图文件里不在 Blender 里编辑的部分（名字、范围、材质、模型列表…）"""
    t = bpy.context.scene.get('ds_base')
    return json.loads(t) if t else None


def ctx():
    b = base() or {}
    return {'map_id': b.get('id', 'yard'), 'models': b.get('models', {})}


# ---------- 读字段 ----------
def _set_fields(o, kind, d):
    """地图里的字段 → obj.ds；不认识的放进 extra"""
    p = o.ds
    p.kind = kind
    known = {'id', 'type', 'x', 'y', 'z', 'size', 'pos', 'rot', 'yaw', 'w', 'd', 'h', 'r', 'len', 'alongX', 'alongZ', 'colliders'}
    if 'color' in d: p['color'] = d['color']
    if 'label' in d: p.label = d['label']
    if 'model' in d: p['model'] = d['model']
    if 'text' in d: p.text = d['text']
    if 'note' in d: p.note = d['note']
    if kind == 'barrel' and 'material' in d: p['paint'] = schema.BARREL_PAINTS.index(d['material']) if d['material'] in schema.BARREL_PAINTS else 0
    elif 'material' in d and d['material'] in schema.MATERIALS: p['material'] = list(schema.MATERIALS).index(d['material'])
    if kind == 'sandbags' and 'len' in d: p['length'] = schema.SANDBAG_LENS.index(d['len']) if d['len'] in schema.SANDBAG_LENS else 1
    if d.get('start'): p['start'] = True
    if d.get('fallback'): p['fallback'] = True
    if 'collide' in d: p.collide = d['collide']
    if 'shoot' in d: p.shoot = d['shoot']
    if 'move' in d:
        p.move = True
        p.move_range = d['move'].get('range', 2)
        p.move_speed = d['move'].get('speed', 1)
    if 'style' in d: p.style = d['style']
    known |= {'color', 'label', 'model', 'text', 'note', 'material', 'start', 'fallback', 'collide', 'shoot', 'move', 'style', 'name'}
    extra = {k: v for k, v in d.items() if k not in known}
    p.extra = json.dumps(extra, ensure_ascii=False) if extra else ''


def _fields(o):
    """obj.ds → 地图里的非几何字段（按类型挑要写的）"""
    p, kind = o.ds, o.ds.kind
    f = {}
    if kind in ('container', 'truck'): f['color'] = p.color
    if kind == 'container': f['label'] = p.label
    if kind == 'model': f['model'] = p.model
    if kind == 'sandbags': f['len'] = int(p.length)
    if kind == 'barrel': f['material'] = p.paint
    if kind in ('box', 'proxy', 'collider') and (kind == 'box' or o.get('ds_has_material')): f['material'] = p.material
    if kind == 'proxy' and p.model: f['model'] = p.model
    if kind == 'box' and not p.collide: f['collide'] = False
    if kind in ('box', 'proxy', 'collider') and not p.shoot: f['shoot'] = False
    if kind == 'spawn':
        if p.start: f['start'] = True
        if p.fallback: f['fallback'] = True
    if kind == 'target' and p.move: f['move'] = {'range': p.move_range, 'speed': p.move_speed}
    if kind == 'note': f['text'] = p.text
    if kind == 'building': f['style'] = p.style
    return f


# ---------- 建物体 ----------
def _rot_from(spec, d):
    r = spec.get('rot')
    if r is None:
        return 0
    if r in ('rot', 'yaw'):
        return d.get(r, 0) or 0
    field, when0 = r
    v = bool(d.get(field))
    # ('alongZ', 1)：alongZ 为真时转 90°；('alongX', 0)：alongX 为真时不转
    return (HALF_PI if v else 0) if when0 == 1 else (0 if v else HALF_PI)


def _empty(name, key, c):
    o = bpy.data.objects.new(name, None)
    o.instance_type = 'COLLECTION'
    o.instance_collection = protos.ensure(key, ctx())
    o.empty_display_size = 0.3
    c.objects.link(o)
    return o


def _boxobj(name, c, size, pos, display='SOLID', mat=None):
    """size = [w, h, d]（游戏），pos = [x, y 底, z]"""
    o = bpy.data.objects.new(name, protos.unit_box_mesh())
    c.objects.link(o)
    o.scale = (size[0], size[2], size[1])
    o.location = to_bl(*pos)
    _style(o, display, mat)
    return o


def _style(o, display, mat):
    o.display_type = display
    if display == 'WIRE':
        o.hide_render = True
    if mat is not None and o.data:
        if len(o.data.materials) == 0:          # 共用的单位网格只有一个空材质槽，材质挂在物体上（每个物体可以不同）
            o.data.materials.append(None)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = mat


def box_mat(kind, p):
    if kind in ('blocker', 'proxy', 'collider'):
        return protos.flat_mat('ds 碰撞', (0.9, 0.2, 0.6))
    return protos.flat_mat(f'ds {p.material}', schema.MATERIALS.get(p.material, (0.5, 0.5, 0.5)))


def create(kind, d, order, parent=None):
    """按地图里的一项建一个 Blender 物体"""
    spec = schema.spec(kind)
    shape = spec['shape']
    name = d.get('id') or kind
    c = parent.users_collection[0] if parent else coll_for(kind)
    if shape == 'inst':
        o = _empty(name, protos.key_for(kind, d), c)
        _set_fields(o, kind, d)
        o.location = to_bl(d.get('x', 0), d.get('y', 0), d.get('z', 0))
        o.rotation_euler.z = _rot_from(spec, d)
        o.lock_rotation = (True, True, spec.get('rot') is None)   # 不管朝向的物体锁住旋转，免得以为转了有用
    elif shape == 'box':
        o = _boxobj(name, c, d['size'], d['pos'])
        _set_fields(o, kind, d)
        if 'material' in d:
            o['ds_has_material'] = True
        _style(o, 'WIRE' if kind in ('blocker', 'proxy', 'collider') else 'SOLID', box_mat(kind, o.ds))
        if parent:
            o.parent = parent
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.location = to_bl(*d['pos'])
    elif shape in ('rect', 'region'):
        o = bpy.data.objects.new(name if shape == 'rect' else d.get('name', name), protos.unit_plane_mesh())
        c.objects.link(o)
        o.scale = (d['w'], d['d'], 1)
        o.location = to_bl(d['x'], 0.012 if shape == 'rect' else 0.06, d['z'])
        _set_fields(o, kind, d)
        if shape == 'region':
            o.ds.rid = d.get('id', '')
            _style(o, 'WIRE', None)
            o.show_in_front = True
        else:
            _style(o, 'SOLID', protos.flat_mat('ds 水泥地块', (0.45, 0.44, 0.41)))
    elif shape in ('ellipse', 'disc'):
        o = bpy.data.objects.new(name, protos.unit_disc_mesh())
        c.objects.link(o)
        if shape == 'ellipse':
            o.scale = (d['w'], d['d'], 1)
            o.rotation_euler.z = d.get('rot', 0)
            mat = protos.flat_mat('ds 水洼', (0.10, 0.16, 0.24))
        else:
            o.scale = (d['r'], d['r'], 1)
            mat = protos.flat_mat('ds 油渍', (0.11, 0.105, 0.10))
        o.location = to_bl(d['x'], 0.02, d['z'])
        _set_fields(o, kind, d)
        _style(o, 'SOLID', mat)
    elif shape == 'fence':
        w, dd = (d['len'], 0.5) if d['alongX'] else (0.5, d['len'])
        o = _boxobj(name, c, [w, 1.0, dd], [d['x'], 0, d['z']], mat=protos.flat_mat('ds concrete', schema.MATERIALS['concrete']))
        _set_fields(o, kind, d)
    elif shape == 'building':
        o = _boxobj(name, c, [d['w'], d['h'], d['d']], [d['x'], 0, d['z']], mat=protos.flat_mat(f'ds 远景楼 {d.get("style", 0)}', [(0.42, 0.40, 0.37), (0.33, 0.37, 0.41), (0.47, 0.41, 0.34)][d.get('style', 0) % 3]))
        _set_fields(o, kind, d)
    else:
        raise ValueError(f'不认识的形状 {shape}')
    o.ds.order = order
    o.show_name = kind not in GROUND_KINDS and kind not in BACKDROP_KINDS and kind not in ('collider', 'fence')
    if kind == 'model':
        for i, k in enumerate(d.get('colliders', [])):
            create('collider', k, i, parent=o)
    return o


def refresh_look(o):
    """属性改了以后换原型 / 材质"""
    kind = o.ds.kind
    spec = schema.spec(kind)
    if not spec:
        return
    if spec['shape'] == 'inst' and o.instance_type == 'COLLECTION':
        f = _fields(o)
        key = protos.key_for(kind, f)
        if not o.instance_collection or o.instance_collection.get('ds_proto') != key:
            o.instance_collection = protos.ensure(key, ctx())
    elif spec['shape'] == 'box' and o.material_slots:
        o.material_slots[0].material = box_mat(kind, o.ds)


# ---------- 辅助：场地、网格、网格坐标（不导出） ----------
def helpers(m):
    c = coll('helpers')
    c.hide_select = True
    b = m['bounds']
    yd = m['yard']
    # 沥青场地
    o = bpy.data.objects.new('场地', protos.unit_plane_mesh())
    c.objects.link(o)
    o.scale = (yd['w'], yd['d'], 1)
    _style(o, 'SOLID', protos.flat_mat('ds asphalt', schema.MATERIALS['asphalt']))
    # 网格线：从 bounds 西北角起，每格 grid 米（和 map-check 俯视图的网格一样）
    g = m.get('grid', 2)
    ncol, nrow = mapformat.grid_size(m)
    verts, edges = [], []
    for i in range(ncol + 1):
        x = min(b['minX'] + i * g, b['maxX'])
        verts += [(x, -b['minZ'], 0.03), (x, -b['maxZ'], 0.03)]
        edges.append((len(verts) - 2, len(verts) - 1))
    for j in range(nrow + 1):
        z = min(b['minZ'] + j * g, b['maxZ'])
        verts += [(b['minX'], -z, 0.03), (b['maxX'], -z, 0.03)]
        edges.append((len(verts) - 2, len(verts) - 1))
    me = bpy.data.meshes.new('ds_grid')
    me.from_pydata(verts, edges, [])
    o = bpy.data.objects.new('网格', me)
    c.objects.link(o)
    # 网格坐标：北边一排字母、西边一列数字（平躺在地上，从上往下看是正的），场地外面再各一排
    font_mat = protos.flat_mat('ds 网格字', (0.95, 0.85, 0.4), emit=1.5)
    def text(t, x, z):
        cu = bpy.data.curves.new(f'ds_grid_{t}', 'FONT')
        cu.body = t
        cu.size = 1.1
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.materials.append(font_mat)
        ob = bpy.data.objects.new(f'网格 {t}', cu)
        ob.location = to_bl(x, 0.05, z)
        c.objects.link(ob)
    for i in range(ncol):
        x = b['minX'] + (i + 0.5) * g
        text(mapformat.col_name(i), x, b['minZ'] - 2.4)
        text(mapformat.col_name(i), x, b['maxZ'] + 2.4)
    for j in range(nrow):
        z = b['minZ'] + (j + 0.5) * g
        text(str(j + 1), b['minX'] - 2.6, z)
        text(str(j + 1), b['maxX'] + 2.6, z)


# ---------- 打开地图 ----------
def load(m, path=''):
    if m.get('format') != mapformat.FORMAT:
        raise ValueError('地图不是 format 2（docs/maps.md）')
    clear()
    sc = bpy.context.scene
    keep = {k: v for k, v in m.items() if k not in ('layout', 'entities', 'regions')}
    sc['ds_base'] = json.dumps(keep, ensure_ascii=False)
    lay = m['layout']
    lay_extra = {k: v for k, v in lay.items() if k not in schema.LAYOUT_LISTS and k not in ('objects', 'backdrop')}
    sc['ds_layout_extra'] = json.dumps(lay_extra, ensure_ascii=False)
    sc['ds_path'] = path
    for key, (kind, _) in schema.LAYOUT_LISTS.items():
        for i, d in enumerate(lay.get(key, [])):
            create(kind, d, i)
    for i, d in enumerate(lay.get('objects', [])):
        if not schema.spec(d['type']):
            raise ValueError(f'插件不认识物体类型 {d["type"]}（{d.get("id")}），先更新插件')
        create(d['type'], d, i)
    for key, (kind, _) in schema.BACKDROP_LISTS.items():
        for i, d in enumerate(lay.get('backdrop', {}).get(key, [])):
            create(kind, d, i)
    for i, d in enumerate(m.get('entities', [])):
        if not schema.spec(d['type']):
            raise ValueError(f'插件不认识实体类型 {d["type"]}（{d.get("id")}），先更新插件')
        create(d['type'], d, i)
    for i, d in enumerate(m.get('regions', [])):
        create('region', d, i)
    helpers(m)
    setup_view(m)


def setup_view(m):
    """单位、吸附、视图：按住 Ctrl 拖动按网格吸附，转动每次 15°"""
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    ts = sc.tool_settings
    ts.use_snap = False
    ts.snap_elements = {'INCREMENT'}
    if hasattr(ts, 'use_snap_grid_absolute'):
        ts.use_snap_grid_absolute = True
    if hasattr(ts, 'snap_angle_increment_3d'):
        ts.snap_angle_increment_3d = math.radians(15)
    wm = bpy.context.window_manager
    for area in [a for w in (wm.windows if wm else []) for a in w.screen.areas]:
        if area.type == 'VIEW_3D':
            sp = area.spaces[0]
            sp.shading.type = 'MATERIAL'        # 材质预览：看得到模型的贴图（实体模式只有灰块）
            sp.clip_end = 1000
            sp.overlay.grid_scale = 1
    view_yard(m)


def view_yard(m=None):
    """所有 3D 视图：从正上方看整个场地（北在上）。"框显全部"会把远景楼也框进来，场地就太小了"""
    from mathutils import Quaternion
    m = m or base()
    if not m:
        return
    b = m['bounds']
    span = max(b['maxX'] - b['minX'], b['maxZ'] - b['minZ']) + 14   # 连同场地外的网格坐标
    wm = bpy.context.window_manager
    for area in [a for w in (wm.windows if wm else []) for a in w.screen.areas]:
        if area.type == 'VIEW_3D':
            r3d = area.spaces[0].region_3d
            r3d.view_perspective = 'ORTHO'
            r3d.view_rotation = Quaternion((1, 0, 0, 0))
            r3d.view_location = ((b['minX'] + b['maxX']) / 2, -(b['minZ'] + b['maxZ']) / 2, 0)
            r3d.view_distance = span * 0.9


# ---------- 导出 ----------
def _all():
    root = bpy.data.collections.get(ROOT)
    if not root:
        return []
    out = []
    for c in [root] + list(root.children_recursive):
        if c.name == COLLS['helpers']:
            continue
        out += [o for o in c.objects if o.ds.kind and o.ds.kind != 'collider']
    return out


def _aabb(o, space=None):
    """单位方块 / 平面在 space（默认世界）里的包围盒 → (min, max)"""
    M = (space.inverted() @ o.matrix_world) if space is not None else o.matrix_world
    pts = [M @ Vector(v.co) for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _quarter_warn(o, rot, warns):
    q = round(rot / HALF_PI)
    if abs(rot - q * HALF_PI) > math.radians(1):
        warns.append(f'{o.name} 转了 {math.degrees(rot):.0f}°，游戏里只认 90° 的倍数，按 {q * 90 % 360}° 导出')
    return q


ID_RE = re.compile(r'^[A-Z]+\d+$')


def assign_ids(objs):
    """编号：名字不是"前缀 + 数字"、或者重复的（复制出来的 C1.001），换成同类里最大的数字 + 1，并改掉物体名字"""
    used = set()
    renamed = []
    pending = []
    for o in sorted(objs, key=lambda o: o.ds.order):
        if o.ds.kind == 'region':
            continue
        n = o.name
        if ID_RE.match(n) and n not in used:
            used.add(n)
        else:
            pending.append(o)
    for o in pending:
        new = mapformat.next_id(mapformat.PREFIX.get(o.ds.kind, 'X'), used)
        used.add(new)
        renamed.append(f'{o.name} → {new}')
        o.name = new
    return renamed


def _ordered(fields, d):
    """按 schema 的字段顺序排；带 ? 的字段没有值就不写"""
    out = {}
    for f in fields:
        k = f.rstrip('?')
        if k in d and d[k] is not None:
            if f.endswith('?') and d[k] in (0, False) and k in ('y', 'rot', 'alongZ'):
                continue
            out[k] = d[k]
    return out


def _dump_one(o, warns):
    kind = o.ds.kind
    spec = schema.spec(kind)
    shape = spec['shape']
    d = {}
    if shape == 'inst':
        x, y, z = o.matrix_world.translation.x, o.matrix_world.translation.z, -o.matrix_world.translation.y
        d.update(x=x, y=y, z=z)
        r, rot = spec.get('rot'), o.rotation_euler.z
        if r in ('rot', 'yaw'):
            d[r] = rot
        elif r:
            q = _quarter_warn(o, rot, warns)
            field, when0 = r
            odd = q % 2 == 1
            d[field] = odd if when0 == 1 else not odd
    elif shape == 'box':
        lo, hi = _aabb(o)
        for ax in (o.rotation_euler.z,):
            _quarter_warn(o, ax, warns)
        d['size'] = [hi.x - lo.x, hi.z - lo.z, hi.y - lo.y]
        d['pos'] = [(lo.x + hi.x) / 2, lo.z, -(lo.y + hi.y) / 2]
    elif shape in ('rect', 'region'):
        lo, hi = _aabb(o)
        d.update(x=(lo.x + hi.x) / 2, z=-(lo.y + hi.y) / 2, w=hi.x - lo.x, d=hi.y - lo.y)
        if shape == 'region':
            d['name'] = o.name.split('.')[0]
    elif shape == 'ellipse':
        d.update(x=o.location.x, z=-o.location.y, w=abs(o.scale.x), d=abs(o.scale.y), rot=o.rotation_euler.z)
    elif shape == 'disc':
        d.update(x=o.location.x, z=-o.location.y, r=abs(o.scale.x))
    elif shape == 'fence':
        lo, hi = _aabb(o)
        w, dd = hi.x - lo.x, hi.y - lo.y
        d.update(len=max(w, dd), x=(lo.x + hi.x) / 2, z=-(lo.y + hi.y) / 2, alongX=w >= dd)
    elif shape == 'building':
        lo, hi = _aabb(o)
        d.update(w=hi.x - lo.x, h=hi.z - lo.z, d=hi.y - lo.y, x=(lo.x + hi.x) / 2, z=-(lo.y + hi.y) / 2)
    d.update(_fields(o))
    out = {}
    if kind == 'region':
        out['id'] = o.ds.rid or re.sub(r'\W', '', o.name) or 'region'
    else:
        out['id'] = o.name
    is_layout_list = kind in ('pad', 'puddle', 'stain', 'fence') or kind in BACKDROP_KINDS or kind == 'region'
    if not is_layout_list:
        out['type'] = kind
    out.update(_ordered(spec['fields'], d))
    if o.ds.extra:
        out.update(json.loads(o.ds.extra))
    if o.ds.note:
        out['note'] = o.ds.note
    if kind == 'model':
        kids = sorted([k for k in o.children if k.ds.kind == 'collider'], key=lambda k: k.ds.order)
        if kids:
            out['colliders'] = [_dump_collider(k, o, warns) for k in kids]
    return out


def _dump_collider(k, parent, warns):
    """模型的碰撞：坐标相对模型（没转过时的），所以在模型自己的空间里取包围盒"""
    lo, hi = _aabb(k, parent.matrix_world)
    c = {'size': [hi.x - lo.x, hi.z - lo.z, hi.y - lo.y], 'pos': [(lo.x + hi.x) / 2, lo.z, -(lo.y + hi.y) / 2]}
    c.update({f: v for f, v in _fields(k).items() if f in ('material', 'shoot')})
    if k.ds.note:
        c['note'] = k.ds.note
    return c


def dump():
    """场景 → 地图 dict。返回 (地图, 提醒列表, 改了编号的列表)"""
    b = base()
    if not b:
        raise ValueError('还没有打开地图：先点"打开地图"')
    objs = _all()
    renamed = assign_ids(objs)
    warns = []
    by = lambda kind: [_dump_one(o, warns) for o in sorted([o for o in objs if o.ds.kind == kind], key=lambda o: o.ds.order)]
    m = dict(b)
    lay = {}
    for key, (kind, _) in schema.LAYOUT_LISTS.items():
        lay[key] = by(kind)
    lay.update(json.loads(bpy.context.scene.get('ds_layout_extra') or '{}'))
    lay['objects'] = [_dump_one(o, warns) for o in sorted([o for o in objs if o.ds.kind in schema.OBJECTS], key=lambda o: o.ds.order)]
    lay['backdrop'] = {key: by(kind) for key, (kind, _) in schema.BACKDROP_LISTS.items()}
    m['layout'] = lay
    m['entities'] = [_dump_one(o, warns) for o in sorted([o for o in objs if o.ds.kind in schema.ENTITIES], key=lambda o: o.ds.order)]
    m['regions'] = by('region')
    return m, warns, renamed


# ---------- 添加 ----------
DEFAULTS = {
    'container': {'color': '#2f5f8f', 'label': 'DSCU 000001'},
    'sandbags': {'len': 3},
    'barrel': {'material': 'barrelRed'},
    'truck': {'color': '#2f5d8c'},
    'box': {'size': [1, 1, 1], 'material': 'concrete'},
    'blocker': {'size': [1, 2, 1]},
    'note': {'text': ''},
    'region': {'name': '新区域', 'w': 6, 'd': 6},
}


def add(kind, at):
    """在 at（Blender 坐标）放一个新的；位置吸附到 0.5 米"""
    x, z = round(at.x * 2) / 2, round(-at.y * 2) / 2
    d = dict(DEFAULTS.get(kind, {}))
    if schema.spec(kind)['shape'] == 'box':
        d['pos'] = [x, 0, z]
    else:
        d.update(x=x, z=z)
    if kind == 'region':
        d['id'] = ''
    objs = _all()
    used = {o.name for o in objs}
    d['id'] = d.get('id') if kind == 'region' else mapformat.next_id(mapformat.PREFIX.get(kind, 'X'), used)
    # 排在同一个数组（物体 / 实体 / 区域…）的最后，导出时新东西在文件末尾
    same = lambda k: (k in schema.OBJECTS) if kind in schema.OBJECTS else (k in schema.ENTITIES) if kind in schema.ENTITIES else (k == kind)
    order = max([o.ds.order for o in objs if same(o.ds.kind)] or [0]) + 1
    o = create(kind, d, order)
    if kind == 'region':
        o.ds.rid = mapformat.next_id('region', {x.ds.rid for x in objs if x.ds.kind == 'region'})
    return o
