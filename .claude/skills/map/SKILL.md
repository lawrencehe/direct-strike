---
name: map
description: 修改或新增地图（maps/*.json），检查出生点和巡逻点是否卡住、能否走到，碰撞盒是否穿插，并生成俯视图。改布局、加掩体或点位、做新地图、讨论地图布局时用。
---

# 地图

地图数据在 `maps/*.json`，格式见 `docs/maps.md`。`js/world.js` 只负责造型，改布局不用改代码。

```bash
node tools/map-check.mjs                     # 检查当前使用的地图
node tools/map-check.mjs --map maps/新.json   # 检查还没启用的新地图
```

改完地图先跑这个，再跑 `/verify`。切换地图改 `js/config.js` 的 `map`。

- 输出摘要，退出码 1 表示点位有问题。详情在 `tools/out/map/report.json`。
- 俯视图是 `tools/out/map/topdown.png`，北在上，改布局前后都看一下。
- 数据从运行中的游戏读取，所以检查的是真实生效的碰撞盒。

## 限制

- 连通性只算步行（含台阶和高台），不算跳跃，也不模拟 NPC 的绕路逻辑。
- 穿插只作提示，不算失败。围墙转角的 8 处是正常的，yard 地图其余 4 处也已知（卡车和集装箱、卡车的两堵空气墙、电缆盘）。
- 新种类的物体要在 `world.js` 的 `builders` 里加造型，再同步更新 `docs/maps.md`。
