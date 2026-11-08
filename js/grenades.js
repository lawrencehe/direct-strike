// ============================================================
// 投掷物：手雷、闪光弹、烟雾弹
//
// 这里只管"丢出去之后"的事：飞行和反弹、飞行轨迹、引爆、伤害、致盲、烟团。
// 手上的模型和投掷动作在 weapon.js 里。
//
// 手雷伤害要看有没有掩体：从爆点朝目标打一条视线，被墙挡住就不受伤。
// 闪光弹看距离和朝向：背对着爆点影响小得多。
// 玩家和 NPC 都能丢（owner：null 是玩家，否则是丢雷的那个 NPC）。
// 手雷炸到丢雷的人自己时伤害乘 selfMul；NPC 的雷炸死 NPC 不算玩家的击杀。
// 烟团不是真正的体积，NPC 判断视线时把它当作一个球（blocksSight）；
// 玩家这边靠一堆半透明的 Sprite 挡住视线。
// ============================================================
Game.Grenades = class Grenades {
  constructor({ scene, camera, world, targets, player, audio, hud, effects }) {
    Object.assign(this, { scene, camera, world, targets, player, audio, hud, effects });
    this.bots = null;           // 由 main.js 接上（bots 依赖这里判断烟雾，这里依赖 bots 算伤害）
    this.flying = [];
    this.clouds = [];
    this.trails = [];
    this.raycaster = new THREE.Raycaster();

    // 爆炸照亮周围的光。场景里灯的数量一变所有材质都要重新编译，所以一开始就放好，平时亮度 0
    this.light = new THREE.PointLight(0xffb060, 0, 22);
    scene.add(this.light);
    this.lightTime = 0;
    this.lightMax = 1;
    this.lightPeak = 0;
  }

  // 出手：从手的位置朝准星略上方丢出去，带上玩家一半的移动速度
  // fuse 是引信还剩几秒（拉环后攥了多久已经扣掉了）；drop 表示人死了，手雷掉在脚下
  throw(kind, fuse = Game.Config.grenades[kind].fuse, drop = false) {
    const cfg = Game.Config.grenades;
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);

    const pos = cam.position.clone().addScaledVector(fwd, 0.3).addScaledVector(right, 0.1).addScaledVector(up, -0.08);
    // 贴着墙丢：手已经伸进墙里了就从眼睛出手，否则会丢到墙后面去
    if (this.insideBox(pos, this.world.colliders)) pos.copy(cam.position);

    const vel = fwd.clone().addScaledVector(up, cfg.throwUp).normalize().multiplyScalar(cfg.throwSpeed);
    vel.addScaledVector(this.player.velocity, 0.5);
    if (drop) vel.set(0, 0, 0);
    this.launch(kind, pos, vel, fuse, null, drop);
  }

  // 真正把一颗雷放进场景：pos 出手位置、vel 初速度、owner 谁丢的（null = 玩家）
  launch(kind, pos, vel, fuse, owner = null, drop = false) {
    const model = Game.GunModel.buildGrenade(kind).group;
    const pin = model.getObjectByName('pin');
    if (pin) pin.visible = false;
    model.position.copy(pos);
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(model);

    const trail = drop ? null : new Trail(this.scene, kind, pos);
    if (trail) this.trails.push(trail);

    this.flying.push({
      kind, model, pos: pos.clone(), vel: vel.clone(), trail, owner,
      fuse,
      spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 6 - 3, Math.random() * 12 - 6),
    });
  }

  // 攥太久：就在手边炸
  explodeInHand(kind) {
    const cam = this.camera;
    const pos = cam.position.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), 0.25);
    if (this.insideBox(pos, this.world.colliders)) pos.copy(cam.position);
    pos.y -= 0.15;       // detonate 会抬高 0.15
    this.detonate({ kind, pos, model: new THREE.Group(), owner: null });
  }

  insideBox(p, boxes, r = 0) {
    for (const c of boxes) {
      if (p.x > c.min.x - r && p.x < c.max.x + r && p.y > c.min.y - r && p.y < c.max.y + r && p.z > c.min.z - r && p.z < c.max.z + r) return true;
    }
    return false;
  }

  update(dt) {
    if (this.flying.length) {
      const boxes = this.bots ? this.world.colliders.concat(this.bots.aliveBoxes()) : this.world.colliders;
      // 小步长走，飞得再快也不会穿过薄墙
      const steps = Math.ceil(dt / (1 / 120));
      for (const g of this.flying) {
        for (let i = 0; i < steps; i++) this.stepGrenade(g, dt / steps, boxes);
        g.model.position.copy(g.pos);
        g.model.rotation.x += g.spin.x * dt;
        g.model.rotation.y += g.spin.y * dt;
        g.model.rotation.z += g.spin.z * dt;
        // 飞的时候记录轨迹，落地不怎么动了就不再延长
        if (g.trail && g.vel.lengthSq() > 2) g.trail.addPoint(g.pos);
        g.fuse -= dt;
        if (g.fuse <= 0) this.detonate(g);
      }
      this.flying = this.flying.filter((g) => !g.done);
    }

    for (const t of this.trails) t.update(dt, this.camera.position);
    this.trails = this.trails.filter((t) => {
      if (t.points.length) return true;
      t.dispose();
      return false;
    });

    if (this.lightTime > 0) {
      this.lightTime = Math.max(0, this.lightTime - dt);
      this.light.intensity = this.lightPeak * (this.lightTime / this.lightMax);
    }

    for (const c of this.clouds) this.updateCloud(c, dt);
    this.clouds = this.clouds.filter((c) => {
      if (c.t < c.life) return true;
      this.removeCloud(c);
      return false;
    });
  }

  // 分轴移动 + 反弹（思路和 physics.js 一样）
  stepGrenade(g, dt, boxes) {
    const cfg = Game.Config.grenades;
    const r = 0.05;
    g.vel.y -= 15 * dt;
    for (const axis of ['x', 'y', 'z']) {
      const before = g.pos[axis];
      g.pos[axis] += g.vel[axis] * dt;
      if (!this.insideBox(g.pos, boxes, r)) continue;
      g.pos[axis] = before;
      const v = Math.abs(g.vel[axis]);
      if (v > 1.6) this.audio.bounce(v);
      g.vel[axis] *= -cfg.restitution;
      if (axis === 'y' && v > 0) {
        g.vel.x *= cfg.groundFriction;
        g.vel.z *= cfg.groundFriction;
        g.spin.multiplyScalar(0.7);
        if (Math.abs(g.vel.y) < 0.5) g.vel.y = 0;
      }
    }
  }

  detonate(g) {
    g.done = true;
    this.scene.remove(g.model);
    // 贴地时把爆点抬高一点，否则视线全被地面挡住
    const pos = g.pos.clone();
    pos.y += 0.15;
    const dist = pos.distanceTo(this.camera.position);
    if (g.kind === 'frag') this.explodeFrag(pos, dist, g.owner || null);
    else if (g.kind === 'flash') this.explodeFlash(pos, dist);
    else this.startSmoke(pos, dist);
  }

  clearLine(from, to) {
    const dir = to.clone().sub(from);
    const d = dir.length();
    this.raycaster.set(from, dir.normalize());
    this.raycaster.far = d;
    return this.raycaster.intersectObjects(this.world.shootables, false).length === 0;
  }

  aliveBots() {
    return this.bots && this.bots.active ? this.bots.bots.filter((b) => b.alive) : [];
  }

  // ---------- 手雷 ----------
  explodeFrag(pos, dist, owner) {
    const c = Game.Config.grenades.frag;
    this.effects.explosion(pos);
    this.audio.explosion(dist);
    this.pulseLight(pos, 0xffb060, 9, 0.35);

    const chest = new THREE.Vector3();
    for (const bot of this.aliveBots()) {
      chest.copy(bot.pos); chest.y += 1;
      const d = chest.distanceTo(pos);
      if (d >= c.radius || !this.clearLine(pos, chest)) continue;
      const k = 1 - d / c.radius;
      const dir = chest.clone().sub(pos).normalize();
      const result = bot.takeDamage(c.damage * k * (bot === owner ? c.selfMul : 1), {
        part: 'body', point: chest.clone(), dir, explosion: true, force: 0.75 + 1.6 * k, byBot: !!owner,
      });
      if (!result) continue;
      if (owner) {           // NPC 的雷：没有玩家的命中提示
        if (!result.killed) this.effects.bloodHit(chest, dir);
        continue;
      }
      this.hud.showHit(result.killed);
      if (result.killed) this.audio.kill(false);
      else { this.audio.hit(); this.effects.bloodHit(chest, dir); }
    }

    // 训练场的靶子
    if (this.targets) {
      for (const t of this.targets) {
        if (t.root.visible && t.root.position.distanceTo(pos) < c.radius * 0.7 && t.onHit()) this.hud.showHit(false);
      }
    }

    // 玩家：同样要算掩体；离得近时镜头抖一下
    const player = this.player;
    if (player.alive) {
      const eye = this.camera.position;
      const d = eye.distanceTo(pos);
      if (d < 16) player.addRecoil(0.05 * (1 - d / 16), (Math.random() - 0.5) * 0.03 * (1 - d / 16));
      if (d < c.radius && this.clearLine(pos, eye)) {
        const dmg = c.damage * (owner ? 1 : c.selfMul) * (1 - d / c.radius);
        if (dmg >= 1) player.takeDamage(dmg, pos);
      }
    }
  }

  // ---------- 闪光弹 ----------
  explodeFlash(pos, dist) {
    const c = Game.Config.grenades.flash;
    this.effects.flashBang(pos);
    this.audio.flashBang(dist);
    this.pulseLight(pos, 0xffffff, 22, 0.25);

    // 朝向系数：正对 1，背对 0.2
    const facing = (fx, fz, tx, tz, d) => 0.2 + 0.8 * Math.max(0, (fx * tx + fz * tz) / (d || 1));

    for (const bot of this.aliveBots()) {
      const head = bot.pos.clone(); head.y += 1.6;
      const d = head.distanceTo(pos);
      if (d >= c.radius || !this.clearLine(pos, head)) continue;
      const f = facing(-Math.sin(bot.yaw), -Math.cos(bot.yaw), pos.x - head.x, pos.z - head.z, Math.hypot(pos.x - head.x, pos.z - head.z));
      const s = (1 - d / c.radius) ** 0.6 * f;
      if (s > 0.1) bot.flash(c.botBlind * s);
    }

    const player = this.player;
    if (player.alive) {
      const eye = this.camera.position;
      const d = eye.distanceTo(pos);
      if (d < c.radius && this.clearLine(pos, eye)) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const to = pos.clone().sub(eye).normalize();
        const facingP = 0.2 + 0.8 * Math.max(0, fwd.dot(to));
        const s = (1 - d / c.radius) ** 0.6 * facingP;
        if (s > 0.08) {
          const seconds = c.playerBlind * s;
          this.hud.flash(Math.min(1, s * 1.6), seconds);
          this.audio.ring(seconds, s);
        }
      }
    }
  }

  // ---------- 烟雾弹 ----------
  startSmoke(pos, dist) {
    const c = Game.Config.grenades.smoke;
    this.audio.smokeHiss(dist);
    const center = pos.clone();
    center.y = this.effects.groundAt(pos.x, pos.z, pos.y + 0.3) + c.radius * 0.45;

    // 所有烟片共用一个材质，一起淡入淡出
    const mat = new THREE.SpriteMaterial({
      map: Game.Effects.smokeTexture(), transparent: true, depthWrite: false, color: 0x8f9294, opacity: 0,
    });
    const sprites = [];
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(mat);
      // 均匀分布在一个压扁的球里
      const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), r = c.radius * Math.cbrt(Math.random()) * 0.82;
      s.userData.offset = new THREE.Vector3(Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r * 0.62, Math.sin(v) * Math.sin(u) * r);
      s.userData.size = c.radius * (0.75 + Math.random() * 0.55);
      s.userData.drift = Math.random() * Math.PI * 2;
      s.position.copy(center);
      this.scene.add(s);
      sprites.push(s);
    }
    this.clouds.push({ center, mat, sprites, t: 0, life: c.duration, radius: c.radius });
  }

  updateCloud(c, dt) {
    c.t += dt;
    const grow = Math.min(1, c.t / 1.6);
    const ease = 1 - (1 - grow) ** 3;
    c.scale = 0.2 + 0.8 * ease;
    const fadeOut = Math.min(1, (c.life - c.t) / 2.5);
    c.mat.opacity = Math.min(ease, Math.max(0, fadeOut)) * 0.92;
    for (const s of c.sprites) {
      const u = s.userData;
      s.position.copy(c.center).addScaledVector(u.offset, c.scale);
      s.position.y += Math.sin(c.t * 0.5 + u.drift) * 0.12 + c.t * 0.015;
      s.scale.setScalar(u.size * c.scale);
    }
  }

  removeCloud(c) {
    for (const s of c.sprites) this.scene.remove(s);
    c.mat.dispose();
  }

  // 线段 from → to 有没有穿过烟团（NPC 视线用）。烟快散了就不算挡
  blocksSight(from, to) {
    if (!this.clouds.length) return false;
    const d = _segDir.subVectors(to, from);
    const len2 = d.lengthSq() || 1;
    for (const c of this.clouds) {
      if (c.t < 0.7 || c.life - c.t < 1.2) continue;
      _rel.subVectors(c.center, from);
      const t = THREE.MathUtils.clamp(_rel.dot(d) / len2, 0, 1);
      _rel.addScaledVector(d, -t);
      const r = c.radius * c.scale * 0.85;
      if (_rel.lengthSq() < r * r) return true;
    }
    return false;
  }

  // 轨迹的材质第一次用时要编译着色器，提前做掉，免得第一次丢手雷卡一下
  precompile(renderer, camera) {
    const t = new Trail(this.scene, 'frag', new THREE.Vector3(0, -50, 0));
    t.addPoint(new THREE.Vector3(1, -50, 0));
    t.update(0, camera.position);
    renderer.compile(this.scene, camera);
    t.dispose();
  }

  pulseLight(pos, color, peak, seconds) {
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.lightPeak = peak;
    this.lightMax = this.lightTime = seconds;
    this.light.intensity = peak;
  }

  // 开新一局：还在飞的和飘着的都清掉
  clear() {
    for (const g of this.flying) this.scene.remove(g.model);
    this.flying = [];
    this.clouds.forEach((c) => this.removeCloud(c));
    this.clouds = [];
    this.trails.forEach((t) => t.dispose());
    this.trails = [];
    this.lightTime = 0;
    this.light.intensity = 0;
  }
};

const _segDir = new THREE.Vector3(), _rel = new THREE.Vector3();

// 飞行轨迹：一条永远面向镜头的飘带。
// WebGL 的线条只有 1 像素宽，远一点就看不见了，所以用三角形带自己画，宽度和透明度都能控制。
// 宽度按到镜头的距离算，屏幕上粗细基本恒定：否则刚出手时离镜头太近，会糊成一大片。
// 每个采样点有自己的寿命，越老越细越淡，所以飞行时后面的线慢慢消失，落地后整条散掉。
class Trail {
  constructor(scene, kind, start) {
    this.scene = scene;
    this.points = [];
    this.color = { frag: [1, 0.86, 0.62], flash: [0.88, 0.95, 1], smoke: [0.78, 0.84, 0.74] }[kind];

    const cap = this.cap = 110;
    this.positions = new Float32Array(cap * 2 * 3);
    this.colors = new Float32Array(cap * 2 * 4);
    const index = [];
    for (let i = 0; i < cap - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    geo.setIndex(index);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.addPoint(start);
  }

  addPoint(p) {
    const last = this.points[this.points.length - 1];
    if (last && last.p.distanceToSquared(p) < 0.03) {   // 间隔太小不加点，只把最新的点挪过去
      if (this.points.length > 1) last.p.copy(p);
      return;
    }
    this.points.push({ p: p.clone(), life: Game.Config.grenades.trailLife });
    if (this.points.length > this.cap) this.points.shift();
  }

  update(dt, eye) {
    const max = Game.Config.grenades.trailLife;
    for (const q of this.points) q.life -= dt;
    while (this.points.length && this.points[0].life <= 0) this.points.shift();

    const P = this.points, n = P.length, pos = this.positions, col = this.colors, c = this.color;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)].p, b = P[Math.min(n - 1, i + 1)].p, q = P[i];
      _tan.subVectors(b, a);
      _view.subVectors(eye, q.p);
      const dist = _view.length();
      _side.crossVectors(_tan, _view);
      const len = _side.length();
      if (len > 1e-6) _side.multiplyScalar(1 / len);
      const k = q.life / max;
      const w = THREE.MathUtils.clamp(dist * 0.0026, 0.002, 0.07) * (0.45 + 0.55 * k);   // 半宽（米）
      const alpha = Math.min(1, k * 1.5) * Math.min(1, dist / 2.5) * 0.7;    // 贴脸的一段淡掉
      const j = i * 2;
      pos[j * 3] = q.p.x + _side.x * w; pos[j * 3 + 1] = q.p.y + _side.y * w; pos[j * 3 + 2] = q.p.z + _side.z * w;
      pos[j * 3 + 3] = q.p.x - _side.x * w; pos[j * 3 + 4] = q.p.y - _side.y * w; pos[j * 3 + 5] = q.p.z - _side.z * w;
      for (const v of [j, j + 1]) {
        col[v * 4] = c[0]; col[v * 4 + 1] = c[1]; col[v * 4 + 2] = c[2]; col[v * 4 + 3] = alpha;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
const _tan = new THREE.Vector3(), _view = new THREE.Vector3(), _side = new THREE.Vector3();
