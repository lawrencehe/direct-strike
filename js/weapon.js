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
// 换弹：打空了自动开始，按 R 随时开始；切枪会打断（子弹数不变，切回来空枪会自动再换）。
// 动作按进度分段（见 animate 和 Weapon.RELOAD）：抓弹匣 → 抽出 → 手下去拿新弹匣 → 插入拍实 →（空枪才有）拉机柄上膛 → 回位。
// 音效跟着动作的时间点响，被打断就不会再响。
//
// 投掷物按真实手雷的两道保险：拉环是第一道，保险握片（被手握住）是第二道。
// 按住左键 = 拔掉拉环（hold），只要还攥着握片就不会开始计时，攥多久都不会炸；
// 松开 = 挥臂（swing），出手的瞬间握片弹开，引信才开始倒计时。
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
    this.reloadEmpty = false;   // 这次是空枪换弹：多一个拉机柄上膛的动作
    this.reloadCue = 0;         // 下一个该响的换弹音效（Weapon.RELOAD.cues 的下标）
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
    this.throwState = null;       // 投掷动作：null | 'hold'（拔了环、攥着握片）| 'swing'（挥臂）
    this.holdT = 0;               // 攥了多久
    this.swingT = 0;              // 挥臂进行了多久
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

  // 枪模和手臂由 gunmodel.js 提供（AK、M4、SG、手臂是 glb，默认手枪是几何体），这里只负责摆位置、摆手、挂枪口火焰。
  // 每把枪怎么摆、手握在哪，见文件末尾的 Weapon.VIEW
  buildModels() {
    this.guns = {};
    for (const slot of ['rifle', 'pistol']) this.buildGun(slot);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // 投掷物：拿在手上是一个完整的模型，出手后 grenades.js 再造一个飞出去
    this.throwables = {};
    for (const kind of ['frag', 'flash', 'smoke']) {
      // 手雷立在手心里：转 90 度让保险握片贴着掌心，拉环朝向镜头
      const g = Game.GunModel.buildGrenade(kind);
      g.group.rotation.y = Math.PI / 2;
      const rig = new THREE.Group();
      rig.add(g.group);
      const arms = Game.GunModel.buildArms(rig);
      arms.hand('R', { R: Game.GunModel.GRIP_RADIUS[kind], pos: V(0, 0, 0), armDir: V(0.42, -0.62, 0.66) });
      this.throwables[kind] = {
        cfg: Game.Config.grenades[kind], model: rig, arms, grenade: g.group, scale: 0.8, pin: g.group.getObjectByName('pin'),
        basePos: new THREE.Vector3(0.12, -0.105, -0.3), baseRot: new THREE.Euler(0.15, 0.3, -0.25),
      };
    }

    for (const it of Object.values(this.throwables)) this.mount(it);
  }

  // 挂到枪模摄像机上，先摆在正确位置（第一次 animate 之前，比如菜单背景，也不能是一把巨大的枪）
  mount(it) {
    it.model.scale.setScalar(it.scale);
    it.model.position.copy(it.basePos);
    it.model.rotation.copy(it.baseRot);
    it.model.visible = false;
    this.weaponCamera.add(it.model);
    it.arms.solve();
  }

  // 按 config 里当前选的枪造 slot（'rifle' | 'pistol'）这一格：枪模、手臂、枪口火焰。
  // 首页换了枪就再调一次，旧的模型拆掉（网格、贴图是共用的缓存，不释放）
  buildGun(slot) {
    const old = this.guns[slot];
    if (old) old.model.removeFromParent();

    const cfg = Game.Config.weapons[slot];
    const key = Game.Settings.get(slot);
    const view = Game.Weapon.VIEW[key] || Game.Weapon.VIEW[slot === 'rifle' ? 'ak' : 'beretta'];
    const gun = Game.GunModel.buildGun(slot);

    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(view.flashSize, view.flashSize),
      new THREE.MeshBasicMaterial({
        map: Game.Effects.flashTexture(), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    flash.position.copy(gun.muzzle);
    flash.visible = false;
    gun.group.add(flash);

    const arms = Game.GunModel.buildArms(gun.group);
    arms.hand('R', view.right);
    const left = arms.hand('L', view.left);

    const it = this.guns[slot] = {
      key, cfg, ammo: old && old.key === key ? old.ammo : cfg.magSize,
      model: gun.group, scale: view.scale, arms, flash,
      basePos: view.basePos.clone(), baseRot: view.baseRot.clone(),
      bolt: gun.bolt, boltHome: gun.boltHome, boltKick: view.boltKick,
      mag: gun.mag, magHome: gun.magHome, magDrop: view.magDrop, magBack: view.magBack, magTilt: view.magTilt,
      leftHand: left, leftHome: left.position.clone(), leftGrab: view.leftGrab,
      kickBack: view.kickBack, kickUp: view.kickUp,
    };
    this.mount(it);
    if (old && this.current === slot) this.show(slot);
    if (this.hud && this.current) this.refreshHud();
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
    this.cancelReload();
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
      this.playReloadCues(gun);
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        gun.ammo = cfg.magSize;
        this.refreshHud();
      }
      this.hud.setReload(this.reloading ? this.reloadProgress(gun) : null);
    }
    if (!ready) return;

    if (input.wasAction('reload')) this.startReload();
    // 打空了自动换弹：等最后一发的后坐做完就开始，不用再扣一次扳机。切回一把空枪也一样
    if (gun.ammo === 0 && !this.reloading && this.cooldown <= 0) this.startReload();

    // 全自动按住连发；半自动每次扣扳机只打一发
    const wantFire = cfg.auto ? input.isAction('fire') : input.wasAction('fire');
    if (wantFire && !this.reloading && this.cooldown <= 0 && gun.ammo > 0) this.fire(gun);
  }

  // 投掷：按住拔环（握片还攥着，不计时），松开挥臂出手，出手时引信才开始走，动作做完切回枪
  updateThrow(dt, input, ready) {
    const cfg = Game.Config.grenades;
    const kind = this.current;
    if (!this.throwState) {
      if (ready && input.wasAction('fire') && this.hasThrowable(kind)) {
        this.throwState = 'hold';
        this.holdT = this.swingT = 0;
        this.thrown = false;
        this.audio.pullPin();
      }
      return;
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
      this.grenades.throw(kind);   // 引信从这一刻算，满时长
      this.audio.spoon();
    }
    if (this.swingT >= cfg.swingTime) this.finishThrow();
  }

  // 手雷离手：扣数量、藏起手里的模型
  releaseGrenade() {
    this.thrown = true;
    if (!this.unlimitedThrowables) this.counts[this.current]--;
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

  // 玩家死了：手一松，拔了环的手雷掉在脚下，握片弹开，引信从这时开始走
  onPlayerDeath() {
    if (this.throwState && !this.thrown) {
      const kind = this.current;
      this.releaseGrenade();
      this.grenades.throw(kind, Game.Config.grenades[kind].fuse, true);
    }
    this.throwState = null;
    this.cancelReload();
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
    this.cancelReload();
    this.lastGun = key === 'rifle' ? 'pistol' : 'rifle';
    this.previous = this.lastGun;
    this.show(key);
  }

  // 投掷物补到开局数量（grenades.*.count）。keep = true 时多买的不收走（波次之间），否则正好回到开局数量（重生、新一局）
  restock(keep = false) {
    for (const kind of Object.keys(this.throwables)) {
      const base = Game.Config.grenades[kind].count;
      this.counts[kind] = keep ? Math.max(this.counts[kind] || 0, base) : base;
    }
  }

  // 补满子弹和投掷物（波次之间 keep = true，重生、新一局 false）
  refill(keep = false) {
    for (const g of Object.values(this.guns)) g.ammo = g.cfg.magSize;
    this.restock(keep);
    this.cancelReload();
    this.refreshHud();
  }

  // 买到一个投掷物（economy.js）
  addThrowable(kind) {
    this.counts[kind]++;
    this.refreshHud();
  }

  startReload() {
    const gun = this.guns[this.current];
    if (!gun || this.reloading || gun.ammo === gun.cfg.magSize) return;
    this.reloading = true;
    this.reloadTimer = gun.cfg.reloadTime;
    this.reloadEmpty = gun.ammo === 0;
    this.reloadCue = 0;
    this.refreshHud();
  }

  cancelReload() {
    if (!this.reloading) return;
    this.reloading = false;
    this.reloadTimer = 0;
    this.hud.setReload(null);
  }

  reloadProgress(gun) { return 1 - this.reloadTimer / gun.cfg.reloadTime; }

  // 换弹音效：到了动作的时间点才响（不提前排好），中途切枪就不会再响
  playReloadCues(gun) {
    const cues = Game.Weapon.RELOAD[this.reloadEmpty ? 'empty' : 'normal'].cues;
    const p = this.reloadProgress(gun);
    while (this.reloadCue < cues.length && p >= cues[this.reloadCue].at) this.audio[cues[this.reloadCue++].sound]();
  }

  refreshHud() {
    const gun = this.guns[this.current];
    if (gun) {
      this.hud.setAmmo(gun.ammo, gun.cfg.magSize);
      this.hud.setReload(this.reloading ? this.reloadProgress(gun) : null);
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
      // 换弹：按 Weapon.RELOAD 的时间段算出各个动作的进度（0 ~ 1），再叠到枪、弹匣、左手、机柄上
      const r = this.reloading ? Game.Weapon.reloadPose(this.reloadProgress(it), this.reloadEmpty) : Game.Weapon.REST_POSE;
      const dip = r.tilt;

      // 弹匣：往下往后抽出，越抽越快（像是被甩掉），抽到底就藏起来；新弹匣跟着左手从下面上来
      it.mag.position.set(it.magHome.x, it.magHome.y - r.mag * it.magDrop, it.magHome.z - r.mag * it.magBack);
      it.mag.rotation.x = r.mag * it.magTilt;
      it.mag.visible = r.mag < 0.98;

      // 左手：伸去抓弹匣 → 跟着弹匣出来 → 往下离开画面拿新弹匣 → 托着新弹匣插回去 → 回到护木
      it.leftHand.position.lerpVectors(it.leftHome, it.leftGrab, r.grab);
      it.leftHand.position.y -= r.mag * it.magDrop + r.away * 0.22;
      it.leftHand.position.z -= r.mag * it.magBack - r.away * 0.08;

      // 拉机柄 / 套筒：开枪时随后坐往后跳；空枪换弹最后拉到底再放开（上膛）
      it.bolt.position.z = it.boltHome.z + Math.max(this.kick, r.rack * 1.4) * it.boltKick;

      // jolt：新弹匣拍进去、机柄放开撞回去时，枪身被震一下
      m.position.set(
        it.basePos.x + swayX - dip * 0.02,
        it.basePos.y + swayY + dip * 0.035 + r.jolt * 0.012,
        it.basePos.z + this.kick * it.kickBack + dip * 0.03 - r.jolt * 0.01
      );
      m.rotation.set(
        it.baseRot.x + this.kick * it.kickUp + dip * 0.2 + r.jolt * 0.06 - dipSwitch * 0.7,
        it.baseRot.y + this.sway.x * 2 + dip * 0.12,
        it.baseRot.z - dip * 0.55 - r.rack * 0.06   // 换弹时枪身朝内侧倾，弹匣和左手转到镜头这边；上膛时微微一歪
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
    it.arms.solve();   // 枪动完了再让手臂跟上
  }
};

// 滚轮切换的顺序，和按键动作的对应关系
Game.Weapon.ORDER = ['rifle', 'pistol', 'frag', 'flash', 'smoke'];
Game.Weapon.ACTIONS = { rifle: 'slotRifle', pistol: 'slotPistol', frag: 'slotFrag', flash: 'slotFlash', smoke: 'slotSmoke' };

// 换弹动作的时间表：都是换弹进度 p（0 ~ 1）上的区间，乘 reloadTime 就是秒。
// 空枪和非空枪总时长一样（NPC 用同一个 reloadTime），空枪把前面压缩一点，腾出最后一段拉机柄。
// 枪身回正（tilt 下降）要和左手回护木（grab 下降）同步，否则枪还歪着、左手已经回去，袖子会被拉得很长。
// 改了时间段要截图看看（docs/testing.md 的逐帧推进），手和弹匣要对得上。
//   tilt  枪身侧倾抬起 / 回位       grab  左手去抓弹匣 / 回护木
//   out   旧弹匣抽出               away  左手下去拿新弹匣（离开画面）     in  新弹匣插入
//   seat  拍实的震动               rack  拉机柄到底（空枪）               release  放开机柄撞回去
// cues 是音效的时间点，sound 是 audio.js 里的方法名
Game.Weapon.RELOAD = {
  normal: {
    tilt: [0, 0.14, 0.74, 0.92], grab: [0.04, 0.16, 0.74, 0.9], out: [0.16, 0.32], away: [0.3, 0.42, 0.5, 0.6],
    in: [0.56, 0.7], seat: [0.7, 0.08], rack: null,
    cues: [{ at: 0.17, sound: 'magOut' }, { at: 0.7, sound: 'magIn' }],
  },
  empty: {
    tilt: [0, 0.12, 0.6, 0.76], grab: [0.03, 0.13, 0.6, 0.74], out: [0.13, 0.27], away: [0.25, 0.35, 0.42, 0.5],
    in: [0.47, 0.6], seat: [0.6, 0.07], rack: [0.7, 0.8, 0.84],    // 机柄：0.7 开始拉，0.8 拉到底，停到 0.84 放开
    cues: [{ at: 0.14, sound: 'magOut' }, { at: 0.6, sound: 'magIn' }, { at: 0.72, sound: 'rackBack' }, { at: 0.84, sound: 'rackForward' }],
  },
};
Game.Weapon.REST_POSE = { tilt: 0, grab: 0, mag: 0, away: 0, jolt: 0, rack: 0 };
{
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // 梯形：a → b 升到 1，c → d 降回 0
  const trap = (p, [a, b, c, d]) => smooth((p - a) / (b - a)) * (1 - smooth((p - c) / (d - c)));
  // 单个脉冲：从 t 开始，持续 w，先冲上去再衰减
  const pulse = (p, [t, w]) => (p < t || p > t + w ? 0 : Math.sin(((p - t) / w) * Math.PI) * (1 - (p - t) / w));

  // 换弹进度 p → 各个动作的量
  Game.Weapon.reloadPose = (p, empty) => {
    const T = empty ? Game.Weapon.RELOAD.empty : Game.Weapon.RELOAD.normal;
    // 弹匣：抽出时加速（平方），插入时减速，拍实
    const out = Math.min(1, Math.max(0, (p - T.out[0]) / (T.out[1] - T.out[0])));
    const inn = smooth((p - T.in[0]) / (T.in[1] - T.in[0]));
    const mag = p < T.in[0] ? out * out : 1 - inn;
    let rack = 0, jolt = pulse(p, T.seat);
    if (T.rack) {
      const [a, b, c] = T.rack;
      rack = p < a ? 0 : p < b ? smooth((p - a) / (b - a)) : p < c ? 1 : Math.max(0, 1 - (p - c) / 0.02);   // 放开时一下弹回
      jolt = Math.max(jolt, pulse(p, [c, 0.08]));
    }
    return { tilt: trap(p, T.tilt), grab: trap(p, T.grab), mag, away: trap(p, T.away), jolt, rack };
  };
}

// 每把枪在画面里怎么摆、手握在哪。key 和 config.js 的 loadout.rifle / loadout.pistol 一致（找不到时用 ak / beretta 的）。
// 坐标都是枪自己的局部坐标（-z 枪口，+y 上，单位米），握持坐标系见 gunmodel.js 的 buildArms：
//   right / left  右手、左手：R 握把半径，pos 握持中心，quat 握持方向，armDir 手臂伸出画面的方向
//   leftGrab      换弹时左手去抓弹匣的位置
//   scale / basePos / baseRot  枪模缩放和在画面右下角的位置、朝向（枪口略微朝准星方向内收）
//   boltKick      拉机柄 / 套筒开枪时往后跳多少；magDrop / magBack / magTilt 换弹时弹匣往下、往后抽多少，转多少
//   kickBack / kickUp  每发枪身后坐、上抬；flashSize 枪口火焰大小
// 换了枪模要重新对手的位置：用侧视截图检查手有没有握在握把和护木上（docs/architecture.md 的"已知的坑"）
{
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tilt = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
  // 左手托护木时掌心朝上（护木轴线是 z），用基向量直接写朝向
  const cradle = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, -1), V(-1, 0, 0)));

  Game.Weapon.VIEW = {
    ak: {
      right: { R: 0.024, pos: V(0, -0.052, 0.13), quat: tilt(-0.25), armDir: V(0.35, -0.6, 0.72) },
      left: { R: 0.036, pos: V(0, 0.022, -0.215), quat: cradle, armDir: V(-0.5, -0.55, 0.67) },
      leftGrab: V(0, -0.13, -0.095),
      scale: 0.75, basePos: V(0.155, -0.15, -0.5), baseRot: new THREE.Euler(0.0, 0.07, 0.0),
      boltKick: 0.07, magDrop: 0.16, magBack: 0.05, magTilt: 0.5,
      kickBack: 0.06, kickUp: 0.05, flashSize: 0.26,
    },
    m4: {
      right: { R: 0.024, pos: V(0, -0.1, 0.11), quat: tilt(-0.35), armDir: V(0.35, -0.6, 0.72) },
      left: { R: 0.034, pos: V(0, 0.0, -0.2), quat: cradle, armDir: V(-0.5, -0.55, 0.67) },
      leftGrab: V(0, -0.13, -0.03),
      scale: 0.75, basePos: V(0.155, -0.15, -0.46), baseRot: new THREE.Euler(0.0, 0.07, 0.0),
      boltKick: 0.03, magDrop: 0.16, magBack: 0.02, magTilt: 0.3,
      kickBack: 0.055, kickUp: 0.045, flashSize: 0.24,
    },
    beretta: {
      right: { R: 0.027, pos: V(0, -0.066, 0.075), quat: tilt(-0.18), armDir: V(0.35, -0.6, 0.72) },
      // 双手持握：左手从另一侧包住握把和右手手指
      left: { R: 0.037, pos: V(0, -0.082, 0.07), quat: tilt(-0.18), armDir: V(-0.62, -0.5, 0.6) },
      leftGrab: V(0, -0.15, 0.085),
      scale: 0.72, basePos: V(0.105, -0.075, -0.34), baseRot: new THREE.Euler(0.02, 0.07, 0.0),
      boltKick: 0.036, magDrop: 0.13, magBack: 0.02, magTilt: 0,
      kickBack: 0.045, kickUp: 0.14, flashSize: 0.17,
    },
    sg: {
      right: { R: 0.026, pos: V(0, -0.04, 0.03), quat: tilt(-0.3), armDir: V(0.35, -0.6, 0.72) },
      left: { R: 0.036, pos: V(0, -0.056, 0.025), quat: tilt(-0.3), armDir: V(-0.62, -0.5, 0.6) },
      leftGrab: V(0, -0.13, 0.04),
      scale: 0.72, basePos: V(0.105, -0.075, -0.34), baseRot: new THREE.Euler(0.02, 0.07, 0.0),
      boltKick: 0.03, magDrop: 0.12, magBack: 0.03, magTilt: 0,
      kickBack: 0.045, kickUp: 0.14, flashSize: 0.17,
    },
  };
}
