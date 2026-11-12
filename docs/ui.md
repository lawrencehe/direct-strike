# 界面（UI / UE）

游戏按"产品"组织：先到首页选模式和设置，进入战斗才全屏。界面全是 HTML + CSS 叠在画布上面，
没有框架；切换逻辑在 `js/ui.js`，战斗中的 HUD 在 `js/hud.js`，玩家设置在 `js/settings.js`，样式在 `css/style.css`。

## 界面流程

```
加载页 boot ──→ 首页 home（不全屏）
                 ├─ 作战：选模式 → 看地图、选天气 / 时段、调获胜条件、选装备（主副武器、对手形象）→ [进入战斗]
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
  Chrome / Edge 全屏时接管了键盘：短按 Esc 只解锁鼠标出暂停菜单，全屏保留，长按 Esc 才退全屏。
  其他浏览器按 Esc 会同时退出锁定和全屏。点"继续"重新锁定（不在全屏就顺带全屏）。
  窗口失去焦点（Mac 误触 ⌘+空格 等）也会自动暂停。细节见 `architecture.md` 的"已知的坑"。
  **负责人定的规则**（#15）：网页拦不住系统快捷键，只要识别到系统按键误触，就暂停游戏、弹出菜单，玩家点"继续"回来。
  ⌘+空格、⌘+Tab 是 macOS 在浏览器之前处理的，Keyboard Lock 也拿不到；要彻底不弹只能在"系统设置 → 键盘 → 键盘快捷键 → 聚焦"里关掉或改掉。
  **真机现状**（#26，Mac + Chrome）：⌘+空格**没有**自动暂停，但会干扰游戏按键，和上面的规则不符，见 #52。Safari / Firefox 还没试。
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
天气 / 时段也存在这里（`weather`，值是 `config.weather.presets` 的 key，#77）：首页地图卡片下面一排按钮（`#weather-pick`），按预设生成，
点了立刻换，首页背后的 3D 场景当场变，不用重开；第一次切到某个天气要先下载它的天空贴图（几十 KB），下载完才换。
天气和装备一样不在设置页里，"恢复默认设置"不动它。

加一项设置：`settings.js` 的 `defaults` 和 `valid` 各加一行，`apply` 里写回 Config；`index.html` 的 `#settings` 里加控件；`ui.js` 的 `buildSettings` 里绑定。

## 开发者

- 设置页最下面的"开发者"一栏（`#set-dev`，占满两列），没解锁只有密码框；解锁后是开关、统计、帧时间图和上传按钮。逻辑全在 `js/devlog.js`。
- 快捷键 ⇧⌘= / Ctrl+Shift+=（`config.dev.panelKey`，#4）：首页切到设置并滚到"开发者"一栏；战斗中先 `exitPointerLock`，`main.js` 的 `onLockChange` 显示暂停页后再打开暂停里的设置。
  按 `e.code === 'Equal'` 判断（按住 Shift 时 `e.key` 是 `+`，跟键盘布局有关），Meta 或 Ctrl 都认，小键盘 `+` 也认；`preventDefault` 拦掉浏览器的放大页面；正在改键时不响应。
  快捷键只打开面板，不直接切换开关，避免误触。全屏 + 锁鼠标时真机上能用（#12）。
- 开发者模式打开时，暂停菜单多一个"开发者数据"按钮，打开暂停里的设置并滚到这一栏；战斗中左上角统计框下面有帧率浮层（`#dev-hud`）。
- 说明见 `devmode.md`。

## 战斗 HUD 的几个约定

- 换弹不在准星旁边写字：右下角弹药数变暗，下面一条橙色细线走满（`hud.setReload`），动作本身看手上（#1）。
  没在准星周围画进度圆环：准星附近要干净，看动作就够了，细线只告诉你还要多久。
- 中弹（#60）：除了原来的边缘闪红和指向攻击者的红弧，四角再溅几团暗红血迹（`#damage-blood`，按伤害浓淡，`hitReaction.bloodFade` 秒淡完，每次随机翻转）；
  血条掉的那一截先亮橙红留 `trailDelay` 秒再按 `trailSpeed` 缩回去（`#health-trail` 垫在血条下面），看得出这一下掉了多少；血量数字闪红、抖一下。
  镜头被打偏和硬直在 `player.js`，不在 HUD。数值都在 `config.hitReaction`。
- 钱在左下生命值上方，拿到赏金旁边飘一行 `+$500 爆头`；只在对决和波次显示。
- 弹药数是"枪里 / 备弹"，训练场备弹无限显示 `/ ∞`。一把枪一发都没了（枪里和备弹都空），武器栏那一格变暗；空枪扣扳机"咔"一声（#7）。
- 购买（#33）：尽量不用文字提示，用图标、声音、动画回应，**每个操作都要有回应**（负责人定的）。
  - 在出生点（购买区）左侧中间滑出一个购物车图标（0.2 秒）：买得起任何一样亮橙色、轻轻呼吸，什么都买不起（没钱或都带满）变灰、不呼吸，不开面板也知道值不值得按 B。
    离开购买区、阵亡收起。放在左侧中间是因为按 B 后面板就弹在这里，眼睛不用找第二个地方；放准星旁边会挡视线，没选。
  - 右下角小键帽显示当前绑定的购买键（改键后跟着变）。键名只告诉按哪个键，不算"文字提示"（CS 也这样）。图标是内嵌 SVG，没有新资源。
  - 按 B 打开左侧的购买面板（图标收起，面板占了这个位置）。面板不解锁鼠标，按槽位键买（1 / 2 买 AK / 手枪一个弹匣的子弹，3 / 4 / 5 买投掷物，#7），买成功立刻关面板（马上能再按一次切过去），
    买不了不关（能看到哪一项是灰的、为什么买不了）；走出购买区自动关。打开 / 关闭面板本身就是回应，不另加声音。
  - 买成功：`purchase()` 音效（比赏金的 `cash()` 响），右下武器栏那一格橙色闪亮、放大回弹（`economy.boughtPulse` 秒），数量加一；钱数白闪并飘红色的 `-$价格`（只有数字）。
    武器栏中途重画（切枪等）时用负的 `animation-delay` 接着播，不会闪两次。
  - 买不了（钱不够 / 带满）：`denied()` 音效（低沉两下，和买到了一听就分得开；不用空仓的"咔"，那和开枪没子弹分不出来），面板里那一行红一下、左右晃。
  - 不在购买区按 B：灰购物车从左边探出来晃一下，加 `denied()`，意思是"这里买不了"。
  - 图标大小、位置、呼吸动画和买完关面板的手感等真机试（#39）；两个音效和买成功动画是否明显又不吵等真机试（#41）。

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
