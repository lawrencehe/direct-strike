// ============================================================
// NPC 敌人 + 对战模式管理（1v1 对决 / 波次）
//
// 每个 NPC 是一个"状态机"，在几种状态之间切换：
//   patrol（巡逻）  ：在地图标好的巡逻点之间走，没发现玩家
//   combat（交战）  ：看见玩家 → 反应一下 → 转身、左右横移、点射
//   search（搜索）  ：玩家躲起来了 → 跑去最后看见玩家的地方找
//   dead（阵亡）    ：向后倒下，几秒后消失
//
// "看见"的判断（感知）有三个条件，全部满足才算看见：
//   1. 距离够近   2. 在视野角度内（背后看不见）   3. 中间没有墙挡着（射线检测）
//
// 外观（模型、动画、判定盒）在 character.js 里，这里只管"脑子"和位置。
// ============================================================
Game.Bots = (function () {
  const RADIUS = 0.3;
  const HEIGHT = 1.8;
  const EYE = 1.6;

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

  // ---------------- 单个 NPC ----------------
  class Bot {
    constructor(manager, x, z, yaw, skill) {
      this.mgr = manager;
      this.skill = skill;              // 0 ~ 1，越高越强
      this.pos = new THREE.Vector3(x, 0, z);
      this.vel = new THREE.Vector3();
      this.yaw = yaw;
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

      this.deathTimer = 0;
      this.aimPoint = new THREE.Vector3();

      this.box = new THREE.Box3();
      this.updateBox();

      this.model = Game.Character.create();
      for (const m of this.model.hitMeshes) m.userData.bot = this;
      manager.scene.add(this.model.root);
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
      this.model.hitFlash();

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
        this.model.die();
        this.mgr.onBotKilled(this);
        return { killed: true };
      }
      return { killed: false };
    }

    // 返回 true 表示可以从场景里移除了
    update(dt) {
      if (!this.alive) {
        this.deathTimer += dt;
        this.model.update(dt);
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
          this.waypoint = this.mgr.nextNavPoint(this.pos);
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
      const muzzle = this.model.getMuzzle(new THREE.Vector3());

      // 瞄准玩家胸口到头之间的某一点
      const aim = player.position.clone();
      aim.y += rand(0.65, 0.91) * player.height;   // 玩家蹲下时瞄准点也跟着降低
      const dir = aim.sub(muzzle).normalize();

      // 散布：玩家跑得越快、自己在移动，就越打不准；技能越高越准
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
      const cfg = Game.Config.bots;

      // 卡住检测：想走却半天没走出多远 → 往侧面绕一下
      if (this.detourTimer > 0) {
        this.detourTimer -= dt;
        mx = this.detour.x; mz = this.detour.z;
        if (this.detourTimer <= 0) {
          this.progressTimer = 0;            // 绕完重新开始计算进度
          this.progressFrom.copy(this.pos);
        }
        speed = Math.max(speed, cfg.walkSpeed);
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
      this.vel.y -= cfg.gravity * dt;

      const lists = [this.mgr.colliders, [this.mgr.player.getBox()]];
      const P = Game.Physics;
      if (P.moveAxis(this.pos, 'x', this.vel.x * dt, RADIUS, HEIGHT, lists, cfg.stepHeight)) this.vel.x = 0;
      if (P.moveAxis(this.pos, 'z', this.vel.z * dt, RADIUS, HEIGHT, lists, cfg.stepHeight)) this.vel.z = 0;
      if (P.moveAxis(this.pos, 'y', this.vel.y * dt, RADIUS, HEIGHT, lists)) this.vel.y = 0;
      this.updateBox();
    }

    syncModel(dt) {
      this.model.root.position.copy(this.pos);
      // 朝向和速度一起交给模型：它自己决定腿朝哪、上半身扭多少、动画播到哪
      this.model.setMotion(this.vel.x, this.vel.z, this.yaw, dt);

      // 交战时枪口跟着玩家抬高/压低，其他时候平举
      if (this.state === 'combat' && this.mgr.player.alive) {
        this.aimPoint.copy(this.mgr.player.position);
        this.aimPoint.y += 0.76 * this.mgr.player.height;
        this.model.aimAt(this.aimPoint);
      } else {
        this.model.aimAt(null);
      }
      this.model.update(dt);
    }

    dispose() {
      this.mgr.scene.remove(this.model.root);
      this.model.dispose();
    }
  }

  // ---------------- 对战管理 ----------------
  // mode = 'duel'：一个对手，互相击杀后在远处重生，先到 winScore 杀获胜
  // mode = 'waves'：一波波的敌人，清完一波来更多更强的
  class Manager {
    constructor({ scene, camera, world, player, audio, hud, effects }) {
      Object.assign(this, { scene, camera, world, player, audio, hud, effects });
      this.colliders = world.colliders;
      this.obstacles = world.shootables;  // 挡视线、挡子弹的静态物体
      this.bots = [];
      this.raycaster = new THREE.Raycaster();
      this.onChange = null;               // NPC 增减时通知 main.js 更新可射击物体列表
      this.onWaveCleared = null;
      this.onDuelEnd = null;              // (result: 'win' | 'lose') => void
      this.active = false;
      this.mode = null;
      this.reset();
    }

    reset() {
      this.bots.forEach((b) => b.dispose());
      this.bots = [];
      this.wave = 0;
      this.phase = 'idle';
      this.timer = 0;
      this.score = { player: 0, bot: 0 };
      this.effects.clear();
      if (this.onChange) this.onChange();
    }

    start(mode) {
      this.reset();
      this.active = true;
      this.mode = mode;
      if (mode === 'duel') {
        this.phase = 'fighting';
        this.spawnBot(Game.Config.duel.botSkill, this.player.position);
        this.updateHud();
      } else {
        this.nextWave();
      }
    }

    stop() {
      this.reset();
      this.active = false;
      this.mode = null;
    }

    aliveMeshes() {
      const out = [];
      for (const b of this.bots) if (b.alive) out.push(...b.meshes);
      return out;
    }

    aliveBoxes() {
      return this.bots.filter((b) => b.alive).map((b) => b.box);
    }

    // ---- 出生点、巡逻点 ----

    // 离 avoid 最远的几个出生点里随机挑一个（对决时：在对手看不到的另一头重生）
    pickSpawn(avoid, used = []) {
      const list = this.world.spawns
        .filter((s) => this.isFree(s) && used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 2))
        .map((s) => ({ s, d: avoid ? Math.hypot(s.x - avoid.x, s.z - avoid.z) : Math.random() }))
        .sort((a, b) => b.d - a.d);
      if (!list.length) return this.world.spawns[3];
      return list[randInt(0, Math.min(2, list.length - 1))].s;
    }

    spawnBot(skill, avoid, used) {
      const s = this.pickSpawn(avoid, used);
      const bot = new Bot(this, s.x, s.z, s.yaw, skill);
      this.bots.push(bot);
      if (this.onChange) this.onChange();
      return bot;
    }

    // 巡逻：随机挑一个不是脚下的巡逻点
    nextNavPoint(from) {
      const pts = this.world.navPoints.filter((p) => Math.hypot(p.x - from.x, p.z - from.z) > 3);
      return pts[randInt(0, pts.length - 1)] || { x: 0, z: 0 };
    }

    isFree(p) {
      const b = new THREE.Box3(
        new THREE.Vector3(p.x - 0.6, 0, p.z - 0.6),
        new THREE.Vector3(p.x + 0.6, HEIGHT, p.z + 0.6)
      );
      return !this.colliders.some((c) => Game.Physics.overlaps(b, c));
    }

    // ---- 波次 ----
    nextWave() {
      const cfg = Game.Config.bots;
      this.wave++;
      this.total = Math.min(cfg.maxAlive, cfg.firstWave + cfg.perWave * (this.wave - 1));
      const skill = Math.min(1, (this.wave - 1) * 0.15);

      const used = [];
      for (let i = 0; i < this.total; i++) {
        // 波次模式只从北侧出生点出来
        const north = this.world.spawns.filter((s) => s.z < 0 && used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 2));
        const s = north[randInt(0, north.length - 1)] || this.world.spawns[3];
        used.push(s);
        this.bots.push(new Bot(this, s.x + rand(-1, 1), s.z + rand(-1, 1), s.yaw, skill));
      }
      this.phase = 'fighting';
      this.hud.banner(`第 ${this.wave} 波`);
      this.updateHud();
      if (this.onChange) this.onChange();
    }

    // ---- 视线和射击 ----
    hasLineOfSight(from, to) {
      const dir = to.clone().sub(from);
      const dist = dir.length();
      this.raycaster.set(from, dir.normalize());
      this.raycaster.far = dist;
      return this.raycaster.intersectObjects(this.obstacles, false).length === 0;
    }

    // NPC 开枪：先看射线有没有被墙挡住，再看有没有穿过玩家的碰撞盒
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

    // ---- 击杀和回合 ----
    onBotKilled(bot) {
      if (this.mode === 'duel') {
        this.score.player++;
        this.updateHud();
        this.hud.banner('击杀！', 1.2);
        if (this.score.player >= Game.Config.duel.winScore) {
          this.phase = 'over';
          if (this.onDuelEnd) this.onDuelEnd('win');
        } else {
          this.phase = 'respawning';
          this.timer = Game.Config.duel.respawnDelay;
        }
      }
      if (this.onChange) this.onChange();
    }

    // 玩家被击杀（由 main.js 调用）。返回 true 表示对决还没结束、玩家会重生
    onPlayerKilled() {
      if (this.mode !== 'duel' || this.phase === 'over') return false;
      this.score.bot++;
      this.updateHud();
      if (this.score.bot >= Game.Config.duel.winScore) {
        this.phase = 'over';
        if (this.onDuelEnd) this.onDuelEnd('lose');
        return false;
      }
      return true;
    }

    // 玩家重生点：离对手最远
    playerSpawn() {
      const enemy = this.bots.find((b) => b.alive);
      return this.pickSpawn(enemy ? enemy.pos : null);
    }

    updateHud() {
      if (this.mode === 'duel') {
        this.hud.setScore(this.score.player, this.score.bot, Game.Config.duel.winScore);
      } else {
        this.hud.setWave(this.wave, this.bots.filter((b) => b.alive).length, this.total);
      }
    }

    update(dt) {
      this.effects.update(dt);
      if (!this.active || this.phase === 'over') return;   // 分出胜负后 NPC 停下来

      for (const b of this.bots) {
        if (b.update(dt)) { b.dispose(); b.remove = true; }
      }
      if (this.bots.some((b) => b.remove)) {
        this.bots = this.bots.filter((b) => !b.remove);
      }

      if (this.mode === 'duel') {
        if (this.phase === 'respawning') {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.phase = 'fighting';
            this.spawnBot(Game.Config.duel.botSkill, this.player.position);
          }
        }
        return;
      }

      // 波次模式
      if (this.phase === 'fighting') {
        const alive = this.bots.filter((b) => b.alive).length;
        this.updateHud();
        if (alive === 0) {
          this.phase = 'pause';
          this.timer = Game.Config.bots.wavePause;
          this.hud.banner(`第 ${this.wave} 波清空`, 2);
          if (this.onWaveCleared) this.onWaveCleared();
        }
      } else if (this.phase === 'pause') {
        this.timer -= dt;
        if (this.timer <= 0) this.nextWave();
      }
    }
  }

  return { Manager };
})();
