# 项目状态

> 最近更新：2026-11-13　｜　**每次做完一件事都要更新本页**，规则见 `CLAUDE.md` 的"文档和项目状态"。
> 本页只写"现在怎样"，旧内容直接改掉或删掉；历史看 GitHub 的 issue、PR、Releases 和 git log。

## 版本

| | 版本 | 说明 |
|---|---|---|
| 线上 https://game.lightup.host | v0.45 | 从 `main` 部署（2026-11-13） |
| `main` | v0.45 | 各版本的改动看 [Releases](https://github.com/lawrencehe/direct-strike/releases) |

## 进行中

Claude 在做的 issue 看标签 `Claude处理中` / `等你回复` / `待验收`，上线了的是 `已上线`（`workflow.md`）。正在做的需求看 [开启的 Milestone](https://github.com/lawrencehe/direct-strike/milestones) 和 [开着的 PR](https://github.com/lawrencehe/direct-strike/pulls)。

## 现在能玩什么

- 打开网页只下网页本身（首页背景是静态截图），点"进入战斗"才下这一局的资源，加载页显示进度和总大小；
  下过的资源存在浏览器里，刷新不再下载，线上改了哪个文件只重下哪个（#85）。
- 模式：训练场、1v1 对决、波次。地图只有一张 `yard`：地面和水泥是真实材质（破旧、有污渍），集装箱、隔离墩是 Blender 建的模型（生锈、破旧），中央是 Tripo 生成的战术平台（伪装网棚、沙袋、弹药箱，楼梯朝东）；沙袋墙、油桶、西北角的弹药箱堆也是 Tripo 模型（#98），轮胎、木托盘、货车还是程序画的，正在换模型（#50）。
- 天气 / 时段：首页选晴天或阴雨傍晚（厚云、冷蓝灰、湿地面和水洼），切换立刻生效（#77）。探照灯、辉光、远景楼的亮窗还没做。
- 进入战斗前只选模式、天气和杀数，不选装备（#90）。出生只有手枪（枪里一个弹匣，没有备弹）和一枚手雷，主武器 AK / M4 在出生点买，死了掉；换枪只换外观，数值相同。
- NPC 每次出生随机形象（乌克兰士兵 / 特种兵）、随机一把主武器和一把手枪，一定带主武器；NPC 没有经济买不了东西，两把枪打空了就跑开。
  没看见你时边走边张望，搜索先去推算的位置、再查附近看不到的角落。
- 中弹有反应：玩家和 NPC 短暂硬直；玩家镜头被打偏、四角溅血、血条掉的那一截留一会儿再缩；NPC 上半身往后缩。
- 枪声、换弹、手雷 / 闪光爆炸是真枪实录的音效（远处的更闷更轻），提示音是合成的。
- 打空自动换弹，换弹有完整动作；手雷拔环后攥着不计时，出手才计时（手雷 2 秒，飞行时间也算在内）；
  对决和波次有经济：开局 / 重生至少 $2000（一定买得起 $1500 的主武器），击杀拿赏金（爆头 $500、其他 $300），回出生点（左侧出购物车图标）买枪、子弹和投掷物：
  F 快捷菜单在屏幕左侧、纯键盘，开着照样瞄准开枪，1 ~ 3 买一套（全套 / 经济 / 上次，主武器有就不换、没有买上次那把），买完或中弹就关（#90）；
  B 经典菜单在屏幕中间、有光标，逐件买（主武器 / 手枪 / 弹药 / 投掷物）。训练场买枪免费。买成功 / 买不了都有音效和动画回应。
- 细节见 `../README.md`。

## 已知问题和待办

记在 GitHub Issues，这里不手写清单（规则见 `docs/workflow.md`）：

| 看什么 | 链接 |
|---|---|
| 已知问题（玩起来有毛病） | [label: bug](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3Abug) |
| 等负责人真机试玩、定数值、确认信息 | [label: 待确认](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E5%BE%85%E7%A1%AE%E8%AE%A4) |
| 要做的需求 | [label: 需求](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E9%9C%80%E6%B1%82) |
| 以后可能做、负责人还没定 | [label: 想法](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E6%83%B3%E6%B3%95) |

代码层面的"坑"仍写 `architecture.md`。
