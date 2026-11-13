# 第三方资源

| 文件 | 来源 | 协议 |
|---|---|---|
| `models/gun/ak47.glb` | "[Ak47](https://sketchfab.com/3d-models/ak47-831519a097d84e079fd8bc4b15e5b57d)"，来自 Sketchfab | [CC0]。**有改动**：拆成枪身、弹匣、拉机柄三个部件，删除备用弹匣、子弹、骨骼和动画，调整尺寸和朝向，贴图转 WebP |
| `models/arm/arm.glb` | 第一人称手臂（袖子 + 半指手套），作者 H.John，来自 Sketchfab（模型文件内标注作者和 CC0） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：材质由 SpecularGlossiness 转为 metal/rough，贴图缩到 1024 并转 WebP |
| `models/gun/m4.glb` | M4 步枪，作者 H.John（模型文件内标注作者和 CC0）。同事提供、不登记原作链接（负责人确认，#42） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：删除枪背带，拆成枪身、弹匣、枪机框三个部件，放大到真枪尺寸（全长 0.84 米）并调整朝向，材质改不透明，贴图缩到 2048 并转 WebP |
| `models/gun/sg.glb` | SG 手枪，作者 H.John（模型文件内标注作者和 CC0）。同事从网上下载的 CC0 原作，按本项目调整后提供，不登记原作链接（负责人确认，#14） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：拆成枪身、套筒、弹匣三个部件，补了弹匣体，缩放到全长 0.205 米并调整朝向，材质改不透明，贴图缩到 1024 并转 WebP |
| `models/human/ukrainian-soldier.glb` | 乌克兰士兵，作者 H.John（模型文件内标注作者和 CC0）。同事从网上下载的 CC0 原作，按本项目调整后提供，不登记原作链接（负责人确认，#14） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：转 180° 朝向，从 init_soldier.glb 移植 Idle/Walk/Run 动画，透明贴图合进颜色贴图、BLEND 改 MASK，贴图缩到 1024 并转 WebP |
| `models/human/init_soldier.glb` | three.js 仓库 `examples/models/gltf/Soldier.glb`（r149），角色和动画来自 Mixamo | 随 three.js 以 MIT 协议分发，见 `../vendor/three.LICENSE` |
| `sound/ak-1.mp3` `ak-2.mp3` `ak-far.mp3`、`m4-*.mp3`、`pistol-*.mp3` | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) 的 Prepared 版（负责人提供，#45）：AK-47 `C_28P` / `C_31P`，AR-15 `D_32P` / `D_24P`，Walther PPQ `X_39P` / `X_31P` | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：切出单发、淡出、峰值归一化，转单声道 96 kbps mp3 |
| `sound/mag-out.mp3` `mag-in.mp3` `rack-back.mp3` `rack-forward.mp3` | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds)，来自 OpenGameArt：`assaultriflereload1.wav`、`gunreload1.wav` | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：切成四个动作、淡出、归一化，转 mp3 |
| `sound/frag.mp3` `flash.mp3` | [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx)（OpenGameArt）的两段礼炮爆响；手雷再叠一层 Kenney [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) 的 `low_frequency_explosion_000`（经 [Combat Sound Effects Pack](https://opengameart.org/node/195932) 下载） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：叠层、剪长度、淡出、归一化，转 mp3 |
| `maps/yard/textures/asphalt_*.webp` | [Tarred Gravel](https://polyhaven.com/a/tarred_gravel)，作者 Dimitrios Savva，来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：2k jpg 转 WebP |
| `maps/yard/textures/concreteFloor_*.webp` | [Concrete Floor Damaged 01](https://polyhaven.com/a/concrete_floor_damaged_01)，作者 Rob Tuytel，来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：2k jpg 转 WebP |
| `maps/yard/textures/concrete_*.webp` | [Dirty Concrete](https://polyhaven.com/a/dirty_concrete)，作者 Rob Tuytel，来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：2k jpg 转 WebP |
| `maps/yard/textures/dirt_*.webp` | [Dirt](https://polyhaven.com/a/dirt)，作者 Charlotte Baglioni，来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：2k jpg 转 WebP |
| `maps/yard/props/container*.{glb,webp}` | 自己用 Blender 脚本建模（`assets-src/maps/yard/props/container.py`），材质烘焙时用了 Poly Haven 的 [Rust Coarse 01](https://polyhaven.com/a/rust_coarse_01) 和 [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal) | 模型是本项目自制；贴图素材 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `maps/yard/props/jersey.glb` | 自己用 Blender 脚本建模（`jersey.py`），材质烘焙时用了 Poly Haven 的 [Dirty Concrete](https://polyhaven.com/a/dirty_concrete) | 同上 |
| `maps/yard/props/sandbag.glb` | 自己用 Blender 脚本建模（`sandbag.py`），材质烘焙时用了 Poly Haven 的 [Hessian 230](https://polyhaven.com/a/hessian_230) | 同上 |
| `maps/yard/props/central-platform.glb` | Tripo 生成（H3.1，`v3.1-20260211`），任务号 `b5b32867-c004-4a8b-b86a-af5b1e765a0e`，参考图：负责人用 AI 生成的场景概念图，裁出中央平台部分 | Tripo 付费账号生成，可商用（见 #72）。**有改动**：删掉参考图前景里被一起生成的枪，按区域拆成 base / canopy / cover / lamp_l / lamp_r 五个节点，缩放到真实尺寸（台面高 1.4 米），原点放在底面中心，贴图转 WebP；脚本 `assets-src/models/map/central-platform/build.py`，原始输出在 `tripo/` |
| `maps/yard/props/ammo-crate.glb` | Tripo 生成（H3.1，`v3.1-20260211`），任务号 `22fd052d-3c70-44fe-9f81-e4ce53d18bbf`，参考图：负责人提供（`refer/box.png`） | Tripo 付费账号生成，可商用（见 #72）。**有改动**：删掉悬浮碎粒、合成单网格，缩放到真实尺寸（长 0.6 米），原点放在底面中心，Decimate 减面到 3000，贴图转 WebP；脚本 `assets-src/models/map/ammo-crate/build.py`，原始输出和参考图在 `tripo/` |
| `maps/yard/env.hdr` | [Abandoned Parking](https://polyhaven.com/a/abandoned_parking)（1k HDRI），作者 Sergej Majboroda，来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。未改动 |
| `weather/rain-dusk/sky.webp` | [Kloppenheim 07 (Pure Sky)](https://polyhaven.com/a/kloppenheim_07_puresky)（4k HDRI），作者 Greg Zaal（天空修饰 Jarod Guest），来自 Poly Haven | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：转成普通图片，降饱和、加对比、压暗偏蓝，转 WebP（#77） |
| `../vendor/RGBELoader.js` | three.js r147 `examples/js/loaders/RGBELoader.js` | MIT |
| `../vendor/GLTFLoader.js` | three.js r147 `examples/js/loaders/GLTFLoader.js` | MIT |
| `../vendor/SkeletonUtils.js` | three.js r147 `examples/js/utils/SkeletonUtils.js` | MIT |
| `../vendor/meshopt_decoder.js` | meshoptimizer 1.3.0 `meshopt_decoder.cjs` | MIT |

`assets/models/human/init_soldier.glb` 是压缩版（删除了 TPose 动画，网格用 meshopt、贴图用 WebP），未压缩的原始文件在 `assets-src/models/human/init_soldier.glb`。

`assets/models/human/ukrainian-soldier.glb` 由 `assets-src/models/human/ukrainian-soldier/build.sh` 从原始下载 `assets-src/models/human/ukrainian-soldier-download.glb` 生成（原始 FBX 和贴图在 `ukrainian-soldier/` 下）。原始文件体积大，不入仓库，只保留在开发机上。

`assets/models/arm/arm.glb` 由原始文件 `assets-src/models/human/arm-sketchfab.glb` 用 `tools/glb.mjs optimize --texture-size 1024` 压缩而成。

`assets/models/gun/m4.glb` 由 `assets-src/models/gun/m4.py` 从原始文件 `assets-src/models/gun/m4-download.glb` 加工、再用 `tools/glb.mjs optimize --texture-size 2048` 压缩而成；
`assets/models/gun/sg.glb` 由 `assets-src/models/gun/sg.py` 从 `assets-src/models/gun/sg-handgun-download.glb` 加工、再用 `--texture-size 1024` 压缩而成。原始文件体积大，不入仓库，只保留在开发机上。

`assets/sound/*.mp3` 由 `assets-src/sound/build.py`（`blender -b --python`）从原始录音剪出来：除枪声库以外的原始文件在 `assets-src/sound/source/`；枪声库原始 wav 共 329 MB，不入仓库，只保留在开发机上的 `assets-src/sound/Prepared SFX Library/`。

`assets/models/gun/ak47.glb` 由 `assets-src/models/gun/ak47.py` 从下载的原始文件 `assets-src/models/gun/ak47-sketchfab.glb` 加工、再用 `tools/glb.mjs optimize` 压缩而成。

## 朋友做的、委托制作的、同事提供的模型

不是自己从网上下载、而是朋友或委托别人做的模型，或者同事下载 CC0 原作后按项目调整好再给的模型，没有原作链接也可以用，登记时写清：
- 作者（谁做的）和授权（CC0，或者"作者授权本项目使用"），"来源"一栏写"委托制作"或"朋友制作"，不用填链接；
- 最好让作者在 glb 里写上作者和授权（glTF 的 `asset.extras`，例如 `{"author": "...", "license": "CC0"}`），现在的几个模型都是这样标的。
- **没有原作链接的模型一律写"同事提供、不登记原作链接"**（2026-11-11 负责人定，#42）：授权符合要求（CC0 / MIT / CC BY 4.0）就可以进游戏，
  "来源"一栏照 `m4.glb` 那一行写作者、授权和这句话。

## Tripo 生成的模型

用 [Tripo](https://www.tripo3d.ai) 付费账号生成、再在 Blender 里修整过的模型（#72）。负责人查过 Tripo 官方条款：付费账号生成的模型可以用于商业游戏。
在上面的表格里加一行，"来源"写：
- "Tripo 生成（模型版本，如 H3.1），任务号 `<task_id>`，参考图：负责人提供 / 文字描述"；
- 改动：在 Blender 里做了什么（减面到多少、换了什么材质、缩放和朝向），加工脚本的路径；
- 用了 Poly Haven / ambientCG 材质的，材质另外写上名字（CC0）。

"协议"一栏写"Tripo 付费账号生成，可商用（见 #72）"。原始输出放在 `assets-src/models/<类>/<名字>/tripo/`（进 git）。

## 署名

CC BY 授权要求署名：作者、原作链接、授权名称、是否修改过。上面的表格就是署名清单，
游戏首页底部的"素材来源与署名"链接指向本文件（线上可访问）。新增 CC BY 素材时在表格里补一行，格式照抄。

`brand/` 下是项目自己的 logo（由用户提供，原图不入仓库），不是第三方资源；`logo-dark.png` 由同一张原图去白底、黑色改骨白生成。
`ui/maps/` 下的地图预览图是游戏自己的截图。

`assets/maps/yard/props/` 下的道具模型由 `assets-src/maps/yard/props/build.sh` 生成（#50）。
`assets/weather/` 下的天空贴图由 `assets-src/weather/fetch_weather.py` 从 Poly Haven 下载、调色而成（#77），原始下载在 `assets-src/weather/download/`，不入仓库。
`assets/maps/yard/` 下的材质和 HDRI 由 `assets-src/maps/yard/fetch_textures.py` 从 Poly Haven 下载、转换而成；原始下载在 `assets-src/maps/yard/download/`，不入仓库，随时可重新下载。

其余贴图（集装箱、沙袋、远景楼房等）、音效由代码实时生成（`js/textures.js`、`js/audio.js`），没有外部文件。

## 换模型

`js/character.js` 只假设模型是 Mixamo 骨骼（骨头名以 `mixamorig:` 开头），且带 `Idle` / `Walk` / `Run` 三个动画。
任何从 Mixamo 导出、再转成 glb 的角色都可以直接替换 `models/human/ukrainian-soldier.glb`，或者改 `config.js` 里的 `character.model` 路径。

推荐的免费来源：
- Mixamo（https://www.mixamo.com）：免费角色和动作，可下载 FBX，用 Blender 转 glb
- Quaternius（https://quaternius.com）：CC0 低多边形角色包，骨骼名不同，需要改 `character.js` 里的 `B` 表
- KayKit（https://kaylousberg.itch.io）：CC0 角色包，自带大量动画
