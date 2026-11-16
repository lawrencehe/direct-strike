# 侧栏面板"Direct-Strike"和按钮（#115）。在 3D 视图里按 N 打开侧栏。
import glob
import json
import os

import bpy
from bpy.props import EnumProperty, StringProperty
from bpy_extras.io_utils import ExportHelper, ImportHelper

from . import mapformat, protos, scene, schema


def _report_lines(lines):
    bpy.context.scene['ds_report'] = '\n'.join(lines)


def builtin_maps():
    return sorted(glob.glob(os.path.join(protos.KIT_DIR, 'maps', '*.json')))


# ---------- 打开 ----------
def _open(op, path):
    try:
        with open(path, encoding='utf-8') as f:
            m = json.load(f)
        scene.load(m, path)
    except Exception as e:   # noqa: BLE001  打开失败要告诉用户原因
        op.report({'ERROR'}, f'打开失败：{e}')
        return {'CANCELLED'}
    _report_lines([f'已打开「{m.get("name")}」：{len(m["layout"]["objects"])} 个物体，{len(m["entities"])} 个点位'])
    op.report({'INFO'}, f'已打开 {os.path.basename(path)}')
    return {'FINISHED'}


class DS_OT_open(bpy.types.Operator, ImportHelper):
    bl_idname = 'ds.open_map'
    bl_label = '打开地图文件…'
    bl_description = '打开一个地图 JSON（游戏的 maps/*.json，或者你之前导出的）。会清掉当前的地图'
    filename_ext = '.json'
    filter_glob: StringProperty(default='*.json', options={'HIDDEN'})

    def execute(self, context):
        return _open(self, self.filepath)


def _builtin_items(self, context):
    return [(p, os.path.splitext(os.path.basename(p))[0], '') for p in builtin_maps()] or [('', '（没有）', '')]


class DS_OT_open_builtin(bpy.types.Operator):
    bl_idname = 'ds.open_builtin'
    bl_label = '打开游戏自带的地图'
    bl_description = '打开插件里带的地图（和插件同一个版本的线上地图）。会清掉当前的地图'
    bl_property = 'map'
    map: EnumProperty(name='地图', items=_builtin_items)

    def invoke(self, context, event):
        items = builtin_maps()
        if len(items) == 1:
            self.map = items[0]
            return self.execute(context)
        context.window_manager.invoke_search_popup(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        if not self.map:
            return {'CANCELLED'}
        return _open(self, self.map)


# ---------- 导出 ----------
def _export(op, path):
    try:
        m, warns, renamed = scene.dump()
    except Exception as e:   # noqa: BLE001
        op.report({'ERROR'}, f'导出失败：{e}')
        return {'CANCELLED'}
    errors, w2 = mapformat.check(m)
    lines = [f'编号：{r}' for r in renamed] + [f'提醒：{w}' for w in warns + w2]
    if errors:
        _report_lines([f'错误：{e}' for e in errors] + lines + ['有错误，没有导出。改好再导出'])
        op.report({'ERROR'}, f'有 {len(errors)} 个错误，没有导出（看面板最下面）')
        return {'CANCELLED'}
    with open(path, 'w', encoding='utf-8') as f:
        f.write(mapformat.dumps(m))
    context = bpy.context
    context.scene['ds_export_path'] = path
    _report_lines([f'已导出：{path}', '下一步：游戏里 设置 → 开发者 → 载入地图文件'] + lines)
    op.report({'INFO'}, f'已导出 {os.path.basename(path)}')
    return {'FINISHED'}


class DS_OT_export(bpy.types.Operator, ExportHelper):
    bl_idname = 'ds.export_map'
    bl_label = '导出地图…'
    bl_description = '检查一遍，存成游戏用的地图 JSON（在游戏的开发者设置里载入）'
    filename_ext = '.json'
    filter_glob: StringProperty(default='*.json', options={'HIDDEN'})

    def invoke(self, context, event):
        last = context.scene.get('ds_export_path')
        b = scene.base() or {}
        self.filepath = last or os.path.join(os.path.expanduser('~'), f'{b.get("id", "map")}.json')
        return super().invoke(context, event)

    def execute(self, context):
        return _export(self, self.filepath)


class DS_OT_export_again(bpy.types.Operator):
    bl_idname = 'ds.export_again'
    bl_label = '再导出一次'
    bl_description = '导出到上次的文件（覆盖）'

    @classmethod
    def poll(cls, context):
        return bool(context.scene.get('ds_export_path'))

    def execute(self, context):
        return _export(self, context.scene['ds_export_path'])


class DS_OT_check(bpy.types.Operator):
    bl_idname = 'ds.check'
    bl_label = '检查'
    bl_description = '不导出，只检查出生点、编号这些（游戏里能不能走通要等开发跑 map-check）'

    def execute(self, context):
        try:
            m, warns, renamed = scene.dump()
        except Exception as e:   # noqa: BLE001
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        errors, w2 = mapformat.check(m)
        lines = [f'错误：{e}' for e in errors] + [f'编号：{r}' for r in renamed] + [f'提醒：{w}' for w in warns + w2]
        _report_lines(lines or ['没有发现问题'])
        return {'FINISHED'}


# ---------- 添加 ----------
class DS_OT_add(bpy.types.Operator):
    bl_idname = 'ds.add'
    bl_label = '添加'
    bl_description = '在 3D 游标的位置放一个（Shift + 右键 移动游标）'
    bl_options = {'REGISTER', 'UNDO'}
    kind: StringProperty()

    @classmethod
    def poll(cls, context):
        return scene.base() is not None and context.mode == 'OBJECT'

    def execute(self, context):
        o = scene.add(self.kind, context.scene.cursor.location)
        for s in context.selected_objects:
            s.select_set(False)
        o.select_set(True)
        context.view_layer.objects.active = o
        self.report({'INFO'}, f'已添加 {o.name}')
        return {'FINISHED'}


class DS_OT_view_yard(bpy.types.Operator):
    bl_idname = 'ds.view_yard'
    bl_label = '俯视全场'
    bl_description = '从正上方看整个场地，北在上（看乱了点这个）'

    def execute(self, context):
        scene.view_yard()
        return {'FINISHED'}


class DS_OT_names(bpy.types.Operator):
    bl_idname = 'ds.toggle_names'
    bl_label = '显示 / 隐藏编号'
    bl_description = '在 3D 视图里显示每个物体的编号'

    def execute(self, context):
        objs = [o for o in scene._all() if o.ds.kind not in scene.GROUND_KINDS and o.ds.kind not in scene.BACKDROP_KINDS and o.ds.kind != 'fence']
        show = not all(o.show_name for o in objs)
        for o in objs:
            o.show_name = show
        return {'FINISHED'}


# ---------- 面板 ----------
def _where(o):
    """物体的游戏坐标和网格名"""
    b = scene.base()
    t = o.matrix_world.translation
    x, y, z = t.x + 0.0, t.z + 0.0, -t.y + 0.0     # + 0.0 把 -0.0 变成 0.0，面板上不显示 "-0.00"
    return x, y, z, mapformat.grid_cell(b, x, z) if b else '?'


class DS_PT_main(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Direct-Strike'
    bl_label = '地图'

    def draw(self, context):
        lay = self.layout
        b = scene.base()
        sc = context.scene
        if not b:
            lay.label(text='还没有打开地图', icon='INFO')
            lay.operator('ds.open_builtin', icon='FILE_FOLDER')
            lay.operator('ds.open_map', icon='FILEBROWSER')
            return
        lay.label(text=f'{b.get("name")}（{b.get("id")}）', icon='WORLD')
        row = lay.row(align=True)
        row.operator('ds.open_builtin', text='重新打开自带的', icon='FILE_REFRESH')
        row.operator('ds.open_map', text='打开文件…', icon='FILEBROWSER')
        col = lay.column(align=True)
        col.scale_y = 1.3
        col.operator('ds.export_map', icon='EXPORT')
        if sc.get('ds_export_path'):
            col.operator('ds.export_again', text=f'再导出到 {os.path.basename(sc["ds_export_path"])}', icon='FILE_TICK')
        row = lay.row(align=True)
        row.operator('ds.view_yard', icon='VIEW_ORTHO')
        row.operator('ds.check', icon='CHECKMARK')
        row.operator('ds.toggle_names', text='编号', icon='SORTALPHA')


class DS_PT_selected(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Direct-Strike'
    bl_label = '选中的'

    @classmethod
    def poll(cls, context):
        return scene.base() is not None

    def draw(self, context):
        lay = self.layout
        o = context.active_object
        if not o or not o.ds.kind:
            lay.label(text='点一个地图里的东西看它的属性')
            return
        kind = o.ds.kind
        spec = schema.spec(kind) or {}
        x, y, z, cell = _where(o)
        head = lay.box()
        title = o.ds.rid if kind == 'region' else o.name
        head.label(text=f'{title}  ·  {spec.get("label", kind)}', icon='OBJECT_DATA')
        head.label(text=f'网格 {cell}　x {x:.2f}　z {z:.2f}' + (f'　高 {y:.2f}' if abs(y) > 0.005 else ''))
        if kind == 'collider':
            head.label(text=f'属于 {o.parent.name if o.parent else "?"}，跟着它走', icon='LINKED')
        if kind == 'region':
            lay.prop(o, 'name', text='名字')
        else:
            lay.prop(o, 'name', text='编号')
        p = o.ds
        if kind in ('container', 'truck'):
            lay.prop(p, 'color')
        if kind == 'container':
            lay.prop(p, 'label')
        if kind == 'sandbags':
            lay.prop(p, 'length', expand=True)
        if kind == 'barrel':
            lay.prop(p, 'paint', expand=True)
        if kind in ('box',) or (kind in ('proxy', 'collider') and o.get('ds_has_material')):
            lay.prop(p, 'material')
        if kind == 'box':
            row = lay.row()
            row.prop(p, 'collide')
            row.prop(p, 'shoot')
        if kind in ('proxy', 'collider'):
            lay.prop(p, 'shoot')
        if kind == 'spawn':
            row = lay.row()
            row.prop(p, 'start', toggle=True)
            row.prop(p, 'fallback', toggle=True)
        if kind == 'target':
            lay.prop(p, 'move')
            if p.move:
                row = lay.row()
                row.prop(p, 'move_range')
                row.prop(p, 'move_speed')
        if kind == 'note':
            lay.prop(p, 'text', text='')
        if kind == 'building':
            lay.prop(p, 'style')
        if kind == 'model':
            lay.label(text=f'模型：{p.model}')
        if kind not in ('note', 'region'):
            lay.prop(p, 'note')
        # 怎么改位置、朝向、大小
        hint = lay.column(align=True)
        hint.scale_y = 0.8
        rot = spec.get('rot', 'none') if spec.get('shape') == 'inst' else None
        hint.label(text='G 移动（按住 Ctrl 吸附网格）', icon='INFO')
        if rot is None and spec.get('shape') == 'inst':
            hint.label(text='这种东西的朝向游戏里是固定的')
        elif isinstance(rot, tuple):
            hint.label(text='R 转动：只认 90° 的倍数')
        elif rot in ('rot', 'yaw'):
            hint.label(text='R 转动（按住 Ctrl 每次 15°）')
        if spec.get('shape') in ('box', 'rect', 'region', 'building', 'fence', 'ellipse', 'disc'):
            hint.label(text='S 缩放改大小（S X / S Y 只改一个方向）')


ADD_ICONS = {'spawn': 'ARMATURE_DATA', 'nav': 'EMPTY_SINGLE_ARROW', 'target': 'MOD_HUE_SATURATION', 'note': 'OUTLINER_OB_FONT'}


class DS_PT_add(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Direct-Strike'
    bl_label = '添加（放在 3D 游标处）'
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return scene.base() is not None

    def draw(self, context):
        lay = self.layout
        lay.label(text='物体')
        grid = lay.grid_flow(columns=2, align=True)
        for k in schema.ADD_OBJECTS:
            grid.operator('ds.add', text=schema.OBJECTS[k]['label']).kind = k
        lay.label(text='玩法和标注')
        grid = lay.grid_flow(columns=2, align=True)
        for k in schema.ADD_ENTITIES:
            grid.operator('ds.add', text=schema.ENTITIES[k]['label'], icon=ADD_ICONS.get(k, 'NONE')).kind = k
        grid.operator('ds.add', text='区域', icon='SELECT_SET').kind = 'region'


class DS_PT_report(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Direct-Strike'
    bl_label = '检查结果'

    @classmethod
    def poll(cls, context):
        return bool(context.scene.get('ds_report'))

    def draw(self, context):
        col = self.layout.column(align=True)
        for line in context.scene['ds_report'].split('\n'):
            icon = 'ERROR' if line.startswith('错误') else 'QUESTION' if line.startswith('提醒') else 'NONE'
            col.label(text=line, icon=icon)


CLASSES = [DS_OT_open, DS_OT_open_builtin, DS_OT_export, DS_OT_export_again, DS_OT_check, DS_OT_add, DS_OT_view_yard, DS_OT_names,
           DS_PT_main, DS_PT_selected, DS_PT_add, DS_PT_report]
