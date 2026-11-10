// v0.30 的针对性测试：购买体验（#33）
//   1. 面板里买成功后面板立刻关掉，这一下不切武器；紧接着再按槽位键就切到投掷物
//   2. 买不了（带满 / 钱不够）时面板不关
//   3. 购买区里没有文字提示，左侧是购物车图标：买得起亮、买不起灰、面板开着收起、出区收起
//   4. 每个操作都有回应（不用文字）：买成功 purchase 音效 + 武器栏那一格闪亮回弹 + 钱数闪、飘 -$价格；
//      买不了 denied 音效 + 那一行红一下晃一下；不在购买区按 B，灰购物车探出来晃一下
// 用法（在仓库根目录）：node tools/tests/buy-ux.mjs
// 截图在 tools/out/tests/：buy-cue-ok（买得起）、buy-cue-poor（买不起）、buy-cue-menu（面板打开）、
//   buy-bought（刚买完）、buy-denied（买不了）、buy-cue-denied（区外按 B）
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
  // 记下放了哪些音效（purchase 买成功 / denied 买不了）
  window.sounds = [];
  const a = game.economy.audio;
  for (const n of ['purchase', 'denied']) { const f = a[n].bind(a); a[n] = () => { sounds.push(n); f(); }; }
  window.feedback = () => {
    const slot = [...document.querySelectorAll('#weapons .slot.bought')].map((el) => el.querySelector('kbd').textContent);
    const gain = document.getElementById('money-gain');
    return { slot, spent: document.getElementById('money').classList.contains('spent'),
      gain: gain.classList.contains('spend') && gain.classList.contains('show') ? gain.textContent : '' };
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
  sounds.length = 0;
  press('Digit3'); tick(1 / 60);
  const afterBuy = { open: e.open, frag: w.counts.frag, money: e.money, current: w.current, pending: w.pending,
    menu: document.getElementById('buy').style.display, cue: cue(), sounds: [...sounds], fb: feedback() };
  return { before, afterBuy };
});
check(r.afterBuy.sounds.join() === 'purchase', '买成功：放 purchase 音效', r.afterBuy.sounds);
check(r.afterBuy.fb.slot.join() === '3' && r.afterBuy.fb.spent && r.afterBuy.fb.gain === '-$300',
  '买成功：武器栏 3 号格闪亮回弹，钱数闪一下，旁边飘 -$300', r.afterBuy.fb);
await p.waitForTimeout(120);
await p.screenshot({ path: `${OUT}buy-bought.jpg`, type: 'jpeg', quality: 85 });
r = { ...r, ...(await p.evaluate(() => {
  const w = game.weapon;
  // 武器栏中途重画（比如切枪），闪亮的那一格还在，animation-delay 接着播（假装买完过了 0.2 秒，截图慢不影响）
  game.hud.slotPulse.t0 = performance.now() - 200;
  w.refreshHud();
  const el = document.querySelector('#weapons .slot.bought');
  const mid = el ? parseFloat(el.style.animationDelay) : null;
  press('Digit3'); tick(0.6);
  return { mid, cur: w.current };
})) };
check(r.mid !== null && r.mid < 0, '武器栏重画后闪亮接着播（不从头来）', r.mid);
await p.waitForTimeout(800);
r.gone = await p.evaluate(() => { game.weapon.refreshHud(); return feedback().slot.length; });
check(r.gone === 0, `过了 boughtPulse 秒闪亮消失`, r.gone);
check(r.afterBuy.frag === r.before + 1 && r.afterBuy.money === 700, '按 3 买到一个手雷，扣 300', r.afterBuy);
check(!r.afterBuy.open && r.afterBuy.menu === 'none' && r.afterBuy.cue.show, '买成功面板立刻关掉，购物车图标回来', r.afterBuy);
check(r.afterBuy.current === 'rifle' && !r.afterBuy.pending, '买的那一下不切武器', r.afterBuy);
check(r.cur === 'frag', '紧接着再按 3 就切到手雷', r.cur);

// ---- 买不了时面板不关 ----
r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon;
  w.equipNow('rifle'); tick(0.1);
  press('KeyB'); tick(1 / 60);
  sounds.length = 0;
  press('Digit3'); tick(1 / 60);     // 手雷已经带满 2 个
  const rows = [...document.querySelectorAll('#buy div')].map((el) => el.classList.contains('denied'));
  return { open: e.open, frag: w.counts.frag, money: e.money, current: w.current, sounds: [...sounds], rows };
});
check(r.open && r.frag === 2 && r.money === 700 && r.current === 'rifle', '带满买不了：面板不关、不扣钱、不切枪', r);
check(r.sounds.join() === 'denied' && r.rows.join() === 'true,false,false', '买不了：放 denied 音效，手雷那一行红一下晃一下', r);
await p.waitForTimeout(60);
await p.screenshot({ path: `${OUT}buy-denied.jpg`, type: 'jpeg', quality: 85 });

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

// ---- 不在购买区按 B：灰图标晃一下 + denied 音效 ----
r = await p.evaluate(() => {
  sounds.length = 0;
  press('KeyB'); tick(1 / 60);
  return { open: game.economy.open, denied: document.getElementById('buy-cue').classList.contains('denied'), sounds: [...sounds] };
});
check(!r.open && r.denied && r.sounds.join() === 'denied', '出了购买区按 B：不开面板，灰购物车探出来晃一下，放 denied 音效', r);
await p.waitForTimeout(150);
await p.screenshot({ path: `${OUT}buy-cue-denied.jpg`, type: 'jpeg', quality: 85 });

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
