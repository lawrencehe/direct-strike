// 改键冲突（#94）：以前把 buy 改成 F 的玩家，后来新加的 quickBuy 默认也是 F，
// 读改键时要去重，F 归快捷购买，B 菜单退回默认的 B；按 F 打开的是左侧的快捷套餐
// 用法（在仓库根目录）：node tools/tests/key-conflict.mjs
import { openGame } from '../lib/game-page.mjs';
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

const r = await p.evaluate(() => {
  const I = Game.Input;
  const load = (saved) => { localStorage.setItem(I.STORAGE_KEY, JSON.stringify(saved)); return I.loadBindings(); };
  const out = {};
  // 1. 开发者数据 20261113-053518-c894f9 里的真实情况：buy 和 quickBuy 都是 F
  const real = I.defaultBindings(); real.buy = ['KeyF'];
  const a = load(real);
  out.real = { buy: a.buy, quickBuy: a.quickBuy };
  // 2. 更早的存档里还没有 quickBuy 这一项
  const old = I.defaultBindings(); old.buy = ['KeyF']; delete old.quickBuy;
  const b = load(old);
  out.old = { buy: b.buy, quickBuy: b.quickBuy };
  // 3. 退回的默认键也被占了：buy 改成 F、reload 改成 B → buy 不绑定
  const busy = I.defaultBindings(); busy.buy = ['KeyF']; busy.reload = ['KeyB'];
  const c = load(busy);
  out.busy = { buy: c.buy, reload: c.reload, quickBuy: c.quickBuy };
  // 4. 没冲突的改键原样保留
  const fine = I.defaultBindings(); fine.reload = ['KeyE']; fine.buy = ['KeyG'];
  const d = load(fine);
  out.fine = { reload: d.reload, buy: d.buy, quickBuy: d.quickBuy };
  // 任何结果里都不能有一个键绑两个动作
  out.dup = [a, b, c, d].map((x) => { const seen = {}; let dup = 0; for (const k of Object.values(x).flat()) { if (seen[k]) dup++; seen[k] = 1; } return dup; });

  // 5. 用真实改键进游戏，按 F 打开的是快捷菜单
  game.input.bindings = load(real);
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('range');
  game.player.position.copy(game.player.spawn);
  const step = () => { game.economy.update(1 / 60); game.input.endFrame(); };
  step();
  game.input.pressed.add('KeyF'); step();
  out.menuF = game.economy.menu;
  game.input.pressed.add('KeyF'); step();
  game.input.pressed.add('KeyB'); step();
  out.menuB = game.economy.menu;
  localStorage.removeItem(I.STORAGE_KEY);
  return out;
});
check(r.real.quickBuy[0] === 'KeyF' && r.real.buy[0] === 'KeyB', 'buy、quickBuy 都是 F → F 归快捷购买，B 菜单退回 B', r.real);
check(r.old.quickBuy[0] === 'KeyF' && r.old.buy[0] === 'KeyB', '旧存档没有 quickBuy → 同上', r.old);
check(r.busy.buy.length === 0 && r.busy.reload[0] === 'KeyB' && r.busy.quickBuy[0] === 'KeyF', '退回的默认键也被占了 → 不绑定', r.busy);
check(r.fine.reload[0] === 'KeyE' && r.fine.buy[0] === 'KeyG' && r.fine.quickBuy[0] === 'KeyF', '没冲突的改键原样保留', r.fine);
check(r.dup.every((n) => n === 0), '没有一个键绑两个动作', r.dup);
check(r.menuF === 'quick', '按 F 打开快捷菜单', r.menuF);
check(r.menuB === 'classic', '按 B 打开经典菜单', r.menuB);

await g.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
