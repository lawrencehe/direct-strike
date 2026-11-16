# 地图文件（maps/*.json，格式 v2）的纯 Python 部分：写成固定排版的 JSON、网格坐标、编号、导出前检查（#115）。
# 不依赖 bpy：Blender 插件和命令行脚本共用，导出的文件和仓库里的排版一模一样，git diff 只显示真正改了的行。
import json
import math
import re

FORMAT = 2

# 顶层和 layout 里字段的顺序（写文件时按这个顺序，没列的排在后面）
TOP_ORDER = ['format', 'id', 'name', 'grid', 'yard', 'bounds', 'shadowRange', 'surfaces', 'environment', 'models',
             'layout', 'entities', 'regions']
LAYOUT_ORDER = ['pads', 'puddles', 'stains', 'debris', 'fences', 'objects', 'backdrop']


def clean_number(v, places=4):
    """浮点数去掉误差：保留 places 位小数，整数写成整数（JSON 里 2.0 和 2 一样，但排版要一致）"""
    if isinstance(v, bool) or not isinstance(v, float):
        return v
    r = round(v, places)
    if r == 0:
        return 0
    return int(r) if r.is_integer() else r


def clean(v, places=4):
    if isinstance(v, dict):
        return {k: clean(x, places) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x, places) for x in v]
    return clean_number(v, places)


def _scalar(v):
    return json.dumps(v, ensure_ascii=False)


def _is_obj_list(v):
    return isinstance(v, list) and v and all(isinstance(x, dict) for x in v)


def _inline(v, ind):
    """一行写完的值；值里面有"对象数组"（比如模型的 colliders）时，那个数组展开成多行"""
    if isinstance(v, dict):
        if not v:
            return '{}'
        return '{ ' + ', '.join(f'{_scalar(k)}: {_value(x, ind)}' for k, x in v.items()) + ' }'
    if isinstance(v, list):
        return '[' + ', '.join(_inline(x, ind) for x in v) + ']'
    return _scalar(v)


def _value(v, ind):
    if _is_obj_list(v):
        pad = ' ' * (ind + 2)
        return '[\n' + ',\n'.join(pad + _inline(x, ind + 2) for x in v) + '\n' + ' ' * ind + ']'
    return _inline(v, ind)


def _block(d, ind, order=None):
    """多行写的对象：每个字段一行"""
    keys = list(d.keys())
    if order:
        keys = [k for k in order if k in d] + [k for k in keys if k not in order]
    pad = ' ' * (ind + 2)
    lines = []
    for k in keys:
        v = d[k]
        if isinstance(v, dict) and any(_is_obj_list(x) for x in v.values()):
            body = _block(v, ind + 2, LAYOUT_ORDER if k == 'layout' else None)
        else:
            body = _value(v, ind + 2)
        lines.append(f'{pad}{_scalar(k)}: {body}')
    return '{\n' + ',\n'.join(lines) + '\n' + ' ' * ind + '}'


def dumps(m):
    """地图 dict → 固定排版的 JSON 文本（顶层和 layout 每个字段一行，数组里每个物体一行）"""
    return _block(clean(m), 0, TOP_ORDER) + '\n'


# ---------- 网格坐标：字母是东西（从西往东 A、B、C…），数字是南北（从北往南 1、2、3…），每格 grid 米 ----------
def col_name(i):
    s = ''
    i += 1
    while i > 0:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def grid_cell(m, x, z):
    """世界坐标 → 网格名，比如 F9。原点是 bounds 的西北角"""
    g = m.get('grid', 2)
    b = m['bounds']
    return f"{col_name(max(0, math.floor((x - b['minX']) / g)))}{max(0, math.floor((z - b['minZ']) / g)) + 1}"


def grid_size(m):
    g = m.get('grid', 2)
    b = m['bounds']
    return math.ceil((b['maxX'] - b['minX']) / g - 1e-6), math.ceil((b['maxZ'] - b['minZ']) / g - 1e-6)


# ---------- 编号 ----------
# 物体类型 → 编号前缀。同一前缀里按数字递增，新加的物体取最大的数字 + 1
PREFIX = {
    'lampPost': 'L', 'model': 'M', 'container': 'C', 'jersey': 'J', 'sandbags': 'SB', 'barrel': 'B', 'barrelLying': 'B',
    'tires': 'T', 'ammoCrates': 'A', 'palletStack': 'P', 'truck': 'TR', 'box': 'X', 'blocker': 'K', 'proxy': 'X',
    'cableReel': 'R',
    'pad': 'PAD', 'puddle': 'PUD', 'stain': 'STN', 'fence': 'F', 'building': 'BG', 'crane': 'CR', 'waterTower': 'WT',
    'spawn': 'S', 'nav': 'N', 'rangeSpawn': 'R', 'target': 'TG', 'note': 'NOTE',
}


def next_id(prefix, used):
    pat = re.compile(re.escape(prefix) + r'(\d+)$')
    n = max([int(mt.group(1)) for u in used if (mt := pat.match(u))] or [0])
    return f'{prefix}{n + 1}'


# ---------- 导出前检查（游戏和 map-check 还会再查一遍；这里只查 Blender 里就能发现的） ----------
def check(m):
    """返回 (错误列表, 提醒列表)。有错误时游戏不能用这张图"""
    errors, warns = [], []
    ents = m.get('entities', [])
    spawns = [e for e in ents if e['type'] == 'spawn']
    if len(spawns) < 4:
        errors.append(f'出生点只有 {len(spawns)} 个，至少要 4 个')
    starts = [e['id'] for e in spawns if e.get('start')]
    if len(starts) != 1:
        errors.append(f'要有且只有一个"玩家开局"的出生点（现在 {len(starts)} 个：{", ".join(starts) or "无"}）')
    fb = [e for e in spawns if e.get('fallback')]
    if len(fb) != 1:
        errors.append(f'要有且只有一个"兜底"出生点（现在 {len(fb)} 个）')
    elif fb[0]['z'] >= 0:
        warns.append(f'兜底出生点 {fb[0]["id"]} 应该在北边（z < 0）')
    if not any(e['z'] < 0 for e in spawns):
        errors.append('北边（z < 0）没有出生点，NPC 没地方出生')
    if len([e for e in ents if e['type'] == 'nav']) < 2:
        errors.append('巡逻点少于 2 个，NPC 没法巡逻')
    if len([e for e in ents if e['type'] == 'rangeSpawn']) != 1:
        errors.append('训练场出生点要有且只有一个')
    ids = {}
    groups = [m['layout'].get(k, []) for k in ('pads', 'puddles', 'stains', 'fences', 'objects')]
    groups += [m['layout'].get('backdrop', {}).get(k, []) for k in ('buildings', 'cranes', 'waterTowers')]
    groups += [ents, m.get('regions', [])]
    for g in groups:
        for o in g:
            if o.get('id') in ids:
                errors.append(f'编号重复：{o["id"]}')
            ids[o.get('id')] = True
    b = m['bounds']
    for e in ents:
        if e['type'] in ('spawn', 'nav') and not (b['minX'] <= e['x'] <= b['maxX'] and b['minZ'] <= e['z'] <= b['maxZ']):
            errors.append(f'{e["id"]} 在场地外面')
    return errors, warns
