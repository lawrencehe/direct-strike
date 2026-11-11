# 美术素材和参考资源

枪械、人物、地图都用 Blender 建模（见 `decisions.md`）。本页列出去哪里找参考图和现成素材、哪些能用、挑好后交什么。

## 授权规则（先看）

- **参考图**（照片、线稿、别人的作品截图）只是用来看的，不进游戏，**不受授权限制**。放进 `refer/`，不提交。
- **进游戏的素材**（模型、贴图、HDRI）**用 CC0、MIT 或 CC BY 4.0**，来源登记在 `assets/LICENSES.md`。
  - CC BY 要署名：作者名、原作链接、授权名称、做过哪些修改，写进 `LICENSES.md` 的表格（首页的"素材来源与署名"链接指向它）。
  - 下载的 glb 里通常带着这些信息（Sketchfab 导出的文件里有 author、license、source 字段）。
- 不能用的：
  - CC BY-NC（禁止商用）、CC BY-ND（禁止修改）、CC BY-SA（改了要用同样授权发布）
  - Fab（Epic）、TurboSquid、CGTrader、Unity / Unreal 商店的商用授权
  - 来源不明、"网上下载的"、游戏里提取（ripped）的模型。Sketchfab 上有人把商业游戏的模型提取出来标成 CC BY，
    这种授权无效：看作者主页是不是一系列原创作品，描述里有没有 "ripped""from game" 之类的字样
- 下载前在素材页面上确认授权，截图或记下链接，方便登记。
- **朋友做的、委托制作的模型**（2026-11-08）不是"来源不明"：没有原作链接也可以用，`LICENSES.md` 里写作者和授权，
  来源写"委托制作 / 朋友制作"。最好在 glb 的 `asset.extras` 里标上 `author` 和 `license`。详见 `assets/LICENSES.md`。
- **没有原作链接的模型**（2026-11-11 负责人定，issue #42）：`LICENSES.md` 的来源一律写"同事提供、不登记原作链接"，
  只要授权符合要求（CC0 / MIT / CC BY 4.0，模型文件里标的授权也算）就可以集成进游戏。

## 一、找参考图（挑枪、定比例、看细节）

| 网站 | 用途 |
|---|---|
| [IMFDb](https://www.imfdb.org)（互联网电影枪械数据库） | 收录电影、游戏里出现过的枪，可以按游戏查（CS、使命召唤、逃离塔科夫等）。适合挑"在游戏里看着帅"的枪 |
| [Wikimedia Commons](https://commons.wikimedia.org) | 大量实物照片，很多是标准侧视图，型号和变体齐全 |
| [The-Blueprints](https://www.the-blueprints.com)（Weapons 分类） | 枪械的正交线稿（侧视、俯视），比例准确，**对建模最有用** |
| [Forgotten Weapons](https://www.forgottenweapons.com) | 拆解细节和特写，适合看结构、零件和磨损 |
| 厂商官网（Kalashnikov、Glock、SIG Sauer 等） | 官方产品图和尺寸参数 |
| [ArtStation](https://www.artstation.com)（搜 weapon / FPS weapon） | 专业游戏美术的作品，用来定质感、磨损程度、配色风格 |

## 二、找现成模型（CC0 或 CC BY）

写实的枪模型大多是 CC BY，CC0 的很少。找不到合适的，就由 Claude 照参考图建模。

| 网站 | 怎么用 | 说明 |
|---|---|---|
| [Sketchfab](https://sketchfab.com) | 搜索后在 License 筛选里勾 **CC0** 和 **CC Attribution**（就是 CC BY），再勾 Downloadable | 写实模型最多的地方。现在的 AK 就是从这里找的 |
| [BlenderKit](https://www.blenderkit.com) | 授权筛选选 **CC0** | Blender 素材库，质量较稳定 |
| [OpenGameArt](https://opengameart.org) | 授权筛选选 CC0 | 质量参差不齐 |
| [Quaternius](https://quaternius.com) | 全部 CC0 | 低多边形卡通风格，不够写实，只能参考造型 |
| [Kenney](https://kenney.nl) | 全部 CC0 | 卡通风格，适合当占位 |

拿到的模型通常还要改：减面、重新展 UV、换材质、对齐握把位置，由 Claude 在 Blender 里处理。

## 三、材质和环境光（地图和枪的贴图）

| 网站 | 内容 | 授权 |
|---|---|---|
| [Poly Haven](https://polyhaven.com) | PBR 材质、HDRI 环境光、少量模型 | 全部 CC0 |
| [ambientCG](https://ambientcg.com) | 大量 PBR 材质：混凝土、砖墙、金属、木头、油漆、生锈 | 全部 CC0 |

PBR 材质一般包含 5 张贴图：颜色（Color / Albedo）、法线（Normal，选 **GL** 版本）、粗糙度（Roughness）、金属度（Metalness）、AO。
挑材质时记下名字或链接就行，下载和接入由 Claude 做。

## 挑好以后交什么

每把枪尽量放进 `refer/`（文件名带上型号，比如 `ak74-side.jpg`）：

1. **标准侧视照片或线稿**：最关键，用来定比例
2. 俯视图或正面图：有就放
3. 几张细节特写：机匣、枪口、握把、弹匣、准星
4. 一张质感参考：想要的新旧程度和颜色，比如"黑色烤漆带磨损""木托""沙色"
5. 找到的模型或材质：把链接给 Claude，下载的文件放进 `assets/models/` 下对应的目录（如 `gun/`）也行，Claude 会挪到 `assets-src/` 当母版

然后告诉 Claude 型号和想要的感觉。先只定一把主武器，把"建模 → 预览图确认 → 导出 → 接进游戏"整条流程跑通，再做其他的。
