// ============================================================
// 枪模：用基础几何体拼出一把 AK（参考 refer/ak.png）
//
// 坐标约定（枪自己的局部坐标）：-z 是枪口方向，+z 朝射手，+y 向上，+x 是枪的右侧。
// 单位是米，尺寸大致按真枪（全长约 0.9 米）。weapon.js 负责把它缩放、摆到画面右下角。
//
// 为了配合集装箱堆场的风格，枪做成"用旧了"的样子：
// 烤蓝钢件有磨损和划痕、木件颜色深、带木纹。贴图全部用 Canvas 画出来，不依赖图片。
// ============================================================
Game.GunModel = (function () {

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- 贴图 ----------

  // 木纹：深红棕底色 + 顺着 u 方向的波浪纹理，模仿 AK 的层压木
  function woodTexture(repeatX = 1, repeatY = 1) {
    const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#4a2410'); base.addColorStop(0.5, '#5e2f15'); base.addColorStop(1, '#3f1e0b');
    g.fillStyle = base; g.fillRect(0, 0, w, h);

    // 一条条木纹：横向的细线，带一点上下起伏
    for (let i = 0; i < 130; i++) {
      const y0 = Math.random() * h, amp = rnd(2, 9), freq = rnd(0.004, 0.012), phase = rnd(0, 6.28);
      const dark = Math.random() < 0.65;
      g.strokeStyle = dark ? `rgba(28,10,3,${rnd(0.2, 0.55)})` : `rgba(190,105,50,${rnd(0.1, 0.28)})`;
      g.lineWidth = rnd(0.6, 2.2);
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    // 大块的明暗变化：木头颜色不均匀
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = rnd(40, 140);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.5;
      grad.addColorStop(0, dark ? `rgba(20,8,2,${rnd(0.1, 0.35)})` : `rgba(220,130,60,${rnd(0.06, 0.16)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 细小的斑点和磨损
    for (let i = 0; i < 1500; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    return tex;
  }

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

  // ---------- 组装 ----------
  function buildAK() {
    const woodTex = woodTexture();
    const woodTexM = woodTexture(5, 5);  // 挤出几何体的 UV 单位是米，需要更密的重复
    const steelTex = steelTexture();

    const steel = new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.42, metalness: 0.6, envMapIntensity: 0.9 });
    const steelDull = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x9a9a9a, roughness: 0.6, metalness: 0.5, envMapIntensity: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.8, metalness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.5, metalness: 0, envMapIntensity: 0.35 });
    const woodM = new THREE.MeshStandardMaterial({ map: woodTexM, roughness: 0.5, metalness: 0, envMapIntensity: 0.35 });

    const gun = new THREE.Group();
    const add = (m) => { gun.add(m); return m; };

    // ---- 机匣（receiver）和机匣盖 ----
    add(box(0.034, 0.052, 0.27, steel, 0, 0.006, 0.005));
    add(box(0.032, 0.014, 0.25, steel, 0, 0.038, 0.005));
    add(tube(0.0155, -0.12, 0.13, steel, 0, 0.038, 16));              // 盖子的圆顶
    for (const z of [-0.06, -0.02, 0.02]) add(box(0.034, 0.003, 0.004, steelDull, 0, 0.052, z));  // 盖子上的加强筋
    add(box(0.036, 0.006, 0.27, black, 0, -0.023, 0.005));             // 机匣底边

    // 机匣前端：照门座 + 照门（表尺）
    add(box(0.03, 0.062, 0.05, steel, 0, 0.0, -0.145));
    add(box(0.024, 0.018, 0.012, steel, 0, 0.055, -0.128));
    const leaf = add(box(0.022, 0.003, 0.055, steelDull, 0, 0.066, -0.15));
    leaf.rotation.x = -0.22;
    add(box(0.024, 0.006, 0.008, steel, 0, 0.07, -0.135));             // 表尺滑块
    add(box(0.016, 0.006, 0.003, black, 0, 0.078, -0.128));            // 缺口照门片

    // 右侧：保险/快慢机拨杆、拉机柄（开枪时会往后跳）
    const lever = add(box(0.004, 0.009, 0.085, steelDull, 0.019, 0.004, 0.02));
    lever.rotation.x = -0.12;
    add(box(0.003, 0.018, 0.012, steelDull, 0.019, 0.014, 0.06));       // 拨杆的转轴座
    const bolt = new THREE.Group();
    bolt.add(box(0.012, 0.012, 0.02, steel, 0.021, 0.024, 0));
    bolt.add(box(0.016, 0.009, 0.011, black, 0.03, 0.024, 0));
    bolt.position.z = -0.035;
    add(bolt);

    // 弹匣卡笋 + 扳机护圈 + 扳机
    add(box(0.012, 0.012, 0.016, steel, 0, -0.032, -0.008));
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0025, 8, 20, Math.PI), steel);
    guard.rotation.set(0, Math.PI / 2, Math.PI);   // 先转成下半圈，再立到 z-y 平面里
    guard.position.set(0, -0.024, 0.038);
    add(guard);
    add(box(0.004, 0.004, 0.06, steel, 0, -0.026, 0.038));             // 护圈顶边
    const trigger = add(box(0.005, 0.03, 0.005, black, 0, -0.036, 0.028));
    trigger.rotation.x = 0.35;

    // ---- 弹匣：香蕉形，往前弯 ----
    const mag = profile([
      [-0.092, -0.01],
      [-0.152, -0.075, -0.165, -0.165],   // 前缘，向前鼓
      [-0.118, -0.192],
      [-0.095, -0.088, -0.022, -0.01],    // 后缘，同向弯
    ], 0.027, steel, 0.0025, true);
    mag.position.y = -0.005;
    add(mag);
    add(box(0.029, 0.01, 0.075, black, 0, -0.025, -0.06));             // 弹匣口处的加强环

    // ---- 握把：木，向后倾斜 ----
    add(profile([[0.08, -0.018], [0.116, -0.018], [0.152, -0.112], [0.12, -0.118]], 0.03, woodM, 0.004));
    add(box(0.032, 0.004, 0.044, steel, 0, -0.02, 0.1));               // 握把与机匣交接处的垫片

    // ---- 枪托：木，前宽后窄略向下倾，尾部钢制托底板 ----
    add(profile([
      [0.135, 0.034], [0.40, 0.012], [0.425, -0.005], [0.425, -0.098], [0.40, -0.103], [0.2, -0.032], [0.135, -0.018],
    ], 0.036, woodM, 0.004));
    add(box(0.04, 0.112, 0.008, steel, 0, -0.05, 0.428));              // 托底板
    add(box(0.04, 0.056, 0.012, steel, 0, 0.004, 0.138));              // 枪托和机匣连接的钢箍

    // ---- 枪管、导气管、护木 ----
    add(tube(0.0085, -0.13, -0.50, steel, 0, 0.012, 12));              // 枪管
    add(tube(0.002, -0.17, -0.48, steelDull, 0, -0.003, 6));           // 通条（枪管下面那根细杆）
    add(tube(0.0075, -0.16, -0.345, steel, 0, 0.047, 12));             // 导气管
    add(box(0.036, 0.058, 0.03, steel, 0, 0.006, -0.145));             // 前节套（护木后端的金属箍）
    add(profile([[-0.165, 0.031], [-0.31, 0.031], [-0.31, -0.016], [-0.165, -0.016]], 0.037, woodM, 0.004));  // 下护木
    add(box(0.034, 0.006, 0.145, black, 0, 0.008, -0.2375));           // 下护木的指槽阴影（薄薄一条）
    add(profile([[-0.17, 0.034], [-0.30, 0.034], [-0.30, 0.06], [-0.17, 0.06]], 0.028, woodM, 0.004));          // 上护木
    add(box(0.04, 0.08, 0.02, steel, 0, 0.018, -0.322));               // 护木前端的金属箍
    add(box(0.024, 0.062, 0.03, steel, 0, 0.026, -0.352));             // 导气箍
    add(box(0.012, 0.012, 0.012, steel, 0, 0.062, -0.352));

    // ---- 准星座、准星护翼、枪口 ----
    add(box(0.022, 0.05, 0.028, steel, 0, 0.018, -0.455));
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 14, Math.PI), steel);  // 护翼：半圆
    hood.position.set(0, 0.052, -0.455);
    add(hood);
    add(box(0.028, 0.012, 0.012, steel, 0, 0.046, -0.455));
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.016, 6), black));  // 准星柱
    post.position.set(0, 0.06, -0.455);
    add(tube(0.0115, -0.49, -0.525, steel, 0, 0.012, 14));             // 枪口帽
    add(tube(0.0055, -0.5245, -0.5265, black, 0, 0.012, 10));          // 枪口的黑洞

    // 枪口位置（给枪口火焰用）
    const muzzle = new THREE.Vector3(0, 0.012, -0.53);

    return { group: gun, muzzle, bolt, mag, boltHome: bolt.position.clone(), magHome: mag.position.clone() };
  }

  return { buildAK, environment };
})();
