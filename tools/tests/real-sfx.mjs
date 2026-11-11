// v0.33 的针对性测试：真实录音音效（#45）
//   1. 点开始（audio.init）后 assets/sound/ 的录音全部下载、解码成功；每段起音在开头、峰值正常、不是静音
//   2. 自己开枪按当前选的枪放录音（AK / M4 / 手枪各两发随机挑），NPC 开枪放那把枪的中距录音，越远越闷越轻
//   3. 换弹（空枪）按动作顺序放 卸弹匣 → 插弹匣 → 拉机柄 → 放机柄；手雷 / 闪光放爆炸录音，越远越闷
//   4. 录音没下完时 sample() 返回 false，退回合成声，不报错
// 用法（在仓库根目录）：node tools/tests/real-sfx.mjs
// 开发机没有声卡也听不到，好不好听要负责人真机试；这里只保证接线和素材本身没问题。
import { openGame } from '../lib/game-page.mjs';
const g = await openGame({ width: 960, height: 540 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('waves');
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
  game.audio.init();
  // 记下 sample() 放了什么、参数是什么、有没有真的放出来
  window.played = [];
  const a = game.audio, f = a.sample.bind(a);
  a.sample = (name, o = {}) => { const ok = f(name, o); played.push({ name, ok, ...o }); return ok; };
});

// 1. 下载、解码
const files = await p.evaluate(() => Game.Config.audio.samples.files);
await p.waitForFunction((n) => Object.keys(game.audio.buffers).length >= n, files.length, { timeout: 20000 }).catch(() => {});
const info = await p.evaluate(() => Object.fromEntries(Object.entries(game.audio.buffers).map(([k, b]) => {
  const d = b.getChannelData(0);
  let peak = 0, on = -1;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.15) { on = i; break; }   // 和 build.py 换弹的 trigger 一样：卸弹匣开头是释放钮的轻"咔"，也算起音
  return [k, { dur: +b.duration.toFixed(2), peak: +peak.toFixed(2), onMs: Math.round((on / b.sampleRate) * 1000) }];
})));
check(files.every((f) => info[f]), '全部录音已解码', files.filter((f) => !info[f]));
for (const f of files) {
  const i = info[f];
  // 起音：mp3 编码器会在开头补一小段静音（约 25ms），所以给 60ms 的余量
  if (i) check(i.peak > 0.5 && i.peak <= 1 && i.onMs < 60 && i.dur > 0.2 && i.dur < 3, `录音 ${f} 起音在开头、峰值正常`, i);
}

// 2. 开枪
const shots = await p.evaluate(() => {
  played.length = 0;
  const C = Game.Config.weapons, out = {};
  const rifle = C.rifle.sound;
  for (let i = 0; i < 12; i++) game.audio.shot('rifle');
  out.rifle = { sound: rifle, names: [...new Set(played.map((x) => x.name))].sort(), ok: played.every((x) => x.ok) };
  played.length = 0;
  for (let i = 0; i < 12; i++) game.audio.shot('pistol');
  out.pistol = [...new Set(played.map((x) => x.name))].sort();
  played.length = 0;
  game.audio.botShot(0.5, 3, 'm4'); game.audio.botShot(-0.5, 40, 'm4');
  out.bot = played.map((x) => ({ name: x.name, vol: +x.vol.toFixed(3), cutoff: Math.round(x.cutoff), pan: x.pan }));
  return out;
});
check(shots.rifle.ok && shots.rifle.names.join() === `${shots.rifle.sound}-1,${shots.rifle.sound}-2`, '自己开枪：步枪两发随机挑', shots.rifle);
check(shots.pistol.join() === 'pistol-1,pistol-2', '自己开枪：手枪两发随机挑', shots.pistol);
const [near, far] = shots.bot;
check(near && far && near.name === 'm4-far' && far.name === 'm4-far', 'NPC 开枪用那把枪的中距录音', shots.bot);
check(near && far && far.cutoff < near.cutoff && far.vol < near.vol && near.pan === 0.5, 'NPC 枪声越远越闷越轻、分左右', shots.bot);

// 3. 换弹：真的打空一匣，走一遍换弹动作
const reload = await p.evaluate(() => {
  press('Digit1'); tick(0.5);
  const w = game.weapon;
  w.guns[w.current].ammo = 0; w.guns[w.current].reserve = 30;   // 没备弹不换弹（#7）
  played.length = 0;
  press('KeyR'); tick(Game.Config.weapons.rifle.reloadTime + 0.5);
  return played.map((x) => x.name);
});
check(reload.join() === 'mag-out,mag-in,rack-back,rack-forward', '空枪换弹按动作顺序放四段录音', reload);

const boom = await p.evaluate(() => {
  played.length = 0;
  game.audio.explosion(2); game.audio.explosion(45); game.audio.flashBang(5);
  return played.map((x) => ({ name: x.name, cutoff: Math.round(x.cutoff), vol: +x.vol.toFixed(3) }));
});
check(boom.map((x) => x.name).join() === 'frag,frag,flash', '手雷、闪光放爆炸录音', boom);
check(boom[1] && boom[1].cutoff < boom[0].cutoff && boom[1].vol < boom[0].vol, '远处的爆炸更闷更轻', boom.slice(0, 2));

// 4. 没下完时退回合成声
const fallback = await p.evaluate(() => {
  const keep = game.audio.buffers;
  game.audio.buffers = {};
  played.length = 0;
  let err = null;
  try {
    game.audio.shot('rifle'); game.audio.botShot(0, 10, 'ak'); game.audio.magIn(); game.audio.explosion(5); game.audio.flashBang(5);
  } catch (e) { err = e.message; }
  game.audio.buffers = keep;
  return { err, played: played.map((x) => x.ok) };
});
check(!fallback.err && fallback.played.length === 5 && fallback.played.every((x) => x === false), '录音没下完时用合成声、不报错', fallback);

check(g.problems.length === 0, '控制台没有报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
