// v0.25：NPC 丢雷更像人、手雷按露出部位算伤害
//   1. 引信从出手开始算：飞在半空中到 fuse 秒（2 秒）也会炸
//   2. 掩体：全挡住不受伤，矮掩体只露头受 1/3，开阔地全额
//   3. 推算玩家位置：沿消失时的移动方向往前推，碰到墙停在墙前
//   4. 听声音：开枪后范围内的 NPC 知道玩家大概在哪，范围外的不知道
//   5. NPC 丢雷：各个方向、距离朝玩家丢，统计爆点离玩家多远、玩家掉多少血；丢不准就不丢
//   6. NPC 任何朝向出手，雷都不会卡在自己身上
// 用法：node tools/tests/npc-grenade.mjs
import { openGame } from '../lib/game-page.mjs';

const g = await openGame({ width: 800, height: 450 });
const p = g.page;
let fails = 0;
const check = (ok, name, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
  if (!ok) fails++;
};

await p.evaluate(() => {
  Game.Config.spawnProtect.time = 0;   // 这里测的是伤害本身，关掉出生保护（#97，单独测在 spawn-protect.mjs）
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('duel');
  window.bot = game.bots.bots[0];
  bot.realUpdate = bot.update;
  bot.update = () => false;
  bot.pos.set(30, 0, 30); bot.updateBox();
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec; t += step) {
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      game.bots.update(step); game.grenades.update(step);
      game.input.endFrame();
    }
  };
  tick(1);
  // 测试用的墙：加进 shootables（挡视线）和 colliders（挡雷）
  window.addWall = (x, z, w, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
    m.position.set(x, h / 2, z);
    m.updateMatrixWorld();
    game.scene.add(m);
    game.world.shootables.push(m);
    const box = new THREE.Box3().setFromObject(m);
    game.world.colliders.push(box);
    return () => {
      game.scene.remove(m);
      game.world.shootables.splice(game.world.shootables.indexOf(m), 1);
      game.world.colliders.splice(game.world.colliders.indexOf(box), 1);
    };
  };
  window.revive = () => { game.player.health = 100; game.player.alive = true; };
  window.blastAt = (x, z, owner) => {
    revive();
    game.grenades.launch('frag', new THREE.Vector3(x, 0.05, z), new THREE.Vector3(), 0.001, owner);
    game.grenades.update(1 / 60);
    return 100 - game.player.health;
  };
});

// ---- 1. 引信从出手开始算 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position;
    game.grenades.launch('frag', new THREE.Vector3(pp.x + 20, 1.5, pp.z), new THREE.Vector3(0, 24, 0), Game.Config.grenades.frag.fuse, bot);
    const gr = game.grenades.flying[game.grenades.flying.length - 1];
    let t = 0;
    while (!gr.done && t < 5) { game.grenades.update(1 / 60); t += 1 / 60; }
    return { t, y: gr.pos.y, fuse: Game.Config.grenades.frag.fuse };
  });
  check(Math.abs(r.t - r.fuse) < 0.05 && r.y > 5, `引信从出手算，飞在空中 ${r.fuse} 秒也炸`, `t=${r.t.toFixed(2)}s 爆炸高度=${r.y.toFixed(1)}m`);
}

// ---- 2. 掩体 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position.clone();
    const open = blastAt(pp.x + 3, pp.z, bot);
    let rm = addWall(pp.x + 1.5, pp.z, 0.3, 3, 4);
    const wall = blastAt(pp.x + 3, pp.z, bot);
    rm();
    rm = addWall(pp.x + 1.5, pp.z, 0.3, 0.7, 4);   // 爆点到头的视线在墙那里高 0.89m，到胸 0.61m
    const low = blastAt(pp.x + 3, pp.z, bot);
    rm();
    return { open, wall, low };
  });
  check(r.open > 50, '开阔地 3 米', `掉血 ${r.open.toFixed(0)}`);
  check(r.wall === 0, '高墙后面', `掉血 ${r.wall.toFixed(0)}`);
  check(r.low > 5 && r.low < r.open * 0.5, '矮掩体只露头，受伤约 1/3', `掉血 ${r.low.toFixed(0)}`);
}

// ---- 3. 推算玩家位置 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position.clone();
    bot.lastSeen.copy(pp);
    bot.sinceSeen = 0.6;
    bot.lastSeenVel.set(5, 0, 0);
    const free = bot.guessPlayer().x - pp.x;
    const rm = addWall(pp.x + 2.5, pp.z, 0.3, 3, 4);
    const blocked = bot.guessPlayer().x - pp.x;
    rm();
    bot.lastSeenVel.set(0, 0, 0);
    const still = bot.guessPlayer().distanceTo(pp);
    return { free, blocked, still };
  });
  const maxGo = 5 * 1.2;
  check(r.free > 4 && r.free <= maxGo + 0.01, '沿移动方向往前推', `推了 ${r.free.toFixed(2)}m`);
  check(r.blocked > 1 && r.blocked < 2.4, '碰到墙停在墙前', `推了 ${r.blocked.toFixed(2)}m（墙在 2.35m）`);
  check(r.still < 0.01, '站着不动就是原地', '');
}

// ---- 4. 听声音 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position.clone();
    bot.seesPlayer = false;
    bot.state = 'patrol';
    bot.pos.set(pp.x + 20, 0, pp.z); bot.updateBox();
    game.bots.hearPlayer(pp);
    const near = { state: bot.state, err: bot.lastSeen.distanceTo(pp) };
    bot.state = 'patrol';
    bot.pos.set(pp.x + 60, 0, pp.z); bot.updateBox();
    game.bots.hearPlayer(pp);
    return { near, far: bot.state };
  });
  check(r.near.state === 'search' && r.near.err <= 1.5, '20 米听见枪声去找', `误差 ${r.near.err.toFixed(2)}m`);
  check(r.far === 'patrol', '60 米听不见', '');
}

// ---- 5. NPC 丢雷 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position.clone();
    const out = [];
    for (let i = 0; i < 8; i++) for (const dist of [10, 16, 22]) {
      const ang = i * Math.PI / 4;
      revive();
      bot.pos.set(pp.x + Math.sin(ang) * dist, 0, pp.z + Math.cos(ang) * dist); bot.updateBox();
      bot.nades.frag = 1;
      bot.throwing = null;
      if (!bot.startThrow('frag', pp.clone())) { out.push({ ang: i, dist, skipped: true }); continue; }
      const th = bot.throwing;
      game.grenades.launch('frag', th.plan.pos, th.plan.vel, Game.Config.grenades.frag.fuse, bot);
      bot.throwing = null;
      bot.model.setWeapon(bot.weapon, true);
      const gr = game.grenades.flying[game.grenades.flying.length - 1];
      let last = gr.pos.clone();
      while (!gr.done) { last.copy(gr.pos); game.grenades.update(1 / 60); }
      out.push({ ang: i, dist, miss: Math.hypot(last.x - pp.x, last.z - pp.z), planned: th.plan.miss, dmg: 100 - game.player.health });
    }
    return out;
  });
  for (const t of r) {
    console.log(`  方向${t.ang} 距离${t.dist}m ` + (t.skipped ? '预演丢不准，不丢' : `爆点离玩家 ${t.miss.toFixed(1)}m（预演 ${t.planned.toFixed(1)}m） 掉血 ${t.dmg.toFixed(0)}`));
  }
  const thrown = r.filter((t) => !t.skipped);
  const hits = thrown.filter((t) => t.dmg >= 40).length;
  const worst = Math.max(...thrown.map((t) => t.miss));
  const drift = Math.max(...thrown.map((t) => Math.abs(t.miss - t.planned)));
  check(thrown.length >= r.length * 0.7, '大部分位置能丢', `${thrown.length}/${r.length}`);
  check(hits >= thrown.length * 0.8, '丢出去的大部分掉血 40 以上', `${hits}/${thrown.length}`);
  check(worst <= 4, '爆点都在 4 米内', `最远 ${worst.toFixed(1)}m`);
  check(drift < 0.6, '预演和实际一致', `最大差 ${drift.toFixed(2)}m`);
}

// ---- 6. 雷不会卡在 NPC 自己身上 ----
{
  const r = await p.evaluate(() => {
    const pp = game.player.position.clone();
    let worst = Infinity;
    for (let i = 0; i < 24; i++) {
      const yaw = i * Math.PI / 12;
      bot.pos.set(pp.x + 8, 0, pp.z + 8); bot.updateBox(); bot.yaw = yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const pos = new THREE.Vector3(bot.pos.x + fx * 0.35 - fz * 0.15, 1.55, bot.pos.z + fz * 0.35 + fx * 0.15);
      game.grenades.launch('smoke', pos, new THREE.Vector3(fx * 10, 6, fz * 10), 0.6, bot);
      const gr = game.grenades.flying[game.grenades.flying.length - 1];
      while (!gr.done) game.grenades.update(1 / 60);
      worst = Math.min(worst, Math.hypot(gr.pos.x - bot.pos.x, gr.pos.z - bot.pos.z));
    }
    game.grenades.clear();
    return worst;
  });
  check(r > 3, '各个朝向出手都飞出去了', `离 NPC 最近 ${r.toFixed(2)}m`);
}

// ---- 7. 真实 AI 跑一段，没有报错 ----
{
  const r = await p.evaluate(() => {
    bot.update = bot.realUpdate;
    revive();
    bot.pos.set(game.player.position.x + 15, 0, game.player.position.z); bot.updateBox();
    tick(6);
    return bot.state;
  });
  check(true, '真实 AI 跑 6 秒', `状态 ${r}`);
}

check(g.problems.length === 0, '控制台没有报错', g.problems.join('\n'));
await g.close();
process.exit(fails ? 1 : 0);
