# 文档索引

新加入的开发者按这个顺序读：先 `README.md` 了解游戏和目录，再看本页列出的文档。
AI 助手（Claude Code）的约定在根目录的 `CLAUDE.md`，它也指向这里。

## 先读

| 文档 | 内容 |
|---|---|
| [../README.md](../README.md) | 游戏玩法、操作、目录结构、每个文件的职责、"想改点什么去哪改" |
| [workflow.md](workflow.md) | 开发流程：分支、提交信息、版本号、验证、发布 |
| [architecture.md](architecture.md) | 代码怎么组织：加载顺序、游戏循环、两套场景、各系统之间的关系、已知的坑 |
| [decisions.md](decisions.md) | 项目方向和做过的决定，以及为什么 |

## 按需查

| 文档 | 什么时候看 |
|---|---|
| [tools.md](tools.md) | 装工具链；处理模型、图片、骨骼动画；这台开发机的限制 |
| [testing.md](testing.md) | 写无头浏览器测试脚本：逐帧推进游戏、模拟按键、断言和截图 |
| [maps.md](maps.md) | 地图 JSON 格式、改地图、加新地图 |
| [deploy.md](deploy.md) | 线上架构、发布、回滚、首次接入 |
| [../assets/LICENSES.md](../assets/LICENSES.md) | 第三方资源的来源和协议、怎么换 NPC 模型 |
| `../js/config.js` | 所有可调参数，每项都有中文注释 |
| `../.claude/skills/*/SKILL.md` | `/verify`、`/deploy`、`/glb`、`/img`、`/rig`、`/map` 这些命令的详细步骤 |

## 维护规则

- 项目知识（约定、决策、踩过的坑）写进这个目录或 `CLAUDE.md`，随 git 走，不留在个人笔记或 AI 的私有记忆里。
- 新增文档要在本页登记；改了代码结构要同步 `README.md` 的目录表和 `architecture.md`。
- 文档用中文。
