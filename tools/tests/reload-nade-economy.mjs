// v0.20 的针对性测试：自动换弹、换弹中切枪、手雷两道保险、经济（赏金、上限、购买、补给）。数值按 #7 更新过；子弹相关见 economy-ammo.mjs
// 用法（在仓库根目录）：node tools/tests/reload-nade-economy.mjs
// 截图在 tools/out/tests/：reload-a ~ e 是空枪换弹的几个阶段，buy-menu 是购买面板。说明见 docs/testing.md
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
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) { game.economy.update(step); game.weapon.update(step, game.input); }
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
});

// ---- 1. 打空自动换弹 ----
let r = await p.evaluate(() => {
  const w = game.weapon;
  w.guns.rifle.ammo = 1; w.guns.rifle.reserve = 90;   // 开局没有备弹（#7），先塞一些才能换
  press('Mouse0'); hold('Mouse0'); tick(1 / 60); release('Mouse0');
  const afterShot = w.guns.rifle.ammo;
  tick(0.15);
  return { afterShot, reloading: w.reloading, empty: w.reloadEmpty, tip: !!document.getElementById('reload-tip') };
});
check(r.afterShot === 0 && r.reloading && r.empty, '打空后不扣扳机也自动开始换弹（空枪换弹）', r);
check(!r.tip, '没有"换弹中"文字了');

// 截几张换弹过程（进度 0.3 弹匣已抽出、0.42 左手去拿新弹匣、0.56 插入、0.78 拉机柄、0.95 回位）
for (const [label, at] of [['a-magout', 0.3], ['b-away', 0.42], ['c-magin', 0.56], ['d-rack', 0.78], ['e-rest', 0.95]]) {
  await p.evaluate((at) => { const w = game.weapon; const now = 1 - w.reloadTimer / w.guns.rifle.cfg.reloadTime; tick(Math.max(0, at - now) * w.guns.rifle.cfg.reloadTime); }, at);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}reload-${label}.jpg`, type: 'jpeg', quality: 85 });
}
r = await p.evaluate(() => { tick(0.5); return { ammo: game.weapon.guns.rifle.ammo, reloading: game.weapon.reloading }; });
check(r.ammo === 30 && !r.reloading, '换弹完成，弹匣满', r);

// ---- 2. 换弹中切枪 → 中止；切回空枪 → 自动再换 ----
r = await p.evaluate(() => {
  const w = game.weapon;
  w.guns.rifle.ammo = 0; w.startReload(); tick(0.5);
  press('Digit2'); tick(1 / 60);
  const cancelled = !w.reloading;
  tick(0.5);
  const cur = w.current, ammo = w.guns.rifle.ammo;
  press('Digit1'); tick(0.5);
  return { cancelled, cur, ammo, back: w.current, reloadingAgain: w.reloading };
});
check(r.cancelled && r.cur === 'pistol' && r.ammo === 0, '换弹中切枪：换弹中止，子弹数不变', r);
check(r.back === 'rifle' && r.reloadingAgain, '切回空枪自动开始换弹', r);
await p.evaluate(() => tick(2));

// ---- 3. 手雷：攥着握片永远不炸，出手才开始计时 ----
r = await p.evaluate(() => {
  const w = game.weapon, G = game.grenades;
  press('Digit3'); tick(0.5);
  press('Mouse0'); hold('Mouse0'); tick(10);       // 攥 10 秒（引信 3 秒）
  const held = { state: w.throwState, flying: G.flying.length, hp: game.player.health, alive: game.player.alive };
  release('Mouse0'); tick(0.2);
  const g0 = G.flying[0];
  const thrown = g0 ? { fuse: +g0.fuse.toFixed(2), full: Game.Config.grenades.frag.fuse, spoon: g0.model.getObjectByName('spoon').visible, pin: g0.model.getObjectByName('pin').visible } : null;
  return { held, thrown };
});
check(r.held.state === 'hold' && r.held.flying === 0 && r.held.alive && r.held.hp === 100, '拔环攥 10 秒不炸', r.held);
check(r.thrown && r.thrown.fuse > r.thrown.full - 0.3 && !r.thrown.spoon && !r.thrown.pin, '出手后引信从满的开始走，握片和拉环都没了', r.thrown);
await p.evaluate(() => tick(4));

// ---- 4. 经济 ----
r = await p.evaluate(() => {
  const e = game.economy, out = {};
  out.start = e.money;
  const kill = (hit) => { const b = game.bots.bots.find((x) => x.alive); b.takeDamage(999, hit); game.bots.phase = 'fighting'; game.bots.spawnBot(0.5, game.player.position); for (const nb of game.bots.bots) if (nb.alive) { nb.pos.set(30, 0, 30); nb.update = () => false; } };
  kill({ part: 'head' }); out.head = e.money;
  kill({ part: 'leg' }); out.leg = e.money;
  kill({ part: 'body', explosion: true }); out.frag = e.money;
  kill({ part: 'body', explosion: true, byBot: true }); out.selfKill = e.money;
  for (let i = 0; i < 10; i++) kill({ part: 'head' });
  out.capped = e.money;
  return out;
});
check(r.start === 600 && r.head === 1100 && r.leg === 1400 && r.frag === 1700 && r.selfKill === 1700, '赏金：开局 600，爆头 500 / 普通 300 / 手雷 300，NPC 自己炸死不算（#7）', r);
check(r.capped === 2000, '钱封顶 2000', r.capped);

r = await p.evaluate(() => {
  const e = game.economy, w = game.weapon, pl = game.player;
  w.equipNow('rifle');
  pl.position.copy(pl.spawn); tick(0.1);
  const zone = e.inZone, tip = document.getElementById('buy-cue').classList.contains('show');
  press('KeyB'); tick(1 / 60);
  const open = e.open;
  const before = { ...w.counts };
  // 买成功面板就关了（v0.30），再买要重新按 B；买不了面板不关
  press('Digit3'); tick(1 / 60);
  press('KeyB'); tick(1 / 60); press('Digit3'); tick(1 / 60);
  press('KeyB'); tick(1 / 60); press('Digit3'); tick(1 / 60);   // 上限 2，这次买不了，面板还开着
  press('Digit4'); tick(1 / 60);
  press('KeyB'); tick(1 / 60);         // 截面板用
  return { zone, tip, open, before, after: { ...w.counts }, money: e.money, current: w.current, pending: w.pending };
});
check(r.zone && r.open && r.tip, '出生点里按 B 打开面板', r);
check(r.after.frag === 2 && r.after.flash === 1 && r.money === 2000 - (2 - r.before.frag) * 300 - 200, '买到手雷和闪光，扣钱正确，手雷上限 2', r);
check(r.current === 'rifle' && !r.pending, '面板开着时按 3/4 是买东西，不切武器', { current: r.current, pending: r.pending });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}buy-menu.jpg`, type: 'jpeg', quality: 85 });

r = await p.evaluate(() => {
  const e = game.economy, pl = game.player;
  pl.position.x += 6; tick(0.1);
  return { open: e.open, menu: document.getElementById('buy').style.display };
});
check(!r.open && r.menu === 'none', '走出购买区面板自动关掉', r);

// 重生回到开局数量，钱保留
r = await p.evaluate(() => { game.weapon.respawn(); return { counts: { ...game.weapon.counts }, money: game.economy.money }; });
check(r.counts.frag === 1 && r.counts.flash === 0 && r.money === 1200, '重生：投掷物回到开局数量，钱保留', r);

// 波次之间补给不收走多买的
r = await p.evaluate(() => { game.weapon.counts.frag = 2; game.weapon.refill(true); return game.weapon.counts.frag; });
check(r === 2, '波次补给不收走多买的', r);

// 训练场没有经济
r = await p.evaluate(() => { game.startMode('range'); return { enabled: game.economy.enabled, money: document.getElementById('money').style.display }; });
check(!r.enabled && r.money === 'none', '训练场不显示钱', r);

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
