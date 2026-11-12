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
| `models` | 哪些物体类型用模型显示：`{类型: glb 路径}`（相对 `assets/maps/<地图>/`），见下面的"道具模型" |
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
| `model` | `model`（`models` 里的名字）、`x`、`z`，可选 `y`、`rot`（绕竖轴，弧度） | 只显示一个模型，不带碰撞；碰撞用下面的 `proxy` 另外写 |
| `proxy` | `size`、`pos`，可选 `model`、`material`、`shoot` | 配合 `model` 的碰撞：看不见、挡人挡子弹的方块；`shoot: false` 只挡人（栏杆）。写了 `model` 的，那个模型没加载上就用 `material` 把方块画出来 |
| `container` | `x`、`z`，可选 `y`，`alongZ`、`color`、`label` | 集装箱（6 × 2.6 × 2.44 米），叠放时 `y` 填 `2.6` |
| `jersey` | `x`、`z`、`alongX` | 水泥隔离墩（2.4 × 0.85 × 0.5 米） |
| `sandbags` | `x`、`z`、`len`（3 或 4），可选 `y`、`alongZ` | 沙袋墙（高 0.9、厚 0.6 米），`alongZ` 时长边沿 z |
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

## 道具模型（#50）

集装箱、隔离墩、沙袋墙用 Blender 建的模型显示，中央战术平台用 Tripo 生成的底模修整而成（地图第 2 步，#50），其他物体还是方块拼的，后面逐个换。

**中央战术平台**（`centralPlatform`）：负责人用 AI 画的概念图在 Tripo 生成（#72），带伪装网棚、沙袋、弹药箱、栏杆、两根灯柱。
- 它换掉了原来的方块高台和两侧台阶，**布局跟着模型变了**（负责人同意，#50）：台面高 1.4 米（原来 1.2），占地约 5.7 × 7.3；楼梯只有一道、朝东（南北两边的出生点到楼梯一样远）；
  台上的掩体是模型自带的沙袋和箱子，原来台上的两道沙袋墙去掉了；训练场出生点在台上北边的沙袋后面。
- 碰撞是在 `yard.json` 里 `model` 对象下面手写的一组 `proxy`（台面、5 级台阶、6 处掩体、配电箱、油桶、三面栏杆），按模型量出来的尺寸写的。
  量法：Blender 里从上往下打射线，得到每 0.25 米一格的顶面高度图（模型的大平面只有角上有顶点，看顶点量不准）。
  模型坐标换到游戏里：平台转 90°（`rot: 1.5708`），游戏 x = −模型 y + 0.75，游戏 z = −模型 x + 0.25。
- 栏杆、灯柱、棚柱都很细：栏杆用只挡人的空气墙，灯柱和棚柱没做碰撞。
- 修整脚本 `assets-src/models/map/central-platform/build.py`：Tripo 出的是 1100 多块互不相连的碎片共用一张贴图，按位置归成 base / canopy / cover / lamp_l / lamp_r 五个节点，删掉参考图前景里一起被生成的枪。

- **模型只管显示，碰撞和子弹仍按原来的方块**：`world.js` 放模型的同时放一个看不见的同尺寸方块（`addProxy`），
  所以换模型不改走位、NPC 的视线和 `map-check` 的结果；模型上的小缝也不会漏子弹。弹孔贴在方块表面，离瓦楞的凹槽最多差几厘米。
- 模型原点在底面中心，长边沿 x。集装箱门在 +x 端，按位置决定转不转 180°，同一排的门不会全朝一边；隔离墩、沙袋墙也一样随机掉头。
- 集装箱几何、法线、粗糙度所有颜色共用，颜色贴图每种颜色一张（`container_<颜色>_diff.webp`，箱号画在上面），按地图里用到的颜色烘焙。
  地图里加了新颜色要重新跑 `build.sh container`，否则这种颜色显示 glb 自带的第一种颜色。
- 沙袋墙的 glb 里有两段墙（节点 `len_3`、`len_4`），`len` 只能是 3 或 4；要别的长度在 `sandbag.py` 的 `LENGTHS` 里加。
- 模型下载失败时退回原来的方块，游戏照常能玩。
- **压缩过的 glb 不能直接改节点的 `position`**：meshopt 量化把顶点坐标的还原放在节点自己的位移和缩放里，克隆子节点后要套一层 `Group` 再摆（沙袋墙就是这样）。

**改模型：** 脚本在 `assets-src/maps/yard/props/`（`container.py`、`jersey.py`、`sandbag.py`，共用 `lib.py`），
`assets-src/maps/yard/props/build.sh [container jersey sandbag platform]` 一次完成建模、烘焙、压缩，产物在 `assets/maps/yard/props/`。
流程：bmesh 建几何 → 自动展 UV → 节点材质（Poly Haven 的 CC0 贴图 + 程序生成的锈、污渍、磕碰）→ Cycles 烘焙成颜色、粗糙度、法线 → 导出 glb → `tools/glb.mjs optimize`。
锈多锈少、褪色、脏污的程度都是材质节点里的数字，脚本里有注释。

- **烘焙的坑：** 倒角节点（找棱角）和 AO 要发很多光线，开发机 CPU 上一张 2048 的图要十几分钟。所以这两样各单独烘一次存成图，
  后面的颜色、粗糙度、法线只读这两张图，每像素采样 1 次就够，整个集装箱 1 分钟左右。调试时 `TEX=512` 更快。
- **单面的板（瓦楞板）不能用 `recalc_face_normals` 翻法线**：它只对封闭的零件可靠，单面板会随机朝里，导致箱号印反。
  `lib.Mesh.sheet` 要传朝外的方向。

## 注意事项

- **台阶：** 每级不超过 `config.js` 的 `player.stepHeight`（0.45 米），否则走不上去。
- **同色集装箱：** 颜色贴图按颜色烘焙，同一地图里同色的集装箱都显示第一个的 `label`。要不同编号就用略微不同的颜色，再跑一次 `build.sh container`。
- **加新种类的物体：** 在 `js/world.js` 的 `builders` 里加一个函数，并更新上表。
- **贴图和音效：** 新地图专用的资源放到 `assets/maps/<地图>/`，按需加载（`World.loadMap` 只下载这张图的），不要增加首次下载体积。
