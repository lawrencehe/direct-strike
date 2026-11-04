// ============================================================
// 玩家：视角控制 + 移动 + 重力跳跃 + 碰撞 + 生命值
// 碰撞的具体做法见 physics.js
// ============================================================
Game.Player = class Player {
  constructor(camera, colliders, spawn) {
    this.camera = camera;
    this.colliders = colliders;
    this.extraColliders = [];               // 会动的障碍（NPC），由 main.js 每帧更新
    this.spawn = spawn.clone();

    this.position = spawn.clone();          // 脚底位置
    this.velocity = new THREE.Vector3();
    this.yaw = 0;                           // 左右转（绕 Y 轴）
    this.pitch = 0;                         // 上下看（绕 X 轴）
    this.recoilPitch = 0;                   // 后坐力造成的额外上抬
    this.onGround = false;
    this.bobPhase = 0;
    this.lastLook = { x: 0, y: 0 };         // 本帧鼠标移动量，给枪模晃动用

    // 下蹲：crouching 是"想不想蹲"，crouchT 是实际蹲下去的程度（0 站 → 1 蹲），平滑过渡
    this.crouching = false;
    this.crouchT = 0;
    this.height = Game.Config.player.height;   // 当前碰撞盒高度（蹲下会变矮）
    this.eye = Game.Config.player.eyeHeight;   // 当前眼睛高度

    this.health = Game.Config.player.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this.onDamage = null;                   // (伤害, 攻击者位置) => void
    this.onDeath = null;

    this._box = new THREE.Box3();
    camera.rotation.order = 'YXZ';          // 先左右再上下，FPS 视角的标准顺序
  }

  // 后坐力：由武器调用
  addRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.yaw += yaw;
  }

  takeDamage(amount, fromPos) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (this.onDamage) this.onDamage(amount, fromPos);
    if (this.health <= 0) {
      this.alive = false;
      this.deathTimer = 0;
      if (this.onDeath) this.onDeath();
    }
  }

  horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt, input) {
    const cfg = Game.Config.player;

    // ---- 1. 鼠标转视角 ----
    const look = input.consumeMouse();
    this.lastLook = look;
    const sens = Game.Config.view.mouseSensitivity;
    this.yaw -= look.x * sens;
    this.pitch -= look.y * sens;
    const limit = Math.PI / 2 - 0.01;  // 不能抬头/低头超过 90 度
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

    // 后坐力逐渐回正
    this.recoilPitch -= this.recoilPitch * Math.min(1, Game.Config.weapon.recoilRecover * dt);

    // ---- 2. 下蹲 ----
    // 按住就蹲；松开想站起来时，先确认头顶没东西挡着（蹲在集装箱底下不能直接站起来）
    if (input.isAction('crouch')) {
      this.crouching = true;
    } else if (this.crouching) {
      const { radius, height } = cfg;
      if (Game.Physics.isFree(this.position, radius, height, [this.colliders, this.extraColliders])) this.crouching = false;
    }
    const crouchStep = dt / cfg.crouchTime;
    this.crouchT = this.crouching ? Math.min(1, this.crouchT + crouchStep) : Math.max(0, this.crouchT - crouchStep);
    this.height = cfg.height + (cfg.crouchHeight - cfg.height) * this.crouchT;
    this.eye = cfg.eyeHeight + (cfg.crouchEyeHeight - cfg.eyeHeight) * this.crouchT;

    // ---- 3. 计算想要移动的方向 ----
    let f = 0, s = 0;
    if (input.isAction('forward')) f += 1;
    if (input.isAction('back')) f -= 1;
    if (input.isAction('right')) s += 1;
    if (input.isAction('left')) s -= 1;

    // 根据朝向把"前/右"换算成世界坐标
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }  // 斜着走不能比直走快

    let speed = input.isAction('sprint') ? cfg.sprintSpeed : cfg.walkSpeed;
    if (this.crouchT > 0) speed = speed + (cfg.crouchSpeed - speed) * this.crouchT;

    // 当前速度以"加速度"为上限，逐渐逼近目标速度 → 有起步和刹车的惯性
    const accel = this.onGround ? cfg.groundAccel : cfg.airAccel;
    const dvx = wx * speed - this.velocity.x;
    const dvz = wz * speed - this.velocity.z;
    const dv = Math.hypot(dvx, dvz);
    const maxStep = accel * dt;
    if (dv <= maxStep) {
      this.velocity.x += dvx;
      this.velocity.z += dvz;
    } else {
      this.velocity.x += (dvx / dv) * maxStep;
      this.velocity.z += (dvz / dv) * maxStep;
    }

    // ---- 4. 跳跃和重力 ----
    if (this.onGround && input.isAction('jump')) {
      this.velocity.y = cfg.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= cfg.gravity * dt;

    // ---- 5. 分轴移动 + 碰撞 ----
    if (this.moveAxis('x', this.velocity.x * dt)) this.velocity.x = 0;
    if (this.moveAxis('z', this.velocity.z * dt)) this.velocity.z = 0;
    this.onGround = false;
    if (this.moveAxis('y', this.velocity.y * dt)) {
      if (this.velocity.y < 0) this.onGround = true;  // 往下撞到东西 = 站在地上
      this.velocity.y = 0;
    }

    if (this.position.y < -20) this.respawn();  // 万一掉出地图

    // ---- 6. 摄像机跟随 ----
    const hs = this.horizontalSpeed();
    if (this.onGround && hs > 0.5) this.bobPhase += hs * dt * 2.2;
    const bob = this.onGround ? Math.sin(this.bobPhase) * cfg.headBob * Math.min(1, hs / cfg.walkSpeed) : 0;

    this.camera.position.set(this.position.x, this.position.y + this.eye + bob, this.position.z);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, 0);
  }

  // 阵亡后：镜头慢慢倒向地面
  updateDead(dt) {
    this.deathTimer += dt;
    const p = Math.min(1, this.deathTimer / 0.8);
    const eye = this.eye;
    this.camera.position.y = this.position.y + eye - (eye - 0.3) * p * p;
    this.camera.rotation.z = 0.5 * p;
  }

  moveAxis(axis, delta) {
    const { radius, stepHeight } = Game.Config.player;
    // 只有站在地上时才自动上台阶，空中撞到箱子边缘不会"吸"上去
    const step = axis !== 'y' && this.onGround ? stepHeight : 0;
    return Game.Physics.moveAxis(this.position, axis, delta, radius, this.height,
      [this.colliders, this.extraColliders], step);
  }

  // 碰撞盒 / 被 NPC 射击时的判定盒。蹲下时会变矮，所以蹲在沙袋后面真的能躲子弹
  getBox() {
    const r = Game.Config.player.radius;
    const p = this.position;
    this._box.min.set(p.x - r, p.y, p.z - r);
    this._box.max.set(p.x + r, p.y + this.height, p.z + r);
    return this._box;
  }

  // 换出生点：spot = { x, y?, z, yaw }
  setSpawn(spot) {
    this.spawn.set(spot.x, spot.y || 0, spot.z);
    this.spawnYaw = spot.yaw || 0;
  }

  respawn() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = this.spawnYaw || 0;
    this.pitch = this.recoilPitch = 0;
    this.crouching = false;
    this.crouchT = 0;
    this.height = Game.Config.player.height;
    this.eye = Game.Config.player.eyeHeight;
  }

  // 满血复活（开新一局，或者对决里被击杀后重生）
  reset() {
    this.respawn();
    this.health = Game.Config.player.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this.camera.rotation.z = 0;
  }
};
