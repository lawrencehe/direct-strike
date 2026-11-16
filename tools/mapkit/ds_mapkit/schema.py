# 地图里每种东西在 Blender 里怎么表示、导出时写哪些字段（#115）。纯 Python，不依赖 bpy。
# 加新的物体类型：游戏里在 js/world.js 的 builders 加造型，这里加一项，Blender 里就能放、能导出。
#
# shape（在 Blender 里的样子）：
#   inst   空物体 + 原型（集合实例）：位置 x / y / z，朝向按 rot 规则
#   box    单位方块缩放：size [w, h, d] + pos [x, y(底), z]，导出时取包围盒（碰撞盒只能是正的方块）
#   rect   地上的长方形（水泥地块）x, z, w, d
#   ellipse 地上的椭圆（水洼）x, z, w, d 是半轴，rot 转角
#   disc   地上的圆（油渍）x, z, r
#   fence  围栏 len, x, z, alongX
#   building 远景楼 w, h, d, x, z
#   region 区域（只给人看）x, z, w, d
#
# rot（inst 的朝向怎么写进文件）：
#   None          不管朝向（导出时忽略 Blender 里的转动）
#   'rot'         写成 rot 字段（弧度，任意角度）
#   'yaw'         写成 yaw 字段（出生点朝向，0 朝北）
#   ('alongZ', 1) 转 90° 时写 alongZ: true（只认 90° 的倍数）
#   ('alongX', 0) 不转时写 alongX: true，转 90° 时 false

# 物体（layout.objects）
OBJECTS = {
    'container':   dict(label='集装箱', shape='inst', rot=('alongZ', 1), fields=['x', 'y', 'z', 'alongZ', 'color', 'label'], size=(6, 2.6, 2.44)),
    'jersey':      dict(label='隔离墩', shape='inst', rot=('alongX', 0), fields=['x', 'z', 'alongX'], size=(2.4, 0.85, 0.5)),
    'sandbags':    dict(label='沙袋墙', shape='inst', rot=('alongZ', 1), fields=['len', 'x', 'y?', 'z', 'alongZ?'], size=(3, 0.9, 0.6)),
    'barrel':      dict(label='油桶', shape='inst', rot=None, fields=['x', 'z', 'material'], size=(0.6, 0.9, 0.6)),
    'barrelLying': dict(label='倒着的油桶', shape='inst', rot=None, fields=['x', 'z'], size=(0.9, 0.6, 0.9)),
    'ammoCrates':  dict(label='弹药箱堆', shape='inst', rot=('alongZ', 1), fields=['x', 'z', 'alongZ?'], size=(1.24, 1.02, 1.02)),
    'tires':       dict(label='轮胎堆', shape='inst', rot=None, fields=['x', 'z'], size=(0.95, 0.8, 0.95)),
    'palletStack': dict(label='木托盘堆', shape='inst', rot=None, fields=['x', 'z'], size=(1.2, 1.6, 1.0)),
    'cableReel':   dict(label='电缆盘', shape='inst', rot=None, fields=['x', 'z'], size=(1.5, 1.1, 1.5)),
    'truck':       dict(label='货车（车头朝北）', shape='inst', rot=None, fields=['x', 'z', 'color'], size=(2.5, 3.3, 7.7)),
    'lampPost':    dict(label='灯柱', shape='inst', rot=None, fields=['x', 'z'], size=(0.2, 7, 0.2)),
    'model':       dict(label='模型', shape='inst', rot='rot', fields=['model', 'x', 'y?', 'z', 'rot?'], size=(1, 1, 1)),
    'box':         dict(label='方块', shape='box', fields=['size', 'pos', 'material', 'collide?', 'shoot?']),
    'blocker':     dict(label='空气墙（看不见的碰撞）', shape='box', fields=['size', 'pos']),
    'proxy':       dict(label='碰撞方块', shape='box', fields=['size', 'pos', 'model?', 'material?', 'shoot?']),
}

# 地面、围栏、远景（layout 里的其他数组）：layout 的键 → 类型
LAYOUT_LISTS = {
    'pads':     ('pad', dict(label='水泥地块', shape='rect', fields=['x', 'z', 'w', 'd'])),
    'puddles':  ('puddle', dict(label='水洼', shape='ellipse', fields=['x', 'z', 'w', 'd', 'rot'])),
    'stains':   ('stain', dict(label='油渍', shape='disc', fields=['x', 'z', 'r'])),
    'fences':   ('fence', dict(label='围栏', shape='fence', fields=['len', 'x', 'z', 'alongX'])),
}
BACKDROP_LISTS = {
    'buildings':   ('building', dict(label='远景楼', shape='building', fields=['w', 'h', 'd', 'x', 'z', 'style'])),
    'cranes':      ('crane', dict(label='龙门吊', shape='inst', rot=None, fields=['x', 'z'], size=(22, 26, 1.6))),
    'waterTowers': ('waterTower', dict(label='水塔', shape='inst', rot=None, fields=['x', 'z'], size=(8, 23, 8))),
}

# 玩法实体（entities）
ENTITIES = {
    'spawn':      dict(label='出生点', shape='inst', rot='yaw', fields=['x', 'z', 'yaw', 'start?', 'fallback?']),
    'nav':        dict(label='巡逻点', shape='inst', rot=None, fields=['x', 'z']),
    'rangeSpawn': dict(label='训练场出生点', shape='inst', rot='yaw', fields=['x', 'y', 'z', 'yaw']),
    'target':     dict(label='靶子', shape='inst', rot=None, fields=['x', 'z', 'move?']),
    'note':       dict(label='备注', shape='inst', rot=None, fields=['x', 'z', 'text']),
}

REGION = dict(label='区域', shape='region', fields=['name', 'x', 'z', 'w', 'd'])

# 方块能用的材质（world.js 的 mats）和在 Blender 里显示的颜色
MATERIALS = {
    'asphalt': (0.18, 0.18, 0.19), 'dirt': (0.36, 0.30, 0.22), 'concrete': (0.60, 0.59, 0.56), 'concreteDark': (0.42, 0.41, 0.39),
    'sandbag': (0.55, 0.48, 0.34), 'wood': (0.50, 0.36, 0.22), 'metal': (0.55, 0.57, 0.60), 'metalDark': (0.22, 0.23, 0.25),
    'rubber': (0.08, 0.08, 0.09), 'barrelRed': (0.54, 0.18, 0.14), 'barrelBlue': (0.18, 0.31, 0.48), 'barrelGrey': (0.37, 0.39, 0.40),
}
BARREL_PAINTS = ['barrelRed', 'barrelBlue', 'barrelGrey']
SANDBAG_LENS = [2, 3, 4]

# 物体类型的显示顺序（Blender 面板上"添加"按钮）
ADD_OBJECTS = ['container', 'jersey', 'sandbags', 'barrel', 'barrelLying', 'ammoCrates', 'tires', 'palletStack', 'truck', 'lampPost', 'box', 'blocker']
ADD_ENTITIES = ['spawn', 'nav', 'target', 'note']


def spec(kind):
    """类型名 → 规格。物体、实体、地面、远景、区域、模型的碰撞方块都在这里查"""
    if kind in OBJECTS:
        return OBJECTS[kind]
    if kind in ENTITIES:
        return ENTITIES[kind]
    for k, s in list(LAYOUT_LISTS.values()) + list(BACKDROP_LISTS.values()):
        if k == kind:
            return s
    if kind == 'region':
        return REGION
    if kind == 'collider':
        return dict(label='模型的碰撞方块', shape='box', fields=['size', 'pos', 'material?', 'shoot?'])
    return None
