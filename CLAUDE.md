# Direct-Strike

纯浏览器的第一人称射击游戏：three.js r149，无构建步骤，无后端，脚本按 `index.html` 里的顺序直接加载。
玩法、目录和每个文件的职责见 `README.md`，所有可调参数在 `js/config.js`。

## 文档索引

开发文档在 `docs/`，总索引是 `docs/README.md`。动手前按任务查：

| 文档 | 内容 |
|---|---|
| `docs/status.md` | **项目现在的状态**：线上和 main 的版本、现在能玩什么，已知问题和待办的 Issue 链接。新会话先看这页 |
| GitHub Issues | 需求、bug、待确认、想法，一件事一条（`gh issue list`）。规则见 `docs/workflow.md` 的"GitHub 上管什么" |
| `docs/requirements/` | 每个需求一份文档：需求、范围、方案和决定、改动、验证、遗留 |
| `docs/workflow.md` | 分支、提交信息、版本号、验证、发布的完整流程 |
| `docs/architecture.md` | 加载顺序、对象关系、游戏循环、两套场景、**已知的坑** |
| `docs/decisions.md` | 项目方向和做过的决定（为什么是现在这样） |
| `docs/testing.md` | `/verify` 和写逐帧推进的测试脚本 |
| `docs/autopilot.md` | 自动任务：issue 打 `交给Claude` 标签由开发机定时交给 Claude 做，一次一个，打 `授权部署`（或评论 `commit push & deploy`）上线 |
| `docs/devmode.md` | 开发者模式：真机录帧数据和画面、上传、分析 |
| `docs/tools.md` | 工具链安装和用法、开发机限制 |
| `docs/ui.md` | 界面流程、全屏规则、玩家设置、视觉规范 |
| `docs/maps.md` | 地图格式 |
| `docs/deploy.md` | 线上架构、发布、回滚 |
| `docs/game-references.md` | 可参考的开源游戏：联网、手感数值、1v1 地图（只参考设计，不抄代码和素材） |
| `docs/art-sources.md` | 美术参考图、CC0 模型和材质的来源，授权规则 |

## 运行

- 本地：`./start.sh`（python http.server，自动开浏览器）。不能用 `file://`，.glb 模型加载不了。
- 线上：https://game.lightup.host，发布用 `./deploy.sh`，细节见 `docs/deploy.md` 和 `/deploy` skill。

## 开发工具

- 工具链在 `tools/`，安装用 `tools/setup.sh`。
- 验证用 `/verify`，模型用 `/glb`，图片用 `/img`，骨骼动画用 `/rig`，地图用 `/map`，发布用 `/deploy`，提交推送部署一条龙用 `/ship`。
- 改完代码或资源要先跑 `/verify`，玩法逻辑的改动再写针对性测试（`docs/testing.md`）。
- 这台机器没有 GPU：截图和报错可信，帧率不可信。真机上的帧率、动画和手感问题，让负责人用游戏里的开发者模式录下来上传，
  再用 `node tools/devlog/analyze.mjs` 看报告、曲线和视频帧（`docs/devmode.md`）。

## 约定

- **分支：可以开分支开发，开发完建 PR 并入 `main`，从 `main` 部署。** 分支也推到远端，本地和远端都不删除，保留历史。详见 `docs/workflow.md`。
  用户说"commit push & deploy"时用 `/ship`（`tools/ship.sh`）一次完成：提交 → 推送分支 → 建 PR（`Closes #N`）并在 GitHub 上合并 → 从 `main` 部署 → 线上检查 → tag 和 Release。
- **GitHub 管进展**：需求、bug、待确认、想法都开 Issue，一个版本一个 Milestone，合并走 PR。仓库是公开的，不往 GitHub 贴录下的数据、密码、玩家信息。
  **Claude 在 GitHub 上用机器账号 `primorigin`**（负责人是 `lawrencehe`），负责人说"给 primorigin 处理"和"给 Claude 处理"一样，配置见 `docs/tools.md`。
  **开 issue 只是记录**；打了 `交给Claude` 才由自动任务处理（`docs/autopilot.md`）。手动会话不要去动别的 issue 的这几个标签：`交给Claude`、`Claude处理中`、`等你回复`、`待验收`、`授权部署`、`上线失败`（`已上线` 由 ship.sh 打）。
- 中文：注释、文档、提交信息都用中文。提交信息格式 `vX.Y：一句话摘要`，正文列要点，每个上线的版本都打 tag（`ship.sh --tag`）。
- 发版时版本号改两处：`README.md` 标题和 `index.html` 的 `<small>vX.Y</small>`。
- `refer/` 是用户的创意草图，已 gitignore，不要删、不要提交；用户说"看图"就是指这里，动手前先看图。
- 项目方向：1v1 对战框架优先，创意玩法由用户自己加，不要擅自扩展玩法。
- **枪械、人物、地图一律用 Blender 建模导出 glb，不再用 JS 几何体或 Canvas 画贴图。** 建模脚本和母版放 `assets-src/`，先渲染预览图给用户确认再接进游戏。特效和 UI 除外。详见 `docs/decisions.md`。
- 新资源加地图时按地图拆分、按需加载，首次下载体积保持小。资源用 CC0 / MIT / CC BY 4.0，登记在 `assets/LICENSES.md`；CC BY 要写清署名（作者、链接、授权、改动），不用 NC / ND / SA。
- 可调数值放进 `js/config.js`，带中文注释。

## 需求文档和项目状态（每个需求都要做）

目标：任何人（或新的 AI 会话）看 `docs/status.md` 和 GitHub 上开着的 issue 就知道项目现在怎样，看 `docs/requirements/` 就知道每个需求为什么这样做。

1. **开工前**：先读 `docs/status.md`，`gh issue list` 看有没有相关的 issue（需求、bug、待确认）。
2. **开工时**：没有 issue 先开一条（`需求` 标签，写负责人原话，挂这个版本的 Milestone）。
   照 `docs/requirements/_template.md` 新建 `docs/requirements/vX.Y-主题.md`（和分支同名），
   写"需求"（负责人的原话或要点）和"范围"（做 / 不做），链接 issue，登记到 `docs/requirements/README.md`。
   需求不清楚先问，问清楚的结论写进文档和 issue。
3. **做的过程中**：方案、做过的决定、负责人中途改的要求，随手写进需求文档，不要等最后凭记忆补。
   影响项目方向的决定再在 `docs/decisions.md` 写一两行。
4. **做完时**（提交前）：需求文档补"改动""验证""遗留"，状态改"已完成"；"遗留"里的每一条、要负责人真机确认的，
   都开成 issue（`待确认` / `bug` / `想法`，写"来源：#N"）；同步 `docs/status.md` 的版本，更新顶部的"最近更新"日期。
5. **上线后**：需求文档状态改"已上线（vX.Y，日期）"，`docs/status.md` 的线上版本改掉。需求 issue 由 PR 关闭，Release 由 `ship.sh --tag` 建。
6. **跟提交一起走**：文档改动和代码放在同一次提交里。`/ship` 之前检查上面几步都做了，没做先补；`-c` 传这次关闭的 issue 编号。

零碎改动（错别字、只改文档、一行修复）不用建需求文档，但仍要看 `docs/status.md` 和相关 issue 是否受影响。
`status.md` 只写现状，过时的内容直接改掉；历史留在需求文档、Release 和 git log 里。

## 项目知识放在仓库里

对项目的理解、决策、踩过的坑，写进 `CLAUDE.md` 或 `docs/`（并在 `docs/README.md` 登记），**不要写进 AI 助手的私有记忆**。
这样其他开发者和他们的 AI 助手拉下仓库就能接手。改了代码结构要同步 `README.md` 和 `docs/architecture.md`。

## 红线

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 要先问用户，改完只 `caddy reload`。
- 不要把 `/home/donkey/direct-strike` 整个目录挂进容器或直接作为站点根目录。
