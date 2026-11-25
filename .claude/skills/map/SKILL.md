---
name: map
description: 修改或新增地图（maps/*.json），检查出生点和巡逻点是否卡住、能否走到，碰撞盒是否穿插，并生成俯视图。改布局、加掩体或点位、做新地图、讨论地图布局时用。
argument-hint: "[上传编号 | maps/xxx.json]"
---

# 地图

## 参数

`$ARGUMENTS` 可以为空（检查当前地图）：
- 负责人从游戏里上传的编号（`/map 3f2a`）→ `--map <编号>`，检查完给俯视图和结论，问要不要合进来
- 地图文件路径 → `--map <路径>`
- 一句话的改动要求（`/map C4 往北挪两格`）→ 按要求改地图再检查

地图数据在 `maps/*.json`（format 2：`layout` 布局层 + `entities` 玩法实体，每个东西有编号），格式见 `docs/maps.md`。`js/world.js` 只负责造型，改布局不用改代码。
负责人在 Blender 地图工具里改地图、在游戏里上传（`docs/blender-maps.md`），开发收到编号后检查、合进来。

```bash
node tools/map-check.mjs                     # 检查当前使用的地图
node tools/map-check.mjs --map maps/新.json   # 检查还没启用的新地图
node tools/map-check.mjs --map <上传编号>      # 检查负责人从游戏里上传的地图（~/direct-strike-data/devlogs/<编号>/map.json）
node tools/tests/mapkit.mjs                  # 改了 Blender 插件（tools/mapkit/）或地图格式后跑
```

和负责人说位置用编号（C4、SB2、S1）、区域名（中央平台、西道）和网格坐标（D12：字母是东西、数字是南北，每格 2 米），俯视图上都标着。
负责人上传的地图没问题就 `cp ~/direct-strike-data/devlogs/<编号>/map.json maps/yard.json`（是 Blender 导出的原文，排版和仓库一致），看 `git diff`。

改完地图先跑这个，再跑 `/verify`。切换地图改 `js/config.js` 的 `map`。

- 输出摘要，退出码 1 表示点位有问题。详情在 `tools/out/map/report.json`。
- 俯视图是 `tools/out/map/topdown.png`，北在上，改布局前后都看一下。
- 数据从运行中的游戏读取，所以检查的是真实生效的碰撞盒。

## 限制

- 连通性只算步行（含台阶和高台），不算跳跃，也不模拟 NPC 的绕路逻辑。
- 穿插只作提示，不算失败。围墙转角的 8 处是正常的，yard 地图其余 4 处也已知（卡车和集装箱、卡车的两堵空气墙、电缆盘）。
- 新种类的物体要在 `world.js` 的 `builders` 里加造型，同步更新 `docs/maps.md`，再给 Blender 插件加上（`docs/blender-maps.md` 的"加新的物体类型"），否则 Blender 打开这张地图会报错。
- 手改 JSON 要保持插件的排版（顶层每个字段一行、数组里一个物体一行、字段顺序按 `schema.py`），否则负责人下次导出时 diff 会多出无关的行。
