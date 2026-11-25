#!/usr/bin/env node
// 地图检查：从运行中的游戏读取真实的碰撞盒和点位（不依赖地图怎么写），输出校验结果和俯视图。
// 检查：出生点/巡逻点是否卡住或走不到、碰撞盒是否明显互相穿插（穿插只提示，不算失败）。
// 俯视图上画网格坐标（字母 = 东西，数字 = 南北）、物体和点位的编号、区域名、备注标记（#115），和负责人沟通时用。
// 连通性按玩家碰撞盒和 stepHeight 算步行可达，含台阶和高台，不算跳跃。
//   node tools/map-check.mjs [--map maps/新地图.json | --map <上传编号>]        有问题时退出码为 1
// 不传 --map 时检查 config.js 当前使用的地图。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openGame, OUT } from './lib/game-page.mjs';

const dir = path.join(OUT, 'map');
fs.mkdirSync(dir, { recursive: true });
const mi = process.argv.indexOf('--map');
// --map 也可以写开发者模式上传的编号（负责人在游戏里上传的本地地图，#115），读 ~/direct-strike-data/devlogs/<编号>/map.json
const DATA = process.env.DEVLOG_DIR || path.join(process.env.HOME, 'direct-strike-data/devlogs');
const mapArg = mi >= 0 ? process.argv[mi + 1] : undefined;
const mapFile = !mapArg ? undefined : /^\d{8}-\d{6}-\w+$/.test(mapArg) && !fs.existsSync(mapArg) ? path.join(DATA, mapArg, 'map.json') : path.resolve(mapArg);
// 必填字段先查一遍，错误信息比游戏启动失败更好懂
if (mapFile) {
  const d = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  if (d.format !== 2) { console.error('错误: 地图不是 format 2（见 docs/maps.md）'); process.exit(2); }
  const need = ['yard', 'bounds', 'shadowRange', 'layout', 'entities', 'layout.pads', 'layout.puddles', 'layout.stains', 'layout.debris', 'layout.fences', 'layout.objects', 'layout.backdrop'];
  const lack = need.filter((k) => k.split('.').reduce((o, f) => (o === undefined ? o : o[f]), d) === undefined);
  if (lack.length) { console.error(`错误: 地图缺少字段 ${lack.join(', ')}`); process.exit(2); }
}
let opened;
try { opened = await openGame({ width: 640, height: 360, mapFile }); }
catch (e) { console.error(`错误: ${e.message}`); process.exit(2); }
const { page, problems, close } = opened;
const m = await page.evaluate(() => {
  const w = game.world, P = Game.Config.player;
  return {
    boxes: w.colliders.map((c) => [c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z]),
    spawns: w.spawns, nav: w.navPoints, range: w.rangeSpawn, bounds: w.bounds, map: w.map,
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
// 点位用地图文件里的编号（S1、N3…）；spawns[0] 是玩家开局（start），spawns[3] 是兜底（fallback）
const E = m.map.entities;
const points = [
  ...E.filter((e) => e.type === 'spawn').map((e) => ({ name: e.id, x: e.x, z: e.z, kind: 'spawn', yaw: e.yaw || 0, tag: e.start ? '开局' : e.fallback ? '兜底' : '' })),
  ...E.filter((e) => e.type === 'nav').map((e) => ({ name: e.id, x: e.x, z: e.z, kind: 'nav' })),
];
const issues = [];
// 对决和波次依赖这个约定：spawns[0] 是玩家（start），z<0 的是 NPC 一侧，spawns[3] 是 NPC 的兜底位置（fallback）
if (m.spawns.length < 4) issues.push(`出生点只有 ${m.spawns.length} 个，至少要 4 个`);
if (!m.spawns.some((s) => s.z < 0)) issues.push('没有 z<0 的出生点，NPC 没地方出生');
if (E.filter((e) => e.type === 'spawn' && e.start).length !== 1) issues.push('要有且只有一个 start（玩家开局）的出生点');
if (E.filter((e) => e.type === 'spawn' && e.fallback).length !== 1) issues.push('要有且只有一个 fallback（兜底）的出生点');
if (m.nav.length < 2) issues.push(`巡逻点只有 ${m.nav.length} 个，NPC 没法巡逻`);
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

// 俯视图：x 向右，z 向下（北在上）。网格从 bounds 的西北角起，每格 grid 米：列是字母（西→东），行是数字（北→南）
const B = m.bounds, GRID = m.map.grid || 2;
const gx0 = Math.min(x0, B.minX), gx1 = Math.max(x1, B.maxX), gz0 = Math.min(z0, B.minZ), gz1 = Math.max(z1, B.maxZ);
const S = Math.min(1000 / (gx1 - gx0 + 6), 1100 / (gz1 - gz0 + 6));
const X = (x) => ((x - gx0 + 4) * S).toFixed(1), Z = (z) => ((z - gz0 + 4) * S).toFixed(1);
const W = ((gx1 - gx0 + 6) * S).toFixed(0), Hgt = ((gz1 - gz0 + 8) * S).toFixed(0);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const colName = (i) => { let t = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(65 + ((i - 1) % 26)) + t; return t; };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hgt}" font-family="sans-serif" font-size="11"><rect width="100%" height="100%" fill="#f4f2ec"/>`;
let gridLabels = '';
const nCol = Math.ceil((B.maxX - B.minX) / GRID - 1e-6), nRow = Math.ceil((B.maxZ - B.minZ) / GRID - 1e-6);
for (let i = 0; i <= nCol; i++) {
  const x = Math.min(B.minX + i * GRID, B.maxX);
  svg += `<line x1="${X(x)}" y1="${Z(B.minZ)}" x2="${X(x)}" y2="${Z(B.maxZ)}" stroke="#e2ded4"/>`;
  if (i < nCol) gridLabels += `<text x="${X(B.minX + (i + 0.5) * GRID)}" y="${+Z(gz0) - 8}" text-anchor="middle" fill="#7a7468" font-weight="bold">${colName(i)}</text>`
    + `<text x="${X(B.minX + (i + 0.5) * GRID)}" y="${+Z(gz1) + 18}" text-anchor="middle" fill="#7a7468" font-weight="bold">${colName(i)}</text>`;
}
for (let j = 0; j <= nRow; j++) {
  const z = Math.min(B.minZ + j * GRID, B.maxZ);
  svg += `<line x1="${X(B.minX)}" y1="${Z(z)}" x2="${X(B.maxX)}" y2="${Z(z)}" stroke="#e2ded4"/>`;
  if (j < nRow) gridLabels += `<text x="${+X(gx0) - 8}" y="${+Z(B.minZ + (j + 0.5) * GRID) + 4}" text-anchor="end" fill="#7a7468" font-weight="bold">${j + 1}</text>`
    + `<text x="${+X(gx1) + 8}" y="${+Z(B.minZ + (j + 0.5) * GRID) + 4}" fill="#7a7468" font-weight="bold">${j + 1}</text>`;
}
// 区域：虚线框 + 名字
for (const r of m.map.regions || []) {
  svg += `<rect x="${X(r.x - r.w / 2)}" y="${Z(r.z - r.d / 2)}" width="${(r.w * S).toFixed(1)}" height="${(r.d * S).toFixed(1)}" fill="#c9a227" fill-opacity="0.06" stroke="#b08d1a" stroke-dasharray="6 4"/>`
    + `<text x="${+X(r.x - r.w / 2) + 4}" y="${+Z(r.z - r.d / 2) + 13}" fill="#8a6d0f" font-size="12" font-weight="bold">${esc(r.name)}</text>`;
}
const shade = (top) => { const t = Math.min(top / 8, 1); const c = Math.round(190 - 140 * t); return `rgb(${c},${c + 6},${c + 14})`; };
for (const b of [...solid].sort((p, q) => p[4] - q[4])) svg += `<rect x="${X(b[0])}" y="${Z(b[2])}" width="${((b[3] - b[0]) * S).toFixed(1)}" height="${((b[5] - b[2]) * S).toFixed(1)}" fill="${shade(b[4])}" stroke="#333" stroke-width="0.5"/>`;
// 物体编号：写在物体中心（白底，方块深色时也看得清）
const label = (x, z, t, color = '#222') => `<text x="${X(x)}" y="${+Z(z) + 4}" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(t)}</text>`;
for (const o of m.map.layout.objects) {
  const [x, , z] = o.pos || [o.x, 0, o.z];
  if (o.id) svg += label(x, z + ((o.y || (o.pos && o.pos[1])) ? 0.6 : 0), o.id);
}
for (const p of points) {
  const bad = issues.some((t) => t.startsWith(`${p.name} `));
  if (p.kind === 'spawn') {
    const ax = +X(p.x) - Math.sin(p.yaw) * 16, az = +Z(p.z) - Math.cos(p.yaw) * 16;
    svg += `<line x1="${X(p.x)}" y1="${Z(p.z)}" x2="${ax}" y2="${az}" stroke="#1565c0" stroke-width="2"/><circle cx="${X(p.x)}" cy="${Z(p.z)}" r="5" fill="${bad ? '#d32f2f' : '#1565c0'}"/>`
      + `<text x="${+X(p.x) + 7}" y="${+Z(p.z) + 4}" fill="#0d47a1" font-weight="bold">${p.name}${p.tag ? ` ${p.tag}` : ''}</text>`;
  } else svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="3" fill="${bad ? '#d32f2f' : '#2e7d32'}"/><text x="${+X(p.x) + 4}" y="${+Z(p.z) - 3}" fill="#2e7d32" font-size="9">${p.name}</text>`;
}
svg += gridLabels;
if (m.range) svg += `<rect x="${+X(m.range.x) - 4}" y="${+Z(m.range.z) - 4}" width="8" height="8" fill="#ef6c00"/>`;
// 备注标记（负责人在 Blender 里贴的便签）：黄色三角 + 编号和文字
for (const n of E.filter((e) => e.type === 'note')) {
  svg += `<path d="M${X(n.x)} ${Z(n.z)} l-6 -12 h12 z" fill="#fbc02d" stroke="#8a6d0f"/>` + label(n.x, n.z - 1.2, `${n.id} ${n.text || ''}`, '#8a6d0f');
}
svg += `<g transform="translate(8,${+Hgt - 10})"><text fill="#333">网格每格 ${GRID} 米（字母 = 东西，数字 = 南北）  蓝 出生点  绿 巡逻点  橙 训练场  黄 备注  红 有问题的点位  方块越深越高</text></g></svg>`;
const svgPath = path.join(dir, 'topdown.svg'), png = path.join(dir, 'topdown.png');
fs.writeFileSync(svgPath, svg);
// 俯视图 SVG → PNG：开发机用 rsvg-convert，Mac 上没装、用 tools 自带的 sharp（#125）
if (process.platform === 'darwin') await (await import('sharp')).default(svgPath).png().toFile(png);
else execFileSync('rsvg-convert', ['-o', png, svgPath]);

fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ issues, overlaps, problems, size: [x1 - x0, z1 - z0], colliders: m.boxes.length }, null, 2));
for (const n of E.filter((e) => e.type === 'note')) console.log(`备注 ${n.id} (${n.x}, ${n.z})：${n.text || ''}`);
console.log(`地图 ${(x1 - x0).toFixed(0)}×${(z1 - z0).toFixed(0)}m，碰撞盒 ${m.boxes.length}，出生点 ${m.spawns.length}，巡逻点 ${m.nav.length}`);
console.log(`可到达面积 ${(reachable.size * G * G).toFixed(0)}m²（步行，含台阶和高台，不算跳跃）`);
console.log(`点位问题 ${issues.length} 条，碰撞盒穿插 ${overlaps.length} 处，页面报错 ${problems.length} 条`);
issues.slice(0, 8).forEach((t) => console.log(`  ${t}`));
overlaps.slice(0, 5).forEach((o) => console.log(`  穿插：盒 ${o.a} 和 ${o.b}，位置 (${o.at})，深度 ${o.depth}m`));
console.log(`俯视图: ${path.relative(process.cwd(), png)}`);
process.exit(issues.length || problems.length ? 1 : 0);
