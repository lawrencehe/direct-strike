#!/usr/bin/env node
// 生成资源清单 assets/manifest.json（#85）：每个游戏资源的大小和内容哈希，整体一个版本号。
// 浏览器拿它和本地缓存比对，哈希变了的文件才重新下载（js/assets.js）。
//
// 用法：node tools/build-manifest.mjs [站点目录=仓库根目录]
//   deploy.sh 在 rsync 完之后对站点目录跑一次；清单不进仓库（.gitignore）。
//   本地 start.sh 不生成：没有清单时游戏不缓存、直接下载，改了素材刷新就能看到。
//   tools/lib/game-page.mjs 的测试服务器每次请求都现算一份，所以 /verify 走的是和线上一样的缓存路径。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 进清单的目录：点"进入战斗"才下载的游戏资源。网页本身（js、css、首页图片）不进，照常每次向服务器确认
export const DIRS = ['maps', 'assets/maps', 'assets/models', 'assets/weather', 'assets/sound'];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function buildManifest(root) {
  const files = {};
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && !e.name.startsWith('.')) {
        const buf = fs.readFileSync(path.join(root, r));
        files[r] = { size: buf.length, hash: sha(buf).slice(0, 12) };
      }
    }
  };
  for (const d of DIRS) walk(d);
  // 版本号：所有文件的路径和哈希合起来再算一次，任何一个文件变了版本号就变
  const version = sha(Object.entries(files).map(([p, f]) => `${p}:${f.hash}`).join('\n')).slice(0, 10);
  return { version, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const m = buildManifest(root);
  const out = path.join(root, 'assets/manifest.json');
  fs.writeFileSync(out, JSON.stringify(m));
  const total = Object.values(m.files).reduce((n, f) => n + f.size, 0);
  console.log(`资源清单 ${m.version}：${Object.keys(m.files).length} 个文件，${(total / 1048576).toFixed(1)} MB → ${out}`);
}
