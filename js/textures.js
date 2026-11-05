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


  // ---------- 卡车 ----------

  // 漆面底子：底色 + 面板明暗 + 底部泥锈 + 划痕 + 灰尘。其他卡车贴图都在这上面继续画
  function paintBase(g, w, h, color) {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 25, '255,255,255', 0.08, w * 0.05, w * 0.3);
    blotches(g, w, h, 25, '0,0,0', 0.12, w * 0.05, w * 0.25);
    // 划痕：短而浅的斜线
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = rnd(8, 40), a = rnd(-0.4, 0.4);
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.08, 0.25)})`;
      g.lineWidth = rnd(0.8, 1.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // 锈点和流锈：集中在下半部分
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * w, y = h * rnd(0.45, 0.95), r = rnd(3, 12);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(120,58,28,0.85)'); grad.addColorStop(0.5, 'rgba(140,72,34,0.4)'); grad.addColorStop(1, 'rgba(140,72,34,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
      const streak = g.createLinearGradient(0, y, 0, y + rnd(20, 70));
      streak.addColorStop(0, 'rgba(130,66,30,0.35)'); streak.addColorStop(1, 'rgba(130,66,30,0)');
      g.fillStyle = streak; g.fillRect(x - 1.5, y, 3, 70);
    }
    // 底部溅泥
    const mud = g.createLinearGradient(0, h * 0.78, 0, h);
    mud.addColorStop(0, 'rgba(70,58,42,0)'); mud.addColorStop(1, 'rgba(70,58,42,0.75)');
    g.fillStyle = mud; g.fillRect(0, h * 0.78, w, h * 0.22);
    speckle(g, w, h, 1500, 0.12, 1);
  }

  // 圆角矩形路径
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  // 卡车普通漆面（车顶、货斗挡板等）
  function truckPaint(color) {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    paintBase(g, s, s, color);
    return toTexture(c);
  }

  // 驾驶室侧面：车门接缝、门把手、车窗胶条、踏板。doorAtLeft 决定车门画在左边还是右边
  // （BoxGeometry 左右两个面的贴图方向相反，所以要两张镜像的）
  function truckCabSide(color, doorAtLeft) {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    paintBase(g, s, s, color);
    // 车门（画在右边）
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.55)';
    roundRect(g, s * 0.5, s * 0.03, s * 0.46, s * 0.94, 14); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.18)';
    roundRect(g, s * 0.5 + 4, s * 0.03 + 4, s * 0.46 - 8, s * 0.94 - 8, 12); g.stroke();
    // 车窗胶条（玻璃本身是单独的几何体，贴图里只画一圈黑框）
    g.fillStyle = '#15181c';
    roundRect(g, s * 0.52, s * 0.08, s * 0.42, s * 0.4, 10); g.fill();
    // 门把手
    g.fillStyle = '#1d1f22'; roundRect(g, s * 0.54, s * 0.56, 54, 14, 6); g.fill();
    g.fillStyle = '#9ea3a8'; roundRect(g, s * 0.54 + 4, s * 0.56 + 3, 46, 5, 3); g.fill();
    // 车窗下的流锈
    for (const x of [s * 0.55, s * 0.9]) {
      const streak = g.createLinearGradient(0, s * 0.48, 0, s * 0.72);
      streak.addColorStop(0, 'rgba(120,60,28,0.5)'); streak.addColorStop(1, 'rgba(120,60,28,0)');
      g.fillStyle = streak; g.fillRect(x, s * 0.48, 5, s * 0.24);
    }
    // 前段下方的通风格栅
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 5; i++) g.fillRect(s * 0.08, s * 0.62 + i * 12, s * 0.2, 5);
    // 车身中部一条装饰线
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, s * 0.53, s, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, s * 0.53 + 3, s, 2);
    if (!doorAtLeft) return toTexture(c);
    const m = canvas(s), mg = m.getContext('2d');
    mg.translate(s, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0);
    return toTexture(m);
  }

  // 驾驶室正面：挡风玻璃胶条、进气格栅、大灯、转向灯、车牌
  function truckCabFront(color) {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    paintBase(g, s, s, color);
    // 挡风玻璃胶条
    g.fillStyle = '#15181c'; roundRect(g, s * 0.03, s * 0.03, s * 0.94, s * 0.44, 12); g.fill();
    // 中部装饰线
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, s * 0.5, s, 3);
    // 格栅：黑底 + 横向亮条
    g.fillStyle = '#17191c'; roundRect(g, s * 0.22, s * 0.56, s * 0.56, s * 0.22, 8); g.fill();
    g.fillStyle = '#6c7076';
    for (let i = 0; i < 6; i++) g.fillRect(s * 0.24, s * 0.58 + i * (s * 0.18 / 6), s * 0.52, 5);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s * 0.22, s * 0.56, s * 0.56, 3);
    // 大灯：铬圈 + 暖色玻璃 + 高光
    for (const x of [s * 0.11, s * 0.89]) {
      const y = s * 0.67, r = s * 0.065;
      g.fillStyle = '#b9bcc0'; g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.fill();
      const lamp = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
      lamp.addColorStop(0, '#fffbe6'); lamp.addColorStop(0.5, '#e8dfb8'); lamp.addColorStop(1, '#8f8a6a');
      g.fillStyle = lamp; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * r * 0.35, y - r); g.lineTo(x + i * r * 0.35, y + r); g.stroke(); }
      // 转向灯
      g.fillStyle = '#d98a2b'; roundRect(g, x - r * 0.7, y + r + 10, r * 1.4, r * 0.5, 4); g.fill();
    }
    // 车牌
    g.fillStyle = '#e8e6df'; roundRect(g, s * 0.4, s * 0.84, s * 0.2, s * 0.07, 3); g.fill();
    g.fillStyle = '#2a2d32'; g.font = `bold ${Math.round(s * 0.045)}px sans-serif`; g.textAlign = 'center';
    g.fillText('F·51 207', s * 0.5, s * 0.84 + s * 0.052);
    return toTexture(c);
  }

  // 轮胎胎面：横向沟槽 + 中央环向沟槽。u 方向沿轮胎一圈，用 repeat 重复
  function tyre() {
    const w = 128, h = 64, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#232426'; g.fillRect(0, 0, w, h);
    // 胎面块：两排错开
    g.fillStyle = '#2d2f32';
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 32 + 2, 4, 26, 24);
      g.fillRect(i * 32 + 18, 36, 26, 24);
      g.fillRect(i * 32 - 14, 36, 26, 24);
    }
    g.fillStyle = '#141516'; g.fillRect(0, 30, w, 5);          // 中央环向沟
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 3, h); g.fillRect(i * 32 + 16, 34, 3, 30); }
    speckle(g, w, h, 400, 0.12, 1);
    const tex = toTexture(c, 9, 1);
    tex.anisotropy = 4;
    return tex;
  }

  // 轮毂：外圈胎侧 + 钢圈 + 螺栓
  function wheelHub() {
    const s = 128, c = canvas(s), g = c.getContext('2d'), m = s / 2;
    g.fillStyle = '#202123'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
    for (let r = 44; r < 64; r += 6) { g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.stroke(); }
    const rim = g.createRadialGradient(m - 8, m - 8, 2, m, m, 40);
    rim.addColorStop(0, '#8a8e93'); rim.addColorStop(0.8, '#5b5f64'); rim.addColorStop(1, '#3a3d41');
    g.fillStyle = rim; g.beginPath(); g.arc(m, m, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2e32'; g.beginPath(); g.arc(m, m, 13, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x = m + Math.cos(a) * 27, y = m + Math.sin(a) * 27;
      g.fillStyle = '#1c1e21'; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a9ea3'; g.beginPath(); g.arc(x - 1, y - 1, 2.5, 0, Math.PI * 2); g.fill();
    }
    blotches(g, s, s, 6, '70,58,42', 0.5, 10, 30);
    return toTexture(c);
  }

  // 篷布：帆布底色 + 褶皱
  function tarp() {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    g.fillStyle = '#5c6446'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, grad = g.createLinearGradient(x, 0, x + rnd(20, 50), s);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    }
    blotches(g, s, s, 20, '0,0,0', 0.2, 10, 40);
    speckle(g, s, s, 2500, 0.1, 1);
    return toTexture(c);
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

  // 云：画一朵积云。思路是"先铺一层偏灰的底，再在上面盖亮白的团"，
  // 光照来自上方，所以每个云团的亮心往上偏，底部自然就是阴影色；
  // 云底用渐变擦平，上缘再撒一圈小碎团做毛边。canvas 2:1，配合 sprite 的宽高比
  function cloud(variant = 0) {
    const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const baseY = h * 0.74;
    const puffs = [];
    // 主体：沿 x 排一串圆，中间的大、两头的小，再在中段堆第二、三层做成"塔"
    const left = w * rnd(0.08, 0.14), right = w * rnd(0.86, 0.92);
    for (let x = left; x <= right; x += rnd(22, 36)) {
      const t = (x - left) / (right - left);
      const env = 0.35 + 0.65 * Math.sin(Math.PI * t);
      const r = (36 + variant * 5) * env * rnd(0.85, 1.15) + 18;
      puffs.push({ x, y: baseY - r * 0.6, r });
      if (env > 0.5 && Math.random() < 0.85) puffs.push({ x: x + rnd(-15, 15), y: baseY - r * 1.35, r: r * rnd(0.65, 0.9) });
      if (env > 0.8 && Math.random() < 0.7) puffs.push({ x: x + rnd(-12, 12), y: baseY - r * 2.0, r: r * rnd(0.5, 0.7) });
      if (env > 0.9 && variant === 2 && Math.random() < 0.5) puffs.push({ x: x + rnd(-10, 10), y: baseY - r * 2.55, r: r * rnd(0.4, 0.55) });
    }
    const blur = (px) => { if ('filter' in g) g.filter = px ? `blur(${px}px)` : 'none'; };

    // 1. 阴影底：偏蓝灰，略大一圈
    blur(3);
    for (const p of puffs) {
      const grad = g.createRadialGradient(p.x, p.y + p.r * 0.1, 0, p.x, p.y + p.r * 0.1, p.r * 1.08);
      grad.addColorStop(0, 'rgba(168,178,196,0.95)');
      grad.addColorStop(0.75, 'rgba(168,178,196,0.7)');
      grad.addColorStop(1, 'rgba(168,178,196,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y + p.r * 0.1, p.r * 1.08, 0, Math.PI * 2); g.fill();
    }
    // 2. 受光面：亮心往上偏，越靠上的团越白
    blur(1.5);
    for (const p of puffs) {
      const lit = 1 - Math.min(1, (p.y - h * 0.15) / (baseY - h * 0.15)) * 0.45;
      const cx = p.x - p.r * 0.1, cy = p.y - p.r * 0.3;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, p.r * 0.95);
      grad.addColorStop(0, `rgba(255,255,255,${0.95 * lit})`);
      grad.addColorStop(0.55, `rgba(250,251,255,${0.75 * lit})`);
      grad.addColorStop(1, 'rgba(240,243,250,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, p.r * 0.95, 0, Math.PI * 2); g.fill();
    }
    // 3. 上缘毛边：一圈小碎团
    blur(1);
    for (const p of puffs) {
      for (let i = 0; i < 4; i++) {
        const a = rnd(-2.6, -0.5), rr = p.r * rnd(0.18, 0.32);
        const x = p.x + Math.cos(a) * p.r * 0.9, y = p.y + Math.sin(a) * p.r * 0.9;
        const grad = g.createRadialGradient(x, y, 0, x, y, rr);
        grad.addColorStop(0, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      }
    }
    blur(0);
    // 4. 云底擦平：基线以下渐渐透明，留一点点参差
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, baseY - 6, 0, baseY + 18);
    cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut; g.fillRect(0, baseY - 6, w, h - baseY + 6);
    // 5. 整体四周轻微淡出，避免 sprite 边缘出现硬边
    const fade = g.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.08, 'rgba(0,0,0,0)');
    fade.addColorStop(0.92, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 卷云：几条又长又淡的丝状白痕，挂在高处
  function cirrus() {
    const w = 512, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    if ('filter' in g) g.filter = 'blur(2px)';
    for (let i = 0; i < 9; i++) {
      const y = rnd(h * 0.25, h * 0.75), x0 = rnd(0, w * 0.3), x1 = rnd(w * 0.6, w);
      g.strokeStyle = `rgba(255,255,255,${rnd(0.12, 0.3)})`;
      g.lineWidth = rnd(3, 10); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y);
      g.bezierCurveTo(x0 + (x1 - x0) * 0.3, y + rnd(-18, 18), x0 + (x1 - x0) * 0.7, y + rnd(-18, 18), x1, y + rnd(-10, 10));
      g.stroke();
    }
    if ('filter' in g) g.filter = 'none';
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.15, 'rgba(0,0,0,0)');
    fade.addColorStop(0.85, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
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
    chainlink, metal, warehouse, sky, cloud, cirrus, hills, softDisc,
    truckPaint, truckCabSide, truckCabFront, tyre, wheelHub, tarp,
  };
})();
