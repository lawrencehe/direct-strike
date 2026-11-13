// #81 的针对性测试：B 经典菜单（按 #90 更新过；F 快捷菜单纯键盘、没光标、新套餐的测试在 ingame-buy.mjs）
//   1. B 菜单开着：鼠标移动的是光标（不转视角），按住开火不打，滚轮不切枪，WASD 照样能走
//   2. F 开着时按 B 换成经典菜单；数字键先选分类再选商品，买完回到选分类、面板不关；退格回到选分类；鼠标点卡片也能买
//   3. 卡片上的小字：弹药 / 投掷物写"现有 / 上限"，手上那把枪写"手上"
//   4. "上次"套餐：没记过时是空的；关 B 菜单时记住买过的那几样（存在浏览器里），F 里按一下就买回来
//   5. 出了购买区按 F：不开菜单
// 用法（在仓库根目录）：node tools/tests/buy-menu.mjs
// 截图在 tools/out/tests/：buy-classic（B 菜单，选了投掷物分类、光标停在闪光上）
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

const C = await p.evaluate(() => {
  try { localStorage.removeItem(Game.Economy.CUSTOM_KEY); } catch (e) { /* 忽略 */ }
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
  window.sounds = [];
  const a = game.economy.audio;
  for (const n of ['purchase', 'denied']) { const f = a[n].bind(a); a[n] = () => { sounds.push(n); f(); }; }
  // 把光标移到某张卡的中间（按卡片在屏幕上的位置换算成鼠标移动量），再推一帧
  window.pointAt = (id) => {
    const e = game.economy, r = document.querySelector(`#buy [data-buy="${id}"]`).getBoundingClientRect();
    game.input.mouseX += (r.left + r.width / 2 - e.cursor.x) / Game.Config.economy.cursorSpeed;
    game.input.mouseY += (r.top + r.height / 2 - e.cursor.y) / Game.Config.economy.cursorSpeed;
    tick(1 / 60);
  };
  window.click = () => { press('Mouse0'); game.input.down.add('Mouse0'); tick(1 / 60); game.input.down.delete('Mouse0'); };
  window.state = () => {
    const w = game.weapon;
    return { money: game.economy.money, menu: game.economy.menu, rifle: w.guns.rifle.ammo + w.guns.rifle.reserve,
      pistol: w.guns.pistol.ammo + w.guns.pistol.reserve, ...w.counts, current: w.current };
  };
  // 出生只有手枪（#90）：直接给上主武器，测按住开火不打、滚轮不切枪要用
  game.weapon.hasRifle = true; game.weapon.equipNow('rifle'); game.weapon.refreshHud();
  game.player.position.copy(game.player.spawn);
  tick(0.3);
  const E = Game.Config.economy;
  return { start: E.startMoney, prices: E.prices, cats: E.categories.map((c) => c.name), rifleKey: game.weapon.guns.rifle.key,
    throwCat: E.categories.findIndex((c) => c.items.includes('flash')) + 1, maxRifle: game.weapon.maxRounds('rifle') };
});
const P = C.prices, T = C.throwCat;   // T：投掷物分类的数字键

// ---- 1. B 菜单开着：光标、视角、开火、滚轮、走路 ----
let r = await p.evaluate(() => {
  const pl = game.player, e = game.economy;
  press('KeyB'); tick(1 / 60);
  const yaw = pl.yaw, pitch = pl.pitch;
  pointAt('smoke');
  const hover = document.querySelector('#buy .hover');
  const look = { yawSame: pl.yaw === yaw && pl.pitch === pitch, hover: hover && hover.dataset.buy, menu: e.menu,
    cursor: document.getElementById('buy-cursor').style.display, cue: document.getElementById('buy-cue').classList.contains('show') };
  // 光标移到左上角（不在卡片上），不然下面按开火就是点卡片买东西
  game.input.mouseX -= 10000; game.input.mouseY -= 10000; tick(1 / 60);
  look.away = !document.querySelector('#buy .hover');
  const shots = game.hud.stats.shots, ammo = game.weapon.guns.rifle.ammo, x0 = pl.position.clone();
  game.input.down.add('Mouse0'); press('Mouse0');
  game.input.wheel = 1;
  game.input.down.add('KeyW');
  tick(0.3);
  game.input.down.delete('KeyW'); game.input.down.delete('Mouse0');
  const moved = pl.position.distanceTo(x0);
  pl.position.copy(pl.spawn); tick(1 / 60);
  return { look, shots: game.hud.stats.shots - shots, ammo: game.weapon.guns.rifle.ammo === ammo, current: game.weapon.current,
    pending: game.weapon.pending, moved, menu: e.menu };
});
check(r.look.menu === 'classic' && r.look.cursor === 'block' && !r.look.cue, '在出生点按 B：打开经典菜单，出光标，购物车图标收起', r.look);
check(r.look.yawSame && r.look.hover === 'smoke', '移动鼠标：光标移到烟雾卡上（高亮），视角不动', r.look);
check(r.look.away && r.shots === 0 && r.ammo && r.current === 'rifle' && !r.pending, 'B 菜单开着：按住开火不打、滚轮不切枪', r);check(r.moved > 0.3 && r.menu === 'classic', 'B 菜单开着照样能走', r);

// ---- 2. F 开着按 B 换成经典菜单；先选分类再选商品，鼠标点 ----
r = await p.evaluate((T) => {
  const e = game.economy;
  press('KeyB'); tick(1 / 60);       // 关掉
  press('KeyF'); tick(1 / 60);
  const quick = e.menu;
  e.money = Game.Config.economy.startMoney; game.hud.setMoney(e.money);
  press('KeyB'); tick(1 / 60);       // F 开着时按 B：换成经典菜单
  const opened = e.menu;
  const cats = [...document.querySelectorAll('.buy-cols section h5')].map((h) => h.textContent);
  press(`Digit${T}`); tick(1 / 60);  // 投掷物
  const cat = e.cat, sel = document.querySelector('.buy-cols section.sel h5').textContent;
  press('Backspace'); tick(1 / 60);
  const back = e.cat;
  press(`Digit${T}`); tick(1 / 60);
  sounds.length = 0;
  press('Digit3'); tick(1 / 60);     // 烟雾
  const afterSmoke = { ...state(), cat: e.cat, sounds: [...sounds] };
  pointAt('flash'); click();         // 鼠标点闪光
  const afterFlash = state();
  const notes = Object.fromEntries([...document.querySelectorAll('#buy .buy-card')].map((c) => [c.dataset.buy, c.querySelector('i').textContent]));
  press(`Digit${T}`); tick(1 / 60); // 选投掷物，光标停在闪光上，截图用
  pointAt('flash');
  return { quick, opened, cats, cat, sel, back, afterSmoke, afterFlash, notes };
}, T);
check(r.quick === 'quick' && r.opened === 'classic', 'F 菜单开着时按 B：换成经典菜单', r);
check(r.cats.length === 4 && r.cats.join() === C.cats.map((n, i) => `${i + 1}${n}`).join(), 'B 菜单四个分类：主武器 / 手枪 / 弹药 / 投掷物', r.cats);
check(r.cat === T - 1 && r.sel === `${T}投掷物` && r.back === -1, `按 ${T} 选中投掷物分类（高亮），退格回到选分类`, r);
check(r.afterSmoke.smoke === 1 && r.afterSmoke.money === C.start - P.smoke && r.afterSmoke.menu === 'classic' && r.afterSmoke.cat === -1
  && r.afterSmoke.sounds.join() === 'purchase', `再按 3 买到烟雾：扣 $${P.smoke}，面板不关，回到选分类`, r.afterSmoke);
check(r.afterFlash.flash === 1 && r.afterFlash.money === C.start - P.smoke - P.flash && r.afterFlash.menu === 'classic',
  `鼠标点闪光卡：买到，扣 $${P.flash}，面板不关`, r.afterFlash);
check(r.notes.flash === '1 / 2' && r.notes.smoke === '1 / 1' && r.notes.frag === '1 / 2', '投掷物卡片写"现有 / 上限"', r.notes);
check(r.notes.rifle === `${r.afterFlash.rifle} / ${C.maxRifle}` && r.notes[C.rifleKey] === '手上', '弹药卡片写现有几发 / 上限，手上那把枪写"手上"', r.notes);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-classic.jpg`, type: 'jpeg', quality: 85 });

// ---- 3. "上次"套餐：关 B 时记住买过的那几样 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  const empty = e.packages().at(-1).items.length;   // 关 B 之前，"上次"还没记过
  press('KeyB'); tick(1 / 60);       // 关 B → 记住
  const saved = JSON.parse(localStorage.getItem(Game.Economy.CUSTOM_KEY));
  w.respawn(); e.money = 1000; game.hud.setMoney(1000);
  const before = state();
  press('KeyF'); tick(1 / 60);
  const cards = [...document.querySelectorAll('#buy .buy-card.pack')];
  const last = cards.at(-1);
  const lines = [...last.querySelectorAll('li')].map((l) => l.title);
  press(`Digit${cards.length}`); tick(1 / 60);
  return { empty, saved, before, name: last.querySelector('h5').textContent, n: cards.length, lines, after: state() };
});
check(r.empty === 0, '"上次"没记过时是空的', r.empty);
check(JSON.stringify(r.saved) === '[["smoke",1],["flash",1]]', '关 B 菜单时，按买的先后记下烟雾 1、闪光 1（存在浏览器里）', r.saved);
check(/上次/.test(r.name) && r.lines.join() === '烟雾,闪光', 'F 菜单最后一张"上次"：烟雾、闪光', r);
check(r.before.smoke === 0 && r.after.smoke === 1 && r.after.flash === 1 && r.after.money === 1000 - P.smoke - P.flash && r.after.menu === null,
  `重生后按 F、${r.n}：买回烟雾和闪光，扣 $${P.smoke + P.flash}，面板关掉`, r);

// ---- 4. 出区：不开菜单 ----
r = await p.evaluate(() => {
  game.player.position.x += 6; tick(0.1);
  sounds.length = 0;
  press('KeyF'); tick(1 / 60);
  return { menu: game.economy.menu, sounds: [...sounds], denied: document.getElementById('buy-cue').classList.contains('denied') };
});
check(r.menu === null && r.sounds.join() === 'denied' && r.denied, '出了购买区按 F：不开菜单，灰购物车探出来晃一下', r);

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
