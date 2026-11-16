// Blender 地图工具的完整测试（#115）：从打包一直到游戏里用上改过的地图。
//   1. tools/mapkit/build.sh 打包插件 zip
//   2. 用 Blender 的 extension install-file 装进一个临时的用户目录（和负责人"从磁盘安装"一样，不碰开发机自己的 Blender 设置）
//   3. Blender 里跑 tools/mapkit/test_blender.py：打开 yard 原样导出逐字节相同；模拟挪、转、复制、加点位后导出，检查字段
//   4. map-check 检查改过的地图（能走通、出生点不卡）
//   --ui：在虚拟显示器（xvfb-run）里开真正的 Blender 界面，截图侧栏面板，每种东西选中一次检查面板画得出来（后台模式不画界面）
//   5. 游戏里：开发者设置"载入地图文件" → 页面刷新后用的是本地地图（挪过的平台碰撞跟着走）→ 上传给开发 → 换回原来的地图；格式不对的文件不载入
// 用法（仓库根目录）：node tools/tests/mapkit.mjs [--render] [--ui]      --render 顺便渲染预览图到 tools/out/mapkit-test/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { openGame, OUT } from '../lib/game-page.mjs';

const dir = path.join(OUT, 'mapkit-test');
fs.mkdirSync(dir, { recursive: true });
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

// 1. 打包
console.log(execFileSync('tools/mapkit/build.sh', { encoding: 'utf8' }).trim());
const zip = path.join(OUT, 'mapkit/ds_mapkit.zip');

// 2、3. 装进临时的 Blender 用户目录，跑 Blender 里的测试
const user = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-blender-'));
const env = { ...process.env, BLENDER_USER_RESOURCES: user };
const inst = spawnSync('blender', ['-b', '--factory-startup', '--command', 'extension', 'install-file', '-r', 'user_default', '--enable', zip], { env, encoding: 'utf8' });
check(inst.status === 0 && /Installed/.test(inst.stdout), 'Blender 里安装插件 zip', inst.stdout.trim().split('\n').at(-1));
const args = ['-b', '--python', 'tools/mapkit/test_blender.py', '--', dir];
if (process.argv.includes('--render')) args.push('--render');
const bl = spawnSync('blender', args, { env, encoding: 'utf8', maxBuffer: 64 << 20 });
const lines = bl.stdout.split('\n').filter((l) => /^(PASS|FAIL|RENDER|Traceback)|Error:/.test(l));
lines.forEach((l) => console.log('  [blender]', l));
check(bl.status === 0, 'Blender 里的测试全部通过', bl.status === 0 ? undefined : bl.stderr.slice(-2000));
if (process.argv.includes('--ui')) {
  const ui = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', 'blender', '--factory-startup', '--enable-event-simulate',
    '--python', 'tools/mapkit/shot_ui.py', '--', dir], { env, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 400000 });
  const out = ui.stdout + ui.stderr;
  const sel = (out.match(/^SELECT /gm) || []).length;
  check(out.includes('UI DONE') && !out.includes('Traceback'), `Blender 界面：面板画得出来（选中了 ${sel} 种东西），截图 ui-top.png、ui-persp.png`,
    out.includes('Traceback') ? out.slice(out.indexOf('Traceback'), out.indexOf('Traceback') + 1500) : undefined);
}
fs.rmSync(user, { recursive: true, force: true });

// 4. 改过的地图过 map-check
const edited = path.join(dir, 'edited.json');
const mc = spawnSync('node', ['tools/map-check.mjs', '--map', edited], { encoding: 'utf8' });
console.log(mc.stdout.split('\n').map((l) => `  [map-check] ${l}`).join('\n'));
check(mc.status === 0, '改过的地图通过 map-check');
if (fs.existsSync(path.join(OUT, 'map/topdown.png'))) fs.copyFileSync(path.join(OUT, 'map/topdown.png'), path.join(dir, 'edited-topdown.png'));

// 5. 游戏里载入、上传、换回
const g = await openGame({ width: 1280, height: 720, cold: true });
const p = g.page;
const uploads = [];
await p.route('**/api/dev/uploads', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: '20261116-120000-abc123' }) }));
await p.route('**/api/dev/uploads/*/*', (r) => { uploads.push({ url: r.request().url(), body: r.request().postData() }); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });

// 格式不对（旧格式）的文件：不载入、不刷新
const bad = path.join(dir, 'bad-v1.json');
fs.writeFileSync(bad, JSON.stringify({ name: '旧格式', objects: [], spawns: [] }));
await p.setInputFiles('#dev-map-file', bad);
await p.waitForFunction(() => document.getElementById('dev-map-result').textContent.includes('载入失败'));
check(true, '旧格式的地图文件不载入', await p.textContent('#dev-map-result'));

// 载入改过的地图 → 页面刷新
await Promise.all([p.waitForEvent('load'), p.setInputFiles('#dev-map-file', edited)]);
await p.waitForFunction(() => window.Game && Game.Main && Game.Main.ready);
const home = await p.evaluate(() => ({ state: document.getElementById('dev-map-state').textContent, body: document.body.innerText }));
check(home.state.includes('本地文件'), '开发者设置里显示用的是本地文件', home.state);
check(home.body.includes('（本地文件）'), '首页的地图名标了（本地文件）');
await p.evaluate(() => Game.Main.load('duel'));
await p.waitForFunction(() => window.game && window.game.startMode);
const w = await p.evaluate(() => {
  const W = game.world;
  // 台面碰撞（5.7 × 1.4 × 7.3）的中心：平台往东挪了 1 米，碰撞也该跟过去
  const deck = W.colliders.find((c) => Math.abs(c.max.x - c.min.x - 5.7) < 0.01 && Math.abs(c.max.z - c.min.z - 7.3) < 0.01 && Math.abs(c.max.y - 1.4) < 0.01);
  return { ids: W.map.layout.objects.map((o) => o.id), deckX: deck && (deck.min.x + deck.max.x) / 2, spawn0: W.spawns[0], n: W.spawns.length };
});
check(w.ids.includes('C9') && w.ids.includes('X1'), '游戏用的是 Blender 改过的地图（有复制的 C9、新方块 X1）', w.ids.slice(-4));
check(Math.abs(w.deckX - 1) < 0.01, '平台挪了 1 米，台面碰撞跟着挪', w.deckX);
check(w.spawn0.x === -14 && w.spawn0.z === 21 && w.n === 7, '玩家开局在 S2（start 换过）、出生点 7 个', w);

// 上传给开发
await p.evaluate(() => { Game.DevLog._debug.setToken('test'); document.getElementById('dev-map-upload').click(); });
await p.waitForFunction(() => document.getElementById('dev-map-result').textContent.includes('已上传'));
const up = uploads.find((u) => u.url.endsWith('/map.json'));
check(up && up.body === fs.readFileSync(edited, 'utf8'), '上传的 map.json 和 Blender 导出的文件一字不差', up && up.url);

// 换回原来的地图
await Promise.all([p.waitForEvent('load'), p.evaluate(() => document.getElementById('dev-map-reset').click())]);
await p.waitForFunction(() => window.Game && Game.Main && Game.Main.ready);
check((await p.textContent('#dev-map-state')).includes('自带'), '换回游戏自带的地图', await p.textContent('#dev-map-state'));
const probs = g.problems.filter((t) => !t.includes('/api/'));
check(probs.length === 0, '页面没有报错', probs.slice(0, 5));
await g.close();

console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
