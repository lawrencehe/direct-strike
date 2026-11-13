// #54 的针对性测试：NPC 用和玩家同一套枪、随机挑；没看见玩家时边走边张望；搜索去推算位置和附近看不到的点
//   1. 所有枪下载完后，pickGuns 随机挑到的主 / 副武器覆盖 loadout 里的每一把
//   2. 拿 M4 + SG 的 NPC：手上是 glb 枪模（有 muzzle 节点），数值（弹匣、枪声）按那把枪；换成手枪也是 glb
//   3. 巡逻时视线会离开前进方向左右扫（最大偏离超过 30 度），不是一直盯着脚下
//   4. 刚听到枪声（确定玩家在哪）：直奔过去，视线和前进方向一致
//   5. 搜索：先去推算的位置；到了没人就去附近从当前位置看不到的点，去过的点不重复
// 玩家要"看不见、听不见"时放到地图外面（park）。这时不推玩家的 update：不然掉出地图会被拉回出生点，
// NPC 看见了就进 combat、把玩家打死，后面几项全乱（#90 起 NPC 形象随机，出没出事看运气）。
// 用法（在仓库根目录）：node tools/tests/npc-loadout-scan.mjs
// 截图在 tools/out/tests/：npc-m4（NPC 拿 M4）、npc-sg（NPC 拿 SG 手枪），看手是不是握在枪上
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

// 等所有枪下载完（main.js 在后台下载玩家没选的枪）
await p.evaluate(async () => {
  for (const slot of ['rifle', 'pistol']) {
    await Promise.all(Object.values(game.Config ? game.Config.loadout[slot] : Game.Config.loadout[slot]).map((x) => Game.GunModel.loadGun(x.model)));
  }
});

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('duel');
  window.parked = false;
  window.park = () => {
    window.parked = true;
    game.player.alive = true;
    game.player.position.set(400, 0, 400);
    game.camera.position.set(400, 1.6, 400); game.camera.updateMatrixWorld();
  };
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      if (!parked) game.player.update(step, game.input);
      game.camera.updateMatrixWorld();
      game.bots.update(step); game.grenades.update(step);
      game.input.endFrame();
    }
  };
  window.wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // 换一个指定装备的 NPC
  window.respawnWith = (guns, x = 0, z = 0) => {
    const m = game.bots;
    m.bots.forEach((b) => b.dispose());
    m.bots = [];
    m.pickGuns = () => guns;
    const b = m.spawnBot(0.5, null);
    b.pos.set(x, 0, z); b.updateBox();
    return b;
  };
  // 第 4、5 项用的一对巡逻点：起点 s、"听到 / 推算的位置" t，相距 8 ~ 20 米，中间一路通畅
  // （膝盖和胸口高度、左右各偏 0.4 米都看得通）。以前从 (0,0) 出发：那里在掩体里，NPC 被随机推到某一边，
  // 有时一头撞在墙上跑不动，测试时好时坏
  window.clearPair = (() => {
    const nav = game.world.navPoints, M = game.bots;
    const clear = (s, t) => {
      const dx = t.x - s.x, dz = t.z - s.z, len = Math.hypot(dx, dz), nx = -dz / len * 0.4, nz = dx / len * 0.4;
      return [0.4, 1.2].every((h) => [-1, 0, 1].every((k) =>
        M.hasLineOfSight(new THREE.Vector3(s.x + nx * k, h, s.z + nz * k), new THREE.Vector3(t.x + nx * k, h, t.z + nz * k))));
    };
    for (const s of nav) for (const t of nav) {
      const d = Math.hypot(t.x - s.x, t.z - s.z);
      if (d > 8 && d < 20 && clear(s, t)) return { s, t };
    }
    return null;
  })();
  // 在 clearPair 的起点放一个 NPC，玩家放到看不见、听不见的地方
  window.atStart = () => {
    const { s } = clearPair;
    const b = respawnWith({ rifle: 'ak', pistol: 'beretta' }, s.x, s.z);
    park();
    tick(0.3);   // 落地、进入巡逻
    b.pos.set(s.x, 0, s.z); b.vel.set(0, 0, 0); b.updateBox();
    return b;
  };
});
check(await p.evaluate(() => !!clearPair), '地图上找到一对中间通畅的巡逻点（第 4、5 项用）', await p.evaluate(() => clearPair));

// ---- 1. 随机挑枪 ----
let r = await p.evaluate(() => {
  const seen = { rifle: new Set(), pistol: new Set() };
  for (let i = 0; i < 200; i++) { const k = game.bots.pickGuns(); seen.rifle.add(k.rifle); seen.pistol.add(k.pistol); }
  return { rifle: [...seen.rifle].sort(), pistol: [...seen.pistol].sort(), all: { rifle: Object.keys(Game.Config.loadout.rifle).sort(), pistol: Object.keys(Game.Config.loadout.pistol).sort() } };
});
check(r.rifle.join() === r.all.rifle.join() && r.pistol.join() === r.all.pistol.join(), '200 次出生挑到了 loadout 里的每一把枪', r);

// ---- 2. M4 + SG ----
r = await p.evaluate(() => {
  const b = respawnWith({ rifle: 'm4', pistol: 'sg' });
  const glb = (gun) => !!gun.group.getObjectByName('body') && gun.muzzle.name === 'muzzle';
  return {
    rifleGlb: glb(b.model.guns.rifle), pistolGlb: glb(b.model.guns.pistol),
    sound: b.gun.rifle.sound, pistolSound: b.gun.pistol.sound, ammo: b.ammo.rifle, mag: Game.Config.loadout.rifle.m4.magSize ?? Game.Config.weapons.rifle.magSize,
    name: b.gun.rifle.name,
  };
});
check(r.rifleGlb && r.pistolGlb, 'NPC 手上是 glb 枪模（主副武器都是）', r);
check(r.name === 'M4' && r.sound === 'm4' && r.ammo === r.mag, '数值和枪声按 M4', r);

// 截图：NPC 拿 M4 / SG，镜头放在它斜前方
async function shot(name, weapon) {
  await p.evaluate((weapon) => {
    const b = game.bots.bots[0];
    b.update = () => false;
    const sp = game.world.spawns[0];
    b.pos.set(sp.x, 2, sp.z); b.yaw = 0; b.state = 'patrol'; b.vel.set(0, 0, 0);
    for (let i = 0; i < 120; i++) b.move(1 / 60, 0, 0, 0);   // 落到地上
    if (weapon === 'pistol') { b.weapon = 'pistol'; b.model.setWeapon('pistol'); }
    for (let i = 0; i < 30; i++) b.syncModel(1 / 60);
    game.player.alive = false;
    game.player.position.set(400, 0, 400);
    game.camera.position.set(b.pos.x + 0.75, b.pos.y + 1.55, b.pos.z - 1.05);
    game.camera.lookAt(b.pos.x, b.pos.y + 1.25, b.pos.z - 0.2);
    game.camera.updateMatrixWorld();
  }, weapon);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 85 });
}
await shot('npc-m4', 'rifle');
await shot('npc-sg', 'pistol');
await p.evaluate(() => { game.player.alive = true; });

// ---- 3. 巡逻张望 ----
r = await p.evaluate(() => {
  const b = respawnWith({ rifle: 'ak', pistol: 'beretta' }, 0, 0);
  park();   // 看不见、听不见
  const offs = [];
  for (let i = 0; i < 60 * 12; i++) {
    tick(1 / 60);
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > 1 && b.state === 'patrol' && b.detourTimer <= 0) {
      const moveYaw = Math.atan2(-b.vel.x, -b.vel.z);
      offs.push(Math.abs(wrap(b.yaw - moveYaw)) * 180 / Math.PI);
    }
  }
  offs.sort((a, b) => a - b);
  const pct = (q) => Math.round(offs[Math.floor(q * (offs.length - 1))] || 0);
  return { frames: offs.length, p50: pct(0.5), p90: pct(0.9), over30: +(offs.filter((o) => o > 30).length / (offs.length || 1)).toFixed(2), state: b.state };
});
// 偏离 = 张望；不能一直偏很大（那就是倒着走了），也不能一直是 0（一直盯着脚下）
check(r.frames > 120 && r.over30 > 0.15 && r.p50 < 75, '巡逻时边走边往左右看（有一部分时间视线偏离前进方向超过 30 度）', r);

// ---- 4. 听到枪声：直奔过去 ----
r = await p.evaluate(() => {
  const b = atStart();
  const pt = clearPair.t;   // "听到的位置"：从 NPC 那一路通畅
  // 先让 NPC 面朝那边：巡逻的朝向是随机的，背对着时 20 帧还没转过来，量到的是转身的滞后、不是张望
  b.yaw = Math.atan2(-(pt.x - b.pos.x), -(pt.z - b.pos.z));
  b.hear(new THREE.Vector3(pt.x, 0, pt.z));
  let maxOff = 0;
  for (let i = 0; i < 60; i++) {   // 1 秒，在 sureTime 内
    tick(1 / 60);
    if (i > 20 && Math.hypot(b.vel.x, b.vel.z) > 1 && b.detourTimer <= 0) {
      maxOff = Math.max(maxOff, Math.abs(wrap(b.yaw - Math.atan2(-b.vel.x, -b.vel.z))));
    }
  }
  return { state: b.state, maxOffDeg: Math.round(maxOff * 180 / Math.PI), speed: +Math.hypot(b.vel.x, b.vel.z).toFixed(2), run: Game.Config.bots.runSpeed };
});
check(r.state === 'search' && r.maxOffDeg < 25 && r.speed > r.run * 0.8, '刚听到枪声：跑过去、不张望', r);

// ---- 5. 搜索 ----
r = await p.evaluate(() => {
  const b = atStart();
  const pt = clearPair.t;
  b.lastSeen.set(pt.x, 0, pt.z); b.sinceSeen = 0;
  b.startSearch(b.lastSeen);
  const spots = [];
  let last = b.searchPos.clone();
  for (let i = 0; i < 60 * 10 && b.state === 'search'; i++) {
    tick(1 / 60);
    if (b.searchPos.distanceTo(last) > 0.5) {
      // 换点的这一刻检查：新点从 NPC 眼睛的位置看不到
      const eye = new THREE.Vector3(b.pos.x, 1.6, b.pos.z);
      spots.push({ x: b.searchPos.x, z: b.searchPos.z, hidden: !game.bots.hasLineOfSight(eye, new THREE.Vector3(b.searchPos.x, 1.2, b.searchPos.z)) });
      last = b.searchPos.clone();
    }
  }
  const origin = { x: pt.x, z: pt.z };
  const uniq = new Set(spots.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`)).size;
  return { end: [+b.pos.x.toFixed(1), +b.pos.z.toFixed(1)], state: b.state, stuck: b.stuckCount, spots, visited: b.searchVisited.length, uniq, origin, far: Math.max(0, ...spots.map((s) => Math.hypot(s.x - origin.x, s.z - origin.z))) };
});
check(r.visited >= 1 && r.spots.length >= 1, '到了推算位置没人：接着去下一个点', { visited: r.visited, spots: r.spots.length, end: r.end, origin: r.origin, state: r.state, stuck: r.stuck });
check(r.spots.every((s) => s.hidden), '下一个点从当前位置看不到', r.spots);
check(r.uniq === r.spots.length && r.far <= 12.01, '不重复、都在推算位置附近（searchRadius 以内）', { uniq: r.uniq, n: r.spots.length, far: r.far });

const errors = g.problems;
check(!errors.length, '没有页面报错', errors);
await g.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
