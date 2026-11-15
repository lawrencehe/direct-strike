// 狙击枪的针对性测试（#110）
//   1. 买狙击枪：换上狙击枪，5 发，枪模拆成了 body / mag / bolt / muzzle
//   2. 不开镜没有准星；右键开镜：视野缩小 zoom 倍、灵敏度和移动速度降低、镜框显示、枪模藏起来、散布变成开镜散布
//   3. 开一枪：立刻退出镜子、开始拉栓（枪栓往后拉），拉完自动回到镜里
//   4. 打身体一枪死；换弹退出镜子、换完不自动回去；切枪 / 死了视野恢复
//   5. 子弹按狙击枪自己的价格算；NPC 永远不拿狙击枪
// 用法（在仓库根目录）：node tools/tests/sniper.mjs
// 截图在 tools/out/tests/：sniper-hip（不开镜）、sniper-scope（开镜）、sniper-bolt（拉栓中）、sniper-reload（换弹中）
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}sniper-${name}.jpg`, type: 'jpeg', quality: 85 }); };

await p.evaluate(async () => {
  await Game.GunModel.loadGun(Game.Config.loadout.rifle.sniper.model);
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('duel');
  for (const b of game.bots.bots) { b.pos.set(30, 0, 30); b.update = () => false; }
  window.press = (c) => game.input.pressed.add(c);
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      if (game.player.alive) game.economy.update(step);
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) game.weapon.update(step, game.input);
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  window.state = () => {
    const w = game.weapon, gun = w.guns.rifle;
    return {
      current: w.current, key: gun.key, ammo: gun.ammo, fov: +game.camera.fov.toFixed(2), scopeT: +w.scopeT.toFixed(2),
      scope: game.hud.el.scope.classList.contains('on'), crosshair: !game.hud.el.crosshair.classList.contains('off'),
      gunVisible: gun.model.visible, spread: +w.currentSpread().toFixed(4), look: +game.player.lookScale.toFixed(3),
      speed: +game.player.speedScale.toFixed(2), bolt: +(gun.bolt.position.z - gun.boltHome.z).toFixed(4),
    };
  };
  game.player.position.copy(game.player.spawn);
  game.player.yaw = Math.PI * 0.75;
  tick(0.3);
});

// ---- 1. 买狙击枪 ----
let r = await p.evaluate(() => {
  const before = game.economy.money;
  game.economy.buy('sniper');
  tick(0.6);
  const gun = game.weapon.guns.rifle;
  return { ...state(), paid: before - game.economy.money, parts: ['body', 'mag', 'bolt', 'muzzle'].map((n) => !!gun.model.getObjectByName(n)) };
});
check(r.current === 'rifle' && r.key === 'sniper' && r.ammo === 5, '买到狙击枪，枪里 5 发', r);
check(r.paid === 1800, '狙击枪 $1800', r.paid);
check(r.parts.every(Boolean), '枪模有 body / mag / bolt / muzzle', r.parts);
check(!r.crosshair && !r.scope, '不开镜：没有准星、没有镜框', r);
const hip = r;
await shot('hip');

// ---- 2. 开镜 ----
r = await p.evaluate(() => { press('Mouse2'); tick(0.3); return state(); });
const base = await p.evaluate(() => Game.Config.view.fov);
const want = 2 * Math.atan(Math.tan(base * Math.PI / 360) / 4) * 360 / Math.PI / 2;
check(Math.abs(r.fov - want) < 0.1, `开镜视野 ${base}° → ${want.toFixed(2)}°`, r.fov);
check(r.scope && !r.gunVisible && !r.crosshair, '开镜：镜框显示、枪模藏起来', r);
check(r.spread < hip.spread / 10, '开镜散布远小于不开镜', { hip: hip.spread, scope: r.spread });
check(r.look < 0.3 && r.speed < 1, '开镜：灵敏度、移动速度降低', r);
await shot('scope');

// ---- 3. 开一枪：退出镜子、拉栓，拉完回到镜里 ----
r = await p.evaluate(() => {
  press('Mouse0'); tick(1 / 60);
  const a = state();
  tick(0.45);
  const b = state();
  return { a, b };
});
check(r.a.ammo === 4 && !r.a.scope && r.a.fov === base, '开枪后立刻退出镜子', r.a);
check(r.b.bolt > 0.03, '拉栓：枪栓往后拉', r.b.bolt);
await shot('bolt');
r = await p.evaluate(() => { tick(1.2); return state(); });
check(r.scope && r.bolt < 0.001, '拉完栓自动回到镜里', r);

// ---- 4. 打身体一枪死；换弹退出镜子；切枪恢复 ----
r = await p.evaluate(() => {
  const bot = game.bots.bots[0];
  if (bot) bot.protect = 0;
  const res = bot ? bot.takeDamage(Game.Config.weapons.rifle.damage.body, { part: 'body', point: bot.pos.clone(), dir: new THREE.Vector3(0, 0, 1), force: 1 }) : null;
  return { killed: res && res.killed, dmg: Game.Config.weapons.rifle.damage };
});
check(r.killed, '打身体一枪死', r);
r = await p.evaluate(() => {
  game.weapon.addAmmo('rifle', 5);
  press('KeyR'); tick(0.8);
  return state();
});
check(!r.scope && r.fov === base, '换弹退出镜子', r);
await shot('reload');
r = await p.evaluate(() => { tick(3); return state(); });
check(r.ammo === 5 && !r.scope, '换完弹不自动回到镜里', r);
r = await p.evaluate(() => { press('Mouse2'); tick(0.3); const a = state(); press('Digit2'); tick(0.6); return { a, b: state() }; });
check(r.a.scope && !r.b.scope && r.b.fov === base && r.b.crosshair && r.b.look === 1, '切到手枪：退出镜子、准星回来', r.b);
r = await p.evaluate(() => {
  press('Digit1'); tick(0.6); press('Mouse2'); tick(0.3);
  const a = state();
  game.weapon.onPlayerDeath();
  return { a, b: state() };
});
check(r.a.scope && !r.b.scope && r.b.fov === base, '死了视野恢复', r.b);

// ---- 5. 子弹价格、NPC 不拿 ----
r = await p.evaluate(() => {
  game.startMode('duel');
  game.economy.money = 4000;
  game.economy.buy('sniper');
  const price = game.economy.price('rifle');
  const picks = new Set();
  for (let i = 0; i < 300; i++) picks.add(game.bots.pickGuns().rifle);
  return { price, picks: [...picks] };
});
check(r.price === 50, '狙击枪一个弹匣 5 发 $50', r.price);
check(!r.picks.includes('sniper'), 'NPC 不拿狙击枪', r.picks);

const problems = g.problems.filter((x) => !/favicon/.test(x));
check(problems.length === 0, '控制台没有报错', problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
