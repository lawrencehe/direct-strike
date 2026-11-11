# 需求记录

每个需求一份文档，记下"要什么、怎么做的、为什么、做到哪了"。项目当前的整体状态看 [../status.md](../status.md)。

## 规则

- **文件名**和分支名一致：`vX.Y-主题.md`，例如 `v0.20-reload-nade-economy.md`。直接在 `main` 上做的小需求也按这个格式起名。
- **开工时**先有 GitHub issue（`需求` 标签），再复制 [_template.md](_template.md) 新建文档，先写"需求"和"范围"，链接 issue，在下面的列表登记，状态写"进行中"。
- **做的过程中**随时补"方案和决定"、"改动"；需求变了就改"需求"一节并注明日期。
- **做完时**补"验证"和"遗留"，状态改成"已完成"；遗留里的每一条开成 issue，文档里写上编号。上线后改成"已上线"，写上版本号和 PR。
- 文档写"为什么这样做"（方案、决定、验证）；进度、讨论、待确认放在 issue 和 PR 上，见 `../workflow.md` 的"GitHub 上管什么"。
- 一次只改了错别字、只改文档这类零碎改动不用单独建文档，但仍要看看 `status.md` 是否需要改。
- v0.19 及以前没有单独的需求文档，看 GitHub 的 Release、git log 和 `decisions.md`。v0.24 编号作废（改名 v0.26 发）。

## 列表

新的写在最上面。

| 版本 | 需求 | 状态 | 文档 |
|---|---|---|---|
| v0.31 | 补登 sg.glb、ukrainian-soldier.glb 的素材来源：同事提供的 CC0 原作，不登记原作链接 | 已上线 | [v0.31-asset-license.md](v0.31-asset-license.md) |
| v0.30（工具） | 上线前自动把 main 合进分支，版本号和文档登记的冲突自动解决（#47） | 已完成 | [v0.30-ship-auto-merge.md](v0.30-ship-auto-merge.md) |
| v0.30（工具） | Claude 用机器账号 primorigin 操作 GitHub，和负责人分开（#46） | 已上线 | [v0.30-machine-account.md](v0.30-machine-account.md) |
| v0.30 | 购买体验：买完立刻关面板；购买区的文字提示换成购物车图标 | 已上线 | [v0.30-buy-ux.md](v0.30-buy-ux.md) |
| v0.29 | 步枪左手托护木改成从左下方斜着包上去，小臂从画面下方伸出，手肘不再折在画面中间（#11） | 已上线 | [v0.29-left-arm-pose.md](v0.29-left-arm-pose.md) |
| v0.28 | README 在线地址下补一行说明（线上从 main 部署、版本、怎么玩） | 已上线 | [v0.28-readme-online-url.md](v0.28-readme-online-url.md) |
| v0.27 | 自动任务：issue 打 `交给Claude` 由开发机定时交给 Claude 做，一次一个，评论区同步进度，评论 commit push & deploy 上线 | 已上线 | [v0.27-autopilot.md](v0.27-autopilot.md) |
| v0.26 | 项目管理迁到 GitHub：Issue、PR、Milestone、Release，`ship.sh` 走 PR 合并 | 已上线 | [v0.26-github-workflow.md](v0.26-github-workflow.md) |
| v0.26 | Mac 误触系统快捷键后按键错乱；Esc 退出全屏后点"继续"报错 | 已上线（待真机确认） | [v0.26-keyboard-fullscreen.md](v0.26-keyboard-fullscreen.md) |
| v0.25 | NPC 手雷炸不到人：NPC 推算玩家位置、听枪声、预演丢雷；手雷按露出部位算伤害；引信 3 → 2 秒 | 已上线 | [v0.25-npc-grenade.md](v0.25-npc-grenade.md) |
| v0.23 | 开发者模式隐私（不收 IP 和浏览器环境）、⇧⌘= 快捷键打开开发者面板 | 已上线 | [v0.23-dev-privacy.md](v0.23-dev-privacy.md) |
| v0.22 | 第一人称手臂：手腕不再折成大角度和扭成麻花 | 已上线 | [v0.22-arm-wrist.md](v0.22-arm-wrist.md) |
| v0.21 | 开发者模式：录制真机数据和画面，上传给开发分析 | 已上线 | [v0.21-dev-mode.md](v0.21-dev-mode.md) |
| v0.20 | 换弹动作、手雷两道保险、经济系统 | 已上线 | [v0.20-reload-nade-economy.md](v0.20-reload-nade-economy.md) |
