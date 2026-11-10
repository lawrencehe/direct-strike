# 自动任务（GitHub issue 交给 Claude）

负责人在 GitHub 上给 issue 打标签交给 Claude，开发机每 30 分钟检查一次，**一次只做一个**，进度写在 issue 评论里；
负责人看了 PR 觉得可以，打 `授权部署` 标签（或评论 `commit push & deploy`）就合并上线、关 issue。需求见 [requirements/v0.27-autopilot.md](requirements/v0.27-autopilot.md)。

## 负责人怎么用

**开 issue 只是记录，不会被自动处理。** 只有打上 `交给Claude` 才算交给 Claude。

| 你做什么 | 会发生什么 |
|---|---|
| 开 issue，不打 `交给Claude` | 只是记录，自动任务不碰 |
| 打 `交给Claude`（急的再加 `优先`；放心的再加 `授权部署`，见下） | 排队；下一轮接手，标签变 `Claude处理中`，评论"已接手"和打算怎么做 |
| — | Claude 有问题：评论里提问，标签变 `等你回复`，停下等你 |
| 在 `等你回复` 的 issue 里回复评论 | 下一轮自动接着做 |
| — | 做完：提 PR，评论"改了什么、怎么验证的、要你真机试什么"，标签变 `待验收` |
| 在 `待验收` 的 issue 上打 `授权部署`，或评论 `commit push & deploy` | 下一轮合并 PR、部署、打 tag、建 Release，去掉标签，评论"已上线"，关闭 issue |
| 打 `交给Claude` 时一起打 `授权部署`（提前授权） | 做完、验证通过、提了 PR 后**同一轮直接上线**，不停在 `待验收`；中途有问题照样先问你 |
| — | 上线失败：标签回到 `待验收`、去掉 `授权部署`（不会每轮重试），评论说明原因；处理好后重新打 |
| 在 `待验收` 的 issue 里写别的 | 当修改意见，下一轮在同一个 PR 上改 |

- 也可以照旧在 Claude Code 里说"做 #12"，效果一样。
- 开发机上测不了的（手感、帧率、真机全屏），Claude 会另开 `待确认` issue 列出来，上线后你试。
- 没有预览站点（项目还没面向玩家，负责人 2026-11-10 定的），所以"验收"看的是 PR 描述和截图说明，真机效果上线后看。
- **通知**：Claude 用的是你的 GitHub 账号发评论，GitHub 不会给你推送"自己"的评论。
  看进度就看 issue 列表的标签，或者收藏这几个筛选：
  [待验收](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E5%BE%85%E9%AA%8C%E6%94%B6)、
  [等你回复](https://github.com/lawrencehe/direct-strike/issues?q=is%3Aopen+label%3A%E7%AD%89%E4%BD%A0%E5%9B%9E%E5%A4%8D)。
  以后想要推送通知，可以给 Claude 单独建一个 GitHub 账号（机器人账号）。

## 规矩（脚本和提示词保证）

- **一次一个任务**：脚本加了锁，上一轮（正在跑 Claude）没结束，这一轮直接退出，新任务留在队列等下一轮。
- **定时检查不耗 token**：每 30 分钟那一次只用 `gh` 查 GitHub，几秒钟；只有真有任务才启动 Claude。上线由脚本直接跑 `ship.sh`（用 `origin/main` 上的版本），也不启动 Claude。
- **每天最多启动 5 次 Claude**（开发、修改各算一次）；到上限在 issue 里说一声，第二天接着做。
- 碰到 Claude 的**额度限制**：留言、把任务放回队列，歇 60 分钟再试。
- 单个任务**最长 90 分钟**，超时停下并留言。
- **只认负责人**：只有仓库主人打的 `交给Claude`、`授权部署` 才算数（别人没有打标签的权限，脚本还会再查打标签的人）；
  Claude 的评论第一行带 `<!-- autopilot -->`，脚本靠它区分"负责人说的"和"Claude 说的"。
  手动会话里用你的账号发的评论（不带这个标记）也会被当成"负责人回复"，所以对 `等你回复` / `待验收` 的 issue 手动评论时注意。
- Claude **不合并、不部署**，只提 PR；不扩大范围，需求不清楚就提问；不碰红线。权限模式是 `auto`（危险操作会被拦下），不用 `bypassPermissions`。
- 在专用 worktree `/home/donkey/direct-strike-autopilot` 里做，不碰手动会话的目录。上一轮残留的改动会收进 `git stash`，不删。
- 排队顺序：`优先` 的先做，然后按打 `交给Claude` 的时间。同一轮里上线 > 修改意见 > 回复后继续 > 新任务。

## 版本号

Claude 开工时就定版本号：`main` 的版本和开着的 PR 占用的版本取最大的加一，写进分支名、需求文档、`README.md` 和 `index.html`。
几个 PR 同时待验收时，**按版本号顺序上线**，否则后上线的会和 `README.md` 冲突、版本号倒着走；冲突了上线会失败并在评论里说明。

## 开发机上的管理

```bash
tools/autopilot/install.sh            # 安装并启动定时器（systemd 用户定时器 direct-strike-autopilot.timer）
tools/autopilot/install.sh status     # 看定时器和最近日志
tools/autopilot/install.sh pause      # 暂停（定时器照跑，脚本什么都不做）
tools/autopilot/install.sh resume     # 恢复
tools/autopilot/install.sh uninstall  # 删除定时器
tools/autopilot/autopilot.sh --dry-run   # 看这一轮会做什么，不改标签、不跑 Claude
```

| 文件 / 目录 | 是什么 |
|---|---|
| `tools/autopilot/autopilot.sh` | 调度：找任务、加锁、限额、准备 worktree、启动 Claude 或跑 ship.sh、检查结果 |
| `tools/autopilot/prompt.md` | 给无人值守 Claude 的说明（规矩、各类任务怎么做、评论格式）。`${NUM}` 这类变量由脚本填 |
| `tools/autopilot/install.sh` | 装 / 管定时器；生成启动器 `~/.local/state/direct-strike-autopilot/run/launch.sh`。改了启动器要重装：`AUTOPILOT_REPO=/home/donkey/direct-strike tools/autopilot/install.sh` |
| `~/.local/state/direct-strike-autopilot/` | 锁、每天的计数、冷却时间、暂停开关、日志（`logs/autopilot.log` 总日志，每个任务一个 Claude 输出 json） |
| `/home/donkey/direct-strike-autopilot` | 专用 worktree |

可调参数用环境变量（写在 systemd 服务里）：`AUTOPILOT_MAX_PER_DAY`（5）、`AUTOPILOT_TIMEOUT_MIN`（90）、`AUTOPILOT_COOLDOWN_MIN`（60）、
`AUTOPILOT_INTERVAL`（30min，装定时器时用）。

**systemd 用户定时器要开 linger**，否则没有登录会话时不跑：`sudo loginctl enable-linger donkey`。

## 已知的坑

- 从 worktree 部署：`deploy/compose.yaml` 原来用相对路径挂 Caddyfile，从别的目录 `docker compose up` 会把 fps-game 重建成挂那个目录的文件。
  v0.27 起 `deploy.sh` 把 Caddyfile 复制到固定的 `/home/donkey/fps-conf/Caddyfile` 再挂。
- `main` 只能在一个 worktree 里检出：`ship.sh` 合并 PR 后，`main` 被别的目录占着就用分离头指针切到 `origin/main` 部署。
- **定时器跑的是 `origin/main` 上的脚本**：启动器每次从 `origin/main` 取 `autopilot.sh`、`prompt.md`、`ship.sh` 到 `run/` 再跑。
  `ship.sh` 也用 main 的：功能分支从旧 main 开出，分支上的 `ship.sh` 可能是旧的（#31 就是这样上线失败的）。
  所以改了这两个文件要**合并进 main 才生效**；工作目录里没合并的改动用 `tools/autopilot/autopilot.sh --dry-run` 试。
  不直接跑工作目录里的脚本，是因为手动会话和自动任务都会切分支，bash 边读边执行，文件中途被换掉会出错。
- 本机 gh 2.46 的 `gh pr edit`、`gh issue view --comments`、`gh pr view`（不带 `--json`）会读已下线的 Projects (classic)，报 GraphQL 错。
  脚本里改 PR 正文走 REST（`gh api -X PATCH repos/…/pulls/N -F body=@文件`），查 issue 一律带 `--json`。
- 无人值守的 Claude 发不了图片到 GitHub 评论（没有上传附件的接口），截图只能在 PR 里用文字描述，或者负责人上线后自己看。
