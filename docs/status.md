# 项目状态

> 最近更新：2026-11-12　｜　**每次做完一件事都要更新本页**，规则见 `CLAUDE.md` 的"文档和项目状态"。
> 本页只写"现在怎样"，旧内容直接改掉或删掉；历史看 GitHub 的 issue、PR、Releases 和 git log。

## 版本

| | 版本 | 说明 |
|---|---|---|
| 线上 https://game.lightup.host | v0.40 | 从 `main` 部署（2026-11-12） |
| `main` | v0.40 | 各版本的改动看 [Releases](https://github.com/lawrencehe/direct-strike/releases) |

## 进行中

Claude 在做的 issue 看标签 `Claude处理中` / `等你回复` / `待验收`，上线了的是 `已上线`（`workflow.md`）。正在做的需求看 [开启的 Milestone](https://github.com/lawrencehe/direct-strike/milestones) 和 [开着的 PR](https://github.com/lawrencehe/direct-strike/pulls)。

## 现在能玩什么

- 模式：训练场、1v1 对决、波次。地图只有一张 `yard`：地面和水泥是真实材质（破旧、有污渍），集装箱、隔离墩、沙袋墙是 Blender 建的模型（生锈、破旧），中央是 Tripo 生成的战术平台（伪装网棚、沙袋、弹药箱，楼梯朝东），油桶、轮胎等其他道具还是程序画的，正在换模型（#50）。
- 天气 / 时段：首页选晴天或阴雨傍晚（厚云、冷蓝灰、湿地面和水洼），切换立刻生效（#77）。探照灯、辉光、远景楼的亮窗还没做。
- 装备：主武器 AK / M4，副武器 手枪 / SG 手枪，开局枪里各一个弹匣（没有备弹，子弹要买）和一枚手雷，闪光 / 烟雾要买；对手形象 乌克兰士兵 / 特种兵。换枪只换外观，数值相同。
- NPC 和玩家同一套装备和数值，每次出生随机拿一把主武器、一把副武器；NPC 没有经济买不了东西，两把枪打空了就跑开。
  没看见你时边走边张望，搜索先去推算的位置、再查附近看不到的角落。
- 中弹有反应：玩家和 NPC 短暂硬直；玩家镜头被打偏、四角溅血、血条掉的那一截留一会儿再缩；NPC 上半身往后缩。
- 枪声、换弹、手雷 / 闪光爆炸是真枪实录的音效（远处的更闷更轻），提示音是合成的。
- 打空自动换弹，换弹有完整动作；手雷拔环后攥着不计时，出手才计时（手雷 2 秒，飞行时间也算在内）；
  对决和波次有经济：开局 / 重生至少 $600，击杀拿赏金（爆头 $500、其他 $300），回出生点（左侧出购物车图标）按 B 买子弹和投掷物，买完面板自动关；买成功 / 买不了都有音效和动画回应（不用文字）。
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
