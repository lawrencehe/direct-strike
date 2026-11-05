// ============================================================
// 游戏参数表
// 想调手感？改这里的数字，保存后刷新网页就能感受到变化。
// 单位：距离=米，时间=秒，角度=弧度（0.01 弧度 ≈ 0.57 度）
// ============================================================
window.Game = window.Game || {};

Game.Config = {
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

  weapon: {
    fireInterval: 0.1,     // 两发之间的间隔 → 每分钟 600 发
    magSize: 30,           // 弹匣容量
    reloadTime: 1.6,       // 换弹时间
    maxRange: 200,         // 最大射程

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
    recoilRecover: 5,      // 停火后回正速度

    // 打中不同部位的伤害（NPC 生命值 100）
    damage: { head: 100, body: 34, leg: 25 },
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
    winScore: 10,          // 先打到几杀获胜
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
    resetStats: ['KeyT'],
  },
};
