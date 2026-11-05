// ============================================================
// 武器：切枪、射线检测（hitscan）射击、散布、后坐力、换弹、枪口火焰、弹孔、投掷动作
//
// hitscan 的意思是：子弹没有飞行时间，开枪的瞬间从眼睛发出一条射线，
// 射线第一个碰到的物体就是被打中的物体。CS 的步枪就是这么做的。
//
// 五个槽位：rifle 主武器、pistol 手枪、frag / flash / smoke 三种投掷物。
// 枪的参数在 config.js 的 weapons 里，投掷物丢出去之后的事归 grenades.js 管。
// 切枪分两段：先收（当前武器往下沉），再掏（新武器抬起来），掏好之前不能开火。
//
// 投掷物的流程：按下左键 = 拉环，倒计时开始（hold）；松开 = 挥臂（swing），挥到一半出手。
// 引信从拉环算起，所以攥久了丢出去会在空中炸，攥太久就在手里炸。
// ============================================================
Game.Weapon = class Weapon {
  constructor({ scene, camera, weaponCamera, player, audio, hud, effects, shootables, grenades }) {
    this.scene = scene;
    this.camera = camera;
    this.weaponCamera = weaponCamera;
    this.player = player;
    this.audio = audio;
    this.hud = hud;
    this.effects = effects;
    this.shootables = shootables;
    this.grenades = grenades;

    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.bloom = 0;       // 连射累积的散布
    this.kick = 0;        // 枪模后退动画（1 → 0）
    this.flashTimer = 0;
    this.sway = new THREE.Vector2();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = Game.Config.weapons.maxRange;

    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(0.035, 10);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x151515, polygonOffset: true, polygonOffsetFactor: -4,
    });

    this.buildModels();

    this.current = 'rifle';
    this.lastGun = 'pistol';      // 投掷完 / 按"上一把武器"时切回去
    this.previous = 'pistol';
    this.pending = null;          // 正在切向哪把
    this.switchT = 0;             // 切枪进度：0 = 就绪；> 0 表示正在收或掏
    this.switchPhase = null;      // 'out' | 'in'
    this.throwState = null;       // 投掷动作：null | 'hold'（攥着）| 'swing'（挥臂）
    this.holdT = 0;               // 攥了多久
    this.swingT = 0;              // 挥臂进行了多久
    this.cookT = 0;               // 拉环后过了多久（引信）
    this.thrown = false;          // 手雷已经离手
    this.unlimitedThrowables = false;
    this.counts = {};
    this.restock();
    this.show('rifle');

    // 开枪瞬间照亮周围环境的光
    this.worldFlash = new THREE.PointLight(0xffc070, 0, 10);
    scene.add(this.worldFlash);

    this.refreshHud();
  }

  // 枪模在 gunmodel.js 里拼好，这里只负责摆位置、挂枪口火焰
  buildModels() {
    const cam = this.weaponCamera;
    const makeFlash = (size, at, parent) => {
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: Game.Effects.flashTexture(), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      flash.position.copy(at);
      flash.visible = false;
      parent.add(flash);
      return flash;
    };

    const ak = Game.GunModel.buildAK();
    const pistol = Game.GunModel.buildPistol();

    // 手：握把的轴线前倾，所以绕 x 轴转；左手托护木时掌心朝上（护木轴线是 z），用基向量直接写朝向
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const tilt = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
    const cradle = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, -1), V(-1, 0, 0)));
    const attach = Game.GunModel.attachHand;
    attach(ak.group, { R: 0.024, pos: V(0, -0.066, 0.117), quat: tilt(-0.37), armDir: V(0.35, -0.6, 0.72) });
    const akLeft = attach(ak.group, { R: 0.033, pos: V(0, 0.013, -0.235), quat: cradle, mirror: true, armDir: V(-0.5, -0.55, 0.67) });
    attach(pistol.group, { R: 0.027, pos: V(0, -0.066, 0.075), quat: tilt(-0.18), armDir: V(0.35, -0.6, 0.72) });
    // 手枪双手持握：左手从另一侧包住握把和右手手指
    const pistolLeft = attach(pistol.group, { R: 0.037, pos: V(0, -0.082, 0.07), quat: tilt(-0.18), mirror: true, armDir: V(-0.62, -0.5, 0.6) });

    this.guns = {
      rifle: {
        cfg: Game.Config.weapons.rifle, ammo: Game.Config.weapons.rifle.magSize,
        model: ak.group, scale: 0.75,
        // 摆在画面右下，枪口略微朝准星方向内收
        basePos: new THREE.Vector3(0.155, -0.15, -0.5), baseRot: new THREE.Euler(0.0, 0.07, 0.0),
        bolt: ak.bolt, boltHome: ak.boltHome, boltKick: 0.07,       // 拉机柄：开枪时往后跳
        mag: ak.mag, magHome: ak.magHome, magDrop: 0.16, magBack: 0.05, magTilt: 0.5,
        flash: makeFlash(0.26, ak.muzzle, ak.group),
        leftHand: akLeft, leftHome: akLeft.position.clone(), leftGrab: V(0, -0.145, -0.125),   // 换弹时左手去抓弹匣
        kickBack: 0.06, kickUp: 0.05,
      },
      pistol: {
        cfg: Game.Config.weapons.pistol, ammo: Game.Config.weapons.pistol.magSize,
        model: pistol.group, scale: 0.72,
        basePos: new THREE.Vector3(0.105, -0.075, -0.34), baseRot: new THREE.Euler(0.02, 0.07, 0.0),
        bolt: pistol.slide, boltHome: pistol.slideHome, boltKick: 0.036,   // 套筒：开枪时往后坐
        mag: pistol.mag, magHome: pistol.magHome, magDrop: 0.13, magBack: 0.02, magTilt: 0,
        flash: makeFlash(0.17, pistol.muzzle, pistol.group),
        leftHand: pistolLeft, leftHome: pistolLeft.position.clone(), leftGrab: V(0, -0.15, 0.085),
        kickBack: 0.045, kickUp: 0.14,
      },
    };

    // 投掷物：拿在手上是一个完整的模型，出手后 grenades.js 再造一个飞出去
    this.throwables = {};
    for (const kind of ['frag', 'flash', 'smoke']) {
      // 手雷立在手心里：转 90 度让保险握片贴着掌心，拉环朝向镜头
      const g = Game.GunModel.buildGrenade(kind);
      g.group.rotation.y = Math.PI / 2;
      const rig = new THREE.Group();
      rig.add(g.group);
      Game.GunModel.attachHand(rig, { R: Game.GunModel.GRIP_RADIUS[kind], pos: V(0, 0, 0), armDir: V(0.42, -0.62, 0.66) });
      this.throwables[kind] = {
        cfg: Game.Config.grenades[kind], model: rig, grenade: g.group, scale: 0.8, pin: g.group.getObjectByName('pin'),
        basePos: new THREE.Vector3(0.12, -0.105, -0.3), baseRot: new THREE.Euler(0.15, 0.3, -0.25),
      };
    }

    for (const it of [...Object.values(this.guns), ...Object.values(this.throwables)]) {
      it.model.scale.setScalar(it.scale);
      it.model.position.copy(it.basePos);    // 第一次 animate 之前（比如菜单背景）也要摆在正确位置
      it.model.rotation.copy(it.baseRot);
      it.model.visible = false;
      cam.add(it.model);
    }
  }

  isGun(key) { return key === 'rifle' || key === 'pistol'; }
  item(key) { return this.guns[key] || this.throwables[key]; }

  show(key) {
    for (const it of [...Object.values(this.guns), ...Object.values(this.throwables)]) it.model.visible = false;
    this.item(key).model.visible = true;
  }

  // 投掷物还有没有
  hasThrowable(kind) { return this.unlimitedThrowables || this.counts[kind] > 0; }
  canEquip(key) { return this.isGun(key) || this.hasThrowable(key); }

  // ---- 切枪 ----
  select(key) {
    if (this.throwState || !key) return;
    const target = this.pending || this.current;
    if (key === target) return;
    if (!this.canEquip(key)) { this.audio.empty(); return; }

    // 换弹被打断：子弹数不变，换回来要重新换
    if (this.reloading) { this.reloading = false; this.reloadTimer = 0; }
    this.flashTimer = 0;

    this.pending = key;
    if (this.switchPhase !== 'out') {
      this.switchPhase = 'out';
      this.switchT = 0;
    }
    this.audio.swap();
    this.refreshHud();
  }

  // 滚轮：跳过用完的投掷物
  cycle(dir) {
    const order = Game.Weapon.ORDER;
    let i = order.indexOf(this.pending || this.current);
    for (let n = 0; n < order.length; n++) {
      i = (i + dir + order.length) % order.length;
      if (this.canEquip(order[i])) { this.select(order[i]); return; }
    }
  }

  updateSwitch(dt) {
    if (!this.switchPhase) return;
    const c = Game.Config.weapons;
    this.switchT += dt;
    if (this.switchPhase === 'out' && this.switchT >= c.switchOut) {
      if (this.pending !== this.current) {
        if (this.isGun(this.current)) this.lastGun = this.current;
        this.previous = this.current;
        this.current = this.pending;
      }
      this.pending = null;
      this.thrown = false;
      this.show(this.current);
      this.bloom = 0;
      this.switchPhase = 'in';
      this.switchT = 0;
      this.refreshHud();
    } else if (this.switchPhase === 'in' && this.switchT >= c.switchIn) {
      this.switchPhase = null;
      this.switchT = 0;
    }
  }

  // 切枪造成的下沉量 0 ~ 1
  switchDip() {
    const c = Game.Config.weapons;
    if (this.switchPhase === 'out') return Math.min(1, this.switchT / c.switchOut);
    if (this.switchPhase === 'in') return 1 - Math.min(1, this.switchT / c.switchIn);
    return 0;
  }

  // ---- 每帧 ----

  // 当前散布 = 基础 + 移动 + 空中 + 连射累积
  currentSpread() {
    const gun = this.guns[this.current];
    if (!gun) return 0.008;      // 拿着手雷时准星收拢
    const cfg = gun.cfg;
    const p = this.player;
    const moveRatio = Math.min(1, p.horizontalSpeed() / Game.Config.player.walkSpeed);
    const spread = cfg.baseSpread + cfg.moveSpread * moveRatio + (p.onGround ? 0 : cfg.airSpread) + this.bloom;
    return spread * (1 - (1 - cfg.crouchSpreadMul) * p.crouchT);   // 蹲下更准
  }

  readInput(input) {
    const map = { slotRifle: 'rifle', slotPistol: 'pistol', slotFrag: 'frag', slotFlash: 'flash', slotSmoke: 'smoke' };
    for (const [action, key] of Object.entries(map)) {
      if (input.wasAction(action)) this.select(key);
    }
    if (input.wasAction('lastWeapon')) this.select(this.previous);
    if (input.wheel) this.cycle(input.wheel);
  }

  update(dt, input) {
    this.cooldown -= dt;
    const gun = this.guns[this.current];
    if (gun) this.bloom = Math.max(0, this.bloom - gun.cfg.bloomRecover * dt);

    this.readInput(input);
    this.updateSwitch(dt);

    const ready = !this.switchPhase;
    if (gun) this.updateGun(dt, input, gun, ready);
    else this.updateThrow(dt, input, ready);

    this.animate(dt);
    this.hud.setSpread(this.currentSpread());
  }

  updateGun(dt, input, gun, ready) {
    const cfg = gun.cfg;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        gun.ammo = cfg.magSize;
        this.refreshHud();
      }
    }
    if (!ready) return;

    if (input.wasAction('reload')) this.startReload();

    // 全自动按住连发；半自动每次扣扳机只打一发
    const wantFire = cfg.auto ? input.isAction('fire') : input.wasAction('fire');
    if (wantFire && !this.reloading && this.cooldown <= 0) {
      if (gun.ammo > 0) {
        this.fire(gun);
      } else {
        if (input.wasAction('fire')) this.audio.empty();
        this.startReload();  // 打空了自动换弹
      }
    }
  }

  // 投掷：按住拉环并开始倒计时，松开挥臂出手，动作做完切回枪
  updateThrow(dt, input, ready) {
    const cfg = Game.Config.grenades;
    const kind = this.current;
    if (!this.throwState) {
      if (ready && input.wasAction('fire') && this.hasThrowable(kind)) {
        this.throwState = 'hold';
        this.holdT = this.swingT = this.cookT = 0;
        this.thrown = false;
        this.audio.pullPin();
      }
      return;
    }

    const fuse = cfg[kind].fuse;
    if (!this.thrown) {
      this.cookT += dt;
      // 攥太久：在手里炸
      if (this.cookT >= fuse) {
        this.releaseGrenade();
        this.finishThrow();
        this.grenades.explodeInHand(kind);
        return;
      }
      this.hud.setCook(1 - this.cookT / fuse);
    }

    if (this.throwState === 'hold') {
      this.holdT += dt;
      // 点一下也要把拉环动作做完才出手
      if (this.holdT >= cfg.pullTime && !input.isAction('fire')) {
        this.throwState = 'swing';
        this.swingT = 0;
      }
      return;
    }

    this.swingT += dt;
    if (!this.thrown && this.swingT >= cfg.releaseAt) {
      this.releaseGrenade();
      this.grenades.throw(kind, fuse - this.cookT);
    }
    if (this.swingT >= cfg.swingTime) this.finishThrow();
  }

  // 手雷离手：扣数量、藏起手里的模型、收起倒计时
  releaseGrenade() {
    this.thrown = true;
    if (!this.unlimitedThrowables) this.counts[this.current]--;
    this.hud.setCook(null);
    this.refreshHud();
  }

  // 手里已经空了，不用再做收枪动作，直接掏出上一把枪
  finishThrow() {
    this.throwState = null;
    this.pending = this.lastGun;
    this.switchPhase = 'out';
    this.switchT = Game.Config.weapons.switchOut;
    this.audio.swap();
    this.refreshHud();
  }

  // 玩家死了：拉了环还没丢出去的手雷掉在脚下，引信照走
  onPlayerDeath() {
    if (this.throwState && !this.thrown) {
      const kind = this.current;
      this.releaseGrenade();
      this.grenades.throw(kind, Game.Config.grenades[kind].fuse - this.cookT, true);
    }
    this.throwState = null;
  }

  // 新一局：换弹匣、补投掷物、清空弹孔
  reset() {
    this.equipNow('rifle');
    this.refill();
    this.bloom = 0;
    this.decals.forEach((d) => d.removeFromParent());
    this.decals = [];
  }

  // 重生：拿回主武器，子弹和投掷物补满
  respawn() {
    this.equipNow('rifle');
    this.refill();
  }

  equipNow(key) {
    this.current = key;
    this.pending = null;
    this.switchPhase = null;
    this.switchT = 0;
    this.throwState = null;
    this.thrown = false;
    this.reloading = false;
    this.hud.setCook(null);
    this.lastGun = key === 'rifle' ? 'pistol' : 'rifle';
    this.previous = this.lastGun;
    this.show(key);
  }

  restock() {
    for (const kind of Object.keys(this.throwables)) this.counts[kind] = Game.Config.grenades[kind].count;
  }

  // 补满子弹和投掷物（波次之间、重生）
  refill() {
    for (const g of Object.values(this.guns)) g.ammo = g.cfg.magSize;
    this.restock();
    this.reloading = false;
    this.refreshHud();
  }

  startReload() {
    const gun = this.guns[this.current];
    if (!gun || this.reloading || gun.ammo === gun.cfg.magSize) return;
    this.reloading = true;
    this.reloadTimer = gun.cfg.reloadTime;
    this.audio.reload(gun.cfg.reloadTime);
    this.refreshHud();
  }

  refreshHud() {
    const gun = this.guns[this.current];
    if (gun) {
      this.hud.setAmmo(gun.ammo, gun.cfg.magSize, this.reloading);
    } else {
      this.hud.setThrowable(this.unlimitedThrowables ? '∞' : this.counts[this.current]);
    }
    const shown = this.pending || this.current;
    this.hud.setSlots(Game.Weapon.ORDER.map((key) => {
      const it = this.item(key);
      const out = { action: Game.Weapon.ACTIONS[key], name: it.cfg.name, on: key === shown };
      if (!this.isGun(key)) {
        out.count = this.unlimitedThrowables ? '∞' : this.counts[key];
        out.empty = !this.hasThrowable(key);
      }
      return out;
    }));
  }

  fire(gun) {
    const cfg = gun.cfg;
    gun.ammo--;
    this.cooldown = cfg.fireInterval;

    // 1. 在准星周围的散布圆里随机取一个方向
    //    （先算散布再加累积，所以第一发总是最准的）
    const spread = this.currentSpread();
    this.bloom = Math.min(cfg.bloomMax, this.bloom + cfg.bloomPerShot);
    const r = spread * Math.sqrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, -1)
      .normalize()
      .applyQuaternion(this.camera.quaternion);

    // 2. 发射射线，取第一个碰到的物体
    this.raycaster.set(this.camera.position, dir);
    const hit = this.raycaster.intersectObjects(this.shootables, false)[0];

    this.hud.recordShot();
    if (hit) {
      const info = hit.object.userData;
      const head = info.part === 'head';
      if (info.target && info.target.onHit()) {
        this.hud.recordHit(head, false);
        head ? this.audio.headshot() : this.audio.hit();
      } else if (info.bot && info.part) {
        const result = info.bot.takeDamage(cfg.damage[info.part], {
          part: info.part, point: hit.point.clone(), dir: dir.clone(), force: cfg.knockback,
        });
        if (result) {
          this.hud.recordHit(head, result.killed);
          if (result.killed) this.audio.kill(head);
          else {
            head ? this.audio.headshot() : this.audio.hit();
            this.effects.bloodHit(hit.point, dir);   // 打死时的喷血由 NPC 自己触发
          }
        }
      }
      if (!info.bot) this.addDecal(hit);   // 打中人冒血，打中别的留弹孔
    }

    // 3. 后坐力和效果
    this.player.addRecoil(cfg.recoilPitch, (Math.random() - 0.5) * cfg.recoilYaw);
    this.kick = 1;
    this.flashTimer = 0.04;
    gun.flash.rotation.z = Math.random() * Math.PI;
    this.audio.shot(this.current);
    this.refreshHud();
  }

  // 弹孔：一个小黑圆片，贴在被打中的表面上，朝向表面法线
  addDecal(hit) {
    if (!hit.face) return;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const decal = new THREE.Mesh(this.decalGeo, this.decalMat);
    decal.position.copy(hit.point).addScaledVector(normal, 0.005);
    decal.lookAt(decal.position.clone().add(normal));
    decal.userData.isDecal = true;
    this.scene.add(decal);
    hit.object.attach(decal);  // 挂到被打中的物体上，靶子倒下时弹孔跟着走

    this.decals.push(decal);
    if (this.decals.length > 80) this.decals.shift().removeFromParent();
  }

  // 枪模动画：开枪后坐、换弹下沉、切枪、投掷、转视角时的惯性晃动、走路晃动
  animate(dt) {
    this.kick -= this.kick * Math.min(1, dt * 18);

    // 视角晃动：枪模稍微"跟不上"鼠标，显得有重量
    const look = this.player.lastLook;
    this.sway.x += (-look.x * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (look.y * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-0.04, 0.04);

    const bob = this.player.bobPhase;
    const moving = Math.min(1, this.player.horizontalSpeed() / Game.Config.player.walkSpeed) * (this.player.onGround ? 1 : 0);
    const crouch = this.player.crouchT;   // 下蹲时枪稍微抬高靠近一点
    const dipSwitch = this.switchDip();

    const it = this.item(this.current);
    const m = it.model;
    const swayX = this.sway.x + Math.cos(bob * 0.5) * 0.012 * moving - crouch * 0.02;
    const swayY = this.sway.y - Math.abs(Math.sin(bob * 0.5)) * 0.01 * moving + crouch * 0.015 - dipSwitch * 0.26;

    if (this.guns[this.current]) {
      // 换弹：枪口上扬并侧倾；弹匣先抽出去（0 → 0.4），空一会儿，再插回来（0.6 → 1）
      let dip = 0, magOut = 0;
      if (this.reloading) {
        const p = 1 - this.reloadTimer / it.cfg.reloadTime;
        dip = Math.sin(p * Math.PI);
        if (p < 0.4) magOut = p / 0.4;
        else if (p < 0.6) magOut = 1;
        else magOut = 1 - (p - 0.6) / 0.4;
      }
      it.mag.position.set(it.magHome.x, it.magHome.y - magOut * it.magDrop, it.magHome.z - magOut * it.magBack);
      it.mag.rotation.x = magOut * it.magTilt;
      it.mag.visible = magOut < 0.98;

      // 左手：先伸去抓弹匣，跟着弹匣抽出、插回，最后回到原位
      let grab = 0;
      if (this.reloading) {
        const p = 1 - this.reloadTimer / it.cfg.reloadTime;
        grab = p < 0.2 ? p / 0.2 : p > 0.85 ? (1 - p) / 0.15 : 1;
        grab = grab * grab * (3 - 2 * grab);
      }
      it.leftHand.position.lerpVectors(it.leftHome, it.leftGrab, grab);
      it.leftHand.position.y -= magOut * it.magDrop;
      it.leftHand.position.z -= magOut * it.magBack;

      // 拉机柄 / 套筒随后坐往后跳
      it.bolt.position.z = it.boltHome.z + this.kick * it.boltKick;

      m.position.set(
        it.basePos.x + swayX,
        it.basePos.y + swayY + dip * 0.03,
        it.basePos.z + this.kick * it.kickBack
      );
      m.rotation.set(
        it.baseRot.x + this.kick * it.kickUp + dip * 0.16 - dipSwitch * 0.7,
        it.baseRot.y + this.sway.x * 2,
        it.baseRot.z - dip * 0.5     // 换弹时枪身朝内侧倾，弹匣和左手转到镜头这边
      );

      this.flashTimer -= dt;
      const on = this.flashTimer > 0;
      it.flash.visible = on;
      this.worldFlash.intensity = on ? 2 : 0;
    } else {
      // 投掷：拉环时往后上方引，攥着不动；挥臂时向前上方甩出去。手雷离手后手还在，把动作做完
      const cfg = Game.Config.grenades;
      let back = 0, swing = 0;
      if (this.throwState === 'hold') {
        const p = Math.min(1, this.holdT / cfg.pullTime);
        back = p * p * (3 - 2 * p);
      } else if (this.throwState === 'swing') {
        const p = Math.min(1, this.swingT / cfg.swingTime);
        back = Math.max(0, 1 - p * 2.5);
        swing = Math.sin(p * Math.PI * 0.6) / Math.sin(Math.PI * 0.6);
      }
      if (it.pin) it.pin.visible = !this.throwState;
      it.grenade.visible = !this.thrown;
      m.position.set(
        it.basePos.x + swayX - swing * 0.05,
        it.basePos.y + swayY + back * 0.045 + swing * 0.2,
        it.basePos.z + back * 0.03 - swing * 0.3
      );
      m.rotation.set(
        it.baseRot.x - dipSwitch * 0.5 + back * 0.5 - swing * 1.1,
        it.baseRot.y + this.sway.x * 2,
        it.baseRot.z
      );
      this.worldFlash.intensity = 0;
    }
    this.worldFlash.position.copy(this.camera.position);
  }
};

// 滚轮切换的顺序，和按键动作的对应关系
Game.Weapon.ORDER = ['rifle', 'pistol', 'frag', 'flash', 'smoke'];
Game.Weapon.ACTIONS = { rifle: 'slotRifle', pistol: 'slotPistol', frag: 'slotFrag', flash: 'slotFlash', smoke: 'slotSmoke' };
