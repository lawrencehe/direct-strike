---
name: ship
description: 提交、建 PR 并入 main、推送并部署到线上。用户说"deploy / 部署 / 上线 / commit push & deploy / 提交推送部署 / 发版 / ship"时用（说 deploy 就是全套：提交、推送、合并、部署）；只说"提交推送"时加 --no-deploy。
---

# 提交 → PR 并入 main → 部署 → tag 和 Release

全部由 `tools/ship.sh` 完成，不要手动逐步执行，也不要再跑 git status / log / curl 去复查：脚本每步成功打印一行 ✓，失败打印 ✗ 并退出。

## 步骤

0. 检查文档（`CLAUDE.md` 的"文档和项目状态"）：结果已经融进 `docs/` 对应的主题文档（标了 `#N`）；
   `docs/status.md` 已更新（版本）；遗留和要真机确认的都开成了 GitHub issue。要部署的话，把 `status.md` 的线上版本直接写成已上线后的样子，一起提交。
   缺了先补，再继续。找出这次要关闭的需求 issue 编号（`gh issue list --label 需求`）。
1. 判断版本号：有功能或玩法改动就加一个小版本（看 `README.md` 第一行，例如 v0.12 → v0.13）；只改文档或小修复沿用当前版本，不传 `-v`。
2. 把提交信息写到草稿目录的一个文件里（中文，首行 `vX.Y：一句话摘要`，正文分条列要点，末尾带系统要求的 Co-Authored-By 行）。
3. 运行一次：

```bash
tools/ship.sh -v v0.13 -m <提交信息文件> -c 6,27 --tag
```

`-c` 是这次关闭的 issue 编号，写进 PR 正文的 `Closes #N`，合并时 GitHub 自动关闭。

发新版本（传了 `-v`）并且部署时都加 `--tag`：部署成功后给 `main` 打这个版本的 tag 并推送，回滚靠它。
沿用当前版本的小修复不加（tag 已经在之前的提交上，脚本会报错，不移动已发布的 tag）。

可选：`--no-pr` 不走 PR、本地合并（gh 不能用时）；`--no-deploy` 只推送不部署；`--live-verify` 部署后再验证线上（慢，只在改动大时用）；`--skip-verify` 跳过本地验证。

## 脚本会做什么

- 改版本号（README 标题、index.html），检查两处一致、提交信息首行版本一致。
- 改了非文档文件时先跑 `verify`（菜单 + 对决），不通过就取消暂存、不提交。
- 提交；在分支上时推送分支 → 建 PR（标题是提交首行，正文是提交正文加 `Closes #N`，挂同名 Milestone；已有开着的 PR 就沿用）
  → `gh pr merge --merge` 合并进 `main` → 拉回本地 `main`。分支不删除，最后回到原分支。PR 合并失败多半是冲突：在分支上 `git merge origin/main` 解决后再跑。
- 从 `main` 运行 `deploy.sh`，检查线上页面、脚本、地图、模型为 200，`/refer/`、`/.git/`、`/docs/` 为 404，页面版本号正确。
- 加了 `--tag`：部署成功后打带注释的 tag（注释是提交首行）并推送，建 GitHub Release（说明是提交正文加 PR 编号），
  同名 Milestone 的 issue 都关了就关掉 Milestone；部署失败不打。

## 汇报

把脚本输出的 ✓ 行浓缩成两三句告诉用户即可（版本、PR 编号、已上线）。出现 ✗ 时按提示处理，处理不了再问用户。
脚本没覆盖的情况（例如合并冲突、给旧版本补 tag）按 `docs/workflow.md` 手动处理。
