// ============================================================
// 靶子：打中后向后倒下，几秒后重新立起
// 每个靶子是一个"状态机"：up（立着）→ falling（倒下中）→ down（躺着）→ rising（立起中）→ up
// 靶身和靶头是两个独立的网格，射线打中哪个就知道是不是爆头。
// ============================================================
Game.Targets = (function () {

  // 靶纸贴图：白底红色同心圆
  function plateTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 128, 160);
    for (let r = 56; r > 0; r -= 14) {
      g.beginPath(); g.arc(64, 80, r, 0, Math.PI * 2);
      g.fillStyle = (r / 14) % 2 ? '#d23a2a' : '#f2efe6';
      g.fill();
    }
    g.strokeStyle = '#333'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 156);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 靶子位置：近、中、远三排，部分会左右移动
  const LAYOUT = [
    { x: -6, z: -4 }, { x: -2, z: -4 }, { x: 2, z: -4 }, { x: 6, z: -4 },
    { x: -8, z: -13, move: { range: 3, speed: 1.2 } },
    { x: 0, z: -13 },
    { x: 8, z: -13, move: { range: 3, speed: 0.9 } },
    { x: -6, z: -24 },
    { x: 0, z: -24, move: { range: 6, speed: 0.7 } },
    { x: 6, z: -24 },
  ];

  class Target {
    constructor(scene, mats, spec) {
      this.baseX = spec.x;
      this.move = spec.move || null;
      this.phase = Math.random() * Math.PI * 2;
      this.state = 'up';
      this.timer = 0;

      // root：整体位置（左右移动）；pivot：靶子底部的转轴（倒下）
      this.root = new THREE.Group();
      this.root.position.set(spec.x, 0, spec.z);
      scene.add(this.root);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), mats.metal);
      base.position.y = 0.075;
      base.castShadow = base.receiveShadow = true;
      this.root.add(base);

      this.pivot = new THREE.Group();
      this.pivot.position.y = 0.15;
      this.root.add(this.pivot);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), mats.metal);
      post.position.y = 0.25;

      this.body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), mats.plate);
      this.body.position.y = 0.95;
      this.body.userData = { target: this, part: 'body' };

      this.head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), mats.head);
      this.head.position.y = 1.62;
      this.head.userData = { target: this, part: 'head' };

      this.meshes = [post, this.body, this.head];
      for (const m of this.meshes) {
        m.castShadow = true;
        this.pivot.add(m);
      }
    }

    // 对战模式下把靶子藏起来
    setActive(on) {
      this.root.visible = on;
      this.state = 'up';
      this.pivot.rotation.x = 0;
      this.clearDecals();
    }

    // 被打中时调用。返回 true 表示这一枪有效（击倒了靶子）
    onHit() {
      if (this.state !== 'up') return false;
      this.state = 'falling';
      this.timer = 0;
      return true;
    }

    update(dt, time) {
      if (this.move) {
        this.root.position.x = this.baseX + Math.sin(time * this.move.speed + this.phase) * this.move.range;
      }

      const DOWN = -Math.PI / 2;  // 向后倒 90 度
      this.timer += dt;
      if (this.state === 'falling') {
        const p = Math.min(1, this.timer / 0.2);
        this.pivot.rotation.x = DOWN * p * p;  // 先慢后快，像真的倒下
        if (p >= 1) { this.state = 'down'; this.timer = 0; }
      } else if (this.state === 'down') {
        if (this.timer >= Game.Config.targets.resetTime) {
          this.state = 'rising'; this.timer = 0;
          this.clearDecals();
        }
      } else if (this.state === 'rising') {
        const p = Math.min(1, this.timer / 0.4);
        this.pivot.rotation.x = DOWN * (1 - p);
        if (p >= 1) { this.state = 'up'; this.pivot.rotation.x = 0; }
      }
    }

    // 立起来时擦掉身上的弹孔
    clearDecals() {
      for (const part of this.pivot.children) {
        for (const child of [...part.children]) {
          if (child.userData.isDecal) part.remove(child);
        }
      }
    }
  }

  function create(scene) {
    const mats = {
      metal: new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.4 }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.9 }),
      head: new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.8 }),
    };
    return LAYOUT.map((spec) => new Target(scene, mats, spec));
  }

  return { create };
})();
