# 项目状态

> 最近更新：2026-11-11　｜　**每次做需求都要更新本页**，规则见 `CLAUDE.md` 的"需求文档和项目状态"。
> 本页只写"现在怎样"，旧内容直接改掉或删掉；历史看 `requirements/`、GitHub 的 Releases 和 git log。

## 版本

| | 版本 | 说明 |
|---|---|---|
| 线上 https://game.lightup.host | v0.28 | 从 `main` 部署（2026-11-10） |
| `main` | v0.28 | 各版本的改动看 [Releases](https://github.com/lawrencehe/direct-strike/releases) |

## 进行中

交给 Claude 自动做的看标签 `交给Claude` / `Claude处理中` / `待验收` / `上线失败`，上线了的是 `已上线`（`autopilot.md`）。正在做的需求看 [开启的 Milestone](https://github.com/lawrencehe/direct-strike/milestones) 和 [开着的 PR](https://github.com/lawrencehe/direct-strike/pulls)。

## 现在能玩什么

- 模式：训练场、1v1 对决、波次。地图只有一张 `yard`。
- 装备：主武器 AK / M4，副武器 手枪 / SG 手枪，手雷 / 闪光 / 烟雾开局各一个；对手形象 乌克兰士兵 / 特种兵。换枪只换外观，数值相同。
- NPC 和玩家同一套装备和数值（NPC 没有经济，每条命满装备）。
- 打空自动换弹，换弹有完整动作；手雷拔环后攥着不计时，出手才计时（手雷 2 秒，飞行时间也算在内）；
  对决和波次有经济：击杀拿赏金，回出生点按 B 买投掷物。
- 细节见 `../README.md`。

## 已知问题和待办

从 v0.26 起记在 GitHub Issues，这里不再手写清单（规则见 `docs/workflow.md`）：

| 看什么 | 链接 |
|---|---|
| 已知问题（玩起来有毛病） | [label: bug](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3Abug) |
| 等负责人真机试玩、定数值、确认信息 | [label: 待确认](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E5%BE%85%E7%A1%AE%E8%AE%A4) |
| 要做的需求 | [label: 需求](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E9%9C%80%E6%B1%82) |
| 以后可能做、负责人还没定 | [label: 想法](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E6%83%B3%E6%B3%95) |

代码层面的"坑"仍写 `architecture.md`。
