# 文档索引

新加入的开发者按这个顺序读：先 `README.md` 了解游戏和目录，再看本页列出的文档。
AI 助手（Claude Code）的约定在根目录的 `CLAUDE.md`，它也指向这里。

## 先读

| 文档 | 内容 |
|---|---|
| [status.md](status.md) | **项目现在的状态**：版本、现在能玩什么，已知问题和待办的 GitHub Issue 链接 |
| [../README.md](../README.md) | 游戏玩法、操作、目录结构、每个文件的职责、"想改点什么去哪改" |
| [GitHub Issues](https://github.com/lawrencehe/direct-strike/issues?q=) / PR | 每件事的完整过程：需求、讨论、决定、改动、验证。文档里的 `#N` 指向这里 |
| [workflow.md](workflow.md) | 开发流程：分支、提交信息、版本号、验证、发布 |
| [architecture.md](architecture.md) | 代码怎么组织：加载顺序、游戏循环、两套场景、各系统之间的关系、已知的坑 |
| [decisions.md](decisions.md) | 项目方向和做过的决定，以及为什么 |

## 按需查

| 文档 | 什么时候看 |
|---|---|
| [tools.md](tools.md) | 装工具链；处理模型、图片、骨骼动画；这台开发机的限制 |
| [testing.md](testing.md) | 写无头浏览器测试脚本：逐帧推进游戏、模拟按键、断言和截图 |
| [devmode.md](devmode.md) | 开发者模式：负责人在真机上录帧数据和画面、上传；开发怎么分析（`tools/devlog/analyze.mjs`）；数据格式；开发接口 `server/api.py` |
| [ui.md](ui.md) | 界面流程（首页 → 简报 → 战斗 → 暂停 / 结算）、全屏规则、玩家设置、视觉规范、地图预览图 |
| [maps.md](maps.md) | 地图 JSON 格式、改地图、加新地图 |
| [deploy.md](deploy.md) | 线上架构、发布、回滚、首次接入 |
| [game-references.md](game-references.md) | 可参考的开源游戏：联网对战（Quake III）、手感和武器数值（AssaultCube、Xonotic）、1v1 地图（Xonotic、Red Eclipse） |
| [art-sources.md](art-sources.md) | 找枪械参考图、CC0 模型、PBR 材质的网站；用 Tripo 生成底模的流程；授权规则；挑好后交什么 |
| [../assets/LICENSES.md](../assets/LICENSES.md) | 第三方资源的来源和协议、怎么换 NPC 模型 |
| `../js/config.js` | 所有可调参数，每项都有中文注释 |
| `../.claude/skills/*/SKILL.md` | `/verify`、`/ship`、`/deploy`、`/glb`、`/img`、`/rig`、`/tripo`、`/map` 这些命令的详细步骤 |

## 维护规则

- 项目知识（约定、决策、踩过的坑）写进这个目录或 `CLAUDE.md`，随 git 走，不留在个人笔记或 AI 的私有记忆里。
- **文档只写现在的样子，按主题组织**；过程和历史在 GitHub 的 issue / PR 里，写到哪件事标 `（#N）`。不一个 issue 建一份文档，不把 issue 抄进仓库。
- 每件事做完，把结果融进对应的主题文档（改原文，不在末尾追加），做完更新 `status.md`。规则见 `CLAUDE.md` 的"文档和项目状态"和 `workflow.md` 的"GitHub 上管什么"。
- 新增文档要在本页登记；改了代码结构要同步 `README.md` 的目录表和 `architecture.md`。
- 文档用中文。
