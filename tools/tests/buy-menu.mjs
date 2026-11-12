// v0.41 的针对性测试：B 经典菜单 / F 快捷套餐菜单（#81）
//   1. 菜单开着：鼠标移动的是光标（不转视角），左键点卡片购买（不开枪），按住开火不打，滚轮不切枪，WASD 照样能走
//   2. B：数字键先选分类再选商品，买完回到选分类、面板不关；退格回到选分类；鼠标点卡片也能买
//   3. F：Smart Buy——"买到多少"，已经够了的跳过，钱不够的那一样跳过、接着买后面的；买完关面板；什么都买不了时晃一下不关
//   4. 自定义套餐：没记过时是空的；关 B 菜单时记住买过的那几样（存在浏览器里），F 里按一下就买回来
// 用法（在仓库根目录）：node tools/tests/buy-menu.mjs
// 截图在 tools/out/tests/：buy-classic（B 菜单，选了投掷物分类、光标停在闪光上）、buy-quick（F 菜单）
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
  game.weapon.equipNow('rifle');
  game.player.position.copy(game.player.spawn);
  tick(0.3);
});

// ---- 1. F 菜单：四张套餐卡，光标、视角、开火 ----
let r = await p.evaluate(() => {
  const pl = game.player, e = game.economy;
  press('KeyF'); tick(1 / 60);
  const yaw = pl.yaw, pitch = pl.pitch;
  const packs = [...document.querySelectorAll('#buy .buy-card.pack')].map((c) => ({
    id: c.dataset.buy, name: c.querySelector('h5').textContent, cost: c.querySelector(':scope > b').textContent,
    lines: [...c.querySelectorAll('li')].map((l) => `${l.className}:${l.querySelector('span') ? l.querySelector('span').textContent : l.textContent}`),
    off: c.classList.contains('off') }));
  pointAt('pack1');
  const hover = document.querySelector('#buy .hover');
  const cursor = document.getElementById('buy-cursor').style.display;
  return { menu: e.menu, packs, yawSame: pl.yaw === yaw && pl.pitch === pitch, hover: hover && hover.dataset.buy, cursor,
    cue: document.getElementById('buy-cue').classList.contains('show') };
});
check(r.menu === 'quick' && r.cursor === 'block' && !r.cue, '在出生点按 F：打开快捷菜单，出光标，购物车图标收起', r);
check(r.packs.map((x) => x.name).join() === '1补满,2突击,3经济,4自定义', '四张套餐：补满 / 突击 / 经济 / 自定义', r.packs.map((x) => x.name));
const assault = r.packs[1];
check(assault.cost === '$420' && assault.lines.join() === 'buy:AK 弹匣,buy:手雷,poor:闪光',
  '突击（$600）：AK 补到 3 匣 $120 + 手雷补到 2 个 $300，闪光钱不够标红，显示这次花 $420', assault);
check(r.packs[3].off && /B 菜单/.test(r.packs[3].lines.join()), '自定义还没记过：灰的，写着在 B 菜单里买过一次后自动记住', r.packs[3]);
check(r.yawSame && r.hover === 'pack1', '移动鼠标：光标移到突击卡上（高亮），视角不动', r);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-quick.jpg`, type: 'jpeg', quality: 85 });

// ---- 2. 点突击：Smart Buy ----
r = await p.evaluate(() => {
  const shots = game.hud.stats.shots;
  sounds.length = 0;
  click();
  return { ...state(), shots: game.hud.stats.shots - shots, sounds: [...sounds], menuEl: document.getElementById('buy').style.display,
    cursor: document.getElementById('buy-cursor').style.display };
});
check(r.money === 180 && r.rifle === 90 && r.frag === 2 && r.flash === 0, '点突击：AK 买 2 个弹匣、手雷 1 个，闪光钱不够跳过，剩 $180', r);
check(r.menu === null && r.menuEl === 'none' && r.cursor === 'none', '套餐买完面板关掉，光标消失', r);
check(r.shots === 0 && r.sounds.join() === 'purchase' && r.current === 'rifle', '点击不开枪、不切枪，只响一声 purchase', r);

// ---- 3. 什么都买不了：晃一下，面板不关 ----
r = await p.evaluate(() => {
  press('KeyF'); tick(1 / 60);
  sounds.length = 0;
  press('Digit3'); tick(1 / 60);   // 经济：AK 已经 3 匣（跳过），闪光 $200 买不起
  return { ...state(), sounds: [...sounds], denied: document.querySelector('#buy [data-buy="pack2"]').classList.contains('denied') };
});
check(r.menu === 'quick' && r.money === 180 && r.sounds.join() === 'denied' && r.denied, '经济套餐什么都买不了：卡片晃一下、响 denied，面板不关', r);

// ---- 4. 菜单开着：按住开火不打，滚轮不切枪，WASD 能走 ----
r = await p.evaluate(() => {
  const pl = game.player, shots = game.hud.stats.shots, ammo = game.weapon.guns.rifle.ammo, x0 = pl.position.clone();
  game.input.down.add('Mouse0'); press('Mouse0');
  game.input.wheel = 1;
  game.input.down.add('KeyW');
  tick(0.3);
  game.input.down.delete('KeyW'); game.input.down.delete('Mouse0');
  const moved = pl.position.distanceTo(x0);
  pl.position.copy(pl.spawn); tick(1 / 60);
  return { shots: game.hud.stats.shots - shots, ammo: game.weapon.guns.rifle.ammo === ammo, current: game.weapon.current, pending: game.weapon.pending, moved, menu: game.economy.menu };
});
check(r.shots === 0 && r.ammo && r.current === 'rifle' && !r.pending, '菜单开着：按住开火不打、滚轮不切枪', r);
check(r.moved > 0.3 && r.menu === 'quick', '菜单开着照样能走', r);

// ---- 5. B 经典菜单：先选分类再选商品，鼠标点 ----
r = await p.evaluate(() => {
  const e = game.economy;
  e.money = 2000; game.hud.setMoney(2000);
  press('KeyB'); tick(1 / 60);       // F 开着时按 B：换成经典菜单
  const opened = e.menu;
  press('Digit2'); tick(1 / 60);     // 投掷物
  const cat = e.cat, sel = document.querySelector('.buy-cols section.sel h5').textContent;
  press('Backspace'); tick(1 / 60);
  const back = e.cat;
  press('Digit2'); tick(1 / 60);
  sounds.length = 0;
  press('Digit3'); tick(1 / 60);     // 烟雾
  const afterSmoke = { ...state(), cat: e.cat, sounds: [...sounds] };
  pointAt('flash'); click();         // 鼠标点闪光
  const afterFlash = state();
  press('Digit2'); tick(1 / 60);     // 选投掷物，光标停在闪光上，截图用
  pointAt('flash');
  return { opened, cat, sel, back, afterSmoke, afterFlash };
});
check(r.opened === 'classic', 'F 菜单开着时按 B：换成经典菜单', r.opened);
check(r.cat === 1 && r.sel === '2投掷物' && r.back === -1, '按 2 选中投掷物分类（高亮），退格回到选分类', r);
check(r.afterSmoke.smoke === 1 && r.afterSmoke.money === 1700 && r.afterSmoke.menu === 'classic' && r.afterSmoke.cat === -1,
  '再按 3 买到烟雾：扣 $300，面板不关，回到选分类', r.afterSmoke);
check(r.afterFlash.flash === 1 && r.afterFlash.money === 1500 && r.afterFlash.menu === 'classic', '鼠标点闪光卡：买到，扣 $200，面板不关', r.afterFlash);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-classic.jpg`, type: 'jpeg', quality: 85 });

// ---- 6. 自定义套餐：关 B 时记住买过的那几样 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  press('KeyB'); tick(1 / 60);       // 关 B → 记住
  const saved = JSON.parse(localStorage.getItem(Game.Economy.CUSTOM_KEY));
  w.respawn(); e.money = 1000; game.hud.setMoney(1000);
  const before = state();
  press('KeyF'); tick(1 / 60);
  const lines = [...document.querySelectorAll('#buy [data-buy="pack3"] li')].map((l) => l.textContent);
  press('Digit4'); tick(1 / 60);
  return { saved, before, lines, after: state() };
});
check(JSON.stringify(r.saved) === '[["smoke",1],["flash",1]]', '关 B 菜单时，按买的先后记下烟雾 1、闪光 1（存在浏览器里）', r.saved);
check(r.lines.join() === '烟雾×1,闪光×1', 'F 菜单的自定义卡显示烟雾 ×1、闪光 ×1', r.lines);
check(r.before.smoke === 0 && r.after.smoke === 1 && r.after.flash === 1 && r.after.money === 500 && r.after.menu === null,
  '重生后按 F、4：买回烟雾和闪光，扣 $500，面板关掉', r);

// ---- 7. 出区：不开菜单 ----
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
