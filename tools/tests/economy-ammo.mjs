// #7 的针对性测试：开局 / 重生的钱、限量子弹、买子弹、NPC 子弹打空。按 #90 更新过（出生只有手枪，钱数读 config 的 economy）
//   1. 对决开局：startMoney，只有手枪 10 + 0，手雷 1、闪光 0、烟雾 0；弹药显示 "10 / 0"
//   2. 打空没备弹（测试里直接给上 AK）：不自动换弹，R 也换不了，扣扳机咔一声；武器栏那一格变暗
//   3. 出生点按 B、弹药分类、1 买 AK 一个弹匣（$60），空枪自动换上；带满 3 个弹匣后买不了；离上限不到一个弹匣只补到上限、按发收钱
//   4. 手枪一个弹匣 10 发 $20
//   5. 重生：钱不足 startMoney 补到 startMoney，多的保留；主武器没了，子弹回到开局
//   6. 波次补给：子弹至少补到开局、枪里换满，多买的不收走
//   7. NPC：子弹开局和玩家一样（一个弹匣、没备弹），一定有主武器；两把枪都打空了不再换弹、背离玩家跑开
//   8. 训练场：备弹无限，显示 ∞
// 用法（在仓库根目录）：node tools/tests/economy-ammo.mjs
// 截图在 tools/out/tests/：ammo-buy-menu（B 购买面板）、ammo-empty（打空没备弹）
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
  for (const b of game.bots.bots) { b.pos.set(30, 0, 30); b.update = () => false; }
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
  window.sounds = [];
  const a = game.weapon.audio;
  for (const n of ['empty', 'purchase', 'denied']) { const f = a[n].bind(a); a[n] = () => { sounds.push(n); f(); }; }
  window.ammo = (s) => { const x = game.weapon.guns[s]; return [x.ammo, x.reserve]; };
  window.hudAmmo = () => document.getElementById('ammo-cur').textContent + ' ' + document.getElementById('ammo-max').textContent;
  // 在 B 菜单里买子弹：菜单没开就按 B 开，再按弹药分类（#90 起是 3）、按 code（1 AK / 2 手枪）。买完菜单不关（#81）
  const ammoCat = `Digit${Game.Config.economy.categories.findIndex((c) => c.items.includes('rifle')) + 1}`;
  window.buy = (code) => {
    if (game.economy.menu !== 'classic') { press('KeyB'); tick(1 / 60); }
    press(ammoCat); tick(1 / 60); press(code); tick(1 / 60);
  };
});
const S = await p.evaluate(() => Game.Config.economy.startMoney);   // 开局的钱

// ---- 1. 开局 ----
let r = await p.evaluate(() => ({
  money: game.economy.money, hasRifle: game.weapon.hasRifle, current: game.weapon.current, pistol: ammo('pistol'), counts: { ...game.weapon.counts }, hud: hudAmmo(),
}));
check(r.money === S, `开局 $${S}`, r.money);
check(!r.hasRifle && r.current === 'pistol' && r.pistol.join() === '10,0', '只有手枪，枪里一个弹匣，没有备弹（手枪 10 发）', r);
check(r.counts.frag === 1 && r.counts.flash === 0 && r.counts.smoke === 0, '开局一枚手雷，闪光烟雾没有', r.counts);
check(r.hud === '10 / 0', '弹药显示 "枪里 / 备弹"', r.hud);

// ---- 2. 打空没备弹 ----
r = await p.evaluate(() => {
  const w = game.weapon;
  w.hasRifle = true; w.equipNow('rifle'); w.refreshHud();   // 给上主武器（30 + 0）
  hold('Mouse0'); press('Mouse0'); tick(4); release('Mouse0'); tick(0.3);
  const after = { ammo: ammo('rifle'), reloading: w.reloading };
  press('KeyR'); tick(0.2);
  const afterR = w.reloading;
  sounds.length = 0;
  press('Mouse0'); tick(1 / 60); press('Mouse0'); tick(1 / 60);
  const rifleSlot = document.querySelectorAll('#weapons .slot')[0].classList.contains('empty');
  return { after, afterR, clicks: sounds.filter((s) => s === 'empty').length, rifleSlot, hud: hudAmmo() };
});
check(r.after.ammo.join() === '0,0' && !r.after.reloading, '打空了没备弹：不自动换弹', r.after);
check(!r.afterR, '没备弹按 R 也换不了', r.afterR);
check(r.clicks === 2, '没子弹扣扳机咔一声（按一下响一下）', r.clicks);
check(r.rifleSlot && r.hud === '0 / 0', '一发都没了：武器栏那一格变暗', r);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}ammo-empty.jpg`, type: 'jpeg', quality: 85 });

// ---- 3. 买 AK 子弹 ----
r = await p.evaluate(() => {
  const e = game.economy, pl = game.player, w = game.weapon;
  pl.position.copy(pl.spawn); tick(0.1);
  sounds.length = 0;
  buy('Digit1');
  const one = { money: e.money, rifle: ammo('rifle'), open: e.open, current: w.current, pending: w.pending, reloading: w.reloading };
  tick(2);
  const loaded = ammo('rifle');
  buy('Digit1'); buy('Digit1');
  const full = { money: e.money, rifle: ammo('rifle') };
  buy('Digit1');   // 满了，买不了，面板照样开着
  const denied = { money: e.money, open: e.open, sounds: [...sounds] };
  press('KeyB'); tick(1 / 60);   // 关面板
  // 离上限不到一个弹匣：只补到上限，按发收钱
  w.guns.rifle.reserve = 55;      // 30 + 55 = 85，差 5 发
  buy('Digit1');
  const partial = { money: e.money, rifle: ammo('rifle') };
  return { one, loaded, full, denied, partial };
});
check(r.one.money === S - 60 && r.one.rifle.join() === '0,30', '买 AK 一个弹匣 $60，进备弹', r.one);
check(r.one.current === 'rifle' && !r.one.pending && r.one.open, '买成功面板不关（#81），不切枪', r.one);
check(r.loaded.join() === '30,0', '空枪买到子弹自动换上', r.loaded);
check(r.full.money === S - 180 && r.full.rifle.join() === '30,60', '最多 3 个弹匣（含枪里那个）', r.full);
check(r.denied.money === S - 180 && r.denied.open && r.denied.sounds.includes('denied'), '带满了买不了：不扣钱、面板不关、响一声', r.denied);
check(r.partial.money === S - 190 && r.partial.rifle.join() === '30,60', '差 5 发只补 5 发，收 $10', r.partial);

// ---- 4. 手枪子弹，面板截图 ----
r = await p.evaluate(() => {
  const e = game.economy;
  game.weapon.guns.pistol.ammo = 3;
  buy('Digit2');
  const out = { money: e.money, pistol: ammo('pistol') };
  e.money = Game.Config.economy.maxMoney; e.refreshMenu();   // 截面板用（菜单还开着）
  return out;
});
check(r.money === S - 210 && r.pistol.join() === '3,10', '手枪一个弹匣 10 发 $20', r);
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}ammo-buy-menu.jpg`, type: 'jpeg', quality: 85 });
r = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#buy .buy-card')].map((d) => [d.dataset.buy, d.textContent])));
check(/AK 弹匣/.test(r.rifle) && /\$60/.test(r.rifle) && /\$20/.test(r.pistol) && r.frag && r.flash && r.smoke, '面板里有 AK 子弹 $60、手枪子弹 $20、三种投掷物', r);

// ---- 5. 重生 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  press('KeyB'); tick(1 / 60);
  const S = Game.Config.economy.startMoney;
  e.money = 150; w.respawn(); e.onRespawn();
  const poor = { money: e.money, hasRifle: w.hasRifle, current: w.current, pistol: ammo('pistol') };
  e.money = S + 300; w.respawn(); e.onRespawn();
  return { poor, rich: e.money };
});
check(r.poor.money === S && r.rich === S + 300, `重生：钱不足 $${S} 补到 $${S}，多的保留`, r);
check(!r.poor.hasRifle && r.poor.current === 'pistol' && r.poor.pistol.join() === '10,0', '重生：主武器没了，子弹回到开局（多买的没了）', r.poor);

// ---- 6. 波次补给 ----
r = await p.evaluate(() => {
  const w = game.weapon;
  w.guns.rifle.ammo = 5; w.guns.rifle.reserve = 0;
  w.guns.pistol.ammo = 4; w.guns.pistol.reserve = 20;
  w.refill(true);
  return { rifle: ammo('rifle'), pistol: ammo('pistol') };
});
check(r.rifle.join() === '30,0' && r.pistol.join() === '10,14', '波次补给：至少补到开局、枪里换满，多买的不收走', r);

// ---- 7. NPC ----
r = await p.evaluate(() => {
  const M = game.bots;
  M.bots = M.bots.filter((b) => b.alive);
  const b = M.bots[0];
  delete b.update;   // 恢复原型上的 update
  const init = { ammo: { ...b.ammo }, reserve: { ...b.reserve }, nades: { ...b.nades } };
  const pl = game.player;
  b.pos.set(pl.position.x + 10, pl.position.y, pl.position.z);
  b.ammo.rifle = b.ammo.pistol = 0;
  b.nades.frag = 0;
  b.state = 'combat'; b.reaction = 0;
  const d0 = Math.hypot(b.pos.x - pl.position.x, b.pos.z - pl.position.z);
  tick(1.5);
  const d1 = Math.hypot(b.pos.x - pl.position.x, b.pos.z - pl.position.z);
  return { init, out: b.outOfAmmo(), reloading: b.reloadT > 0, ammo: { ...b.ammo }, d0, d1, hp: pl.health };
});
check(r.init.ammo.rifle === 30 && r.init.ammo.pistol === 10 && r.init.reserve.rifle === 0 && r.init.nades.frag === 1 && r.init.nades.flash === 0,
  'NPC 开局子弹和玩家一样（一个弹匣、没备弹），一定有主武器', r.init);
check(r.out && !r.reloading && r.ammo.rifle === 0, 'NPC 两把都打空：不会凭空换弹', r);
check(r.d1 > r.d0 + 1 && r.hp === 100, 'NPC 打空了背离玩家跑开、不开枪', { d0: r.d0, d1: r.d1, hp: r.hp });

// ---- 8. 训练场 ----
r = await p.evaluate(() => {
  game.startMode('range');
  const w = game.weapon;
  const hud = hudAmmo();   // 出生拿的是手枪
  w.guns.pistol.ammo = 0; tick(3);
  w.hasRifle = true; w.equipNow('rifle'); w.refreshHud();
  const rifleHud = hudAmmo();
  w.guns.rifle.ammo = 0; tick(3);
  return { hud, pistol: ammo('pistol'), rifleHud, rifle: ammo('rifle') };
});
check(r.hud === '10 / ∞' && r.pistol[0] === 10 && r.rifleHud === '30 / ∞' && r.rifle[0] === 30, '训练场备弹无限，显示 ∞，打空自动换满', r);

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
