# Direct-Strike v0.9

![Direct-Strike](assets/brand/logo.png)

一个纯浏览器运行的第一人称射击游戏。不需要安装任何东西，也不需要联网。

**在线试玩：https://game.lightup.host**

## 三种模式

- **训练场**：站在高台上打靶，统计命中率和爆头
- **1v1 对决**：和一个 NPC 在集装箱堆场里单挑。谁被击杀谁在远处重生，先打到 10 杀的赢
- **波次**：一波一波的敌人会巡逻、发现你、横移、点射。清完一波回满血和子弹，下一波人更多更强

伤害：爆头 100（一枪死）、身体 34（三枪）、腿 25。你有 100 点生命。

## 怎么运行

**运行 `start.sh`（Windows 用 `start.bat`）**，它会启动一个本地服务并自动打开浏览器。
不能直接双击打开 `index.html`，浏览器不允许这样读取地图和模型文件。
手动的话：在本目录打开终端，运行 `python -m http.server 8000`，然后访问 `http://localhost:8000`。

> 为什么不能直接双击 `index.html`？浏览器禁止 `file://` 页面加载 `.glb` 模型文件。
> 直接双击也能玩，但 NPC 会退化成方块小人。

发布到线上：`./deploy.sh`，说明见 `docs/deploy.md`。

## 操作

默认按键如下。**开始界面里点击按键名就能改键**，改过的按键存在浏览器里，下次打开还在；"恢复默认"一键还原。

| 按键 | 作用 |
|---|---|
| 鼠标 | 转动视角 |
| W A S D | 移动 |
| Shift（按住） | 下蹲：变矮、变慢、更准，能躲到沙袋后面；头顶有东西时站不起来 |
| CapsLock（按住） | 奔跑（浏览器里 Ctrl+W 会关标签页、Alt 会弹菜单，所以默认不用它们，想用可以自己改） |
| 空格 | 跳跃（0.45 米以下的台阶直接走上去，不用跳） |
| 左键 | 射击（按住连发） |
| R | 换弹 |
| T | 重置统计（训练场） |
| Esc | 暂停 |

默认按键在 `js/config.js` 的 `keys` 里，鼠标侧键也可以绑（Mouse3 / Mouse4）。

## 地图

一座废弃的集装箱堆场，36 × 48 米。南北两头是出生点，中间一座带台阶的高台，
两侧各有一排集装箱和一条侧道。所有掩体、出生点、NPC 巡逻点、靶子位置都在 `maps/yard.json` 里，
格式说明见 `docs/maps.md`，贴图全部由 `js/textures.js` 用 Canvas 画出来。

## 目录结构

```
fps/
├── index.html        页面骨架：画布、HUD、开始界面，按顺序加载脚本
├── start.sh / .bat   一键启动本地服务
├── deploy.sh         一键发布到 game.lightup.host
├── deploy/           站点容器的 compose 和 Caddyfile
├── docs/deploy.md    部署架构、首次接入、回滚
├── docs/tools.md     本地工具链的安装和用法
├── docs/maps.md      地图文件格式、怎么改地图、怎么加新地图
├── maps/yard.json    ★ 地图数据：掩体、出生点、巡逻点、靶子
├── tools/            开发工具（验证、模型、图片、骨骼、地图），不发布
├── assets-src/       未压缩的模型母版，不发布
├── CLAUDE.md         给 AI 助手看的项目约定
├── css/style.css     HUD 和界面样式
├── assets/
│   ├── brand/               logo、网站图标、分享预览图
│   ├── models/soldier.glb   NPC 模型（Mixamo 骨骼，带待机/走/跑动画）
│   └── LICENSES.md          第三方资源的来源和协议，以及怎么换模型
├── vendor/
│   ├── three.min.js         Three.js r149（3D 渲染库，MIT 协议）
│   ├── GLTFLoader.js        加载 .glb 模型
│   ├── meshopt_decoder.js   解压 meshopt 压缩的模型（MIT 协议）
│   └── SkeletonUtils.js     复制带骨骼的模型（多个 NPC 共用一份模型数据）
└── js/
    ├── config.js     ★ 所有可调参数（手感、武器、NPC 难度、对决规则、画质……）
    ├── main.js       入口：创建对象、模式切换、游戏循环
    ├── input.js      键盘鼠标输入、指针锁定、按键绑定（改键 + 保存）
    ├── physics.js    ★ 方块碰撞 + 自动上台阶（玩家和 NPC 共用）
    ├── player.js     ★ 视角、移动、跳跃、生命值、重生
    ├── weapon.js     ★ 射线射击、散布、后坐力、伤害、换弹、弹孔、枪模动画
    ├── gunmodel.js   枪模：用基础几何体拼的 AK，木纹和钢件贴图都是 Canvas 画的
    ├── truck.js      地图里那辆平头货车：驾驶室、货斗、轮子、货物，全是基础几何体 + Canvas 贴图
    ├── character.js  ★ NPC 外观：加载模型、按位移驱动走/跑动画（不滑步）、腿和上半身分开转、持枪姿势（简易 IK）、判定盒
    ├── bots.js       ★ NPC 脑子：状态机 AI、视野感知、点射、绕障碍；对决 / 波次管理
    ├── world.js      ★ 场景构建器：把地图数据变成 3D 场景；各种物体的造型、天空、光照
    ├── textures.js   程序生成的贴图（沥青、水泥、集装箱、沙袋、铁丝网、天空……）
    ├── targets.js    靶子（状态机：立着 → 倒下 → 立起）
    ├── effects.js    曳光、枪口火光、血雾
    ├── hud.js        准星、命中标记、弹药、生命、受击方向、比分、菜单
    └── audio.js      用 Web Audio 实时合成的音效
```

带 ★ 的文件是 FPS 的核心，建议优先阅读。

## 建议的阅读顺序

1. `config.js`：先看看有哪些参数
2. `main.js`：理解游戏循环"输入 → 更新 → 渲染"和三种模式怎么切换
3. `maps/yard.json` → `world.js`：地图数据怎么变成场景，改数据就能改地图
4. `bots.js` → `character.js`：NPC 怎么思考、怎么动

## 想改点什么？

- **改枪的样子**：`gunmodel.js`，每个零件一行，坐标单位是米；枪在画面里的位置在 `weapon.js` 的 `basePos / baseRot`
- **改地图**：改 `maps/yard.json`，格式见 `docs/maps.md`；要加新种类的物体再改 `world.js` 的 `builders`
- **改对决规则**：`config.js` 的 `duel`（赢的杀数、重生时间、对手强度）
- **换 NPC 模型**：见 `assets/LICENSES.md`。走/跑动画的步幅在加载时自动测量，换了模型不用调参数
- **改卡车**：`truck.js`，每个零件一行；颜色在 `maps/yard.json` 的 truck 对象里改
- **显示判定盒**：`config.js` 里 `character.showHitboxes: true`
- **卡顿**：`config.js` 里把 `graphics.shadowMapSize` 改成 1024
