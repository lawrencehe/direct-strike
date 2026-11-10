# Direct-Strike v0.30

![Direct-Strike](assets/brand/logo.png)

一个纯浏览器运行的第一人称射击游戏。不需要安装任何东西，也不需要联网。

**在线试玩：https://game.lightup.host**

## 三种模式

- **训练场**：站在高台上打靶，统计命中率和爆头
- **1v1 对决**：和一个 NPC 在集装箱堆场里单挑。谁被击杀谁在远处重生，先打到 5 杀的赢（首页可以改成 3 或 10 杀）
- **波次**：一波一波的敌人会巡逻、发现你、横移、点射。清完一波回满血和子弹，下一波人更多更强

## 武器

| 槽位 | 武器 | 说明 |
|---|---|---|
| 1 | AK（主武器） | 全自动，30 发。爆头 100、身体 34、腿 25 |
| 2 | 手枪（副武器） | 半自动，15 发，换弹快。爆头 100、身体 26、腿 18 |

**首页"装备"里可以换枪和对手形象**：主武器 AK / M4，副武器 手枪 / SG 手枪，对手 乌克兰士兵 / 特种兵。选择存在浏览器里，
没选过的模型不会下载。现在换枪只换外观，数值一样；想让某把枪不同，在 `config.js` 的 `loadout` 里给它写覆盖参数。
| 3 | 手雷 ×1 | 出手后 2 秒爆炸（飞行时间也算在内），半径 7 米，2.3 米内必死；按头、胸、腿露出的比例算伤害，全挡住不受伤，也会炸到自己 |
| 4 | 闪光弹 ×1 | 致盲视野内的 NPC（站住不开枪）；你自己正对着也会白屏，背对影响小很多 |
| 5 | 烟雾弹 ×1 | 烟团持续 14 秒，NPC 看不穿就不会开枪 |

投掷物的用法：**按住左键拔环，松开扔出去**。和真手雷一样有两道保险：拉环拔了，只要手还攥着保险握片，引信就不走，攥多久都不会炸；
出手时握片弹开，引信才开始倒计时。人被打死时手一松，雷掉在脚下，也是从这时开始算。

换弹：**打空了自动换弹**，不用再扣扳机；R 随时换。换弹中切枪会中止（子弹数不变），切回空枪会自动再换。
空枪换弹最后多一个拉机柄上膛的动作。换弹进度看右下角弹药数下面的细线。

## 经济（对决、波次）

打死敌人拿钱，回到**这条命的出生点**（地上有一圈橙色的环）买投掷物：

- 赏金只看最后一击：爆头打死 $300、枪打身体或腿打死 $200、手雷炸死 $400。NPC 被自己的雷炸死不给钱。
- 钱最多存 $2000，到了上限再打死人也不涨。钱跟着整局走，死了不清零。
- 站进购买区，屏幕左侧出现购物车图标（橙色 = 买得起，灰色 = 买不起）。按 **B** 打开购买面板，按投掷物自己的槽位键（3 / 4 / 5）买一个，买完面板立刻关掉，再按一次就切过去：手雷 $300、闪光 $200、烟雾 $300。
  每种最多带 2 / 2 / 1 个。面板开着时照样能走能看，走出购买区自动关掉。
- 开局每种各带 1 个。死了重生回到开局的数量（多买的随人一起没了）；波次之间补给不收走多买的。
- 训练场投掷物不限量，没有经济。数值都在 `config.js` 的 `economy`。

NPC 和你都有 100 点生命。

**NPC 的装备和你完全一样**：AK + 手枪 + 三种雷各一个，伤害、射速、弹匣、换弹时间都是同一套数值（爆头一样是 100）。
AK 打空了离你近就掏手枪，远了就换弹；你躲起来时它会按你消失时的跑动方向推算你躲到了哪、你开枪它也能听到，然后预演一遍再丢手雷或闪光，炸不到就不丢（丢完闪光会背过身）；血少时丢烟后撤。
嫌太难可以调 `config.js` 里 `bots.damageMul`（NPC 伤害倍数）和 `bots.spread`（NPC 散布）。

NPC 死亡是实时物理（布娃娃）：爆头会被打飞，打身体有踉跄、瘫倒、拧身三种倒法，打腿往伤腿一侧栽，手雷能把人炸飞。尸体会撞墙，枪会脱手，地上慢慢渗出血泊。

## 怎么运行

**运行 `start.sh`（Windows 用 `start.bat`）**，它会启动一个本地服务并自动打开浏览器。
不能直接双击打开 `index.html`，浏览器不允许这样读取地图和模型文件。
手动的话：在本目录打开终端，运行 `python3 server/api.py --static . --port 8000`，然后访问 `http://localhost:8000`
（`python -m http.server 8000` 也能玩，只是没有开发者模式的接口）。

> 为什么不能直接双击 `index.html`？浏览器禁止 `file://` 页面加载 `.glb` 模型文件。
> 直接双击也能玩，但 NPC 会退化成方块小人。

发布到线上：`./deploy.sh`，说明见 `docs/deploy.md`。

## 操作

默认按键如下。**首页"设置"或暂停菜单的"设置"里点击按键名就能改键**，改过的按键存在浏览器里，下次打开还在；"恢复默认"一键还原。

| 按键 | 作用 |
|---|---|
| 鼠标 | 转动视角 |
| W A S D | 移动 |
| Shift（按住） | 下蹲：变矮、变慢、更准，能躲到沙袋后面；头顶有东西时站不起来 |
| CapsLock（按住） | 奔跑（浏览器里 Ctrl+W 会关标签页、Alt 会弹菜单，所以默认不用它们，想用可以自己改） |
| 空格 | 跳跃（0.45 米以下的台阶直接走上去，不用跳） |
| 左键 | 射击（AK 按住连发，手枪一次一发）；投掷物按住拉环、松开扔出 |
| R | 换弹 |
| 1 2 3 4 5 | 切换：AK / 手枪 / 手雷 / 闪光弹 / 烟雾弹 |
| Q 或滚轮 | Q 切回上一把武器；滚轮按顺序切换（滚轮不能改键） |
| B | 在出生点打开购买面板（对决、波次） |
| T | 重置统计（训练场） |
| Esc | 暂停 |

默认按键在 `js/config.js` 的 `keys` 里，鼠标侧键也可以绑（Mouse3 / Mouse4）。

## 地图

一座废弃的集装箱堆场，36 × 48 米。南北两头是出生点，中间一座带台阶的高台，
两侧各有一排集装箱和一条侧道。所有掩体、出生点、NPC 巡逻点、靶子位置都在 `maps/yard.json` 里，
格式说明见 `docs/maps.md`，贴图全部由 `js/textures.js` 用 Canvas 画出来。

## 目录结构

```
direct-strike/
├── index.html        页面骨架：画布、HUD、各个界面（加载、首页、简报、暂停、结算），按顺序加载脚本
├── start.sh / .bat   一键启动本地服务
├── deploy.sh         一键发布到 game.lightup.host（提交推送部署一条龙用 tools/ship.sh）
├── deploy/           站点容器和开发接口容器的 compose、Caddyfile
├── server/api.py     开发接口（开发者模式的密码校验和上传），只用 Python 标准库；游戏本身不需要它
├── docs/             开发文档，索引见 docs/README.md
│   ├── workflow.md       开发流程：分支、提交、版本号、验证、发布
│   ├── architecture.md   代码怎么拼在一起、游戏循环、已知的坑
│   ├── decisions.md      项目方向和做过的决定
│   ├── testing.md        冒烟验证和写测试脚本
│   ├── devmode.md        开发者模式：真机录帧数据和画面、上传、分析
│   ├── tools.md          本地工具链的安装和用法
│   ├── ui.md             界面流程、全屏规则、玩家设置、视觉规范
│   ├── maps.md           地图文件格式、怎么改地图、怎么加新地图
│   └── deploy.md         部署架构、首次接入、回滚
├── maps/yard.json    ★ 地图数据：掩体、出生点、巡逻点、靶子
├── tools/            开发工具（验证、模型、图片、骨骼、地图），不发布；tools/tests/ 是留在仓库里的针对性测试，
│                     tools/devlog/analyze.mjs 分析开发者模式上传的数据；tools/autopilot/ 定时处理 GitHub 上交给 Claude 的 issue
├── assets-src/       未压缩的模型母版和 Blender 加工脚本，不发布
├── CLAUDE.md         给 AI 助手看的项目约定
├── css/style.css     界面和 HUD 样式（颜色、字体是开头的 CSS 变量）
├── assets/
│   ├── brand/               logo（logo-dark.png 用在深色界面上）、网站图标、分享预览图
│   ├── ui/maps/             首页的地图预览图（游戏截图）
│   ├── models/human/ukrainian-soldier.glb  NPC 模型（Mixamo 骨骼，带待机/走/跑动画）
│   ├── models/human/init_soldier.glb  可选的 NPC 形象"特种兵"，也是动画来源
│   ├── models/arm/arm.glb           第一人称手臂（蒙皮模型，CC0）
│   ├── models/gun/ak47.glb            AK 枪模（Blender 加工，CC BY 4.0，署名见 LICENSES.md）
│   ├── models/gun/m4.glb              M4 枪模（Blender 加工，assets-src/models/gun/m4.py）
│   ├── models/gun/sg.glb              SG 手枪枪模（Blender 加工，assets-src/models/gun/sg.py）
│   └── LICENSES.md          第三方资源的来源和协议，以及怎么换模型
├── vendor/
│   ├── three.min.js         Three.js r149（3D 渲染库，MIT 协议）
│   ├── GLTFLoader.js        加载 .glb 模型
│   ├── meshopt_decoder.js   解压 meshopt 压缩的模型（MIT 协议）
│   └── SkeletonUtils.js     复制带骨骼的模型（多个 NPC 共用一份模型数据）
└── js/
    ├── config.js     ★ 所有可调参数（手感、武器、NPC 难度、对决规则、画质……）
    ├── settings.js   玩家设置（灵敏度、视野、音量、准星、自动全屏、对决杀数）：存浏览器，写回 config
    ├── main.js       入口：创建对象、模式切换、全屏和锁鼠标、游戏循环
    ├── input.js      键盘鼠标输入、指针锁定、按键绑定（改键 + 保存）
    ├── physics.js    ★ 方块碰撞 + 自动上台阶（玩家和 NPC 共用）
    ├── player.js     ★ 视角、移动、跳跃、生命值、重生
    ├── weapon.js     ★ 切枪、射线射击、散布、后坐力、伤害、换弹、弹孔、投掷动作、枪模动画
    ├── grenades.js   投掷物丢出去之后的事：反弹、爆炸伤害、致盲、烟团
    ├── gunmodel.js   枪模和手臂：AK、手臂加载 glb；手枪、手雷还是基础几何体 + Canvas 贴图（逐步换成 glb）
    ├── truck.js      地图里那辆平头货车：驾驶室、货斗、轮子、货物，全是基础几何体 + Canvas 贴图
    ├── ragdoll.js    布娃娃：NPC 死亡时的物理（Verlet 质点 + 约束），不同死法的冲量都在这里
    ├── character.js  ★ NPC 外观：加载模型、按位移驱动走/跑动画（不滑步）、腿和上半身分开转、持枪姿势（简易 IK）、判定盒
    ├── bots.js       ★ NPC 脑子：状态机 AI、视野感知、点射、换弹切枪、丢雷、绕障碍；对决 / 波次管理
    ├── world.js      ★ 场景构建器：把地图数据变成 3D 场景；各种物体的造型、天空、光照
    ├── textures.js   程序生成的贴图（沥青、水泥、集装箱、沙袋、铁丝网、天空……）
    ├── targets.js    靶子（状态机：立着 → 倒下 → 立起）
    ├── effects.js    曳光、枪口火光、血（血雾、血滴、血迹、血泊）、爆炸
    ├── hud.js        战斗中的 HUD：准星、命中标记、弹药、生命、受击方向、比分、钱和购买面板
    ├── economy.js    经济：击杀赏金、出生点购买区、购买投掷物
    ├── ui.js         界面流程：加载 → 首页 → 作战简报 → 暂停 / 结算，设置页和改键
    ├── devlog.js     开发者模式：录每帧数据和画面、帧率浮层、上传（要服务器校验密码）
    └── audio.js      用 Web Audio 实时合成的音效
```

带 ★ 的文件是 FPS 的核心，建议优先阅读。

## 建议的阅读顺序

想参与开发的话，先读 `docs/README.md`（文档索引）和 `docs/workflow.md`（开发流程），然后看代码：

1. `config.js`：先看看有哪些参数
2. `main.js`：理解游戏循环"输入 → 更新 → 渲染"和三种模式怎么切换
3. `maps/yard.json` → `world.js`：地图数据怎么变成场景，改数据就能改地图
4. `bots.js` → `character.js`：NPC 怎么思考、怎么动

## 想改点什么？

- **改枪的样子**：AK、M4、SG 是 glb 模型，加工脚本在 `assets-src/models/gun/*.py`（Blender）；默认手枪还在 `gunmodel.js`，每个零件一行，坐标单位是米；枪在画面里的位置、手握在哪在 `weapon.js` 末尾的 `Weapon.VIEW`
- **加一个可选的枪或 NPC 形象**：`config.js` 的 `loadout` 加一项（枪还要在 `Weapon.VIEW` 加一项并截图对手），首页自动出现
- **改手和手臂**：模型是 `assets/models/arm/arm.glb`，摆法和手指弯曲在 `gunmodel.js` 的 `buildArms`，握在枪上的位置在 `weapon.js` 的 `Weapon.VIEW`，尺寸在 `config.js` 的 `weapons.arms`
- **改武器手感和伤害**：`config.js` 的 `weapons`（枪）和 `grenades`（投掷物）
- **改换弹动作**：`weapon.js` 的 `Weapon.RELOAD`（每个动作在换弹进度里的时间段、音效时间点）
- **改赏金、价格、钱的上限**：`config.js` 的 `economy`
- **改界面**：流程和规则见 `docs/ui.md`；结构在 `index.html`，逻辑在 `ui.js`，样式在 `css/style.css`，模式介绍文字在 `ui.js` 末尾的 `MODES`
- **把需求交给 Claude 自动做**：GitHub issue 打 `交给Claude` 标签，进度看评论，评论 `commit push & deploy` 上线，见 `docs/autopilot.md`
- **查真机上的卡顿、动画和手感问题**：游戏里的开发者模式（设置 → 开发者）录下来上传，开发用 `tools/devlog/analyze.mjs` 分析，见 `docs/devmode.md`
- **改死亡效果**：`config.js` 的 `ragdoll`（爆头打飞的力度、尸体留多久）
- **改地图**：改 `maps/yard.json`，格式见 `docs/maps.md`；要加新种类的物体再改 `world.js` 的 `builders`
- **改对决规则**：`config.js` 的 `duel`（赢的杀数、重生时间、对手强度）
- **换 NPC 模型**：见 `assets/LICENSES.md`。走/跑动画的步幅在加载时自动测量，换了模型不用调参数
- **改卡车**：`truck.js`，每个零件一行；颜色在 `maps/yard.json` 的 truck 对象里改
- **显示判定盒**：`config.js` 里 `character.showHitboxes: true`
- **卡顿**：`config.js` 里把 `graphics.shadowMapSize` 改成 1024
