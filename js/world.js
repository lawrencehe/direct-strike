// ============================================================
// 场景：地面、围墙、掩体箱子、灯光
// 所有贴图都用 Canvas 画出来，不依赖图片文件。
// 每个方块同时登记为：
//   colliders  —— 碰撞盒，玩家不能穿过
//   shootables —— 子弹射线可以打中的物体
// ============================================================
Game.World = (function () {

  function makeTexture(size, draw, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    return tex;
  }

  // 随机撒一些深浅斑点，让表面不那么"塑料"
  function speckle(g, size, count, alpha) {
    for (let i = 0; i < count; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  }

  // 地面：灰色水泥 + 每米一条细线，方便判断距离
  const floorTexture = () => makeTexture(256, (g, s) => {
    g.fillStyle = '#6b7078'; g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, 0.15);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = (i * s) / 4;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 4;
    g.strokeRect(0, 0, s, s);
  }, 16, 16);

  // 木箱
  const crateTexture = () => makeTexture(128, (g, s) => {
    g.fillStyle = '#9a6b3c'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#5e3c1c'; g.lineWidth = 3;
    for (let y = 16; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.lineWidth = 14; g.strokeRect(7, 7, s - 14, s - 14);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(s - 10, s - 10); g.stroke();
    speckle(g, s, 400, 0.2);
  });

  // 围墙：浅色混凝土板
  const wallTexture = () => makeTexture(256, (g, s) => {
    g.fillStyle = '#bdb6a8'; g.fillRect(0, 0, s, s);
    speckle(g, s, 4000, 0.12);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, s - 8, s, 8);
    g.fillRect(s - 4, 0, 4, s);
    g.fillStyle = '#c85a2a'; g.fillRect(0, s * 0.62, s, 14);  // 一条橙色警示带
  }, 16, 1);

  function build(scene) {
    const colliders = [];
    const shootables = [];

    function addBox(w, h, d, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y + h / 2, z);  // y 指箱子底部高度，更直观
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      mesh.updateMatrixWorld();
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      return mesh;
    }

    // ---- 天空和雾 ----
    scene.background = new THREE.Color(0xa9c8e0);
    scene.fog = new THREE.Fog(0xa9c8e0, 50, 130);

    // ---- 灯光 ----
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 0.65));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.9);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 90 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ---- 地面 ----
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 64),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(new THREE.Box3(new THREE.Vector3(-32, -1, -32), new THREE.Vector3(32, 0, 32)));
    shootables.push(floor);

    // 射击线：地上一条黄线
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.8 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.01, 15);
    line.receiveShadow = true;
    scene.add(line);
    shootables.push(line);

    // ---- 围墙（60×60 的场地）----
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
    addBox(61, 4, 1, 0, 0, -30, wallMat);
    addBox(61, 4, 1, 0, 0, 30, wallMat);
    addBox(1, 4, 61, -30, 0, 0, wallMat);
    addBox(1, 4, 61, 30, 0, 0, wallMat);

    // ---- 掩体 ----
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.95 });

    // 左侧：一大一小两个箱子，可以先跳上小的，再跳上大的
    addBox(1.6, 1.6, 1.6, -9, 0, 9, crateMat);
    addBox(0.8, 0.8, 0.8, -7.6, 0, 9.3, crateMat);
    // 右侧：叠起来的箱子
    addBox(1.6, 1.6, 1.6, 8.5, 0, 10, crateMat);
    addBox(0.8, 0.8, 0.8, 7.2, 0, 9.4, crateMat);
    addBox(0.8, 0.8, 0.8, 8.5, 1.6, 10, crateMat);
    // 中间：两段矮墙
    addBox(7, 1.1, 0.5, -9, 0, 2, concreteMat);
    addBox(7, 1.1, 0.5, 9, 0, 2, concreteMat);
    // 两侧柱子
    addBox(1, 3.5, 1, -14, 0, -8, concreteMat);
    addBox(1, 3.5, 1, 14, 0, -8, concreteMat);

    return { colliders, shootables, spawn: new THREE.Vector3(0, 0, 20) };
  }

  return { build };
})();
