// ============================================================
// 资源下载和本地缓存（#85）
//
// 网页本身（html / js / css / 首页图片）和游戏资源（地图、贴图、模型、音效）分开：
// 打开网页只下网页本身，点"进入战斗"才下这一局要的资源，加载页显示进度和总大小。
//
// 版本：部署时 tools/build-manifest.mjs 生成资源清单 assets/manifest.json：
//   { version, files: { "assets/models/gun/ak47.glb": { size, hash }, ... } }
// 清单很小，每次打开网页都向服务器要最新的。下载过的资源存在浏览器的 Cache Storage 里，
// 键是"路径?v=内容哈希"：哈希没变直接用本地的，一个请求都不发；文件改了哈希就变，只重新下这一个。
// 本地记一个版本号（localStorage），和清单的版本不一样时把清单里已经没有的旧文件删掉。
//
// 加载器不用改调用方式：先 ensure(路径) 把文件读进内存（blob URL），
// 再照常用原路径 load，three.js 的 DefaultLoadingManager 的 URL 修改器把路径换成 blob URL。
// 普通 fetch 的地方用 url(路径)。
//
// 没有清单（本地 start.sh 开发、清单下载失败）：什么都不缓存，加载器照常走网络，游戏照常能玩。
// 没有 Cache Storage（非 https 的页面）：照常下载，只是不存。
// ============================================================
Game.Assets = (function () {
  const C = Game.Config.assets;
  let manifest = null;   // 清单，没有就是 null
  let cache = null;      // Cache Storage，没有就是 null
  const urls = {};       // 路径 → 内存里的 blob URL
  const pending = {};    // 路径 → 正在读的 Promise

  const norm = (p) => p.replace(/^\.\//, '');
  const entry = (p) => (manifest && manifest.files[norm(p)]) || null;
  const keyOf = (p) => `${norm(p)}?v=${entry(p).hash}`;

  // three.js 所有加载器（GLTFLoader、TextureLoader、RGBELoader）都走 DefaultLoadingManager
  THREE.DefaultLoadingManager.setURLModifier((u) => urls[norm(u)] || u);

  // 读清单、打开缓存、清掉旧版本的文件。失败不报错，退回不缓存的模式
  async function init() {
    try {
      const res = await fetch(C.manifest, { cache: 'no-cache' });
      if (res.ok) manifest = await res.json();
    } catch (e) { /* 没有清单：本地开发 */ }
    if (!manifest) return null;
    try { if (self.caches) cache = await caches.open(C.cacheName); } catch (e) { cache = null; }
    let local = null;
    try { local = localStorage.getItem(C.versionKey); } catch (e) { /* 隐私模式 */ }
    if (cache && local !== manifest.version) {
      // 版本变了：清单里没有的、哈希对不上的都删掉
      try {
        const keep = new Set(Object.keys(manifest.files).map((p) => new URL(keyOf(p), location.href).href));
        for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
        localStorage.setItem(C.versionKey, manifest.version);
      } catch (e) { console.warn('清理旧资源失败：', e); }
    }
    return manifest.version;
  }

  // 清单里以 prefix 开头的文件（按目录取一整组，比如一张地图的全部素材）
  function under(prefix) {
    if (!manifest) return [];
    return Object.keys(manifest.files).filter((p) => p.startsWith(prefix));
  }

  // 把一个文件读进内存：本地有就用本地的，没有就下载并存进缓存。onBytes(n) 报告新下载的字节数。
  // 不会失败：下载出错只打警告，之后加载器用原路径再试一次，由加载器报错或退回（地图贴图退回程序画的、NPC 退回方块小人）
  function ensure(path, onBytes) {
    path = norm(path);
    if (urls[path] || !entry(path)) return Promise.resolve();
    if (!pending[path]) {
      pending[path] = (async () => {
        const key = keyOf(path);
        let blob = null;
        if (cache) {
          try { const hit = await cache.match(key); if (hit) blob = await hit.blob(); } catch (e) { blob = null; }
        }
        if (!blob) {
          // no-store：已经自己存进 Cache Storage 了，不让浏览器的 HTTP 缓存再存一份
          const res = await fetch(key, { cache: 'no-store' });
          if (!res.ok) throw new Error(`${path} 下载失败（HTTP ${res.status}）`);
          blob = await readWithProgress(res, (n) => { if (onBytes) onBytes(n); });
          if (cache) cache.put(key, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || '' } })).catch(() => {});
        }
        urls[path] = URL.createObjectURL(blob);
      })().catch((e) => console.warn('资源下载失败，改用直接加载：', path, e && e.message))
        .finally(() => { delete pending[path]; });
    }
    return pending[path];
  }

  // 边下边报告进度
  async function readWithProgress(res, onBytes) {
    if (!res.body || !res.body.getReader) { const b = await res.blob(); onBytes(b.size); return b; }
    const reader = res.body.getReader();
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      onBytes(value.length);
    }
    return new Blob(parts, { type: res.headers.get('Content-Type') || '' });
  }

  // 本地还没有的文件一共多大（字节）。要先 init
  async function missingBytes(paths) {
    let n = 0;
    for (const p of new Set(paths.map(norm))) {
      const e = entry(p);
      if (!e || urls[p]) continue;
      if (cache && await cache.match(keyOf(p)).catch(() => null)) continue;
      n += e.size;
    }
    return n;
  }

  // 一组文件全部读进内存。onProgress(已下字节, 要下的总字节)
  async function prefetch(paths, onProgress) {
    paths = [...new Set(paths.map(norm))].filter(entry);
    const total = await missingBytes(paths);
    let got = 0;
    if (onProgress) onProgress(0, total);
    await Promise.all(paths.map((p) => ensure(p, (n) => { got += n; if (onProgress) onProgress(Math.min(got, total), total); })));
    return total;
  }

  // 普通 fetch 用：读进内存了就给 blob URL，否则原路径
  const url = (path) => urls[norm(path)] || path;

  return {
    init, under, ensure, prefetch, missingBytes, url,
    get version() { return manifest && manifest.version; },
    get cached() { return !!cache; },
  };
})();
