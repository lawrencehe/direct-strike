// ============================================================
// NPC 的外观：加载 glTF 士兵模型、播放动画、摆持枪姿势、挂判定盒
//
// 模型是 ukrainian-soldier.glb（Mixamo 骨骼），待机/走/跑三个动画是从 init_soldier.glb 移植过来的，
// 加工流程见 assets-src/models/human/ukrainian-soldier/build.sh。
// 持枪姿势不是动画，而是每帧把手臂骨骼"掰"向枪上的握把位置（一个很简单的 IK）。
// 这样换成别的 Mixamo 骨骼模型时，不需要重做持枪动画。
//
// 走路不"滑步"的关键有两点，都在 SoldierModel.setMotion 里：
//   1. 动画不按自己的节奏播，而是由"走过的距离"驱动相位：脚踩地时的速度恰好等于位移速度。
//      走/跑两个动画按速度混合，并对齐脚步相位，所以从走到跑是连续的。
//      每个动画的步幅（一个循环走多远）在加载时自动量出来（measureGait）。
//   2. 腿朝移动方向、上半身扭向瞄准方向。NPC 横移时不再"正面朝你平移"，
//      而是斜着跨步、扭腰举枪；后退时倒放走路动画。原地转身时腿会跟着倒腾几步。
//
// 命中判定不直接打骨骼蒙皮（three.js 的射线不认蒙皮变形），而是在头、躯干、
// 四肢的骨骼上各挂一个看不见的方块，射线打这些方块。userData.part 告诉武器打中了哪里。
//
// 模型加载失败（比如直接双击 index.html 打开）时，退回到用方块拼的小人。
// ============================================================
Game.Character = (function () {
  const cfg = () => Game.Config.character;

  let asset = null;
  let loadPromise = null;
  let gait = null;   // { walk: { stride, footPhase }, run: {...} }，加载后量出来

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve) => {
      if (!THREE.GLTFLoader) { resolve(false); return; }
      new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(cfg().model, (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = o.receiveShadow = true;
            o.frustumCulled = false;   // 蒙皮动起来后包围球不准，关掉以免被误剔除
          }
        });
        asset = gltf;
        gait = measureGait(gltf);
        resolve(true);
      }, undefined, (err) => {
        console.warn('NPC 模型加载失败，改用方块小人。用 start.sh 启动本地服务可以解决。', err);
        resolve(false);
      });
    });
    return loadPromise;
  }

  // Mixamo 骨骼名（不带前缀）。不同导出工具的前缀不一样：
  // "mixamorig:Head"、"mixamorigHead"、"Head" 都可能出现，findBone 会挨个试
  const B = {
    head: 'Head', spine: 'Spine1',
    lUpLeg: 'LeftUpLeg', rUpLeg: 'RightUpLeg', lLeg: 'LeftLeg', rLeg: 'RightLeg',
    lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
    rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  };
  const SPINE_BONES = ['Spine', 'Spine1', 'Spine2'];   // 扭腰时三节脊柱各分担三分之一
  const BONE_PREFIXES = ['mixamorig:', 'mixamorig', 'mixamorig_', ''];
  function findBone(model, name) {
    for (const p of BONE_PREFIXES) {
      const o = model.getObjectByName(p + name);
      if (o) return o;
    }
    return null;
  }

  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const smoothstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // 量步幅：把走/跑动画从头到尾采样一遍，看脚踩在地上那段时间脚相对身体的水平速度，
  // 这个速度就是动画"本来"的前进速度；乘以时长就是一个循环的步幅。
  // 同时记下左脚迈到最前面的时刻（相位），用来对齐走和跑，混合时两条腿才不会打架。
  function measureGait(gltf) {
    const c = cfg();
    const fallback = {
      walk: { stride: c.walkAnimSpeed * 1.0, footPhase: 0 },
      run: { stride: c.runAnimSpeed * 0.7, footPhase: 0 },
    };
    const foot = findBone(gltf.scene, 'LeftToeBase') || findBone(gltf.scene, 'LeftFoot');
    const hips = findBone(gltf.scene, 'Hips');
    if (!foot || !hips) return fallback;

    const mixer = new THREE.AnimationMixer(gltf.scene);
    const out = {};
    const fp = new THREE.Vector3(), hp = new THREE.Vector3();
    for (const name of ['Walk', 'Run']) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) return fallback;
      const action = mixer.clipAction(clip);
      action.play();
      const N = 90, dt = clip.duration / N;
      const samples = [];
      for (let i = 0; i <= N; i++) {
        mixer.setTime(i * dt);
        gltf.scene.updateMatrixWorld(true);
        foot.getWorldPosition(fp); hips.getWorldPosition(hp);
        samples.push({ x: fp.x, y: fp.y, z: fp.z, rel: fp.z - hp.z });
      }
      const minY = Math.min(...samples.map((s) => s.y));
      const speeds = [];
      let frontPhase = 0, frontRel = Infinity;
      for (let i = 1; i <= N; i++) {
        const a = samples[i - 1], b = samples[i];
        if (a.y < minY + 0.03 && b.y < minY + 0.03) speeds.push(Math.hypot(b.x - a.x, b.z - a.z) / dt);
        if (b.rel < frontRel) { frontRel = b.rel; frontPhase = i / N; }
      }
      speeds.sort((p, q) => p - q);
      const speed = speeds[Math.floor(speeds.length / 2)] || 0;
      out[name.toLowerCase()] = { stride: speed * clip.duration, footPhase: frontPhase, speed };
      action.stop();
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
    if (!(out.walk.stride > 0.3) || !(out.run.stride > 0.3)) return fallback;
    console.info(`NPC 步幅：走 ${out.walk.speed.toFixed(2)} m/s，跑 ${out.run.speed.toFixed(2)} m/s`);
    return out;
  }

  // 判定盒：挂在哪根骨头上、沿骨头方向偏多少、多大、算哪个部位
  // （size 是 [宽, 沿骨头的长, 厚]；大腿和小腿分开挂，站姿弯腿时盒子才贴着腿）
  const HITBOXES = [
    { bone: 'head', offset: 0.13, size: [0.22, 0.26, 0.24], part: 'head' },
    { bone: 'spine', offset: 0.1, size: [0.4, 0.5, 0.28], part: 'body' },
    { bone: 'lUpLeg', offset: 0.22, size: [0.2, 0.46, 0.22], part: 'leg' },
    { bone: 'rUpLeg', offset: 0.22, size: [0.2, 0.46, 0.22], part: 'leg' },
    { bone: 'lLeg', offset: 0.24, size: [0.16, 0.5, 0.18], part: 'leg' },
    { bone: 'rLeg', offset: 0.24, size: [0.16, 0.5, 0.18], part: 'leg' },
    { bone: 'lArm', offset: 0.26, size: [0.12, 0.52, 0.12], part: 'body' },
    { bone: 'rArm', offset: 0.26, size: [0.12, 0.52, 0.12], part: 'body' },
    { bone: 'lFore', offset: 0.14, size: [0.1, 0.28, 0.1], part: 'body' },
    { bone: 'rFore', offset: 0.14, size: [0.1, 0.28, 0.1], part: 'body' },
  ];

  // 枪在身体坐标系里的位置（原点在脚底，面朝 -z）
  const RIFLE_POS = new THREE.Vector3(0.16, 1.3, -0.12);
  // 手枪双手平举在胸前：握把在 (0.08, 1.35, -0.42) 附近，减去握把在枪里的位置就是枪的原点
  const PISTOL_POS = new THREE.Vector3(0.08, 1.4, -0.49);

  // NPC 手里的手枪：和玩家用同一个模型（gunmodel.js 的 buildPistol），造一次，之后每个 NPC 克隆
  let pistolProto = null;
  function buildPistol() {
    if (!pistolProto) {
      pistolProto = Game.GunModel.buildPistol();
      pistolProto.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; } });
    }
    const g = pistolProto.group.clone(true);
    const at = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };
    const muzzle = at(pistolProto.muzzle.x, pistolProto.muzzle.y, pistolProto.muzzle.z);
    const grip = at(0, -0.066, 0.075);
    const guard = at(-0.01, -0.07, 0.07);   // 左手从另一侧包住握把
    // stockZ / muzzleZ：死后脱手掉落时，布娃娃用这两个点代表整把枪（见 ragdoll.js）
    return { group: g, muzzle, grip, guard, stockZ: 0.1, muzzleZ: -0.15 };
  }

  // 两把枪都挂在 parent 下，只显示手上那把。返回 { rifle, pistol }
  function buildGuns(parent, riflePos, pistolPos) {
    const guns = { rifle: buildRifle(), pistol: buildPistol() };
    guns.rifle.group.position.copy(riflePos);
    guns.pistol.group.position.copy(pistolPos);
    guns.pistol.group.visible = false;
    parent.add(guns.rifle.group, guns.pistol.group);
    return guns;
  }

  // 换枪 / 收枪：两种模型共用。key 是 'rifle' | 'pistol'，show = false 表示枪收起来（丢雷时）
  function equip(model, key, show = true) {
    model.rifle = model.guns[key];       // model.rifle 永远指"手上那把"，瞄准、枪口、布娃娃都用它
    for (const [k, g] of Object.entries(model.guns)) g.group.visible = show && k === key;
  }

  // 用几个方块拼一把步枪，返回 { group, muzzle, grip, guard }
  function buildRifle() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.6 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x45494f, roughness: 0.6, metalness: 0.4 });
    const g = new THREE.Group();
    const part = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    };
    part(0.06, 0.08, 0.4, 0, 0, -0.05, mid);        // 机匣
    part(0.03, 0.03, 0.34, 0, 0.015, -0.42, dark);  // 枪管
    part(0.05, 0.05, 0.18, 0, -0.005, -0.3, dark);  // 护木
    part(0.045, 0.14, 0.06, 0, -0.1, -0.1, dark);   // 弹匣
    part(0.04, 0.1, 0.045, 0, -0.08, 0.06, dark);   // 握把
    part(0.05, 0.07, 0.2, 0, -0.01, 0.25, mid);     // 枪托
    part(0.012, 0.03, 0.012, 0, 0.055, -0.22, dark);// 准星
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, -0.6); g.add(muzzle);
    const grip = new THREE.Object3D(); grip.position.set(0.02, -0.1, 0.06); g.add(grip);
    const guard = new THREE.Object3D(); guard.position.set(-0.03, -0.05, -0.3); g.add(guard);
    return { group: g, muzzle, grip, guard, stockZ: 0.3, muzzleZ: -0.55 };
  }

  // 让骨头的方向（骨头的局部 Y 轴）指向世界坐标里的 dir
  const _pq = new THREE.Quaternion(), _q = new THREE.Quaternion(), _qt = new THREE.Quaternion();
  const _Y = new THREE.Vector3(0, 1, 0);
  function aimBone(bone, dir, twist = 0) {
    bone.parent.getWorldQuaternion(_pq);
    _q.setFromUnitVectors(_Y, dir.normalize());
    if (twist) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, twist));
    bone.quaternion.copy(_pq.invert()).multiply(_q);
    bone.updateMatrixWorld(true);
  }

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

  // ---------------- glTF 士兵 ----------------
  class SoldierModel {
    constructor() {
      this.root = new THREE.Group();
      this.root.rotation.order = 'YXZ';
      this.hitMeshes = [];
      this.flashMats = [];

      const model = THREE.SkeletonUtils.clone(asset.scene);
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();   // 每个 NPC 自己的材质，受伤闪红互不影响
          this.flashMats.push(o.material);
        }
      });
      this.root.add(model);
      this.armature = model;

      this.bones = {};
      const missing = [];
      for (const [k, name] of Object.entries(B)) {
        this.bones[k] = findBone(model, name);
        if (!this.bones[k]) missing.push(name);
      }
      this.spine = SPINE_BONES.map((n) => findBone(model, n)).filter(Boolean);
      if (missing.length && !SoldierModel.warned) {
        SoldierModel.warned = true;
        console.warn('NPC 模型里找不到这些骨骼，持枪姿势和判定盒会不完整：', missing.join(', '));
      }

      // 动画：三个动作同时播放，用权重混合。走/跑的时间不让 mixer 推进（timeScale 0），
      // 而是每帧按走过的距离算出相位，直接设置 action.time
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = {};
      for (const name of ['Idle', 'Walk', 'Run']) {
        const clip = THREE.AnimationClip.findByName(asset.animations, name);
        const a = this.mixer.clipAction(clip);
        a.play();
        a.setEffectiveWeight(name === 'Idle' ? 1 : 0);
        if (name !== 'Idle') a.timeScale = 0;
        this.actions[name.toLowerCase()] = a;
      }
      this.weights = { idle: 1, walk: 0, run: 0 };
      this.phase = Math.random();     // 步行相位 0 ~ 1（一个完整循环 = 左右各迈一步）
      this.legsYaw = 0;               // 腿（整个模型）朝向
      this.twist = 0;                 // 上半身相对腿的扭转
      this.initialized = false;

      // 枪挂在"躯干"组里，躯干跟着瞄准方向转，腿可以朝别处
      this.torso = new THREE.Group();
      this.root.add(this.torso);
      this.guns = buildGuns(this.torso, RIFLE_POS, PISTOL_POS);
      equip(this, 'rifle');

      // 判定盒
      const hitMat = cfg().showHitboxes
        ? new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
        : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      for (const h of HITBOXES) {
        const bone = this.bones[h.bone];
        if (!bone) continue;
        const holder = new THREE.Group();
        const s = bone.getWorldScale(_v1).x;      // 骨骼带缩放（Mixamo 是 0.01），要抵消掉
        holder.scale.setScalar(1 / s);
        const m = new THREE.Mesh(new THREE.BoxGeometry(...h.size), hitMat);
        m.position.y = h.offset;
        m.userData.part = h.part;
        holder.add(m);
        bone.add(holder);
        this.hitMeshes.push(m);
      }

      this.pitch = 0;
      this.flash = 0;
      this.dead = false;
      this.deathTime = 0;
    }

    // 每帧由 bots.js 调用：世界坐标的水平速度 (vx, vz)、瞄准/面朝方向 aimYaw（yaw=0 朝 -z）
    setMotion(vx, vz, aimYaw, dt) {
      const c = cfg();
      const maxTwist = THREE.MathUtils.degToRad(c.maxTwist);
      const speed = Math.hypot(vx, vz);
      if (!this.initialized) { this.legsYaw = aimYaw; this.initialized = true; }

      // ---- 腿朝哪：移动时朝移动方向（但不能和瞄准方向差太多），站着时慢慢转回瞄准方向 ----
      let dir = 1, targetLegs = aimYaw;
      if (speed > 0.5) {
        let d = wrapAngle(Math.atan2(-vx, -vz) - aimYaw);
        if (Math.abs(d) > Math.PI * 0.6) { d = wrapAngle(d + Math.PI); dir = -1; }   // 后退：倒放走路
        targetLegs = aimYaw + THREE.MathUtils.clamp(d, -maxTwist, maxTwist);
      }
      const rate = (speed > 0.5 ? 10 : 5) * dt;
      const step = THREE.MathUtils.clamp(wrapAngle(targetLegs - this.legsYaw), -rate, rate);
      this.legsYaw = wrapAngle(this.legsYaw + step);
      let twist = wrapAngle(aimYaw - this.legsYaw);
      if (Math.abs(twist) > maxTwist) {           // 腰扭到头了，腿被"拽"着转
        twist = Math.sign(twist) * maxTwist;
        this.legsYaw = wrapAngle(aimYaw - twist);
      }
      this.twist = twist;
      this.root.rotation.y = this.legsYaw;
      this.torso.rotation.y = twist;

      // ---- 走/跑/待机权重 ----
      const turnShuffle = dt > 0 ? Math.min(1.0, Math.abs(step) / dt * 0.3) : 0;  // 原地转身时腿也倒腾一下
      const animSpeed = Math.max(speed, turnShuffle);
      const move = smoothstep(0.15, 0.8, animSpeed);
      const runMix = dir < 0 ? 0 : smoothstep(c.walkRunBlend[0], c.walkRunBlend[1], speed);
      const target = { idle: 1 - move, walk: move * (1 - runMix), run: move * runMix };
      const k = Math.min(1, dt * 10);
      for (const n of ['idle', 'walk', 'run']) {
        this.weights[n] += (target[n] - this.weights[n]) * k;
        this.actions[n].setEffectiveWeight(this.weights[n]);
      }

      // ---- 相位：走了多远就播到哪，脚踩地时的速度 = 位移速度 ----
      const g = gait;
      const stride = THREE.MathUtils.lerp(g.walk.stride, g.run.stride, runMix);
      this.phase += dir * animSpeed * dt / stride;
      this.phase -= Math.floor(this.phase);
      const walk = this.actions.walk, run = this.actions.run;
      walk.time = this.phase * walk.getClip().duration;
      const runPhase = this.phase + (g.run.footPhase - g.walk.footPhase);
      run.time = (runPhase - Math.floor(runPhase)) * run.getClip().duration;
    }

    // 枪口上下抬：point 是世界坐标里的目标点，null 表示平举
    aimAt(point) {
      let target = 0;
      if (point) {
        this.rifle.group.getWorldPosition(_v1);
        const dx = point.x - _v1.x, dz = point.z - _v1.z;
        target = Math.atan2(point.y - _v1.y, Math.hypot(dx, dz));
      }
      this.pitch += (THREE.MathUtils.clamp(target, -0.7, 0.7) - this.pitch) * 0.25;
      this.rifle.group.rotation.x = this.pitch;
    }

    getMuzzle(out) { return this.rifle.muzzle.getWorldPosition(out); }
    setWeapon(key, show = true) { equip(this, key, show); }

    hitFlash() { this.flash = 1; }

    // hit: { part, point, dir, force, vel, explosion, colliders }，详见 ragdoll.js
    die(hit = {}) {
      this.dead = true;
      for (const a of Object.values(this.actions)) a.paused = true;
      this.ragdoll = new Game.Ragdoll.Soldier(this.root, (n) => findBone(this.armature, n), this.rifle, hit);
      if (!this.ragdoll.ok) this.ragdoll = null;
    }

    // 血从哪流出来（世界坐标）
    woundPos(out) {
      if (this.ragdoll) return this.ragdoll.woundPos(out);
      return out.copy(this.root.position).setY(this.root.position.y + 0.3);
    }
    woundSpeed() { return this.ragdoll ? this.ragdoll.woundSpeed() : 0; }

    update(dt) {
      if (this.dead) {
        this.deathTime += dt;
        this.flash = Math.max(0, this.flash - dt * 6);
        for (const m of this.flashMats) m.emissive.setRGB(this.flash * 0.9, 0, 0);
        const sinkAt = Game.Config.ragdoll.corpseTime - 1.2;
        if (this.deathTime > sinkAt) {
          if (this.ragdoll) this.ragdoll.sleeping = true;   // 骨骼不再动，整个模型慢慢沉进地里后移除
          this.root.position.y -= 0.5 * dt;
        } else if (this.ragdoll) {
          this.ragdoll.update(dt);
        }
        return;
      }
      this.mixer.update(dt);
      // 扭腰：脊柱的局部 Y 轴就是身体竖直方向，绕它转就是转上半身
      const per = this.twist / (this.spine.length || 1);
      for (const b of this.spine) b.quaternion.multiply(_qt.setFromAxisAngle(_Y, per));
      this.root.updateMatrixWorld(true);
      this.poseArms();

      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.flashMats) m.emissive.setRGB(this.flash * 0.9, 0, 0);
    }

    // 把两条手臂掰到枪上：右手握把，左手托护木
    poseArms() {
      this.torso.getWorldQuaternion(_pq);
      const right = _v4.set(1, 0, 0).applyQuaternion(_pq);
      this.poseArm(this.bones.rArm, this.bones.rFore, this.bones.rHand, this.rifle.grip, right, 1);
      this.poseArm(this.bones.lArm, this.bones.lFore, this.bones.lHand, this.rifle.guard, right, -1);
    }

    poseArm(upper, fore, hand, targetObj, right, side) {
      if (!upper || !fore || !hand) return;
      const shoulder = upper.getWorldPosition(_v1);
      const target = targetObj.getWorldPosition(_v2);
      // 肘关节目标：肩和手的中点，往外、往下各偏一点，手臂才会自然弯曲
      const elbow = _v3.copy(shoulder).lerp(target, 0.5)
        .addScaledVector(right, side * 0.12)
        .add(new THREE.Vector3(0, -0.16, 0));
      aimBone(upper, elbow.clone().sub(shoulder));
      const forePos = fore.getWorldPosition(_v3);
      const dir = target.clone().sub(forePos);
      aimBone(fore, dir);
      aimBone(hand, dir.clone(), side * 1.2);
    }

    dispose() {
      this.mixer.stopAllAction();
      this.root.traverse((o) => {
        if (o.userData.shared) return;    // 手枪的网格和材质所有 NPC 共用，不能释放
        if (o.isMesh && !o.isSkinnedMesh) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
    }
  }

  // ---------------- 方块小人（备用） ----------------
  class BlockModel {
    constructor() {
      const mats = {
        shirt: new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 0.9 }),
        pants: new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.9 }),
        skin: new THREE.MeshStandardMaterial({ color: 0xc89a74, roughness: 0.8 }),
        helmet: new THREE.MeshStandardMaterial({ color: 0x2f3328, roughness: 0.7 }),
      };
      const root = new THREE.Group();
      root.rotation.order = 'YXZ';
      this.root = root;
      this.hitMeshes = [];
      this.flashMats = [mats.shirt, mats.pants, mats.skin];

      const box = (w, h, d, x, y, z, mat, part, parent = root) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.userData.part = part;
        parent.add(m);
        this.hitMeshes.push(m);
        return m;
      };
      this.legs = [-0.12, 0.12].map((x) => {
        const hip = new THREE.Group();
        hip.position.set(x, 0.85, 0);
        root.add(hip);
        box(0.19, 0.85, 0.22, 0, -0.425, 0, mats.pants, 'leg', hip);
        return hip;
      });
      box(0.5, 0.62, 0.3, 0, 1.16, 0, mats.shirt, 'body');
      box(0.26, 0.28, 0.28, 0, 1.62, 0, mats.skin, 'head');
      box(0.32, 0.1, 0.34, 0, 1.79, 0, mats.helmet, 'head');
      box(0.12, 0.12, 0.45, 0.24, 1.3, -0.2, mats.shirt, 'body');
      box(0.12, 0.12, 0.4, -0.12, 1.3, -0.32, mats.shirt, 'body');

      this.guns = buildGuns(root, new THREE.Vector3(0.1, 1.36, -0.2), new THREE.Vector3(0.08, 1.42, -0.45));
      equip(this, 'rifle');

      this.walkPhase = 0;
      this.speed = 0;
      this.pitch = 0;
      this.flash = 0;
      this.dead = false;
      this.deathTime = 0;
    }

    setMotion(vx, vz, aimYaw) {
      this.speed = Math.hypot(vx, vz);
      this.root.rotation.y = aimYaw;
    }

    aimAt(point) {
      let target = 0;
      if (point) {
        this.rifle.group.getWorldPosition(_v1);
        target = Math.atan2(point.y - _v1.y, Math.hypot(point.x - _v1.x, point.z - _v1.z));
      }
      this.pitch += (THREE.MathUtils.clamp(target, -0.7, 0.7) - this.pitch) * 0.25;
      this.rifle.group.rotation.x = this.pitch;
    }

    getMuzzle(out) { return this.rifle.muzzle.getWorldPosition(out); }
    setWeapon(key, show = true) { equip(this, key, show); }
    hitFlash() { this.flash = 1; }

    // 备用小人没有骨骼，做不了布娃娃：朝子弹方向整个倒下，爆头 / 爆炸时带一点腾空
    die(hit = {}) {
      this.dead = true;
      this.flash = 0;
      for (const m of this.flashMats) m.emissive.setRGB(0, 0, 0);
      const d = hit.dir || new THREE.Vector3(0, 0, 1);
      const yaw = this.root.rotation.y;
      this.fallSign = -Math.sin(yaw) * d.x - Math.cos(yaw) * d.z > 0 ? 1 : -1;   // 子弹从背后来就往前扑
      const big = hit.part === 'head' || hit.explosion;
      this.fallV = new THREE.Vector3(d.x, 0, d.z).multiplyScalar(big ? 3 : 0.8);
      this.fallV.y = big ? 2.2 : 0;
      this.groundY = this.root.position.y;
    }

    woundPos(out) { return out.copy(this.root.position).setY(this.root.position.y + 0.3); }
    woundSpeed() { return 0; }

    update(dt) {
      if (this.dead) {
        this.deathTime += dt;
        const p = Math.min(1, this.deathTime / 0.45);
        this.root.rotation.x = this.fallSign * (Math.PI / 2) * p * p;
        this.fallV.y -= Game.Config.ragdoll.gravity * dt;
        this.root.position.addScaledVector(this.fallV, dt);
        if (this.root.position.y <= this.groundY) { this.root.position.y = this.groundY; this.fallV.set(0, 0, 0); }
        return;
      }
      this.walkPhase += this.speed * dt * 3.2;
      const swing = Math.sin(this.walkPhase) * 0.6 * Math.min(1, this.speed / 2);
      this.legs[0].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.flashMats) m.emissive.setRGB(this.flash * 0.8, 0, 0);
    }

    dispose() {
      this.root.traverse((o) => {
        if (o.userData.shared) return;
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  function create() {
    return asset ? new SoldierModel() : new BlockModel();
  }

  return { load, create, isLoaded: () => !!asset };
})();
