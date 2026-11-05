# Direct-Strike

纯浏览器的第一人称射击游戏：three.js r149，无构建步骤，无后端，脚本按 `index.html` 里的顺序直接加载。
代码结构和各文件职责见 `README.md`，所有可调参数在 `js/config.js`。

## 运行

- 本地：`./start.sh`（python http.server，自动开浏览器）。不能用 `file://`，.glb 模型加载不了。
- 线上：https://game.lightup.host，发布用 `./deploy.sh`，细节见 `docs/deploy.md` 和 `/deploy` skill。

## 约定

- 中文：注释、文档、提交信息都用中文。提交信息格式 `vX.Y：一句话摘要`，正文列要点，大版本打 tag。
- `refer/` 是用户的创意草图，已 gitignore，不要删、不要提交；用户说"看图"就是指这里。
- 项目方向：1v1 对战框架优先，创意玩法由用户自己加，不要擅自扩展玩法。
- 新资源加地图时按地图拆分、按需加载，首次下载体积保持小。

## 红线

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 要先问用户，改完只 `caddy reload`。
- 不要把 `/home/donkey/fps` 整个目录挂进容器或直接作为站点根目录。
