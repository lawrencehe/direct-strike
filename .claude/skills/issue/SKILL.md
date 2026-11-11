---
name: issue
description: 做负责人指定的 GitHub issue 并跟进到上线。负责人说"ISSUE51 / issue 51 / #51 / 做 51 / 继续 51"时用：看 issue 到哪一步、接手、开发、提 PR 等验收，负责人说 commit push & deploy 再上线。
---

# 做负责人指定的 issue

**由负责人驱动**：负责人在会话里说编号才做，Claude 不自己挑 issue、不定时拉取（#58）。
一个会话只做这一个 issue：只做 issue 里写清楚的事，不扩大范围，不动别的 issue（只能新开遗留 issue）。
CLAUDE.md 的约定（文档、/verify、中文、config.js、红线）照常适用。下面的 `N` 是 issue 编号。

## 0. 看清楚到了哪一步

```bash
gh issue view N --json title,body,state,labels,milestone,comments    # 本机 gh 2.46 不要用 --comments，会报 GraphQL 错
gh pr list --state all --json number,title,headRefName,state,body \
  -q '.[] | select(.body | test("(?i)(closes|fixes) #N\\b")) | "\(.number) \(.state) \(.headRefName) \(.title)"'
```

旧的自动任务评论末尾有 `<!-- autopilot:branch=… pr=… version=… -->`，也能找到分支。再看 `docs/status.md`。

| 情况 | 做什么 |
|---|---|
| issue 已关闭（`已上线`） | 告诉负责人，问是重开还是开新 issue |
| 没有分支、没有 PR | 新任务，从第 1 步做 |
| 有分支、没有 PR（上次没做完，或 `等你回复`） | 读负责人后来的评论，在分支上接着做 |
| 有开着的 PR（`待验收`） | 负责人在会话或 issue 里提的修改意见，在原分支上改，改完回到第 4 步；负责人说上线就直接第 5 步 |

先用两三句告诉负责人：这个 issue 要做什么、现在到哪一步、打算怎么做。

## 1. 准备

**每个 issue 在自己的 worktree 里做**，不在主目录 `/home/donkey/direct-strike` 里改：那里可能有别的会话没提交的改动，
`ship.sh` 的 `git add -A` 会一起带走（`workflow.md` 的"分支"）。

```bash
WT=/home/donkey/direct-strike-issue-N
git -C /home/donkey/direct-strike fetch -q origin
[ -d $WT ] || git -C /home/donkey/direct-strike worktree add -q --detach $WT origin/main
ln -sfn /home/donkey/direct-strike/tools/node_modules $WT/tools/node_modules   # verify 和测试要用；已 gitignore
cd $WT && git checkout -q <已有分支> && git pull -q --ff-only     # 接着做时；新任务见下
```

会话的工作目录每次命令后会回到主目录，所以**每条命令都写 `cd $WT && …`**，文件用 `$WT/…` 的绝对路径读写。

新任务：
1. 定版本号：`origin/main` 上 `README.md` 第一行的版本，和开着的 PR 标题（`gh pr list --state open --json title`）占用的版本，取最大的加 0.01。
2. `cd $WT && git checkout -q -b vX.Y-英文主题 origin/main`；没有这个版本的 Milestone 就建（`gh api repos/lawrencehe/direct-strike/milestones -f title=vX.Y`），issue 挂上去。
3. 在 issue 留"已接手"评论（格式见下），标签：`gh issue edit N --add-label Claude处理中 --remove-label 等你回复`。

## 2. 需求不清楚就问

有多种做法、要改玩法方向、要碰红线：**不要猜**，当场问负责人（选项式的用 AskUserQuestion），结论简短回在 issue 评论里。
负责人说先放着、要走开：把问题写成 issue 评论（格式见下），标签改成 `等你回复`（去掉 `Claude处理中`），停下。
下次负责人说同一个编号，第 0 步会接上。

## 3. 开发

按 `CLAUDE.md` 和 `docs/workflow.md` 的"每次改动的步骤"：改代码（数值进 `config.js`）→ `node tools/verify.mjs` 必须"问题: 0" →
玩法逻辑写针对性测试 → 看截图 → 结果融进主题文档（标 `（#N）`）。版本号改两处（`README.md` 第一行、`index.html` 的 `<small>`），
`docs/status.md` 直接写成上线后的样子。遗留的、要真机确认的，各开一条 issue（`待确认` / `bug` / `想法`，写"来源：#N"）。
负责人中途改的要求，简短记在 issue 评论里。

## 4. 提 PR，等验收

```bash
cd $WT && git add <改动的文件> && git commit -F <提交信息文件> && git push -u origin <分支>
gh pr create --base main --title "<提交首行>" --body-file <PR 正文文件> --milestone vX.Y   # 正文：要点 + Closes #N
```

提交信息中文，首行 `vX.Y：一句话摘要`，正文分条写改了什么、怎么验证的，末尾带系统要求的 Co-Authored-By 行。
然后留"待验收"评论，标签：`gh issue edit N --add-label 待验收 --remove-label Claude处理中`。
在会话里告诉负责人 PR 链接、改了什么、要真机试什么，等他说上线或提修改意见。

## 5. 上线

负责人说 `commit push & deploy`（或"上线"）才上线，用 `/ship`，在 worktree 里跑：

```bash
cd $WT && tools/ship.sh -c N --tag                 # 已经提交过、只差上线
cd $WT && tools/ship.sh -m <提交信息文件> -c N --tag   # 还有没提交的改动（比如刚按意见改完）
```

`ship.sh` 会把 `main` 合进分支、复用开着的 PR 合并、部署、打 tag、建 Release，issue 关闭并标 `已上线`、去掉流程标签、留"已上线"评论。
失败按它的提示处理（别的文件冲突：在分支上 `git merge origin/main` 解决后再跑）。几个 PR 同时等上线时按版本号从小到大上。
负责人只说"提交推送"时加 `--no-deploy`（不关 issue、不打 tag）。

## 评论格式

用 `gh issue comment N --body-file <文件>`，写在草稿目录里。

已接手：
```
🤖 **Claude**：已接手（vX.Y，分支 `vX.Y-xxx`）

打算这样做：
- ……
```

有问题要你定：
```
🤖 **Claude**：有问题要你定

1. ……？ A. …… B. ……（我倾向 A，因为……）

回复后在 Claude Code 里说"ISSUE N"，我接着做。
```

待验收：
```
🤖 **Claude**：做完了，等你验收 → PR #<编号>

**改了什么**
- ……

**验证**
- /verify：问题 0；测试 tools/tests/xxx.mjs 全部通过；……
- 开发机测不了、要你真机试的：……（已开 #<编号>）

**下一步**
- 觉得可以：在 Claude Code 里说 `commit push & deploy`，我合并上线（版本 vX.Y）、关 issue。
- 要改：在会话里说，或写在这里再说"ISSUE N"。
```

## 坑

- 本机 gh 2.46 的 `gh pr edit`、`gh issue view --comments`、`gh pr view`（不带 `--json`）会读已下线的 Projects (classic)，报 GraphQL 错。
  查东西一律带 `--json`；改 PR 正文走 REST：`gh api -X PATCH repos/lawrencehe/direct-strike/pulls/<编号> -F body=@文件`。
- `main` 只能在一个 worktree 里检出：`ship.sh` 合并后 `main` 被占着就用分离头指针切到 `origin/main` 部署，不用管。
- 从 worktree 部署是安全的：`deploy.sh` 把 Caddyfile 复制到固定的 `/home/donkey/fps-conf/Caddyfile` 再挂。
- GitHub 评论发不了图片（没有上传附件的接口），截图在会话里给负责人看，评论里用文字描述。
- worktree 做完不删（和分支一样留着）；下次同一个 issue 直接用。
