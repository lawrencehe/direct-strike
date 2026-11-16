# Blender 地图工具

负责人在 Blender 里打开游戏地图、摆放物体和玩法点位，导出 JSON 在游戏里直接试玩，满意了上传给开发（#115）。
地图格式见 `maps.md`，负责人的上手教程见 `blender-lessons.md`。

## 分工和为什么

- **地图 JSON（`maps/*.json`）是唯一的源文件**，`.blend` 不进仓库：插件随时能从 JSON 重新生成场景。
  二进制的 `.blend` 进 git 既看不出改了什么、又每存一次多几 MB。负责人自己存的 `.blend` 只是个人的工作文件。
- **用 Blender 当关卡编辑器**，没有自己写网页编辑器：拖拽、撤销、吸附、多选、3D 视图都是现成的，只维护插件和导出；
  以后的新地图有建筑、多层、地形，本来就要在 Blender 建模（`decisions.md`）。负责人愿意学 Blender，开发一课一课教（`blender-lessons.md`）。
- **整张地图不让 AI 生成**：地图首先是玩法设计（视线、掩体高度、出生点保护、对称），生成结果尺寸不准、是一整块网格、挪不动；
  AI（Tripo）用来做**模块化素材**（墙段、建筑件、掩体），在多张地图里复用。新地图走"负责人给蓝图 → 开发出白盒 → 负责人在 Blender 调 → 换模块模型"。

## 流程

```
负责人                                           开发
Blender：打开自带的地图 / 上次导出的 JSON
  ↓ 改
导出 JSON（插件先检查出生点、编号）
  ↓
游戏：设置 → 开发者 → 载入地图文件 → 试玩
  ↓ 满意
"上传给开发" → 得到编号 ───────────────→  node tools/map-check.mjs --map <编号>
                                          没问题：cp ~/direct-strike-data/devlogs/<编号>/map.json maps/yard.json
                                          git diff 看改了什么，提交、上线；插件包里的地图跟着更新
```

- 游戏场景一个页面只建一次，所以载入本地地图后刷新页面；地图存在 `sessionStorage`，同一个标签页里刷新不丢，关掉标签页就恢复原来的地图。
  首页的地图名后面标"（本地文件）"。代码在 `js/devlog.js` 的 `LocalMap`，`main.js` 的 `boot()` 读地图之前先调 `DevLog.useLocalMap()`。
- 本地地图的素材按文件里的 `id` 找（`assets/maps/<id>/`），所以改的是 yard 就用 yard 的模型和贴图。用了线上没有的模型类型会退回方块。
- 游戏存的、上传的都是导出文件的**原文**（不是解析后再序列化），所以开发收到的和 Blender 导出的一字不差，直接覆盖 `maps/` 里的文件，git diff 只显示改了的行。
- 上传和开发者帧数据走同一个接口（`server/api.py`），一次上传一个 `map.json`，`meta.client.kind` 是 `map`；`analyze.mjs --list` 里单独显示。

## 文件

| 文件 | 作用 |
|---|---|
| `tools/mapkit/ds_mapkit/` | Blender 插件（4.2 以后的"扩展"格式，`blender_manifest.toml`） |
| `  mapformat.py` | 纯 Python：固定排版写 JSON、网格坐标、编号、导出前检查。不依赖 bpy，命令行也能用 |
| `  schema.py` | 每种物体 / 实体在 Blender 里怎么表示、导出写哪些字段（**加新类型改这里**） |
| `  protos.py` | 原型：每种东西在 Blender 里长什么样（有模型用模型，没有的用简单形状） |
| `  scene.py` | JSON ↔ Blender 场景：打开、导出、添加 |
| `  fields.py` / `ui.py` | 物体身上的属性（`obj.ds`）；侧栏面板和按钮 |
| `tools/mapkit/build.sh` | 打包：插件代码 + `decode-props.mjs` 还原的道具模型 + `maps/*.json` → `ds_mapkit.zip`，版本号跟游戏 |
| `tools/mapkit/decode-props.mjs` | 游戏的 glb 是 meshopt 压缩 + 量化的，Blender 读不了，还原成普通 glb、贴图缩到 512 转 png |
| `tools/mapkit/test_blender.py` | Blender 里跑的测试（由 `tools/tests/mapkit.mjs` 调用） |
| `tools/tests/mapkit.mjs` | 完整测试：打包 → 装进临时 Blender → 往返逐字节相同 → 模拟编辑 → map-check → 游戏里载入、上传、换回 |
| `mapkit/index.html` | 下载页 https://game.lightup.host/mapkit/ ，`deploy.sh` 部署时把 zip 打包到旁边 |

改了插件跑 `node tools/tests/mapkit.mjs`（`--render` 顺便渲染俯视、斜视预览图到 `tools/out/mapkit-test/`），要几分钟。

## 在 Blender 里的样子

- 集合"DS 地图"下分 地面 / 围栏 / 物体 / 玩法 / 区域 / 远景 / 辅助（不导出）。原型在隐藏的"DS 原型"里，不导出。
- **物体的名字就是编号**（C1、S1…），大纲视图和 3D 视图里直接看到；区域的名字是中文名，编号在属性里。
- 固定造型的东西（集装箱、出生点…）是**集合实例**：一个空物体指向原型集合，几十个集装箱共用一份网格；改颜色、长度就是换原型。
  朝向固定的（油桶、轮胎、货车…）锁住了旋转，免得以为转了有用。
- 按尺寸变的东西（方块、空气墙、水泥地块、远景楼、区域、模型的碰撞）是**缩放过的单位方块 / 平面**，原点在底面中心，缩放就是尺寸。
  它们共用一份网格，所以"应用缩放"（Ctrl+A）会报"多用户数据"不让做，正好防止把尺寸弄乱。
- 模型的碰撞方块（中央平台的 18 个）是模型的**子物体**，线框显示，挪模型跟着走；导出时在模型自己的空间里取包围盒。
- 辅助集合里有沥青场地、网格线和网格坐标（场地四边的字母、数字），不能选中、不导出。

坐标换算：Blender (X, Y, Z) = 游戏 (x, −z, y)；绕竖轴的转角两边一样（0 朝北，逆时针为正），所以 Blender 里的 R 转动直接对应 `rot` / `yaw`。

## 导出规则

- 按物体的 `ds.order`（打开时的顺序）排，没动过的东西在文件里的位置不变；新加的排在同一个数组最后，复制出来的紧挨着原件。
- 名字不是"前缀 + 数字"、或者和别的重复（Shift+D 复制出来的 `C1.001`），换成同类最大数字 + 1，Blender 里的名字也一起改。
- 只认 90° 的东西（集装箱的 `alongZ`、方块的尺寸…）转了别的角度，按最近的 90° 导出并提醒。
- 数字保留 4 位小数（Blender 存的是 32 位浮点，`3.2` 读回来是 `3.2000000477`），整数写成整数；值是 0 的可选字段（`y`、`rot`、`alongZ`）不写。
- 插件不认识的字段原样存在 `ds.extra` 里，导出时写回去，所以老插件打开新地图不丢字段（不认识的**类型**会直接报错，要先更新插件）。
- 导出前检查（`mapformat.check`）：出生点至少 4 个、开局和兜底各一个、北边有出生点、巡逻点至少 2 个、训练场出生点一个、编号不重复、点位在场地内。
  有错误不写文件。能不能走通、碰撞盒穿插要等开发跑 `map-check`。

## 加新的物体类型

1. 游戏：`js/world.js` 的 `builders` 加造型，`maps.md` 的表里加一行。
2. 插件：`schema.py` 的 `OBJECTS`（或 `ENTITIES`）加一项（形状、朝向规则、字段顺序）；`protos.py` 的 `BUILDERS` 加它在 Blender 里的样子；
   `mapformat.py` 的 `PREFIX` 加编号前缀；要在"添加"面板里出现就加进 `ADD_OBJECTS`。有新的可编辑字段再加到 `fields.py` 和 `scene.py` 的 `_set_fields` / `_fields`。
3. `node tools/tests/mapkit.mjs`。上线后负责人重新下载插件装一次。

## 坑

- **Blender 读不了游戏里的 glb**（meshopt 压缩、量化），所以插件包里的是 `decode-props.mjs` 还原过的；压缩前的母版大多不进仓库，也不能指望。
- **后台跑的 Blender 里，操作报 ERROR 会变成 Python 异常**（`RuntimeError`），测试里要接住。
- **测试装插件用临时的用户目录**（`BLENDER_USER_RESOURCES`），不碰开发机自己的 Blender 设置；`extension install-file` 和负责人"从磁盘安装"是同一条路。
- **`map-check --map` 以前悄悄检查的是原来的地图**：资源清单（#85）给地图请求加了 `?v=哈希`，测试页面拦截用的 glob `**/maps/*.json` 匹配不到带查询串的地址。
  现在用正则（`tools/lib/game-page.mjs`），`map-check` 打印的出生点个数和文件对得上才算真的在查这个文件。
- 3D 视图里的颜色、光照和游戏不一样（油桶的漆色是近似的，轮胎、木托盘、货车、灯柱是简单形状），最终效果在游戏里看。
