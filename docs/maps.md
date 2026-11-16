# 地图格式

每张地图是一个 `maps/<名字>.json`，用 `js/config.js` 的 `map` 选择。`js/world.js` 负责造型和所有地图共用的天空、光照，地图文件只决定东西放在哪。

## 改地图的流程

两条路，改的是同一个文件：

- **负责人在 Blender 里改**（#115）：Blender 地图工具打开地图 → 摆放 → 导出 JSON → 游戏的开发者设置里"载入地图文件"试玩 → "上传给开发"。
  开发收到编号后 `node tools/map-check.mjs --map <编号>` 检查，没问题把它放进 `maps/`、提交。工具和流程见 `blender-maps.md`，教程见 `blender-lessons.md`。
- **开发直接改 JSON**：
  1. 编辑 `maps/yard.json`，或复制一份做新地图。
  2. `node tools/map-check.mjs --map maps/新地图.json` 检查点位，再看俯视图 `tools/out/map/topdown.png`。
  3. 把 `config.js` 的 `map` 改成新地图，运行 `node tools/verify.mjs`。

两边写出来的排版一模一样（`tools/mapkit/ds_mapkit/mapformat.py`：顶层每个字段一行，数组里一个物体一行），所以谁改都只在 git diff 里显示改了的行。
手改 JSON 后在 Blender 里打开再导出一遍，文件应该不变；变了说明手写的排版或字段顺序和插件不一样，以插件的为准。

## 坐标约定

单位是米。`x` 向东，`z` 向南（`-z` 是北），`y` 向上，原点在地图中心。物体的 `y` 指**底部**高度。`yaw` / `rot` 单位是弧度，从上往下看逆时针为正：`0` 朝北，`3.14159` 朝南，`1.5708` 朝西，`-1.5708` 朝东。

**网格坐标**（#115）：从 `bounds` 的西北角起，每格 `grid` 米（yard 是 2 米）。列是字母，从西往东 A、B、C……；行是数字，从北往南 1、2、3……。
yard 是 A–R × 1–24，南边中间的出生点 S1 在 I23。俯视图和 Blender 里都画着这套网格，和负责人说位置时用"F9""C3 南边贴着"这种说法。

## 编号和区域（#115）

每个物体、点位都有 `id`，同一张地图里不重复。前缀表示类型，数字递增：

| 前缀 | 类型 | 前缀 | 类型 |
|---|---|---|---|
| `C` | 集装箱 | `S` | 出生点 |
| `J` | 隔离墩 | `N` | 巡逻点 |
| `SB` | 沙袋墙 | `R` | 训练场出生点 |
| `B` | 油桶（立着、倒着的都是） | `TG` | 靶子 |
| `A` | 弹药箱堆 | `NOTE` | 备注标记 |
| `T` / `P` / `TR` | 轮胎堆 / 木托盘堆 / 货车 | `PAD` / `PUD` / `STN` | 水泥地块 / 水洼 / 油渍 |
| `L` | 灯柱 | `F` | 围栏 |
| `M` | 模型（中央平台是 `M1`） | `BG` / `CR` / `WT` | 远景楼 / 龙门吊 / 水塔 |
| `X` / `K` | 方块 / 空气墙 | | |

编号只在新加时取"同类最大的数字 + 1"，删掉的不回收，所以说"SB2"永远指同一道沙袋墙。
`regions` 给区域起名（`{id, name, x, z, w, d}`，中心和宽深），只给人看，游戏不用；俯视图上是黄色虚线框。yard 有中央平台、北出生、南出生、北排、南排、西道、东道。

## 字段

`format` 必须是 `2`，游戏和 `map-check` 都会检查。

| 字段 | 含义 |
|---|---|
| `format` | 地图格式版本，现在是 `2`（#115） |
| `id` | 地图的英文名，素材目录是 `assets/maps/<id>/`（游戏里载入的本地地图也按它找模型和贴图） |
| `name` | 地图名（首页显示） |
| `grid` | 网格坐标每格几米，默认 2 |
| `yard` | 沥青场地的大小 `{w, d}`，碎石和尘埃也按它分布 |
| `bounds` | 场地内可活动范围 `{minX, maxX, minZ, maxZ}`，也是网格坐标的起点 |
| `shadowRange` | 阴影覆盖范围（米），要盖住整个场地 |
| `surfaces` | 用哪些 PBR 材质：`{名字: 一张贴图覆盖多少米}`，见下面的"真实材质" |
| `environment` | 环境光 HDRI 的文件名（在 `assets/maps/<地图>/` 下），只给地图材质照明和反射，不当天空显示 |
| `models` | 哪些物体类型用模型显示：`{类型: glb 路径}`（相对 `assets/maps/<地图>/`），见下面的"道具模型" |
| `layout` | **布局层**："这里有什么"，见下表 |
| `entities` | **玩法实体层**：出生点、巡逻点、靶子这些玩法要用的点，见下面 |
| `regions` | 区域名（见上面） |

`layout` 里：

| 字段 | 含义 |
|---|---|
| `pads` | 水泥地块 `{id, x, z, w, d}` |
| `puddles` | 水洼 `{id, x, z, w, d, rot}`（`w`、`d` 是椭圆的半轴） |
| `stains` | 油渍 `{id, x, z, r}` |
| `debris` | 随机碎石数量 |
| `fences` | 围栏 `{id, len, x, z, alongX}`，自带水泥墩、铁丝网、空气墙和立柱 |
| `objects` | 场地里的物体，见下面的"物体类型" |
| `backdrop` | 场外远景：`buildings`（`{id, w, h, d, x, z, style}`，`style` 取 0–2）、`cranes`、`waterTowers`（`{id, x, z}`） |

`entities` 是一个数组，每项 `{id, type, …}`：

| `type` | 字段 | 说明 |
|---|---|---|
| `spawn` | `x`、`z`、`yaw`，可选 `start`、`fallback` | 出生点。`start: true` 的是玩家开局的位置，`fallback: true` 的是都被占了时 NPC 的兜底位置（放在 `z < 0` 一侧），各要有且只有一个 |
| `nav` | `x`、`z` | NPC 巡逻点，至少 2 个 |
| `rangeSpawn` | `x`、`y`、`z`、`yaw` | 训练场出生点（可以在高台上，`y` 是脚底高度），只能有一个 |
| `target` | `x`、`z`，移动靶加 `move: {range, speed}` | 训练场的靶子 |
| `note` | `x`、`z`、`text` | **备注标记**：负责人在 Blender 里贴的便签（"这里想放一堆轮胎"），游戏不管，`map-check` 打印出来、俯视图上画黄三角 |

`world.js` 的 `points()` 把实体换成游戏用的列表：`start` 排第一（`spawns[0]`），`fallback` 排第四（`bots.js` 用 `spawns[3]` 兜底），其余按文件顺序。
以前靠数组顺序约定"第一个是玩家、第四个是兜底"，在编辑器里拖来拖去容易弄乱，所以改成显式标记（#115）。

**出生点的约定：** 其余的点玩家和 NPC 共用，每次出生选离对方最远的那个（#97），所以至少要 4 个点。
yard 用 6 个：南北两头各三个（中间和两角），东西两侧离中央太近、四面露天的两个去掉了（#97）。

**出生点不能是开阔地**（#97、#50）：刚出生的人要能躲着买枪，不能被敌人守株待兔；但只要有一定的障碍物挡着就行，**不要挡得太严**。
四个角原来各有一道 L 形两层沙袋墙，实战里躲进角落几乎无敌，负责人让去掉了（#50），角上靠集装箱挡。现在只有南北中间两个出生点朝中央那一面有一道两层沙袋墙
（`len: 4`，第二层 `y: 0.9`，共高 1.8 米）。`tools/tests/spawn-protect.mjs` 从地图中央（地面和平台上）、对面三个出生点共 5 个位置看出生点上站着的人头，
至少挡住 3 条视线算合格，改出生点或附近掩体后跑一下。

## 物体类型（`layout.objects`）

每个物体都有 `id` 和 `type`。任何物体都可以加 `note` 写说明，游戏会忽略它。

| `type` | 字段 | 说明 |
|---|---|---|
| `box` | `size: [w, h, d]`、`pos: [x, y, z]`、`material`，可选 `collide`、`shoot` | 通用方块，两个开关默认 `true` |
| `blocker` | `size`、`pos` | 看不见的碰撞盒 |
| `model` | `model`（`models` 里的名字）、`x`、`z`，可选 `y`、`rot`（绕竖轴，弧度）、`colliders` | 一个模型。碰撞写在 `colliders` 里：`{size, pos, material?, shoot?}`，坐标**相对模型**（模型没转时的方向），跟着模型平移、旋转；碰撞盒只能是正的方块，所以按 `rot` 最近的 90° 转（#115）。每个碰撞方块看不见、挡人挡子弹，`shoot: false` 只挡人（栏杆）；模型没加载上就用 `material` 把方块画出来 |
| `proxy` | `size`、`pos`，可选 `model`、`material`、`shoot` | 单独一个看不见的碰撞方块（世界坐标），用法同上。新的模型碰撞写进模型的 `colliders`，不再单独写 `proxy` |
| `container` | `x`、`z`，可选 `y`，`alongZ`、`color`、`label` | 集装箱（6 × 2.6 × 2.44 米），叠放时 `y` 填 `2.6` |
| `jersey` | `x`、`z`、`alongX` | 水泥隔离墩（2.4 × 0.85 × 0.5 米） |
| `sandbags` | `x`、`z`、`len`（2、3 或 4），可选 `y`、`alongZ` | 沙袋墙（高 0.9、厚 0.6 米），`alongZ` 时长边沿 z |
| `barrel` | `x`、`z`、`material` | 油桶（高 0.9、半径 0.3），`material` 是漆色：`barrelRed`、`barrelBlue`、`barrelGrey` |
| `barrelLying` | `x`、`z` | 倒着的油桶（红色） |
| `lampPost` | `x`、`z` | 灯柱，灯臂朝地图中心 |
| `tires` | `x`、`z` | 轮胎堆 |
| `ammoCrates` | `x`、`z`，可选 `alongZ` | 一堆弹药箱：三层台阶（6 + 4 + 1 个），占地约 1.24 × 1.02、高约 1 米，每层一个碰撞方块 |
| `cableReel` | `x`、`z` | 电缆盘（yard 已换成弹药箱，#98） |
| `palletStack` | `x`、`z` | 木托盘堆加木箱 |
| `truck` | `x`、`z`、`color` | 货车，车头朝北 |

`box` 可用的材质：`asphalt`、`dirt`、`concrete`、`concreteDark`、`sandbag`、`wood`、`metal`、`metalDark`、`rubber`、`barrelRed`、`barrelBlue`、`barrelGrey`。

写错类型或材质时，游戏会在加载页显示错误，`map-check` 也会报出来。

## 真实材质（#50）

地面和水泥用 Poly Haven 的 CC0 PBR 材质（颜色 + 法线 + 粗糙度），比 Canvas 画的贴图多了凹凸和明暗变化。

- 文件在 `assets/maps/<地图>/textures/<名字>_diff.webp`、`_nor.webp`、`_rough.webp`，由 `assets-src/maps/<地图>/fetch_textures.py` 下载转换；
  换材质就改脚本里的 `TEXTURES`（游戏里的名字 → Poly Haven 的 id）再跑一次，新素材登记到 `assets/LICENSES.md`。
  下载 2k，颜色贴图保留 2k，法线和粗糙度缩到 1k（脚本里的 `RESIZE`）：地面大面积重复铺，截图对比看不出差别，yard 的材质从 11.8 MB 降到 5.8 MB（#105）。
- `surfaces` 里的名字对应这些用途：`asphalt` 场地沥青，`concreteFloor` 水泥地块（`pads`），`concrete` 水泥墩、高台、台阶、隔离墩、围栏墩和地上碎块
  （材质 `concrete` 和 `concreteDark` 共用，后者压暗），`dirt` 围栏外的地面。没列的、或者下载失败的，退回 `js/textures.js` 画的贴图。
- 数字是一张贴图在现实中覆盖多少米。`world.js` 按物体每个面的真实尺寸铺（不是一个面拉伸一张），所以大小不同的墩子纹理一样粗细；
  觉得纹理重复得明显就调大，糊就调小。每个物体的纹理会随机错开，相邻的墩子不会一模一样。
- 地图分**实景**（场地内玩家能走到、能碰到的，要精细的模型和材质）和**虚景**（围栏外的远景，只要轮廓和光照对、面数低），是负责人定的（#50）。

## 道具模型（#50）

集装箱、隔离墩用 Blender 建的模型显示；中央战术平台、沙袋墙、油桶、弹药箱用 Tripo 生成的底模修整而成（#50、#98）。轮胎、木托盘、货车还是方块拼的，后面逐个换。

**中央战术平台**（`centralPlatform`）：负责人用 AI 画的概念图在 Tripo 生成（#72），带伪装网棚、沙袋、弹药箱、栏杆、两根灯柱。
- 它换掉了原来的方块高台和两侧台阶，**布局跟着模型变了**（负责人同意，#50）：台面高 1.4 米（原来 1.2），占地约 5.7 × 7.3；楼梯只有一道、朝东（南北两边的出生点到楼梯一样远）；
  台上的掩体是模型自带的沙袋和箱子，原来台上的两道沙袋墙去掉了；训练场出生点在台上北边的沙袋后面。
- 碰撞是 `yard.json` 里 `M1` 的 `colliders`（台面、5 级台阶、6 处掩体、配电箱、油桶、三面栏杆），按模型量出来的尺寸手写的，坐标相对模型，挪平台碰撞跟着走（#115）。
  量法：Blender 里从上往下打射线，得到每 0.25 米一格的顶面高度图（模型的大平面只有角上有顶点，看顶点量不准）。
  模型坐标换到 `colliders` 的坐标（相对模型、没转时）：x = 模型 x，z = −模型 y（Blender 的 Y 是北，游戏的 z 是南）。
- 栏杆、灯柱、棚柱都很细：栏杆用只挡人的空气墙，灯柱和棚柱没做碰撞。
- 修整脚本 `assets-src/maps/yard/props/central-platform/build.py`：Tripo 出的是 1100 多块互不相连的碎片共用一张贴图，按位置归成 base / canopy / cover / lamp_l / lamp_r 五个节点，删掉参考图前景里一起被生成的枪。

- **模型只管显示，碰撞和子弹仍按原来的方块**：`world.js` 放模型的同时放一个看不见的同尺寸方块（`addProxy`），
  所以换模型不改走位、NPC 的视线和 `map-check` 的结果；模型上的小缝也不会漏子弹。弹孔贴在方块表面，离瓦楞的凹槽最多差几厘米。
- 模型原点在底面中心，长边沿 x。集装箱门在 +x 端，按位置决定转不转 180°，同一排的门不会全朝一边；隔离墩、沙袋墙也一样随机掉头。
- 集装箱几何、法线、粗糙度所有颜色共用，颜色贴图每种颜色一张（`container_<颜色>_diff.webp`，箱号画在上面），按地图里用到的颜色烘焙。
  地图里加了新颜色要重新跑 `build.sh container`，否则这种颜色显示 glb 自带的第一种颜色。
- **沙袋墙**（#98）：Tripo 只生成一个袋子（`assets-src/maps/yard/props/sandbag/tripo/`），`sandbag/build.py` 把它减面、换成麻布材质（从高模烘到低模），再一个个码成墙：
  两排袋子、5 层，上下层错开半个袋子，墙头横放一个封口，每个袋子随机掉头、大小差一点，新旧深浅、底下的沙土和缝里的 AO 烘进顶点色。
  glb 里有三段直墙（节点 `len_2`、`len_3`、`len_4`），`len` 只能是 2、3、4。脚本里还有 L 形转角 `corner` 和 U 形 `u`（`MODULES`，一条折线一个模块），
  目前只出预览（`tools/out/props/sandbag-tripo-preview.glb`）不进游戏；地图要用时加进 `GAME_MODULES` 并在 `world.js` 加造型。
- **油桶**（#98）：Tripo 文字生成的锈绿色 55 加仑桶，`steel-drum/build.py` 只缩放到高 0.9、减面到 2000。每个桶按位置转一个角度；
  碰撞和子弹仍是原来的圆柱（立着的）或圆柱 + 方块（倒着的），只是看不见。
  漆色（#100）：模型只有一套锈绿色贴图，`world.js` 的 `drumMaterial` 按地图的 `material` 每种颜色克隆一份材质，shader 里按贴图 绿 / 红 的比值认出漆面
  （漆面接近 1，锈偏红、0.45–0.75），漆面换成 `Config.props.drumPaint` 的颜色、亮度不变，锈斑保留。加颜色就在 `drumPaint` 里加一项，不用重新烘贴图。
- **弹药箱**（#98）：`ammo-crate.glb` 一个箱子 0.6 × 0.33 × 0.34 米，`ammoCrates` 把 11 个码成三层台阶，每个箱子按序号掉头、偏一点点；
  每层一个看不见的碰撞方块，能一层层踩上去。
- 模型下载失败时退回原来的方块，游戏照常能玩。
- **压缩过的 glb 不能直接改节点的 `position`**：meshopt 量化把顶点坐标的还原放在节点自己的位移和缩放里，克隆子节点后要套一层 `Group` 再摆（沙袋墙就是这样）。

**改模型：** 纯 Blender 建的在 `assets-src/maps/yard/props/`（`container.py`、`jersey.py`，共用 `lib.py`），Tripo 底模的修整脚本在 `assets-src/maps/yard/props/<名字>/build.py`，
`assets-src/maps/yard/props/build.sh [container jersey sandbag platform crate drum]` 一次完成建模、烘焙、压缩，产物在 `assets/maps/yard/props/`。
流程：bmesh 建几何 → 自动展 UV → 节点材质（Poly Haven 的 CC0 贴图 + 程序生成的锈、污渍、磕碰）→ Cycles 烘焙成颜色、粗糙度、法线 → 导出 glb → `tools/glb.mjs optimize`。
锈多锈少、褪色、脏污的程度都是材质节点里的数字，脚本里有注释。

- **烘焙的坑：** 倒角节点（找棱角）和 AO 要发很多光线，开发机 CPU 上一张 2048 的图要十几分钟。所以这两样各单独烘一次存成图，
  后面的颜色、粗糙度、法线只读这两张图，每像素采样 1 次就够，整个集装箱 1 分钟左右。调试时 `TEX=512` 更快。
- **单面的板（瓦楞板）不能用 `recalc_face_normals` 翻法线**：它只对封闭的零件可靠，单面板会随机朝里，导致箱号印反。
  `lib.Mesh.sheet` 要传朝外的方向。

## 注意事项

- **台阶：** 每级不超过 `config.js` 的 `player.stepHeight`（0.45 米），否则走不上去。
- **同色集装箱：** 颜色贴图按颜色烘焙，同一地图里同色的集装箱都显示第一个的 `label`。要不同编号就用略微不同的颜色，再跑一次 `build.sh container`。
- **加新种类的物体：** 在 `js/world.js` 的 `builders` 里加一个函数，更新上表；再在 Blender 地图工具的 `tools/mapkit/ds_mapkit/schema.py` 加一项
  （在 Blender 里长什么样在 `protos.py`），编号前缀加进 `mapformat.py` 的 `PREFIX`，否则 Blender 打开这张地图会报"不认识的类型"（`blender-maps.md`）。
- **贴图和音效：** 新地图专用的资源放到 `assets/maps/<地图>/`，按需加载（`World.loadMap` 只下载这张图的），不要增加首次下载体积。
