// v0.21 开发者模式：密码解锁 → 录帧数据 → 录画面 → 上传，检查录制开销和每帧内存分配。
// 起一个 server/api.py（出静态文件 + 开发接口，临时数据目录），用无头 Chromium 打开。
//   node tools/tests/devlog.mjs
// 截图在 tools/out/tests/，上传的数据在 tools/out/tests/devlogs/。失败时退出码非 0。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { openGame, ROOT, OUT } from '../lib/game-page.mjs';

const DIR = path.join(OUT, 'tests');
const DATA = path.join(DIR, 'devlogs');
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

let fails = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) fails++; };

// ---- 接口服务 ----
const PORT = 18000 + Math.floor(Math.random() * 1000);
const api = spawn('python3', [path.join(ROOT, 'server/api.py'), '--static', ROOT, '--port', String(PORT), '--data', DATA], {
  env: { ...process.env, DEV_PASSWORD: 'test-pw', API_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 800));

const g = await openGame({ width: 1280, height: 720, url: `http://127.0.0.1:${PORT}/` });
const p = g.page;
try {
  // ---- 解锁 ----
  await p.click('.tabs [data-tab="settings"]');
  check(await p.isVisible('#dev-pw'), '没解锁时只显示密码框');
  check(!(await p.isVisible('#dev-on')), '没解锁时看不到开关');
  await p.fill('#dev-pw', 'wrong');
  await p.click('#dev-unlock');
  await p.waitForFunction(() => /密码不对/.test(document.getElementById('dev-result').textContent));
  check(!(await p.evaluate(() => Game.DevLog.on)), '密码错：不开');
  await p.fill('#dev-pw', 'test-pw');
  await p.click('#dev-unlock');
  await p.waitForFunction(() => Game.DevLog.on);
  check(await p.isVisible('#dev-on'), '密码对：显示开关并自动打开');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('direct-strike.dev.v1')));
  check(!!stored.token && stored.enabled === true, '令牌存进 localStorage');
  await p.screenshot({ path: path.join(DIR, 'devlog-settings-empty.jpg'), type: 'jpeg', quality: 85 });

  // ---- 每帧开销和内存分配：直接调 sample，热身后用采样堆分析器看 sample 有没有分配内存 ----
  await p.evaluate(() => {
    game.ui.show(null);
    game.startMode('range');
    game.input.locked = true;          // 这里就是要让真实循环也录（开发者模式只录战斗中的帧）
    game.input.down.add('KeyW');
    for (let i = 0; i < 6000; i++) Game.DevLog.sample(1 / 144, 1 / 144);   // 热身，让 V8 优化
  });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32 });
  const perf = await p.evaluate(() => {
    const t = performance.now();
    for (let i = 0; i < 20000; i++) Game.DevLog.sample(1 / 144, 1 / 144);
    return (performance.now() - t) / 20000 * 1000;
  });
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  let allocBytes = 0;
  const walk = (n, inSample) => {
    const here = inSample || (n.callFrame.functionName === 'sample' && n.callFrame.url.endsWith('devlog.js'));
    if (here) allocBytes += n.selfSize;
    for (const c of n.children) walk(c, here);
  };
  walk(profile.head, false);
  check(perf < 20, '每帧录制耗时（本机 CPU 计时）', `${perf.toFixed(2)} µs/帧`);
  check(allocBytes < 4096, '20000 帧里 sample 分配的内存', `${allocBytes} 字节`);

  // ---- 事件：开枪、换弹、标记 ----
  await p.evaluate(() => {
    Game.DevLog.renderPanel();                      // 按钮状态在面板刷新时更新
    document.getElementById('dev-clear').click();   // 先清掉热身数据
    // 按固定步长推进时用模拟时钟，录下的时间和真机上 60Hz 一样
    let simT = performance.now() - 60000;   // 放在 60 秒前，后面真实循环录的帧时间才接得上（保持递增）
    window.simAdvance = (ms) => { simT += ms; Game.DevLog._debug.simNow = simT; };
    window.press = (c) => game.input.pressed.add(c);
    window.tick = (sec, step = 1 / 60) => {
      for (let t = 0; t < sec; t += step) {
        game.player.update(step, game.input); game.camera.updateMatrixWorld();
        game.economy.update(step); game.weapon.update(step, game.input);
        game.hud.update(step, game.player);
        simAdvance(step * 1000);
        Game.DevLog.sample(step, step);
        game.input.endFrame();
      }
    };
    game.input.down.delete('KeyW');
    press('Mouse0'); game.input.down.add('Mouse0'); tick(0.5); game.input.down.delete('Mouse0');
    press('KeyR'); tick(3);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
    press('Digit2'); tick(1);
    press('Digit3'); tick(0.6); press('Mouse0'); game.input.down.add('Mouse0'); tick(0.4); game.input.down.delete('Mouse0'); tick(1.5);
    Game.DevLog._debug.simNow = -1;
  });
  const ev = await p.evaluate(() => Game.DevLog._debug.buildFrames().events.map((e) => e.type));
  for (const t of ['fire', 'reloadStart', 'reloadEnd', 'marker', 'switch', 'throw']) check(ev.includes(t), `事件 ${t}`);

  // ---- 录画面 ----
  // 无头 Chromium + 软件渲染下录 WebGL 画面会卡住出帧（显卡进程被拖住），录出来是空的，
  // 所以这里只测：开关、切片和上传的流程，以及"变卡就自动关掉"的保护。真实效果要在有显卡的电脑上看。
  await p.evaluate(() => { document.getElementById('dev-video').click(); });
  check(await p.evaluate(() => Game.DevLog._debug.video.recording), '录画面开关打开后开始录');
  await p.waitForTimeout(12000);
  const vstate = await p.evaluate(() => ({ on: Game.DevLog._debug.video.on, msg: document.getElementById('dev-result').textContent }));
  check(!vstate.on && /自动关闭/.test(vstate.msg), '录画面卡住时自动关闭', vstate.msg);
  await p.evaluate(() => { game.input.locked = false; game.input.onLockChange(false); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-pause-dev').click());
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(DIR, 'devlog-pause-panel.jpg'), type: 'jpeg', quality: 85 });
  const segs = await p.evaluate(() => document.querySelector('#dev-stats').textContent);
  const nSeg = Number((segs.match(/画面\s*(\d+) 片/) || [])[1] || 0);
  check(nSeg > 0, '有视频切片', segs.match(/画面[^显]*/)?.[0]);

  // ---- 上传 ----
  await p.click('#dev-upload');
  await p.waitForFunction(() => /已上传|失败/.test(document.getElementById('dev-result').textContent), null, { timeout: 60000 });
  const result = await p.evaluate(() => document.getElementById('dev-result').textContent);
  check(/已上传/.test(result), '上传', result);
  const id = (result.match(/\d{8}-\d{6}-[0-9a-f]{6}/) || [])[0];
  const dir = id && path.join(DATA, id);
  const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  check(files.includes('frames.json.gz') && files.includes('meta.json'), '服务器收到帧数据', files.join(' '));
  check(files.some((f) => f.endsWith('.webm')), '服务器收到视频切片');
  if (files.includes('frames.json.gz')) {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'frames.json.gz'))));
    check(j.format === 'direct-strike-devlog' && j.t.length > 300 && j.data.vmY.length === j.t.length, '帧数据格式', `${j.t.length} 帧，${j.channels.length} 个通道`);
    check(j.video.length > 0 && j.meta.gpu, '附带视频索引和显卡信息', j.meta.gpu);
  }
  await p.screenshot({ path: path.join(DIR, 'devlog-uploaded.jpg'), type: 'jpeg', quality: 85 });

  // ---- 战斗中的浮层 ----
  await p.evaluate(() => { game.ui.show(null); game.input.locked = true; });
  await p.waitForTimeout(2500);
  check(await p.isVisible('#dev-hud'), '战斗浮层');
  await p.screenshot({ path: path.join(DIR, 'devlog-hud.jpg'), type: 'jpeg', quality: 85 });
  await p.evaluate(() => { game.input.locked = false; });

  // 故意输错密码时浏览器会自动打一条 403，不算问题
  const problems = g.problems.filter((x) => !/403/.test(x));
  check(problems.length === 0, '控制台没有报错', problems.join(' | '));
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await g.close();
  api.kill();
}
// ---- 分析脚本能读这次上传 ----
{
  const { execFileSync } = await import('node:child_process');
  let out = '';
  try {
    out = execFileSync('node', [path.join(ROOT, 'tools/devlog/analyze.mjs'), '--at', '20'], { env: { ...process.env, DEVLOG_DIR: DATA }, encoding: 'utf8', timeout: 300000 });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || e.message); }
  check(/## 帧时间/.test(out) && /#1 /.test(out), '分析脚本出报告', (out.match(/中位 [\d.]+ms[^\n]*/) || [''])[0]);
  check(/marker-1\.png/.test(out), '分析脚本出标记曲线图');
}

console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
