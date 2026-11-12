// 地图道具模型的针对性测试（#50 第 2 步）：
// - 集装箱、隔离墩、沙袋墙、中央战术平台都用上了模型（不是退回的方块），数量和地图文件一致
// - 模型摆的位置和大小跟碰撞盒对得上（模型的包围盒和地图里的尺寸差不超过几厘米）；
//   沙袋墙压缩后靠节点变换还原坐标，摆错会陷进高台里，这里一并检查
// - 每种颜色的集装箱用自己的颜色贴图
// - 碰撞盒和换模型前一样（看不见的方块），地图检查不受影响
// - 从几个机位截图：tools/out/tests/map-props/*.png
// 用法（在仓库根目录）：node tools/tests/map-props.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openGame, OUT } from '../lib/game-page.mjs';

const dir = path.join(OUT, 'tests/map-props');
fs.mkdirSync(dir, { recursive: true });
const map = JSON.parse(fs.readFileSync('maps/yard.json', 'utf8'));
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => { game.startMode('duel'); game.ui.show(null); game.input.locked = true; });

const props = await p.evaluate(() => {
  const out = [];
  game.scene.traverse((o) => {
    if (!o.userData.prop) return;
    const b = new THREE.Box3().setFromObject(o);
    const maps = new Set();
    o.traverse((m) => { if (m.isMesh && m.material.map) maps.add(m.material.map.uuid); });
    out.push({ type: o.userData.prop, min: b.min.toArray(), max: b.max.toArray(), maps: [...maps] });
  });
  return out;
});
const count = (t) => map.objects.filter((o) => o.type === t).length;
// 中央战术平台：模型摆上了，落在地面上，盖住台面的碰撞盒
const plat = props.filter((q) => q.type === 'centralPlatform');
const deck = map.objects.find((o) => o.type === 'proxy' && o.note === '台面');
check(plat.length === 1, '中央战术平台用模型显示', plat.length);
if (plat[0] && deck) {
  const [w, , d] = deck.size, [x, , z] = deck.pos;
  const b = plat[0];
  check(Math.abs(b.min[1]) < 0.05 && b.min[0] < x - w / 2 + 0.3 && b.max[0] > x + w / 2 - 0.3 && b.min[2] < z - d / 2 + 0.3 && b.max[2] > z + d / 2 - 0.3,
    '平台模型落地、盖住台面的碰撞盒', [b.min, b.max]);
}
for (const t of ['container', 'jersey', 'sandbags']) {
  check(props.filter((q) => q.type === t).length === count(t), `${t} 全部用模型显示`, [props.filter((q) => q.type === t).length, count(t)]);
}

// 模型包围盒和地图尺寸对比（锁杆、吊环、袋子鼓出来一点，容差放宽到 0.12 米）
const near = (a, b, tol = 0.12) => Math.abs(a - b) <= tol;
function expect(o) {
  const y = o.y || 0;
  if (o.type === 'container') { const [w, d] = o.alongZ ? [2.44, 6] : [6, 2.44]; return { x: o.x, z: o.z, y, w, h: 2.6, d }; }
  if (o.type === 'jersey') { const [w, d] = o.alongX ? [2.4, 0.56] : [0.56, 2.4]; return { x: o.x, z: o.z, y, w, h: 0.84, d }; }
  const [w, d] = o.alongZ ? [0.6, o.len] : [o.len, 0.6]; return { x: o.x, z: o.z, y, w, h: 0.9, d };
}
for (const o of map.objects.filter((q) => ['container', 'jersey', 'sandbags'].includes(q.type))) {
  const e = expect(o);
  const m = props.find((q) => q.type === o.type && near((q.min[0] + q.max[0]) / 2, e.x, 0.2) && near((q.min[2] + q.max[2]) / 2, e.z, 0.2) && near(q.min[1], e.y, 0.2));
  const size = m && [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]].map((v) => +v.toFixed(2));
  const ok = m && near(m.min[1], e.y, 0.05) && near(size[0], e.w) && near(size[1], e.h) && near(size[2], e.d);
  check(ok, `${o.type} (${o.x}, ${e.y}, ${o.z}) 位置和大小对得上`, size || '没找到');
}

// 每种颜色的集装箱用不同的颜色贴图
const cmaps = new Set(props.filter((q) => q.type === 'container').map((q) => q.maps.join()));
const colors = new Set(map.objects.filter((o) => o.type === 'container').map((o) => o.color));
check(cmaps.size === colors.size, '每种颜色的集装箱一张颜色贴图', [cmaps.size, colors.size]);

// 碰撞盒：每个道具都有一个和地图尺寸一样的看不见的方块
const boxes = await p.evaluate(() => game.world.colliders.map((b) => [...b.min.toArray(), ...b.max.toArray()]));
let proxyOk = 0, proxyAll = 0;
for (const o of map.objects.filter((q) => ['container', 'jersey', 'sandbags'].includes(q.type))) {
  proxyAll++;
  const e = expect(o);
  const w = o.type === 'jersey' ? (o.alongX ? 2.4 : 0.5) : e.w, d = o.type === 'jersey' ? (o.alongX ? 0.5 : 2.4) : e.d;
  const h = o.type === 'jersey' ? 0.85 : e.h;
  if (boxes.some((b) => near(b[0], e.x - w / 2, 0.01) && near(b[3], e.x + w / 2, 0.01) && near(b[2], e.z - d / 2, 0.01)
    && near(b[5], e.z + d / 2, 0.01) && near(b[1], e.y, 0.01) && near(b[4], e.y + h, 0.01))) proxyOk++;
}
check(proxyOk === proxyAll, '碰撞盒和换模型前的方块一样', [proxyOk, proxyAll]);

const shots = [
  ['container', -4, 19, 0.75, -0.05],
  ['container-door', 14, 1.5, 2.2, -0.05],
  ['platform', 1, 11, 0, 0.05],
  ['jersey', 2, 9.6, 0.3, -0.45],
];
for (const [name, x, z, yaw, pitch] of shots) {
  await p.evaluate(([x, z, yaw, pitch]) => {
    const pl = game.player;
    pl.position.set(x, 0, z); pl.yaw = yaw; pl.pitch = pitch;
    pl.update(0, game.input);
  }, [x, z, yaw, pitch]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(dir, `${name}.png`) });
  console.log('截图', path.relative(process.cwd(), path.join(dir, `${name}.png`)));
}

check(g.problems.length === 0, '控制台没有报错', g.problems.slice(0, 3));
await g.close();
console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
