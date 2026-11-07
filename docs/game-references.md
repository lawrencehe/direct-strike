# 可参考的开源游戏

做联网、手感、地图时可以参考的开源游戏。来源是开源游戏清单
[bobeff/open-source-games](https://github.com/bobeff/open-source-games)（2026-11-07 筛过一遍）。

## 使用规则（先看）

- **只参考设计思路和数值，不复制代码和素材。** 这些游戏的代码多是 GPL，素材多是 GPL、CC BY-SA 或禁止商用，
  都不符合本项目"只用 CC0 / MIT / CC BY 4.0"的规定（见 `decisions.md`）。
- **不复刻具体某款游戏**：不照搬它们的地图、角色、武器造型和名字，做的是自己的原创设计。
- 清单里其余游戏大多是 C/C++ 原生游戏或老游戏的源码移植，没有 three.js 或浏览器 FPS，暂时没有其他参考价值。

## 1. 联网对战：Quake III Arena

- 源码：<https://github.com/id-Software/Quake-III-Arena>（GPL v2）
- **用途**：以后加多人联网对战时，参考它的服务器设计。
- 值得看的点：
  - 服务器权威：命中、伤害、位置以服务器为准，客户端只发输入，防作弊。
  - 快照同步：服务器定时把世界状态发给客户端，只发和上一帧的差量。
  - 客户端预测：本地先按输入移动，收到服务器结果后再校正，操作不会有延迟感。
  - 插值：其他玩家按收到的快照平滑插值显示。
  - 延迟补偿：判定命中时把目标倒回开枪那一刻的位置（Quake III 原版没有，后来的 mod 和其他游戏常加，按需研究）。
- 代码入口：服务器在 `code/server/`，客户端在 `code/client/`，共享的移动逻辑在 `code/game/bg_pmove.c`
  （客户端预测和服务器用同一份移动代码，这是预测能对得上的关键）。
- 落到本项目时，要考虑浏览器能用的传输方式（WebSocket 或 WebRTC DataChannel）和部署方式（见 `deploy.md`），到时候单独定方案，记进 `decisions.md`。

## 2. 移动手感和武器数值：AssaultCube、Xonotic

- AssaultCube：<https://assault.cubers.net>，源码 <https://github.com/assaultcube/AC>。写实风格，和本项目最接近。
- Xonotic：<https://xonotic.org>，源码 <https://gitlab.com/xonotic/xonotic>。竞技场风格，移动更快。
- **用途**：调 `js/config.js` 里的移动和武器参数时做对照。
- 值得对照的数值：
  - 移动：走、跑、蹲的速度，加速度和摩擦，跳跃高度，空中操控。
  - 武器：伤害、射速、弹匣、换弹时间、散布、后坐力，以及由这些算出来的 TTK（击杀所需时间）。
  - 伤害随距离衰减：本项目目前没有，可以参考它们怎么做。
- 看它们的配置文件和数值表就够了，不用读引擎代码。

## 3. 1v1 竞技场地图：Xonotic、Red Eclipse

- Red Eclipse：<https://www.redeclipse.net>，源码 <https://github.com/redeclipse/base>。
- **用途**：目前的地图还不够丰富，做新地图或改布局时参考（流程见 `maps.md` 和 `/map`）。
- 值得参考的点：
  - 尺寸：1v1 地图多大合适，从一头跑到另一头要几秒。
  - 掩体密度：掩体的间距和高度，开阔区和狭窄通道的比例，有没有高低差。
  - 出生点布局：出生点之间的距离、视线是否互相遮挡，重生后会不会马上被看见。
  - 路线：几条主路线、是否成环，有没有可以绕后的路。
- 参考时记下数字（尺寸、距离、秒数），按我们自己的主题（工业集装箱堆场）重新设计，不照搬布局。
