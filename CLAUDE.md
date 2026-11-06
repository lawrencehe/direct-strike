# Direct-Strike

纯浏览器的第一人称射击游戏：three.js r149，无构建步骤，无后端，脚本按 `index.html` 里的顺序直接加载。
玩法、目录和每个文件的职责见 `README.md`，所有可调参数在 `js/config.js`。

## 文档索引

开发文档在 `docs/`，总索引是 `docs/README.md`。动手前按任务查：

| 文档 | 内容 |
|---|---|
| `docs/workflow.md` | 分支、提交信息、版本号、验证、发布的完整流程 |
| `docs/architecture.md` | 加载顺序、对象关系、游戏循环、两套场景、**已知的坑** |
| `docs/decisions.md` | 项目方向和做过的决定（为什么是现在这样） |
| `docs/testing.md` | `/verify` 和写逐帧推进的测试脚本 |
| `docs/tools.md` | 工具链安装和用法、开发机限制 |
| `docs/maps.md` | 地图格式 |
| `docs/deploy.md` | 线上架构、发布、回滚 |
| `docs/art-sources.md` | 美术参考图、CC0 模型和材质的来源，授权规则 |

## 运行

- 本地：`./start.sh`（python http.server，自动开浏览器）。不能用 `file://`，.glb 模型加载不了。
- 线上：https://game.lightup.host，发布用 `./deploy.sh`，细节见 `docs/deploy.md` 和 `/deploy` skill。

## 开发工具

- 工具链在 `tools/`，安装用 `tools/setup.sh`。
- 验证用 `/verify`，模型用 `/glb`，图片用 `/img`，骨骼动画用 `/rig`，地图用 `/map`，发布用 `/deploy`，提交推送部署一条龙用 `/ship`。
- 改完代码或资源要先跑 `/verify`，玩法逻辑的改动再写针对性测试（`docs/testing.md`）。
- 这台机器没有 GPU：截图和报错可信，帧率不可信。

## 约定

- **分支：可以开分支开发，开发完一律并入 `main`，推送后从 `main` 部署。** 分支也推到远端，本地和远端都不删除，保留历史。详见 `docs/workflow.md`。
  用户说"commit push & deploy"时用 `/ship`（`tools/ship.sh`）一次完成：提交 → 并入 `main` → 推送 `main` 和分支 → 从 `main` 部署 → 线上检查。
- 中文：注释、文档、提交信息都用中文。提交信息格式 `vX.Y：一句话摘要`，正文列要点，大版本打 tag。
- 发版时版本号改两处：`README.md` 标题和 `index.html` 的 `<small>vX.Y</small>`。
- `refer/` 是用户的创意草图，已 gitignore，不要删、不要提交；用户说"看图"就是指这里，动手前先看图。
- 项目方向：1v1 对战框架优先，创意玩法由用户自己加，不要擅自扩展玩法。
- **枪械、人物、地图一律用 Blender 建模导出 glb，不再用 JS 几何体或 Canvas 画贴图。** 建模脚本和母版放 `assets-src/`，先渲染预览图给用户确认再接进游戏。特效和 UI 除外。详见 `docs/decisions.md`。
- 新资源加地图时按地图拆分、按需加载，首次下载体积保持小。资源只用 CC0 / MIT，登记在 `assets/LICENSES.md`。
- 可调数值放进 `js/config.js`，带中文注释。

## 项目知识放在仓库里

对项目的理解、决策、踩过的坑，写进 `CLAUDE.md` 或 `docs/`（并在 `docs/README.md` 登记），**不要写进 AI 助手的私有记忆**。
这样其他开发者和他们的 AI 助手拉下仓库就能接手。改了代码结构要同步 `README.md` 和 `docs/architecture.md`。

## 红线

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 要先问用户，改完只 `caddy reload`。
- 不要把 `/home/donkey/direct-strike` 整个目录挂进容器或直接作为站点根目录。
