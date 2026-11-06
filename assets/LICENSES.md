# 第三方资源

| 文件 | 来源 | 协议 |
|---|---|---|
| `models/gun/ak47.glb` | "[Ak47](https://sketchfab.com/3d-models/ak47-831519a097d84e079fd8bc4b15e5b57d)"，来自 Sketchfab | [CC0]。**有改动**：拆成枪身、弹匣、拉机柄三个部件，删除备用弹匣、子弹、骨骼和动画，调整尺寸和朝向，贴图转 WebP |
| `models/human/arm.glb` | 第一人称手臂（袖子 + 半指手套），作者 H.John，来自 Sketchfab（模型文件内标注作者和 CC0） | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。有改动：材质由 SpecularGlossiness 转为 metal/rough，贴图缩到 1024 并转 WebP |
| `models/human/init_soldier.glb` | three.js 仓库 `examples/models/gltf/Soldier.glb`（r149），角色和动画来自 Mixamo | 随 three.js 以 MIT 协议分发，见 `../vendor/three.LICENSE` |
| `../vendor/GLTFLoader.js` | three.js r147 `examples/js/loaders/GLTFLoader.js` | MIT |
| `../vendor/SkeletonUtils.js` | three.js r147 `examples/js/utils/SkeletonUtils.js` | MIT |
| `../vendor/meshopt_decoder.js` | meshoptimizer 1.3.0 `meshopt_decoder.cjs` | MIT |

`assets/models/human/init_soldier.glb` 是压缩版（删除了 TPose 动画，网格用 meshopt、贴图用 WebP），未压缩的原始文件在 `assets-src/models/human/init_soldier.glb`。

`assets/models/human/arm.glb` 由原始文件 `assets-src/models/human/arm-sketchfab.glb` 用 `tools/glb.mjs optimize --texture-size 1024` 压缩而成。

`assets/models/gun/ak47.glb` 由 `assets-src/models/gun/ak47.py` 从下载的原始文件 `assets-src/models/gun/ak47-sketchfab.glb` 加工、再用 `tools/glb.mjs optimize` 压缩而成。

## 署名

CC BY 授权要求署名：作者、原作链接、授权名称、是否修改过。上面的表格就是署名清单，
游戏开始界面底部的"素材来源与署名"链接指向本文件（线上可访问）。新增 CC BY 素材时在表格里补一行，格式照抄。

`brand/` 下是项目自己的 logo（由用户提供，原图不入仓库），不是第三方资源。

其余贴图、音效由代码实时生成（`js/textures.js`、`js/audio.js`），没有外部文件。

## 换模型

`js/character.js` 只假设模型是 Mixamo 骨骼（骨头名以 `mixamorig:` 开头），且带 `Idle` / `Walk` / `Run` 三个动画。
任何从 Mixamo 导出、再转成 glb 的角色都可以直接替换 `models/human/init_soldier.glb`，或者改 `config.js` 里的 `character.model` 路径。

推荐的免费来源：
- Mixamo（https://www.mixamo.com）：免费角色和动作，可下载 FBX，用 Blender 转 glb
- Quaternius（https://quaternius.com）：CC0 低多边形角色包，骨骼名不同，需要改 `character.js` 里的 `B` 表
- KayKit（https://kaylousberg.itch.io）：CC0 角色包，自带大量动画
