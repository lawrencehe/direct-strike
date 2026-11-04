// ============================================================
// 场景：一座废弃的集装箱堆场，做成 1v1 竞技场
//
// 坐标约定：x 左右（-18 ~ 18），z 前后（-24 ~ 24），y 向上。
//   玩家一侧在 +z（南），敌人一侧在 -z（北），中间是一座带台阶的高台。
//
// 每个会挡人的物体同时登记为：
//   colliders  —— 碰撞盒（AABB），玩家和 NPC 不能穿过
//   shootables —— 子弹射线、NPC 视线可以打中/被挡住的物体
// 纯装饰的东西（水洼、碎石、远景）只进 shootables 或者什么都不进。
//
// 布局数据（出生点、巡逻点、靶子位置）也在这里，方便改地图时一起改。
// ============================================================
Game.World = (function () {
  const T = Game.Textures;

  // 集装箱尺寸（米）
  const C_L = 6, C_H = 2.6, C_W = 2.44;

  function build(scene) {
    const colliders = [];
    const shootables = [];
    const animated = [];   // 每帧需要更新的东西（尘埃、云）

    // ---------- 工具 ----------
    function register(mesh, { collide = true, shoot = true } = {}) {
      mesh.updateMatrixWorld();
      if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
      if (shoot) shootables.push(mesh);
      return mesh;
    }

    // y 指物体底部高度
    function addBox(w, h, d, x, y, z, material, opts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      return register(mesh, opts);
    }

    // 只有碰撞、看不见的盒子（比如铁丝网上方的空气墙）
    function addBlocker(w, h, d, x, y, z) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2)
      ));
    }

    function addCylinder(r, h, x, y, z, material, opts) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), material);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      return register(mesh, opts);
    }

    // ---------- 材质 ----------
    const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, ...extra });

    const mats = {
      asphalt: std(T.asphalt(9)),
      dirt: std(T.dirt(60)),
      concrete: std(T.concrete(1)),
      concreteDark: std(T.concrete(1, '#7d7b76')),
      sandbag: std(T.sandbag()),
      wood: std(T.wood()),
      metal: std(T.metal(), { roughness: 0.6, metalness: 0.4 }),
      metalDark: std(T.metal('#3a3d41'), { roughness: 0.55, metalness: 0.5 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.95 }),
      barrelRed: std(T.barrel('#8a2f24'), { roughness: 0.6, metalness: 0.3 }),
      barrelBlue: std(T.barrel('#2d4f7a'), { roughness: 0.6, metalness: 0.3 }),
      barrelGrey: std(T.barrel('#5f6366'), { roughness: 0.6, metalness: 0.3 }),
      fence: new THREE.MeshStandardMaterial({
        map: T.chainlink(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5,
      }),
      // 水洼：边缘用 alphaMap 渐隐，粗糙度别太低，否则对着太阳看是一块刺眼的亮斑
      puddle: new THREE.MeshStandardMaterial({
        color: 0x2a3440, roughness: 0.3, metalness: 0.3, transparent: true, opacity: 0.6,
        alphaMap: T.softDisc('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), depthWrite: false,
      }),
      stain: new THREE.MeshBasicMaterial({
        map: T.softDisc('rgba(10,8,6,0.75)', 'rgba(10,8,6,0)'), transparent: true, depthWrite: false,
      }),
    };

    // 集装箱材质：按颜色缓存，每种颜色生成一次贴图
    const containerCache = {};
    function containerMats(color, label) {
      if (!containerCache[color]) {
        const { map, bump } = T.container(color, label);
        const side = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.02, roughness: 0.7, metalness: 0.35 });
        const top = side.clone(); top.map = map.clone(); top.map.repeat.set(1, 0.4); top.map.needsUpdate = true;
        const door = new THREE.MeshStandardMaterial({ map: T.containerDoor(color), roughness: 0.7, metalness: 0.35 });
        containerCache[color] = { side, top, door };
      }
      return containerCache[color];
    }

    // 集装箱：alongZ=false 时长边沿 x 轴。y 指底部高度（叠放时传 C_H）
    function addContainer(x, y, z, alongZ, color, label) {
      const m = containerMats(color, label);
      // BoxGeometry 的六个面顺序：+x, -x, +y, -y, +z, -z
      const faces = alongZ
        ? [m.side, m.side, m.top, m.top, m.door, m.door]
        : [m.door, m.door, m.top, m.top, m.side, m.side];
      const w = alongZ ? C_W : C_L, d = alongZ ? C_L : C_W;
      return addBox(w, C_H, d, x, y, z, faces);
    }

    // ---------- 天空、雾、灯光 ----------
    const horizon = 0xd6cbb8;
    scene.fog = new THREE.Fog(horizon, 45, 260);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(280, 32, 16),
      new THREE.MeshBasicMaterial({ map: T.sky(), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    scene.add(skyDome);

    const sunDir = new THREE.Vector3(-0.55, 0.5, 0.42).normalize();
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softDisc('rgba(255,250,225,1)', 'rgba(255,230,180,0)'), fog: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sunSprite.position.copy(sunDir).multiplyScalar(250);
    sunSprite.scale.setScalar(60);
    scene.add(sunSprite);

    scene.add(new THREE.HemisphereLight(0xbfd4ee, 0x6b5a46, 0.55));
    const sun = new THREE.DirectionalLight(0xffe3c0, 1.35);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(Game.Config.graphics.shadowMapSize, Game.Config.graphics.shadowMapSize);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 5, far: 140 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // 云：挂在远处慢慢飘
    const cloudTex = T.cloud();
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, opacity: 0.9, transparent: true }));
      const a = Math.random() * Math.PI * 2, r = 170 + Math.random() * 60;
      s.position.set(Math.cos(a) * r, 60 + Math.random() * 50, Math.sin(a) * r);
      s.scale.set(90 + Math.random() * 70, 45 + Math.random() * 30, 1);
      scene.add(s);
      animated.push({ obj: s, angle: a, radius: r, speed: 0.004 + Math.random() * 0.004 });
    }

    // 远山：一圈环形剪影
    const hills = new THREE.Mesh(
      new THREE.CylinderGeometry(190, 190, 60, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: T.hills(), side: THREE.BackSide, transparent: true, depthWrite: false })
    );
    hills.material.map.repeat.set(3, 1);
    hills.position.y = 20;
    scene.add(hills);

    // ---------- 地面 ----------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mats.dirt);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    shootables.push(ground);
    colliders.push(new THREE.Box3(new THREE.Vector3(-200, -1, -200), new THREE.Vector3(200, 0, 200)));

    const yard = new THREE.Mesh(new THREE.PlaneGeometry(37, 49), mats.asphalt);
    yard.rotation.x = -Math.PI / 2;
    yard.receiveShadow = true;
    scene.add(yard);
    shootables.push(yard);

    // 两块水泥浇筑区
    for (const z of [14, -14]) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mats.concreteDark);
      pad.material = mats.concreteDark.clone();
      pad.material.map = T.concrete(1, '#858279');
      pad.material.map.repeat.set(2, 1);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(0, 0.004, z);
      pad.receiveShadow = true;
      scene.add(pad);
      shootables.push(pad);
    }

    // 水洼和油渍
    const puddle = (x, z, w, d, rot) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mats.puddle);
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.scale.set(w, d, 1);
      m.position.set(x, 0.006, z);
      scene.add(m);
    };
    puddle(-3, -18, 2.4, 1.4, 0.4);
    puddle(12.5, 19.5, 1.8, 1.1, -0.3);
    puddle(-14.5, 11, 1.5, 1.0, 1.0);
    const stain = (x, z, r) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mats.stain);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.007, z);
      scene.add(m);
    };
    stain(15.5, -10.5, 1.6); stain(-15, -16, 1.2); stain(2, 7, 1.0); stain(-10, 18, 0.8);

    // ---------- 围栏：矮水泥墩 + 铁丝网 + 空气墙 ----------
    const fenceTexRepeat = (len) => {
      const m = mats.fence.clone();
      m.map = mats.fence.map.clone();
      m.map.repeat.set(len / 0.5, 2.5 / 0.5);
      m.map.needsUpdate = true;
      return m;
    };
    function fenceSide(len, x, z, alongX) {
      const w = alongX ? len : 0.5, d = alongX ? 0.5 : len;
      addBox(w, 1.0, d, x, 0, z, mats.concrete);                      // 水泥墩
      addBlocker(w, 2.6, d, x, 1.0, z);                                 // 铁丝网上的空气墙
      const net = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.5), fenceTexRepeat(len));
      net.position.set(x, 1.0 + 1.25, z);
      if (!alongX) net.rotation.y = Math.PI / 2;
      net.castShadow = true;
      scene.add(net);
      shootables.push(net);
      for (let i = -len / 2; i <= len / 2; i += 6) {                    // 立柱
        addBox(0.12, 3.6, 0.12, alongX ? x + i : x, 0, alongX ? z : z + i, mats.metalDark, { collide: false });
      }
    }
    fenceSide(37, 0, -24.25, true);
    fenceSide(37, 0, 24.25, true);
    fenceSide(49, -18.25, 0, false);
    fenceSide(49, 18.25, 0, false);

    // 四角灯柱
    for (const [x, z] of [[-17, -23], [17, -23], [-17, 23], [17, 23]]) {
      addCylinder(0.08, 7, x, 0, z, mats.metalDark);
      const armDir = x < 0 ? 1 : -1;
      addBox(1.2, 0.08, 0.08, x + armDir * 0.6, 6.8, z, mats.metalDark, { collide: false });
      const lamp = addBox(0.5, 0.18, 0.3, x + armDir * 1.1, 6.7, z,
        new THREE.MeshStandardMaterial({ color: 0x333, emissive: 0xfff2cc, emissiveIntensity: 0.6 }), { collide: false });
      lamp.castShadow = false;
    }

    // ---------- 中央高台 ----------
    addBox(10, 1.2, 6, 0, 0, 0, mats.concrete);
    for (let i = 1; i <= 3; i++) {                                      // 东西两侧台阶（每级 0.3 米）
      const h = 0.3 * i, off = 5.25 + 0.5 * (3 - i);
      addBox(0.5, h, 3, -off, 0, 0, mats.concreteDark);
      addBox(0.5, h, 3, off, 0, 0, mats.concreteDark);
    }
    addBox(4, 0.9, 0.6, 0, 1.2, -2.7, mats.sandbag);                   // 高台两端的沙袋
    addBox(4, 0.9, 0.6, 0, 1.2, 2.7, mats.sandbag);

    // ---------- 集装箱 ----------
    addContainer(-9, 0, 14, false, '#8c3b2a', 'MSCU 482913');          // 南排
    addContainer(9, 0, 14, false, '#2f5f8f', 'TCLU 771204');
    addContainer(9.6, C_H, 14.2, false, '#6f7378', 'CMAU 309557');     // 叠在上面
    addContainer(-11.5, 0, 0, false, '#3e6b3a', 'OOLU 115878');        // 中排
    addContainer(11.5, 0, 0, false, '#b8912a', 'HLXU 640021');
    addContainer(-9, 0, -14, true, '#2f5f8f', 'TCLU 905311');          // 北排
    addContainer(9, 0, -14, true, '#8c3b2a', 'MSCU 207466');
    addContainer(9, C_H, -14, true, '#3e6b3a', 'OOLU 558120');

    // ---------- 掩体 ----------
    const jersey = (x, z, alongX) => addBox(alongX ? 2.4 : 0.5, 0.85, alongX ? 0.5 : 2.4, x, 0, z, mats.concreteDark);
    jersey(-4, 8, true); jersey(4, 8, true);
    jersey(-4, -8, true); jersey(4, -8, true);
    addBox(3, 0.9, 0.6, 0, 0, 14, mats.sandbag);                       // 南排中间
    addBox(0.6, 0.9, 3, -15.5, 0, -8, mats.sandbag);                   // 西道
    addBox(0.6, 0.9, 3, 15.5, 0, 8, mats.sandbag);                     // 东道

    // 油桶：几组
    const barrel = (x, z, mat) => addCylinder(0.3, 0.9, x, 0, z, mat);
    barrel(-15.5, 6, mats.barrelRed); barrel(-16.2, 6.7, mats.barrelBlue); barrel(-14.9, 6.8, mats.barrelGrey);
    barrel(3.2, -19.5, mats.barrelGrey); barrel(3.9, -20.1, mats.barrelRed);
    barrel(-12.5, -20, mats.barrelBlue);
    // 一个倒着的油桶（只做视觉，碰撞用方块）
    const lying = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18), mats.barrelRed);
    lying.rotation.z = Math.PI / 2; lying.rotation.y = 0.4;
    lying.position.set(-14.2, 0.3, 7.6);
    lying.castShadow = lying.receiveShadow = true;
    scene.add(lying);
    shootables.push(lying);
    addBlocker(0.9, 0.6, 0.9, -14.2, 0, 7.6);

    // 轮胎堆
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 10, 20), mats.rubber);
      t.rotation.x = Math.PI / 2;
      t.position.set(-16, 0.13 + i * 0.26, 16);
      t.castShadow = t.receiveShadow = true;
      scene.add(t);
      shootables.push(t);
    }
    addBlocker(0.95, 0.8, 0.95, -16, 0, 16);

    // 电缆盘
    addCylinder(0.75, 0.15, -15, 0, -17, mats.wood);
    addCylinder(0.3, 0.8, -15, 0.15, -17, mats.wood);
    addCylinder(0.75, 0.15, -15, 0.95, -17, mats.wood, { collide: false });
    addBlocker(1.5, 1.1, 1.5, -15, 0, -17);

    // 木托盘堆 + 上面的木箱
    for (let i = 0; i < 5; i++) addBox(1.2, 0.14, 1.0, 15, i * 0.14, 13, mats.wood, { collide: false });
    addBox(0.9, 0.9, 0.8, 15, 0.7, 13, mats.wood, { collide: false });
    addBlocker(1.2, 1.6, 1.0, 15, 0, 13);

    // 卡车：驾驶室 + 车斗 + 轮子 + 货物
    addBox(2.2, 2.2, 2.2, 15.5, 0.6, -7.5, mats.metal);
    addBox(2.0, 0.8, 1.6, 15.5, 1.3, -7.8, new THREE.MeshStandardMaterial({ color: 0x1a222b, roughness: 0.2, metalness: 0.6 }), { collide: false });
    addBox(2.2, 0.35, 7.6, 15.5, 0.45, -4.3, mats.metalDark);
    addBox(2.2, 0.9, 5.2, 15.5, 0.8, -3.2, mats.metal);
    addBlocker(2.4, 2.8, 7.6, 15.5, 0, -4.3);
    for (const z of [-7.0, -2.6, -1.4]) for (const x of [14.4, 16.6]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 14), mats.rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      w.castShadow = true;
      scene.add(w);
      shootables.push(w);
    }
    addBox(1.2, 1.2, 1.2, 15.5, 1.7, -2.2, mats.wood, { collide: false });
    addCylinder(0.3, 0.9, 15.1, 1.7, -4.6, mats.barrelBlue, { collide: false });
    addBlocker(2.4, 3.0, 2.0, 15.5, 2.0, -2.2);                        // 车斗上的货物统一用一堵空气墙

    // 碎石、杂物：不碰撞，只增加地面细节
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x5b5955, roughness: 1 });
    for (let i = 0; i < 60; i++) {
      const s = 0.08 + Math.random() * 0.25;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s * (0.6 + Math.random())), debrisMat);
      m.position.set((Math.random() - 0.5) * 35, s * 0.25, (Math.random() - 0.5) * 47);
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }

    // ---------- 场外远景 ----------
    const whMats = ['#6d6a63', '#55606a', '#7a6a58'].map((c) => std(T.warehouse(c), { roughness: 0.9 }));
    const far = (w, h, d, x, z, i) => {
      const m = addBox(w, h, d, x, 0, z, whMats[i % whMats.length], { collide: false, shoot: false });
      m.castShadow = false;
      return m;
    };
    far(30, 10, 20, -40, -60, 0); far(40, 12, 18, 35, -70, 1); far(25, 9, 40, 70, -10, 2);
    far(30, 8, 35, -75, 10, 1); far(35, 11, 20, -30, 65, 2); far(28, 9, 22, 45, 60, 0);
    far(60, 14, 20, 0, -95, 1); far(20, 7, 20, 80, 40, 2); far(22, 8, 30, -85, -40, 0);
    // 龙门吊
    for (const [x, z] of [[-55, -30], [60, 25]]) {
      addBox(1.2, 26, 1.2, x - 10, 0, z, mats.metalDark, { collide: false, shoot: false });
      addBox(1.2, 26, 1.2, x + 10, 0, z, mats.metalDark, { collide: false, shoot: false });
      addBox(26, 1.6, 1.6, x, 25, z, mats.metalDark, { collide: false, shoot: false });
    }
    // 水塔
    addCylinder(0.6, 18, 55, 0, -45, mats.metalDark, { collide: false, shoot: false });
    addCylinder(4, 5, 55, 18, -45, mats.metal, { collide: false, shoot: false });

    // ---------- 空气中的尘埃 ----------
    const dustCount = 400;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 36;
      dustPos[i * 3 + 1] = 0.2 + Math.random() * 5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 48;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: T.softDisc('rgba(255,245,225,0.9)', 'rgba(255,245,225,0)'),
      size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(dust);

    // ---------- 布局数据 ----------
    // yaw 约定：0 朝 -z（北），π 朝 +z（南）
    const spawns = [
      { x: 0, z: 21, yaw: 0 }, { x: -14, z: 21, yaw: 0.35 }, { x: 14, z: 21, yaw: -0.35 },
      { x: 0, z: -21, yaw: Math.PI }, { x: -14, z: -21, yaw: Math.PI - 0.35 }, { x: 14, z: -21, yaw: Math.PI + 0.35 },
      { x: -16, z: -3, yaw: -Math.PI / 2 }, { x: 16, z: 3, yaw: Math.PI / 2 },
    ];

    // NPC 巡逻会在这些点之间走：都是掩体旁边或者道口
    const navPoints = [
      [-9, 16.5], [-9, 11.5], [9, 16.5], [9, 11.5], [-2.5, 16], [2.5, 12],
      [-4, 9.3], [4, 9.3], [-4, -9.3], [4, -9.3],
      [-11.5, 2.6], [-11.5, -2.6], [11.5, 2.6], [11.5, -2.6],
      [-9, -18.5], [-9, -9.5], [9, -18.5], [9, -9.5],
      [-16.5, 3], [-16.5, -11], [16, 11], [16, -11],
      [0, 0], [0, -21], [0, 21], [-15, 19], [13, 20], [-13, -21], [13, -21],
    ].map(([x, z]) => ({ x, z }));

    // 训练场：站在高台上向北打
    const rangeSpawn = { x: 0, y: 1.2, z: 1.0, yaw: 0 };
    const targetLayout = [
      { x: -6, z: -7 }, { x: -2, z: -7 }, { x: 2, z: -7 }, { x: 6, z: -7 },
      { x: -5, z: -12, move: { range: 2, speed: 1.2 } },
      { x: 0, z: -12 },
      { x: 5, z: -12, move: { range: 2, speed: 0.9 } },
      { x: -6, z: -20 },
      { x: 0, z: -20, move: { range: 5, speed: 0.7 } },
      { x: 6, z: -20 },
    ];

    const bounds = { minX: -17.5, maxX: 17.5, minZ: -23.5, maxZ: 23.5 };

    // ---------- 每帧更新：尘埃飘动、云移动 ----------
    let time = 0;
    function update(dt) {
      time += dt;
      const p = dust.geometry.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        p[i * 3] += Math.sin(time * 0.5 + i) * 0.15 * dt + 0.08 * dt;
        p[i * 3 + 1] += Math.cos(time * 0.7 + i * 0.3) * 0.1 * dt;
        if (p[i * 3] > 18) p[i * 3] = -18;
        if (p[i * 3 + 1] < 0.1) p[i * 3 + 1] = 5;
        if (p[i * 3 + 1] > 5.2) p[i * 3 + 1] = 0.2;
      }
      dust.geometry.attributes.position.needsUpdate = true;

      for (const c of animated) {
        c.angle += c.speed * dt;
        c.obj.position.x = Math.cos(c.angle) * c.radius;
        c.obj.position.z = Math.sin(c.angle) * c.radius;
      }
    }

    return {
      colliders, shootables, update,
      spawns, navPoints, rangeSpawn, targetLayout, bounds,
      spawn: new THREE.Vector3(spawns[0].x, 0, spawns[0].z),
    };
  }

  return { build };
})();
