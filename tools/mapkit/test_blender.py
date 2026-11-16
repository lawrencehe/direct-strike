# Blender 地图工具的测试（#115），在 Blender 里跑（tools/tests/mapkit.mjs 调用）：
#   blender -b --factory-startup --python tools/mapkit/test_blender.py -- <输出目录> [--render]
# 插件要先装好（mapkit.mjs 用 Blender 的 extension install-file 装进临时的用户目录，和负责人"从磁盘安装"一样）。
# 1. 打开自带的 yard，原样导出，和 maps/yard.json 逐字节相同（往返不丢东西、不改排版）
# 2. 模拟负责人的操作：挪集装箱、转 90°、复制、加出生点 / 备注 / 区域、挪中央平台，导出后检查字段
# 3. --render：渲染两张预览图（俯视、斜上方），给 PR 和教程用
import json
import math
import os
import sys

import addon_utils
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/ds-mapkit'
os.makedirs(OUT, exist_ok=True)
fails = []


def check(ok, name, info=''):
    print(('PASS' if ok else 'FAIL'), name, info)
    if not ok:
        fails.append(name)


mod = next((m.__name__ for m in addon_utils.modules() if m.__name__.endswith('ds_mapkit')), None)
check(mod is not None, '插件装上了', mod)
addon_utils.enable(mod, default_set=True)
pkg = sys.modules[mod]
scene, mapformat = pkg.scene, pkg.mapformat
kit = os.path.dirname(pkg.__file__)
src = os.path.join(kit, 'maps', 'yard.json')
text = open(src, encoding='utf-8').read()

# ---------- 1. 往返 ----------
bpy.ops.ds.open_builtin(map=src)
m, warns, renamed = scene.dump()
out = mapformat.dumps(m)
open(os.path.join(OUT, 'roundtrip.json'), 'w', encoding='utf-8').write(out)
check(out == text, '打开再导出和原文件逐字节相同', '' if out == text else 'diff tools/out/mapkit-test/roundtrip.json maps/yard.json')
check(not warns and not renamed, '没有提醒、没有改编号', (warns, renamed))
O = bpy.data.objects
check(O['C1'].instance_collection is not None and len(O['C1'].instance_collection.all_objects) > 0, '集装箱显示的是模型', O['C1'].instance_collection.name)
ncol = len(json.loads(text)['layout']['objects'][4]['colliders'])
check(len([o for o in O['M1'].children if o.ds.kind == 'collider']) == ncol, f'中央平台带着 {ncol} 个碰撞方块')

# ---------- 2. 模拟编辑 ----------
c1 = O['C1']
c1.location.x += 2                         # 往东 2 米
c1.rotation_euler.z = math.radians(90)     # 转 90° → alongZ
dup = c1.copy()                             # Shift+D：名字变成 C1.001
c1.users_collection[0].objects.link(dup)
dup.location.y -= 4                         # 往南 4 米（Blender 的 -Y 是游戏的 +z）
O['M1'].location.x += 1                    # 平台往东 1 米，碰撞跟着走
O['S2'].ds.start = True                    # 开局点换成 S2（S1 自动取消）
O['SB1'].ds.length = '4'
O['B1'].ds.paint = 'barrelGrey'
bpy.context.scene.cursor.location = (3, -5, 0)
bpy.ops.ds.add(kind='spawn')
spawn_new = bpy.context.active_object
spawn_new.rotation_euler.z = math.radians(-90)
bpy.ops.ds.add(kind='note')
note = bpy.context.active_object
note.ds.text = '这里想放一堆轮胎'
bpy.context.scene.cursor.location = (-3, -5, 0)   # 方块放到别处，别把新出生点压在里面（map-check 会查出来）
bpy.ops.ds.add(kind='box')
bx = bpy.context.active_object
bx.scale = (2, 1, 1.5)
bpy.ops.ds.add(kind='region')

path = os.path.join(OUT, 'edited.json')
r = bpy.ops.ds.export_map(filepath=path)
check(r == {'FINISHED'}, '导出成功', bpy.context.scene.get('ds_report'))
e = json.load(open(path, encoding='utf-8'))
objs = {o['id']: o for o in e['layout']['objects']}
ents = {o['id']: o for o in e['entities']}
check(objs['C1']['x'] == -7 and objs['C1']['z'] == 14 and objs['C1']['alongZ'] is True, 'C1 往东 2 米、转成沿南北', objs['C1'])
check('C9' in objs and objs['C9']['z'] == 18 and objs['C9']['color'] == objs['C1']['color'], '复制出来的箱子编号 C9、往南 4 米', objs.get('C9'))
check(O.get('C9') is not None, 'Blender 里的名字也改成了 C9')
m1 = objs['M1']
check(m1['x'] == 1.75 and m1['colliders'] == json.loads(text)['layout']['objects'][4]['colliders'], '平台挪了，碰撞的相对坐标不变', m1['colliders'][0])
check(ents['S2'].get('start') is True and 'start' not in ents['S1'], '开局点换成 S2', (ents['S1'], ents['S2']))
check(objs['SB1']['len'] == 4 and objs['B1']['material'] == 'barrelGrey', '沙袋长度、油桶漆色', (objs['SB1'], objs['B1']))
check(ents['S7'] == {'id': 'S7', 'type': 'spawn', 'x': 3, 'z': 5, 'yaw': -1.5708}, '新加的出生点 S7 在 (3, 5)、朝东', ents['S7'])
check(ents['NOTE1']['text'] == '这里想放一堆轮胎', '备注', ents['NOTE1'])
check(objs['X1']['size'] == [2, 1.5, 1] and objs['X1']['pos'] == [-3, 0, 5], '新方块 X1 的尺寸和位置', objs['X1'])
check(e['regions'][-1]['id'] == 'region1' and e['regions'][-1]['name'] == '新区域' and e['regions'][-1]['x'] == -3, '新区域', e['regions'][-1])
check(mapformat.check(e)[0] == [], '导出的地图通过检查')

# 错误：开局点没了就不让导出
for o in O:
    if o.ds.kind == 'spawn':
        o.ds.start = False
try:
    r = bpy.ops.ds.export_map(filepath=os.path.join(OUT, 'bad.json'))
except RuntimeError:          # 操作报了 ERROR，后台运行时会变成异常
    r = {'CANCELLED'}
check(r == {'CANCELLED'} and not os.path.exists(os.path.join(OUT, 'bad.json')), '没有开局点时不导出', bpy.context.scene.get('ds_report'))

# ---------- 3. 预览图 ----------
if '--render' in argv:
    bpy.ops.ds.open_builtin(map=src)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 16
    sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.world = w
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    for name, loc, rot in [('preview-top', (0, 0, 75), (0, 0, 0)), ('preview-persp', (24, -40, 26), (math.radians(60), 0, math.radians(32)))]:
        cam.location, cam.rotation_euler = loc, rot
        # 俯视用正交相机，整个场地连同网格坐标都拍进来
        cam.data.type = 'ORTHO' if name == 'preview-top' else 'PERSP'
        cam.data.ortho_scale = 62
        sc.render.resolution_x, sc.render.resolution_y = (1000, 1250) if name == 'preview-top' else (1280, 800)
        sc.render.filepath = os.path.join(OUT, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('RENDER', sc.render.filepath)

print('RESULT', 'OK' if not fails else f'{len(fails)} FAIL')
sys.exit(1 if fails else 0)
