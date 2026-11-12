#!/usr/bin/env node
// 启动游戏并检查：WebGL、模型加载、控制台报错、各模式截图和基础状态。
// 默认只打印摘要，完整问题列表写到 tools/out/verify/report.json。有问题时退出码为 1。
//
// 用法：node tools/verify.mjs [--modes menu,settings,brief,range,duel,waves,pause,result] [--sizes 1280x720,1920x1080]
//                             [--seconds 3] [--eval "JS 表达式"] [--url https://...] [--weather rainDusk]
// --weather：先换成这个天气 / 时段（config.js 的 weather.presets 的键）再截图，截图文件名带上天气（#77）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openGame, OUT } from './lib/game-page.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const modes = arg('modes', 'menu,range,duel').split(',');
const sizes = arg('sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const seconds = Number(arg('seconds', 3));
const expr = arg('eval');
const url = arg('url');
const weather = arg('weather');
const dir = path.join(OUT, 'verify');
fs.mkdirSync(dir, { recursive: true });

// 进入模式。无头环境拿不到真实的指针锁定，所以直接把 locked 置真，让游戏循环跑起来。
// 除了 range / duel / waves 三个玩法模式，还能截界面：
//   menu 首页  settings 设置页  brief 作战简报  pause 暂停（对决中）  result 结算（对决胜利）
const enterMode = (page, m) => page.evaluate((mode) => {
  const ui = game.ui;
  game.input.locked = false;
  if (mode === 'menu' || mode === 'settings') { ui.onQuit(); ui.setTab(mode === 'menu' ? 'play' : 'settings'); return; }
  if (mode === 'brief') { game.startMode('duel'); ui.showBrief('duel'); return; }
  if (mode === 'pause' || mode === 'result') {
    game.startMode('duel');
    ui.show(null);
    if (mode === 'result') { game.bots.score.player = Game.Config.duel.winScore; game.bots.score.bot = 2; game.bots.phase = 'over'; }
    game.input.onLockChange(false);   // 走真实的"解锁鼠标"流程
    return;
  }
  game.startMode(mode);
  ui.show(null);
  game.input.locked = true;
}, m);

const measure = (page, ms) => page.evaluate((duration) => new Promise((resolve) => {
  let frames = 0;
  const t0 = performance.now();
  // 一帧分世界和枪模两遍渲染，默认统计每遍都会清零，这里改为累计后按帧平均
  const info = game.renderer.info;
  info.autoReset = false;
  info.reset();
  const tick = () => {
    frames++;
    if (performance.now() - t0 < duration) { requestAnimationFrame(tick); return; }
    info.autoReset = true;
    const gl = game.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    resolve({
      fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1),
      calls: Math.round(info.render.calls / frames),
      tris: Math.round(info.render.triangles / frames),
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      bots: game.bots.aliveMeshes ? game.bots.aliveMeshes().length : 0,
      alive: game.player.alive,
      overlay: getComputedStyle(document.getElementById('overlay') || document.body).display,
    });
  };
  requestAnimationFrame(tick);
}), ms);

const report = { runs: [], problems: [] };
let bad = false;
for (const [width, height] of sizes) {
  const { page, problems, modelOk, startupSeconds, close } = await openGame({ width, height, url });
  report.startupSeconds = startupSeconds;
  console.log(`启动: ${startupSeconds}s（到首帧，含软件渲染开销）`);
  if (!modelOk) { problems.push('NPC 模型加载失败，游戏退回了方块小人'); }
  if (weather) {
    const ok = await page.evaluate((w) => {
      if (!Game.Config.weather.presets[w]) return false;
      Game.Settings.set('weather', w);
      return game.world.setWeather(w).then(() => game.world.weather === w);
    }, weather);
    if (!ok) problems.push(`天气 ${weather} 没换上（预设不存在或素材加载失败）`);
  }
  const tag = weather ? `-${weather}` : '';
  for (const m of modes) {
    await enterMode(page, m);
    const s = await measure(page, seconds * 1000);
    const png = path.join(dir, `${m}${tag}-${width}x${height}.png`);
    const small = png.replace(/\.png$/, '.small.jpg');
    await page.screenshot({ path: png });
    execFileSync('magick', [png, '-resize', '800x800>', '-quality', '75', small]);
    report.runs.push({ mode: m, size: `${width}x${height}`, ...s, screenshot: path.relative(process.cwd(), small) });
    console.log(`${m.padEnd(6)} ${width}x${height}  ${String(s.fps).padStart(5)}fps  draw=${s.calls} tris=${s.tris} botMeshes=${s.bots}  ${path.relative(process.cwd(), small)}`);
  }
  if (expr) {
    const v = await page.evaluate(expr);
    console.log('eval:', JSON.stringify(v));
    report.eval = v;
  }
  const gpu = report.runs.at(-1)?.gpu;
  if (gpu) console.log(`渲染器: ${gpu}`);
  console.log(`模型: ${modelOk ? '加载成功' : '失败'}`);
  report.problems.push(...problems);
  if (problems.length || !modelOk) bad = true;
  await close();
}
const uniq = [...new Set(report.problems)];
report.problems = uniq;
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
if (uniq.length) {
  console.log(`问题 ${uniq.length} 条（前 5 条，全部见 tools/out/verify/report.json）：`);
  uniq.slice(0, 5).forEach((p) => console.log(`  ${p.slice(0, 200)}`));
} else console.log('问题: 0');
process.exit(bad ? 1 : 0);
