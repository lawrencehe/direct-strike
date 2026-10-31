// ============================================================
// 短暂的视觉效果：NPC 的弹道轨迹（曳光）和枪口火光
// 每个效果有一个寿命，寿命内逐渐变透明，到期自动删除。
// ============================================================
Game.Effects = class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flashMat = new THREE.SpriteMaterial({
      map: Game.Effects.flashTexture(), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
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

  update(dt) {
    for (const it of this.items) {
      it.life -= dt;
      it.obj.material.opacity = Math.max(0, it.life / it.max);
      if (it.life <= 0) this.dispose(it);
    }
    this.items = this.items.filter((it) => it.life > 0);
  }

  clear() {
    this.items.forEach((it) => this.dispose(it));
    this.items = [];
  }

  dispose(it) {
    this.scene.remove(it.obj);
    if (it.obj.geometry && !it.obj.isSprite) it.obj.geometry.dispose();
    it.obj.material.dispose();
  }
};
