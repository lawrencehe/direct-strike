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
- NPC 的枪和玩家用同一套 `loadout`，但不跟着玩家的选择：每个 NPC 出生时 `bots.Manager.pickGuns` 每格随机挑一把（#54），
  数值用 `Settings.gunConfig(slot, key)`（默认数值 + 那把枪的覆盖项），存在 `bot.gun`，不读 `Game.Config.weapons`（那是玩家选的）。
  玩家没选的枪在首页出来后由 `main.js` 后台下载，首次加载体积不变；`pickGuns` 只从已经下载好的里挑（`GunModel.isGunLoaded`），都没好就用玩家选的。
  NPC 手上的 glb 枪模克隆自 `GunModel.loadedGun(path)`，网格材质共用，标 `userData.shared` 不释放；
  右手 / 左手 IK 的目标直接用第一人称的握持点 `Weapon.VIEW[key].right.pos` / `left.pos`（左手往下挪 `GUARD_SHIFT` 托在护木下），
  枪的位置按"握把落在方块枪握把的同一点"摆，所以加新枪只要 `Weapon.VIEW` 写好，NPC 不用另调。glb 没下载好时退回方块步枪 / 默认手枪。
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
  地图的 PBR 贴图、环境光 HDRI 和道具模型（地图文件的 `models`）在 `World.loadMap` 里随地图文件一起下载完，`World.build` 再同步建场景（#50）。
  有模型的物体用模型显示，碰撞和子弹判定用看不见的同尺寸方块（`addProxy`），细节见 `maps.md` 的"道具模型"。
  HDRI 只挂在 build 时场景里已有的地图材质上（`envMap`），后加进来的 NPC、特效不受影响。
- **天气 / 时段**（#77）：天空、雾、半球光、平行光、曝光、环境光、地面湿度、水洼都按 `config.weather.presets` 的预设设，
  `world.setWeather(key)` 当场改这些对象（不重建场景），曝光和枪模场景的灯由 `main.js` 的 `world.onWeather` 回调改。
  - 晴天用程序画的天空球、云和太阳（`textures.js`），走色调映射；其他天气的天空球换成 `assets/weather/<目录>/sky.webp`，
    这张图已经调好色，材质 `toneMapped: false`，所见即所得，程序画的云和太阳整组藏起来。
  - 环境光：晴天用地图的 `environment` HDRI；阴雨傍晚用天空贴图本身（`env: 'sky'`）。原 HDRI 的地平线有一圈亮光，
    雨天光滑的水洼映出来是一块块白斑，换成调过色的天空后反射和看到的天一致，也省了 1.2 MB。
  - 湿地面：沥青、土、水泥、水泥地块、碎块的粗糙度和颜色按 `wet` 插值（`weather.wetGround`），原值在 build 时记下，切回晴天能还原。
    水洼的粗糙度、不透明度、反光按 `weather.puddle`；`extraPuddles` 是固定种子撒在场地里的水洼，按最多的预设一次建好，用几个显示几个。
  - 素材按需下载：开局只下当前天气的（`loadMap` 里和地图素材一起），切到别的天气时再下，按目录缓存；下载失败退回程序画的天空和地图的 HDRI。
    下载期间又换了别的天气，前一次下完也不会覆盖。
  - 雨天的水洼只有天空反射，映不出周围的集装箱和人（平面实时反射太费，留到第 2 步再看真机帧率）。
- **枪模场景**：手里的枪、手、手雷，用 `weaponCamera`（单独的 FOV 和近平面），画在最上层，贴墙时枪不会插进墙里。
  它有自己的半球光、太阳和环境贴图，和世界场景的光照无关。

## 各系统要点

- **碰撞**（`physics.js`）：只有轴对齐方块。玩家和 NPC 都是"分轴移动 + 自动上台阶"，台阶上限 `player.stepHeight`。
- **射击**（`weapon.js`）：射线检测，按命中网格的部位（头/身体/腿）算伤害；散布、后坐力、换弹都在这里。
  换弹（#1）：打空且后坐做完（`cooldown <= 0`）自动开始，不用再扣扳机；切枪 `cancelReload`（子弹数不变），切回空枪、掏好后自动再换。
  动作是 `Weapon.RELOAD` 里按换弹进度写的时间段（侧倾抬枪 → 左手抓弹匣 → 抽出 → 左手出画面拿新弹匣 → 插回拍实 → 回位，
  空枪最后多一段拉机柄 / 套筒上膛），`Weapon.reloadPose(p, empty)` 换算成枪身倾斜、弹匣、左手、机柄的量；
  音效按 `cues` 到点才响，被打断就不响（不要用 `audio` 提前排好）。
  空枪和非空枪**总时长一样**（都是 `reloadTime`），空枪把前面几段压缩，腾出拉机柄那段：NPC 用同一个 `reloadTime`，给空枪加时间就不对等了。
  上膛时右手没有真的去拉机柄，只有机柄和枪身在动（手臂 IK 只能握在固定点上，#21）。
  投掷物的动作也在这里：`throwState` 为 `null → 'hold'（拔了环、攥着握片，引信不走）→ 'swing'（出手动画）`，
  出手瞬间握片弹开（"叮"一声），`grenades.throw` 带**满的** `fuse` 飞出去，飞出去的雷隐藏拉环和握片（`gunmodel.js` 里握片叫 `spoon`）。
  手上不会炸；人被打死时手一松，雷掉在脚下，从这时开始算满的引信。攥着雷不能切武器，只能丢出去，没有"把环插回去"。
  没有"捏雷"（先松握片再丢让它空爆，#22）。闪光、烟雾同样两道保险。
- **经济**（`economy.js`，#1，只在对决和波次里有）：`bots.onPlayerKill(hit)` 报告玩家的击杀，`main.js` 按最后一击换算成赏金类型交给 `economy.award`：
  `hit.explosion` → 手雷，`hit.part === 'head'` → 爆头，其余 → 普通（手枪、步枪不区分）；NPC 被自己的雷炸死（`hit.byBot`）不给钱。
  钱有上限 `economy.maxMoney`（存款上限，#7），满了再杀不涨。钱跟着整局走，死了不清零；开新一局回到 `startMoney`，
  重生时 `economy.onRespawn` 把不足 `startMoney` 的补上（#7）。
  子弹（#7）：每把枪 `gun.ammo`（枪里）+ `gun.reserve`（备弹），换弹从备弹里扣、备弹不够一个弹匣就全装上；没备弹 `startReload` 直接不换，
  打空不再自动换弹，扣扳机响 `audio.empty()`。训练场 `weapon.unlimitedAmmo` 备弹无限（HUD 显示 ∞）。
  买子弹进备弹（`weapon.addAmmo`），上限 `weapons.maxMags` 个弹匣按发数算（`ammoRoom`），面板里 1 / 2 键买。
  NPC 也有 `ammo` / `reserve`，开局和玩家一样，没有经济买不了；两把都空了 `outOfAmmo()`，交战时背离玩家跑开（#7）。
  购买区是这条命的出生点 `player.spawn` 周围 `economy.buyRadius` 米（对决里每次重生的点不一样，环跟着走），地上的环一开始就放进场景、不用时透明度 0（避免中途编译材质）。
  购买面板不解锁鼠标（解锁会触发暂停），开着照样能走能看能开枪；走出购买区、阵亡、再按购买键都会关。
  按槽位键买：买成功关面板，这一下的槽位键被 `input.consumeAction` 吃掉（不切武器），再按一次才切过去；买不了（钱不够 / 带满）面板不关；
  同一帧按了几个槽位键都吃掉，只买第一个能买的（#33）。
  投掷物数量：`weapon.refill(false)` 回到开局数量（重生、新一局，多买的随人一起没了），`refill(true)` 不收走多买的（波次之间）。
- **投掷物**（`grenades.js`）：方块反弹物理、爆炸伤害、`simulate` 用同样的物理预演落点（NPC 挑丢法用）、闪光按距离和朝向致盲、烟团挡 NPC 视线（`blocksSight`），飞行轨迹是 `Trail` 类。
  - 引信出手就开始算，飞在空中到时间也炸（`grenades.js` 每帧扣 `fuse`）。手雷 2 秒（#5）：平抛十几米约 1 秒落地，3 秒时雷还要在地上躺 2 秒，对方早跑开了；
    NPC 高抛 20 米飞将近 2 秒，2 秒正好落地前后炸（CS 约 1.6 秒）。NPC 的预演直接读 `grenades.frag.fuse`，改时长不用动 AI。
  - 掩体（`exposure`，#5）：从爆点朝头（身高 −0.12）、胸（身高 ×0.6）、腿（0.3 米）各打一条视线，伤害 × 露出比例，距离取最近的露出部位，玩家和 NPC 一样。
    全挡住不掉血，只露头掉 1/3。原来只看爆点到眼睛一条线，躲在墙角后就一点不掉血。闪光弹致盲仍只看眼睛一条线（#25）。
  - 雷不撞丢雷者自己（`collisionBoxes(owner)`），飞行和预演都一样：NPC 出手点离身体中心只有 0.38 米，不排除的话某些朝向雷会卡在自己手上。
- **NPC**：`bots.js` 是状态机 AI（巡逻 → 发现 → 交火），`character.js` 负责模型、动画、持枪姿势、判定盒和死亡；
  死亡时 `character.die(hit)` 创建 `ragdoll.js` 的布娃娃。
  NPC 装备和玩家一样：`model.guns` 里有主、副武器两把（`model.rifle` 永远指手上那把，瞄准、枪口、IK、布娃娃掉枪都用它），
  弹药、换弹时间、各部位伤害、枪声读这个 NPC 自己的 `bot.gun`（随机挑的枪，见上面"可选装备"），切枪时间读 `config.weapons`。玩家只有一个碰撞盒，NPC 打中玩家时按命中高度分头 / 身 / 腿。
  NPC 丢雷走 `grenades.launch(kind, pos, vel, fuse, owner)`；`owner` 是丢雷的 NPC（玩家丢的是 `null`），
  决定"炸到自己乘 selfMul"、要不要显示命中提示、算不算玩家的击杀（`hit.byBot`），雷飞行时也不和丢雷者自己的碰撞盒相撞。
  NPC 丢雷像人一样判断（#5，参数在 `config.bots`）：
  - 丢失视线后先等 `nadeDelay`（随机）再决定丢不丢，像人一样先看玩家往哪躲。
  - `guessPlayer` 推算玩家位置：从最后看见的位置沿当时的水平速度往前推（`sinceSeen + throwTime`，最多 `predictTime` 秒），射线碰到墙就停在墙前（人是躲到掩体后面，不会穿墙）。
    原来直接丢向"最后看见的位置"，那一般在掩体边上，玩家早躲进去了。
  - `planThrow` 出手前预演：平抛、高抛各试 6 种"瞄多远"（目标距离的 0.55–1.05 倍），用 `Grenades.simulate` 跑完引信看在哪炸；
    爆点到目标被墙挡着的、会炸到自己的不算，挑离目标最近的。最好的也偏出 `fragMaxMiss`（闪光 `flashMaxMiss`）就**不丢**，雷留着。
    随机先试手雷或闪光，前一种丢不准再试另一种；烟雾也走预演，但不设偏差上限。一次 12 条轨迹，只在决定丢雷时算一次。
  - 听枪声：玩家开枪时 `weapon.onShot` → `bots.hearPlayer`，`hearRange` 内看不见玩家的 NPC 把"最后看见的位置"改成玩家的位置（误差 `hearError`），
    进入搜索，可以再考虑丢一次雷（仍受 `grenadeCooldown` 限制）。
  - 没做：脚步声不暴露位置；NPC 不会捏雷，换弹没有动作（#23）。

  NPC 找人（#54，参数在 `config.bots` 的 searchTime 到 patrolNear）：
  - **搜索**：丢失视线时 `startSearch(guessPlayer(predictTime))`，去推算的位置，不是玩家消失的位置；听到枪声、被打也走 `startSearch`。
    到了（`reachedSpot`：2 米内，或 5 米内已经看得清那里）没看见人，站住张望 `searchPause` 秒，再 `nextSearchSpot`：
    出发点 `searchRadius` 内、从自己眼睛看不到（`hasLineOfSight` 不通）、这次没去过的巡逻点里离出发点最近的。没有就原地张望到 `searchTime` 结束。
  - **确定 / 拿不准**：`sinceSeen < sureTime`（刚看见、刚听到、刚被打）算确定，用 `runSpeed` 直奔、视线对着前进方向；之后放慢到 `searchSpeed` 边走边张望。
  - **张望**（`lookAround`）：巡逻和拿不准的搜索时，每 `scanInterval` 秒换一个看的方向：有线索时 `scanFocus` 的概率看线索那边，
    `scanAhead` 的概率看正前方，否则左右交替偏 `scanAngle` 的一半到全部；站住时幅度乘 `scanStandMul`。
    看的方向就是 `bot.yaw`，感知也用它，所以张望能看到侧面；腿由 `character.js` 朝移动方向，上半身扭过去（最多 `character.maxTwist`）。
  - **巡逻**：知道玩家大概在哪（`hasIntel`）后，`nextNavPoint(from, lastSeen)` 从离那最近的 `patrolNear` 个点里挑，慢慢往那边摸。
  - 测试：`tools/tests/npc-loadout-scan.mjs`（随机挑枪、glb 枪模、张望、直奔、搜索点），截图 `npc-m4` / `npc-sg` 看手握得对不对。
- **布娃娃**（`ragdoll.js`）：Verlet 质点 + 距离约束，和地图方块碰撞，每帧把质点位置换算回 Mixamo 骨骼的旋转。
  不同死法（爆头、炸飞、打腿、打身体的三种倒法）只是初始冲量不同，参数在 `config.ragdoll`。
- **血**（`effects.js`）：血雾是 Sprite；血滴共用一个 `THREE.Points` 环形缓冲；地上的血迹和血泊是逐渐变大的平面。
- **音效**（`audio.js`）：Web Audio。枪声、换弹、手雷 / 闪光爆炸放 `assets/sound/` 的录音（#45），其他是实时合成的。
  - `init()`（点开始时）后台 `fetch` + `decodeAudioData` 全部录音，不等；`sample(名字, {vol, pan, cutoff, rate})` 还没解码好就返回 `false`，
    每个方法据此退回原来的合成声，所以网络慢或下载失败也照样有声音。
  - 自己开枪：`config.loadout` 里每把枪的 `sound` 是录音前缀，`<sound>-1 / -2` 随机挑一发、音高抖 ±4%；NPC 开枪放 `<sound>-far`（中距录音，自带回声尾巴），
    按距离衰减音量、加低通变闷（`audio.samples.muffle`），并分左右声道。爆炸同样按距离变闷。
  - 录音由 `assets-src/sound/build.py`（`blender -b --python …`，用 Blender 自带的 aud 读写音频，不用装 ffmpeg）从原始素材切出来：
    找起音、剪空白、淡出、叠层、峰值归一化到 -1 dBFS，压成 96 kbps 单声道 mp3。各段的相对音量在 `config.js` 的 `audio.samples.gain` 调，不改文件。
    原始枪声库（329 MB）只在开发机的 `assets-src/sound/Prepared SFX Library/`，已 gitignore；其他小素材在 `assets-src/sound/source/` 进仓库。
  - 开发机没有声卡，好不好听只能负责人真机听；`tools/tests/real-sfx.mjs` 只保证每段解码成功、起音在开头、接线对。

## 已知的坑

- **用了 PBR 贴图的方块不能共用几何体。** `world.js` 的 `tileUV` 按每个物体的尺寸改写 UV（真实尺寸铺贴图），材质的 `userData.tile` 记一张贴图覆盖几米；
  新造型要用 PBR 材质时也要调 `tileUV`，否则一个面只铺一张、纹理随物体大小拉伸（#50）。
- **Poly Haven 的接口拒绝 Python 默认的 User-Agent（403）**，`fetch_textures.py` 用 curl 取（#50）。

- **枪模场景的光很亮。** 无贴图的非金属件亮度大约被放大 10 倍，所以 `gunmodel.js` 里的颜色看起来都很暗：
  想要屏幕上的某个颜色，把线性值除以 10 再填。文件里有注释。
- **加灯会让所有材质重新编译，造成卡顿。** 所以爆炸用的 PointLight（`grenades.js`）和枪口火光（`weapon.js`）一开始就创建好，平时亮度为 0。
  新增灯光也照这样做，不要在游戏中途 `scene.add` 新的灯。
- **第一次出现的材质会卡一下**（第一次击杀、第一次丢雷）。`effects.precompile` 和 `grenades.precompile` 在开局前预编译，新增特效材质要加进去。
- **枪模在第一帧之前就要摆好位置**，否则界面背后会看到一把巨大的枪：`weapon.js` 的 `buildModels` 里按 `basePos / baseRot` 初始化。
- **死亡的 NPC 还要继续更新**（布娃娃、血泊、尸体下沉），包括对决结束后的 `phase === 'over'`。
- **受击闪红**：NPC 死亡前要把 `model.flash` 清零，否则尸体会一直发红。
- **中弹反应**（#60，参数在 `config.hitReaction`，玩家和 NPC 同一套）：
  - 硬直：枪打中 `stunBullet` 秒，手雷按伤害（`stunPerDamage`，最多 `stunMax`）。硬直完 `stunImmune` 秒内再被枪打中不再硬直，**不加这个，AK 一梭子能把人一直定住**；手雷不受免疫限制。
  - 玩家（`player.js` 的 `hitReaction`）：硬直时移动输入当没按（按加速度刹住）、不能跳，`weapon.js` 看 `player.stunned` 不让开枪、不让拔环；**转视角不锁**（锁了像卡顿）。
    镜头 `punchPitch` 上抬、`punchRoll` 往远离攻击者的一侧歪，叠在 `camera.rotation` 上按 `punchRecover` 回正；手里的枪 `weapon.onHurt` 往下一沉。
    被手雷炸到要传 `takeDamage(dmg, pos, { explosion: true })`，否则按枪伤算硬直。
  - NPC（`bots.js` 的 `hitReaction`）：硬直时站住、不开枪、不丢雷（正在丢的雷等硬直完接着丢），点射被打断；死了不走这里，看布娃娃。
    `character.js` 的 `flinch` / `applyFlinch`：第一节脊柱和头绕"上 × 子弹方向"转一下（0.06 秒到最大，`botFlinchTime` 秒回来），手的 IK 还拉在枪上，所以只有上半身往后仰；方块小人整个往后仰。
  - 测试：`tools/tests/hit-reaction.mjs`。
- **全屏和指针锁定都要用户手势。** `input.lock(fullscreen)` 在按钮的 click 里同步发出两个请求，中间不能 `await`，否则第二个会被拒。
  **顺序必须是先锁鼠标、再请求全屏**：Chrome 里全屏请求会用掉这次手势，玩家按 Esc 退出锁定后再锁又必须有手势，反过来写锁鼠标就被拒。
  锁定失败 `input.js` 会自动重试一次（正在进全屏就等 `fullscreenchange`），还不行才提示。
  全屏挂在 `document.documentElement` 上（不是 canvas），否则 HUD 和菜单不在全屏里。
- **全屏时接管键盘（Keyboard Lock，只有 Chrome / Edge）。** `input.syncKeyboardLock` 在进全屏后调 `navigator.keyboard.lock()`：
  短按 Esc 交给页面（`input.js` 自己 `exitPointerLock` 进暂停，全屏保留），长按才退全屏；浏览器快捷键在全屏里不生效。
  没有这个接口的浏览器按 Esc 仍会同时退出全屏和锁定，点"继续"再进。系统级快捷键（Mac 的 ⌘+空格、⌘+Tab）哪个浏览器都拦不住。
  真机上 ⌘+空格 弹出聚焦搜索时页面不一定失焦，所以"失焦自动暂停"没触发（#26），要另找信号判断误触（#52）。
  没选"把 Esc 换成别的暂停键"：没有 Keyboard Lock 的浏览器里 Esc 一样会退出锁定，换键解决不了（#6）。
- **按下的键可能收不到 keyup。** 窗口失焦之后、Mac 上按住 ⌘ 期间松开的键都没有 `keyup`。`input.releaseAll()` 在失焦、解锁、⌘ 按下和松开时清空按键；
  带 ⌘ 的组合键不记成游戏按键（⌘+空格 不会跳）。
  失焦 `view.blurPauseDelay` 秒没回来自动暂停：不立刻暂停，是因为进出全屏的过渡里焦点可能闪一下，立刻暂停会把刚拿到的锁定弄掉；
  页面切到后台（`visibilitychange`）则立刻暂停（#6）。新加"按住"类的状态要跟着 `inputrelease` 事件清掉（`devlog.js` 的按键位掩码就是这样）。
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
- **手臂每帧要 `solve()`。** `gunmodel.js` 的 `buildArms` 按握持坐标系摆手腕骨骼；小臂从"手腕不弯"的方向往 `armDir` 转，手腕最多弯 `wristMaxBend`，
  其余由手肘弯；上臂沿 `armDir` 伸出画面。手指只在第一次 solve 时自动弯到贴住握把。
  `wristMaxBend` 取 20° 是正常端枪时手腕的弯折量，比它小手肘要弯得更多，小臂在画面里占的地方更大（#3）。
  `weapon.js` 在 `animate` 末尾对当前武器调一次；在别处移动了枪或手的目标点，要在渲染前再调一次，否则手臂慢一帧。
  蒙皮网格关了视锥剔除（静止姿势的包围球不准）。
- **手臂的"没弯"要以蒙皮绑定姿势为准，不是 glb 场景里的默认姿势。** `arm.glb` 的默认姿势里左手腕相对绑定姿势自带约 30° 扭转；
  蒙皮是按绑定姿势变形的，所以 `measureArms` 从 `skeleton.boneInverses` 取小臂→手、上臂→小臂的相对旋转。
  小臂、上臂只做最小摆动（`setFromUnitVectors`），不绕自身转，手腕就不会拧成麻花。改了解算跑 `tools/tests/arm-wrist.mjs`。
- **手的握持朝向决定了小臂往哪伸。** 手腕最多弯 `wristMaxBend`，所以小臂基本顺着手的朝向；朝向不自然，弯折就挪到手肘上，手肘折在画面中间（#11）。
  步枪左手托护木不能掌心正朝上横着托，要绕护木轴转一点（`weapon.js` 的 `SUPPORT_ROLL`），让手腕在护木左下方；`armDir` 再取和小臂差不多的方向，手肘就在画面外。
  `SUPPORT_ROLL` 取 30° 是扫过一组角度挑的：0° 以下小臂更平，45° 以上手跑到护木侧面、小臂几乎竖直，像抓着而不是托着；绕掌心法线再斜着转效果不明显，没加。
  调了握持朝向跑 `tools/tests/arm-wrist.mjs`，它会检查步枪左手肘在不在画面中间。
  不要逐把枪把 `armDir` 调到和手掌对齐来"修"手腕（#3 考虑过，没选）：每把枪、每个动作都要调，换弹时手一动又偏。
- **扔完手雷切回枪的那一帧枪模会跳**（约 56cm、36°，开发者模式的分析脚本发现，#10）：疑似 `weapon.js` 的 `finishThrow` 把收枪进度直接设满。
  还没修，等负责人真机录一段（扔雷 → 切回枪，前后按 F8）确认。
- **`DevLog.sample` 每帧不能新建对象**（包括闭包返回小数、`Set.has`、three.js 的 getter），否则开发者模式自己就会引起垃圾回收卡顿。
  改了它跑 `tools/tests/devlog.mjs`，里面用采样堆分析器检查零分配。
- **录画面要在渲染之后立刻拷画布。** WebGL 画布没开 `preserveDrawingBuffer`，交给屏幕后就清空了，晚一步拷到的是黑的。
- **同色集装箱共用贴图**，只显示第一个的编号，见 `maps.md`。
- **下载来的模型常是 HASHED / BLEND 材质。** M4、SG 的原始材质都是 HASHED（半透明抖动），在游戏里会透；加工脚本里统一改 `OPAQUE`。
  原始单位也不统一（SG 是厘米），加工脚本按"全长"缩放，见 `assets-src/models/gun/m4.py`、`sg.py`。
- **换 NPC 模型先看朝向和材质。** 下载来的模型可能面朝反方向（左手在 +X），`rig.sh add-anim` 会报"静止姿态相差 ~180°"，
  先转 180° 再移植动画；Sketchfab 类导出常把所有材质设成 `BLEND`、法线强度 0、透明度放在单独贴图里，要改成 `MASK`。
  例子见 `assets-src/models/human/ukrainian-soldier/build.sh`。
