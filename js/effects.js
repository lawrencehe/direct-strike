// ============================================================
// 短暂的视觉效果：NPC 的弹道轨迹（曳光）、枪口火光、血、爆炸
// 每个效果有一个寿命，寿命内逐渐变透明，到期自动删除。
//
// 血分三层：
//   血雾   中弹瞬间的一小团（Sprite）
//   血滴   飞出去受重力下落的小点，落地时留下血迹（一个 Points 共用，不产生额外绘制调用）
//   血泊   尸体下面慢慢渗开的一滩（平铺在地面的贴图，半径随时间变大）
// ============================================================
Game.Effects = class Effects {
  constructor(scene, colliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.items = [];
    this.flashMat = new THREE.SpriteMaterial({
      map: Game.Effects.flashTexture(), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.buildDroplets();
    this.stains = [];
    this.stainGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  // 枪口火焰贴图：中心发白、向外变橙的星形（玩家和 NPC 共用）
  static flashTexture() {
    if (Game.Effects._flashTex) return Game.Effects._flashTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,220,1)');
    grad.addColorStop(0.3, 'rgba(255,190,80,0.9)');
    grad.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 12 : 32;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    Game.Effects._flashTex = new THREE.CanvasTexture(c);
    return Game.Effects._flashTex;
  }

  static bloodTexture() {
    if (!Game.Effects._bloodTex) Game.Effects._bloodTex = Game.Textures.softDisc('rgba(140,10,10,0.9)', 'rgba(90,0,0,0)');
    return Game.Effects._bloodTex;
  }

  static smokeTexture() {
    if (!Game.Effects._smokeTex) Game.Effects._smokeTex = Game.Textures.softDisc('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    return Game.Effects._smokeTex;
  }

  // 血迹贴图：一大块不规则的血，外面溅几个小点。画几张随机用，看起来不重复
  static stainTextures() {
    if (Game.Effects._stainTex) return Game.Effects._stainTex;
    const make = () => {
      const s = 256, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(58,3,5)';
      // 用多个偏移的圆叠成不规则的边缘
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.2;
        const r = s * (0.08 + Math.random() * 0.13);
        g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, d = s * (0.3 + Math.random() * 0.18);
        g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + Math.random() * 5, 0, Math.PI * 2); g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    };
    Game.Effects._stainTex = [make(), make(), make()];
    return Game.Effects._stainTex;
  }

  // 爆炸焦痕
  static scorchTexture() {
    if (!Game.Effects._scorchTex) {
      Game.Effects._scorchTex = Game.Textures.softDisc('rgba(10,10,10,0.95)', 'rgba(10,10,10,0)');
      Game.Effects._scorchTex.encoding = THREE.sRGBEncoding;
    }
    return Game.Effects._scorchTex;
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.08, max: 0.08 });
  }

  muzzleFlash(pos) {
    const sprite = new THREE.Sprite(this.flashMat.clone());
    sprite.position.copy(pos);
    sprite.scale.setScalar(0.45);
    this.scene.add(sprite);
    this.items.push({ obj: sprite, life: 0.05, max: 0.05 });
  }

  // 一张会扩大、上升、淡出的 Sprite：血雾、爆炸火球和爆炸烟都用它
  puff(pos, tex, { size = 1, grow = 0, rise = 0, life = 0.3, color = 0xffffff, additive = false, opacity = 1 } = {}) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, color,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    sprite.position.copy(pos);
    sprite.scale.setScalar(size);
    sprite.material.rotation = Math.random() * Math.PI * 2;
    this.scene.add(sprite);
    this.items.push({ obj: sprite, life, max: life, grow, rise, opacity });
    return sprite;
  }

  // 打中 NPC 时冒出的一小团血雾
  bloodPuff(pos, size = 0.25 + Math.random() * 0.15, life = 0.25) {
    this.puff(pos, Game.Effects.bloodTexture(), { size, grow: size * 1.2, life });
  }

  // 中弹没死：血雾 + 少量血滴
  bloodHit(point, dir) {
    this.bloodPuff(point);
    this.spray(point, dir, 7, 2.2);
  }

  // 打死：更大的一团，血滴也多。爆头时喷得最猛
  bloodBurst(point, dir, head) {
    this.bloodPuff(point, head ? 0.7 : 0.42, head ? 0.5 : 0.35);
    this.spray(point, dir, head ? 46 : 22, head ? 4.6 : 3);
  }

  // 尸体伤口往外流：按时间连续冒血滴
  bleed(pos, dt, rate = 16) {
    this.bleedAcc = (this.bleedAcc || 0) + rate * dt;
    const n = Math.floor(this.bleedAcc);
    this.bleedAcc -= n;
    for (let i = 0; i < n; i++) {
      this.emitDrop(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
    }
  }

  // 大部分顺着子弹方向喷出去，少量往回溅
  spray(point, dir, count, speed) {
    for (let i = 0; i < count; i++) {
      const s = (Math.random() < 0.22 ? -0.5 : 1) * speed * (0.35 + Math.random());
      this.emitDrop(point.x, point.y, point.z,
        dir.x * s + (Math.random() - 0.5) * speed * 0.7,
        dir.y * s + (Math.random() - 0.2) * speed * 0.6,
        dir.z * s + (Math.random() - 0.5) * speed * 0.7);
    }
  }

  // ---------- 血滴 ----------
  buildDroplets() {
    const cap = this.dropCap = 400;
    this.dropPos = new Float32Array(cap * 3).fill(-999);
    this.dropVel = new Float32Array(cap * 3);
    this.dropLife = new Float32Array(cap);
    this.dropNext = 0;
    this.dropAlive = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3));
    this.dropMesh = new THREE.Points(geo, new THREE.PointsMaterial({
      map: Game.Effects.bloodTexture(), color: 0xc01515, size: 0.075, sizeAttenuation: true,
      transparent: true, depthWrite: false, alphaTest: 0.08,
    }));
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);
  }

  emitDrop(x, y, z, vx, vy, vz) {
    const i = this.dropNext;
    this.dropNext = (i + 1) % this.dropCap;
    this.dropPos[i * 3] = x; this.dropPos[i * 3 + 1] = y; this.dropPos[i * 3 + 2] = z;
    this.dropVel[i * 3] = vx; this.dropVel[i * 3 + 1] = vy; this.dropVel[i * 3 + 2] = vz;
    this.dropLife[i] = 2.5;
    this.dropAlive = this.dropCap;     // 有活动血滴就要逐个检查
  }

  updateDroplets(dt) {
    if (!this.dropAlive) return;
    const P = this.dropPos, V = this.dropVel, L = this.dropLife;
    const g = 11 * dt;
    let alive = 0;
    for (let i = 0; i < this.dropCap; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      const j = i * 3;
      V[j + 1] -= g;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      const c = this.boxAt(P[j], P[j + 1], P[j + 2]);
      if (c || L[i] <= 0) {
        // 落到平面上：一部分留下一小点血迹
        if (c && P[j + 1] > c.max.y - 0.25 && Math.random() < 0.5) {
          this.addStain(P[j], c.max.y, P[j + 2], 0.025 + Math.random() * 0.06, { life: 18 });
        }
        L[i] = 0;
        P[j + 1] = -999;
        continue;
      }
      alive++;
    }
    this.dropAlive = alive;
    this.dropMesh.geometry.attributes.position.needsUpdate = true;
  }

  boxAt(x, y, z) {
    for (const c of this.colliders) {
      if (x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return c;
    }
    return null;
  }

  // (x, z) 处 y 以下最高的表面高度
  groundAt(x, z, y) {
    let top = -Infinity;
    for (const c of this.colliders) {
      if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= y && c.max.y > top) top = c.max.y;
    }
    return top === -Infinity ? 0 : top;
  }

  // ---------- 血迹、血泊、焦痕 ----------
  // radius 是最终半径；spread > 0 时用这么多秒慢慢渗开
  addStain(x, y, z, radius, { life = 25, spread = 0, tex = null, opacity = 0.95 } = {}) {
    const textures = Game.Effects.stainTextures();
    const mat = new THREE.MeshStandardMaterial({
      map: tex || textures[Math.floor(Math.random() * textures.length)],
      transparent: true, depthWrite: false, roughness: 0.28, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    mat.opacity = opacity;
    const mesh = new THREE.Mesh(this.stainGeo, mat);
    mesh.position.set(x, y + 0.008, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.receiveShadow = true;
    const size = radius * 2 / 0.7;      // 贴图里的血只占中间约 70%
    mesh.scale.setScalar(spread ? size * 0.12 : size);
    this.scene.add(mesh);
    this.stains.push({ mesh, life, max: life, size, spread, age: 0, opacity });
    while (this.stains.length > 70) this.removeStain(this.stains.shift());
    return mesh;
  }

  // 尸体下面的血泊：根据脚下平台大小收一收，不要悬空挂在集装箱边上
  bloodPool(pos, radius) {
    const y = this.groundAt(pos.x, pos.z, pos.y + 0.4);
    let r = radius;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      for (let d = 0.2; d <= radius; d += 0.2) {
        if (this.groundAt(pos.x + dx * d, pos.z + dz * d, y + 0.01) < y - 0.01) { r = Math.min(r, d); break; }
      }
    }
    return this.addStain(pos.x, y, pos.z, Math.max(0.2, r), { life: 30, spread: 6 });
  }

  removeStain(s) {
    this.scene.remove(s.mesh);
    s.mesh.material.dispose();
  }

  updateStains(dt) {
    for (const s of this.stains) {
      s.life -= dt;
      s.age += dt;
      if (s.spread) {
        // 先快后慢地渗开
        const p = Math.min(1, s.age / s.spread);
        s.mesh.scale.setScalar(s.size * (0.12 + 0.88 * (1 - (1 - p) ** 3)));
      }
      if (s.life < 3) s.mesh.material.opacity = s.opacity * Math.max(0, s.life / 3);
      if (s.life <= 0) this.removeStain(s);
    }
    this.stains = this.stains.filter((s) => s.life > 0);
  }

  // ---------- 爆炸 ----------
  explosion(pos) {
    const smoke = Game.Effects.smokeTexture();
    this.puff(pos, Game.Effects.flashTexture(), { size: 3.6, grow: 5, life: 0.22, additive: true });
    this.puff(pos, smoke, { size: 2.2, grow: 5, life: 0.28, additive: true, color: 0xff9a40 });
    for (let i = 0; i < 9; i++) {
      const p = pos.clone();
      p.x += (Math.random() - 0.5) * 1.6; p.z += (Math.random() - 0.5) * 1.6; p.y += Math.random() * 0.9;
      const c = 0x20 + Math.floor(Math.random() * 0x28);
      this.puff(p, smoke, {
        size: 1.2 + Math.random(), grow: 1.2 + Math.random(), rise: 0.7 + Math.random() * 0.9,
        life: 1.3 + Math.random() * 1.1, color: (c << 16) | (c << 8) | c, opacity: 0.85,
      });
    }
    this.addStain(pos.x, this.groundAt(pos.x, pos.z, pos.y + 0.3), pos.z, 1.1, { life: 30, tex: Game.Effects.scorchTexture(), opacity: 0.8 });
  }

  // 闪光弹：一团纯白的光
  flashBang(pos) {
    this.puff(pos, Game.Effects.smokeTexture(), { size: 5, grow: 12, life: 0.3, additive: true });
  }

  update(dt) {
    for (const it of this.items) {
      it.life -= dt;
      it.obj.material.opacity = Math.max(0, it.life / it.max) * (it.opacity === undefined ? 1 : it.opacity);
      if (it.grow) it.obj.scale.addScalar(it.grow * dt);
      if (it.rise) it.obj.position.y += it.rise * dt;
      if (it.life <= 0) this.dispose(it);
    }
    this.items = this.items.filter((it) => it.life > 0);
    this.updateDroplets(dt);
    this.updateStains(dt);
  }

  clear() {
    this.items.forEach((it) => this.dispose(it));
    this.items = [];
    this.stains.forEach((s) => this.removeStain(s));
    this.stains = [];
    this.dropLife.fill(0);
    this.dropPos.fill(-999);
    this.dropAlive = 0;
    this.dropMesh.geometry.attributes.position.needsUpdate = true;
  }

  // 第一次出现新材质时要现编译着色器，会卡一下，而第一次通常就是第一次击杀。开局先编译好
  precompile(renderer, camera) {
    const pos = camera.position.clone();
    this.addStain(pos.x, -50, pos.z, 1, { life: 1 });
    this.puff(new THREE.Vector3(pos.x, -50, pos.z), Game.Effects.smokeTexture(), { life: 0.01 });
    renderer.compile(this.scene, camera);
    this.removeStain(this.stains.pop());
    this.dispose(this.items.pop());
  }

  dispose(it) {
    this.scene.remove(it.obj);
    if (it.obj.geometry && !it.obj.isSprite) it.obj.geometry.dispose();
    it.obj.material.dispose();
  }
};
