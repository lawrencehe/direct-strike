// ============================================================
// 卡车：一辆平头货车（驾驶室 + 栏板货斗），全部用基础几何体拼出来，贴图由 textures.js 画。
//
// 局部坐标：原点在车底中心的地面上，车头朝 -z，x 是车宽方向，单位米。
// 全长 7.6、宽 2.3（后视镜和挡泥板略宽）、驾驶室顶高 3.2。
// build() 返回 { group, meshes }：group 放进场景，meshes 登记成可被子弹打中的物体。
// 碰撞盒不在这里做，world.js 用空气墙围一圈（和原来一样）。
// ============================================================
Game.Truck = (function () {
  const T = Game.Textures;

  function build(color = '#2f5d8c') {
    const g = new THREE.Group();
    const meshes = [];

    // ---- 材质 ----
    const std = (opts) => new THREE.MeshStandardMaterial(opts);
    const paint = std({ map: T.truckPaint(color), roughness: 0.55, metalness: 0.25 });
    const boardPaint = paint.clone();                     // 栏板又长又矮，贴图横向重复几次才不会被拉长
    boardPaint.map = paint.map.clone(); boardPaint.map.repeat.set(3, 0.5); boardPaint.map.needsUpdate = true;
    const cabSideR = std({ map: T.truckCabSide(color, true), roughness: 0.55, metalness: 0.25 });
    const cabSideL = std({ map: T.truckCabSide(color, false), roughness: 0.55, metalness: 0.25 });
    const cabFront = std({ map: T.truckCabFront(color), roughness: 0.55, metalness: 0.25 });
    const dark = std({ color: 0x2a2d31, roughness: 0.6, metalness: 0.5 });
    const chassis = std({ map: T.metal('#3a3d41'), roughness: 0.7, metalness: 0.4 });
    const glass = std({ color: 0x18222c, roughness: 0.12, metalness: 0.75 });
    const chrome = std({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 });
    const tread = std({ map: T.tyre(), roughness: 0.95 });
    const hub = std({ map: T.wheelHub(), roughness: 0.7, metalness: 0.4 });
    const sidewall = std({ color: 0x1e1f21, roughness: 0.95 });
    const wood = std({ map: T.wood(), roughness: 0.9 });
    wood.map = wood.map.clone(); wood.map.repeat.set(2, 5); wood.map.needsUpdate = true;
    const tarp = std({ map: T.tarp(), roughness: 1 });
    const headlight = std({ color: 0xe6e2cc, emissive: 0xfff4d0, emissiveIntensity: 0.35, roughness: 0.3 });
    const taillight = std({ color: 0x7a1510, emissive: 0xff2a1a, emissiveIntensity: 0.5, roughness: 0.3 });
    const amber = std({ color: 0xb86a1a, emissive: 0xff9a2a, emissiveIntensity: 0.6, roughness: 0.3 });
    const plate = std({ color: 0xe8e6df, roughness: 0.6 });

    // ---- 工具 ----
    const add = (geo, mat, x, y, z, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      meshes.push(m);
      return m;
    };
    // y 指底部高度
    const box = (w, h, d, x, y, z, mat, rot) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, rot);
    // 沿 z 轴（车长方向）的圆柱
    const tube = (r, len, x, y, z, mat, seg = 16) => add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, [Math.PI / 2, 0, 0]);
    // 沿 x 轴（车宽方向）的圆柱
    const axleTube = (r, len, x, y, z, mat, seg = 12) => add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, [0, 0, Math.PI / 2]);

    // 轮子：胎面 + 两侧（外侧有轮毂贴图）。CylinderGeometry 的材质顺序是 [侧面, 顶盖, 底盖]
    // 顶盖在 +y，绕 z 转 -90° 后指向 +x，所以放在车右侧时顶盖朝外
    function wheel(x, y, z, r = 0.5, width = 0.3) {
      const outward = x > 0;
      const geo = new THREE.CylinderGeometry(r, r, width, 28);
      const m = new THREE.Mesh(geo, [tread, outward ? hub : sidewall, outward ? sidewall : hub]);
      m.position.set(x, y, z);
      m.rotation.z = -Math.PI / 2;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      meshes.push(m);
      return m;
    }

    // 挡泥板：一段段薄板沿圆弧拼成半圆拱
    function fender(x, y, z, r, width, mat, from = 0.25, to = Math.PI - 0.25, n = 7) {
      const step = (to - from) / n;
      const len = 2 * r * Math.sin(step / 2) + 0.01;
      for (let i = 0; i < n; i++) {
        const a = from + step * (i + 0.5);
        add(new THREE.BoxGeometry(width, 0.03, len), mat, x, y + Math.sin(a) * r, z + Math.cos(a) * r, [Math.PI / 2 - a, 0, 0]);
      }
    }

    const FRONT = -3.8, REAR = 3.8;      // 车头、车尾的 z
    const wheelR = 0.5;

    // ---- 底盘 ----
    for (const x of [-0.55, 0.55]) box(0.1, 0.22, 7.2, x, 0.6, 0.1, chassis);
    for (const z of [-2.4, -0.8, 0.6, 2.0, 3.4]) box(1.1, 0.08, 0.1, 0, 0.64, z, chassis);
    // 车轴 + 轮子：前轴单轮，后双轴双轮
    const axles = [{ z: -2.9, xs: [-0.95, 0.95] }, { z: 1.5, xs: [-1.16, -0.84, 0.84, 1.16] }, { z: 2.75, xs: [-1.16, -0.84, 0.84, 1.16] }];
    for (const a of axles) {
      axleTube(0.07, 2.0, 0, wheelR, a.z, dark);
      for (const x of a.xs) wheel(x, wheelR, a.z);
    }
    // 后轴上方的钢板弹簧、挡泥板
    for (const x of [-0.6, 0.6]) box(0.12, 0.08, 2.4, x, 0.72, 2.12, dark);
    for (const x of [-1.0, 1.0]) fender(x, wheelR, 2.12, 0.6, 0.72, paint, 0.15, Math.PI - 0.15, 9);
    // 挡泥板之间的连接板
    for (const x of [-1.0, 1.0]) box(0.72, 0.03, 0.55, x, 1.05, 2.12, paint);
    // 挡泥皮
    for (const x of [-1.0, 1.0]) box(0.6, 0.45, 0.03, x, 0.1, 3.5, sidewall);
    // 油箱（左）+ 箍带，工具箱（右）
    tube(0.3, 1.3, -1.0, 0.72, -0.7, chrome, 20);
    for (const z of [-1.1, -0.3]) box(0.66, 0.04, 0.05, -1.0, 0.98, z, dark);
    box(0.5, 0.45, 0.8, 0.95, 0.5, -0.6, chassis);
    // 备胎：平放在底盘下
    const spare = wheel(0, 0.62, 0.3, 0.48, 0.28);
    spare.rotation.set(0, 0, 0);
    // 排气管：驾驶室后面竖起来
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 10), dark, 1.08, 2.0, -1.62);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10), dark, 1.08, 3.3, -1.62);
    box(0.08, 0.08, 0.3, 1.08, 0.72, -1.4, dark);

    // ---- 驾驶室 ----
    const cabZ = (FRONT + (FRONT + 2.05)) / 2;   // 驾驶室 z 中心
    const cabFloor = 1.05, cabH = 2.0;
    const cab = add(new THREE.BoxGeometry(2.3, cabH, 2.05), [cabSideR, cabSideL, paint, dark, paint, cabFront], 0, cabFloor + cabH / 2, cabZ);
    cab.geometry.computeBoundingBox();
    // 车顶略小一圈，边缘有层次
    box(2.1, 0.14, 1.85, 0, cabFloor + cabH, cabZ + 0.05, paint);
    // 遮阳板 + 顶部示廓灯
    box(2.2, 0.06, 0.4, 0, cabFloor + cabH - 0.1, FRONT - 0.15, paint, [0.35, 0, 0]);
    for (const x of [-0.6, 0, 0.6]) box(0.14, 0.06, 0.06, x, cabFloor + cabH + 0.14, cabZ - 0.85, amber);
    // 挡风玻璃、侧窗
    box(2.1, 0.9, 0.05, 0, cabFloor + 1.0, FRONT - 0.02, glass);
    for (const x of [-1.16, 1.16]) box(0.05, 0.75, 0.85, x, cabFloor + 1.05, cabZ + 0.47, glass);
    // 雨刮
    for (const x of [-0.5, 0.4]) box(0.6, 0.02, 0.02, x, cabFloor + 1.02, FRONT - 0.06, dark, [0, 0, 0.25]);
    // 发动机罩（驾驶室下面的黑盒子）、前保险杠、大灯、踏板
    box(2.0, 0.5, 1.8, 0, 0.55, cabZ + 0.1, dark);
    box(2.4, 0.32, 0.2, 0, 0.72, FRONT - 0.08, dark);
    box(2.4, 0.04, 0.22, 0, 1.04, FRONT - 0.08, chrome);
    for (const x of [-0.78, 0.78]) box(0.3, 0.16, 0.04, x, cabFloor + 0.58, FRONT - 0.03, headlight);
    for (const x of [-1.0, 1.0]) { box(0.55, 0.05, 0.3, x, 0.45, cabZ + 0.5, dark); box(0.55, 0.05, 0.3, x, 0.78, cabZ + 0.5, dark); }
    // 后视镜：支架 + 镜面
    for (const x of [-1, 1]) {
      box(0.03, 0.03, 0.45, x * 1.38, cabFloor + 1.55, FRONT + 0.25, dark);
      box(0.03, 0.55, 0.03, x * 1.38, cabFloor + 1.0, FRONT + 0.03, dark);
      box(0.04, 0.4, 0.22, x * 1.4, cabFloor + 1.05, FRONT + 0.03, dark);
      box(0.01, 0.34, 0.17, x * 1.425, cabFloor + 1.08, FRONT + 0.03, chrome);
    }

    // ---- 货斗 ----
    const bedZ0 = FRONT + 2.25, bedL = REAR - bedZ0, bedZ = bedZ0 + bedL / 2;
    const bedY = 1.0;
    box(2.3, 0.15, bedL, 0, bedY - 0.15, bedZ, chassis);           // 底架
    box(2.3, 0.1, bedL, 0, bedY, bedZ, wood);                       // 木地板
    for (const x of [-1.17, 1.17]) box(0.06, 0.65, bedL, x, bedY + 0.1, bedZ, boardPaint);   // 侧栏板
    box(2.3, 0.65, 0.06, 0, bedY + 0.1, REAR - 0.03, boardPaint);   // 后栏板
    box(2.3, 1.35, 0.06, 0, bedY + 0.1, bedZ0 + 0.03, paint);       // 前挡板（护驾驶室）
    for (const x of [-1.2, 1.2]) {
      box(0.06, 0.05, bedL + 0.04, x, bedY + 0.75, bedZ, dark);     // 栏板上沿包边
      for (let z = bedZ0 + 0.05; z < REAR; z += (bedL - 0.1) / 4) box(0.09, 0.78, 0.09, x, bedY + 0.05, z, dark);  // 立柱
    }
    for (const x of [-0.9, 0.9]) box(0.06, 0.06, 0.6, x, bedY + 1.45, bedZ0 + 0.03, dark);  // 前挡板上的工具挂钩
    // 尾灯、车牌、后下部防护杠
    for (const x of [-0.95, 0.95]) box(0.22, 0.12, 0.05, x, 0.85, REAR + 0.02, taillight);
    box(0.44, 0.14, 0.02, 0, 0.62, REAR + 0.02, plate);
    box(2.2, 0.1, 0.1, 0, 0.5, REAR - 0.1, dark);

    // ---- 货物 ----
    box(1.1, 1.1, 1.1, -0.45, bedY + 0.1, 0.3, wood, [0, 0.12, 0]);        // 木箱
    const crateWood = std({ map: T.wood(), roughness: 0.9 });
    box(0.8, 0.6, 0.8, 0.55, bedY + 0.1, 0.2, crateWood, [0, -0.2, 0]);    // 小木箱
    box(1.1, 0.75, 1.6, -0.45, bedY + 0.1, 2.3, tarp, [0, 0.06, 0]);       // 盖着篷布的一堆
    box(0.9, 0.2, 1.3, -0.45, bedY + 0.85, 2.3, tarp, [0.05, 0.06, 0.04]);
    for (const [x, z, mat] of [[0.6, 1.6, T.barrel('#2d4f7a')], [0.62, 2.35, T.barrel('#5f6366')], [0.0, 3.2, T.barrel('#8a2f24')]]) {
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18), std({ map: mat, roughness: 0.6, metalness: 0.3 }), x, bedY + 0.55, z);
    }

    return { group: g, meshes };
  }

  return { build };
})();
