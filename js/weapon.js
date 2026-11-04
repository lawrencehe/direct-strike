// ============================================================
// 武器：射线检测（hitscan）射击、散布、后坐力、换弹、枪口火焰、弹孔
//
// hitscan 的意思是：子弹没有飞行时间，开枪的瞬间从眼睛发出一条射线，
// 射线第一个碰到的物体就是被打中的物体。CS 的步枪就是这么做的。
// ============================================================
Game.Weapon = class Weapon {
  constructor({ scene, camera, weaponCamera, player, audio, hud, effects, shootables }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.audio = audio;
    this.hud = hud;
    this.effects = effects;
    this.shootables = shootables;

    const cfg = Game.Config.weapon;
    this.ammo = cfg.magSize;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.bloom = 0;       // 连射累积的散布
    this.kick = 0;        // 枪模后退动画（1 → 0）
    this.flashTimer = 0;
    this.sway = new THREE.Vector2();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = cfg.maxRange;

    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(0.035, 10);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x151515, polygonOffset: true, polygonOffsetFactor: -4,
    });

    this.buildModel(weaponCamera);

    // 开枪瞬间照亮周围环境的光
    this.worldFlash = new THREE.PointLight(0xffc070, 0, 10);
    scene.add(this.worldFlash);

    hud.setAmmo(this.ammo, cfg.magSize, false);
  }

  // 用几个方块拼一把枪，挂在"武器摄像机"前面
  buildModel(weaponCamera) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.6 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x4b5058, roughness: 0.6, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });

    const gun = new THREE.Group();
    const part = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      gun.add(m);
    };
    part(0.07, 0.09, 0.42, 0, 0, 0, mid);              // 机匣
    part(0.03, 0.03, 0.34, 0, 0.015, -0.36, dark);     // 枪管
    part(0.05, 0.05, 0.16, 0, -0.005, -0.25, wood);    // 护木
    part(0.05, 0.14, 0.07, 0, -0.1, -0.06, dark);      // 弹匣
    part(0.045, 0.11, 0.05, 0, -0.08, 0.1, wood);      // 握把
    part(0.06, 0.08, 0.2, 0, -0.01, 0.28, wood);       // 枪托
    part(0.012, 0.03, 0.012, 0, 0.06, -0.18, dark);    // 准星
    part(0.03, 0.025, 0.03, 0, 0.055, 0.12, dark);     // 照门

    // 枪口火焰：一张发光的星形贴图
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({
        map: Game.Effects.flashTexture(), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.flash.position.set(0, 0.015, -0.55);
    this.flash.visible = false;
    gun.add(this.flash);

    this.basePos = new THREE.Vector3(0.16, -0.17, -0.5);
    gun.position.copy(this.basePos);
    gun.scale.setScalar(0.7);
    weaponCamera.add(gun);
    this.model = gun;
  }

  // 当前散布 = 基础 + 移动 + 空中 + 连射累积
  currentSpread() {
    const cfg = Game.Config.weapon;
    const p = this.player;
    const moveRatio = Math.min(1, p.horizontalSpeed() / Game.Config.player.walkSpeed);
    return cfg.baseSpread + cfg.moveSpread * moveRatio + (p.onGround ? 0 : cfg.airSpread) + this.bloom;
  }

  update(dt, input) {
    const cfg = Game.Config.weapon;
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - cfg.bloomRecover * dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = cfg.magSize;
        this.hud.setAmmo(this.ammo, cfg.magSize, false);
      }
    }

    if (input.wasPressed('KeyR')) this.startReload();

    if (input.isDown('Mouse0') && !this.reloading && this.cooldown <= 0) {
      if (this.ammo > 0) {
        this.fire();
      } else {
        if (input.wasPressed('Mouse0')) this.audio.empty();
        this.startReload();  // 打空了自动换弹
      }
    }

    this.animate(dt);
    this.hud.setSpread(this.currentSpread());
  }

  // 换弹匣、清空弹孔（开新一局时）
  reset() {
    this.refill();
    this.bloom = 0;
    this.decals.forEach((d) => d.removeFromParent());
    this.decals = [];
  }

  // 补满子弹（波次之间）
  refill() {
    const cfg = Game.Config.weapon;
    this.ammo = cfg.magSize;
    this.reloading = false;
    this.hud.setAmmo(this.ammo, cfg.magSize, false);
  }

  startReload() {
    const cfg = Game.Config.weapon;
    if (this.reloading || this.ammo === cfg.magSize) return;
    this.reloading = true;
    this.reloadTimer = cfg.reloadTime;
    this.audio.reload();
    this.hud.setAmmo(this.ammo, cfg.magSize, true);
  }

  fire() {
    const cfg = Game.Config.weapon;
    this.ammo--;
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
        const result = info.bot.takeDamage(info.part);
        if (result) {
          this.hud.recordHit(head, result.killed);
          if (result.killed) this.audio.kill(head);
          else head ? this.audio.headshot() : this.audio.hit();
        }
      }
      // 打中人：冒一团血雾；打中别的：留弹孔
      if (info.bot) { if (this.effects) this.effects.bloodPuff(hit.point); }
      else this.addDecal(hit);
    }

    // 3. 后坐力和效果
    this.player.addRecoil(cfg.recoilPitch, (Math.random() - 0.5) * cfg.recoilYaw);
    this.kick = 1;
    this.flashTimer = 0.04;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.audio.shot();
    this.hud.setAmmo(this.ammo, cfg.magSize, false);
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

  // 枪模动画：开枪后坐、换弹下沉、转视角时的惯性晃动、走路晃动
  animate(dt) {
    this.kick -= this.kick * Math.min(1, dt * 18);

    // 视角晃动：枪模稍微"跟不上"鼠标，显得有重量
    const look = this.player.lastLook;
    this.sway.x += (-look.x * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (look.y * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-0.04, 0.04);

    const bob = this.player.bobPhase;
    const moving = Math.min(1, this.player.horizontalSpeed() / Game.Config.player.walkSpeed) * (this.player.onGround ? 1 : 0);

    let dip = 0;
    if (this.reloading) {
      const p = 1 - this.reloadTimer / Game.Config.weapon.reloadTime;
      dip = Math.sin(p * Math.PI);
    }

    const m = this.model;
    m.position.set(
      this.basePos.x + this.sway.x + Math.cos(bob * 0.5) * 0.012 * moving,
      this.basePos.y + this.sway.y - Math.abs(Math.sin(bob * 0.5)) * 0.01 * moving - dip * 0.12,
      this.basePos.z + this.kick * 0.06
    );
    m.rotation.set(this.kick * 0.06 - dip * 0.7, this.sway.x * 2, dip * 0.3);

    this.flashTimer -= dt;
    const on = this.flashTimer > 0;
    this.flash.visible = on;
    this.worldFlash.intensity = on ? 2 : 0;
    this.worldFlash.position.copy(this.camera.position);
  }
};
