# Issue 索引

每条 GitHub issue 一行：**提炼后的结论**、现状，以及落到了仓库里的哪份文档、哪个版本、哪个 PR。
issue 里的讨论过程留在 GitHub；这里只记"最后定了什么、做成了什么、去哪看细节"，方便跟进、追踪和以后迭代。

- 规则见 `CLAUDE.md` 的"需求文档和项目状态"第 7 条（2026-11-11 负责人定，#51）：**每个处理过的 issue，不管谁开的，收尾时都要在这里加一行或更新这一行**，
  不照抄 issue，也不是一个 issue 一份文档：**把结论融进已有的文档**（需求的来龙去脉在需求文档，规则、真机结果、坑、数值写进对应的主题文档或 `config.js` 注释），
  "落地"一栏指向它最后落在哪。本页只做索引和一句话提炼。
- 编号没出现的是 PR（GitHub 上 issue 和 PR 共用编号）。
- 类型：需求 / bug / 待确认（等负责人真机试或拍板）/ 想法（还没定做不做）/ 讨论。
- 现状：✅ 已上线 / ✔️ 已关闭（有结论，不用改代码）/ ⏳ 进行中 / 🟡 等负责人 / 💡 想法，没排期。

## 开着的

| Issue | 类型 | 提炼 | 现状 | 落地 |
|---|---|---|---|---|
| [#52](https://github.com/lawrencehe/direct-strike/issues/52) | bug | Mac 误触 ⌘+空格 没有自动暂停、按键被干扰，和 #15 定的规则不符；现在只靠"窗口失焦"判断，聚焦搜索不一定让页面失焦 | 🟡 没排期 | [ui 全屏规则](ui.md) · [architecture 已知的坑](architecture.md) |
| [#50](https://github.com/lawrencehe/direct-strike/issues/50) | 需求 | 地图不真实：地上的方块、桌椅轮胎是 JS 几何体。先解决现有地图的渲染（换成模型和贴图），再定地图骨架（区域、道路）和以后的制作流程；素材谁找、谁编辑地图待定 | ⏳ 已交给 Claude，排队中 | — |
| [#45](https://github.com/lawrencehe/direct-strike/issues/45) | 需求 | 音效不真实：现在全部在 `js/audio.js` 里代码合成。方案是换成 CC0 实录素材（枪声、换弹、爆炸），Claude 已列出素材来源和做法 | 🟡 等负责人回复 | — |
| [#41](https://github.com/lawrencehe/direct-strike/issues/41) | 待确认 | v0.30 购买的回应（`purchase` / `denied` 音效、武器栏闪亮、钱数飘字、区外按 B 购物车晃动）真机效果；时长 `economy.boughtPulse` | 🟡 等真机试 | [v0.30-buy-ux](requirements/v0.30-buy-ux.md) |
| [#39](https://github.com/lawrencehe/direct-strike/issues/39) | 待确认 | v0.30 左侧购物车图标的大小、位置、呼吸动画；买完关面板再按 3 切手雷的手感 | 🟡 等真机试 | [v0.30-buy-ux](requirements/v0.30-buy-ux.md) |
| [#35](https://github.com/lawrencehe/direct-strike/issues/35) | 讨论 | 手臂模型 `arm.glb` 的问题：手套口发红是贴图本身，小臂皮肤糊，没有锁骨和小臂扭转骨，袖子只到手肘。方向：A 只修贴图 / 换模型 / 自己做，待定 | 🟡 等负责人定 | [art-sources 挑人物模型](art-sources.md) · [v0.29-left-arm-pose](requirements/v0.29-left-arm-pose.md) |
| [#25](https://github.com/lawrencehe/direct-strike/issues/25) | 想法 | 闪光弹致盲按露出部位算（像 v0.25 的手雷伤害） | 💡 | — |
| [#24](https://github.com/lawrencehe/direct-strike/issues/24) | 想法 | NPC 听脚步声，按推算位置找路过去 | 💡 | — |
| [#23](https://github.com/lawrencehe/direct-strike/issues/23) | 想法 | NPC 也有换弹动作和经济 | 💡 | — |
| [#22](https://github.com/lawrencehe/direct-strike/issues/22) | 想法 | "捏雷"：先松握片再丢，手雷空爆 | 💡 | — |
| [#21](https://github.com/lawrencehe/direct-strike/issues/21) | 想法 | 上膛时右手真的去拉机柄 / 套筒 | 💡 | — |
| [#20](https://github.com/lawrencehe/direct-strike/issues/20) | 想法 | AK / M4、手枪 / SG 区分数值 | 💡 | — |
| [#19](https://github.com/lawrencehe/direct-strike/issues/19) | 想法 | `russian_soldier.glb` 绑骨骼后做对手形象 | 💡 | — |
| [#18](https://github.com/lawrencehe/direct-strike/issues/18) | 想法 | 锯短霰弹枪，新增霰弹玩法 | 💡 | — |
| [#17](https://github.com/lawrencehe/direct-strike/issues/17) | 想法 | 调试真要设备信息时，玩家同意后才收（接 v0.23 的隐私规则） | 💡 | [decisions](decisions.md) |
| [#16](https://github.com/lawrencehe/direct-strike/issues/16) | 想法 | 后台管理：玩家登录、数据管理、按玩家开开发者模式（加在 `/api/` 下） | 💡 | [decisions](decisions.md) |
| [#10](https://github.com/lawrencehe/direct-strike/issues/10) | 待确认 | 扔完手雷切回枪那一帧枪模瞬移约 56cm、转 36°。疑似 `weapon.js` 的 `finishThrow` 把收枪进度直接设满；等真机录一段再定修不修 | 🟡 等真机录 | [architecture 已知的坑](architecture.md) |
| [#7](https://github.com/lawrencehe/direct-strike/issues/7) | 待确认 | 经济数值：收入上限按存款上限 $2000 做的，投掷物价格和携带上限是先定的值（`config.economy`） | 🟡 等负责人定 | `js/config.js` 的 `economy` 注释 · [v0.20-reload-nade-economy](requirements/v0.20-reload-nade-economy.md) |

## 已关闭

| Issue | 类型 | 提炼 | 现状 | 落地 |
|---|---|---|---|---|
| [#51](https://github.com/lawrencehe/direct-strike/issues/51) | 需求 | 每个 issue 都提炼成项目文档，建本索引；结论融进已有文档（不是一个 issue 一份文档）；CLAUDE.md 第 7 条、自动任务的 prompt 都写进了规则；已有 issue 全部补登 | ✅ v0.32（工具） | [v0.32-issue-index](requirements/v0.32-issue-index.md) |
| [#47](https://github.com/lawrencehe/direct-strike/issues/47) | 需求 | `ship.sh` 上线前先把 main 合进分支；只在版本号和文档登记冲突时自动解决，代码冲突或版本号倒退就停下 | ✅ v0.30（工具），PR #49 | [v0.30-ship-auto-merge](requirements/v0.30-ship-auto-merge.md) · [workflow](workflow.md) |
| [#46](https://github.com/lawrencehe/direct-strike/issues/46) | 需求 | Claude 在 GitHub 上用机器账号 primorigin，和负责人 lawrencehe 分开；"给 primorigin 处理" = "给 Claude 处理" | ✅ v0.30（工具），PR #48 | [v0.30-machine-account](requirements/v0.30-machine-account.md) · [tools](tools.md) |
| [#42](https://github.com/lawrencehe/direct-strike/issues/42) | 待确认 → 需求 | `m4.glb` 也是同事提供。定规则：没有原作链接的模型一律写"同事提供、不登记原作链接"，授权符合要求就能用 | ✅ v0.32，PR #44 | [v0.32-m4-license](requirements/v0.32-m4-license.md) · [LICENSES](../assets/LICENSES.md) |
| [#37](https://github.com/lawrencehe/direct-strike/issues/37) | 需求 | 自动任务加 `授权部署` 标签，打上就直接上线；上线成功标 `已上线`，失败标 `上线失败`；修 gh 2.46 的报错 | ✅ v0.27（工具），PR #38 | [v0.27-autopilot](requirements/v0.27-autopilot.md) · [autopilot](autopilot.md) |
| [#34](https://github.com/lawrencehe/direct-strike/issues/34) | 待确认 | v0.29 步枪左手托护木新姿势的真机观感；可调 `SUPPORT_ROLL`、`Weapon.VIEW` 的 `left.armDir` | ✔️ 负责人关闭 | [v0.29-left-arm-pose](requirements/v0.29-left-arm-pose.md) |
| [#33](https://github.com/lawrencehe/direct-strike/issues/33) | 需求 | 购买：买完立刻关面板，购买区的文字提示换成左侧购物车图标，买东西用声音和动画回应 | ✅ v0.30，PR #40 | [v0.30-buy-ux](requirements/v0.30-buy-ux.md) |
| [#31](https://github.com/lawrencehe/direct-strike/issues/31) | 需求 | README 在线地址下补一行说明（自动任务的第一个端到端测试） | ✅ v0.28，PR #32 | [v0.28-readme-online-url](requirements/v0.28-readme-online-url.md) |
| [#29](https://github.com/lawrencehe/direct-strike/issues/29) | 需求 | 自动任务：issue 打 `交给Claude`，开发机每 30 分钟接手一个，评论区同步进度 | ✅ v0.27，PR #30 | [v0.27-autopilot](requirements/v0.27-autopilot.md) · [autopilot](autopilot.md) |
| [#27](https://github.com/lawrencehe/direct-strike/issues/27) | 需求 | 项目管理迁到 GitHub：Issue、PR、Milestone、Release，`ship.sh` 走 PR 合并 | ✅ v0.26，PR #28 | [v0.26-github-workflow](requirements/v0.26-github-workflow.md) · [workflow](workflow.md) |
| [#26](https://github.com/lawrencehe/direct-strike/issues/26) | 待确认 | v0.26 真机结果：⌘+空格**不会**自动暂停，但会干扰按键；全屏里 Esc 只出暂停菜单（正常）；Safari / Firefox 没试 | ✔️ 已关闭，没暂停的问题转 #52 | [ui 全屏规则](ui.md) |
| [#15](https://github.com/lawrencehe/direct-strike/issues/15) | bug | Mac 的 ⌘+空格 / ⌘+Tab 由系统先处理，网页拦不住。负责人定：识别到系统按键误触就暂停并弹菜单，玩家点继续；彻底不弹只能关系统快捷键 | ✔️ 已知限制，规则还没做到见 #52 | [ui 全屏规则](ui.md) · [architecture 已知的坑](architecture.md) |
| [#14](https://github.com/lawrencehe/direct-strike/issues/14) | 需求 | `sg.glb`、`ukrainian-soldier.glb` 是同事下载 CC0 原作后调整给的，不登记原作链接 | ✅ v0.31，PR #43 | [v0.31-asset-license](requirements/v0.31-asset-license.md) · [LICENSES](../assets/LICENSES.md) |
| [#13](https://github.com/lawrencehe/direct-strike/issues/13) | 待确认 | NPC 手雷：引信 2 秒、NPC 雷会不会太准（`grenades.frag.fuse`、`config.bots` 的丢雷参数） | ✔️ 负责人关闭，没留意见，数值保持 | [v0.25-npc-grenade](requirements/v0.25-npc-grenade.md) |
| [#12](https://github.com/lawrencehe/direct-strike/issues/12) | 待确认 | 全屏 + 锁鼠标时 ⇧⌘= 能打开开发者面板（`config.dev.panelKey`） | ✔️ 负责人确认可以 | [devmode](devmode.md) |
| [#11](https://github.com/lawrencehe/direct-strike/issues/11) | 待确认 → 需求 | 第一人称手臂观感差：根子在左手握持朝向，改成从护木左下方斜着包上去，手肘移到画面外；手套口发红另见 #35 | ✅ v0.29，PR #36 | [v0.29-left-arm-pose](requirements/v0.29-left-arm-pose.md) |
| [#9](https://github.com/lawrencehe/direct-strike/issues/9) | 待确认 | 开发者模式"录制画面"的开销：有一些影响，在预期内，没发现明显的性能问题 | ✔️ 负责人确认 | [devmode](devmode.md) |
| [#8](https://github.com/lawrencehe/direct-strike/issues/8) | 待确认 | 换弹节奏和音效的真机试玩（v0.20） | ✔️ 负责人关闭，没留意见；音效后续见 #45 | [v0.20-reload-nade-economy](requirements/v0.20-reload-nade-economy.md) |
| [#6](https://github.com/lawrencehe/direct-strike/issues/6) | 需求 | Mac 误触系统快捷键后按键卡住、Esc 退出全屏后点"继续"报错 | ✅ v0.26 | [v0.26-keyboard-fullscreen](requirements/v0.26-keyboard-fullscreen.md) |
| [#5](https://github.com/lawrencehe/direct-strike/issues/5) | 需求 | NPC 手雷炸不到人：NPC 推算位置、听枪声、预演丢雷；手雷按露出部位算伤害；引信 2 秒 | ✅ v0.25 | [v0.25-npc-grenade](requirements/v0.25-npc-grenade.md) |
| [#4](https://github.com/lawrencehe/direct-strike/issues/4) | 需求 | 开发者模式只收游戏数据（不收 IP 和浏览器环境），⇧⌘= 打开开发者面板 | ✅ v0.23 | [v0.23-dev-privacy](requirements/v0.23-dev-privacy.md) · [decisions](decisions.md) |
| [#3](https://github.com/lawrencehe/direct-strike/issues/3) | 需求 | 第一人称手腕扭曲：握持不扭转小臂 | ✅ v0.22 | [v0.22-arm-wrist](requirements/v0.22-arm-wrist.md) |
| [#2](https://github.com/lawrencehe/direct-strike/issues/2) | 需求 | 开发者模式：真机录每帧数据和画面，上传给开发分析 | ✅ v0.21 | [v0.21-dev-mode](requirements/v0.21-dev-mode.md) · [devmode](devmode.md) |
| [#1](https://github.com/lawrencehe/direct-strike/issues/1) | 需求 | 换弹动作、手雷两道保险、经济系统 | ✅ v0.20 | [v0.20-reload-nade-economy](requirements/v0.20-reload-nade-economy.md) |
