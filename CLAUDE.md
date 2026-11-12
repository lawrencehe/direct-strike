# Direct-Strike

纯浏览器的第一人称射击游戏：three.js r149，无构建步骤，无后端，脚本按 `index.html` 里的顺序直接加载。
玩法、目录和每个文件的职责见 `README.md`，所有可调参数在 `js/config.js`。

## 文档索引

开发文档在 `docs/`，总索引是 `docs/README.md`。动手前按任务查：

| 文档 | 内容 |
|---|---|
| `docs/status.md` | **项目现在的状态**：线上和 main 的版本、现在能玩什么，已知问题和待办的 Issue 链接。新会话先看这页 |
| GitHub Issues / PR | 需求、bug、待确认、想法，一件事一条（`gh issue list`），**完整的过程和历史都在这里**。规则见 `docs/workflow.md` 的"GitHub 上管什么" |
| `docs/workflow.md` | 分支、提交信息、版本号、验证、发布的完整流程 |
| `docs/architecture.md` | 加载顺序、对象关系、游戏循环、两套场景、**已知的坑** |
| `docs/decisions.md` | 项目方向和做过的决定（为什么是现在这样） |
| `docs/testing.md` | `/verify` 和写逐帧推进的测试脚本 |
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
- 做负责人指定的 issue 用 `/issue`，验证用 `/verify`，模型用 `/glb`，图片用 `/img`，骨骼动画用 `/rig`，AI 生成底模用 `/tripo`，地图用 `/map`，发布用 `/deploy`，提交推送部署一条龙用 `/ship`。
- 改完代码或资源要先跑 `/verify`，玩法逻辑的改动再写针对性测试（`docs/testing.md`）。
- 这台机器没有 GPU：截图和报错可信，帧率不可信。真机上的帧率、动画和手感问题，让负责人用游戏里的开发者模式录下来上传，
  再用 `node tools/devlog/analyze.mjs` 看报告、曲线和视频帧（`docs/devmode.md`）。

## 约定

- **分支：可以开分支开发，开发完建 PR 并入 `main`，从 `main` 部署。** 分支也推到远端，本地和远端都不删除，保留历史。详见 `docs/workflow.md`。
  用户说"deploy"（或"commit push & deploy""部署""上线"，都是一个意思：部署就意味着前面的提交、推送、合并都要走到）时用 `/ship`（`tools/ship.sh`）一次完成：提交 → 推送分支 → 建 PR（`Closes #N`）并在 GitHub 上合并 → 从 `main` 部署 → 线上检查 → tag 和 Release。
- **GitHub 管进展**：需求、bug、待确认、想法都开 Issue，一个版本一个 Milestone，合并走 PR。仓库是公开的，不往 GitHub 贴录下的数据、密码、玩家信息。
  **Claude 在 GitHub 上用机器账号 `primorigin`**（负责人是 `lawrencehe`），负责人说"给 primorigin 处理"和"给 Claude 处理"一样，配置见 `docs/tools.md`。
  **开 issue 只是记录**；负责人在会话里说"ISSUE51 / #51 / 做 51"才做那一条，用 `/issue` skill 走完接手 → 开发 → PR 待验收 → 上线，Claude 不自己挑 issue（`docs/workflow.md`）。
  流程标签（`Claude处理中`、`等你回复`、`待验收`）只改负责人指定的那条 issue 的，`已上线` 由 ship.sh 打。
- 中文：注释、文档、提交信息都用中文。提交信息格式 `vX.Y：一句话摘要`，正文列要点，每个上线的版本都打 tag（`ship.sh --tag`）。
- 发版时版本号改两处：`README.md` 标题和 `index.html` 的 `<small>vX.Y</small>`。
- `refer/` 是用户的创意草图，已 gitignore，不要删、不要提交；用户说"看图"就是指这里，动手前先看图。
- 项目方向：1v1 对战框架优先，创意玩法由用户自己加，不要擅自扩展玩法。
- **枪械、人物、地图一律用 Blender 建模导出 glb，不再用 JS 几何体或 Canvas 画贴图。** 建模脚本和母版放 `assets-src/`，先渲染预览图给用户确认再接进游戏。特效和 UI 除外。详见 `docs/decisions.md`。
  Tripo（AI 生成 3D）只出底模，必须进 Blender 修整；花积分前先报价、负责人同意再跑（`/tripo`，#72）。
- 新资源加地图时按地图拆分、按需加载，首次下载体积保持小。资源用 CC0 / MIT / CC BY 4.0，登记在 `assets/LICENSES.md`；CC BY 要写清署名（作者、链接、授权、改动），不用 NC / ND / SA。
- 可调数值放进 `js/config.js`，带中文注释。

## 文档和项目状态（每件事都要做）

分工：**GitHub 记过程，仓库记现状。**
- issue 记需求、讨论、负责人的决定；PR 记改动和验证；Release 记每个版本上线了什么。完整的历史都在那里。
- `README.md` 和本文件只写项目**现在**的样子和约定，不写"从哪个版本起""哪天定的"。
- `docs/` 按模块 / 主题写**现在**怎么工作、为什么这样做、有什么坑，写到哪件事就标上 `（#N）`，细节点过去看。
  **不一个 issue 建一份文档**，也不把 issue 抄进仓库。

1. **开工前**：读 `docs/status.md`，`gh issue list` 看相关的 issue。要查以前为什么这样做：
   先看主题文档里标的 `#N`，`gh issue view N --comments`、`gh pr view N`；没有线索就 `gh issue list --state all --search "关键词"`、`git log -S 关键词`。
   早期的需求文档已经存档在对应 issue 的评论里（"📦 存档"）。
2. **开工时**：没有 issue 先开一条（`需求` 标签，写负责人原话，挂这个版本的 Milestone）。需求不清楚先问，问清楚的结论回在 issue 里。
3. **做的过程中**：方案、做过的决定、负责人中途改的要求，简短写在 issue 评论里。
4. **做完时**（提交前）：把结果**融进主题文档**：现在怎么工作、为什么、坑和可调参数，标 `（#N）`。
   先想属于哪块已有的知识——界面和按键进 `ui.md`，代码结构和坑进 `architecture.md`，开发者模式进 `devmode.md`，
   素材和授权进 `art-sources.md` / `assets/LICENSES.md`，数值进 `config.js` 注释，方向性决定进 `decisions.md`；跟原文冲突就改原文，不在末尾追加"补充"。
   遗留的、要负责人真机确认的开成 issue（`待确认` / `bug` / `想法`，写"来源：#N"）。`docs/status.md` 改版本和"最近更新"日期。
   提交正文写清改了什么、怎么验证的，`ship.sh` 拿它当 PR 说明。
5. **上线**：`docs/status.md` 的线上版本提交前就写成上线后的样子；issue 由 PR 关闭并标 `已上线`，Release 由 `ship.sh --tag` 建。
6. **跟提交一起走**：文档改动和代码放在同一次提交里。`/ship` 之前检查上面几步都做了，没做先补；`-c` 传这次关闭的 issue 编号。

`status.md` 只写现状，过时的内容直接改掉。

## 项目知识放在仓库里

对项目的理解、决策、踩过的坑，写进 `CLAUDE.md` 或 `docs/`（并在 `docs/README.md` 登记），**不要写进 AI 助手的私有记忆**。
这样其他开发者和他们的 AI 助手拉下仓库就能接手。改了代码结构要同步 `README.md` 和 `docs/architecture.md`。

## 红线

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 要先问用户，改完只 `caddy reload`。
- 不要把 `/home/donkey/direct-strike` 整个目录挂进容器或直接作为站点根目录。
