// ============================================================
// 场景构建器：把地图数据（maps/*.json）变成 3D 场景
//
// 这里只放“怎么造”：每种物体的造型、材质，以及天空、光照这些所有地图共用的环境。
// “放在哪”全部在地图文件里，改布局不用改代码。格式说明见 docs/maps.md。
//
// 坐标约定：x 左右，z 前后（-z 为北），y 向上。
//
// 每个会挡人的物体同时登记为：
//   colliders  —— 碰撞盒（AABB），玩家和 NPC 不能穿过
//   shootables —— 子弹射线、NPC 视线可以打中/被挡住的物体
// 纯装饰的东西（水洼、碎石、远景）只进 shootables 或者什么都不进。
// ============================================================
Game.World = (function () {
  const T = Game.Textures;

  // 集装箱尺寸（米）
  const C_L = 6, C_H = 2.6, C_W = 2.44;

  // 加载地图文件。名字对应 maps/<名字>.json，由 config.js 的 map 指定
  async function loadMap(name) {
    const res = await fetch(`maps/${name}.json`);
    if (!res.ok) throw new Error(`地图 ${name} 加载失败（HTTP ${res.status}）`);
    const map = await res.json();
    await loadAssets(name, map);
    return map;
  }

  // ---------- 真实材质（#50） ----------
  // 地图文件的 surfaces 列出这张图用哪些 PBR 材质，值是一张贴图在现实中覆盖多少米；
  // 贴图在 assets/maps/<地图>/textures/<名字>_{diff,nor,rough}.webp（颜色、法线、粗糙度），
  // environment 是环境光 HDRI（只给材质照明和反射，不当天空显示）。
  // 开局前全部下载好，build 时直接用；下载失败就退回 textures.js 画的贴图，游戏照常能玩。
  const loaded = { surfaces: {}, env: null, models: {}, containerDiff: {} };

  // 道具模型（#50）：地图文件的 models 列出 物体类型 → glb（相对 assets/maps/<地图>/），
  // 有模型的类型用模型显示，碰撞和子弹仍按原来的方块（看不见的碰撞盒），所以换模型不影响走位、NPC 和地图检查。
  // 没下载成功就退回方块，游戏照常能玩。
  function loadGLB(path) {
    return new Promise((resolve, reject) => {
      new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(path, (g) => resolve(g.scene), undefined, reject);
    });
  }

  async function loadAssets(name, map) {
    const dir = `assets/maps/${name}/`;
    const texLoader = new THREE.TextureLoader();
    const tex = (file, srgb) => texLoader.loadAsync(dir + file).then((t) => {
      if (srgb) t.encoding = THREE.sRGBEncoding;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    });
    const jobs = Object.entries(map.surfaces || {}).map(async ([key, tile]) => {
      const [diff, nor, rough] = await Promise.all([
        tex(`textures/${key}_diff.webp`, true), tex(`textures/${key}_nor.webp`), tex(`textures/${key}_rough.webp`),
      ]);
      loaded.surfaces[key] = { diff, nor, rough, tile };
    });
    for (const [type, file] of Object.entries(map.models || {})) {
      jobs.push(loadGLB(dir + file).then((m) => { loaded.models[type] = m; }));
    }
    // 集装箱每种颜色一张颜色贴图（几何、法线、粗糙度共用），文件名 container_<颜色>_diff.webp，和 glb 放一起
    if (map.models && map.models.container) {
      const base = dir + map.models.container.replace(/[^/]*$/, '');
      const colors = new Set(map.objects.filter((o) => o.type === 'container').map((o) => o.color.slice(1).toLowerCase()));
      for (const c of colors) {
        jobs.push(texLoader.loadAsync(`${base}container_${c}_diff.webp`).then((t) => {
          t.encoding = THREE.sRGBEncoding;
          t.flipY = false;          // 和 glb 里的贴图一样（glTF 的 UV 原点在左上）
          t.anisotropy = 8;
          loaded.containerDiff[c] = t;
        }));
      }
    }
    if (map.environment) {
      jobs.push(new THREE.RGBELoader().loadAsync(dir + map.environment).then((t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;   // 渲染器会自动转成 PMREM
        loaded.env = t;
      }));
    }
    for (const r of await Promise.allSettled(jobs)) {
      if (r.status === 'rejected') console.warn('地图材质加载失败，退回程序生成的贴图：', r.reason);
    }
  }

  // 按真实尺寸铺贴图：UV 乘上"这个面有多少米 / 一张贴图覆盖多少米"，
  // 这样同一种材质在大小不同的物体上纹理一样大；再随机错开一点，相邻的墩子不会长得一模一样。
  // BoxGeometry 六个面依次是 +x, -x, +y, -y, +z, -z，每个面 4 个顶点
  function tileUV(geo, w, h, d, tile) {
    const uv = geo.attributes.uv;
    const spans = geo.type === 'BoxGeometry'
      ? [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
      : [[w, h]];
    const per = uv.count / spans.length;
    const ou = Math.random(), ov = Math.random();
    for (let i = 0; i < uv.count; i++) {
      const [su, sv] = spans[Math.floor(i / per)];
      uv.setXY(i, uv.getX(i) * su / tile + ou, uv.getY(i) * sv / tile + ov);
    }
    uv.needsUpdate = true;
  }

  function build(scene, map) {
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
      const geo = new THREE.BoxGeometry(w, h, d);
      if (material.userData && material.userData.tile) tileUV(geo, w, h, d, material.userData.tile);
      const mesh = new THREE.Mesh(geo, material);
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

    // 有 PBR 贴图就用（颜色 + 法线 + 粗糙度，按真实尺寸铺），没有就用 fallback（Canvas 画的）
    const pbr = (key, fallback, extra = {}) => {
      const s = loaded.surfaces[key];
      if (!s) return fallback;
      const m = new THREE.MeshStandardMaterial({ map: s.diff, normalMap: s.nor, roughnessMap: s.rough, roughness: 1, ...extra });
      m.userData.tile = s.tile;
      return m;
    };

    const mats = {
      asphalt: pbr('asphalt', std(T.asphalt(9))),
      dirt: pbr('dirt', std(T.dirt(60))),
      // 水泥贴图本身偏白，太阳下发亮，乘一个颜色压暗；concreteDark 是同一张贴图再暗一档
      concrete: pbr('concrete', std(T.concrete(1)), { color: 0xa39f99 }),
      concreteDark: pbr('concrete', std(T.concrete(1, '#7d7b76')), { color: 0x7a7772 }),
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

    // 放一个道具模型：模型原点在底面中心，rotY 绕竖轴转（弧度）。模型只管显示，不进碰撞和子弹判定
    function placeModel(type, x, y, z, rotY, materialFor) {
      const obj = loaded.models[type].clone();
      obj.userData.prop = type;          // 测试用：找到场景里的道具模型
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        if (materialFor) o.material = materialFor(o.material);
      });
      scene.add(obj);
      return obj;
    }
    // 看不见、但挡人挡子弹的方块：配合 placeModel 用，尺寸和原来的方块一样
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    function addProxy(w, h, d, x, y, z) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
      mesh.position.set(x, y + h / 2, z);
      scene.add(mesh);
      return register(mesh);
    }

    // 集装箱：alongZ=false 时长边沿 x 轴。y 指底部高度（叠放时传 C_H）
    const containerModelMats = {};
    function addContainer(x, y, z, alongZ, color, label) {
      if (loaded.models.container) {
        const c = color.slice(1).toLowerCase();
        const mat = (base) => {
          if (!containerModelMats[c]) {
            containerModelMats[c] = base.clone();
            if (loaded.containerDiff[c]) containerModelMats[c].map = loaded.containerDiff[c];
          }
          return containerModelMats[c];
        };
        // 门朝哪头按位置定，同一排的箱子不会全朝一个方向
        const flip = (Math.round(x * 7 + z * 13 + y) & 1) ? Math.PI : 0;
        placeModel('container', x, y, z, (alongZ ? Math.PI / 2 : 0) + flip, mat);
        const w = alongZ ? C_W : C_L, d = alongZ ? C_L : C_W;
        return addProxy(w, C_H, d, x, y, z);
      }
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
    const sr = map.shadowRange;
    Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 5, far: 140 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // 云：积云贴在远处、低仰角的一圈，越低的越偏地平线的暖灰色；高处再挂几条淡淡的卷云
    const cloudTexes = [0, 1, 2].map((v) => T.cloud(v));
    const horizonTint = new THREE.Color(0xe9e1d3);
    const N = 16;
    for (let i = 0; i < N; i++) {
      const tex = cloudTexes[i % cloudTexes.length];
      const big = i % 3 === 0;                                            // 每三朵有一朵大的
      const elev = THREE.MathUtils.degToRad(big ? 6 + Math.random() * 8 : 9 + Math.random() * 14);   // 仰角 6° ~ 23°
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.35, r = 205 + Math.random() * 45;
      const width = big ? 170 + Math.random() * 90 : 80 + Math.random() * 80;
      const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, opacity: 0.85 + Math.random() * 0.15 });
      mat.color.copy(horizonTint).lerp(new THREE.Color(0xffffff), elev / 0.4);   // 低处的云偏暖灰
      const s = new THREE.Sprite(mat);
      s.position.set(Math.cos(a) * r, Math.tan(elev) * r, Math.sin(a) * r);
      s.scale.set(width, width * 0.5, 1);
      scene.add(s);
      animated.push({ obj: s, angle: a, radius: r, speed: 0.003 + Math.random() * 0.004 });
    }
    const cirrusTex = T.cirrus();
    for (let i = 0; i < 5; i++) {
      const elev = THREE.MathUtils.degToRad(28 + Math.random() * 22);
      const a = Math.random() * Math.PI * 2, r = 180 + Math.random() * 40;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cirrusTex, fog: false, depthWrite: false, transparent: true, opacity: 0.55, rotation: Math.random() * 0.4 - 0.2 }));
      s.position.set(Math.cos(a) * r, Math.tan(elev) * r, Math.sin(a) * r);
      const width = 150 + Math.random() * 80;
      s.scale.set(width, width * 0.25, 1);
      scene.add(s);
      animated.push({ obj: s, angle: a, radius: r, speed: 0.002 + Math.random() * 0.002 });
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
    // 平面按真实尺寸铺贴图（只对 PBR 材质；Canvas 贴图自己带 repeat）
    const plane = (w, d, material) => {
      const geo = new THREE.PlaneGeometry(w, d);
      if (material.userData.tile) tileUV(geo, w, d, 0, material.userData.tile);
      return new THREE.Mesh(geo, material);
    };

    const ground = plane(400, 400, mats.dirt);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    shootables.push(ground);
    colliders.push(new THREE.Box3(new THREE.Vector3(-200, -1, -200), new THREE.Vector3(200, 0, 200)));

    const yard = plane(map.yard.w, map.yard.d, mats.asphalt);
    yard.rotation.x = -Math.PI / 2;
    yard.receiveShadow = true;
    scene.add(yard);
    shootables.push(yard);

    // 两块水泥浇筑区
    const padMat = pbr('concreteFloor', null);
    for (const { x, z, w, d } of map.pads) {
      let pad;
      if (padMat) pad = plane(w, d, padMat);
      else {
        pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.concreteDark.clone());
        pad.material.map = T.concrete(1, '#858279');
        pad.material.map.repeat.set(2, 1);
      }
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.004, z);
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
    map.puddles.forEach((p) => puddle(p.x, p.z, p.w, p.d, p.rot));
    const stain = (x, z, r) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mats.stain);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.007, z);
      scene.add(m);
    };
    map.stains.forEach((p) => stain(p.x, p.z, p.r));

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
    map.fences.forEach((f) => fenceSide(f.len, f.x, f.z, f.alongX));

    // ---------- 地图物体：每种 type 一个造型，位置来自地图文件 ----------
    function material(name) {
      if (!mats[name]) throw new Error(`地图里用了不存在的材质：${name}`);
      return mats[name];
    }

    const builders = {
      // 通用方块。pos 的 y 指底部高度；collide、shoot 默认都是 true
      box(o) {
        const [w, h, d] = o.size, [x, y, z] = o.pos;
        addBox(w, h, d, x, y, z, material(o.material), { collide: o.collide !== false, shoot: o.shoot !== false });
      },
      // 只有碰撞、看不见的盒子
      blocker(o) {
        const [w, h, d] = o.size, [x, y, z] = o.pos;
        addBlocker(w, h, d, x, y, z);
      },
      // 只显示的模型（地图文件 models 里的名字），rot 绕竖轴转（弧度）。碰撞另外用 proxy / blocker 写
      model(o) {
        if (loaded.models[o.model]) placeModel(o.model, o.x, o.y || 0, o.z, o.rot || 0);
      },
      // 配合 model 的碰撞：看不见、挡人挡子弹的方块（shoot: false 时只挡人，比如栏杆）。
      // 写了 model 的，那个模型没加载上就把方块用 material 画出来，不会出现看不见的墙
      proxy(o) {
        const [w, h, d] = o.size, [x, y, z] = o.pos;
        if (o.model && !loaded.models[o.model]) {
          if (o.material) addBox(w, h, d, x, y, z, material(o.material), { shoot: o.shoot !== false });
          else if (o.shoot === false) addBlocker(w, h, d, x, y, z);
          return;
        }
        if (o.shoot === false) return addBlocker(w, h, d, x, y, z);
        addProxy(w, h, d, x, y, z);
      },
      container(o) { addContainer(o.x, o.y || 0, o.z, o.alongZ, o.color, o.label); },
      // 水泥隔离墩：有模型用模型（新泽西式断面、顶上两个吊环），碰撞仍是 2.4 × 0.85 × 0.5 的方块
      jersey(o) {
        const w = o.alongX ? 2.4 : 0.5, d = o.alongX ? 0.5 : 2.4;
        if (!loaded.models.jersey) return addBox(w, 0.85, d, o.x, 0, o.z, mats.concreteDark);
        const flip = (Math.round(o.x * 3 + o.z * 5) & 1) ? Math.PI : 0;
        placeModel('jersey', o.x, 0, o.z, (o.alongX ? 0 : Math.PI / 2) + flip);
        addProxy(w, 0.85, d, o.x, 0, o.z);
      },
      // 沙袋墙：高 0.9、厚 0.6，len 是长度（米，模型有 3 和 4 两种），alongZ 时长边沿 z；y 是底部高度
      sandbags(o) {
        const y = o.y || 0;
        const w = o.alongZ ? 0.6 : o.len, d = o.alongZ ? o.len : 0.6;
        const part = loaded.models.sandbags && loaded.models.sandbags.getObjectByName(`len_${o.len}`);
        if (!part) return addBox(w, 0.9, d, o.x, y, o.z, mats.sandbag);
        // 套一层组再摆：压缩过的 glb 靠节点自己的位移和缩放还原顶点坐标，不能直接改节点的 position
        const obj = new THREE.Group();
        obj.userData.prop = 'sandbags';
        obj.add(part.clone());
        obj.position.set(o.x, y, o.z);
        obj.rotation.y = (o.alongZ ? Math.PI / 2 : 0) + ((Math.round(o.x + o.z) & 1) ? Math.PI : 0);
        obj.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
        scene.add(obj);
        addProxy(w, 0.9, d, o.x, y, o.z);
      },
      barrel(o) { addCylinder(0.3, 0.9, o.x, 0, o.z, material(o.material)); },
      // 倒着的油桶（只做视觉，碰撞用方块）
      barrelLying(o) {
        const lying = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18), mats.barrelRed);
        lying.rotation.z = Math.PI / 2; lying.rotation.y = 0.4;
        lying.position.set(o.x, 0.3, o.z);
        lying.castShadow = lying.receiveShadow = true;
        scene.add(lying);
        shootables.push(lying);
        addBlocker(0.9, 0.6, 0.9, o.x, 0, o.z);
      },
      // 灯柱：灯臂朝地图中心伸
      lampPost(o) {
        addCylinder(0.08, 7, o.x, 0, o.z, mats.metalDark);
        const armDir = o.x < 0 ? 1 : -1;
        addBox(1.2, 0.08, 0.08, o.x + armDir * 0.6, 6.8, o.z, mats.metalDark, { collide: false });
        const lamp = addBox(0.5, 0.18, 0.3, o.x + armDir * 1.1, 6.7, o.z,
          new THREE.MeshStandardMaterial({ color: 0x333, emissive: 0xfff2cc, emissiveIntensity: 0.6 }), { collide: false });
        lamp.castShadow = false;
      },
      // 轮胎堆
      tires(o) {
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 10, 20), mats.rubber);
          t.rotation.x = Math.PI / 2;
          t.position.set(o.x, 0.13 + i * 0.26, o.z);
          t.castShadow = t.receiveShadow = true;
          scene.add(t);
          shootables.push(t);
        }
        addBlocker(0.95, 0.8, 0.95, o.x, 0, o.z);
      },
      // 电缆盘
      cableReel(o) {
        addCylinder(0.75, 0.15, o.x, 0, o.z, mats.wood);
        addCylinder(0.3, 0.8, o.x, 0.15, o.z, mats.wood);
        addCylinder(0.75, 0.15, o.x, 0.95, o.z, mats.wood, { collide: false });
        addBlocker(1.5, 1.1, 1.5, o.x, 0, o.z);
      },
      // 木托盘堆 + 上面的木箱
      palletStack(o) {
        for (let i = 0; i < 5; i++) addBox(1.2, 0.14, 1.0, o.x, i * 0.14, o.z, mats.wood, { collide: false });
        addBox(0.9, 0.9, 0.8, o.x, 0.7, o.z, mats.wood, { collide: false });
        addBlocker(1.2, 1.6, 1.0, o.x, 0, o.z);
      },
      // 卡车（见 truck.js）：车头朝北。碰撞用两堵空气墙：车身一堵、货斗上的货物一堵
      truck(o) {
        const truck = Game.Truck.build(o.color);
        truck.group.position.set(o.x, 0, o.z);
        scene.add(truck.group);
        truck.group.updateMatrixWorld(true);
        shootables.push(...truck.meshes);
        addBlocker(2.5, 3.3, 7.7, o.x, 0, o.z);
        addBlocker(2.4, 3.0, 2.0, o.x, 2.0, o.z + 2.1);
      },
    };

    for (const o of map.objects) {
      if (!builders[o.type]) throw new Error(`地图里用了不存在的物体类型：${o.type}`);
      builders[o.type](o);
    }

    // 碎石、水泥碎块：不碰撞，只增加地面细节。不规则的多面体压扁、贴水泥材质（方块在太阳下发白，像"白色小方块"，#50）
    const debrisMat = pbr('concrete', new THREE.MeshStandardMaterial({ color: 0x5b5955, roughness: 1 }), { color: 0x6e6b66 });
    for (let i = 0; i < map.debris; i++) {
      const s = 0.06 + Math.random() * 0.18;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), debrisMat);
      m.scale.set(1, 0.35 + Math.random() * 0.3, 0.6 + Math.random() * 0.6);
      m.position.set((Math.random() - 0.5) * (map.yard.w - 2), s * 0.12, (Math.random() - 0.5) * (map.yard.d - 2));
      m.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
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
    map.backdrop.buildings.forEach((b) => far(b.w, b.h, b.d, b.x, b.z, b.style));
    // 龙门吊
    for (const { x, z } of map.backdrop.cranes) {
      addBox(1.2, 26, 1.2, x - 10, 0, z, mats.metalDark, { collide: false, shoot: false });
      addBox(1.2, 26, 1.2, x + 10, 0, z, mats.metalDark, { collide: false, shoot: false });
      addBox(26, 1.6, 1.6, x, 25, z, mats.metalDark, { collide: false, shoot: false });
    }
    // 水塔
    for (const { x, z } of map.backdrop.waterTowers) {
      addCylinder(0.6, 18, x, 0, z, mats.metalDark, { collide: false, shoot: false });
      addCylinder(4, 5, x, 18, z, mats.metal, { collide: false, shoot: false });
    }

    // ---------- 环境光 HDRI：给地图里的材质加环境照明和反射（#50） ----------
    // 只给这时场景里已有的地图物体加；人物、手里的枪不受影响。强度在 config.js 的 graphics.mapEnvIntensity
    if (loaded.env) {
      scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          if (m.isMeshStandardMaterial && !m.envMap) {
            m.envMap = loaded.env;
            m.envMapIntensity = Game.Config.graphics.mapEnvIntensity;
          }
        }
      });
    }

    // ---------- 空气中的尘埃 ----------
    const dustCount = 400;
    const dustW = map.yard.w - 1, dustD = map.yard.d - 1;   // 尘埃飘在场地范围内
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * dustW;
      dustPos[i * 3 + 1] = 0.2 + Math.random() * 5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * dustD;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: T.softDisc('rgba(255,245,225,0.9)', 'rgba(255,245,225,0)'),
      size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(dust);

    // ---------- 每帧更新：尘埃飘动、云移动 ----------
    let time = 0;
    function update(dt) {
      time += dt;
      const p = dust.geometry.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        p[i * 3] += Math.sin(time * 0.5 + i) * 0.15 * dt + 0.08 * dt;
        p[i * 3 + 1] += Math.cos(time * 0.7 + i * 0.3) * 0.1 * dt;
        if (p[i * 3] > dustW / 2) p[i * 3] = -dustW / 2;
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
      mapName: map.name || Game.Config.map,   // 界面上显示的地图名
      spawns: map.spawns, navPoints: map.navPoints, rangeSpawn: map.rangeSpawn,
      targetLayout: map.targets, bounds: map.bounds,
      spawn: new THREE.Vector3(map.spawns[0].x, 0, map.spawns[0].z),
    };
  }

  return { build, loadMap };
})();
