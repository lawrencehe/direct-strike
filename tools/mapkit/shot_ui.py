# 在虚拟显示器（xvfb-run）里开真正的 Blender 界面，打开 yard、选中 C4、打开侧栏，截图（#115）。
# 用来检查面板能正常画出来（后台模式不画界面），截图也给教程和 PR 用：
#   xvfb-run -a -s "-screen 0 1600x1000x24" blender --factory-startup --enable-event-simulate --python tools/mapkit/shot_ui.py -- <输出目录>
import os
import subprocess
import sys
import traceback

import addon_utils
import bpy

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
mod = next(m.__name__ for m in addon_utils.modules() if m.__name__.endswith('ds_mapkit'))
addon_utils.enable(mod, default_set=True)
pkg = sys.modules[mod]
errors = []
EACH = ['S1', 'S4', 'N1', 'R1', 'TG5', 'B1', 'B7', 'SB1', 'J1', 'A1', 'T1', 'P1', 'TR1', 'L1', 'M1', 'collider', 'F1', 'PAD1', 'PUD1', 'STN1', 'BG1', 'CR1', 'WT1', 'region']
TAB_Y = int(sys.argv[sys.argv.index('--') + 2]) if len(sys.argv) > sys.argv.index('--') + 2 else 655   # 标签的高度（窗口坐标，从下往上）


def shot(name):
    # Blender 自己的截图在软件渲染下是黑的，用 ImageMagick 直接截虚拟显示器
    subprocess.run(['import', '-window', 'root', os.path.join(OUT, name)], check=True)


def view3d():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    region = next(r for r in area.regions if r.type == 'WINDOW')
    return win, area, region


def step(n=[0]):
    try:
        win, area, region = view3d()
        with bpy.context.temp_override(window=win, area=area, region=region):
            if n[0] == 0:
                src = os.path.join(os.path.dirname(pkg.__file__), 'maps', 'yard.json')
                bpy.ops.ds.open_builtin(map=src)
                for name in ('Cube', 'Camera', 'Light'):
                    if name in bpy.data.objects:
                        bpy.data.objects.remove(bpy.data.objects[name])
                sp = area.spaces[0]
                sp.show_region_ui = True
                # 侧栏的标签页不能直接设，模拟"鼠标放在侧栏上按住 Ctrl 滚轮"切到 Direct-Strike（要 --enable-event-simulate）
                ui = next(r for r in area.regions if r.type == 'UI')
                win.event_simulate(type='ESC', value='PRESS')      # 关掉启动画面
                win.event_simulate(type='ESC', value='RELEASE')
                tab = (ui.x + ui.width - 10, TAB_Y)                 # 侧栏右边竖着的标签，Direct-Strike 是最下面一个
                win.event_simulate(type='MOUSEMOVE', value='NOTHING', x=tab[0], y=tab[1])
                win.event_simulate(type='LEFTMOUSE', value='PRESS', x=tab[0], y=tab[1])
                win.event_simulate(type='LEFTMOUSE', value='RELEASE', x=tab[0], y=tab[1])
                c4 = bpy.data.objects['C4']
                c4.select_set(True)
                bpy.context.view_layer.objects.active = c4
            elif n[0] == 2:
                shot('ui-top.png')
                print('SHOT', os.path.join(OUT, 'ui-top.png'))
                # 斜着看一眼
                r3d = area.spaces[0].region_3d
                from mathutils import Euler
                r3d.view_perspective = 'PERSP'
                r3d.view_rotation = Euler((0.95, 0, 0.5)).to_quaternion()
                r3d.view_distance = 38
            elif n[0] == 4:
                shot('ui-persp.png')
                print('SHOT', os.path.join(OUT, 'ui-persp.png'))
            elif n[0] - 5 < len(EACH):
                # 每种东西选中一次，让"选中的"面板把每种类型都画一遍（画面板出错会打印 Traceback，测试里查）
                name = EACH[n[0] - 5]
                o = bpy.data.objects.get(name) or next(x for x in bpy.data.objects if x.ds.kind == name)
                for x in bpy.context.selected_objects:
                    x.select_set(False)
                o.select_set(True)
                bpy.context.view_layer.objects.active = o
                for r in area.regions:
                    r.tag_redraw()
                print('SELECT', o.name, o.ds.kind)
            else:
                print('UI DONE')
                bpy.ops.wm.quit_blender()
                return None
    except Exception:   # noqa: BLE001
        traceback.print_exc()
        bpy.ops.wm.quit_blender()
        return None
    n[0] += 1
    return 6 if n[0] in (2, 4) else 0.6 if n[0] > 4 else 1.5      # 材质预览要先编译着色器（软件渲染很慢），截图前多等一会


bpy.app.timers.register(step, first_interval=2)
