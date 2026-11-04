// ============================================================
// 程序生成的贴图
// 所有贴图都用 Canvas 2D 画出来，不依赖任何图片文件。
// 每个函数返回一张 THREE.Texture；需要凹凸感的地方同时生成一张灰度 bump 图。
// 想换风格（比如把工业区换成沙漠），改这里的颜色和图案就行。
// ============================================================
Game.Textures = (function () {

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  function toTexture(c, repeatX = 1, repeatY = 1, srgb = true) {
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    return tex;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  // 随机撒斑点：让表面不那么"塑料"
  function speckle(g, w, h, count, alpha, size = 2) {
    for (let i = 0; i < count; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  }

  // 大块的明暗云团：模拟脏污、风化
  function blotches(g, w, h, count, color, alphaMax, rMin, rMax) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = rnd(rMin, rMax);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${color},${Math.random() * alphaMax})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // 裂缝：一条随机折线
  function crack(g, w, h, len, color) {
    let x = Math.random() * w, y = Math.random() * h;
    let a = Math.random() * Math.PI * 2;
    g.strokeStyle = color; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < len; i++) {
      a += rnd(-0.6, 0.6);
      x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // ---------- 地面 ----------

  // 沥青 / 旧水泥场地：深灰、油污、裂缝
  function asphalt(repeat) {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = '#4e4f4f'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, 40, '20,20,22', 0.35, 30, 120);
    blotches(g, s, s, 30, '120,118,110', 0.2, 20, 90);
    speckle(g, s, s, 9000, 0.22, 2);
    for (let i = 0; i < 8; i++) crack(g, s, s, 40, 'rgba(20,20,20,0.6)');
    return toTexture(c, repeat, repeat);
  }

  // 场外的泥土地
  function dirt(repeat) {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = '#6e6250'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, 60, '50,42,32', 0.4, 20, 100);
    blotches(g, s, s, 40, '140,128,105', 0.25, 20, 80);
    speckle(g, s, s, 12000, 0.25, 2);
    return toTexture(c, repeat, repeat);
  }

  // 水泥板：浅灰 + 板缝 + 污渍
  function concrete(repeat = 1, base = '#9a9892') {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    blotches(g, s, s, 40, '60,58,55', 0.3, 20, 120);
    blotches(g, s, s, 20, '200,196,185', 0.2, 20, 80);
    speckle(g, s, s, 8000, 0.18, 2);
    for (let i = 0; i < 5; i++) crack(g, s, s, 30, 'rgba(40,40,40,0.45)');
    // 板缝
    g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
    // 顺着底边一条水渍
    const grad = g.createLinearGradient(0, s * 0.8, 0, s);
    grad.addColorStop(0, 'rgba(40,35,30,0)'); grad.addColorStop(1, 'rgba(40,35,30,0.5)');
    g.fillStyle = grad; g.fillRect(0, s * 0.8, s, s * 0.2);
    return toTexture(c, repeat, repeat);
  }

  // ---------- 集装箱 ----------
  // 返回 { map, bump }：瓦楞是竖条纹，加锈迹和编号
  function container(color, label) {
    const w = 1024, h = 512;
    const c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h);

    // 瓦楞：每 32 像素一个凹凸周期
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, 0, 10, h);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 18, 0, 8, h);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + 10, 0, 8, h);
    }
    // 上下边框横梁
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 22, w, 4);

    // 锈迹和污渍
    blotches(g, w, h, 50, '70,35,15', 0.45, 10, 60);
    blotches(g, w, h, 25, '0,0,0', 0.3, 20, 90);
    // 底部流淌的锈水
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * w, y = rnd(h * 0.4, h * 0.9), len = rnd(20, 90);
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, 'rgba(90,45,20,0.5)'); grad.addColorStop(1, 'rgba(90,45,20,0)');
      g.fillStyle = grad; g.fillRect(x, y, rnd(2, 5), len);
    }
    speckle(g, w, h, 6000, 0.15, 2);

    // 编号和标志
    g.fillStyle = 'rgba(245,240,230,0.85)';
    g.font = 'bold 46px monospace';
    g.fillText(label, 60, 90);
    g.font = 'bold 26px monospace';
    g.fillText('MAX GROSS 30480 KG', 60, h - 60);
    g.strokeStyle = 'rgba(245,240,230,0.7)'; g.lineWidth = 4;
    g.strokeRect(w - 220, 50, 150, 80);
    g.font = 'bold 40px sans-serif';
    g.fillText('22G1', w - 205, 105);

    // 凹凸图：只保留瓦楞的明暗
    const b = canvas(w, h), bg = b.getContext('2d');
    bg.fillStyle = '#808080'; bg.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      bg.fillStyle = '#b0b0b0'; bg.fillRect(x, 0, 10, h);
      bg.fillStyle = '#505050'; bg.fillRect(x + 18, 0, 8, h);
    }
    bg.fillStyle = '#404040'; bg.fillRect(0, 0, w, 22); bg.fillRect(0, h - 26, w, 26);

    return { map: toTexture(c), bump: toTexture(b, 1, 1, false) };
  }

  // 集装箱端面：两扇门、门锁杆
  function containerDoor(color) {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 24) {
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, 0, 8, s);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 14, 0, 6, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s / 2 - 4, 0, 8, s);     // 门缝
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, s, 20); g.fillRect(0, s - 24, s, 24);
    // 四根锁杆
    for (const x of [s * 0.2, s * 0.38, s * 0.62, s * 0.8]) {
      g.fillStyle = '#d8d4c8'; g.fillRect(x - 5, 30, 10, s - 60);
      g.fillStyle = '#6a665e'; g.fillRect(x - 12, s * 0.45, 24, 30);
    }
    blotches(g, s, s, 30, '70,35,15', 0.4, 10, 50);
    speckle(g, s, s, 3000, 0.15, 2);
    return toTexture(c);
  }

  // ---------- 杂物 ----------

  // 沙袋墙：一排排鼓起的袋子
  function sandbag() {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#8a7b5c'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 32;
    for (let row = 0; row < h / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const grad = g.createRadialGradient(x + off + bw / 2, row * bh + bh / 2, 2, x + off + bw / 2, row * bh + bh / 2, bw / 2);
        grad.addColorStop(0, '#a08e6a'); grad.addColorStop(0.7, '#8a7b5c'); grad.addColorStop(1, '#5c5240');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x + off + bw / 2, row * bh + bh / 2, bw / 2 - 1, bh / 2 - 1, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    speckle(g, w, h, 4000, 0.2, 2);
    return toTexture(c, 2, 1.5);
  }

  // 油桶：两道加强筋 + 掉漆
  function barrel(color) {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (const y of [h * 0.3, h * 0.65]) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y - 6, w, 12);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y - 8, w, 3);
    }
    blotches(g, w, h, 30, '60,35,20', 0.5, 6, 30);
    blotches(g, w, h, 12, '0,0,0', 0.3, 10, 50);
    speckle(g, w, h, 2500, 0.2, 2);
    g.fillStyle = 'rgba(240,235,220,0.8)';
    g.font = 'bold 30px sans-serif';
    g.fillText('FLAMMABLE', 40, h * 0.5);
    return toTexture(c);
  }

  // 木托盘 / 木板
  function wood() {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#8c6a42'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.2)})`; g.fillRect(0, y, w, 32);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, w, 2);
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = 'rgba(60,35,15,0.4)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y + rnd(4, 28)); g.lineTo(w, y + rnd(4, 28)); g.stroke();
      }
    }
    speckle(g, w, h, 2500, 0.2, 2);
    return toTexture(c);
  }

  // 铁丝网：透明背景上的菱形网格，用在围栏上
  function chainlink() {
    const s = 128, c = canvas(s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#b9bcbf'; g.lineWidth = 2.2;
    const step = 32;
    for (let i = -s; i < s * 2; i += step) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke();
      g.beginPath(); g.moveTo(i + s, 0); g.lineTo(i, s); g.stroke();
    }
    return toTexture(c);
  }

  // 金属板：用在卡车、台阶护板
  function metal(color = '#5e6368') {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, s, s);
    blotches(g, s, s, 30, '0,0,0', 0.25, 10, 60);
    blotches(g, s, s, 15, '255,255,255', 0.1, 10, 50);
    speckle(g, s, s, 3000, 0.15, 1);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    return toTexture(c);
  }

  // 远处的厂房墙面：带一排排窗户
  function warehouse(color) {
    const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '0,0,0', 0.3, 20, 90);
    for (let y = 40; y < h - 40; y += 56) {
      for (let x = 24; x < w - 24; x += 48) {
        g.fillStyle = Math.random() < 0.8 ? '#1f2730' : '#c9d6e0';
        g.fillRect(x, y, 28, 36);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, 28, 3);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, w, 10);
    return toTexture(c, 2, 1);
  }

  // ---------- 天空 ----------

  // 天空穹顶：从地平线暖色到天顶蓝的渐变
  function sky() {
    const w = 64, h = 512, c = canvas(w, h), g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#2d5a9e');   // 天顶
    grad.addColorStop(0.45, '#6fa3d6');
    grad.addColorStop(0.62, '#b8cfe2');
    grad.addColorStop(0.72, '#e4cfb0');  // 地平线附近偏暖
    grad.addColorStop(1.0, '#c8b8a0');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 云：柔边的白团
  function cloud() {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      const x = rnd(50, s - 50), y = rnd(90, s - 80), r = rnd(25, 55);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.6, 'rgba(250,250,255,0.5)');
      grad.addColorStop(1, 'rgba(240,240,250,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 远山剪影：一圈环绕的山脊线，透明背景
  function hills() {
    const w = 2048, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const layer = (base, amp, color) => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      let y = base;
      for (let x = 0; x <= w; x += 16) {
        y += rnd(-amp, amp);
        y = Math.max(base - 60, Math.min(base + 40, y));
        g.lineTo(x, y);
      }
      g.lineTo(w, h); g.closePath(); g.fill();
    };
    layer(h * 0.45, 7, 'rgba(120,135,150,0.9)');
    layer(h * 0.62, 6, 'rgba(95,110,120,0.95)');
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  // 圆形软边：用在水洼、油渍、尘埃粒子
  function softDisc(inner, outer) {
    const s = 64, c = canvas(s), g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  return {
    asphalt, dirt, concrete, container, containerDoor, sandbag, barrel, wood,
    chainlink, metal, warehouse, sky, cloud, hills, softDisc,
  };
})();
