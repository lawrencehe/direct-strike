#!/usr/bin/env node
// 地图检查：从运行中的游戏读取真实的碰撞盒和点位（不依赖地图怎么写），输出校验结果和俯视图。
// 检查：出生点/巡逻点是否卡住或走不到、碰撞盒是否明显互相穿插（穿插只提示，不算失败）。
// 连通性按玩家碰撞盒和 stepHeight 算步行可达，含台阶和高台，不算跳跃。
//   node tools/map-check.mjs        有问题时退出码为 1
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openGame, OUT } from './lib/game-page.mjs';

const dir = path.join(OUT, 'map');
fs.mkdirSync(dir, { recursive: true });
const { page, problems, close } = await openGame({ width: 640, height: 360 });
const m = await page.evaluate(() => {
  const w = game.world, P = Game.Config.player;
  return {
    boxes: w.colliders.map((c) => [c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z]),
    spawns: w.spawns, nav: w.navPoints, range: w.rangeSpawn, bounds: w.bounds,
    radius: P.radius, height: P.height, step: P.stepHeight,
  };
});
await close();

const { radius: R, height: H, step } = m;
const isFloor = (b) => b[4] <= 0.001;                         // 地面本身
const solid = m.boxes.filter((b) => !isFloor(b));
// 地图范围：碰撞盒的外包范围，不含超大的地面
const xs = solid.flatMap((b) => [b[0], b[3]]), zs = solid.flatMap((b) => [b[2], b[5]]);
const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
const G = 0.25, nx = Math.ceil((x1 - x0) / G), nz = Math.ceil((z1 - z0) / G);
const inFoot = (b, x, z) => x + R > b[0] && x - R < b[3] && z + R > b[2] && z - R < b[5];
// 从高度 y 走到 (x, z) 后站在多高；走不过去返回 null。按碰撞盒真实高度算，所以台阶和高台都算得出来。
function standAt(x, z, y) {
  let top = 0;
  for (const b of solid) if (inFoot(b, x, z) && b[4] <= y + step + 0.01 && b[4] > top) top = b[4];
  for (const b of solid) if (inFoot(b, x, z) && b[4] > top + 0.01 && b[1] < top + H) return null;
  return top;
}
const key = (i, j, y) => `${i},${j},${Math.round(y * 20)}`;
const seen = new Set(), reachable = new Set();
{
  const stack = [];
  const push = (i, j, y) => {
    if (i < 0 || j < 0 || i > nx || j > nz) return;
    const h = standAt(x0 + i * G, z0 + j * G, y);
    if (h === null || seen.has(key(i, j, h))) return;
    seen.add(key(i, j, h)); reachable.add(`${i},${j}`);
    stack.push([i, j, h]);
  };
  push(Math.round((m.spawns[0].x - x0) / G), Math.round((m.spawns[0].z - z0) / G), 0);
  while (stack.length) {
    const [i, j, y] = stack.pop();
    push(i + 1, j, y); push(i - 1, j, y); push(i, j + 1, y); push(i, j - 1, y);
  }
}
const points = [
  ...m.spawns.map((s, i) => ({ name: `spawn${i}`, x: s.x, z: s.z, kind: 'spawn', yaw: s.yaw })),
  ...m.nav.map((n, i) => ({ name: `nav${i}`, x: n.x, z: n.z, kind: 'nav' })),
];
const issues = [];
// 点位不一定落在网格上，所以看周围一圈：能到达就算连通
function reached(p) {
  const i = Math.round((p.x - x0) / G), j = Math.round((p.z - z0) / G);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (reachable.has(`${i + a},${j + b}`)) return true;
  return false;
}
for (const p of points) if (!reached(p)) issues.push(`${p.name} (${p.x}, ${p.z}) 卡住或从 spawn0 走不到`);
if (m.range) {
  const h = standAt(m.range.x, m.range.z, m.range.y);
  if (h === null) issues.push(`训练场出生点 (${m.range.x}, ${m.range.y}, ${m.range.z}) 卡在碰撞盒里`);
}

// 明显穿插（三个方向都重叠 5cm 以上）。贴合和堆叠不算。
const overlaps = [];
for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
  const a = solid[i], b = solid[j];
  const d = [Math.min(a[3], b[3]) - Math.max(a[0], b[0]), Math.min(a[4], b[4]) - Math.max(a[1], b[1]), Math.min(a[5], b[5]) - Math.max(a[2], b[2])];
  if (d.every((v) => v > 0.05)) overlaps.push({ a: i, b: j, at: [(Math.max(a[0], b[0]) + d[0] / 2).toFixed(1), (Math.max(a[2], b[2]) + d[2] / 2).toFixed(1)], depth: +Math.min(...d).toFixed(2) });
}

// 俯视图：x 向右，z 向下（北在上）
const S = Math.min(800 / (x1 - x0 + 4), 800 / (z1 - z0 + 4));
const X = (x) => ((x - x0 + 2) * S).toFixed(1), Z = (z) => ((z - z0 + 2) * S).toFixed(1);
const W = ((x1 - x0 + 4) * S).toFixed(0), Hgt = ((z1 - z0 + 4) * S).toFixed(0);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hgt}" font-family="sans-serif" font-size="11"><rect width="100%" height="100%" fill="#f4f2ec"/>`;
for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) svg += `<line x1="${X(v)}" y1="0" x2="${X(v)}" y2="${Hgt}" stroke="#ddd"/><text x="${+X(v) + 2}" y="11" fill="#888">${v}</text>`;
for (let v = Math.ceil(z0 / 10) * 10; v <= z1; v += 10) svg += `<line x1="0" y1="${Z(v)}" x2="${W}" y2="${Z(v)}" stroke="#ddd"/><text x="2" y="${+Z(v) - 2}" fill="#888">${v}</text>`;
const shade = (top) => { const t = Math.min(top / 8, 1); const c = Math.round(190 - 140 * t); return `rgb(${c},${c + 6},${c + 14})`; };
for (const b of [...solid].sort((p, q) => p[4] - q[4])) svg += `<rect x="${X(b[0])}" y="${Z(b[2])}" width="${((b[3] - b[0]) * S).toFixed(1)}" height="${((b[5] - b[2]) * S).toFixed(1)}" fill="${shade(b[4])}" stroke="#333" stroke-width="0.5"/>`;
for (const p of points) {
  const bad = issues.some((t) => t.startsWith(`${p.name} `));
  if (p.kind === 'spawn') {
    const ax = +X(p.x) - Math.sin(p.yaw) * 14, az = +Z(p.z) - Math.cos(p.yaw) * 14;
    svg += `<line x1="${X(p.x)}" y1="${Z(p.z)}" x2="${ax}" y2="${az}" stroke="#1565c0" stroke-width="2"/><circle cx="${X(p.x)}" cy="${Z(p.z)}" r="5" fill="${bad ? '#d32f2f' : '#1565c0'}"/><text x="${+X(p.x) + 7}" y="${+Z(p.z) + 4}" fill="#0d47a1">${p.name.replace('spawn', 'S')}</text>`;
  } else svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="3" fill="${bad ? '#d32f2f' : '#2e7d32'}"/>`;
}
if (m.range) svg += `<rect x="${+X(m.range.x) - 4}" y="${+Z(m.range.z) - 4}" width="8" height="8" fill="#ef6c00"/>`;
svg += `<g transform="translate(8,${+Hgt - 8})"><text fill="#333">蓝 出生点  绿 巡逻点  橙 训练场  红 有问题的点位  方块越深越高</text></g></svg>`;
const svgPath = path.join(dir, 'topdown.svg'), png = path.join(dir, 'topdown.png');
fs.writeFileSync(svgPath, svg);
execFileSync('rsvg-convert', ['-o', png, svgPath]);

fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ issues, overlaps, problems, size: [x1 - x0, z1 - z0], colliders: m.boxes.length }, null, 2));
console.log(`地图 ${(x1 - x0).toFixed(0)}×${(z1 - z0).toFixed(0)}m，碰撞盒 ${m.boxes.length}，出生点 ${m.spawns.length}，巡逻点 ${m.nav.length}`);
console.log(`可到达面积 ${(reachable.size * G * G).toFixed(0)}m²（步行，含台阶和高台，不算跳跃）`);
console.log(`点位问题 ${issues.length} 条，碰撞盒穿插 ${overlaps.length} 处，页面报错 ${problems.length} 条`);
issues.slice(0, 8).forEach((t) => console.log(`  ${t}`));
overlaps.slice(0, 5).forEach((o) => console.log(`  穿插：盒 ${o.a} 和 ${o.b}，位置 (${o.at})，深度 ${o.depth}m`));
console.log(`俯视图: ${path.relative(process.cwd(), png)}`);
process.exit(issues.length || problems.length ? 1 : 0);
