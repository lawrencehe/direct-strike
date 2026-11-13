// #60 的针对性测试：中弹反应
//   1. 玩家被枪打中：镜头上抬、往远离攻击者的一侧歪，慢慢回正；硬直 stunBullet 秒
//   2. 硬直时按住 W 走不动、扣扳机打不出；硬直完恢复（拿步枪按住开火；出生只有手枪，#90，测试里直接给上步枪）
//   3. 硬直完的免疫：紧接着再中弹不再硬直；手雷不受免疫限制，硬直按伤害算
//   4. HUD：四角溅血显出来再淡掉；血条掉的那一截先留着再缩到当前血量；血量数字闪一下
//   5. NPC 被打中：硬直（站住、不开枪），上半身顺着子弹方向往后一缩再回来；硬直完接着打
// 用法（在仓库根目录）：node tools/tests/hit-reaction.mjs
// 截图在 tools/out/tests/：hit-player（玩家刚中弹的画面）、hit-npc（NPC 往后缩到最大时）
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
  game.startMode('duel');
  window.bot = game.bots.bots[0];
  bot.realUpdate = bot.update;
  bot.update = () => false;
  bot.pos.set(30, 0, 30); bot.updateBox();
  window.press = (c) => game.input.pressed.add(c);
  window.hold = (c) => game.input.down.add(c);
  window.release = (c) => game.input.down.delete(c);
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      if (game.player.alive) game.economy.update(step);   // 顺序和 main.js 一样：economy 在 player、weapon 之前
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) game.weapon.update(step, game.input);
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  window.shots = 0;
  const f = game.weapon.fire.bind(game.weapon);
  game.weapon.fire = (gun) => { shots++; f(gun); };
  // 攻击者在玩家左边 5 米（玩家朝 -z，左边是 -x）
  window.leftOf = () => { const pl = game.player; return new THREE.Vector3(pl.position.x - Math.cos(pl.yaw) * 5, 0, pl.position.z + Math.sin(pl.yaw) * 5); };
  // 重生后出生只有手枪（#90），这里给上主武器：第 2 项按住开火要用全自动的步枪
  window.fresh = () => {
    game.player.reset(); game.weapon.respawn(); game.hud.setHealth(100, 100);
    game.weapon.hasRifle = true; game.weapon.equipNow('rifle'); game.weapon.refreshHud();
    tick(1);
  };
  tick(0.5);
});

// ---- 1. 镜头和硬直 ----
let r = await p.evaluate(() => {
  fresh();
  const pl = game.player;
  pl.takeDamage(34, leftOf());
  const at0 = { stun: pl.stun, pitch: pl.punchPitch, roll: pl.punchRoll };
  tick(1);
  return { at0, after: { pitch: pl.punchPitch, roll: pl.punchRoll, stun: pl.stun }, cfg: Game.Config.hitReaction.stunBullet };
});
check(Math.abs(r.at0.stun - r.cfg) < 1e-6, '枪打中硬直 stunBullet 秒', r.at0);
check(r.at0.pitch > 0.01 && r.at0.roll < -0.01, '镜头上抬、往右歪（攻击者在左边）', r.at0);
check(Math.abs(r.after.pitch) < 0.002 && Math.abs(r.after.roll) < 0.002 && r.after.stun === 0, '1 秒后镜头回正、硬直结束', r.after);
await p.evaluate(() => { fresh(); game.player.takeDamage(34, leftOf()); tick(2 / 60); });
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}hit-player.jpg`, type: 'jpeg', quality: 85 });

// ---- 2. 硬直时走不动、打不出 ----
r = await p.evaluate(() => {
  fresh();
  const pl = game.player;
  pl.takeDamage(34, leftOf());
  const p0 = pl.position.clone();
  shots = 0;
  hold('KeyW'); hold('Mouse0'); press('Mouse0');
  tick(0.15);
  const during = { moved: +pl.position.distanceTo(p0).toFixed(3), shots };
  tick(0.4);
  const after = { moved: +pl.position.distanceTo(p0).toFixed(3), shots };
  release('KeyW'); release('Mouse0'); tick(0.2);
  return { during, after };
});
check(r.during.moved < 0.02 && r.during.shots === 0, '硬直中按住 W 走不动、扣扳机打不出', r.during);
check(r.after.moved > 0.5 && r.after.shots > 0, '硬直完能走、能开枪', r.after);

// ---- 3. 免疫和手雷 ----
r = await p.evaluate(() => {
  fresh();
  const pl = game.player, c = Game.Config.hitReaction;
  pl.takeDamage(10, leftOf());
  tick(0.25);   // 硬直 0.18 秒已经结束，还在免疫期
  pl.takeDamage(10, leftOf());
  const immune = pl.stun;
  tick(1);
  pl.takeDamage(10, leftOf());
  const again = pl.stun;
  tick(0.25);
  pl.takeDamage(60, leftOf(), { explosion: true });
  return { immune, again, nade: pl.stun, want: Math.min(c.stunMax, 60 * c.stunPerDamage) };
});
check(r.immune === 0, '硬直刚结束又中弹：不再硬直（免疫）', r);
check(r.again > 0, '免疫期过了：再中弹又硬直', r);
check(Math.abs(r.nade - r.want) < 1e-6, '手雷：不受免疫限制，硬直按伤害算', r);

// ---- 4. HUD ----
r = await p.evaluate(() => {
  fresh();
  const pl = game.player, el = (id) => document.getElementById(id);
  const w = (id) => parseFloat(el(id).style.width);
  pl.takeDamage(40, leftOf());
  tick(1 / 60);
  const blood0 = +el('damage-blood').style.opacity, pop = el('health-val').classList.contains('hit');
  tick(0.3);
  const mid = { bar: w('health-bar'), trail: w('health-trail') };
  tick(2.5);
  return { blood0, pop, mid, end: { bar: w('health-bar'), trail: w('health-trail'), blood: +el('damage-blood').style.opacity } };
});
check(r.blood0 > 0.5, '中弹：四角溅血显出来', r.blood0);
check(r.pop, '血量数字闪一下', r.pop);
check(r.mid.bar === 60 && r.mid.trail === 100, '0.3 秒时血条已经掉到 60%，掉的那一截还留着', r.mid);
check(r.end.trail === r.end.bar && r.end.blood === 0, '过一会儿那一截缩回去、血迹淡完', r.end);

// ---- 5. NPC ----
r = await p.evaluate(() => {
  game.player.reset(); tick(0.1);
  const pl = game.player;
  bot.update = bot.realUpdate;
  bot.pos.set(pl.position.x, 0, pl.position.z - 10); bot.updateBox(); bot.vel.set(0, 0, 0);
  bot.yaw = Math.atan2(-(pl.position.x - bot.pos.x), -(pl.position.z - bot.pos.z));
  bot.alertTimer = 3;
  // NPC 子弹别打到玩家（不然玩家硬直、可能死）：只数它开了几枪
  let botShots = 0;
  const mgr = game.bots, fr = mgr.fireRay.bind(mgr);
  mgr.fireRay = () => { botShots++; };
  tick(2);   // 发现玩家、开始交火
  const before = botShots;
  const head = bot.model.bones.head;
  const h0 = head ? head.getWorldPosition(new THREE.Vector3()) : null;
  // 子弹从玩家那边打过来：方向是玩家 → NPC
  const dir = bot.pos.clone().sub(pl.position).setY(0).normalize();
  bot.takeDamage(34, { part: 'body', dir, point: bot.pos.clone().setY(1.2) });
  const stun0 = bot.stun;
  const p0 = bot.pos.clone();
  tick(0.06);
  const h1 = head ? head.getWorldPosition(new THREE.Vector3()) : null;
  const lean = h0 ? +h1.clone().sub(h0).dot(dir).toFixed(3) : null;
  tick(0.1);
  const during = { shots: botShots - before, moved: +bot.pos.distanceTo(p0).toFixed(3) };
  const at = botShots;
  tick(2);
  mgr.fireRay = fr;
  return { stun0, lean, during, after: botShots - at, flinch: bot.model.flinchAmt, state: bot.state, hp: bot.health };
});
check(Math.abs(r.stun0 - 0.18) < 1e-6, 'NPC 被打中硬直', r);
check(r.lean === null || r.lean > 0.02, 'NPC 头顺着子弹方向往后缩', r.lean);
check(r.during.shots === 0 && r.during.moved < 0.25, 'NPC 硬直中不开枪、站住（横移中被打，刹住要滑一点）', r.during);
check(r.after > 0 && r.flinch === 0, '硬直完接着打，缩完回原样', r);

// NPC 缩到最大时截图
await p.evaluate(() => {
  const pl = game.player;
  bot.update = () => false;
  for (let i = 0; i < 20; i++) bot.syncModel(1 / 60);
  const dir = bot.pos.clone().sub(pl.position).setY(0).normalize();
  bot.model.flinch(dir, 1, 'body');
  bot.syncModel(0.06);
  pl.alive = false;
  game.camera.position.set(bot.pos.x + 2.2, 1.5, bot.pos.z + 0.3);
  game.camera.lookAt(bot.pos.x, 1.1, bot.pos.z);
  game.camera.updateMatrixWorld();
});
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}hit-npc.jpg`, type: 'jpeg', quality: 85 });

check(!g.problems.length, '没有页面报错', g.problems);
await g.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
