// ============================================================
// 游戏参数表
// 想调手感？改这里的数字，保存后刷新网页就能感受到变化。
// 单位：距离=米，时间=秒，角度=弧度（0.01 弧度 ≈ 0.57 度）
// ============================================================
window.Game = window.Game || {};

Game.Config = {
  map: 'yard',             // 使用哪张地图，对应 maps/<名字>.json

  view: {
    fov: 75,               // 视野角度（度）。越大看得越广，但边缘会变形
    weaponFov: 60,         // 枪模单独使用的视野，避免枪被拉伸
    mouseSensitivity: 0.0022,  // 鼠标灵敏度：每移动 1 像素转多少弧度
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

  graphics: {
    shadowMapSize: 2048,   // 阴影贴图分辨率。卡的话改成 1024
    exposure: 1.0,         // 画面整体亮度
  },

  // 武器。枪的参数按把写，共用的放外面
  weapons: {
    maxRange: 200,         // 最大射程
    recoilRecover: 5,      // 停火后枪口回正速度
    switchOut: 0.12,       // 切枪：收枪用时
    switchIn: 0.2,         // 切枪：掏枪用时

    // 主武器
    rifle: {
      name: 'AK',
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
      auto: false,
      fireInterval: 0.16,
      magSize: 15,
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

  // 投掷物。count 是每条命 / 每波带几个（训练场不限量）
  // fuse 是拉环后几秒引爆：按住左键就开始倒计时，松开才扔出去。攥太久会在手里炸
  grenades: {
    throwSpeed: 15,        // 出手速度 m/s
    throwUp: 0.14,         // 出手时比准星略微上抬
    restitution: 0.38,     // 碰撞反弹系数
    groundFriction: 0.68,  // 落地时水平速度保留多少
    pullTime: 0.2,         // 拉环动作：点一下左键也要做完才出手
    swingTime: 0.28,       // 挥臂动作总时长
    releaseAt: 0.07,       // 挥臂开始多久后出手
    trailLife: 2.2,        // 飞行轨迹保留几秒

    frag: {
      name: '手雷', count: 2, fuse: 3.0,
      radius: 7,           // 爆炸半径；伤害随距离线性衰减，有掩体挡着不受伤
      damage: 150,         // 爆心伤害（2.3 米内必死）
      selfMul: 0.75,       // 炸到自己时伤害乘这个系数
    },
    flash: {
      name: '闪光', count: 2, fuse: 2.0,
      radius: 20,
      playerBlind: 3.8,    // 玩家正对爆点、距离很近时致盲几秒
      botBlind: 3.2,       // NPC 致盲几秒（期间不开枪、站在原地）
    },
    smoke: {
      name: '烟雾', count: 1, fuse: 2.0,
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
  bots: {
    health: 100,
    walkSpeed: 2.4,        // 巡逻、交战时的移动速度
    runSpeed: 4.2,         // 搜索玩家时的奔跑速度
    turnSpeed: 4,          // 每秒最多转多少弧度
    viewDistance: 45,      // 最远能看多远
    viewAngle: 120,        // 视野角度（度），背后是盲区
    reactionTime: [0.6, 1.0],  // 发现玩家后多久开第一枪（随机范围）
    preferredRange: [8, 20],   // 喜欢的交战距离：太远会靠近，太近会后退
    burstCount: [3, 5],    // 每次点射几发
    burstInterval: 0.12,   // 点射中每发的间隔
    burstPause: [0.7, 1.3],    // 两次点射之间的停顿
    damage: 8,             // 打中玩家一发扣多少血
    spread: 0.05,          // 基础散布，越大越打不准
    moveSpreadMul: 1.0,    // 玩家全速移动时，NPC 散布额外增加的倍数
    searchTime: 6,         // 丢失目标后搜索多久
    gravity: 15,
    stepHeight: 0.45,      // NPC 能直接走上去的台阶高度
    firstWave: 2,          // 波次模式：第一波几个敌人
    perWave: 1,            // 每波多几个
    maxAlive: 7,           // 一波最多几个
    wavePause: 4,          // 两波之间休息几秒
  },

  // 1v1 对决
  duel: {
    winScore: 5,           // 先打到几杀获胜（默认值；玩家在开始界面选过的存在浏览器里，优先于这里）
    winScoreOptions: [3, 5, 10],   // 开始界面可选的杀数
    respawnDelay: 3,       // 被击杀后几秒重生
    botSkill: 0.5,         // 对手强度 0 ~ 1（影响反应、准度、转身）
  },

  // NPC 外观
  character: {
    model: 'assets/models/soldier.glb',  // 加载失败时自动退回方块小人
    walkAnimSpeed: 1.7,    // 走路动画本来的前进速度（m/s）。加载模型时会自动量，这里只是量不出来时的备用值
    runAnimSpeed: 4.4,
    walkRunBlend: [2.2, 3.6],  // 速度在这个区间内从走路动画过渡到跑步动画
    maxTwist: 55,          // 上半身最多能相对腿扭多少度：横移时腿斜着跨、枪照样指着你
    showHitboxes: false,   // 调试用：显示头/身/腿的判定盒
  },

  audio: {
    volume: 0.5,
  },

  // 默认按键。值是 KeyboardEvent.code（KeyW、ShiftLeft、Space…）或 Mouse0 ~ Mouse4。
  // 玩家在开始界面里改过的按键会存到浏览器 localStorage，优先级高于这里。
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
    resetStats: ['KeyT'],
  },
};
