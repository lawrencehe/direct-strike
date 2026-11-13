// #97 的针对性测试：出生点和出生保护
//   1. 出生点 6 个，每个出生点从地图中央、对面三个出生点看过来，头都被掩体挡住
//   2. 对决开局：NPC 出生在离玩家最远的点；玩家重生、NPC 重生都选离对方现在位置最远的点
//   3. 波次：NPC 都出生在离玩家远的那一半，位置不卡在掩体里
//   4. 玩家出生保护：不掉血、HUD 显示"出生保护"，到时间消失后正常掉血；开枪提前结束
//   5. NPC 出生保护：打不掉血（没有命中提示）、模型闪烁；到时间后恢复；NPC 开枪提前结束
// 用法（在仓库根目录）：node tools/tests/spawn-protect.mjs
// 截图在 tools/out/tests/：spawn-cover（南中出生点朝中央看）、spawn-npc（出生点上的 NPC，从掩体背后看）
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      if (game.player.alive) { game.player.update(step, game.input); game.camera.updateMatrixWorld(); game.weapon.update(step, game.input); }
      game.bots.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  window.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  window.farthest = (from) => Math.max(...game.world.spawns.map((s) => dist(s, from)));
});

// ---- 1. 出生点和掩体 ----
let r = await p.evaluate(() => {
  game.startMode('duel');
  const mgr = game.bots, S = game.world.spawns;
  const eye = (pt, y = 1.6) => new THREE.Vector3(pt.x, y, pt.z);
  const open = [];
  for (const s of S) {
    // 从地图中央（站在地上和站在平台上）、对面三个出生点看过来
    const from = [eye({ x: 0, z: 0 }), eye({ x: 0, z: 0 }, 3.0), ...S.filter((o) => Math.sign(o.z) !== Math.sign(s.z)).map((o) => eye(o))];
    for (const f of from) if (mgr.hasLineOfSight(f, eye(s, 1.7))) open.push([s.x, s.z, f.x, f.y, f.z]);
  }
  return { n: S.length, open };
});
check(r.n >= 4 && r.n <= 6, '出生点 4 ~ 6 个', r.n);
check(!r.open.length, '每个出生点：从中央和对面出生点都看不到站着的人头', r.open);

// ---- 2. 对决：离对方最远 ----
r = await p.evaluate(() => {
  game.startMode('duel');
  const bot = game.bots.bots[0], pl = game.player;
  const start = { d: dist(bot.pos, pl.position), max: farthest(pl.position) };
  // 玩家重生：NPC 跑到东北角附近，玩家应该在西南 / 南边
  bot.pos.set(12, 0, -17);
  const ps = game.bots.playerSpawn();
  const pRe = { d: dist(ps, bot.pos), max: farthest(bot.pos), at: [ps.x, ps.z] };
  // NPC 重生：玩家在西南角附近
  pl.position.set(-12, 0, 17);
  const b2 = game.bots.spawnBot(0.5, pl.position);
  const bRe = { d: dist(b2.pos, pl.position), max: farthest(pl.position), at: [b2.pos.x, b2.pos.z] };
  return { start, pRe, bRe };
});
check(Math.abs(r.start.d - r.start.max) < 1e-6, '对决开局：NPC 在离玩家最远的出生点', r.start);
check(Math.abs(r.pRe.d - r.pRe.max) < 1e-6, '玩家重生：离 NPC 现在的位置最远', r.pRe);
check(Math.abs(r.bRe.d - r.bRe.max) < 1e-6, 'NPC 重生：离玩家现在的位置最远', r.bRe);

// ---- 3. 波次 ----
r = await p.evaluate(() => {
  const old = Game.Config.bots.firstWave;
  Game.Config.bots.firstWave = 7;   // 人比出生点多，看会不会挤进掩体
  game.startMode('waves');
  Game.Config.bots.firstWave = old;
  const pl = game.player;
  return game.bots.bots.map((b) => ({ x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), d: +dist(b.pos, pl.position).toFixed(1), free: game.bots.isFree(b.pos) }));
});
check(r.length === 7 && r.every((b) => b.z < 0 && b.d > 35), '波次：NPC 都在离玩家远的北边', r);
check(r.every((b) => b.free), '波次：没有卡在掩体里', r.filter((b) => !b.free));

// ---- 4. 玩家出生保护 ----
r = await p.evaluate(() => {
  game.startMode('duel');
  const pl = game.player, bot = game.bots.bots[0];
  bot.update = () => false;   // NPC 别动
  const op = () => +document.getElementById('spawn-protect').style.opacity;
  tick(0.1);
  pl.takeDamage(50, bot.pos);
  const during = { hp: pl.health, hud: op(), protect: pl.protect };
  tick(1.3);
  const end = { hud: op(), protect: pl.protect };
  pl.takeDamage(50, bot.pos);
  const after = pl.health;
  // 开枪提前结束
  pl.reset(); tick(0.1);
  const before = pl.protect;
  game.weapon.onShot();
  return { during, end, after, before, shot: pl.protect, time: Game.Config.spawnProtect.time };
});
check(r.during.hp === 100 && r.during.hud > 0.9, '玩家出生保护中：不掉血、HUD 显示', r.during);
check(r.end.protect === 0 && r.end.hud === 0 && r.after === 50, '保护结束：HUD 消失、正常掉血', r);
check(r.before > 0 && r.shot === 0, '玩家开枪：出生保护提前结束', r);

// ---- 5. NPC 出生保护 ----
r = await p.evaluate(() => {
  game.startMode('duel');
  const bot = game.bots.bots[0];
  game.player.position.set(0, 0, 21);
  const res = bot.takeDamage(50, { part: 'body' });
  const vis = new Set();
  for (let i = 0; i < 30; i++) { tick(1 / 30); vis.add(bot.model.root.visible); }
  tick(0.4);
  const end = { protect: bot.protect, visible: bot.model.root.visible };
  const res2 = bot.takeDamage(50, { part: 'body' });
  // NPC 开枪提前结束
  const b2 = game.bots.spawnBot(0.5, game.player.position);
  const before = b2.protect;
  game.bots.fireRay(b2.pos.clone().setY(1.5), new THREE.Vector3(0, 0, 1), b2);
  return { res, blink: [...vis], end, hp: bot.health, killed: res2 && res2.killed, before, shot: b2.protect };
});
check(r.res === null, 'NPC 出生保护中：打不掉血（返回 null，没有命中提示）', r.res);
check(r.blink.includes(true) && r.blink.includes(false), 'NPC 出生保护中：模型闪烁', r.blink);
check(r.end.protect === 0 && r.end.visible && r.hp === 50, '保护结束：不再闪、正常掉血', r);
check(r.before > 0 && r.shot === 0, 'NPC 开枪：出生保护提前结束', r);

// 截图：出生点上的 NPC / 南中出生点朝中央看
await p.evaluate(() => {
  game.startMode('duel');
  const bot = game.bots.bots[0];
  bot.update = (dt) => { bot.protect = 0.9; bot.syncModel(dt); return false; };
  bot.protect = 0.9; bot.model.root.visible = true;
  game.player.alive = false;
  // 从围栏那一侧（掩体背后）看出生点上的 NPC
  const side = Math.sign(bot.pos.z), sx = Math.sign(bot.pos.x) || 1;
  game.camera.position.set(bot.pos.x - sx * 2.5, 1.7, bot.pos.z + side * 2.2);
  game.camera.lookAt(bot.pos.x, 1.0, bot.pos.z);
  game.camera.updateMatrixWorld();
});
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}spawn-npc.jpg`, type: 'jpeg', quality: 85 });
await p.evaluate(() => {
  game.startMode('duel');
  game.bots.bots[0].update = () => false;
  game.player.setSpawn(game.world.spawns[0]); game.player.reset();
  game.input.locked = true;   // 让真实游戏循环更新玩家和 HUD
});
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}spawn-cover.jpg`, type: 'jpeg', quality: 85 });

check(!g.problems.length, '没有页面报错', g.problems);
await g.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
