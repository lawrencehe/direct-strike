// #92 的针对性测试：NPC 寻路（js/nav.js，格子 + A*）
//   1. 寻路格子建好了，耗时多少（开发机没有 GPU，只看数量级）
//   2. 负责人遇到的死角：卡车（TR1）和集装箱 C5 拼成的 L 形凹角，NPC 在角里、要去的地方在另一侧。
//      先关掉寻路（mgr.nav = null，等于原来的直线走 + 卡住绕一下）跑一遍，应该卡在角里；再开着寻路跑，应该走到
//      再按 #92 原来的复现方法（从 (0,0) 掩体里出发）走 5 次
//   3. 算出的路线：每一段直线都走得通，绕开 C5，不穿墙
//   4. 能算到中央平台顶上（走楼梯），路线的高度一路按台阶上去
//   5. 随机抽 N 对能走到的点，NPC 按搜索走过去，都要在限定时间内到（统计成功率和耗时）
// 玩家放到地图外面（看不见、听不见），不推玩家的 update（同 npc-loadout-scan.mjs）。
// 用法（在仓库根目录）：node tools/tests/npc-nav.mjs
// 截图在 tools/out/tests/npc-nav-corner.jpg：俯视看 NPC 绕出死角后的位置
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 960, height: 540 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('duel');
  Game.Config.bots.searchTime = 60;      // 测试里不让搜索中途结束
  Game.Config.bots.grenadeChance = 0;
  const park = () => {
    game.player.alive = true;
    game.player.position.set(400, 0, 400);
    game.camera.position.set(400, 1.6, 400); game.camera.updateMatrixWorld();
  };
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      game.camera.updateMatrixWorld();
      game.bots.update(step);
      game.input.endFrame();
    }
  };
  // 放一个 NPC 在 (x, z)，搜索去 (tx, tz)，最多 limit 秒；返回走到没有、用了多久、最后在哪
  window.walk = (x, z, tx, tz, limit = 20) => {
    const m = game.bots;
    m.bots.forEach((b) => b.dispose());
    m.bots = [];
    m.pickGuns = () => ({ rifle: 'ak', pistol: 'beretta' });
    park();
    const b = m.spawnBot(0.5, null);
    b.protect = 0;
    b.pos.set(x, 0, z); b.vel.set(0, 0, 0); b.updateBox();
    b.reachedSpot = (d) => d < 1;   // 必须真走到（原逻辑 5 米内看得见就算查看过，会转去别的搜索点）
    b.startSearch(new THREE.Vector3(tx, 0, tz));
    b.sinceSeen = 0;
    let t = 0;
    const done = () => Math.hypot(b.pos.x - tx, b.pos.z - tz) < 2;
    while (t < limit && !done()) { tick(0.25); t += 0.25; }
    return { ok: done(), t, at: [+b.pos.x.toFixed(2), +b.pos.z.toFixed(2)], state: b.state };
  };
});

// 1. 格子
const info = await p.evaluate(() => ({ nodes: game.bots.nav.count, ms: +game.bots.nav.buildMs.toFixed(0) }));
check(info.nodes > 5000, '寻路格子建好了', info);

// 2. 死角：卡车 x 14.25~16.75, z -8.15~-0.45；C5 x 8.5~14.5, z -1.22~1.22，拼成朝西北开口的 L 形角。
//    NPC 在角里 (13.8, -1.6)，要去东南方向 C5 另一侧的 (16, 3)：直线方向正对着角
const corner = { x: 13.8, z: -1.6, tx: 16, tz: 3 };
const before = await p.evaluate((c) => {
  const nav = game.bots.nav;
  game.bots.nav = null;   // 关掉寻路 = 原来的直线走
  const r = walk(c.x, c.z, c.tx, c.tz, 15);
  game.bots.nav = nav;
  return r;
}, corner);
check(!before.ok, '对照：不寻路时 NPC 卡在死角里（复现 bug）', before);
const after = await p.evaluate((c) => walk(c.x, c.z, c.tx, c.tz, 15), corner);
check(after.ok, '寻路：NPC 绕出死角走到另一侧', after);
await p.evaluate(() => {
  game.camera.position.set(12, 22, 0); game.camera.lookAt(12, 0, 0.5); game.camera.updateMatrixWorld();
});
await p.waitForTimeout(800);
await p.screenshot({ path: OUT + 'npc-nav-corner.jpg', type: 'jpeg', quality: 80 });

// 2b. #92 原来的复现：(0, 0) 在掩体里，NPC 出生后被随机推到某一边，去 (-9, 16.5)，以前有时贴着掩体一直不动
const orig = [];
for (let k = 0; k < 5; k++) orig.push(await p.evaluate(() => walk(0, 0, -9, 16.5, 20)));
check(orig.every((r) => r.ok), '#92 原复现：从 (0,0) 出发 5 次都走到 (-9, 16.5)', orig.map((r) => r.ok ? r.t : r.at));

// 3. 路线本身
const route = await p.evaluate((c) => {
  const nav = game.bots.nav;
  const path = nav.findPath({ x: c.x, y: 0, z: c.z }, { x: c.tx, y: 0, z: c.tz });
  if (!path) return null;
  let a = { x: c.x, y: 0, z: c.z }, clear = true;
  for (const q of path) {
    // 第一段从 NPC 实际位置出发，它可能比算路的半径更贴墙，用实际半径查
    if (!nav.walkable(a.x, a.y, a.z, q.x, q.z) && !(a.x === c.x && nav.standAt(q.x, q.z, 0) !== null)) clear = false;
    a = q;
  }
  const westOfC5 = path.some((q) => q.x < 8.6);   // 往西绕过 C5 的西头（东边卡车和墙之间太窄）
  return { n: path.length, clear, westOfC5, path: path.map((q) => [+q.x.toFixed(1), +q.z.toFixed(1)]) };
}, corner);
check(route && route.clear && route.westOfC5, '路线每段走得通、从 C5 西头绕过去', route);

// 4. 中央平台顶上（训练场出生点 R1 在平台上）
const plat = await p.evaluate(() => {
  const r = game.world.rangeSpawn, nav = game.bots.nav;
  const t0 = performance.now();
  const path = nav.findPath({ x: 0, y: 0, z: -12 }, { x: r.x, y: r.y, z: r.z }, 1);
  const ms = performance.now() - t0;
  return path && { end: +path[path.length - 1].y.toFixed(2), want: r.y, n: path.length, ms: +ms.toFixed(1) };
});
check(plat && Math.abs(plat.end - plat.want) < 0.2, '能算到中央平台顶上（走楼梯）', plat);

// 5. 随机点对：从能走到的节点里抽，8 米以上
const N = 16;
const pairs = await p.evaluate((N) => {
  const nav = game.bots.nav, out = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (out.length < N) {
    const a = Math.floor(rnd() * nav.count), b = Math.floor(rnd() * nav.count);
    if (nav.nh[a] > 0.05 || nav.nh[b] > 0.05) continue;   // 都在地面上
    const P = (n) => ({ x: nav.x0 + nav.ni[n] * nav.cell, z: nav.z0 + nav.nj[n] * nav.cell });
    const A = P(a), B = P(b);
    if (Math.abs(A.x) > 17 || Math.abs(B.x) > 17 || Math.abs(A.z) > 23 || Math.abs(B.z) > 23) continue;   // 场地里面
    if (Math.hypot(A.x - B.x, A.z - B.z) < 8) continue;
    if (!nav.findPath({ ...A, y: 0 }, { ...B, y: 0 })) continue;
    out.push([A.x, A.z, B.x, B.z]);
  }
  return out;
}, N);
let ok = 0;
const slow = [];
for (const [x, z, tx, tz] of pairs) {
  const r = await p.evaluate(([x, z, tx, tz]) => walk(x, z, tx, tz, 30), [x, z, tx, tz]);
  if (r.ok) ok++; else slow.push({ from: [x, z], to: [tx, tz], ...r });
}
check(ok === N, `随机 ${N} 对点 NPC 都走到了`, { ok, fail: slow });

const ms = await p.evaluate(() => {
  const nav = game.bots.nav, t0 = performance.now();
  for (let k = 0; k < 20; k++) nav.findPath({ x: -15, y: 0, z: -21 }, { x: 15, y: 0, z: 21 });
  return +((performance.now() - t0) / 20).toFixed(1);
});
console.log('对角穿过整张图算一次路', ms, 'ms（开发机）');

check(g.problems.length === 0, '控制台没有报错', g.problems);
await g.close();
console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
