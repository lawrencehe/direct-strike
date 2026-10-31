// ============================================================
// NPC 敌人 + 波次管理
//
// 每个 NPC 是一个"状态机"，在几种状态之间切换：
//   patrol（巡逻）  ：在场地里随便走，没发现玩家
//   combat（交战）  ：看见玩家 → 反应一下 → 转身、左右横移、点射
//   search（搜索）  ：玩家躲起来了 → 跑去最后看见玩家的地方找
//   dead（阵亡）    ：向后倒下，几秒后消失
//
// "看见"的判断（感知）有三个条件，全部满足才算看见：
//   1. 距离够近   2. 在视野角度内（背后看不见）   3. 中间没有墙挡着（射线检测）
// ============================================================
Game.Bots = (function () {
  const RADIUS = 0.3;
  const HEIGHT = 1.8;
  const EYE = 1.6;
  const MUZZLE = new THREE.Vector3(0.1, 1.37, -0.8);  // 枪口在模型里的位置

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  // 把角度限制在 -π ~ π，用于计算"还要转多少度"
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // 朝向 (dx, dz) 方向所需的 yaw（和玩家用同一套约定：yaw=0 朝 -z）
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

  // ---------------- 模型 ----------------
  // 用方块拼一个士兵，原点在脚底，面朝 -z
  function buildModel() {
    const mats = {
      shirt: new THREE.MeshStandardMaterial({ color: 0x9a3b2e, roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xc89a74, roughness: 0.8 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0x2f3328, roughness: 0.7 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.5 }),
    };
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const hitMeshes = [];

    const box = (w, h, d, x, y, z, mat, part, parent = root) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.userData.part = part;  // head / body / leg / null（打到枪上不算伤害）
      parent.add(m);
      hitMeshes.push(m);
      return m;
    };

    // 腿：挂在髋部的转轴上，走路时前后摆动
    const legs = [-0.12, 0.12].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.85, 0);
      root.add(hip);
      box(0.19, 0.85, 0.22, 0, -0.425, 0, mats.pants, 'leg', hip);
      return hip;
    });

    box(0.5, 0.62, 0.3, 0, 1.16, 0, mats.shirt, 'body');           // 躯干
    box(0.26, 0.28, 0.28, 0, 1.62, 0, mats.skin, 'head');          // 头
    box(0.32, 0.1, 0.34, 0, 1.79, 0, mats.helmet, 'head');         // 头盔
    box(0.12, 0.12, 0.45, 0.24, 1.3, -0.2, mats.shirt, 'body');    // 右臂
    box(0.12, 0.12, 0.4, -0.12, 1.3, -0.32, mats.shirt, 'body');   // 左臂
    box(0.07, 0.1, 0.62, 0.1, 1.36, -0.48, mats.gun, null);        // 枪

    return { root, legs, hitMeshes, flashMats: [mats.shirt, mats.pants, mats.skin] };
  }

  // ---------------- 单个 NPC ----------------
  class Bot {
    constructor(manager, x, z, skill) {
      this.mgr = manager;
      this.skill = skill;              // 0 ~ 1，波次越高越强
      this.pos = new THREE.Vector3(x, 0, z);
      this.vel = new THREE.Vector3();
      this.yaw = Math.PI;              // 出生时面向玩家那一侧（+z）
      this.health = Game.Config.bots.health;
      this.alive = true;
      this.state = 'patrol';

      this.waypoint = null;
      this.seesPlayer = false;
      this.lastSeen = new THREE.Vector3();
      this.alertTimer = 0;             // 被打后的一段时间里，背后也"看得见"
      this.perceiveTimer = Math.random() * 0.2;
      this.reaction = 0;
      this.burstLeft = 0;
      this.fireTimer = 0;
      this.strafeDir = 0;
      this.strafeTimer = 0;
      this.searchTimer = 0;

      this.progressTimer = 0;          // 卡住检测
      this.progressFrom = this.pos.clone();
      this.detour = null;
      this.detourTimer = 0;
      this.detourSide = 1;
      this.stuckCount = 0;

      this.walkPhase = 0;
      this.flash = 0;
      this.deathTimer = 0;

      this.box = new THREE.Box3();
      this.updateBox();

      const model = buildModel();
      this.model = model;
      for (const m of model.hitMeshes) m.userData.bot = this;
      manager.scene.add(model.root);
      this.syncModel(0);
    }

    get meshes() { return this.model.hitMeshes; }

    updateBox() {
      this.box.min.set(this.pos.x - RADIUS, this.pos.y, this.pos.z - RADIUS);
      this.box.max.set(this.pos.x + RADIUS, this.pos.y + HEIGHT, this.pos.z + RADIUS);
    }

    // 被玩家打中。返回 null 表示已经死了（打尸体不算）
    takeDamage(part) {
      if (!this.alive) return null;
      this.health -= Game.Config.weapon.damage[part];
      this.flash = 1;

      // 被打了就警觉：转身找玩家
      this.alertTimer = 3;
      this.perceiveTimer = 0;
      if (!this.seesPlayer) {
        this.state = 'search';
        this.lastSeen.copy(this.mgr.player.position);
        this.searchTimer = Game.Config.bots.searchTime;
      }

      if (this.health <= 0) {
        this.alive = false;
        this.state = 'dead';
        this.mgr.onBotKilled(this);
        return { killed: true };
      }
      return { killed: false };
    }

    // 返回 true 表示可以从场景里移除了
    update(dt) {
      if (!this.alive) {
        this.deathTimer += dt;
        const p = Math.min(1, this.deathTimer / 0.45);
        this.model.root.rotation.x = (Math.PI / 2) * p * p;  // 向后倒
        return this.deathTimer > 5;
      }

      const cfg = Game.Config.bots;
      const player = this.mgr.player;
      const dx = player.position.x - this.pos.x;
      const dz = player.position.z - this.pos.z;
      const dist = Math.hypot(dx, dz);

      // ---- 感知：每 0.15 秒看一次，不用每帧都做射线检测 ----
      this.alertTimer -= dt;
      this.perceiveTimer -= dt;
      if (this.perceiveTimer <= 0) {
        this.perceiveTimer = 0.15;
        this.perceive(dx, dz, dist);
      }

      // ---- 根据状态决定：往哪走、多快、面朝哪 ----
      let mx = 0, mz = 0, speed = 0, faceYaw = this.yaw;

      if (this.state === 'patrol') {
        if (!this.waypoint || Math.hypot(this.waypoint.x - this.pos.x, this.waypoint.z - this.pos.z) < 1) {
          this.waypoint = this.mgr.randomPoint();
        }
        mx = this.waypoint.x - this.pos.x;
        mz = this.waypoint.z - this.pos.z;
        speed = cfg.walkSpeed;
      } else if (this.state === 'combat') {
        faceYaw = yawTo(dx, dz);
        const [near, far] = cfg.preferredRange;
        const fwd = dist > far ? 1 : dist < near ? -1 : 0;  // 太远靠近，太近后退

        // 每隔一两秒换一次横移方向，0 表示站定射击
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeDir = [-1, 0, 1][randInt(0, 2)];
          this.strafeTimer = rand(0.8, 2);
        }
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        mx = nx * fwd - nz * this.strafeDir;
        mz = nz * fwd + nx * this.strafeDir;
        speed = cfg.walkSpeed;

        this.updateFiring(dt, faceYaw);
      } else if (this.state === 'search') {
        mx = this.lastSeen.x - this.pos.x;
        mz = this.lastSeen.z - this.pos.z;
        if (Math.hypot(mx, mz) < 1.5) {
          mx = mz = 0;
          faceYaw = this.yaw + 1;  // 到了就原地转圈张望（转速受 turnSpeed 限制）
        }
        speed = cfg.runSpeed;
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) { this.state = 'patrol'; this.waypoint = null; }
      }

      const mlen = Math.hypot(mx, mz);
      if (mlen > 0.001) {
        mx /= mlen; mz /= mlen;
        if (this.state !== 'combat') faceYaw = yawTo(mx, mz);
      } else {
        speed = 0;
      }

      // ---- 转身：每秒最多转 turnSpeed 弧度，不会瞬间甩过来 ----
      const turn = cfg.turnSpeed * (1 + this.skill) * dt;
      const diff = wrapAngle(faceYaw - this.yaw);
      this.yaw += Math.max(-turn, Math.min(turn, diff));

      this.move(dt, mx, mz, speed);
      this.syncModel(dt);
      return false;
    }

    perceive(dx, dz, dist) {
      const cfg = Game.Config.bots;
      const player = this.mgr.player;

      let canSee = player.alive && dist < cfg.viewDistance;
      if (canSee && this.alertTimer <= 0) {
        // 视野角度：朝向和"指向玩家的方向"的夹角
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const cosAngle = (fx * dx + fz * dz) / (dist || 1);
        canSee = cosAngle > Math.cos(THREE.MathUtils.degToRad(cfg.viewAngle / 2));
      }
      if (canSee) {
        const eye = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
        canSee = this.mgr.hasLineOfSight(eye, this.mgr.camera.position);
      }

      if (canSee) {
        if (!this.seesPlayer) {
          // 刚发现玩家：需要一点反应时间才开枪，这是 NPC 显得"像人"的关键
          const [a, b] = cfg.reactionTime;
          this.reaction = rand(a, b) * (1 - 0.4 * this.skill);
        }
        this.seesPlayer = true;
        this.state = 'combat';
        this.lastSeen.copy(player.position);
      } else if (this.seesPlayer) {
        this.seesPlayer = false;
        this.burstLeft = 0;
        this.state = player.alive ? 'search' : 'patrol';
        this.searchTimer = cfg.searchTime;
      }
    }

    // 点射：连开几枪，停一下，再连开几枪
    updateFiring(dt, aimYaw) {
      const cfg = Game.Config.bots;
      if (this.reaction > 0) { this.reaction -= dt; return; }
      this.fireTimer -= dt;
      if (this.fireTimer > 0) return;
      if (Math.abs(wrapAngle(aimYaw - this.yaw)) > 0.15) return;  // 还没转过来

      if (this.burstLeft <= 0) this.burstLeft = randInt(cfg.burstCount[0], cfg.burstCount[1]);
      this.shoot();
      this.burstLeft--;
      this.fireTimer = this.burstLeft > 0 ? cfg.burstInterval : rand(cfg.burstPause[0], cfg.burstPause[1]);
    }

    shoot() {
      const cfg = Game.Config.bots;
      const player = this.mgr.player;
      this.model.root.updateMatrixWorld();
      const muzzle = MUZZLE.clone().applyMatrix4(this.model.root.matrixWorld);

      // 瞄准玩家胸口到头之间的某一点
      const aim = player.position.clone();
      aim.y += rand(1.1, 1.55);
      const dir = aim.sub(muzzle).normalize();

      // 散布：玩家跑得越快、自己在移动，就越打不准；波次越高越准
      const playerMove = Math.min(1, player.horizontalSpeed() / Game.Config.player.walkSpeed);
      const selfMove = this.vel.length() > 0.5 ? 1.4 : 1;
      const spread = cfg.spread * (1 - 0.5 * this.skill) * (1 + playerMove * cfg.moveSpreadMul) * selfMove;

      // 在垂直于 dir 的平面上随机偏一点
      const offset = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      offset.addScaledVector(dir, -offset.dot(dir)).normalize();
      dir.addScaledVector(offset, Math.tan(spread * Math.sqrt(Math.random()))).normalize();

      this.mgr.fireRay(muzzle, dir, this);
    }

    move(dt, mx, mz, speed) {
      // 卡住检测：想走却半天没走出多远 → 往侧面绕一下
      if (this.detourTimer > 0) {
        this.detourTimer -= dt;
        mx = this.detour.x; mz = this.detour.z;
        if (this.detourTimer <= 0) {
          this.progressTimer = 0;            // 绕完重新开始计算进度
          this.progressFrom.copy(this.pos);
        }
        speed = Math.max(speed, Game.Config.bots.walkSpeed);
      } else if (speed > 0) {
        this.progressTimer += dt;
        if (this.progressTimer > 0.6) {
          const moved = this.pos.distanceTo(this.progressFrom);
          if (moved < speed * 0.6 * 0.3) {
            // 连续卡住时坚持往同一侧绕，而且一次比一次绕得远，才能绕过长墙
            if (this.stuckCount === 0) this.detourSide = Math.random() < 0.5 ? 1 : -1;
            this.stuckCount++;
            this.detour = { x: -mz * this.detourSide, z: mx * this.detourSide };
            this.detourTimer = Math.min(3, 0.8 * this.stuckCount);
            if (this.state === 'patrol') this.waypoint = null;
          } else {
            this.stuckCount = 0;
          }
          this.progressTimer = 0;
          this.progressFrom.copy(this.pos);
        }
      }

      let vx = mx * speed, vz = mz * speed;

      // 和其他 NPC 保持距离，避免挤成一团
      for (const other of this.mgr.bots) {
        if (other === this || !other.alive) continue;
        const ox = this.pos.x - other.pos.x, oz = this.pos.z - other.pos.z;
        const d = Math.hypot(ox, oz);
        if (d > 0.01 && d < 1.2) { vx += (ox / d) * 2; vz += (oz / d) * 2; }
      }

      // 速度平滑变化，不会瞬间启停
      const k = Math.min(1, dt * 8);
      this.vel.x += (vx - this.vel.x) * k;
      this.vel.z += (vz - this.vel.z) * k;

      const lists = [this.mgr.colliders, [this.mgr.player.getBox()]];
      if (Game.Physics.moveAxis(this.pos, 'x', this.vel.x * dt, RADIUS, HEIGHT, lists)) this.vel.x = 0;
      if (Game.Physics.moveAxis(this.pos, 'z', this.vel.z * dt, RADIUS, HEIGHT, lists)) this.vel.z = 0;
      this.updateBox();
    }

    syncModel(dt) {
      const root = this.model.root;
      root.position.copy(this.pos);
      root.rotation.y = this.yaw;

      // 走路摆腿
      const speed = Math.hypot(this.vel.x, this.vel.z);
      this.walkPhase += speed * dt * 3.2;
      const swing = Math.sin(this.walkPhase) * 0.6 * Math.min(1, speed / 2);
      this.model.legs[0].rotation.x = swing;
      this.model.legs[1].rotation.x = -swing;

      // 被打中时闪红
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.model.flashMats) m.emissive.setRGB(this.flash * 0.8, 0, 0);
    }

    dispose() {
      this.mgr.scene.remove(this.model.root);
      this.model.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  // ---------------- 波次管理 ----------------
  class Manager {
    constructor({ scene, camera, world, player, audio, hud, effects }) {
      Object.assign(this, { scene, camera, player, audio, hud, effects });
      this.colliders = world.colliders;
      this.obstacles = world.shootables;  // 挡视线、挡子弹的静态物体
      this.bots = [];
      this.raycaster = new THREE.Raycaster();
      this.onChange = null;               // NPC 增减时通知 main.js 更新可射击物体列表
      this.onWaveCleared = null;
      this.active = false;
      this.reset();
    }

    reset() {
      this.bots.forEach((b) => b.dispose());
      this.bots = [];
      this.wave = 0;
      this.phase = 'idle';
      this.timer = 0;
      this.effects.clear();
      if (this.onChange) this.onChange();
    }

    start() {
      this.reset();
      this.active = true;
      this.nextWave();
    }

    stop() {
      this.reset();
      this.active = false;
    }

    nextWave() {
      const cfg = Game.Config.bots;
      this.wave++;
      this.total = Math.min(cfg.maxAlive, cfg.firstWave + cfg.perWave * (this.wave - 1));
      const skill = Math.min(1, (this.wave - 1) * 0.15);

      const used = [];
      for (let i = 0; i < this.total; i++) {
        const p = this.spawnPoint(used);
        used.push(p);
        this.bots.push(new Bot(this, p.x, p.z, skill));
      }
      this.phase = 'fighting';
      this.hud.banner(`第 ${this.wave} 波`);
      this.updateHud();
      if (this.onChange) this.onChange();
    }

    // 出生点：场地远端，彼此至少隔 2 米
    spawnPoint(used) {
      for (let i = 0; i < 30; i++) {
        const p = { x: rand(-24, 24), z: rand(-27, -18) };
        if (used.every((u) => Math.hypot(u.x - p.x, u.z - p.z) > 2) && this.isFree(p)) return p;
      }
      return { x: rand(-20, 20), z: -22 };
    }

    // 巡逻目标点：场地里任意一个不在箱子里的位置
    randomPoint() {
      for (let i = 0; i < 20; i++) {
        const p = { x: rand(-27, 27), z: rand(-27, 27) };
        if (this.isFree(p)) return p;
      }
      return { x: 0, z: 0 };
    }

    isFree(p) {
      const b = new THREE.Box3(
        new THREE.Vector3(p.x - 0.6, 0, p.z - 0.6),
        new THREE.Vector3(p.x + 0.6, HEIGHT, p.z + 0.6)
      );
      return !this.colliders.some((c) => Game.Physics.overlaps(b, c));
    }

    hasLineOfSight(from, to) {
      const dir = to.clone().sub(from);
      const dist = dir.length();
      this.raycaster.set(from, dir.normalize());
      this.raycaster.far = dist;
      return this.raycaster.intersectObjects(this.obstacles, false).length === 0;
    }

    // NPC 开枪：先找射线碰到的第一面墙，再看玩家是不是在墙前面
    fireRay(origin, dir, bot) {
      const maxDist = 120;
      this.raycaster.set(origin, dir);
      this.raycaster.far = maxDist;
      const wall = this.raycaster.intersectObjects(this.obstacles, false)[0];
      const wallDist = wall ? wall.distance : maxDist;

      const hitPlayer = this.raycaster.ray.intersectBox(this.player.getBox(), new THREE.Vector3());
      let end;
      if (this.player.alive && hitPlayer && origin.distanceTo(hitPlayer) < wallDist) {
        end = hitPlayer;
        this.player.takeDamage(Game.Config.bots.damage, bot.pos);
      } else {
        end = wall ? wall.point : origin.clone().addScaledVector(dir, maxDist);
      }

      this.effects.tracer(origin, end);
      this.effects.muzzleFlash(origin);

      // 枪声：离得越远越小声，并根据方向分左右声道
      const dx = origin.x - this.player.position.x, dz = origin.z - this.player.position.z;
      const rel = yawTo(dx, dz) - this.player.yaw;
      this.audio.botShot(-Math.sin(rel), Math.hypot(dx, dz));
    }

    onBotKilled() {
      this.updateHud();
      if (this.onChange) this.onChange();
    }

    aliveCount() { return this.bots.filter((b) => b.alive).length; }

    // 给玩家碰撞用：还活着的 NPC 的碰撞盒
    aliveBoxes() { return this.bots.filter((b) => b.alive).map((b) => b.box); }

    // 给武器射线用：还活着的 NPC 的所有部件
    aliveMeshes() {
      return this.bots.filter((b) => b.alive).flatMap((b) => b.meshes);
    }

    updateHud() {
      this.hud.setWave(this.wave, this.aliveCount(), this.total);
    }

    update(dt) {
      this.effects.update(dt);
      if (!this.active) return;

      for (const bot of this.bots) {
        if (bot.update(dt)) bot.removeMe = true;
      }
      for (const bot of this.bots.filter((b) => b.removeMe)) bot.dispose();
      this.bots = this.bots.filter((b) => !b.removeMe);

      if (this.phase === 'fighting' && this.aliveCount() === 0) {
        this.phase = 'cleared';
        this.timer = Game.Config.bots.wavePause;
        this.hud.banner(`第 ${this.wave} 波完成！`);
        if (this.onWaveCleared) this.onWaveCleared(this.wave);
      } else if (this.phase === 'cleared') {
        this.timer -= dt;
        if (this.timer <= 0) this.nextWave();
      }
    }
  }

  return { Manager };
})();
