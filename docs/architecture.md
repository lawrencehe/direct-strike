# 代码架构

每个文件做什么见 `README.md` 的目录表，本文讲它们怎么拼在一起，以及改代码前要知道的坑。

## 加载方式

- 没有构建步骤，也没有模块系统。`index.html` 按顺序加载 `vendor/` 和 `js/` 下的脚本，每个文件往全局 `Game` 上挂一个东西
  （`Game.Config`、`Game.Player`、`Game.Weapon`……）。**后加载的可以用先加载的，反过来不行**，新文件要插到正确位置。
- 顺序：`config → settings → physics → audio → input → textures → effects → truck → world → targets → ragdoll → character → player → gunmodel → grenades → weapon → bots → hud → economy → ui → devlog → main`。
  `settings` 紧跟 `config`：它把玩家存在浏览器里的设置写回 `Game.Config`，后面的文件读到的就是玩家的值。
- `main.js` 先异步加载 `maps/<config.map>.json`、首页选中的主副武器枪模（`GunModel.loadGun`）和第一人称手臂（`GunModel.loadArms`），都加载完才调用 `startGame` 创建所有对象；
  加载页显示进度，任何一个失败，错误显示在加载页上。NPC 模型也是异步加载，加载完首页才允许进对战模式。
- 浏览器控制台里的 `window.game` 能拿到所有对象（`game.player`、`game.weapon`、`game.bots`……），调试和测试脚本都靠它。

## 可选装备（换枪、换 NPC 形象）

- 可选项在 `config.js` 的 `loadout`（`rifle` / `pistol` / `npc` 三组，key 是存档名）。首页"装备"里点选，存进 `Game.Settings`，
  `settings.js` 把选中的那项写回 `Game.Config`：`weapons.rifle` / `weapons.pistol` = 默认数值 + 这把枪的覆盖项，`character.model` = NPC 模型路径。
  所以其他代码照常读 `Game.Config.weapons.rifle`，不用知道选的是哪把。
- 模型按需下载：开局只加载选中的枪；首页换枪时 `ui.pickLoadout` → `main.js` 的 `ui.onLoadout` → `GunModel.loadGun` 下载（同一文件只下一次），
  好了再 `weapon.buildGun(slot)` 重建这一格的枪模和手臂。下载期间"进入战斗"不可点；失败就提示并换回原来的。
- NPC 形象：`Character.load()` 按 `character.model` 加载（有缓存），之后新生成的 NPC 用它。NPC 每局开始时重建，所以换形象下一局生效。
- NPC 手里的枪仍是方块步枪和代码拼的手枪，不跟着玩家的选择换外观；数值读的是同一个 `Game.Config.weapons`。
- 每把枪在画面里的摆法、手的握持位置在 `weapon.js` 末尾的 `Weapon.VIEW`，按 `loadout` 的 key 写。

## 对象关系

`main.js` 创建所有对象并把依赖通过构造参数传进去，对象之间不互相 new：

```
world（场景、碰撞盒、出生点）  targets（靶子）  input  audio  hud  effects（特效）
ui（界面流程，动作通过 onDeploy / onStart / onResume / onRestart / onQuit 回调交给 main.js）
player（摄像机、移动、生命）
grenades（飞出去的投掷物）  ← 需要 world / player / bots / effects
weapon（手里的武器：枪和投掷动作）  ← 开枪打 shootables，丢雷交给 grenades
bots.Manager（NPC 和对决/波次规则）  ← 每个 NPC = bots.js 的大脑 + character.js 的身体
```

- 状态变化用回调通知 `main.js`：`player.onDamage / onDeath`、`bots.onChange / onWaveCleared / onDuelEnd`、`input.onLockChange`。
- `shootables` 是开枪射线能打到的网格数组，`main.js` 按模式和 NPC 生死原地更新（`refreshShootables`）。
- 三种模式（range / duel / waves）由 `main.js` 的 `startMode` 切换。首页背后也是 `range`（没有 NPC），镜头停在 `config.ui.menuCamera`。
- 界面流程（首页 → 简报 → 战斗 → 暂停 / 结算）见 `ui.md`。

## 游戏循环

`main.js` 的 `frame()` 每帧：

1. `dt` 最长限制 0.05 秒（切出窗口回来不会穿墙）。
2. 指针锁定时才更新玩法：`player → economy → weapon → targets → bots → grenades`。玩家死了只更新倒地镜头和重生倒计时。
   `economy` 必须在 `weapon` 前面：购买面板开着时它用 `input.consumeAction` 吃掉投掷物的槽位键，武器就不会切过去。
3. 不管锁没锁都更新 `world`（云、动画）和 `hud`，然后 `input.endFrame()` 清掉本帧的"刚按下"。
4. 渲染两次：先画世界场景，清深度，再画枪模场景（首页和简报不画枪模）。
5. 开发者模式打开时：`endFrame` 之前 `DevLog.sample(rawDt, dt)` 录这一帧（要读"刚按下"），渲染之后 `DevLog.afterRender` 补上这一帧的 CPU 时间、拷一帧画面。
   关着时只多一个判断。见 `devmode.md`。

测试脚本会绕开 `requestAnimationFrame`，自己按固定步长调用这些 `update`，见 `testing.md`。

## 两套场景

- **世界场景**：地图、NPC、特效、投掷物，用 `camera`。
- **枪模场景**：手里的枪、手、手雷，用 `weaponCamera`（单独的 FOV 和近平面），画在最上层，贴墙时枪不会插进墙里。
  它有自己的半球光、太阳和环境贴图，和世界场景的光照无关。

## 各系统要点

- **碰撞**（`physics.js`）：只有轴对齐方块。玩家和 NPC 都是"分轴移动 + 自动上台阶"，台阶上限 `player.stepHeight`。
- **射击**（`weapon.js`）：射线检测，按命中网格的部位（头/身体/腿）算伤害；散布、后坐力、换弹都在这里。
  换弹：打空且后坐做完（`cooldown <= 0`）自动开始，切枪 `cancelReload`。动作是 `Weapon.RELOAD` 里按换弹进度写的时间段，
  `Weapon.reloadPose(p, empty)` 换算成枪身倾斜、弹匣、左手、机柄的量；音效按 `cues` 到点才响，被打断就不响（不要用 `audio` 提前排好）。
  投掷物的动作也在这里：`throwState` 为 `null → 'hold'（拔了环、攥着握片，引信不走）→ 'swing'（出手动画）`，
  出手瞬间握片弹开，`grenades.throw` 带满引信飞出去。手上不会炸。
- **经济**（`economy.js`）：`bots.onPlayerKill(hit)` 报告玩家的击杀，`main.js` 按最后一击（`hit.explosion` / `hit.part`）换算成赏金类型交给 `economy.award`。
  购买区是 `player.spawn` 周围 `economy.buyRadius` 米，地上的环一开始就放进场景、不用时透明度 0（避免中途编译材质）。
  投掷物数量：`weapon.refill(false)` 回到开局数量（重生、新一局），`refill(true)` 不收走多买的（波次之间）。
- **投掷物**（`grenades.js`）：方块反弹物理、爆炸伤害（射线判断有无掩体）、闪光按距离和朝向致盲、烟团挡 NPC 视线（`blocksSight`），飞行轨迹是 `Trail` 类。
- **NPC**：`bots.js` 是状态机 AI（巡逻 → 发现 → 交火），`character.js` 负责模型、动画、持枪姿势、判定盒和死亡；
  死亡时 `character.die(hit)` 创建 `ragdoll.js` 的布娃娃。
  NPC 装备和玩家一样：`model.guns` 里有 AK 和手枪两把（`model.rifle` 永远指手上那把，瞄准、枪口、IK、布娃娃掉枪都用它），
  弹药、换弹、切枪时间、各部位伤害都读 `config.weapons`。玩家只有一个碰撞盒，NPC 打中玩家时按命中高度分头 / 身 / 腿。
  NPC 丢雷走 `grenades.launch(kind, pos, vel, fuse, owner)`；`owner` 是丢雷的 NPC（玩家丢的是 `null`），
  决定"炸到自己乘 selfMul"、要不要显示命中提示、算不算玩家的击杀（`hit.byBot`）。
- **布娃娃**（`ragdoll.js`）：Verlet 质点 + 距离约束，和地图方块碰撞，每帧把质点位置换算回 Mixamo 骨骼的旋转。
  不同死法（爆头、炸飞、打腿、打身体的三种倒法）只是初始冲量不同，参数在 `config.ragdoll`。
- **血**（`effects.js`）：血雾是 Sprite；血滴共用一个 `THREE.Points` 环形缓冲；地上的血迹和血泊是逐渐变大的平面。
- **音效**（`audio.js`）：Web Audio 实时合成，没有音频文件。

## 已知的坑

- **枪模场景的光很亮。** 无贴图的非金属件亮度大约被放大 10 倍，所以 `gunmodel.js` 里的颜色看起来都很暗：
  想要屏幕上的某个颜色，把线性值除以 10 再填。文件里有注释。
- **加灯会让所有材质重新编译，造成卡顿。** 所以爆炸用的 PointLight（`grenades.js`）和枪口火光（`weapon.js`）一开始就创建好，平时亮度为 0。
  新增灯光也照这样做，不要在游戏中途 `scene.add` 新的灯。
- **第一次出现的材质会卡一下**（第一次击杀、第一次丢雷）。`effects.precompile` 和 `grenades.precompile` 在开局前预编译，新增特效材质要加进去。
- **枪模在第一帧之前就要摆好位置**，否则界面背后会看到一把巨大的枪：`weapon.js` 的 `buildModels` 里按 `basePos / baseRot` 初始化。
- **死亡的 NPC 还要继续更新**（布娃娃、血泊、尸体下沉），包括对决结束后的 `phase === 'over'`。
- **受击闪红**：NPC 死亡前要把 `model.flash` 清零，否则尸体会一直发红。
- **全屏和指针锁定都要用户手势。** `input.lock(fullscreen)` 在按钮的 click 里同步发出两个请求，中间不能 `await`，否则第二个会被拒。
  全屏挂在 `document.documentElement` 上（不是 canvas），否则 HUD 和菜单不在全屏里。按 Esc 会同时退出全屏和锁定，点"继续"再进。
  首页不全屏："进入战斗"时才请求全屏，回首页时退出。
- **自动弹出的界面要先显示再解锁鼠标。** 结算是 `ui.showResult` 之后才 `exitPointerLock`，`onLockChange(false)` 看到已经有界面就不管；
  顺序反了会先闪一下暂停菜单。
- **`window.game` 在开局前是那个 `<canvas id="game">`**（浏览器会把带 id 的元素挂到 `window` 上）。
  测试脚本判断游戏是否就绪要看 `window.game.startMode`，不能只看 `window.game`，`tools/lib/game-page.mjs` 就是这么等的。
- **换弹动作里枪身回正要和左手回护木同步。** `Weapon.RELOAD` 里 `tilt` 的下降段和 `grab` 的下降段要对齐；
  枪还侧倾着而左手已经回到护木，手臂 IK 会把第一人称的袖子拉得很长。改了时间段要按进度截图看（`tools/tests/reload-nade-economy.mjs`）。
- **换弹、投掷的音效不要提前排。** `audio` 是 Web Audio，排好的声音没法取消；中途切枪尾音照样响。按动作进度到点再调（`Weapon.RELOAD.*.cues`）。
- **测试脚本的 tick 要调 `economy.update`，而且在 `weapon.update` 之前**，和 `main.js` 的帧循环一致，否则购买面板的按键会被武器当成切枪。
- **glb 枪模换了要重新对手的位置。** 手臂是 `arm.glb`（蒙皮模型），握把、护木的位置写在 `weapon.js` 末尾的 `Weapon.VIEW` 里（`right` / `left`）；
  换模型后用侧视截图（把枪转 90 度）检查手有没有握在握把和护木上。
- **手臂每帧要 `solve()`。** `gunmodel.js` 的 `buildArms` 按握持坐标系摆手腕骨骼、沿 `armDir` 摆小臂和上臂，手指只在第一次 solve 时自动弯到贴住握把。
  `weapon.js` 在 `animate` 末尾对当前武器调一次；在别处移动了枪或手的目标点，要在渲染前再调一次，否则手臂慢一帧。
  蒙皮网格关了视锥剔除（静止姿势的包围球不准）。
- **`DevLog.sample` 每帧不能新建对象**（包括闭包返回小数、`Set.has`、three.js 的 getter），否则开发者模式自己就会引起垃圾回收卡顿。
  改了它跑 `tools/tests/devlog.mjs`，里面用采样堆分析器检查零分配。
- **录画面要在渲染之后立刻拷画布。** WebGL 画布没开 `preserveDrawingBuffer`，交给屏幕后就清空了，晚一步拷到的是黑的。
- **同色集装箱共用贴图**，只显示第一个的编号，见 `maps.md`。
- **下载来的模型常是 HASHED / BLEND 材质。** M4、SG 的原始材质都是 HASHED（半透明抖动），在游戏里会透；加工脚本里统一改 `OPAQUE`。
  原始单位也不统一（SG 是厘米），加工脚本按"全长"缩放，见 `assets-src/models/gun/m4.py`、`sg.py`。
- **换 NPC 模型先看朝向和材质。** 下载来的模型可能面朝反方向（左手在 +X），`rig.sh add-anim` 会报"静止姿态相差 ~180°"，
  先转 180° 再移植动画；Sketchfab 类导出常把所有材质设成 `BLEND`、法线强度 0、透明度放在单独贴图里，要改成 `MASK`。
  例子见 `assets-src/models/human/ukrainian-soldier/build.sh`。
