# 界面（UI / UE）

游戏按"产品"组织：先到首页选模式和设置，进入战斗才全屏。界面全是 HTML + CSS 叠在画布上面，
没有框架；切换逻辑在 `js/ui.js`，战斗中的 HUD 在 `js/hud.js`，玩家设置在 `js/settings.js`，样式在 `css/style.css`。

## 界面流程

```
加载页 boot ──→ 首页 home（不全屏）
                 ├─ 作战：选模式 → 看地图、调获胜条件、选装备（主副武器、对手形象）→ [进入战斗]
                 └─ 设置：灵敏度、视野、准星颜色、自动全屏、音量、改键
                       │ 点"进入战斗"：进入全屏 + 开局
                       ▼
              作战简报 brief（全屏）：地图、目标、按键提示 → 点任意处锁定鼠标
                       ▼
                 战斗（只有 HUD）
          Esc ↙                 ↘ 对决分出胜负 / 波次阵亡
   暂停 pause                     结算 result
   继续 / 设置 / 重新开始 / 返回首页     再来一局 / 返回首页
```

- 同一时间只显示一个 `.screen`（`#scr-boot`、`#scr-home`、`#scr-brief`、`#scr-pause`、`#scr-result`），
  都在 `#overlay` 里。`ui.show(name)` 切换，`ui.show(null)` 全部隐藏（战斗中）。
  `body[data-screen]` 记录当前界面，CSS 用它在首页、加载、简报时隐藏 HUD。
- **全屏只在战斗里**：首页不全屏；点"进入战斗"时请求全屏（设置里可关），回首页时退出全屏。
  按 Esc 浏览器会退出鼠标锁定（可能连带退出全屏），出现暂停菜单，点"继续"重新锁定并全屏。
- 首页背景是真实的 3D 场景（训练场状态，没有 NPC），镜头停在 `config.ui.menuCamera`；首页和简报不画手里的枪。
- 暂停里的"设置"和首页的设置页是同一块 DOM（`#settings`），打开时搬进暂停面板，关闭时搬回去。

## 和 main.js 的分工

`ui.js` 只管界面，动作通过回调交给 `main.js`：`onDeploy(mode)`、`onStart`、`onResume`、`onRestart`、`onQuit`。
全屏和指针锁定必须在点击事件里同步发起，这些回调里不能 `await`。

结算的顺序是 **先 `ui.showResult` 再 `exitPointerLock`**：`input.onLockChange(false)` 看到已经有界面了就什么都不做，
否则会把解锁当成暂停。新增"打完自动弹出的界面"也照这个顺序。

## 玩家设置

`js/settings.js` 加载时从 `localStorage`（键 `direct-strike.settings.v1`）读出设置并写回 `Game.Config`
（`view.mouseSensitivity`、`view.fov`、`audio.volume`、`view.fullscreen`、`duel.winScore`），游戏其他代码照常读 `Game.Config`。
默认值就是 `config.js` 里的值，可调范围在 `config.ui`。需要立即生效的（视野、音量、准星颜色）用 `Game.Settings.onChange` 监听。
改键另存在 `fps.keys.v1`（见 `input.js`）。
装备选择也存在这里（`rifle` / `pistol` / `npc`，值是 `config.loadout` 的 key），写回 `weapons.rifle` / `weapons.pistol` / `character.model`，见 `architecture.md` 的"可选装备"。
首页的装备行由 `ui.js` 的 `pickHtml` 按 `config.loadout` 生成，加一项不用改界面代码；"对手"一行只在有 NPC 的模式显示。

加一项设置：`settings.js` 的 `defaults` 和 `valid` 各加一行，`apply` 里写回 Config；`index.html` 的 `#settings` 里加控件；`ui.js` 的 `buildSettings` 里绑定。

## 战斗 HUD 的几个约定

- 换弹不在准星旁边写字：右下角弹药数变暗，下面一条橙色细线走满（`hud.setReload`），动作本身看手上。
- 钱在左下生命值上方，拿到赏金旁边飘一行 `+$300 爆头`；只在对决和波次显示。
- 在出生点（购买区）准星下方有一行提示，按 B 打开左侧的购买面板。面板不解锁鼠标，按槽位键买，走出购买区自动关。

## 视觉规范

- 军事写实：深橄榄黑底、骨白文字、logo 橙（`--accent: #ff5f00`）做唯一强调色；我方绿 `--me`、敌方红 `--enemy`。
  颜色都是 `style.css` 开头的 CSS 变量，不要在别处写死新颜色。
- 字体不走网络：标题用窄体（`--font-d`，Bahnschrift / DIN / Roboto Condensed），小标签用等宽（`--font-m`），正文用系统黑体（`--font-t`）。
- 主面板四角有橙色折角（`.ticks`），按钮直角、主按钮切掉右下角。
- 首页按 1280×720 和 1920×1080 调过；窄于 1080px 改单列可滚动。
- logo 在深色底上用 `assets/brand/logo-dark.png`（由用户原图去白底、黑色改骨白生成）。

## 地图预览图

首页地图卡片读 `assets/ui/maps/<地图名>.webp`（640×360），是游戏里的俯瞰截图：
把摄像机放到地图一角高处（yard 用的是位置 `(-16, 9, 22)` 看向 `(4, 0, -6)`），隐藏界面和枪模截图，
再用 `tools/img.sh webp` 压缩。图缺失时卡片只显示地图名，不会报错（但 `/verify` 会报 404）。

## 验证

`node tools/verify.mjs --modes menu,settings,brief,pause,result` 截各个界面；完整流程（点按钮、真实指针锁定）
可以照 `docs/testing.md` 写脚本，headless Chromium 里 `requestPointerLock` 是能成功的。
