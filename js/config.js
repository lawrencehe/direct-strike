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
    groundAccel: 50,       // 地面加速度：越大起步/急停越"跟手"
    airAccel: 8,           // 空中加速度：越小空中越难改变方向
    jumpSpeed: 5.6,        // 起跳初速度（跳跃高度 ≈ jumpSpeed² / 2g）
    gravity: 15,           // 重力。现实是 9.8，游戏里通常更大，跳起来不"飘"
    headBob: 0.035,        // 走路时镜头上下晃动幅度
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

    // 后坐力：每发让枪口往上（和左右随机）跳
    recoilPitch: 0.012,    // 每发上跳
    recoilYaw: 0.006,      // 每发左右随机抖动范围
    recoilRecover: 5,      // 停火后回正速度
  },

  targets: {
    resetTime: 3,          // 靶子被击倒后几秒重新立起
  },

  audio: {
    volume: 0.5,
  },
};
