# 开发流程

## GitHub 上管什么

边界是：**过程和历史放 GitHub；仓库里的文档只写现在的样子**（按主题写在 `docs/`，标 `#N` 指回 GitHub）。

| 放在哪 | 记什么 |
|---|---|
| **Issue** | 需求入口、bug、待确认、待办、讨论、负责人的决定。一件事一条 |
| **PR** | 一个版本改了什么、怎么验证的；正文写 `Closes #N`，合并时自动关掉需求 issue |
| **Milestone** | 一个版本一个（名字就是 `vX.Y`），需求 issue 和 PR 挂上去；上线后关掉 |
| **Release** | 每个上线的版本一个，`ship.sh --tag` 自动建 |
| `docs/` 的主题文档（仓库里） | 每个模块现在怎么工作、为什么这样做、坑和可调参数，写到哪件事标 `（#N）` |
| `docs/status.md`（仓库里） | 版本、现在能玩什么；已知问题和待办只放指向 Issue 的链接 |

查历史：主题文档里的 `#N` → `gh issue view N --comments` / `gh pr view N`；没有线索就 `gh issue list --state all --search "关键词"`、`git log -S 关键词`。
早期的需求文档存档在对应 issue 的评论里（"📦 存档"）。

标签：

| 标签 | 用在 |
|---|---|
| `需求` | 要做的功能或改动，做完由 PR 关闭 |
| `bug` | 玩起来有毛病（已知问题） |
| `待确认` | 等负责人真机试玩、定数值或确认信息 |
| `想法` | 以后可能做，负责人还没定 |

规则：

- **开 issue 只是记录**；负责人在会话里指定编号，Claude 才做那一条（见下面"负责人指定 issue"）。
- **新会话开工前**看 `status.md` 和开着的 issue：`gh issue list`（`--label 待确认` 之类筛选）。
- 负责人提的新需求、发现的问题，先开 issue（写负责人原话），再动手。
- 需求做完，遗留的问题都开成 issue（写"来源：#N"）。需要真机确认的也开一条 `待确认`。
- 问题修好、确认完就关 issue（关的时候写一句结论）。不做的用 "Close as not planned" 并写原因。
- **仓库是公开的**：issue、PR、Release 里不贴开发者模式录的数据和视频、服务器密码和令牌、玩家信息；
  只写现象、结论和上传编号。
- v0.1 ~ v0.25 的 Release、v0.20 ~ v0.25 的 Milestone 和需求 issue（#1 ~ #5）是 2026-11-10 补建的，当时还没走 PR。

## 负责人指定 issue（`/issue`）

负责人新开 Claude Code 会话，说"ISSUE51"（或 `#51`、"做 51"、"继续 51"），Claude 就用 `/issue` skill 做这一条、跟进到上线。
**Claude 不自己挑 issue，也不定时拉取**（#58）：原来的定时自动任务（#29）实践下来效果不理想，已删除。

| 负责人做什么 | 会发生什么 |
|---|---|
| 开 issue | 只是记录 |
| 在会话里说"ISSUE N" | Claude 看 issue 到哪一步；新任务就留"已接手"评论（打算怎么做、版本、分支），标签 `Claude处理中` |
| — | 有问题当场问你，结论记在 issue 评论里；你要走开就留言提问、标 `等你回复`，下次说"ISSUE N"接着做 |
| — | 做完：提 PR（`Closes #N`），评论"改了什么、怎么验证的、要你真机试什么"，标 `待验收` |
| 提修改意见（会话里说，或写在 issue 里再说"ISSUE N"） | 在同一个分支和 PR 上改 |
| 说 `deploy`（等同 `commit push & deploy`、部署、上线） | `/ship`：合并上线、打 tag、建 Release，issue 关闭并标 `已上线`、评论"✅ 已上线 vX.Y" |

- 标签：`Claude处理中`、`等你回复`、`待验收` 表示进度，`已上线` 由 `ship.sh` 打。`已上线` 只代表合并部署成功、线上检查通过；真机效果有问题开新 issue。
  `交给Claude`、`优先`、`授权部署`、`上线失败` 是定时自动任务用的，不再使用（`ship.sh` 上线时仍会顺手摘掉）。
- 每个 issue 在自己的 worktree `/home/donkey/direct-strike-issue-N` 里做，`tools/node_modules` 软链接到主目录（verify 要用）。
  几个会话同时做不同 issue 互不干扰；做完不删。
- 版本号开工时就定：`main` 的版本和开着的 PR 占用的版本取最大的加一，写进分支名、`README.md` 和 `index.html`，`status.md` 写成上线后的样子。
  几个 PR 同时等上线时**按版本号从小到大上**；版本号比 `main` 旧的会被 `ship.sh` 拦下（版本号不倒退）。
  前一个上线后，后面的 PR 和 `main` 在版本号、`status.md` 这几处冲突是正常的，`ship.sh` 合并前会自动解决（#47）。
- 本机 gh 2.46 的 `gh pr edit`、`gh issue view --comments`、`gh pr view`（不带 `--json`）会报 Projects (classic) 的 GraphQL 错，
  查东西带 `--json`，改 PR 正文走 `gh api -X PATCH`。

## 分支

**可以开分支开发，但开发完一律并入 `main`，再推送和部署。** 线上永远从 `main` 发布。

1. 开分支（可选），名字带版本号和主题，例如 `v0.11-hands-cook`。小改动也可以直接在 `main` 上做。
2. 在分支上提交，分支本身也推送到远端：`git push origin <分支>`。
3. 开发完**建 PR 合并进 `main`**（v0.26 起；`ship.sh` 自动做）：`gh pr create` → `gh pr merge --merge`（合并提交，不删分支）。
   一个人开发不用等人审，PR 是留记录用的。`gh` 不能用时 `ship.sh --no-pr` 在本地合并。
4. 从 `main` 跑 `./deploy.sh` 部署。**不要从分支部署**，否则线上会比 `main` 新，下次从 `main` 部署就回退了。

**分支不删除**，本地和远端都保留，留着完整的开发历史。直接在 `main` 上做的小改动没有 PR，提交信息里写 `#N` 关联 issue 就行。

**同时做两个需求时用 `git worktree` 分开目录**（`/issue` 每个 issue 一个，见上；手动的例如 `git worktree add ../direct-strike-v0.27 -b v0.27-xxx main`）。
同一个目录里两个会话同时改，`ship.sh` 的 `git add -A` 会把另一个会话没做完的改动一起提交（v0.23、v0.26 都出过）。

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
- 版本号写在两处，发版时一起改：`README.md` 第一行标题、`index.html` 首页顶栏的 `<small>vX.Y</small>`。
- **每个上线的版本都打 tag**（2026-11-09 起，原来只给大版本打）：回滚就是回到上一个版本，哪个版本没有 tag 就回不去。
  发新版本时 `ship.sh` 加 `--tag`，部署成功后自动打带注释的 tag（注释是提交首行）并推送。
  同一版本号有多次提交时，tag 打在第一次带 `--tag` 上线的那个提交上；后面再上线同一版本不再移动 tag（已发布的 tag 不改）。
  手动打：`git tag -a v0.21 -m "v0.21：摘要" && git push origin v0.21`。
- `ship.sh` 的线上检查没通过时不会打 tag。确认只是检查时机的问题（线上手动看是对的）后，按上面手动打。
- 现有 tag：v0.1 ~ v0.23、v0.25 之后每个版本（v0.24 编号作废：做的时候另一个会话先发了 v0.25，改名 v0.26 发）。v0.3、v0.4 是 2026-11-10 补的。v0.10、v0.11、v0.13 ~ v0.20 是 2026-11-09 补的，打在各版本最后一个提交上；
  v0.12 是当时手动打的，在 `49a9257`（加 `ship.sh` 那次），之后还有一个 v0.12 的提交没有 tag。
  v0.21 是手动打的，在 `219d997`（第二次部署时线上检查赶上 Caddy 重载误报，之后 `ship.sh` 的线上检查加了重试）。

## 每次改动的步骤

0. 看 `status.md` 和开着的 issue；本次需求没有 issue 就开一条（`需求` 标签，挂这个版本的 Milestone，没有就建）。
   需求不清楚先问，结论回在 issue 里。
1. 改代码或资源。可调的数值放进 `js/config.js`，带中文注释。方案和负责人中途改的要求简短记在 issue 评论里。
2. 跑验证：`node tools/verify.mjs`（Claude Code 里是 `/verify`），必须"问题: 0"。
   改动涉及玩法逻辑时，再写一个针对性的测试脚本，见 `testing.md`。
3. 把结果融进 `docs/` 里对应的主题文档（现在怎么工作、为什么、坑，标 `#N`；改原文，不追加"补充"）；有结构变化的话更新 `README.md`。
   遗留和待确认开成 issue；更新 `status.md`（要上线就直接写成上线后的版本）。提交正文写清改了什么、怎么验证的，它就是 PR 说明。
4. 提交；在分支上开发的，建 PR 合并进 `main`（`Closes #N`）。推送 `main`（和分支）。
5. 需要上线就在 `main` 上跑 `./deploy.sh`，再按 `deploy.md` 的"验证"一节检查。

第 2、4、5 步可以用一条命令完成（Claude Code 里是 `/ship`）：

```bash
tools/ship.sh -v v0.13 -m 提交信息文件 -c 6,27 --tag  # 发新版本：PR 关闭 #6、#27，部署成功后打 tag、建 Release
tools/ship.sh -m 提交信息文件              # 沿用当前版本
tools/ship.sh -m 提交信息文件 --no-deploy  # 只推送不部署
```

它会改版本号、跑 verify（只改文档时跳过）、提交、**先把 `main` 合进分支**、推送分支、建 PR 并在 GitHub 上合并进 `main`、从 `main` 部署、检查线上、
打 tag、建 Release、`-c` 的 issue 关闭并标 `已上线`、Milestone 的 issue 都关了就关掉 Milestone，最后回到原分支。参数见脚本开头。

合并 `main` 进分支（#47）：只在 `README.md`、`index.html`、`docs/status.md` 冲突时自动解决（取分支的），
合并后有代码变化就再跑一次 verify；别的文件冲突、或者分支版本号比 `main` 旧，直接停下，什么都不推送。

## 不能做的事

- 不要动 `/home/donkey/paseo-relay/` 的 relay 服务和它的 Caddy 容器（不重启、不重建）。
- 改 relay 的 Caddyfile 前要先问项目负责人，改完只 `caddy reload`。
- 不要把仓库目录整个挂进容器或当站点根目录，发布只走 `deploy.sh` 的 rsync。
- `refer/` 是负责人的参考图目录，已 gitignore，不要删、不要提交。
- 不要擅自扩展玩法，见 `decisions.md`。
