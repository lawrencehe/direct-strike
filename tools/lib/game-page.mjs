// 公共部分：起一个只监听本机的静态服务，再用无头 Chromium 打开游戏。
// 这台机器没有 GPU，WebGL 靠 SwiftShader 软件渲染，所以帧率只能作相对参考。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'tools/out');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.json': 'application/json', '.ico': 'image/x-icon' };

export function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    // 防止 ../ 跳出项目目录
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// mapFile：用这个文件代替游戏配置的地图，用来检查还没启用的新地图
export async function openGame({ width = 1280, height = 720, url, mapFile } = {}) {
  const { server, port } = url ? { server: null, port: 0 } : await startServer();
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  // 软件渲染下首帧要编译所有着色器，可能要几十秒，所以超时放宽；这个耗时不代表真实玩家的体验。
  page.setDefaultTimeout(180000);
  const t0 = Date.now();
  if (mapFile) await page.route('**/maps/*.json', (r) => r.fulfill({ body: fs.readFileSync(mapFile), contentType: 'application/json' }));
  await page.goto(url || `http://127.0.0.1:${port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.game || window.gameError, null, { timeout: 180000 });
  const startError = await page.evaluate(() => window.gameError);
  if (startError) { await browser.close(); if (server) server.close(); throw new Error(startError); }
  const startupSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  const modelOk = await page.evaluate(() => Game.Character.load());
  const close = async () => { await browser.close(); if (server) server.close(); };
  return { page, problems, modelOk, startupSeconds, close };
}
