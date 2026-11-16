# 每个地图物体身上的属性（obj.ds），面板上改的就是这些（#115）。
# 位置、朝向、尺寸不在这里：直接用 Blender 的移动 / 旋转 / 缩放，导出时从物体的变换读出来。
import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, StringProperty

from . import protos, schema


def _refresh(self, context):
    """颜色、长度、漆色、开局 / 兜底改了：换成对应的原型（集合实例）"""
    from . import scene
    scene.refresh_look(self.id_data)


def _start(self, context):
    # 只能有一个开局点：勾上这个，其他的取消
    if self.start:
        for o in bpy.data.objects:
            if o is not self.id_data and o.ds.kind == 'spawn' and o.ds.start:
                o.ds.start = False
        if self.fallback:
            self.fallback = False
    _refresh(self, context)


def _fallback(self, context):
    if self.fallback:
        for o in bpy.data.objects:
            if o is not self.id_data and o.ds.kind == 'spawn' and o.ds.fallback:
                o.ds.fallback = False
        if self.start:
            self.start = False
    _refresh(self, context)


MATERIAL_ITEMS = [(k, k, '') for k in schema.MATERIALS]
PAINT_ITEMS = [('barrelRed', '红', ''), ('barrelBlue', '蓝', ''), ('barrelGrey', '灰', '')]
LEN_ITEMS = [(str(n), f'{n} 米', '') for n in schema.SANDBAG_LENS]


class DSProps(bpy.types.PropertyGroup):
    kind: StringProperty(name='类型', description='地图里的类型（container、spawn…），空的不导出')
    order: FloatProperty(name='顺序', description='导出时在文件里的顺序')
    rid: StringProperty(name='区域编号', description='区域的英文编号（文件里用）')
    color: StringProperty(name='颜色', description='十六进制颜色，比如 #2f5f8f。集装箱用了新颜色要重新烘焙贴图（docs/maps.md）', update=_refresh)
    label: StringProperty(name='箱号', description='集装箱上印的编号')
    material: EnumProperty(name='材质', items=MATERIAL_ITEMS, update=_refresh)
    paint: EnumProperty(name='漆色', items=PAINT_ITEMS, update=_refresh)
    length: EnumProperty(name='长度', items=LEN_ITEMS, default='3', update=_refresh)
    model: StringProperty(name='模型', description='地图文件 models 里的名字', update=_refresh)
    text: StringProperty(name='备注内容', description='写给开发看的话：这里想放什么、要改什么')
    note: StringProperty(name='说明', description='写在文件里的说明（游戏不管）')
    start: BoolProperty(name='玩家开局', description='玩家开局出生在这里（只能有一个）', update=_start)
    fallback: BoolProperty(name='兜底', description='出生点都被占了时 NPC 出生在这里（只能有一个，放在北边）', update=_fallback)
    collide: BoolProperty(name='挡人', default=True)
    shoot: BoolProperty(name='挡子弹', default=True)
    move: BoolProperty(name='移动靶')
    move_range: FloatProperty(name='移动范围', default=2, min=0, unit='LENGTH')
    move_speed: FloatProperty(name='速度', default=1, min=0)
    style: IntProperty(name='样式', min=0, max=2)
    extra: StringProperty(name='其他字段', description='插件不认识的字段（JSON），导出时原样写回')


CLASSES = [DSProps]
