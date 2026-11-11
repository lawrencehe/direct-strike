# 地图格式

每张地图是一个 `maps/<名字>.json`，用 `js/config.js` 的 `map` 选择。`js/world.js` 负责造型和所有地图共用的天空、光照，地图文件只决定东西放在哪。

## 改地图的流程

1. 编辑 `maps/yard.json`，或复制一份做新地图。
2. `node tools/map-check.mjs --map maps/新地图.json` 检查点位，再看俯视图 `tools/out/map/topdown.png`。
3. 把 `config.js` 的 `map` 改成新地图，运行 `node tools/verify.mjs`。

## 坐标约定

单位是米。`x` 向东，`z` 向南（`-z` 是北），`y` 向上，原点在地图中心。物体的 `y` 指**底部**高度。`yaw` 单位是弧度：`0` 朝北，`3.14159` 朝南，`1.5708` 朝西，`-1.5708` 朝东。

## 字段

| 字段 | 含义 |
|---|---|
| `name` | 地图名 |
| `yard` | 沥青场地的大小 `{w, d}`，碎石和尘埃也按它分布 |
| `bounds` | 场地内可活动范围 `{minX, maxX, minZ, maxZ}` |
| `shadowRange` | 阴影覆盖范围（米），要盖住整个场地 |
| `surfaces` | 用哪些 PBR 材质：`{名字: 一张贴图覆盖多少米}`，见下面的"真实材质" |
| `environment` | 环境光 HDRI 的文件名（在 `assets/maps/<地图>/` 下），只给地图材质照明和反射，不当天空显示 |
| `pads` | 水泥地块 `{x, z, w, d}` |
| `puddles` | 水洼 `{x, z, w, d, rot}` |
| `stains` | 油渍 `{x, z, r}` |
| `debris` | 随机碎石数量 |
| `fences` | 围栏 `{len, x, z, alongX}`，自带水泥墩、铁丝网、空气墙和立柱 |
| `objects` | 场地里的物体，见下表 |
| `backdrop` | 场外远景：`buildings`（`{w, h, d, x, z, style}`，`style` 取 0–2）、`cranes`、`waterTowers`（`{x, z}`） |
| `spawns` | 出生点 `{x, z, yaw}` |
| `navPoints` | NPC 巡逻点 `{x, z}` |
| `rangeSpawn` | 训练场出生点 `{x, y, z, yaw}` |
| `targets` | 靶子 `{x, z}`，移动靶加 `move: {range, speed}` |

**出生点的约定：** `spawns[0]` 是玩家的初始位置，`z < 0` 的是 NPC 一侧，`spawns[3]` 是 NPC 的兜底位置。所以至少要 4 个点，并且 `spawns[3]` 应该在 `z < 0` 一侧。

## 物体类型（`objects`）

任何物体都可以加 `note` 写备注，游戏会忽略它。

| `type` | 字段 | 说明 |
|---|---|---|
| `box` | `size: [w, h, d]`、`pos: [x, y, z]`、`material`，可选 `collide`、`shoot` | 通用方块，两个开关默认 `true` |
| `blocker` | `size`、`pos` | 看不见的碰撞盒 |
| `container` | `x`、`z`，可选 `y`，`alongZ`、`color`、`label` | 集装箱（6 × 2.6 × 2.44 米），叠放时 `y` 填 `2.6` |
| `jersey` | `x`、`z`、`alongX` | 水泥隔离墩 |
| `barrel` | `x`、`z`、`material` | 油桶，材质用 `barrelRed`、`barrelBlue`、`barrelGrey` |
| `barrelLying` | `x`、`z` | 倒着的油桶 |
| `lampPost` | `x`、`z` | 灯柱，灯臂朝地图中心 |
| `tires` | `x`、`z` | 轮胎堆 |
| `cableReel` | `x`、`z` | 电缆盘 |
| `palletStack` | `x`、`z` | 木托盘堆加木箱 |
| `truck` | `x`、`z`、`color` | 货车，车头朝北 |

`box` 可用的材质：`asphalt`、`dirt`、`concrete`、`concreteDark`、`sandbag`、`wood`、`metal`、`metalDark`、`rubber`、`barrelRed`、`barrelBlue`、`barrelGrey`。

写错类型或材质时，游戏会在加载页显示错误，`map-check` 也会报出来。

## 真实材质（#50）

地面和水泥用 Poly Haven 的 CC0 PBR 材质（颜色 + 法线 + 粗糙度），比 Canvas 画的贴图多了凹凸和明暗变化。

- 文件在 `assets/maps/<地图>/textures/<名字>_diff.webp`、`_nor.webp`、`_rough.webp`，由 `assets-src/maps/<地图>/fetch_textures.py` 下载转换；
  换材质就改脚本里的 `TEXTURES`（游戏里的名字 → Poly Haven 的 id）再跑一次，新素材登记到 `assets/LICENSES.md`。
- `surfaces` 里的名字对应这些用途：`asphalt` 场地沥青，`concreteFloor` 水泥地块（`pads`），`concrete` 水泥墩、高台、台阶、隔离墩、围栏墩和地上碎块
  （材质 `concrete` 和 `concreteDark` 共用，后者压暗），`dirt` 围栏外的地面。没列的、或者下载失败的，退回 `js/textures.js` 画的贴图。
- 数字是一张贴图在现实中覆盖多少米。`world.js` 按物体每个面的真实尺寸铺（不是一个面拉伸一张），所以大小不同的墩子纹理一样粗细；
  觉得纹理重复得明显就调大，糊就调小。每个物体的纹理会随机错开，相邻的墩子不会一模一样。
- 地图分**实景**（场地内玩家能走到、能碰到的，要精细的模型和材质）和**虚景**（围栏外的远景，只要轮廓和光照对、面数低），是负责人定的（#50）。

## 注意事项

- **台阶：** 每级不超过 `config.js` 的 `player.stepHeight`（0.45 米），否则走不上去。
- **同色集装箱：** 贴图按颜色缓存，同一地图里同色的集装箱都显示第一个的 `label`。这是现有行为，要不同编号就用略微不同的颜色。
- **加新种类的物体：** 在 `js/world.js` 的 `builders` 里加一个函数，并更新上表。
- **贴图和音效：** 新地图专用的资源放到 `assets/maps/<地图>/`，按需加载（`World.loadMap` 只下载这张图的），不要增加首次下载体积。
