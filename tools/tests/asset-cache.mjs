// 资源按需下载和本地缓存（#85）
//   1. 打开网页：脚本还没跑完时 HUD 不显示；首页出来时没有下载任何游戏资源，背景是静态图
//   2. 点"进入战斗"：加载页显示下载进度和总大小，下完进简报
//   3. 刷新再进：资源都在本地缓存里，一个游戏资源请求都不发
//   4. 线上改了一个文件（清单里它的哈希和版本号变了）：只重新下这一个，旧的那份从缓存里删掉
// 用法：node tools/tests/asset-cache.mjs
import { chromium } from 'playwright';
import { startServer, OUT } from '../lib/game-page.mjs';

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });   // 同一个上下文：Cache Storage 在几次打开之间保留
let fails = 0;
const check = (ok, name, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) fails++; };
const isAsset = (u) => /\/(maps\/[^/]+\.json|assets\/(maps|models|weather|sound)\/)/.test(new URL(u).pathname);

let tamper = null;   // 改清单：(manifest) => manifest
await ctx.route('**/assets/manifest.json', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  if (tamper) body = JSON.stringify(tamper(JSON.parse(body)));
  route.fulfill({ response: res, body });
});

async function open({ slowMain = false } = {}) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  const assetReqs = [];
  page.on('request', (r) => { if (isAsset(r.url())) assetReqs.push(new URL(r.url()).pathname + new URL(r.url()).search); });
  if (slowMain) await page.route('**/js/main.js', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); r.continue(); });
  await page.goto(base, { waitUntil: 'commit' });
  return { page, problems, assetReqs };
}
const hudShown = (page) => page.evaluate(() => getComputedStyle(document.getElementById('hud')).display !== 'none');

async function deploy(page) {
  const texts = new Set();
  await page.click('#mode-list .mode[data-mode="duel"]');
  await page.click('#btn-deploy');
  // 记下加载页上出现过的文字，直到进简报
  for (;;) {
    const s = await page.evaluate(() => ({ t: document.getElementById('loading').textContent, scr: document.body.dataset.screen, err: window.gameError }));
    texts.add(s.t);
    if (s.scr === 'brief' || s.err) return { texts: [...texts], err: s.err };
    await page.waitForTimeout(100);
  }
}

// ---- 1. 第一次打开 ----
let { page, problems, assetReqs } = await open({ slowMain: true });
await page.waitForSelector('#hud', { state: 'attached' });
await page.waitForTimeout(500);   // main.js 还卡着没执行
check(!(await hudShown(page)), '脚本加载期间 HUD（战绩、准星、子弹）不显示');
check(await page.evaluate(() => document.getElementById('scr-boot').classList.contains('on')), '脚本加载期间显示加载页');
await page.waitForFunction(() => window.Game && Game.Main && Game.Main.ready);
check(await page.evaluate(() => document.body.dataset.screen) === 'home', '进到首页');
check(!(await hudShown(page)), '首页不显示 HUD');
const assetsOnHome = assetReqs.filter((u) => !u.startsWith('/maps/'));   // 地图文件只有几 KB，首页显示地图名要用
check(assetsOnHome.length === 0, '首页没有下载地图素材、模型、音效', assetsOnHome.slice(0, 3).join(' '));
check(await page.evaluate(() => getComputedStyle(document.getElementById('overlay')).backgroundImage.includes('home-bg')), '首页背景是静态图');
await page.screenshot({ path: `${OUT}/asset-cache-home.jpg`, type: 'jpeg', quality: 80 });

// ---- 2. 进入战斗：下载进度 ----
let r = await deploy(page);
check(!r.err, '下载完进入简报', r.err || '');
await page.waitForTimeout(4000);   // 进简报后还在后台下 NPC 随机用的其他枪，等它们存进缓存
const prog = r.texts.filter((t) => /下载资源 [\d.]+ \/ [\d.]+ MB/.test(t));
check(prog.length > 0, '加载页显示下载进度和总大小', prog.slice(-1)[0] || r.texts.join(' | '));
const firstCount = assetReqs.length;
check(firstCount > 20, '第一次下载了资源', `${firstCount} 个请求`);
const cached = await page.evaluate(async () => (await (await caches.open(Game.Config.assets.cacheName)).keys()).length);
check(cached >= firstCount - 2, '资源存进了 Cache Storage', `${cached} 项`);
const version = await page.evaluate(() => localStorage.getItem(Game.Config.assets.versionKey));
check(version && version === await page.evaluate(() => Game.Assets.version), '本地记下了资源版本号', version);
check(problems.length === 0, '没有报错', problems.join(' | '));
await page.close();

// ---- 3. 刷新再进：不发资源请求 ----
({ page, problems, assetReqs } = await open());
await page.waitForFunction(() => window.Game && Game.Main && Game.Main.ready);
r = await deploy(page);
check(!r.err, '刷新后进入战斗', r.err || '');
check(assetReqs.length === 0, '刷新后一个资源请求都不发', assetReqs.slice(0, 3).join(' '));
check(!r.texts.some((t) => /下载资源 [\d.]+ \/ [1-9]/.test(t)), '加载页没有显示要下载', r.texts.join(' | '));
await page.screenshot({ path: `${OUT}/asset-cache-brief.jpg`, type: 'jpeg', quality: 80 });
await page.close();

// ---- 4. 线上改了一个文件：只下这一个 ----
const changed = 'assets/models/gun/ak47.glb';
tamper = (m) => { m.files[changed].hash = 'changed00000'; m.version = 'v-test'; return m; };
({ page, problems, assetReqs } = await open());
await page.waitForFunction(() => window.Game && Game.Main && Game.Main.ready);
r = await deploy(page);
check(!r.err, '版本更新后进入战斗', r.err || '');
await page.waitForTimeout(4000);
check(assetReqs.length === 1 && assetReqs[0] === `/${changed}?v=changed00000`, '只重新下载了改过的文件', assetReqs.join(' '));
const keys = await page.evaluate(async () => (await (await caches.open(Game.Config.assets.cacheName)).keys()).map((k) => new URL(k.url).pathname + new URL(k.url).search));
const ak = keys.filter((k) => k.startsWith(`/${changed}`));
check(ak.length === 1 && ak[0].endsWith('changed00000'), '旧版本的文件从缓存里删掉了', ak.join(' '));
check(await page.evaluate(() => localStorage.getItem(Game.Config.assets.versionKey)) === 'v-test', '本地版本号更新了');
await page.close();

await browser.close();
server.close();
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
