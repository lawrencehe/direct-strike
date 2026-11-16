# Direct-Strike 地图工具：在 Blender 里打开、编辑游戏地图（maps/*.json），导出给游戏用（#115）。
# 说明和教程：docs/blender-maps.md、docs/blender-lessons.md
import bpy

from . import fields, ui


def register():
    for c in fields.CLASSES + ui.CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Object.ds = bpy.props.PointerProperty(type=fields.DSProps)


def unregister():
    del bpy.types.Object.ds
    for c in reversed(fields.CLASSES + ui.CLASSES):
        bpy.utils.unregister_class(c)
