// v0.43 的针对性测试：局内买枪、F 快捷套餐纯键盘、NPC 随机（#90）
//   1. 开局 / 重生：只有手枪，主武器那一格空着，切不过去；钱够买主武器
//   2. F 菜单在屏幕左侧、没有光标；开着时鼠标照常转视角、左键照常开枪，只有数字键被拿走
//   3. F "全套"：没有主武器就买上次买的那把，再补子弹和雷；买完关面板；再开一次主武器那一项是"已有"
//   4. F 开着时中弹 → 自动关
//   5. B 菜单买另一把主武器：换掉手上那把，记成"上次买的"；子弹没有主武器时买不了
//   6. 死了主武器没了，重生钱补到 startMoney，又买得起
//   7. 训练场：免费，钱不显示，能买枪
//   8. NPC 一定有主武器，形象从 loadout.npc 里随机
// 用法（在仓库根目录）：node tools/tests/ingame-buy.mjs
// 截图在 tools/out/tests/：ingame-buy-quick（F 菜单）、ingame-buy-classic（B 菜单）
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  try { localStorage.removeItem(Game.Economy.CUSTOM_KEY); } catch (e) { /* 忽略 */ }
  Game.Settings.set('rifle', 'ak');
  game.economy.custom = [];
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('duel');
  for (const b of game.bots.bots) { b.pos.set(30, 0, 30); b.update = () => false; }
  window.press = (c) => game.input.pressed.add(c);
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      if (game.player.alive) game.economy.update(step);   // 顺序和 main.js 一样
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) game.weapon.update(step, game.input);
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  window.state = () => {
    const w = game.weapon;
    return { money: game.economy.money, menu: game.economy.menu, hasRifle: w.hasRifle, rifleKey: w.guns.rifle.key,
      rifle: w.guns.rifle.ammo + w.guns.rifle.reserve, pistol: w.guns.pistol.ammo + w.guns.pistol.reserve, current: w.pending || w.current, ...w.counts };
  };
  game.player.position.copy(game.player.spawn);
  tick(0.3);
});

// ---- 1. 开局只有手枪 ----
let r = await p.evaluate(() => {
  const s0 = state();
  press('Digit1'); tick(0.6);   // 切主武器：没有，切不过去
  const slot = document.querySelector('#weapons .slot');
  return { s0, after: state().current, slotNone: slot.classList.contains('none'), start: Game.Config.economy.startMoney,
    price: Game.Config.economy.gunPrices[Game.Settings.get('rifle')] };
});
check(!r.s0.hasRifle && r.s0.current === 'pistol', '开局只有手枪', r.s0);
check(r.after === 'pistol', '按 1 切不到主武器', r.after);
check(r.slotNone, '武器栏主武器那一格是空的');
check(r.start >= r.price, '开局的钱够买主武器', r);

// ---- 2. F 菜单：左侧、没光标、鼠标照常转视角和开枪 ----
r = await p.evaluate(() => {
  const pl = game.player;
  press('KeyF'); tick(1 / 60);
  const el = document.getElementById('buy');
  const rect = el.getBoundingClientRect();
  const cursor = getComputedStyle(document.getElementById('buy-cursor')).display;
  const packs = [...el.querySelectorAll('.buy-card.pack h5')].map((h) => h.textContent);
  const yaw = pl.yaw;
  game.input.mouseX += 200; tick(1 / 60);
  const turned = Math.abs(pl.yaw - yaw) > 0.01;
  const ammo = game.weapon.guns.pistol.ammo;
  press('Mouse0'); game.input.down.add('Mouse0'); tick(1 / 60); game.input.down.delete('Mouse0'); tick(0.3);
  const shot = game.weapon.guns.pistol.ammo < ammo;
  return { menu: game.economy.menu, left: rect.left, right: rect.right, cursor, packs, turned, shot };
});
await p.screenshot({ path: OUT + 'ingame-buy-quick.png' });
check(r.menu === 'quick', 'F 打开快捷菜单');
check(r.left < 60 && r.right < 1280 * 0.3, 'F 菜单在屏幕左侧，不挡中间', r);
check(r.cursor === 'none', 'F 菜单没有光标', r.cursor);
check(r.packs.length === 3 && /全套/.test(r.packs[0]) && /上次/.test(r.packs[2]), '三个套餐：全套 / 经济 / 上次', r.packs);
check(r.turned, 'F 菜单开着时鼠标照常转视角');
check(r.shot && r.menu === 'quick', 'F 菜单开着时左键照常开枪，菜单不关');

// ---- 3. 全套：买主武器 + 子弹 + 雷，买完关 ----
r = await p.evaluate(() => {
  const before = state();
  press('Digit1'); tick(1 / 60);
  const after = state();
  tick(0.8);
  press('KeyF'); tick(1 / 60);
  const firstLine = document.querySelector('#buy .buy-card.pack li');
  const res = { before, after, held: state().current, primaryHave: firstLine.classList.contains('have') };
  press('KeyF'); tick(1 / 60);
  return res;
});
check(r.after.hasRifle && r.after.rifleKey === 'ak', '全套买到了上次买的主武器（AK）', r.after);
check(r.after.rifle === 90 && r.after.frag >= 1, '全套补了主武器子弹（3 匣）和手雷', r.after);
check(r.after.menu === null, '买完关面板');
check(r.held === 'rifle', '买到主武器马上掏出来', r.held);
check(r.before.money - r.after.money === 1500 + 60 * 2 + 300 * (r.after.frag - r.before.frag) + 200 * (r.after.flash - r.before.flash) + 2 * (r.after.pistol - r.before.pistol), '扣的钱对得上', [r.before.money, r.after.money]);
check(r.primaryHave, '再开 F：主武器那一项是"已有"');

// ---- 4. F 开着时中弹自动关 ----
r = await p.evaluate(() => {
  press('KeyF'); tick(1 / 60);
  const open = game.economy.menu;
  game.player.takeDamage(5, game.player.position.clone().add(new THREE.Vector3(5, 0, 0)));
  tick(1 / 60);
  return { open, after: game.economy.menu };
});
check(r.open === 'quick' && r.after === null, 'F 开着时中弹自动关', r);

// ---- 5. B 菜单：换一把主武器 ----
r = await p.evaluate(() => {
  game.economy.money = 4000;
  press('KeyB'); tick(1 / 60);
  const cats = [...document.querySelectorAll('#buy .buy-cols h5')].map((h) => h.textContent);
  press('Digit1'); tick(1 / 60);
  press('Digit2'); tick(1 / 60);   // M4
  const s = state();
  return { cats, s, pref: Game.Settings.get('rifle'), menu: game.economy.menu };
});
await p.screenshot({ path: OUT + 'ingame-buy-classic.png' });
check(r.cats.length === 4 && /主武器/.test(r.cats[0]), 'B 菜单有 主武器 / 手枪 / 弹药 / 投掷物', r.cats);
check(r.s.rifleKey === 'm4' && r.s.rifle === 30 && r.s.money === 2500, 'B 买 M4：换掉 AK，新枪一个弹匣，扣 $1500', r.s);
check(r.pref === 'm4', 'M4 记成上次买的', r.pref);
check(r.menu === 'classic', 'B 菜单买完不关');
r = await p.evaluate(() => { press('KeyB'); tick(1 / 60); return game.economy.custom; });
check(JSON.stringify(r).includes('primary'), '关 B 菜单：上次套餐里记了主武器', r);

// ---- 6. 死了主武器没了，重生又买得起 ----
r = await p.evaluate(() => {
  game.economy.money = 100;
  game.player.health = 1;
  game.player.takeDamage(50, game.player.position.clone().add(new THREE.Vector3(5, 0, 0)));
  const dead = !game.player.alive;
  // 重生倒计时在 main.js 的游戏循环里，这里照 respawnPlayer 的顺序直接调
  game.player.setSpawn(game.bots.playerSpawn()); game.player.reset(); game.weapon.respawn(); game.economy.onRespawn();
  game.player.position.copy(game.player.spawn);
  tick(0.2);
  const e = game.economy;
  const s = state();
  return { dead, alive: game.player.alive, s, canBuy: e.canBuy(Game.Settings.get('rifle')), ammoBuy: e.canBuy('rifle') };
});
check(r.dead && r.alive, '阵亡后重生', r);
check(!r.s.hasRifle && r.s.current === 'pistol', '重生又只有手枪（主武器掉了）', r.s);
check(r.s.money === 2000 && r.canBuy, '重生钱补到 $2000，买得起主武器', r.s.money);
check(!r.ammoBuy, '没有主武器时主武器子弹买不了');

// ---- 7. 训练场免费 ----
r = await p.evaluate(() => {
  game.startMode('range');
  game.player.position.copy(game.player.spawn);
  tick(0.2);
  const money = getComputedStyle(document.getElementById('money')).display;
  press('KeyF'); tick(1 / 60);
  const menu = game.economy.menu;
  press('Digit1'); tick(1 / 60);
  return { money, menu, s: state() };
});
check(r.money === 'none', '训练场不显示钱', r.money);
check(r.menu === 'quick' && r.s.hasRifle && r.s.money === 2000, '训练场 F 免费买到主武器，钱没少', r.s);

// ---- 8. NPC：一定有主武器，形象随机 ----
r = await p.evaluate(async () => {
  await Promise.all(Game.Character.paths().map((x) => Game.Character.load(x)));
  game.startMode('waves');
  const out = { rifles: [], skins: new Set() };
  for (let i = 0; i < 30; i++) {
    game.bots.stop(); game.bots.start('waves');
    for (const b of game.bots.bots) {
      out.rifles.push(b.gunKeys.rifle);
      let skin = '';
      b.model.root.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o.geometry.uuid; });
      out.skins.add(skin);
    }
  }
  return { rifles: out.rifles.every((k) => k in Game.Config.loadout.rifle), n: out.rifles.length, skins: out.skins.size };
});
check(r.rifles, 'NPC 每个都有主武器', r);
check(r.skins >= 2, 'NPC 形象随机（出现了不止一种）', r.skins);

await g.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
