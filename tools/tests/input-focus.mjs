// v0.26 的针对性测试：键盘和全屏（js/input.js）。
// - 点"继续"时先锁鼠标再请求全屏；锁定被拒自动重试一次，还不行才提示
// - 全屏时接管键盘（Keyboard Lock），短按 Esc 只暂停、不退全屏
// - 窗口失去焦点、按了 ⌘：按住的键全部放开；失焦一会儿没回来自动暂停
// 无头浏览器模拟不了"玩家按 Esc 让浏览器退出全屏"和 Mac 的聚焦搜索，那两步要真机确认。
// 用法（在仓库根目录）：node tools/tests/input-focus.mjs
import { openGame } from '../lib/game-page.mjs';
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };
const state = () => p.evaluate(() => ({
  screen: game.ui.screen, fs: !!document.fullscreenElement, lock: game.input.locked,
  down: [...game.input.down], calls: calls.splice(0),
  toast: !!(document.getElementById('toast') && document.getElementById('toast').classList.contains('on')),
}));

// 开发机没有显卡，页面很慢，固定等待不可靠：等条件满足（最多 20 秒），等不到就照常往下走让 check 报失败
const until = (fn) => p.waitForFunction(fn, null, { timeout: 20000 }).catch(() => {});
const L = () => game.input.locked, U = () => !game.input.locked;
const FS = () => !!document.fullscreenElement, NOFS = () => !document.fullscreenElement;
// 用真实鼠标点"继续"（全屏和锁鼠标都要真实的用户手势）
const resume = async () => { const b = await p.locator('#btn-resume').boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
await p.evaluate(() => {
  window.calls = [];
  const el = game.input.element, root = document.documentElement;
  window.realLock = el.requestPointerLock.bind(el);
  window.failLocks = 0;   // 接下来几次锁定请求假装被浏览器拒绝
  el.requestPointerLock = () => {
    calls.push('lock');
    if (failLocks > 0) { failLocks--; setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0); return Promise.resolve(); }
    return realLock();
  };
  const realFs = root.requestFullscreen.bind(root);
  root.requestFullscreen = (o) => { calls.push('fs'); return realFs(o); };
  const kb = navigator.keyboard;
  if (kb) { const l = kb.lock.bind(kb); kb.lock = (...a) => { calls.push('kblock'); return l(...a); }; }
  game.ui.onDeploy('duel');
});
await p.mouse.click(640, 360);          // 简报：点任意处锁鼠标
await until(L);
let s = await state();
check(s.lock && s.screen === null, '简报点击后进入战斗', s);

// ---- 按住的键：⌘ 和失焦 ----
await p.keyboard.down('KeyW');
s = await state();
check(s.down.includes('KeyW'), '按住 W', s.down);
await p.keyboard.down('MetaLeft');
s = await state();
check(s.down.length === 0, '按下 ⌘：按住的键全放开', s.down);
await p.keyboard.down('Space');         // ⌘+空格
s = await state();
check(!s.down.includes('Space'), '⌘+空格 不算跳跃', s.down);
await p.keyboard.up('Space'); await p.keyboard.up('MetaLeft'); await p.keyboard.up('KeyW');

await p.keyboard.down('KeyW');
await p.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
s = await state();
check(s.down.length === 0 && s.lock, '失焦：按键立刻放开，还没暂停', s);
await until(U);
s = await state();
check(!s.lock && s.screen === 'pause', '失焦一会儿没回来：自动暂停', { ...s, dbg: await p.evaluate(() => ({ hf: document.hasFocus(), ple: !!document.pointerLockElement })) });
await p.evaluate(() => { delete document.hasFocus; });
await p.keyboard.up('KeyW');

// ---- 点"继续"：先锁鼠标再全屏，全屏后接管键盘 ----
await p.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));   // 无头浏览器里"进入战斗"的全屏请求可能这时才生效
await until(NOFS);
await p.evaluate(() => { calls.length = 0; });
await until(() => game.ui.screen === 'pause'); await resume();
await until(() => game.input.locked && !!document.fullscreenElement && game.input.keyboardLocked);
s = await state();
check(s.lock && s.fs && s.screen === null, '点继续：锁定 + 全屏', s);
check(s.calls.indexOf('lock') === 0 && s.calls.indexOf('fs') === 1, '先锁鼠标再请求全屏', s.calls);
const hasKb = await p.evaluate(() => !!navigator.keyboard);
if (hasKb) check(s.calls.includes('kblock') && await p.evaluate(() => game.input.keyboardLocked), '全屏后接管键盘', s.calls);

// ---- 短按 Esc：暂停，不退全屏；再点继续直接锁上 ----
await p.keyboard.press('Escape');
await until(U);
s = await state();
check(!s.lock && s.screen === 'pause' && s.fs, '短按 Esc：暂停，全屏还在', s);
await until(() => game.ui.screen === 'pause'); await resume();
await until(L);
s = await state();
check(s.lock && s.fs && !s.toast && !s.calls.includes('fs'), '再点继续：直接锁上，没有报错', s);

// ---- 锁定被拒：自动重试一次；连续两次被拒才提示 ----
await p.evaluate(() => document.exitPointerLock());
await until(U);
await p.evaluate(() => { failLocks = 1; });
await until(() => game.ui.screen === 'pause'); await resume();
await until(L);
s = await state();
check(s.lock && !s.toast && s.calls.filter((c) => c === 'lock').length === 2, '被拒一次：自动重试成功，不提示', s);
await p.evaluate(() => document.exitPointerLock());
await until(U);
await p.evaluate(() => { failLocks = 2; });
await until(() => game.ui.screen === 'pause'); await resume();
await until(() => !!document.querySelector('#toast.on'));
s = await state();
check(!s.lock && s.toast && s.screen === 'pause', '连续被拒两次：提示再点一次', s);

// ---- 退出全屏后再点继续（全屏过渡中锁定被拒 → 等全屏好了再锁）----
await p.evaluate(() => document.exitFullscreen());
await until(NOFS);
await p.evaluate(() => { failLocks = 1; calls.length = 0; });
await until(() => game.ui.screen === 'pause'); await resume();
await until(() => game.input.locked && !!document.fullscreenElement);
s = await state();
check(s.lock && s.fs && s.screen === null, '退出全屏后点继续，第一次被拒：全屏好了再锁上', s);

check(g.problems.length === 0, '控制台没有报错', g.problems);
await g.close();
console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
