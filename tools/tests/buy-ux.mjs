// v0.30 的针对性测试：购买体验（#33）
//   1. 面板里买成功后面板立刻关掉，这一下不切武器；紧接着再按槽位键就切到投掷物
//   2. 买不了（带满 / 钱不够）时面板不关
//   3. 购买区里没有文字提示，左侧是购物车图标：买得起亮、买不起灰、面板开着收起、出区收起
// 用法（在仓库根目录）：node tools/tests/buy-ux.mjs
// 截图在 tools/out/tests/：buy-cue-ok（买得起）、buy-cue-poor（买不起）、buy-cue-menu（面板打开）
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
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) { game.economy.update(step); game.weapon.update(step, game.input); }
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  window.cue = () => {
    const el = document.getElementById('buy-cue');
    return { show: el.classList.contains('show'), poor: el.classList.contains('poor'), key: document.getElementById('buy-cue-key').textContent };
  };
});

// ---- 购物车图标：没钱时灰 ----
let r = await p.evaluate(() => {
  const pl = game.player, e = game.economy;
  game.weapon.equipNow('rifle');
  e.money = 0;
  pl.position.copy(pl.spawn); tick(0.3);
  return { zone: e.inZone, cue: cue(), text: !!document.getElementById('buy-tip') };
});
check(r.zone && r.cue.show && r.cue.poor && r.cue.key === 'B', '进购买区：左侧出购物车图标，没钱是灰的，键帽显示 B', r);
check(!r.text, '准星下方的文字提示没有了', r);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-cue-poor.jpg`, type: 'jpeg', quality: 85 });

// ---- 有钱时亮 ----
r = await p.evaluate(() => { game.economy.money = 1000; game.hud.setMoney(1000); tick(0.3); return cue(); });
check(r.show && !r.poor, '有钱买得起：图标亮（不灰）', r);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-cue-ok.jpg`, type: 'jpeg', quality: 85 });

// ---- 面板打开时图标收起 ----
r = await p.evaluate(() => { press('KeyB'); tick(1 / 60); return { open: game.economy.open, cue: cue() }; });
check(r.open && !r.cue.show, '按 B 打开面板，购物车图标收起', r);
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}buy-cue-menu.jpg`, type: 'jpeg', quality: 85 });

// ---- 买成功立刻关面板，不切枪；再按 3 切到手雷 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  const before = w.counts.frag;
  press('Digit3'); tick(1 / 60);
  const afterBuy = { open: e.open, frag: w.counts.frag, money: e.money, current: w.current, pending: w.pending,
    menu: document.getElementById('buy').style.display, cue: cue() };
  press('Digit3'); tick(0.6);
  return { before, afterBuy, cur: w.current };
});
check(r.afterBuy.frag === r.before + 1 && r.afterBuy.money === 700, '按 3 买到一个手雷，扣 300', r.afterBuy);
check(!r.afterBuy.open && r.afterBuy.menu === 'none' && r.afterBuy.cue.show, '买成功面板立刻关掉，购物车图标回来', r.afterBuy);
check(r.afterBuy.current === 'rifle' && !r.afterBuy.pending, '买的那一下不切武器', r.afterBuy);
check(r.cur === 'frag', '紧接着再按 3 就切到手雷', r.cur);

// ---- 买不了时面板不关 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  w.equipNow('rifle'); tick(0.1);
  press('KeyB'); tick(1 / 60);
  press('Digit3'); tick(1 / 60);     // 手雷已经带满 2 个
  return { open: e.open, frag: w.counts.frag, money: e.money, current: w.current };
});
check(r.open && r.frag === 2 && r.money === 700 && r.current === 'rifle', '带满买不了：面板不关、不扣钱、不切枪', r);

// ---- 同一帧按两个键只买一个 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  const before = { ...w.counts };
  press('Digit4'); press('Digit5'); tick(1 / 60);
  return { before, after: { ...w.counts }, open: e.open, current: w.current };
});
check(r.after.flash === r.before.flash + 1 && r.after.smoke === r.before.smoke && !r.open && r.current === 'rifle', '同一帧按 4 和 5：只买闪光，面板关掉，不切枪', r);

// ---- 出区收起 ----
r = await p.evaluate(() => { game.player.position.x += 6; tick(0.1); return cue(); });
check(!r.show, '走出购买区图标收起', r);

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
