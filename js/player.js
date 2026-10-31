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

    // ---- 2. 计算想要移动的方向 ----
    let f = 0, s = 0;
    if (input.isDown('KeyW')) f += 1;
    if (input.isDown('KeyS')) f -= 1;
    if (input.isDown('KeyD')) s += 1;
    if (input.isDown('KeyA')) s -= 1;

    // 根据朝向把"前/右"换算成世界坐标
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }  // 斜着走不能比直走快

    const speed = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? cfg.sprintSpeed : cfg.walkSpeed;

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

    // ---- 3. 跳跃和重力 ----
    if (this.onGround && input.isDown('Space')) {
      this.velocity.y = cfg.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= cfg.gravity * dt;

    // ---- 4. 分轴移动 + 碰撞 ----
    if (this.moveAxis('x', this.velocity.x * dt)) this.velocity.x = 0;
    if (this.moveAxis('z', this.velocity.z * dt)) this.velocity.z = 0;
    this.onGround = false;
    if (this.moveAxis('y', this.velocity.y * dt)) {
      if (this.velocity.y < 0) this.onGround = true;  // 往下撞到东西 = 站在地上
      this.velocity.y = 0;
    }

    if (this.position.y < -20) this.respawn();  // 万一掉出地图

    // ---- 5. 摄像机跟随 ----
    const hs = this.horizontalSpeed();
    if (this.onGround && hs > 0.5) this.bobPhase += hs * dt * 2.2;
    const bob = this.onGround ? Math.sin(this.bobPhase) * cfg.headBob * Math.min(1, hs / cfg.walkSpeed) : 0;

    this.camera.position.set(this.position.x, this.position.y + cfg.eyeHeight + bob, this.position.z);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, 0);
  }

  // 阵亡后：镜头慢慢倒向地面
  updateDead(dt) {
    this.deathTimer += dt;
    const p = Math.min(1, this.deathTimer / 0.8);
    const eye = Game.Config.player.eyeHeight;
    this.camera.position.y = this.position.y + eye - (eye - 0.3) * p * p;
    this.camera.rotation.z = 0.5 * p;
  }

  moveAxis(axis, delta) {
    const { radius, height } = Game.Config.player;
    return Game.Physics.moveAxis(this.position, axis, delta, radius, height,
      [this.colliders, this.extraColliders]);
  }

  getBox() {
    const { radius: r, height: h } = Game.Config.player;
    const p = this.position;
    this._box.min.set(p.x - r, p.y, p.z - r);
    this._box.max.set(p.x + r, p.y + h, p.z + r);
    return this._box;
  }

  respawn() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = this.pitch = this.recoilPitch = 0;
  }

  // 开新一局：满血复活
  reset() {
    this.respawn();
    this.health = Game.Config.player.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this.camera.rotation.z = 0;
  }
};
