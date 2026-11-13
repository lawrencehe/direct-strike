// ============================================================
// 枪模：AK、M4、SG 手枪和第一人称手臂加载 glb 模型；默认手枪、手雷还是用基础几何体拼的（之后逐个换成 glb）
//
// 坐标约定（枪自己的局部坐标）：-z 是枪口方向，+z 朝射手，+y 向上，+x 是枪的右侧。
// 单位是米，尺寸大致按真枪（全长约 0.9 米）。weapon.js 负责把它缩放、摆到画面右下角。
//
// 为了配合集装箱堆场的风格，枪做成"用旧了"的样子：
// 烤蓝钢件有磨损和划痕。几何体拼的部件贴图用 Canvas 画，不依赖图片。
// ============================================================
Game.GunModel = (function () {

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- 贴图 ----------

  // 烤蓝钢：近黑的灰底 + 磨损亮斑 + 划痕
  function steelTexture() {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = '#3d4147'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 24; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = rnd(12, 60);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() < 0.45;
      grad.addColorStop(0, light ? `rgba(150,155,160,${rnd(0.08, 0.22)})` : `rgba(0,0,0,${rnd(0.1, 0.3)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 60; i++) {       // 划痕
      const x = Math.random() * s, y = Math.random() * s, a = rnd(-0.4, 0.4), len = rnd(6, 40);
      g.strokeStyle = `rgba(190,195,200,${rnd(0.08, 0.3)})`; g.lineWidth = rnd(0.5, 1.2);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    for (let i = 0; i < 2500; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  // 一张极简的环境贴图（上亮下暗），让金属件有反光，否则金属在 three.js 里是死黑的
  function environment() {
    const s = 32;
    const face = (top, bottom) => {
      const c = canvas(s), g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, top); grad.addColorStop(0.5, '#9aa4ae'); grad.addColorStop(1, bottom);
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
      return c;
    };
    const flat = (color) => {
      const c = canvas(s), g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, s, s);
      return c;
    };
    const side = () => face('#d8e6f2', '#3b3833');
    // 顺序：+x -x +y -y +z -z
    const tex = new THREE.CubeTexture([side(), side(), flat('#e8f0f8'), flat('#2e2b27'), side(), side()]);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------- 几何体工具 ----------

  // 用 (z, y) 轮廓点画一个侧面形状，再沿 x 方向挤出 width 厚度。用来做枪托、握把、弹匣这些"侧面看有形状"的件
  function profile(points, width, mat, bevel = 0.003, curved = false) {
    const shape = new THREE.Shape();
    if (curved) {
      // points: [[z, y], [cz, cy, z, y], ...]  长度为 4 的项是二次贝塞尔曲线（控制点 + 终点）
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        p.length === 4 ? shape.quadraticCurveTo(p[0], p[1], p[2], p[3]) : shape.lineTo(p[0], p[1]);
      }
    } else {
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
    geo.translate(0, 0, -(width - bevel * 2) / 2);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = -Math.PI / 2;   // 形状的 x 轴 → 世界 z 轴，挤出方向 → 世界 x 轴
    return m;
  }

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  // 沿 z 轴的圆柱，z0 → z1
  function tube(r, z0, z1, mat, x, y, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), seg), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, (z0 + z1) / 2);
    return m;
  }

  // ---------- glb 枪模（AK、M4、SG 手枪……）：Blender 加工的 glb 模型 ----------
  // 由 assets-src/models/gun/*.py 生成，坐标约定和上面一样。零件拆成几个网格：
  // body 枪身、mag 弹匣（原点在弹匣顶部，换弹时绕这里转）、bolt 拉机柄 / 枪机或 slide 套筒（开枪时往后跳），
  // 另有空节点 muzzle 标出枪口。
  // 用哪个文件看 config.js 的 weapons.rifle.model / weapons.pistol.model（上次买的枪，#90），同一个文件只下载一次。
  // main.js 开局前等这两把加载完，别的枪进了游戏在后台下载。加载失败的错误显示在加载页或首页上。
  const gunAssets = {};   // 文件路径 → Promise<gltf.scene>
  function loadGun(path) {
    if (!path) return Promise.resolve(null);   // 代码拼的枪，不用下载
    if (!gunAssets[path]) {
      gunAssets[path] = Game.Assets.ensure(path).then(() => new Promise((resolve, reject) => {
        new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(path,
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => { delete gunAssets[path]; reject(new Error(`枪模加载失败（${path}）：` + (err.message || err))); });
      }));
      gunAssets[path].then((scene) => { loaded[path] = scene; }, () => {});
    }
    return gunAssets[path];
  }
  const loaded = {};
  const isGunLoaded = (path) => !path || !!loaded[path];
  const loadedGun = (path) => loaded[path] || null;   // NPC 用：已经下载好的枪模场景，没有就 null

  // slot：'rifle' | 'pistol'，按 config 里当前选的枪造一把。返回 { group, muzzle, bolt, mag, boltHome, magHome }
  function buildGun(slot) {
    const path = Game.Config.weapons[slot].model;
    if (!path) return buildPistol();
    const gun = loaded[path].clone(true);   // 网格、材质、贴图都共用，只复制节点
    const bolt = gun.getObjectByName('bolt') || gun.getObjectByName('slide');
    const mag = gun.getObjectByName('mag');
    const muzzle = gun.getObjectByName('muzzle').position.clone();
    return { group: gun, muzzle, bolt, mag, boltHome: bolt.position.clone(), magHome: mag.position.clone() };
  }

  // 握把片的网纹（参考 refer/handgun.jpg）：黑底 + 细密的菱形格
  function checkerTexture() {
    const s = 128, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = '#16171a'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,.95)'; g.lineWidth = 1.6;
    for (let i = -s; i < s * 2; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke();
      g.beginPath(); g.moveTo(i + s, 0); g.lineTo(i, s); g.stroke();
    }
    g.strokeStyle = 'rgba(150,155,165,.16)'; g.lineWidth = 0.8;
    for (let i = -s; i < s * 2; i += 8) {
      g.beginPath(); g.moveTo(i + 2, 0); g.lineTo(i + 2 + s, s); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(45, 45);        // 挤出几何体的 UV 单位是米
    tex.anisotropy = 8;
    return tex;
  }

  // 注意：枪模场景的灯光很亮（半球光 + 太阳 + 环境贴图），无贴图的非金属件亮度大约会被放大 10 倍，
  // 所以下面的颜色值看着都很暗。想要屏幕上的某个颜色，把它的线性值除以 10 再填。

  // ---------- 手枪：Beretta 92A1（参考 refer/handgun.jpg） ----------
  // 全长约 0.22 米。上面是带防滑纹的套筒，枪管从前端露出；下面是聚合物套筒座，枪口下方有导轨
  function buildPistol() {
    const steelTex = steelTexture();
    const slideMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x5d6065, roughness: 0.4, metalness: 0.55, envMapIntensity: 0.45 });
    const slideDark = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.2 });
    const barrelMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x55585c, roughness: 0.38, metalness: 0.65, envMapIntensity: 0.5 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.3 });
    const gripMat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8, metalness: 0.05, envMapIntensity: 0.35 });
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.35, metalness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc81a14, emissive: 0x500805, roughness: 0.4 });

    const gun = new THREE.Group();
    const add = (m) => { gun.add(m); return m; };

    // ---- 枪管：固定不动，套筒后坐时会露出更多 ----
    add(tube(0.0072, -0.138, -0.03, barrelMat, 0, 0.03, 16));
    add(tube(0.0042, -0.1385, -0.1375, slideDark, 0, 0.03, 12));   // 枪口的黑洞

    // ---- 套筒：单独一组，开枪时往后跳 ----
    const slide = new THREE.Group();
    const addS = (m) => { slide.add(m); return m; };
    // 后段侧面完整，前段顶部敞开（Beretta 的开放式套筒），能看到枪管
    addS(profile([[-0.126, 0.019], [-0.126, 0.039], [-0.112, 0.043], [-0.012, 0.043], [-0.006, 0.05], [0.083, 0.05], [0.09, 0.043], [0.09, 0.019]], 0.027, slideMat, 0.0018));
    addS(box(0.015, 0.009, 0.1, slideDark, 0, 0.0445, -0.06));     // 开放部的黑色内槽，枪管在里面
    addS(box(0.024, 0.007, 0.02, slideMat, 0, 0.043, -0.118));     // 前端的连接桥
    // 防滑纹：套筒后段两侧、由一组细条构成
    for (let i = 0; i < 11; i++) {
      addS(box(0.0284, 0.022, 0.0016, slideDark, 0, 0.033, 0.03 + i * 0.0048));
    }
    // 退壳口和抽壳钩
    addS(box(0.0012, 0.011, 0.034, slideDark, 0.0138, 0.042, -0.002));
    addS(box(0.0012, 0.011, 0.034, slideDark, -0.0138, 0.042, -0.002));
    // 红点（上膛指示）：图上这个小红点很显眼
    addS(box(0.0012, 0.003, 0.003, red, 0.0141, 0.044, 0.024));
    addS(box(0.0012, 0.003, 0.003, red, -0.0141, 0.044, 0.024));
    // 保险拨片：套筒后部两侧
    for (const sx of [1, -1]) addS(box(0.004, 0.009, 0.018, frameMat, sx * 0.0152, 0.04, 0.06));
    // 照门（后）、准星（前）
    addS(box(0.024, 0.006, 0.01, slideDark, 0, 0.0525, 0.078));
    for (const sx of [1, -1]) addS(box(0.0075, 0.0055, 0.008, slideDark, sx * 0.0078, 0.0575, 0.078));
    for (const sx of [1, -1]) addS(box(0.0012, 0.0012, 0.0012, new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }), sx * 0.0078, 0.0596, 0.0738));
    addS(box(0.004, 0.009, 0.014, slideDark, 0, 0.0475, -0.115));
    addS(box(0.0012, 0.0012, 0.0012, new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }), 0, 0.0515, -0.1084));
    add(slide);

    // ---- 套筒座：防尘盖（带导轨）、机匣部分 ----
    add(profile([[-0.122, 0.019], [-0.122, -0.004], [-0.05, -0.008], [-0.012, -0.014], [0.09, -0.014], [0.09, 0.019]], 0.0255, frameMat, 0.0018));
    for (const z of [-0.112, -0.098, -0.084]) add(box(0.0262, 0.0035, 0.0065, slideDark, 0, -0.0035, z));   // 导轨横槽
    for (const sx of [1, -1]) add(box(0.001, 0.0045, 0.052, slideDark, sx * 0.0128, 0.008, -0.088));        // 防尘盖侧面的长槽
    // 分解杆、空仓挂机柄（银色长条）、弹匣释放钮
    for (const sx of [1, -1]) add(tube(0.0052, -0.03, -0.0288, screwMat, sx * 0.0133, 0.006, 12)).rotation.set(0, 0, Math.PI / 2);
    add(profile([[-0.026, 0.0205], [0.052, 0.0185], [0.056, 0.012], [-0.022, 0.012]], 0.0012, screwMat, 0)).position.x = 0.0136;
    add(profile([[-0.026, 0.0205], [0.052, 0.0185], [0.056, 0.012], [-0.022, 0.012]], 0.0012, screwMat, 0)).position.x = -0.0136;
    for (const sx of [1, -1]) add(box(0.0035, 0.012, 0.012, slideDark, sx * 0.0138, -0.018, 0.043));

    // 扳机护圈（上窄下宽的圆角）和扳机
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0032, 8, 24, Math.PI), frameMat);
    guard.rotation.set(0, Math.PI / 2, Math.PI);
    guard.scale.set(1.08, 0.9, 1);
    guard.position.set(0, -0.012, 0.006);
    add(guard);
    const trigger = add(profile([[0.0, -0.013], [0.012, -0.013], [0.012, -0.024, 0.004, -0.037], [0.0, -0.037], [0.006, -0.024, 0.0, -0.013]], 0.005, slideDark, 0, true));
    trigger.position.z = 0.006;

    // ---- 握把：向后倾斜，前后缘带细槽 ----
    add(profile([[0.03, -0.012], [0.09, -0.012], [0.093, 0.006], [0.103, 0.006], [0.106, -0.006], [0.1, -0.024], [0.113, -0.118], [0.058, -0.127], [0.044, -0.05]], 0.0255, frameMat, 0.0022));
    // 握把片：比握把略厚，带网纹
    const panel = [[0.046, -0.022], [0.094, -0.022], [0.106, -0.112], [0.065, -0.118], [0.052, -0.052]];
    add(profile(panel, 0.0295, gripMat, 0.0012));
    // 握把螺丝
    for (const sx of [1, -1]) {
      for (const [z, y] of [[0.074, -0.036], [0.086, -0.1]]) {
        const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.0012, 12), screwMat));
        s.rotation.z = Math.PI / 2;
        s.position.set(sx * 0.0152, y, z);
      }
    }
    // 前缘的横向防滑细槽
    for (let i = 0; i < 7; i++) {
      add(box(0.024, 0.0013, 0.002, slideDark, 0, -0.056 - i * 0.0085, 0.0498 + i * 0.0014));
    }

    // 击锤：套筒后面露出一截
    const hammer = add(box(0.008, 0.02, 0.008, frameMat, 0, 0.034, 0.098));
    hammer.rotation.x = 0.35;

    // ---- 弹匣：平时只露出底板，换弹时整个抽出来 ----
    const mag = new THREE.Group();
    mag.add(box(0.03, 0.012, 0.06, frameMat, 0, -0.129, 0.087));
    mag.add(box(0.017, 0.09, 0.03, slideMat, 0, -0.085, 0.078));
    mag.children[0].rotation.x = -0.16;    // 底板垂直于握把的倾斜方向
    mag.children[1].rotation.x = -0.16;
    add(mag);

    const muzzle = new THREE.Vector3(0, 0.03, -0.145);
    return { group: gun, muzzle, bolt: slide, mag, boltHome: slide.position.clone(), magHome: mag.position.clone() };
  }

  // ---------- 投掷物 ----------
  // 菠萝雷的弹体（参考 refer/grenade.jpeg）：把一个球拉长成蛋形，再按经纬网格压出沟槽，形成一格一格的方块
  function pineappleGeometry() {
    const geo = new THREE.SphereGeometry(1, 56, 40);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const edge = (x) => { const t = THREE.MathUtils.clamp(x / 0.24, 0, 1); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const theta = Math.atan2(v.z, v.x);
      const phi = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
      const columns = edge(Math.abs(Math.sin(theta * 4)));     // 8 列
      const rows = edge(Math.abs(Math.sin(phi * 3.2 + 0.25)));  // 大约 5 排
      const polar = THREE.MathUtils.smoothstep(Math.sin(phi), 0.15, 0.4);   // 两头不压沟
      const bump = 1 - (1 - columns * rows) * polar;
      const r = 0.87 + 0.13 * bump;
      // 蛋形：上面（引信一头）收窄
      const taper = 1 - 0.2 * Math.max(0, v.y) * Math.max(0, v.y);
      pos.setXYZ(i, v.x * r * taper * 0.029, v.y * r * 0.038, v.z * r * taper * 0.029);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // 引信组件（所有投掷物共用）：钢制引信座、保险握片、拉环。
  // top 是弹体顶部的 y，bodyR 是握片贴着的弹体半径，lean 是握片的倾斜（弹体越鼓越斜）
  function addFuse(group, top, bodyR, lean) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.5 });
    const cyl = (r0, r1, h, y) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 16), steel);
      m.position.y = y;
      group.add(m);
      return m;
    };
    cyl(0.0085, 0.0095, 0.012, top + 0.006);
    cyl(0.011, 0.011, 0.01, top + 0.016);

    // 保险握片：从引信顶部弯下来，贴着弹体。被手攥着时引信不走，出手时弹开（飞出去的雷上就没有了）
    const spoon = new THREE.Group();
    spoon.name = 'spoon';
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0016, 0.022), steel);
    lever.position.set(0, top + 0.0225, 0.007);
    spoon.add(lever);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.056, 0.0016), steel);
    blade.position.set(0, top - 0.005, bodyR + 0.002);
    blade.rotation.x = -lean;
    spoon.add(blade);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0016, 0.012), steel);
    tip.position.set(0, top + 0.0225, 0.0218);
    spoon.add(tip);
    group.add(spoon);

    // 拉环 + 保险销：出手前才有，投掷时隐藏
    const pin = new THREE.Group();
    pin.name = 'pin';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0013, 8, 26), steel);
    ring.position.set(-0.024, top + 0.012, 0);
    pin.add(ring);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.028, 6), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-0.002, top + 0.015, 0);
    pin.add(bar);
    group.add(pin);
  }

  // 握住时手指绕着的半径（弹体半径 + 一点余量）
  const GRIP_RADIUS = { frag: 0.0305, flash: 0.0225, smoke: 0.0305 };

  // ---------- 第一人称的手和手臂（枪和投掷物共用） ----------
  // 模型 arm.glb（CC0）：一个蒙皮网格里有左右两条手臂，骨骼是 X_arm 上臂 → X_elbow 小臂 → X_wrist 手 → 五根手指各 4 节，
  // X 是 L / R。每把武器 clone 一份挂在枪的 group 下，用不到的那条手臂缩成一个点藏起来。
  //
  // 手的摆法是"握住一根竖直圆柱"（握持坐标系）：圆柱轴是 y，原点在握持中心，y 正方向是食指一侧；
  // 右手掌心贴在 +x 一侧（左手在 -x），四指从 -z 绕过去，拇指从 +z 压过来。
  // 每帧 solve()：手腕骨骼对齐到握持坐标系；小臂从"手腕不弯"的方向往 armDir 转，手腕最多弯 wristMaxBend 度，
  // 剩下的角度由手肘弯；上臂沿 armDir 伸出画面。小臂、上臂都只做最小摆动，不绕自身扭转。
  // 手指在第一次 solve 时逐节弯到贴住圆柱，之后不再变：手指是手腕的子骨骼，会跟着手走。
  let armAsset = null, armRest = null;
  function loadArms() {
    return Game.Assets.ensure(Game.Config.weapons.arms.model).then(() => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(Game.Config.weapons.arms.model,
        (gltf) => { armAsset = gltf.scene; armRest = measureArms(armAsset); resolve(); },
        undefined,
        (err) => reject(new Error('手臂模型加载失败：' + (err.message || err))));
    }));
  }

  const FINGERS = ['point', 'middle', 'ring', 'pink'];
  // 骨骼名形如 L_wrist_03、R_middle2_035
  function armBone(root, side, part) {
    let found = null;
    root.traverse((o) => { if (!found && o.isBone && o.name.startsWith(`${side}_${part}_`)) found = o; });
    return found;
  }

  // 由两个方向（第一个精确、第二个取垂直分量）建一个正交基，返回对应的旋转
  const _m4 = new THREE.Matrix4();
  function basisQuat(first, second) {
    const a = first.clone().normalize();
    const b = second.clone().addScaledVector(a, -second.dot(a)).normalize();
    const c = new THREE.Vector3().crossVectors(a, b);
    return new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(a, b, c));
  }

  // 量出静止姿势（模型自身坐标）下每条手臂的关键数据
  function measureArms(root) {
    root.updateMatrixWorld(true);
    const pos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const quat = (o) => { const q = new THREE.Quaternion(); o.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
    // 蒙皮的绑定姿势：骨骼摆成这样时网格不变形。场景里的默认姿势和它不一样（左手腕自带约 30° 扭转），
    // 所以"手腕 / 手肘没弯"的基准用绑定姿势，不用默认姿势
    let skeleton = null;
    root.traverse((o) => { if (!skeleton && o.isSkinnedMesh) skeleton = o.skeleton; });
    const bindQuat = (b) => {
      const q = new THREE.Quaternion();
      _m4.copy(skeleton.boneInverses[skeleton.bones.indexOf(b)]).invert().decompose(new THREE.Vector3(), q, new THREE.Vector3());
      return q;
    };
    const rest = {};
    for (const side of ['L', 'R']) {
      const S = armBone(root, side, 'arm'), E = armBone(root, side, 'elbow'), W = armBone(root, side, 'wrist');
      const sp = pos(S), ep = pos(E), wp = pos(W), mp = pos(armBone(root, side, 'middle1'));
      const f = mp.clone().sub(wp).normalize();                                                  // 手指方向
      const across = pos(armBone(root, side, 'point1')).sub(pos(armBone(root, side, 'pink1')));  // 小指 → 食指
      // 掌心法线：右手是 across × f，左手相反（手性不同）
      const n = new THREE.Vector3().crossVectors(f, across).multiplyScalar(side === 'R' ? -1 : 1).normalize();
      rest[side] = {
        handLen: mp.distanceTo(wp), foreLen: wp.distanceTo(ep), upperLen: ep.distanceTo(sp),
        // 握持点：手腕到中指根的 85% 处，也就是掌心靠近指根的位置
        anchor: wp.clone().lerp(mp, 0.85), wrist: wp, elbow: ep, shoulder: sp, n,
        qS: quat(S), qE: quat(E), qW: quat(W),
        // 绑定姿势下小臂 → 手、上臂 → 小臂的相对旋转；骨骼自身坐标里指向下一节的方向（小臂、上臂的长轴）
        bindEW: bindQuat(E).invert().multiply(bindQuat(W)), bindSE: bindQuat(S).invert().multiply(bindQuat(E)),
        foreAxis: W.position.clone().normalize(), upperAxis: E.position.clone().normalize(),
        hand: basisQuat(across, n),                       // 手的朝向：(食指方向, 掌心法线, ...)
      };
    }
    return rest;
  }

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _s = new THREE.Vector3(), _mw = new THREE.Matrix4();

  // 把骨骼摆到世界坐标的 pos / quat（缩放 k），换算成相对父骨骼的局部变换
  function setBoneWorld(bone, pos, quat, k) {
    _mw.compose(pos, quat, _s.setScalar(k));
    bone.matrix.copy(bone.parent.matrixWorld).invert().multiply(_mw);
    bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrixWorld(true);
  }

  // 一节手指绕世界轴 axis（过它自己的关节）转 θ
  function rotateBoneWorld(bone, q0, axis, theta) {
    bone.parent.getWorldQuaternion(_q2);
    _q.setFromAxisAngle(axis, theta);
    bone.quaternion.copy(_q2).invert().multiply(_q).multiply(_q2).multiply(q0);
    bone.updateMatrixWorld(true);
  }

  // 手指逐节弯：每节从 θ = -0.6 往大扫，子关节第一次进到圆柱（半径 r，过 origin、方向 axisDir）以内就停
  function curlChain(bones, axis, origin, axisDir, r) {
    const dist = (o) => {
      o.getWorldPosition(_v);
      _v.sub(origin);
      return _v.addScaledVector(axisDir, -_v.dot(axisDir)).length();
    };
    for (let i = 0; i < bones.length - 1; i++) {
      const b = bones[i], child = bones[i + 1], q0 = b.quaternion.clone();
      let best = 0, bestErr = Infinity, prev = null, hit = null;
      for (let t = -0.6; t <= 1.9; t += 0.02) {
        rotateBoneWorld(b, q0, axis, t);
        const d = dist(child);
        if (prev !== null && prev > r && d <= r) { hit = t - 0.02 * (r - d) / (prev - d); break; }
        if (Math.abs(d - r) < bestErr) { bestErr = Math.abs(d - r); best = t; }
        prev = d;
      }
      rotateBoneWorld(b, q0, axis, hit !== null ? hit : best);
    }
  }

  // 给 parent 挂一套手臂。返回的 hand() 加一只手、拿到它的握持坐标系（Object3D，可以移动，比如换弹时左手去抓弹匣）；
  // solve() 让手臂跟上，weapon.js 每帧对当前武器调一次
  function buildArms(parent) {
    const cfg = Game.Config.weapons.arms;
    const model = THREE.SkeletonUtils.clone(armAsset);
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });   // 包围球是静止姿势的，摆过之后不准
    const scale = cfg.handLength / armRest.R.handLen;
    model.scale.setScalar(scale);
    parent.add(model);
    const hands = {};

    function hand(side, { R, pos, quat, armDir }) {
      const target = new THREE.Object3D();
      target.position.copy(pos);
      if (quat) target.quaternion.copy(quat);
      parent.add(target);
      const b = (part) => armBone(model, side, part);
      hands[side] = {
        target, R, armDir: armDir.clone().normalize(), curled: false,
        S: b('arm'), E: b('elbow'), W: b('wrist'),
        fingers: FINGERS.map((f) => [1, 2, 3, 4].map((i) => b(f + i))),
        thumb: [1, 2, 3, 4].map((i) => b('thumb' + i)),
      };
      return target;
    }

    const tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), rel = new THREE.Quaternion();
    const anchor = new THREE.Vector3(), wrist = new THREE.Vector3(), elbow = new THREE.Vector3(), shoulder = new THREE.Vector3();
    const dir = new THREE.Vector3(), back = new THREE.Vector3();
    const fore = new THREE.Vector3(), swing = new THREE.Quaternion();
    const qS = new THREE.Quaternion(), qE = new THREE.Quaternion(), qW = new THREE.Quaternion();
    let hidden = false;

    function solve() {
      if (!hidden) {
        // 用不到的手臂缩成一个点
        for (const side of ['L', 'R']) if (!hands[side]) armBone(model, side, 'arm').scale.setScalar(1e-4);
        hidden = true;
      }
      parent.updateWorldMatrix(true, true);
      parent.getWorldQuaternion(pq);
      const k = parent.getWorldScale(_s).x * scale;
      for (const side of ['L', 'R']) {
        const h = hands[side];
        if (!h) continue;
        const rest = armRest[side], right = side === 'R';
        // 手：握持坐标系里食指方向 = +y，掌心法线 = 朝向圆柱轴（右手 -x、左手 +x）
        h.target.getWorldQuaternion(tq);
        const handTarget = basisQuat(_v.set(0, 1, 0), _v2.set(right ? -1 : 1, 0, 0));
        rel.copy(tq).multiply(handTarget).multiply(_q.copy(rest.hand).invert());   // 模型坐标 → 世界的旋转
        h.target.localToWorld(anchor.set((right ? 1 : -1) * (h.R + cfg.palmGap), 0, 0));
        wrist.copy(rest.wrist).sub(rest.anchor).multiplyScalar(k).applyQuaternion(rel).add(anchor);
        // 小臂：手腕相对绑定姿势最多弯 wristMaxBend 度，多出来的角度交给手肘。
        // 先算"手腕不弯"时小臂该往哪伸（back，手腕 → 手肘），再从它往 armDir 转，转到手腕弯够上限为止。
        // 以前小臂直接沿 armDir，握持姿势和 armDir 差 50° 多，全压在手腕上，蒙皮挤瘪、还带扭转。
        dir.copy(h.armDir).applyQuaternion(pq);
        qW.copy(rel).multiply(rest.qW);
        qE.copy(qW).multiply(_q.copy(rest.bindEW).invert());          // 手腕不弯时小臂的朝向
        fore.copy(rest.foreAxis).applyQuaternion(qE);                  // 那时小臂的方向（手肘 → 手腕）
        back.copy(fore).negate();
        const off = back.angleTo(dir), maxBend = THREE.MathUtils.degToRad(cfg.wristMaxBend);
        if (off > maxBend) back.applyQuaternion(_q.identity().slerp(swing.setFromUnitVectors(back, dir), maxBend / off));
        else back.copy(dir);
        // 小臂 = 不弯的朝向再加一个最小摆动（不绕自身转）：手腕只有弯折、没有扭转
        qE.premultiply(swing.setFromUnitVectors(fore, _v.copy(back).negate()));
        elbow.copy(wrist).addScaledVector(back, rest.foreLen * k);
        // 上臂：同理从"手肘不弯"摆到沿 armDir 伸出画面
        qS.copy(qE).multiply(_q.copy(rest.bindSE).invert());
        qS.premultiply(swing.setFromUnitVectors(_v.copy(rest.upperAxis).applyQuaternion(qS), _v2.copy(dir).negate()));
        shoulder.copy(elbow).addScaledVector(dir, rest.upperLen * k);
        setBoneWorld(h.S, shoulder, qS, k);
        setBoneWorld(h.E, elbow, qE, k);
        setBoneWorld(h.W, wrist, qW, k);

        if (!h.curled) {
          // 四指绕圆柱轴往远侧（-z）卷，拇指反方向
          h.curled = true;
          const origin = h.target.getWorldPosition(new THREE.Vector3());
          const axisDir = new THREE.Vector3(0, 1, 0).applyQuaternion(tq);
          const r = (h.R + cfg.fingerRadius) * parent.getWorldScale(_s).x;
          const fingerAxis = axisDir.clone().multiplyScalar(right ? 1 : -1);
          for (const chain of h.fingers) curlChain(chain, fingerAxis, origin, axisDir, r);
          curlChain(h.thumb, fingerAxis.clone().negate(), origin, axisDir, r);
        }
      }
    }

    return { hand, solve };
  }

  const grenadeCache = {};

  // kind: 'frag' 菠萝雷 | 'flash' 闪光弹（灰色、带透气孔）| 'smoke' 烟雾弹（橄榄绿罐、带色环）
  function buildGrenade(kind) {
    if (grenadeCache[kind]) {
      return { group: grenadeCache[kind].clone(true) };
    }
    const g = new THREE.Group();
    if (kind === 'frag') {
      const olive = new THREE.MeshStandardMaterial({ color: 0x1c1d0f, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.25 });
      g.add(new THREE.Mesh(pineappleGeometry(), olive));
      // 脖子：橄榄绿的短颈 + 黄色环带 + 一圈红（图上的识别带）
      const neck = (r0, r1, h, y, mat) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 20), mat);
        m.position.y = y;
        g.add(m);
      };
      neck(0.0125, 0.0165, 0.007, 0.0375, olive);
      neck(0.0118, 0.0125, 0.008, 0.0445, new THREE.MeshStandardMaterial({ color: 0x423605, roughness: 0.65, envMapIntensity: 0.25 }));
      neck(0.0118, 0.0118, 0.0014, 0.049, new THREE.MeshStandardMaterial({ color: 0x2a0501, roughness: 0.65, envMapIntensity: 0.25 }));
      addFuse(g, 0.05, 0.0235, 0.2);
    } else if (kind === 'flash') {
      const body = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.5, metalness: 0.25, envMapIntensity: 0.4 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.8, envMapIntensity: 0.2 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.082, 24), body));
      // 透气孔：上下两圈
      for (const y of [-0.022, 0.018]) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.001, 8), dark);
          h.rotation.z = Math.PI / 2;
          h.rotation.y = -a;
          h.position.set(Math.cos(a) * 0.0206, y, Math.sin(a) * 0.0206);
          g.add(h);
        }
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0208, 0.0208, 0.006, 24), new THREE.MeshStandardMaterial({ color: 0x0a0f20, roughness: 0.6, envMapIntensity: 0.25 }));
      band.position.y = -0.002;
      g.add(band);
      addFuse(g, 0.041, 0.0215, 0.02);
    } else {
      const body = new THREE.MeshStandardMaterial({ color: 0x121508, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.25 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.096, 24), body));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0288, 0.0288, 0.014, 24), new THREE.MeshStandardMaterial({ color: 0x3c3c37, roughness: 0.75, envMapIntensity: 0.25 }));
      band.position.y = 0.022;
      g.add(band);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.0285, 0.005, 24), body);
      lip.position.y = 0.0505;
      g.add(lip);
      addFuse(g, 0.053, 0.0295, 0.02);
    }
    grenadeCache[kind] = g;
    return { group: g.clone(true) };
  }

  return { loadGun, isGunLoaded, loadedGun, buildGun, loadArms, buildPistol, buildGrenade, buildArms, GRIP_RADIUS, environment };
})();
