# 代码架构

每个文件做什么见 `README.md` 的目录表，本文讲它们怎么拼在一起，以及改代码前要知道的坑。

## 加载方式

- 没有构建步骤，也没有模块系统。`index.html` 按顺序加载 `vendor/` 和 `js/` 下的脚本，每个文件往全局 `Game` 上挂一个东西
  （`Game.Config`、`Game.Player`、`Game.Weapon`……）。**后加载的可以用先加载的，反过来不行**，新文件要插到正确位置。
- 顺序：`config → physics → audio → input → textures → effects → truck → world → targets → ragdoll → character → player → gunmodel → grenades → weapon → bots → hud → main`。
- `main.js` 先异步加载 `maps/<config.map>.json`、AK 枪模（`GunModel.loadAK`）和第一人称手臂（`GunModel.loadArms`），都加载完才调用 `startGame` 创建所有对象；
  任何一个失败，错误显示在开始界面上。NPC 模型 `soldier.glb` 也是异步加载，加载完才能进对战模式。
- 浏览器控制台里的 `window.game` 能拿到所有对象（`game.player`、`game.weapon`、`game.bots`……），调试和测试脚本都靠它。

## 对象关系

`main.js` 创建所有对象并把依赖通过构造参数传进去，对象之间不互相 new：

```
world（场景、碰撞盒、出生点）  targets（靶子）  input  audio  hud  effects（特效）
player（摄像机、移动、生命）
grenades（飞出去的投掷物）  ← 需要 world / player / bots / effects
weapon（手里的武器：枪和投掷动作）  ← 开枪打 shootables，丢雷交给 grenades
bots.Manager（NPC 和对决/波次规则）  ← 每个 NPC = bots.js 的大脑 + character.js 的身体
```

- 状态变化用回调通知 `main.js`：`player.onDamage / onDeath`、`bots.onChange / onWaveCleared / onDuelEnd`、`input.onLockChange`。
- `shootables` 是开枪射线能打到的网格数组，`main.js` 按模式和 NPC 生死原地更新（`refreshShootables`）。
- 三种模式（range / duel / waves）由 `main.js` 的 `startMode` 切换。

## 游戏循环

`main.js` 的 `frame()` 每帧：

1. `dt` 最长限制 0.05 秒（切出窗口回来不会穿墙）。
2. 指针锁定时才更新玩法：`player → weapon → targets → bots → grenades`。玩家死了只更新倒地镜头和重生倒计时。
3. 不管锁没锁都更新 `world`（云、动画）和 `hud`，然后 `input.endFrame()` 清掉本帧的"刚按下"。
4. 渲染两次：先画世界场景，清深度，再画枪模场景。

测试脚本会绕开 `requestAnimationFrame`，自己按固定步长调用这些 `update`，见 `testing.md`。

## 两套场景

- **世界场景**：地图、NPC、特效、投掷物，用 `camera`。
- **枪模场景**：手里的枪、手、手雷，用 `weaponCamera`（单独的 FOV 和近平面），画在最上层，贴墙时枪不会插进墙里。
  它有自己的半球光、太阳和环境贴图，和世界场景的光照无关。

## 各系统要点

- **碰撞**（`physics.js`）：只有轴对齐方块。玩家和 NPC 都是"分轴移动 + 自动上台阶"，台阶上限 `player.stepHeight`。
- **射击**（`weapon.js`）：射线检测，按命中网格的部位（头/身体/腿）算伤害；散布、后坐力、换弹都在这里。
  投掷物的动作也在这里：`throwState` 为 `null → 'hold'（按住，引信已经在走）→ 'swing'（出手动画）`，出手后交给 `grenades.js`。
- **投掷物**（`grenades.js`）：方块反弹物理、爆炸伤害（射线判断有无掩体）、闪光按距离和朝向致盲、烟团挡 NPC 视线（`blocksSight`），飞行轨迹是 `Trail` 类。
- **NPC**：`bots.js` 是状态机 AI（巡逻 → 发现 → 交火），`character.js` 负责模型、动画、持枪姿势、判定盒和死亡；
  死亡时 `character.die(hit)` 创建 `ragdoll.js` 的布娃娃。
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
- **枪模在第一帧之前就要摆好位置**，否则开始界面背后会看到一把巨大的枪：`weapon.js` 的 `buildModels` 里按 `basePos / baseRot` 初始化。
- **死亡的 NPC 还要继续更新**（布娃娃、血泊、尸体下沉），包括对决结束后的 `phase === 'over'`。
- **受击闪红**：NPC 死亡前要把 `model.flash` 清零，否则尸体会一直发红。
- **`window.game` 在开局前是那个 `<canvas id="game">`**（浏览器会把带 id 的元素挂到 `window` 上）。
  测试脚本判断游戏是否就绪要看 `window.game.startMode`，不能只看 `window.game`，`tools/lib/game-page.mjs` 就是这么等的。
- **glb 枪模换了要重新对手的位置。** 手臂是 `arm.glb`（蒙皮模型），握把、护木的位置写在 `weapon.js` 的 `buildModels` 里（`arms.hand(...)`）；
  换模型后用侧视截图（把枪转 90 度）检查手有没有握在握把和护木上。
- **手臂每帧要 `solve()`。** `gunmodel.js` 的 `buildArms` 按握持坐标系摆手腕骨骼、沿 `armDir` 摆小臂和上臂，手指只在第一次 solve 时自动弯到贴住握把。
  `weapon.js` 在 `animate` 末尾对当前武器调一次；在别处移动了枪或手的目标点，要在渲染前再调一次，否则手臂慢一帧。
  蒙皮网格关了视锥剔除（静止姿势的包围球不准）。
- **同色集装箱共用贴图**，只显示第一个的编号，见 `maps.md`。
