# 靶场 v0.3

一个纯浏览器运行的第一人称射击游戏。不需要安装任何东西，也不需要联网。

## 三种模式

- **训练场**：站在高台上打靶，统计命中率和爆头
- **1v1 对决**：和一个 NPC 在集装箱堆场里单挑。谁被击杀谁在远处重生，先打到 10 杀的赢
- **波次**：一波一波的敌人会巡逻、发现你、横移、点射。清完一波回满血和子弹，下一波人更多更强

伤害：爆头 100（一枪死）、身体 34（三枪）、腿 25。你有 100 点生命。

## 怎么运行

**运行 `start.sh`（Windows 用 `start.bat`）**，它会启动一个本地服务并自动打开浏览器。
手动的话：在本目录打开终端，运行 `python -m http.server 8000`，然后访问 `http://localhost:8000`。

> 为什么不能直接双击 `index.html`？浏览器禁止 `file://` 页面加载 `.glb` 模型文件。
> 直接双击也能玩，但 NPC 会退化成方块小人。

## 操作

| 按键 | 作用 |
|---|---|
| 鼠标 | 转动视角 |
| W A S D | 移动 |
| Shift | 奔跑 |
| 空格 | 跳跃（0.45 米以下的台阶直接走上去，不用跳） |
| 左键 | 射击（按住连发） |
| R | 换弹 |
| T | 重置统计（训练场） |
| Esc | 暂停 |

## 地图

一座废弃的集装箱堆场，36 × 48 米。南北两头是出生点，中间一座带台阶的高台，
两侧各有一排集装箱和一条侧道。所有掩体、出生点、NPC 巡逻点、靶子位置都在 `js/world.js` 里，
贴图全部由 `js/textures.js` 用 Canvas 画出来。

## 目录结构

```
fps/
├── index.html        页面骨架：画布、HUD、开始界面，按顺序加载脚本
├── start.sh / .bat   一键启动本地服务
├── css/style.css     HUD 和界面样式
├── assets/
│   ├── models/soldier.glb   NPC 模型（Mixamo 骨骼，带待机/走/跑动画）
│   └── LICENSES.md          第三方资源的来源和协议，以及怎么换模型
├── vendor/
│   ├── three.min.js         Three.js r149（3D 渲染库，MIT 协议）
│   ├── GLTFLoader.js        加载 .glb 模型
│   └── SkeletonUtils.js     复制带骨骼的模型（多个 NPC 共用一份模型数据）
└── js/
    ├── config.js     ★ 所有可调参数（手感、武器、NPC 难度、对决规则、画质……）
    ├── main.js       入口：创建对象、模式切换、游戏循环
    ├── input.js      键盘鼠标输入、指针锁定
    ├── physics.js    ★ 方块碰撞 + 自动上台阶（玩家和 NPC 共用）
    ├── player.js     ★ 视角、移动、跳跃、生命值、重生
    ├── weapon.js     ★ 射线射击、散布、后坐力、伤害、换弹、弹孔、枪模
    ├── character.js  ★ NPC 外观：加载模型、动画混合、持枪姿势（简易 IK）、判定盒
    ├── bots.js       ★ NPC 脑子：状态机 AI、视野感知、点射、绕障碍；对决 / 波次管理
    ├── world.js      ★ 地图：场地布局、掩体、远景、天空、光照、出生点和巡逻点
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
3. `world.js`：地图是怎么一块块摆出来的，改这里就能改地图
4. `bots.js` → `character.js`：NPC 怎么思考、怎么动

## 想改点什么？

- **改地图**：`world.js` 里 `addBox / addContainer / addBlocker` 摆东西，`spawns / navPoints` 改出生点和巡逻点
- **改对决规则**：`config.js` 的 `duel`（赢的杀数、重生时间、对手强度）
- **换 NPC 模型**：见 `assets/LICENSES.md`
- **显示判定盒**：`config.js` 里 `character.showHitboxes: true`
- **卡顿**：`config.js` 里把 `graphics.shadowMapSize` 改成 1024
