// ============================================================
// 游戏参数表
// 想调手感？改这里的数字，保存后刷新网页就能感受到变化。
// 单位：距离=米，时间=秒，角度=弧度（0.01 弧度 ≈ 0.57 度）
// ============================================================
window.Game = window.Game || {};

Game.Config = {
  map: 'yard',             // 使用哪张地图，对应 maps/<名字>.json

  // 资源下载和本地缓存（js/assets.js，#85）。清单由部署脚本生成（tools/build-manifest.mjs），本地开发没有清单就不缓存
  assets: {
    manifest: 'assets/manifest.json',   // 资源清单：每个文件的大小、内容哈希，整体一个版本号
    cacheName: 'ds-assets',             // 浏览器 Cache Storage 的名字（改了等于让所有玩家重新下载一遍）
    versionKey: 'ds-assets-version',    // localStorage 里记本地资源版本号的键
  },

  view: {
    fov: 75,               // 视野角度（度）。越大看得越广，但边缘会变形
    weaponFov: 60,         // 枪模单独使用的视野，避免枪被拉伸
    mouseSensitivity: 0.0022,  // 鼠标灵敏度：每移动 1 像素转多少弧度
    fullscreen: true,      // 进入战斗时自动全屏，首页不全屏（浏览器规定必须由点击触发；玩家可在设置里关掉）
    keyboardLock: true,    // 全屏时接管键盘（Chrome / Edge）：短按 Esc 只暂停不退全屏，长按才退；浏览器快捷键（Ctrl/⌘+W 等）不生效
    blurPauseDelay: 0.3,   // 窗口失去焦点多久（秒）还没回来就自动暂停（Mac 上 ⌘+空格 弹出聚焦搜索时）
    lockRetryDelay: 0.15,  // 锁定鼠标被浏览器拒绝后，隔多久（秒）自动再试一次
  },

  player: {
    height: 1.7,           // 身高（碰撞盒高度）
    eyeHeight: 1.6,        // 眼睛离地高度（摄像机位置）
    radius: 0.3,           // 身体半宽（碰撞盒）
    walkSpeed: 5.0,        // 走路速度 m/s
    sprintSpeed: 7.5,      // 奔跑速度 m/s
    crouchSpeed: 2.6,      // 下蹲时的移动速度 m/s
    crouchHeight: 1.1,     // 下蹲时的身高（碰撞盒）
    crouchEyeHeight: 1.0,  // 下蹲时眼睛离地高度
    crouchTime: 0.18,      // 站 ↔ 蹲 过渡时间（秒）
    groundAccel: 50,       // 地面加速度：越大起步/急停越"跟手"
    airAccel: 8,           // 空中加速度：越小空中越难改变方向
    jumpSpeed: 5.6,        // 起跳初速度（跳跃高度 ≈ jumpSpeed² / 2g）
    gravity: 15,           // 重力。现实是 9.8，游戏里通常更大，跳起来不"飘"
    stepHeight: 0.45,      // 不用跳就能直接走上去的台阶高度
    headBob: 0.035,        // 走路时镜头上下晃动幅度
    maxHealth: 100,        // 生命值
  },

  // 中弹反应（#60）：玩家和 NPC 被枪打中、被手雷炸到后短暂硬直（不能开枪、不能走；玩家照样能转视角），
  // 玩家的镜头被打偏、画面边缘溅血、血条掉的那一截先留着再缩回去；NPC 身体往后一缩
  hitReaction: {
    stunBullet: 0.18,      // 枪打中：硬直几秒
    stunPerDamage: 0.006,  // 手雷：硬直 = 伤害 × 这个数（50 点伤害 0.3 秒）
    stunMax: 0.6,          // 硬直最多几秒
    stunImmune: 0.45,      // 硬直结束后这几秒内再中弹不会再硬直（否则被 AK 连发打中会一直定住）；手雷不受这个限制
    punchPitch: 0.08,      // 玩家镜头被打得往上抬：每 100 点伤害抬多少弧度（枪打中至少按 25 点算）
    punchRoll: 0.08,       // 玩家镜头往一侧歪（子弹从右边来就往左歪），每 100 点伤害多少弧度
    punchRecover: 7,       // 镜头回正的速度（越大回得越快）
    gunDip: 0.05,          // 手里的枪被震得往下一沉（米，乘伤害 / 100，最多 1 倍）
    bloodFade: 1.4,        // 画面边缘的血迹几秒淡完
    trailDelay: 0.45,      // 血条掉的那一截亮着留几秒再缩
    trailSpeed: 80,        // 然后每秒缩多少（满血 100）
    botFlinch: 0.35,       // NPC 中弹往后缩的角度（弧度，伤害 34 时的大小，按伤害缩放，最多 1.5 倍）
    botFlinchTime: 0.35,   // NPC 缩一下的总时长（秒）
  },

  graphics: {
    shadowMapSize: 2048,   // 阴影贴图分辨率。卡的话改成 1024
    // 画面亮度（曝光）和环境光强度跟着天气走，在下面 weather.presets 里
  },

  // 天气 / 时段（#77）：首页地图下面选，存在玩家设置里，切换立刻生效（不用重开）。
  // 每个预设管天空、雾、灯光、曝光、环境光和地面湿不湿；所有地图共用，地图只提供晴天的环境光（maps/*.json 的 environment）。
  // 素材在 assets/weather/<目录>/（sky.webp 天空、env.hdr 环境光），由 assets-src/weather/fetch_weather.py 生成；第一次用到时才下载。
  weather: {
    default: 'sunny',
    presets: {
      // 晴天：原来的样子。天空、云、太阳都是 textures.js 程序画的
      sunny: {
        name: '晴天',
        sky: null,                 // null = 程序画的天空 + 云 + 太阳；否则是 assets/weather/ 下的目录名，用里面的 sky.webp
        env: null,                 // 环境光：HDRI 的目录名（用里面的 env.hdr）；'sky' = 拿天空贴图当环境光；null = 用地图自己的 environment
        exposure: 1.0,             // 画面整体亮度（色调映射前的曝光）
        envIntensity: 0.5,         // 地图物体的环境光（HDRI）强度：越大越亮、金属反光越明显，0 等于不用（#50）
        fog: { color: 0xd6cbb8, near: 45, far: 260 },
        hemi: { sky: 0xbfd4ee, ground: 0x6b5a46, intensity: 0.55 },             // 半球光：天空色 / 地面反光色
        sun: { color: 0xffe3c0, intensity: 1.35, dir: [-0.55, 0.5, 0.42] },   // 平行光（投影子）
        weaponHemi: 0.8,           // 手里的枪单独一个场景，有自己的灯：半球光强度
        weaponSun: { color: 0xffe3c0, intensity: 0.9 },
        hills: 0xffffff,           // 远山剪影乘的颜色
        lampGlow: 0.6,             // 场边灯柱灯头的自发光强度
        dust: 0.55,                // 空中尘埃的不透明度
        wet: 0,                    // 地面湿度 0 ~ 1：越湿地面越暗、越光滑（反光），见下面 wetGround
        extraPuddles: 0,           // 除了地图里的水洼，再撒多少个（只撒在场地里，位置每次一样）
      },
      // 阴雨傍晚：厚云、冷蓝灰，刚下过雨，地面发暗发亮、水坑多。
      // 比参考图亮一档：1v1 要能看清对手，所以半球光不压太低
      rainDusk: {
        name: '阴雨傍晚',
        sky: 'rain-dusk',
        skyColor: 0xffffff,        // 天空贴图再乘的颜色（调亮暗用；贴图本身已经调过色，天空不做色调映射）
        env: 'sky',                // HDRI 的地平线有一圈亮光，水洼映出来是白斑；直接用调过色的天空，反射和看到的天一致
        exposure: 0.85,
        envIntensity: 0.9,
        fog: { color: 0x3a4554, near: 25, far: 190 },
        hemi: { sky: 0x8fa3c0, ground: 0x2c3036, intensity: 0.9 },
        sun: { color: 0xa8bcd8, intensity: 0.45, dir: [0.35, 0.75, -0.55] },  // 云后的天光：弱、冷、偏高，影子很淡
        weaponHemi: 0.75,
        weaponSun: { color: 0xb8c8e0, intensity: 0.45 },
        hills: 0x5d6a7c,
        lampGlow: 2.2,             // 天暗了，灯头亮起来
        dust: 0,
        wet: 1,
        extraPuddles: 16,
      },
    },
    // 地面湿透（wet = 1）时：粗糙度乘多少（越小越光滑、越能映出天光和灯）、颜色乘多少（湿了发暗）；中间按 wet 插值
    wetGround: { roughness: 0.55, color: 0.72 },
    // 水洼在 wet = 0 / 1 时的粗糙度、不透明度和反光（环境光强度再乘的倍数）。
    // 晴天别太光滑，否则对着太阳是一块刺眼的亮斑；雨天太亮会像一块浅蓝色的布（还没有实时反射，映不出周围的东西）
    puddle: { dry: { roughness: 0.3, opacity: 0.6, env: 1 }, wet: { roughness: 0.08, opacity: 0.7, env: 0.4 } },
  },

  // 武器。枪的参数按把写，共用的放外面
  weapons: {
    maxRange: 200,         // 最大射程
    recoilRecover: 5,      // 停火后枪口回正速度
    switchOut: 0.12,       // 切枪：收枪用时
    switchIn: 0.2,         // 切枪：掏枪用时
    // 子弹（对决和波次；训练场不限量）。玩家和 NPC 一样：每条命只有枪里那一个弹匣，没有备弹，多的要花钱买（economy.bulletPrice）。NPC 买不了（#7）
    spareMags: 0,          // 开局 / 每条命除了枪里那个，还带几个备用弹匣
    maxMags: 3,            // 每把枪最多带几个弹匣的子弹（含枪里那个）：AK 90 发、手枪 30 发

    // 第一人称手臂（所有武器共用一套模型，每把武器各摆一份）
    arms: {
      model: 'assets/models/arm/arm.glb',   // CC0，见 assets/LICENSES.md
      handLength: 0.1,       // 手腕到中指根的长度（米），模型按这个缩放
      palmGap: 0.012,        // 掌心离握把表面的距离（手掌厚度的一半）
      fingerRadius: 0.009,   // 手指半径：弯手指时让指节贴着"握把半径 + 这个值"的圆
      wristMaxBend: 20,      // 手腕最多弯多少度（相对蒙皮绑定姿势），超出的由手肘弯；太大手腕蒙皮会挤瘪
    },

    // 主武器（下面是默认数值；首页选的枪见后面的 loadout.rifle，可以覆盖其中任何一项）
    rifle: {
      name: 'AK',
      model: 'assets/models/gun/ak47.glb',
      auto: true,            // 按住连发
      fireInterval: 0.1,     // 两发之间的间隔 → 每分钟 600 发
      magSize: 30,           // 弹匣容量
      reloadTime: 1.6,       // 换弹时间

      // 散布：子弹偏离准星中心的角度
      baseSpread: 0.002,     // 站立不动时的基础散布
      moveSpread: 0.025,     // 移动时额外增加（按速度比例）
      airSpread: 0.08,       // 空中额外增加
      bloomPerShot: 0.006,   // 连续开火时每发累积的散布
      bloomMax: 0.04,        // 累积上限
      bloomRecover: 0.08,    // 每秒恢复多少
      crouchSpreadMul: 0.6,  // 下蹲时散布乘以这个系数（更准）

      // 后坐力：每发让枪口往上（和左右随机）跳
      recoilPitch: 0.012,    // 每发上跳
      recoilYaw: 0.006,      // 每发左右随机抖动范围

      // 打中不同部位的伤害（NPC 生命值 100）
      damage: { head: 100, body: 34, leg: 25 },
      knockback: 1,          // 打死人时的冲击力系数（布娃娃）
    },

    // 副武器：半自动，一次扣扳机一发。伤害低一些，换弹快
    pistol: {
      name: '手枪',
      model: null,           // null = 代码拼的几何体（gunmodel.js 的 buildPistol）
      auto: false,
      fireInterval: 0.16,
      magSize: 10,
      reloadTime: 1.25,
      baseSpread: 0.002,
      moveSpread: 0.018,
      airSpread: 0.06,
      bloomPerShot: 0.012,
      bloomMax: 0.04,
      bloomRecover: 0.14,
      crouchSpreadMul: 0.7,
      recoilPitch: 0.02,
      recoilYaw: 0.008,
      damage: { head: 100, body: 26, leg: 18 },
      knockback: 0.75,
    },
  },

  // 投掷物。count 是开局 / 每条命带几个（训练场不限量），多的要花钱买（见下面的 economy）。玩家和 NPC 开局带一样多：一枚手雷，闪光和烟雾要买（#7）
  // 两道保险：按住左键拔掉拉环，但只要还攥着保险握片引信就不走，攥多久都不会炸；
  // 松开左键出手，握片弹开，fuse 秒后引爆。人死了手一松，雷掉在脚下，也是从这时开始算
  grenades: {
    throwSpeed: 15,        // 出手速度 m/s
    throwUp: 0.14,         // 出手时比准星略微上抬
    restitution: 0.38,     // 碰撞反弹系数
    groundFriction: 0.68,  // 落地时水平速度保留多少
    pullTime: 0.2,         // 拔环动作：点一下左键也要做完才出手
    swingTime: 0.28,       // 挥臂动作总时长
    releaseAt: 0.07,       // 挥臂开始多久后出手
    trailLife: 2.2,        // 飞行轨迹保留几秒

    frag: {
      name: '手雷', count: 1, fuse: 2.0,   // fuse：出手（握片弹开）后几秒爆炸，飞行时间也算在内（3 秒时雷落地后还要躺很久，对方早跑开了，#5）
      radius: 7,           // 爆炸半径；伤害随距离线性衰减，有掩体挡着不受伤
      damage: 150,         // 爆心伤害（2.3 米内必死）
      selfMul: 0.75,       // 炸到自己时伤害乘这个系数
    },
    flash: {
      name: '闪光', count: 0, fuse: 2.0,
      radius: 20,
      playerBlind: 3.8,    // 玩家正对爆点、距离很近时致盲几秒
      botBlind: 3.2,       // NPC 致盲几秒（期间不开枪、站在原地）
    },
    smoke: {
      name: '烟雾', count: 0, fuse: 2.0,
      radius: 3.8,         // 烟团半径：NPC 看不穿，也就不会开枪
      duration: 14,        // 持续几秒
    },
  },

  // 布娃娃（NPC 死亡）
  ragdoll: {
    gravity: 11,               // 比玩家的重力小一点，人倒下才有分量，不会一下子拍在地上
    corpseTime: 8,             // 尸体留几秒
    headPush: [3.4, 4.8],      // 爆头：水平冲击 m/s（打飞的感觉主要调这个）
    headLift: [1.7, 2.5],      // 爆头：把人掀离地面的速度
    bodyPush: [1.0, 1.8],      // 打身体：水平冲击
    blastPush: [3.0, 4.2],     // 爆炸：水平冲击（再乘距离系数）
    blastLift: [2.0, 2.8],     // 爆炸：向上
  },

  targets: {
    resetTime: 3,          // 靶子被击倒后几秒重新立起
  },

  // NPC 敌人（对战模式）
  // NPC 的装备和玩家一样：AK + 手枪（枪里各一个弹匣，weapons.spareMags 个备用弹匣）+ 三种雷各 grenades.*.count 个。
  // NPC 没有经济买不了东西：两把枪都打空了就背离玩家跑开，不再交战。
  // 枪的射速、弹匣、换弹时间、各部位伤害都直接用上面 weapons 里的数值，这里只管 NPC 怎么用
  bots: {
    health: 100,
    walkSpeed: 2.4,        // 巡逻、交战时的移动速度
    runSpeed: 4.2,         // 搜索玩家时的奔跑速度
    turnSpeed: 4,          // 每秒最多转多少弧度
    viewDistance: 45,      // 最远能看多远
    viewAngle: 120,        // 视野角度（度），背后是盲区
    reactionTime: [0.6, 1.0],  // 发现玩家后多久开第一枪（随机范围）
    preferredRange: [8, 20],   // 喜欢的交战距离：太远会靠近，太近会后退
    burstCount: [3, 5],    // AK 每次点射几发（点射中每发的间隔 = AK 的 fireInterval）
    burstPause: [0.7, 1.3],    // AK 两次点射之间的停顿
    pistolPause: [0.28, 0.5],  // 手枪两发之间的间隔（人扣扳机没那么快）
    pistolRange: 15,       // AK 打空时：玩家在这个距离内就掏手枪，远了就换弹
    damageMul: 1,          // NPC 子弹伤害倍数。1 = 和玩家的枪一样（爆头 100、身体 34…）；嫌太难打就调小
    aimHeight: [0.45, 0.8],    // 瞄准玩家身高的哪一段（0 脚底 ~ 1 头顶）。头部是顶上 0.25 米，散布偶尔会爆头
    spread: 0.05,          // 基础散布，越大越打不准
    moveSpreadMul: 1.0,    // 玩家全速移动时，NPC 散布额外增加的倍数
    searchTime: 10,        // 丢失目标后搜索多久（先去推算的位置，没找到再去附近几个看不到的点）
    searchSpeed: 3.0,      // 搜索时拿不准玩家在哪：放慢脚步边走边张望（确定时用 runSpeed 跑过去）
    sureTime: 1.5,         // 刚看见 / 刚听到枪声 / 刚被打的这几秒算"确定玩家在哪"：直奔过去、只盯着那边，不张望
    searchRadius: 12,      // 搜索时只去离推算位置这么近的点
    searchPause: [0.6, 1.2],   // 到了一个点没看见人：站住张望几秒再去下一个
    scanAngle: 60,         // 张望：视线最多偏离前进方向多少度（站住时乘 scanStandMul）
    scanStandMul: 1.8,     // 站住张望时扫得更开
    scanInterval: [0.7, 1.5],  // 张望：多久换一个方向看（秒，随机范围）
    scanFocus: 0.45,       // 张望：有线索时，每次换方向有多大概率看线索那边
    scanAhead: 0.3,        // 张望：每次换方向有多大概率看回正前方
    patrolNear: 4,         // 巡逻：知道玩家大概在哪时，从离那最近的几个巡逻点里挑下一个

    // 投掷物：什么时候丢、丢哪种
    grenadeChance: 0.6,    // 玩家躲起来（丢失视线）或开枪暴露位置时，有多大概率朝推算的位置丢雷
    nadeDelay: [0.4, 1.0], // 丢失视线后等多久再判断玩家躲到了哪、丢不丢雷（秒，随机范围）
    predictTime: 1.2,      // 推算玩家位置：沿玩家消失时的移动方向最多往前推几秒（碰到墙就停）
    hearRange: 35,         // 玩家开枪，这个距离内看不见玩家的 NPC 能听到，知道玩家大概在哪
    hearError: 1.5,        // 听声辨位的误差（米）
    fragMaxMiss: 3.5,      // 预演出的爆点离目标超过这个距离（或被墙挡住）就不丢手雷，留着
    flashMaxMiss: 6,       // 闪光弹同上
    fragRange: [8, 26],    // 手雷：离目标这个距离内才丢（太近会炸到自己）
    flashRange: [6, 22],   // 闪光弹：同上。丢完会背过身去，免得闪到自己
    smokeHealth: 50,       // 交战中血量低于这个值，丢烟雾弹挡住视线然后后撤
    retreatTime: 3,        // 丢完烟后撤几秒
    grenadeCooldown: 6,    // 两次丢雷至少隔几秒
    throwTime: 0.6,        // 丢雷动作时长（期间不开枪）
    gravity: 15,
    stepHeight: 0.45,      // NPC 能直接走上去的台阶高度
    firstWave: 2,          // 波次模式：第一波几个敌人
    perWave: 1,            // 每波多几个
    maxAlive: 7,           // 一波最多几个
    wavePause: 4,          // 两波之间休息几秒
  },

  // 经济（对决和波次，训练场没有）：打死敌人拿赏金，回到自己这条命的出生点买子弹和投掷物。逻辑在 economy.js。数值是负责人定的（#7）
  economy: {
    startMoney: 600,       // 开局有多少钱；每次重生不足这个数补到这个数，多的保留（连着被杀的人不会一直没钱买东西）
    maxMoney: 2000,        // 存款上限：到了上限再打死人也不涨
    // 赏金只看最后一击（之前打掉的血不给钱）：爆头打死 / 其他打死（枪打身体或腿）/ 手雷炸死（算普通击杀）
    reward: { head: 500, body: 300, frag: 300 },
    prices: { frag: 300, flash: 200, smoke: 300 },   // 投掷物价格
    maxCarry: { frag: 2, flash: 2, smoke: 1 },       // 投掷物每种最多带几个
    bulletPrice: 2,        // 子弹一发多少钱。一次买一个弹匣（AK 30 发 $60、手枪 10 发 $20），离上限（weapons.maxMags）不到一个弹匣就只补到上限
    buyRadius: 3,          // 购买区：出生点周围几米（地上有一圈环）
    boughtPulse: 0.7,      // 买成功后武器栏里那一格闪亮、放大回弹几秒（同时钱数闪一下、旁边飘 "-$价格"）
    cursorSpeed: 1,        // 购买菜单开着时屏幕上的光标：鼠标移动 1 像素，光标走几像素（#81）
    // B 经典菜单的分类，一类一列，顺序就是数字键：先按分类的号、再按商品的号（#81）。
    // 商品：rifle / pistol 是主武器 / 手枪一个弹匣的子弹，frag / flash / smoke 是一个投掷物
    categories: [
      { name: '弹药', items: ['rifle', 'pistol'] },
      { name: '投掷物', items: ['frag', 'flash', 'smoke'] },
    ],
    // F 快捷菜单的套餐（后面还有一张"自定义"，是上一次在 B 菜单里买完的装备）。按数字键或点一下就 Smart Buy（#81）：
    // items 的顺序就是优先级，数字是"买到多少"——子弹按弹匣算（含枪里那个），投掷物按个，超过上限按上限（99 = 买满）。
    // 已经够了的跳过；钱不够买下一件就跳过这一样，接着买后面的。
    packages: [
      { name: '补满', items: [['rifle', 99], ['frag', 99], ['flash', 99], ['smoke', 99], ['pistol', 99]] },
      { name: '突击', items: [['rifle', 3], ['frag', 2], ['flash', 1]] },
      { name: '经济', items: [['rifle', 2], ['flash', 1]] },
    ],
  },

  // 1v1 对决
  duel: {
    winScore: 5,           // 先打到几杀获胜（默认值；玩家在首页选过的存在浏览器里，优先于这里）
    winScoreOptions: [3, 5, 10],   // 首页可选的杀数
    respawnDelay: 3,       // 被击杀后几秒重生
    botSkill: 0.5,         // 对手强度 0 ~ 1（影响反应、准度、转身）
  },

  // 可选装备：首页"装备"里点击切换，选择存在浏览器里（settings.js 写回 weapons.rifle / weapons.pistol / character.model）。
  // 每一项的 key 是存档用的名字，不要随便改；第一项是默认值。
  // 枪：name 显示名，model 枪模（null = 代码拼的），sound 枪声录音的前缀（assets/sound/<sound>-1 / -2 / -far.mp3，见 audio.samples）。数值默认和上面 weapons.rifle / weapons.pistol 一样，
  //     想让某把枪不同，在这一项里写同名参数覆盖，例如 m4: { ..., fireInterval: 0.08, damage: { head: 100, body: 30, leg: 22 } }。
  //     枪在画面里的位置、手握在哪，在 weapon.js 的 Weapon.VIEW 里按 key 写。
  // 加一把新枪：模型放 assets/models/gun/，这里加一项，Weapon.VIEW 加一项，再截图对手的位置（docs/architecture.md）。
  // NPC：model 是 Mixamo 骨骼、带 Idle / Walk / Run 动画的 glb（见 assets/LICENSES.md 的"换模型"）。
  // 模型都是选中了才下载。来源和授权登记在 assets/LICENSES.md。
  loadout: {
    rifle: {
      ak: { name: 'AK', model: 'assets/models/gun/ak47.glb', sound: 'ak' },   // assets-src/models/gun/ak47.py 加工
      m4: { name: 'M4', model: 'assets/models/gun/m4.glb', sound: 'm4' },     // assets-src/models/gun/m4.py 加工
    },
    pistol: {
      beretta: { name: '手枪', model: null, sound: 'pistol' },
      sg: { name: 'SG 手枪', model: 'assets/models/gun/sg.glb', sound: 'pistol' }, // assets-src/models/gun/sg.py 加工
    },
    npc: {
      ukrainian: { name: '乌克兰士兵', model: 'assets/models/human/ukrainian-soldier.glb' },
      soldier: { name: '特种兵', model: 'assets/models/human/init_soldier.glb' },
    },
  },

  // NPC 外观
  character: {
    model: 'assets/models/human/ukrainian-soldier.glb',  // 由首页选的 loadout.npc 决定；加载失败时自动退回方块小人
    walkAnimSpeed: 1.7,    // 走路动画本来的前进速度（m/s）。加载模型时会自动量，这里只是量不出来时的备用值
    runAnimSpeed: 4.4,
    walkRunBlend: [2.2, 3.6],  // 速度在这个区间内从走路动画过渡到跑步动画
    maxTwist: 55,          // 上半身最多能相对腿扭多少度：横移时腿斜着跨、枪照样指着你
    showHitboxes: false,   // 调试用：显示头/身/腿的判定盒
  },

  audio: {
    volume: 0.5,           // 默认音量 0 ~ 1（玩家在设置里改过的存在浏览器里，优先于这里）

    // 真实录音的音效（#45）：枪声、换弹、手雷 / 闪光爆炸。点开始后后台下载，下完之前用合成声顶着。
    // 命中、击杀、购买这类提示音、烟雾嘶声仍是合成的（js/audio.js）。
    // 文件由 assets-src/sound/build.py 从原始录音剪出来，都归一化到同样的峰值，相对音量在 gain 里调。
    samples: {
      dir: 'assets/sound/',
      files: ['ak-1', 'ak-2', 'ak-far', 'm4-1', 'm4-2', 'm4-far', 'pistol-1', 'pistol-2', 'pistol-far',
        'mag-out', 'mag-in', 'rack-back', 'rack-forward', 'frag', 'flash'],
      gain: {
        shot: 0.75,        // 自己开枪（近距录音，每把枪两发随机挑）
        botShot: 1.0,      // NPC 开枪（中距录音），再按距离衰减：× 1 / (1 + 距离 / botRolloff)
        reload: 0.4,       // 换弹的四个动作
        explosion: 1.3,    // 手雷，按距离衰减：× 1 / (1 + 距离 / 10)
        flash: 1.0,        // 闪光弹，按距离衰减：× 1 / (1 + 距离 / 12)
      },
      botRolloff: 8,       // NPC 枪声的距离衰减（米），越小远处越轻
      pitchJitter: 0.04,   // 每发音高随机抖动 ±4%，连发不机械
      muffle: [16000, 1500, 50],  // 远处变闷：低通截止频率从 0 米的 16000Hz 降到 50 米的 1500Hz（中间按指数过渡）
    },
  },

  // 界面和设置页
  ui: {
    crosshairColors: ['#33ff66', '#ffffff', '#ffd23f', '#3fe0ff', '#ff4b3a'],  // 设置里可选的准星颜色，第一个是默认
    sensitivityRange: [0.2, 3],   // 鼠标灵敏度倍率的范围（乘 view.mouseSensitivity）
    fovRange: [60, 100],          // 视野角度的范围（度）
    mapPreview: 'assets/ui/maps/', // 地图预览图目录，文件名 <地图名>.webp（用游戏截图生成，见 docs/ui.md）
    menuCamera: { pos: [16, 6, -22], lookAt: [-2, 1, 4] },  // 首页背景的镜头位置和朝向
  },

  // 默认按键。值是 KeyboardEvent.code（KeyW、ShiftLeft、Space…）或 Mouse0 ~ Mouse4。
  // 玩家在设置里改过的按键会存到浏览器 localStorage，优先级高于这里。
  // 开发者模式（js/devlog.js）：录真机上的帧数据和画面，上传给开发分析。要服务器校验密码才能打开
  dev: {
    api: '/api/dev',       // 开发接口的路径前缀（线上由 fps-game 的 Caddy 转给 fps-api 容器，本地由 start.sh 的服务处理）
    seconds: 60,           // 内存里保留最近多少秒的帧数据（环形缓冲，满了覆盖最旧的）
    maxFps: 250,           // 按这个帧率预留缓冲区：seconds × maxFps 帧。帧率更高时保留的秒数会短一些
    maxEvents: 4000,       // 事件（开火、换弹、切枪、标记…）最多保留多少条
    markerKey: 'F8',       // 打标记的键：玩的时候觉得"刚才那下不对"就按一下
    panelKey: 'Equal',     // 打开开发者面板的快捷键：Mac 上 ⇧⌘ + 这个键，Windows 上 Ctrl+Shift + 这个键（Equal 就是 = 键）
    hudInterval: 0.25,     // 战斗浮层多久刷新一次（秒）。每帧刷新会拖慢页面
    hitchFactor: 2,        // 帧间隔超过中位数的几倍算一次卡顿
    video: {
      width: 960,          // 录画面的分辨率（宽；高按屏幕比例），不需要高清，够看清动作就行
      fps: 30,             // 录画面的帧率
      bitrate: 1500000,    // 码率（bit/s）：1.5 Mbps，5 秒一片约 1 MB
      segment: 5,          // 每片多少秒：每片都是一个能单独播放的 webm
      keep: 6,             // 内存里保留最近几片（6 × 5 = 30 秒）
    },
  },

  keys: {
    forward:    ['KeyW'],
    back:       ['KeyS'],
    left:       ['KeyA'],
    right:      ['KeyD'],
    jump:       ['Space'],
    crouch:     ['ShiftLeft', 'ShiftRight'],
    sprint:     ['CapsLock'],   // 浏览器里 Ctrl+W 会关标签页、Alt 会弹菜单，所以不用它们
    fire:       ['Mouse0'],
    reload:     ['KeyR'],
    slotRifle:  ['Digit1'],
    slotPistol: ['Digit2'],
    slotFrag:   ['Digit3'],
    slotFlash:  ['Digit4'],
    slotSmoke:  ['Digit5'],
    lastWeapon: ['KeyQ'],       // 切回上一把武器（滚轮也能切枪）
    buy:        ['KeyB'],       // 在出生点打开经典购买菜单（数字键先选分类再选商品，也能鼠标点）
    quickBuy:   ['KeyF'],       // 在出生点打开快捷套餐菜单（按数字键或点一下买一整套）
    resetStats: ['KeyT'],
  },
};
