# 开发流程

## 分支

**可以开分支开发，但开发完一律并入 `main`，再推送和部署。** 线上永远从 `main` 发布。

1. 开分支（可选），名字带版本号和主题，例如 `v0.11-hands-cook`。小改动也可以直接在 `main` 上做。
2. 在分支上提交，分支本身也推送到远端：`git push origin <分支>`。
3. 开发完合并进 `main`（`git checkout main && git merge <分支>`），推送 `git push origin main`。
4. 从 `main` 跑 `./deploy.sh` 部署。**不要从分支部署**，否则线上会比 `main` 新，下次从 `main` 部署就回退了。

**分支不删除**，本地和远端都保留，留着完整的开发历史。

以后多人协作时再调整规则（比如改成 PR 合并），改的时候同步更新本节和 `CLAUDE.md`。

## 提交信息

中文，格式 `vX.Y：一句话摘要`，正文分条列要点：

```
v0.11：手雷按住拉环、飞行轨迹，枪和投掷物都加上手

- 投掷物按住左键拉环开始倒计时，松开才扔出；攥久了会空爆，攥满在手里炸
- 投掷物飞行时有一道渐隐的弧线
- ……
```

同一个版本号可以有多次提交（例如 v0.9 的地图数据化和改名）。

## 版本号

- 一次功能性的更新加一个小版本（v0.10 → v0.11）。
- 版本号写在两处，发版时一起改：`README.md` 第一行标题、`index.html` 开始界面的 `<small>vX.Y</small>`。
- 大版本打 tag：`git tag v0.12 && git push origin v0.12`。回滚靠 tag，见 `deploy.md`。

## 每次改动的步骤

1. 改代码或资源。可调的数值放进 `js/config.js`，带中文注释。
2. 跑验证：`node tools/verify.mjs`（Claude Code 里是 `/verify`），必须"问题: 0"。
   改动涉及玩法逻辑时，再写一个针对性的测试脚本，见 `testing.md`。
3. 有结构变化的话，更新 `README.md`（目录表、"想改点什么"）和 `docs/` 里相关文档。
4. 提交；在分支上开发的，合并进 `main`。推送 `main`（和分支）。
5. 需要上线就在 `main` 上跑 `./deploy.sh`，再按 `deploy.md` 的"验证"一节检查。

第 2、4、5 步可以用一条命令完成（Claude Code 里是 `/ship`）：

```bash
tools/ship.sh -v v0.13 -m 提交信息文件     # 发新版本
tools/ship.sh -m 提交信息文件              # 沿用当前版本
tools/ship.sh -m 提交信息文件 --no-deploy  # 只推送不部署
```

它会改版本号、跑 verify（只改文档时跳过）、提交、推送分支并合并进 `main`、推送 `main`、从 `main` 部署、检查线上，最后回到原分支。参数见脚本开头。

## 不能做的事

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 前要先问项目负责人，改完只 `caddy reload`。
- 不要把仓库目录整个挂进容器或当站点根目录，发布只走 `deploy.sh` 的 rsync。
- `refer/` 是负责人的参考图目录，已 gitignore，不要删、不要提交。
- 不要擅自扩展玩法，见 `decisions.md`。
