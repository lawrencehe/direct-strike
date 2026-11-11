// ============================================================
// NPC 敌人 + 对战模式管理（1v1 对决 / 波次）
//
// 每个 NPC 是一个"状态机"，在几种状态之间切换：
//   patrol（巡逻）  ：在地图标好的巡逻点之间走，没发现玩家
//   combat（交战）  ：看见玩家 → 反应一下 → 转身、左右横移、点射
//   search（搜索）  ：玩家躲起来了 → 去推算的玩家位置找，没找到就去附近"从这看不到"的点接着找（#54）
//   dead（阵亡）    ：布娃娃倒下、流血，几秒后消失（见 ragdoll.js）
//
// 装备和玩家一样（config.js 的 weapons 和 grenades）：
//   AK 打空了，玩家离得近就掏手枪，远了就换弹；脱离交战后收起手枪、把 AK 换满。
//   手雷 / 闪光：玩家躲起来后，等一小会儿再判断玩家躲到了哪：
//     按玩家消失时的移动方向往前推（推到墙就停），玩家开枪会暴露位置（听声音）。
//     出手前用 grenades.simulate 把几种角度、力度都预演一遍（反弹、滚动、引信都算），
//     挑爆点离目标最近、视线没被挡住的那一种；怎么丢都炸不到就不丢，留着。
//   丢闪光后背过身去，免得闪到自己。烟雾：血少时丢在自己和玩家之间，然后后撤。
//
// 张望（#54）：没看见玩家时（巡逻、搜索）视线不只盯着脚下的路，每隔一会儿往左右扫一眼，
//   有线索（推算 / 听到的位置）时多往那边看；确定玩家在哪（刚看见、刚听到枪声、刚被打）时才直奔过去、只盯着那边。
//   视线就是 NPC 的朝向，感知用的也是它，所以张望能更早发现从侧面摸过来的玩家。
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
    constructor(manager, x, z, yaw, skill, guns) {
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
      this.lastSeenVel = new THREE.Vector3();   // 最后看见时玩家的水平速度（推算玩家躲到了哪）
      this.sinceSeen = 0;              // 离最后一次看见（或听见）玩家过了几秒
      this.nadeDelay = 0;              // 丢失视线后等多久才决定丢不丢雷
      this.alertTimer = 0;            // 被打后的一段时间里，背后也"看得见"
      this.perceiveTimer = Math.random() * 0.2;
      this.reaction = 0;
      this.burstLeft = 0;
      this.fireTimer = 0;
      this.strafeDir = 0;
      this.strafeTimer = 0;
      this.searchTimer = 0;
      this.searchOrigin = new THREE.Vector3();   // 这次搜索的出发点：推算 / 听到的玩家位置
      this.searchPos = new THREE.Vector3();      // 现在要去查看的点
      this.searchVisited = [];                   // 这次搜索已经看过的点
      this.searchPause = 0;                      // 到了一个点，站住张望的剩余时间
      this.pauseYaw = 0;                         // 站住张望时以哪个方向为中心
      this.hasIntel = false;                     // 知不知道玩家大概在哪（看见过、听见过、被打过）
      this.scanTimer = 0;                        // 张望：多久后换一个方向看
      this.scanOffset = 0;                       // 张望：视线偏离"中心方向"多少弧度
      this.scanSide = Math.random() < 0.5 ? 1 : -1;

      this.progressTimer = 0;          // 卡住检测
      this.progressFrom = this.pos.clone();
      this.detour = null;
      this.detourTimer = 0;
      this.detourSide = 1;
      this.stuckCount = 0;

      this.deathTimer = 0;
      this.aimPoint = new THREE.Vector3();
      this.blind = 0;                  // 被闪光弹致盲的剩余时间

      // 装备：和玩家同一套枪（loadout 里随机挑的主 / 副武器，#54）+ 三种雷。
      // 子弹也和玩家开局一样：枪里一个弹匣 + spareMags 个备用弹匣，NPC 买不了（#7）
      const G = Game.Config.grenades;
      this.gunKeys = guns;
      this.gun = { rifle: Game.Settings.gunConfig('rifle', guns.rifle), pistol: Game.Settings.gunConfig('pistol', guns.pistol) };
      const W = { ...this.gun, spareMags: Game.Config.weapons.spareMags };
      this.weapon = 'rifle';
      this.ammo = { rifle: W.rifle.magSize, pistol: W.pistol.magSize };                         // 枪里的
      this.reserve = { rifle: W.spareMags * W.rifle.magSize, pistol: W.spareMags * W.pistol.magSize };   // 备弹
      this.reloadT = 0;                // 换弹剩余时间
      this.switchT = 0;                // 切枪剩余时间
      this.switchTo = null;
      this.nades = { frag: G.frag.count, flash: G.flash.count, smoke: G.smoke.count };
      this.throwing = null;            // 正在丢的雷：{ kind, target, t, released }
      this.nadeCooldown = rand(1, 3);
      this.lookAway = 0;               // 丢完闪光背过身的剩余时间
      this.retreatT = 0;               // 丢完烟后撤的剩余时间
      this.nadeChecked = false;        // 这次丢失视线后是否已经考虑过丢雷
      this.bleedTime = 0;              // 尸体还要流多久的血
      this.pooled = false;             // 血泊是不是已经开始渗了
      this.bloodPos = new THREE.Vector3();

      this.box = new THREE.Box3();
      this.updateBox();

      this.model = Game.Character.create(guns);
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
    // hit: { part, point, dir, force, explosion } 决定死法和血往哪喷，见 ragdoll.js
    takeDamage(amount, hit = {}) {
      if (!this.alive) return null;
      this.health -= amount;
      this.model.hitFlash();

      // 被玩家打了就警觉：转身找玩家（被自己人的雷炸到不算）
      if (!hit.byBot) this.alertTimer = 3;
      this.perceiveTimer = 0;
      if (!this.seesPlayer && !hit.byBot) {
        this.lastSeen.copy(this.mgr.player.position);
        this.lastSeenVel.set(0, 0, 0);
        this.sinceSeen = 0;
        this.startSearch(this.lastSeen);
      }

      if (this.health <= 0) {
        this.alive = false;
        this.state = 'dead';
        this.model.setWeapon(this.weapon, true);   // 丢雷时死了，枪也要掉出来
        const head = hit.part === 'head';
        this.model.flash = 0;   // 闪红是"打中了但没死"的反馈，死的时候看血和动作
        this.model.die({ ...hit, vel: this.vel, colliders: this.mgr.colliders });
        if (hit.point && hit.dir) this.mgr.effects.bloodBurst(hit.point, hit.dir, head);
        this.bleedTime = head ? 2.2 : 1.4;
        this.bleedRate = head ? 26 : 12;
        this.poolSize = head ? 0.95 : 0.8;
        this.mgr.onBotKilled(this, hit);
        return { killed: true };
      }
      return { killed: false };
    }

    // 返回 true 表示可以从场景里移除了
    update(dt) {
      if (!this.alive) {
        this.deathTimer += dt;
        this.model.update(dt);
        this.updateBleeding(dt);
        return this.deathTimer > Game.Config.ragdoll.corpseTime;
      }

      const cfg = Game.Config.bots;
      const player = this.mgr.player;
      const dx = player.position.x - this.pos.x;
      const dz = player.position.z - this.pos.z;
      const dist = Math.hypot(dx, dz);

      // ---- 感知：每 0.15 秒看一次，不用每帧都做射线检测 ----
      this.alertTimer -= dt;
      this.perceiveTimer -= dt;
      this.sinceSeen += dt;
      if (this.perceiveTimer <= 0) {
        this.perceiveTimer = 0.15;
        this.perceive(dx, dz, dist);
      }

      this.updateWeapons(dt);
      this.nadeCooldown -= dt;
      if (this.blind <= 0 && !this.throwing) this.considerGrenade(dist);

      // ---- 根据状态决定：往哪走、多快、面朝哪 ----
      let mx = 0, mz = 0, speed = 0, faceYaw = this.yaw;
      let roam = false, sure = false;   // roam：巡逻 / 搜索（可以张望）；sure：确定玩家在哪

      if (this.blind > 0) {
        // 被闪了：什么都看不见，站在原地晃脑袋，等恢复后再重新发现玩家
        this.blind -= dt;
        faceYaw = this.yaw + Math.sin(this.blind * 4) * 0.6;
      } else if (this.throwing) {
        // 丢雷：站定、面朝落点
        const tg = this.throwing.target;
        faceYaw = yawTo(tg.x - this.pos.x, tg.z - this.pos.z);
        this.updateThrow(dt);
      } else if (this.lookAway > 0) {
        // 闪光弹快炸了：背对落点等它炸完
        this.lookAway -= dt;
        faceYaw = yawTo(this.pos.x - this.flashAt.x, this.pos.z - this.flashAt.z);
      } else if (this.retreatT > 0) {
        // 烟雾掩护下后撤：背离玩家跑，枪口还对着玩家的方向
        this.retreatT -= dt;
        faceYaw = yawTo(dx, dz);
        mx = -dx; mz = -dz;
        speed = cfg.runSpeed;
      } else if (this.state === 'patrol') {
        if (!this.waypoint || Math.hypot(this.waypoint.x - this.pos.x, this.waypoint.z - this.pos.z) < 1) {
          this.waypoint = this.mgr.nextNavPoint(this.pos, this.hasIntel ? this.lastSeen : null);
        }
        mx = this.waypoint.x - this.pos.x;
        mz = this.waypoint.z - this.pos.z;
        speed = cfg.walkSpeed;
        roam = true;
      } else if (this.state === 'combat' && this.outOfAmmo()) {
        // 两把枪都打空了，又买不了：背离玩家跑开，不再交战（还能丢雷的话 considerGrenade 照样会丢）
        mx = -dx; mz = -dz;
        speed = cfg.runSpeed;
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
        // 确定玩家在哪（刚丢失视线、刚听到枪声）：跑过去；拿不准：放慢脚步，边走边张望
        sure = this.sinceSeen < cfg.sureTime;
        mx = this.searchPos.x - this.pos.x;
        mz = this.searchPos.z - this.pos.z;
        if (this.searchPause > 0) {
          this.searchPause -= dt;
          mx = mz = 0;
        } else if (this.reachedSpot(Math.hypot(mx, mz))) {
          // 到了（或者走近了已经看清那里）还没看见：站住张望一下，再去附近下一个"从这看不到"的地方（人多半躲在掩体后面）
          this.searchVisited.push(this.searchPos.clone());
          const next = this.nextSearchSpot();
          if (next) this.searchPos.set(next.x, 0, next.z);
          this.pauseYaw = next ? yawTo(next.x - this.pos.x, next.z - this.pos.z) : this.yaw;
          this.searchPause = rand(cfg.searchPause[0], cfg.searchPause[1]);
          this.scanTimer = 0;
          mx = mz = 0;
        }
        speed = sure ? cfg.runSpeed : cfg.searchSpeed;
        roam = true;
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) { this.state = 'patrol'; this.waypoint = null; }
      }

      const mlen = Math.hypot(mx, mz);
      if (mlen > 0.001) {
        mx /= mlen; mz /= mlen;
        if (this.state !== 'combat' && this.retreatT <= 0) faceYaw = yawTo(mx, mz);
      } else {
        speed = 0;
      }
      if (roam && !sure) {
        // 张望：走路时以前进方向为中心，站住时以 pauseYaw 为中心、扫得更开；有线索就多往线索那边看
        const focus = this.hasIntel ? yawTo(this.searchOrigin.x - this.pos.x, this.searchOrigin.z - this.pos.z) : null;
        const focusYaw = this.state === 'search' ? focus
          : this.hasIntel ? yawTo(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z) : null;
        faceYaw = mlen > 0.001 ? this.lookAround(dt, faceYaw, focusYaw, 1) : this.lookAround(dt, this.pauseYaw, focusYaw, cfg.scanStandMul);
      }

      // ---- 转身：每秒最多转 turnSpeed 弧度，不会瞬间甩过来 ----
      const turn = cfg.turnSpeed * (1 + this.skill) * dt;
      const diff = wrapAngle(faceYaw - this.yaw);
      this.yaw += Math.max(-turn, Math.min(turn, diff));

      this.move(dt, mx, mz, speed);
      this.syncModel(dt);
      return false;
    }

    // 被闪光弹闪到
    flash(seconds) {
      this.blind = Math.max(this.blind, seconds);
      this.perceiveTimer = 0;
      this.burstLeft = 0;
    }

    // 倒地后：伤口流一阵血，身体落稳后地上慢慢渗出一滩
    updateBleeding(dt) {
      const pos = this.model.woundPos(this.bloodPos);
      if (this.bleedTime > 0) {
        this.bleedTime -= dt;
        this.mgr.effects.bleed(pos, dt, this.bleedRate);
      }
      if (!this.pooled && this.deathTimer > 0.35 && (this.model.woundSpeed() < 1 || this.deathTimer > 1.8)) {
        this.pooled = true;
        this.mgr.effects.bloodPool(pos, this.poolSize);
      }
    }

    perceive(dx, dz, dist) {
      const cfg = Game.Config.bots;
      const player = this.mgr.player;

      let canSee = player.alive && dist < cfg.viewDistance && this.blind <= 0;
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
        this.hasIntel = true;
        this.nadeChecked = false;
        this.state = 'combat';
        this.lastSeen.copy(player.position);
        this.lastSeenVel.set(player.velocity.x, 0, player.velocity.z);
        this.sinceSeen = 0;
      } else if (this.seesPlayer) {
        this.seesPlayer = false;
        this.burstLeft = 0;
        this.nadeDelay = rand(cfg.nadeDelay[0], cfg.nadeDelay[1]);
        if (player.alive) this.startSearch(this.guessPlayer(cfg.predictTime));   // 去玩家多半躲到的地方，不是他消失的地方
        else { this.state = 'patrol'; this.waypoint = null; }
      }
    }

    // 听见玩家开枪（pos 是玩家的位置）：看不见玩家时，知道玩家大概在哪了，跑过去找、可以再丢一次雷
    hear(pos) {
      const cfg = Game.Config.bots;
      if (this.seesPlayer || this.blind > 0) return;
      if (Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) > cfg.hearRange) return;
      const a = Math.random() * Math.PI * 2, r = Math.random() * cfg.hearError;   // 听声辨位不会太准
      this.lastSeen.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
      this.lastSeenVel.set(0, 0, 0);
      this.sinceSeen = 0;
      if (this.state !== 'search') this.nadeDelay = rand(cfg.nadeDelay[0], cfg.nadeDelay[1]);
      this.startSearch(this.lastSeen);
      this.nadeChecked = false;
    }

    // 开始（或重新）搜索：先去 pos（推算 / 听到的玩家位置）
    startSearch(pos) {
      this.state = 'search';
      this.hasIntel = true;
      this.searchTimer = Game.Config.bots.searchTime;
      this.searchOrigin.set(pos.x, 0, pos.z);
      this.searchPos.copy(this.searchOrigin);
      this.searchVisited.length = 0;
      this.searchPause = 0;
    }

    // 搜索点算不算查看过了：走到 2 米内，或者 5 米内已经能看清那里（点贴着箱子时走不到正上方）
    reachedSpot(d) {
      if (d < 2) return true;
      if (d > 5) return false;
      this._eye = this._eye || new THREE.Vector3();
      this._spot = this._spot || new THREE.Vector3();
      this._eye.set(this.pos.x, this.pos.y + EYE, this.pos.z);
      this._spot.set(this.searchPos.x, 1.2, this.searchPos.z);
      return this.mgr.hasLineOfSight(this._eye, this._spot);
    }

    // 搜索的下一个点：离出发点 searchRadius 以内、从自己这里看不到（看得到的地方已经看过了，人不在那）、
    // 这次还没去过的巡逻点里，离出发点最近的（带一点随机）。没有就返回 null，原地张望到搜索结束
    nextSearchSpot() {
      const cfg = Game.Config.bots;
      const eye = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
      const p = new THREE.Vector3();
      let best = null, bestScore = Infinity;
      for (const n of this.mgr.world.navPoints) {
        const fromOrigin = Math.hypot(n.x - this.searchOrigin.x, n.z - this.searchOrigin.z);
        if (fromOrigin > cfg.searchRadius || Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 2) continue;
        if (this.searchVisited.some((v) => Math.hypot(v.x - n.x, v.z - n.z) < 1.5)) continue;
        p.set(n.x, (n.y || 0) + 1.2, n.z);
        if (this.mgr.hasLineOfSight(eye, p)) continue;
        const score = fromOrigin + Math.random() * 4;
        if (score < bestScore) { bestScore = score; best = n; }
      }
      return best;
    }

    // 张望：返回这一帧想看的方向。center 是中心方向，focus 是线索方向（null = 没线索），spread 放大张望的幅度
    // 每隔 scanInterval 秒换一个方向：有线索时 scanFocus 的概率看线索那边，scanAhead 的概率看正前方，否则左右交替扫一眼
    lookAround(dt, center, focus, spread) {
      const cfg = Game.Config.bots;
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) {
        this.scanTimer = rand(cfg.scanInterval[0], cfg.scanInterval[1]);
        const max = THREE.MathUtils.degToRad(cfg.scanAngle) * spread;
        const r = Math.random();
        if (focus !== null && r < cfg.scanFocus) {
          this.scanOffset = THREE.MathUtils.clamp(wrapAngle(focus - center), -max, max);
        } else if (r > 1 - cfg.scanAhead) {
          this.scanOffset = 0;   // 也要看路
        } else {
          this.scanSide = -this.scanSide;
          this.scanOffset = this.scanSide * rand(0.5, 1) * max;
        }
      }
      return center + this.scanOffset;
    }

    // 推算玩家现在在哪：从最后看见的位置沿当时的移动方向往前推（最多推 predictTime 秒），
    // 碰到墙就停在墙前（人是躲到掩体后面，不会穿墙）
    // ahead：最多往前推几秒（默认按"丢雷出手时玩家到哪了"算）
    guessPlayer(ahead) {
      const cfg = Game.Config.bots;
      const guess = this.lastSeen.clone();
      const v = this.lastSeenVel;
      const speed = Math.hypot(v.x, v.z);
      if (speed < 0.5) return guess;
      const len = speed * Math.min(ahead ?? this.sinceSeen + cfg.throwTime, cfg.predictTime);
      const from = new THREE.Vector3(guess.x, guess.y + 0.5, guess.z);
      const dir = new THREE.Vector3(v.x / speed, 0, v.z / speed);
      const ray = this.mgr.raycaster;
      ray.set(from, dir);
      ray.far = len + RADIUS + 0.2;
      const hit = ray.intersectObjects(this.mgr.obstacles, false)[0];
      const go = hit ? Math.max(0, hit.distance - RADIUS - 0.2) : len;
      return guess.addScaledVector(dir, go);
    }

    // AK 点射：连开几枪，停一下，再连开几枪；手枪一发一发打
    updateFiring(dt, aimYaw) {
      const cfg = Game.Config.bots;
      if (this.reaction > 0) { this.reaction -= dt; return; }
      this.fireTimer -= dt;
      if (this.fireTimer > 0 || this.busy()) return;
      if (this.ammo[this.weapon] <= 0) return;                     // 等 updateWeapons 换弹或切枪
      if (Math.abs(wrapAngle(aimYaw - this.yaw)) > 0.15) return;  // 还没转过来

      const gun = this.gun[this.weapon];
      this.shoot();
      this.ammo[this.weapon]--;
      if (this.weapon === 'pistol') {
        this.fireTimer = Math.max(gun.fireInterval, rand(cfg.pistolPause[0], cfg.pistolPause[1]));
        return;
      }
      if (this.burstLeft <= 0) this.burstLeft = randInt(cfg.burstCount[0], cfg.burstCount[1]);
      this.burstLeft--;
      this.fireTimer = this.burstLeft > 0 ? gun.fireInterval : rand(cfg.burstPause[0], cfg.burstPause[1]);
    }

    // 两把枪的子弹（枪里和备弹）都没了
    outOfAmmo() {
      return this.ammo.rifle + this.reserve.rifle + this.ammo.pistol + this.reserve.pistol <= 0;
    }

    // 正在换弹、切枪或丢雷，腾不出手开枪
    busy() { return this.reloadT > 0 || this.switchT > 0 || !!this.throwing; }

    // 换弹和切枪。时间和玩家一样：换弹用各枪的 reloadTime，切枪 = 收枪 + 掏枪
    updateWeapons(dt) {
      const W = this.gun;   // 这个 NPC 手上两把枪的数值
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {   // 从备弹里补满弹匣，备弹不够就全装上
          const w = this.weapon, take = Math.min(W[w].magSize - this.ammo[w], this.reserve[w]);
          this.ammo[w] += take;
          this.reserve[w] -= take;
        }
        return;
      }
      if (this.switchT > 0) {
        this.switchT -= dt;
        if (this.switchT <= Game.Config.weapons.switchIn) this.model.setWeapon(this.switchTo, !this.throwing);   // 收完枪，开始掏另一把
        if (this.switchT <= 0) this.weapon = this.switchTo;
        return;
      }
      if (this.throwing) return;

      const cur = this.weapon, other = cur === 'rifle' ? 'pistol' : 'rifle';
      const empty = this.ammo[cur] <= 0;
      const canReload = (w) => this.reserve[w] > 0 && this.ammo[w] < W[w].magSize;
      const hasAny = (w) => this.ammo[w] + this.reserve[w] > 0;
      if (this.state === 'combat') {
        if (!empty) return;
        // AK 打空：近了掏手枪更快，远了换弹；手枪也打空了就看 AK 还有没有子弹。
        // 这把没备弹换不了就切另一把（另一把也空了但有备弹，切过去再换）；两把都一发没有就不动（update 里会跑开）
        const dist = this.pos.distanceTo(this.mgr.player.position);
        const wantPistol = cur === 'rifle' && dist < Game.Config.bots.pistolRange;
        if (this.ammo[other] > 0 && (cur === 'pistol' || wantPistol || !canReload(cur))) this.switchWeapon(other);
        else if (canReload(cur)) this.reload();
        else if (hasAny(other)) this.switchWeapon(other);
      } else {
        // 没在交战：收起手枪（AK 还有子弹的话），把 AK 换满
        if (cur === 'pistol' && hasAny('rifle')) this.switchWeapon('rifle');
        else if (cur === 'rifle' && canReload('rifle')) this.reload();
      }
    }

    reload() {
      this.reloadT = this.gun[this.weapon].reloadTime;
      this.burstLeft = 0;
    }

    switchWeapon(key) {
      const W = Game.Config.weapons;
      this.switchTo = key;
      this.switchT = W.switchOut + W.switchIn;
      this.burstLeft = 0;
    }

    // ---- 投掷物 ----
    considerGrenade(dist) {
      const cfg = Game.Config.bots;
      if (this.nadeCooldown > 0 || this.reloadT > 0 || this.switchT > 0) return;
      const player = this.mgr.player;

      // 交战中血少：在自己和玩家之间丢烟，然后后撤
      if (this.state === 'combat' && this.nades.smoke > 0 && this.health < cfg.smokeHealth && dist > 4) {
        const k = Math.min(6, dist * 0.5) / dist;
        const t = new THREE.Vector3(this.pos.x + (player.position.x - this.pos.x) * k, this.pos.y, this.pos.z + (player.position.z - this.pos.z) * k);
        this.startThrow('smoke', t);
        return;
      }

      // 玩家躲起来了（或开枪暴露了位置）：等一小会儿看玩家往哪躲，再判断一次丢不丢
      if (this.state !== 'search' || this.nadeChecked || this.sinceSeen < this.nadeDelay) return;
      this.nadeChecked = true;
      if (Math.random() > cfg.grenadeChance) return;
      const guess = this.guessPlayer();
      const d = Math.hypot(guess.x - this.pos.x, guess.z - this.pos.z);
      const inRange = (r) => d >= r[0] && d <= r[1];
      const options = [];
      if (this.nades.frag > 0 && inRange(cfg.fragRange)) options.push('frag');
      if (this.nades.flash > 0 && inRange(cfg.flashRange)) options.push('flash');
      // 随机先试一种，预演下来丢不准就试另一种，都不行就不丢
      if (options.length === 2 && Math.random() < 0.5) options.reverse();
      for (const kind of options) {
        if (this.startThrow(kind, guess)) return;
      }
    }

    // 预演出一个能丢准的出手方式才真的开始丢，返回是否开始
    startThrow(kind, target) {
      const plan = this.planThrow(kind, target);
      if (!plan) return false;
      this.nades[kind]--;
      this.throwing = { kind, target, plan, t: 0, released: false };
      this.burstLeft = 0;
      this.model.setWeapon(this.weapon, false);   // 腾出手来：枪先收起
      return true;
    }

    updateThrow(dt) {
      const cfg = Game.Config.bots;
      const th = this.throwing;
      th.t += dt;
      // 先转向落点，转过来了（或者等太久）才出手
      const facing = Math.abs(wrapAngle(yawTo(th.target.x - this.pos.x, th.target.z - this.pos.z) - this.yaw)) < 0.25;
      if (!th.released && (facing || th.t > 1.2) && th.t > cfg.throwTime * 0.5) {
        th.released = true;
        th.t = cfg.throwTime * 0.5;
        this.mgr.grenades.launch(th.kind, th.plan.pos, th.plan.vel, Game.Config.grenades[th.kind].fuse, this);
      }
      if (th.released && th.t >= cfg.throwTime) {
        this.throwing = null;
        this.nadeCooldown = cfg.grenadeCooldown;
        this.model.setWeapon(this.weapon, true);
        if (th.kind === 'flash') {
          this.flashAt = th.target;
          this.lookAway = Game.Config.grenades.flash.fuse;
        } else if (th.kind === 'smoke') {
          this.retreatT = cfg.retreatTime;
        }
      }
    }

    // 挑出手方式：出手速度固定（和玩家一样），平抛、高抛各试几种"瞄多远"，
    // 用 grenades.simulate 预演每一种最后在哪炸（反弹、滚动、引信都算进去），挑离 target 最近的。
    // 爆点和目标之间被墙挡着的不算数（手雷炸不到、闪光闪不到）；手雷还不能炸到自己。
    // 最好的一种也偏太远（fragMaxMiss / flashMaxMiss）就返回 null：不丢。烟雾只要大概落在那里就行
    // 返回 { pos 出手位置, vel 出手速度, miss 爆点离目标多远 }
    planThrow(kind, target) {
      const cfg = Game.Config.bots, G = Game.Config.grenades;
      const gr = this.mgr.grenades;
      const yaw = yawTo(target.x - this.pos.x, target.z - this.pos.z);   // 出手时已经转向目标
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const pos = new THREE.Vector3(this.pos.x + fx * 0.35 - fz * 0.15, this.pos.y + 1.55, this.pos.z + fz * 0.35 + fx * 0.15);
      const v = G.throwSpeed, g = 15;   // 重力和 grenades.js 的 stepGrenade 一致
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const hd = Math.hypot(dx, dz) || 1;
      const h = target.y + 0.1 - pos.y;
      const chest = target.clone(); chest.y += 1;
      const boxes = gr.collisionBoxes(this);
      const maxMiss = kind === 'frag' ? cfg.fragMaxMiss : kind === 'flash' ? cfg.flashMaxMiss : Infinity;

      let best = null;
      for (const high of [false, true]) {
        for (const k of [0.55, 0.65, 0.75, 0.85, 0.95, 1.05]) {   // 落地后还会滚一段，多数时候要瞄近一点
          const d = Math.max(0.5, hd * k);
          const disc = v ** 4 - g * (g * d * d + 2 * h * v * v);
          const angle = disc < 0 ? Math.PI / 4 : Math.atan((v * v + (high ? 1 : -1) * Math.sqrt(disc)) / (g * d));
          const vel = new THREE.Vector3(dx / hd * Math.cos(angle) * v, Math.sin(angle) * v, dz / hd * Math.cos(angle) * v);
          const at = gr.simulate(pos, vel, G[kind].fuse, boxes);
          if (kind !== 'smoke' && !gr.clearLine(at, chest)) continue;
          if (kind === 'frag' && gr.exposure(at, this.pos, HEIGHT)) continue;   // 会炸到自己
          const miss = Math.hypot(at.x - target.x, at.z - target.z);
          if (!best || miss < best.miss) best = { pos, vel, miss };
          if (disc < 0) break;   // 够不着：45 度已经是最远，瞄多远都一样
        }
      }
      return best && best.miss <= maxMiss ? best : null;
    }

    shoot() {
      const cfg = Game.Config.bots;
      const player = this.mgr.player;
      const muzzle = this.model.getMuzzle(new THREE.Vector3());

      // 瞄准玩家胸口到头之间的某一点
      const aim = player.position.clone();
      aim.y += rand(cfg.aimHeight[0], cfg.aimHeight[1]) * player.height;   // 玩家蹲下时瞄准点也跟着降低
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
      if (this.state === 'combat' && this.mgr.player.alive && !this.throwing && this.lookAway <= 0) {
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
        this.winScore = Game.Config.duel.winScore;   // 开局时定下，暂停时改选项只影响下一局
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

    // 玩家开枪了：听得见的 NPC 知道玩家大概在哪（见 Bot.hear）
    hearPlayer(pos) {
      if (!this.active || this.phase !== 'fighting') return;
      for (const b of this.bots) if (b.alive) b.hear(pos);
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
      const bot = new Bot(this, s.x, s.z, s.yaw, skill, this.pickGuns());
      this.bots.push(bot);
      if (this.onChange) this.onChange();
      return bot;
    }

    // NPC 的枪：loadout 里每格随机挑一把（#54）。只从已经下载好的里挑（玩家没选的枪在后台下载，见 main.js），
    // 都还没好就用玩家选的那把
    pickGuns() {
      const L = Game.Config.loadout, out = {};
      for (const slot of ['rifle', 'pistol']) {
        const keys = Object.keys(L[slot]).filter((k) => Game.GunModel.isGunLoaded(L[slot][k].model));
        out[slot] = keys.length ? keys[randInt(0, keys.length - 1)] : Game.Settings.get(slot);
      }
      return out;
    }

    // 巡逻：随机挑一个不是脚下的巡逻点
    // toward：玩家最后出现的位置（没有就 null）。有的话从离它最近的几个点里挑，巡逻会慢慢往那边摸，不会漫无目的（#54）
    nextNavPoint(from, toward = null) {
      const pts = this.world.navPoints.filter((p) => Math.hypot(p.x - from.x, p.z - from.z) > 3);
      if (toward && pts.length) {
        pts.sort((a, b) => Math.hypot(a.x - toward.x, a.z - toward.z) - Math.hypot(b.x - toward.x, b.z - toward.z));
        return pts[randInt(0, Math.min(Game.Config.bots.patrolNear, pts.length) - 1)];
      }
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
        this.bots.push(new Bot(this, s.x + rand(-1, 1), s.z + rand(-1, 1), s.yaw, skill, this.pickGuns()));
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
      if (this.raycaster.intersectObjects(this.obstacles, false).length !== 0) return false;
      return !(this.grenades && this.grenades.blocksSight(from, to));   // 烟雾也挡视线
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
        // 玩家只有一个碰撞盒，按打中的高度分部位：顶上 0.25 米是头，下面 45% 是腿
        const rel = hitPlayer.y - this.player.position.y;
        const part = rel > this.player.height - 0.25 ? 'head' : rel < this.player.height * 0.45 ? 'leg' : 'body';
        const dmg = bot.gun[bot.weapon].damage[part] * Game.Config.bots.damageMul;
        this.player.takeDamage(dmg, bot.pos);
      } else {
        end = wall ? wall.point : origin.clone().addScaledVector(dir, maxDist);
      }

      this.effects.tracer(origin, end);
      this.effects.muzzleFlash(origin);

      // 枪声：离得越远越小声，并根据方向分左右声道
      const dx = origin.x - this.player.position.x, dz = origin.z - this.player.position.z;
      const rel = yawTo(dx, dz) - this.player.yaw;
      this.audio.botShot(-Math.sin(rel), Math.hypot(dx, dz), bot.gun[bot.weapon].sound);
    }

    // ---- 击杀和回合 ----
    // hit.byBot：被 NPC 的雷炸死（包括自己的），不算玩家的击杀
    // 玩家的击杀通知 onPlayerKill(hit)：hit 是最后一击（part 部位、explosion 是不是手雷），main.js 拿去算赏金
    onBotKilled(bot, hit = {}) {
      if (!hit.byBot && this.onPlayerKill) this.onPlayerKill(hit);
      if (this.mode === 'duel' && hit.byBot) {
        this.hud.banner('对手被自己的雷炸死', 1.5);
        this.phase = 'respawning';
        this.timer = Game.Config.duel.respawnDelay;
      } else if (this.mode === 'duel') {
        this.score.player++;
        this.updateHud();
        this.hud.banner('击杀！', 1.2);
        if (this.score.player >= this.winScore) {
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
      if (this.score.bot >= this.winScore) {
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
        this.hud.setScore(this.score.player, this.score.bot, this.winScore);
      } else {
        this.hud.setWave(this.wave, this.bots.filter((b) => b.alive).length, this.total);
      }
    }

    update(dt) {
      this.effects.update(dt);
      if (!this.active) return;
      if (this.phase === 'over') {
        // 分出胜负后活着的 NPC 停下来，但最后一个死的还要倒完
        for (const b of this.bots) if (!b.alive) b.update(dt);
        return;
      }

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
