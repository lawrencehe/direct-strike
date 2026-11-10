// ============================================================
// 开发者模式：在玩家（负责人）的电脑上录下每一帧的真实数据和画面，上传给开发分析。
// 开发机没有显卡，只能看逐帧截图；这里录下的是真机上的帧间隔、输入、枪模和手的实际位置，
// 开发用 tools/devlog/analyze.mjs 画成曲线、找卡顿、对着视频帧看。
//
// 要服务器校验密码才能打开（server/api.py）。令牌存在 localStorage，30 天有效。
//
// 性能要求：打开它不能让游戏变卡。所以——
//   - 每帧只往预先分配好的数组里写数字，不新建对象（新建对象多了会触发垃圾回收，那才是"偶尔卡一下"的元凶）
//   - 只在战斗中（鼠标锁定时）录，暂停、菜单的帧不录，免得把战斗数据挤掉
//   - 浮层每 0.25 秒刷新一次；整理、压缩、上传只在点"上传"时做（那时游戏是暂停的）
//   - 关着的时候 main.js 只多一个判断
//   - 录画面单独开关、默认关：要把画面缩小拷一份再编码，会占一些显卡
// 录制本身花了多少时间会显示在面板上（"录制耗时"），可以自己核对。
//
// 数据格式和分析方法见 docs/devmode.md。
// ============================================================
Game.DevLog = (() => {
  const C = Game.Config.dev;
  const STORE = 'direct-strike.dev.v1';   // { token, exp, enabled, video }

  // ---------- 每帧记录的通道 ----------
  // 改了顺序或加了通道，tools/devlog/analyze.mjs 按名字读，不受影响
  const CH = [
    'dtRaw', 'dt', 'work',                       // 真实帧间隔、游戏用的帧间隔（截到 0.05 秒）、这一帧 CPU 花的时间（毫秒）
    'lookX', 'lookY', 'keysDown', 'keysPressed', // 鼠标移动（像素）、按住 / 刚按下的动作（位掩码，顺序见 meta.actions）
    'posX', 'posY', 'posZ', 'velX', 'velY', 'velZ',
    'yaw', 'pitch', 'recoilPitch', 'onGround', 'crouchT', 'bobPhase', 'health',
    'weapon', 'switchPhase', 'switchT',          // 当前武器（meta.weapons 的下标）、切枪阶段 0 无 / 1 收 / 2 掏
    'reload', 'reloadEmpty', 'ammo',             // 换弹进度 0 ~ 1（没在换弹是 -1）
    'throwState', 'holdT', 'swingT',             // 投掷：0 无 / 1 攥着 / 2 挥臂
    'kick', 'bloom', 'swayX', 'swayY',
    'vmX', 'vmY', 'vmZ', 'vmRX', 'vmRY', 'vmRZ', // 枪模（或手雷）在枪模摄像机里的位置和旋转
    'lhX', 'lhY', 'lhZ', 'magY', 'magZ',         // 左手、弹匣在枪自己坐标系里的位置（拿手雷时为空）
  ];
  const NCH = CH.length;
  const I = {};
  CH.forEach((n, i) => { I[n] = i; });

  // 事件：从状态变化推出来，不用改武器、玩家的代码
  const EV = ['', 'fire', 'reloadStart', 'reloadEnd', 'reloadCancel', 'switch', 'jump', 'land', 'throw',
    'hurt', 'death', 'respawn', 'marker', 'lock', 'unlock', 'longtask', 'videoSegment'];
  const E = {};
  EV.forEach((n, i) => { E[n] = i; });

  const WEAPONS = ['rifle', 'pistol', 'frag', 'flash', 'smoke'];
  const cap = Math.round(C.seconds * C.maxFps);

  // 这些数组在打开开发者模式时才分配
  let data = null;      // Float32Array(cap × NCH)
  let times = null;     // Float64Array(cap)：每帧的时间（毫秒，相对 t0）
  let evT = null, evCode = null, evVal = null;
  let head = 0, count = 0, evHead = 0, evCount = 0;
  let row = -1;         // 这一帧写在哪一行（afterRender 要补 work）
  const t0 = performance.now();
  let simNow = -1;   // 测试脚本按固定步长推进时用的模拟时间（毫秒，_debug.simNow）；-1 = 用真实时间。不用闭包：返回小数会装箱、分配内存

  // 推事件用的上一帧状态
  const prev = { locked: false, alive: true, weapon: -1, reloading: false, onGround: true, thrown: false, health: 0, ammo: -1, velY: 0 };
  let cost = { sum: 0, max: 0, n: 0 };   // 录制本身的耗时
  let markers = 0;

  let g = null;         // main.js 交过来的游戏对象
  const state = load();
  let token = state.token && state.exp * 1000 > Date.now() ? state.token : null;
  let on = false;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 隐私模式 */ }
  }

  // ---------- 开关 ----------
  function setOn(v) {
    v = !!(v && token);
    if (v && !data) {
      data = new Float32Array(cap * NCH);
      times = new Float64Array(cap);
      evT = new Float64Array(C.maxEvents);
      evCode = new Uint8Array(C.maxEvents);
      evVal = new Float32Array(C.maxEvents);
      startLongTasks();
    }
    on = v;
    state.enabled = v;
    save();
    if (!v) Video.stop();
    Overlay.show(v);
    Panel.render();
  }

  function clear() {
    head = count = evHead = evCount = 0;
    markers = 0;
    row = -1;
    cost = { sum: 0, max: 0, n: 0 };
    Video.clear();
    Panel.render();
  }

  function event(code, val) {
    if (!evT) return;
    evT[evHead] = (simNow >= 0 ? simNow : performance.now()) - t0;
    evCode[evHead] = code;
    evVal[evHead] = val;
    evHead = (evHead + 1) % C.maxEvents;
    if (evCount < C.maxEvents) evCount++;
  }

  // 卡顿诊断：浏览器报告的长任务（超过 50 毫秒的脚本、垃圾回收等），只有 Chrome 系支持
  let longTaskObs = null;
  function startLongTasks() {
    if (longTaskObs || typeof PerformanceObserver === 'undefined') return;
    try {
      longTaskObs = new PerformanceObserver((list) => {
        if (!on || !g || !g.input.locked) return;
        for (const e of list.getEntries()) event(E.longtask, e.duration);
      });
      longTaskObs.observe({ type: 'longtask', buffered: false });
    } catch (e) { longTaskObs = null; }
  }

  // ---------- 每帧：在 input.endFrame() 之前调（要读"刚按下"） ----------
  function sample(rawDt, dt) {
    const s = performance.now();
    const now = simNow >= 0 ? simNow : s;
    const locked = g.input.locked;
    if (locked !== prev.locked) { event(locked ? E.lock : E.unlock, 0); prev.locked = locked; Video.onLock(locked); }
    if (!locked) { row = -1; return; }
    Video.watch(rawDt);

    const r = head;
    const b = r * NCH;
    const d = data;
    const p = g.player, w = g.weapon;
    times[r] = now - t0;
    d[b + I.dtRaw] = rawDt * 1000;
    d[b + I.dt] = dt * 1000;
    d[b + I.work] = 0;
    d[b + I.lookX] = p.lastLook.x;
    d[b + I.lookY] = p.lastLook.y;
    // 按键：在键盘、鼠标事件里已经算好了位掩码（每帧去 Set 里查会分配内存）
    d[b + I.keysDown] = Keys.down;
    d[b + I.keysPressed] = Keys.pressed;
    Keys.pressed = 0;

    d[b + I.posX] = p.position.x; d[b + I.posY] = p.position.y; d[b + I.posZ] = p.position.z;
    d[b + I.velX] = p.velocity.x; d[b + I.velY] = p.velocity.y; d[b + I.velZ] = p.velocity.z;
    d[b + I.yaw] = p.yaw; d[b + I.pitch] = p.pitch; d[b + I.recoilPitch] = p.recoilPitch;
    d[b + I.onGround] = p.onGround ? 1 : 0;
    d[b + I.crouchT] = p.crouchT;
    d[b + I.bobPhase] = p.bobPhase;
    d[b + I.health] = p.health;

    const wi = WEAPONS.indexOf(w.current);
    const gun = w.guns[w.current];
    const it = gun || w.throwables[w.current];
    d[b + I.weapon] = wi;
    d[b + I.switchPhase] = w.switchPhase === 'out' ? 1 : w.switchPhase === 'in' ? 2 : 0;
    d[b + I.switchT] = w.switchT;
    d[b + I.reload] = gun && w.reloading ? w.reloadProgress(gun) : -1;
    d[b + I.reloadEmpty] = w.reloadEmpty ? 1 : 0;
    d[b + I.ammo] = gun ? gun.ammo : -1;
    d[b + I.throwState] = w.throwState === 'hold' ? 1 : w.throwState === 'swing' ? 2 : 0;
    d[b + I.holdT] = w.holdT;
    d[b + I.swingT] = w.swingT;
    d[b + I.kick] = w.kick;
    d[b + I.bloom] = w.bloom;
    d[b + I.swayX] = w.sway.x;
    d[b + I.swayY] = w.sway.y;
    if (it) {
      const m = it.model;
      d[b + I.vmX] = m.position.x; d[b + I.vmY] = m.position.y; d[b + I.vmZ] = m.position.z;
      // Euler 的 x / y / z 是 getter，没被内联时每次返回都要装箱一个数字；直接读内部字段
      d[b + I.vmRX] = m.rotation._x; d[b + I.vmRY] = m.rotation._y; d[b + I.vmRZ] = m.rotation._z;
    }
    if (gun) {
      d[b + I.lhX] = gun.leftHand.position.x; d[b + I.lhY] = gun.leftHand.position.y; d[b + I.lhZ] = gun.leftHand.position.z;
      d[b + I.magY] = gun.mag.position.y; d[b + I.magZ] = gun.mag.position.z;
    } else {
      d[b + I.lhX] = d[b + I.lhY] = d[b + I.lhZ] = d[b + I.magY] = d[b + I.magZ] = NaN;
    }

    // 事件
    if (wi !== prev.weapon) { if (prev.weapon >= 0) event(E.switch, wi); prev.weapon = wi; prev.ammo = -1; }
    if (gun) {
      if (prev.ammo >= 0 && gun.ammo < prev.ammo) event(E.fire, gun.ammo);
      prev.ammo = gun.ammo;
    }
    if (w.reloading !== prev.reloading) {
      if (w.reloading) event(E.reloadStart, w.reloadEmpty ? 1 : 0);
      else event(gun && gun.ammo === gun.cfg.magSize ? E.reloadEnd : E.reloadCancel, 0);
      prev.reloading = w.reloading;
    }
    if (p.onGround !== prev.onGround) {
      if (p.onGround) event(E.land, prev.velY);
      else if (p.velocity.y > 0) event(E.jump, p.velocity.y);
      prev.onGround = p.onGround;
    }
    prev.velY = p.velocity.y;
    if (w.thrown !== prev.thrown) { if (w.thrown) event(E.throw, wi); prev.thrown = w.thrown; }
    if (p.health < prev.health) event(E.hurt, prev.health - p.health);
    prev.health = p.health;
    if (p.alive !== prev.alive) { event(p.alive ? E.respawn : E.death, 0); prev.alive = p.alive; }

    row = r;
    head = (head + 1) % cap;
    if (count < cap) count++;

    const c = performance.now() - s;
    cost.sum += c; cost.n++;
    if (c > cost.max) cost.max = c;
  }

  // ---------- 每帧：渲染之后调。补上这一帧 CPU 花的时间，拷一帧画面 ----------
  function afterRender(frameStart) {
    if (row >= 0) data[row * NCH + I.work] = performance.now() - frameStart;
    Video.frame();
    Overlay.tick();
  }

  // ============================================================
  // 录画面：把画面缩小画到一块小 canvas 上，用 MediaRecorder 录成 webm。
  // 每 C.video.segment 秒换一个新的录制器，所以每片都是能单独播放的完整文件；内存里只留最近 keep 片。
  // 只在战斗中录：暂停时这一片收尾，回到战斗再开新的一片。
  // ============================================================
  const Video = (() => {
    const V = C.video;
    let self = null;
    let canvas2d = null, ctx = null, stream = null;
    let rec = null, recStart = 0, lastShot = -1e9, segNo = 0, shots = 0;
    let strikes = 0, strikeT = 0;   // 保护：录画面让游戏明显变卡就自动关掉
    let lastFrame = 0, timer = 0;   // 出帧完全停了的话每帧的检查跑不到，再用定时器看一眼
    const segments = [];     // { n, t0, t1, blob }（时间和帧数据同一个基准，毫秒）
    let want = false;        // 开关
    let mime = '';

    function supported() {
      return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
    }

    function pickMime() {
      for (const m of ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4']) {
        if (MediaRecorder.isTypeSupported(m)) return m;
      }
      return '';
    }

    function setup() {
      if (canvas2d) return true;
      if (!supported()) return false;
      mime = pickMime();
      canvas2d = document.createElement('canvas');
      ctx = canvas2d.getContext('2d', { alpha: false });
      resize();
      // 浏览器按帧率自动采样（画布内容变了才采）。手动 requestFrame 的方式在部分环境下录出来是空的，不用
      stream = canvas2d.captureStream(V.fps);
      return true;
    }

    function resize() {
      const src = g.renderer.domElement;
      const w = Math.min(V.width, src.width);
      const h = Math.round((w * src.height) / src.width / 2) * 2;
      if (canvas2d.width !== w || canvas2d.height !== h) { canvas2d.width = w; canvas2d.height = h; }
    }

    function startSegment() {
      const r = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: V.bitrate });
      const seg = { n: segNo++, t0: performance.now() - t0, t1: 0, blob: null };
      r.ondataavailable = (e) => {
        if (!e.data || !e.data.size) return;
        seg.blob = e.data;
        segments.push(seg);
        while (segments.length > V.keep) segments.shift();
        Panel.render();
      };
      r.start();
      rec = r;
      recStart = lastFrame = performance.now();
      if (!timer) timer = setInterval(stalled, 500);
      event(E.videoSegment, seg.n);
      r.seg = seg;
    }

    function endSegment() {
      if (!rec) return;
      rec.seg.t1 = performance.now() - t0;
      if (rec.state !== 'inactive') rec.stop();
      rec = null;
      clearInterval(timer);
      timer = 0;
    }

    function stalled() {
      if (!rec || document.visibilityState !== 'visible' || !g.input.locked) { lastFrame = performance.now(); return; }
      if (performance.now() - lastFrame > 1500) autoOff();
    }

    function autoOff() {
      strikes = 0;
      self.set(false);
      Panel.render();
      Panel.msg('录画面让游戏明显变卡，已自动关闭（帧数据照常录）', 'err');
      if (g.ui) g.ui.toast('录画面让游戏变卡，已自动关闭');
    }

    return self = {
      supported,
      get on() { return want; },
      get mime() { return mime; },
      get segments() { return segments; },
      set(v) {
        want = !!v && supported();
        state.video = want;
        save();
        if (!want) endSegment();
        else if (on && g && g.input.locked && setup()) startSegment();
      },
      onLock(locked) {
        if (!want) return;
        if (locked && setup()) { resize(); startSegment(); } else endSegment();
      },
      // 每帧渲染之后：到时间就拷一帧（画面刚画完、还没交给屏幕，这时候 drawImage 拿得到；
      // 晚了 WebGL 的画布已经清空，拷到的是黑的）
      frame() {
        if (!rec) return;
        const now = performance.now();
        lastFrame = now;
        if (now - recStart >= V.segment * 1000) { endSegment(); startSegment(); }
        if (now - lastShot < 1000 / V.fps - 2) return;
        lastShot = now;
        ctx.drawImage(g.renderer.domElement, 0, 0, canvas2d.width, canvas2d.height);
        shots++;
      },
      stop() { endSegment(); },
      // 每帧检查：一帧超过 1 秒，或 2 秒内 3 帧超过 0.2 秒 → 关掉录画面并提示
      watch(rawDt) {
        if (!rec) return;
        if (rawDt < 0.2) return;
        const now = performance.now();
        if (now - strikeT > 2000) strikes = 0;
        strikeT = now;
        strikes++;
        if (rawDt > 1 || strikes >= 3) autoOff();
      },
      clear() { segments.length = 0; },
      bytes() { let n = 0; for (const s of segments) n += s.blob.size; return n; },
      get shots() { return shots; },
      get recording() { return !!rec; },
    };
  })();

  // ============================================================
  // 战斗中的浮层：帧率、帧时间、卡顿、录制状态。每 C.dev.hudInterval 秒刷新一次
  // ============================================================
  const Overlay = (() => {
    let el = null, text = null, graph = null, gctx = null, last = 0, flash = 0;
    const scratch = new Float32Array(512);

    function build() {
      el = document.createElement('div');
      el.id = 'dev-hud';
      el.innerHTML = '<div class="dev-hud-text"></div><canvas width="160" height="34"></canvas>';
      document.getElementById('hud').appendChild(el);
      text = el.firstChild;
      graph = el.lastChild;
      gctx = graph.getContext('2d');
    }

    return {
      show(v) {
        if (v && !el) build();
        if (el) el.style.display = v ? '' : 'none';
      },
      marked() { flash = performance.now(); },
      tick() {
        if (!on || !el) return;
        const now = performance.now();
        if (now - last < C.hudInterval * 1000) return;
        last = now;
        // 最近 160 帧的帧间隔
        const n = Math.min(count, graph.width);
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const r = (head - 1 - i + cap) % cap;
          scratch[i] = data[r * NCH + I.dtRaw];
          sum += scratch[i];
        }
        const avg = n ? sum / n : 0;
        const W = graph.width, H = graph.height;
        gctx.clearRect(0, 0, W, H);
        // 16.7ms（60 帧）参考线
        gctx.fillStyle = 'rgba(233,228,212,.25)';
        gctx.fillRect(0, H - (16.7 / 50) * H, W, 1);
        for (let i = 0; i < n; i++) {
          const v = scratch[i];
          const h = Math.min(H, (v / 50) * H);
          gctx.fillStyle = v > avg * C.hitchFactor ? '#ff4b3a' : '#9fd356';
          gctx.fillRect(W - 1 - i, H - h, 1, h);
        }
        const sorted = scratch.subarray(0, n).sort();
        const p99 = n ? sorted[Math.min(n - 1, Math.floor(n * 0.99))] : 0;
        const fps = avg ? Math.round(1000 / avg) : 0;
        const markTxt = now - flash < 1200 ? `<b class="mark">已标记 #${markers}</b>` : `标记 ${markers}（${C.markerKey}）`;
        const recTxt = Video.on ? '<b class="rec">● 画面</b>' : '';
        text.innerHTML = `${fps} FPS · ${avg.toFixed(1)} ms · 最慢1% ${p99.toFixed(1)}<br>● 录制 ${(count && (times[(head - 1 + cap) % cap] - times[(head - count + cap) % cap]) / 1000 || 0).toFixed(0)}s · ${markTxt} ${recTxt}`;
      },
    };
  })();

  // ============================================================
  // 设置里的"开发者"栏：解锁、开关、统计、上传
  // ============================================================
  const Panel = (() => {
    const $ = (id) => document.getElementById(id);
    let busy = false;

    function msg(text, cls = '') {
      const el = $('dev-result');
      if (!el) return;
      el.textContent = text;
      el.className = cls;
    }

    return {
      bind() {
        $('dev-unlock').addEventListener('click', (e) => { e.preventDefault(); unlock($('dev-pw').value); });
        $('dev-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); unlock($('dev-pw').value); } });
        $('dev-on').addEventListener('change', (e) => setOn(e.target.checked));
        $('dev-video').addEventListener('change', (e) => { Video.set(e.target.checked); Panel.render(); });
        $('dev-upload').addEventListener('click', (e) => { e.preventDefault(); upload(); });
        $('dev-download').addEventListener('click', (e) => { e.preventDefault(); download(); });
        $('dev-clear').addEventListener('click', (e) => { e.preventDefault(); clear(); msg('已清空'); });
        $('dev-logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });
        this.render();
      },
      msg,
      set busy(v) { busy = v; this.render(); },
      render() {
        const box = $('set-dev');
        if (!box) return;
        box.classList.toggle('unlocked', !!token);
        box.classList.toggle('on', on);
        $('dev-on').checked = on;
        $('dev-video').checked = Video.on;
        $('dev-video').disabled = !on || !Video.supported();
        $('dev-upload').disabled = $('dev-download').disabled = busy || !on || !count;
        $('dev-clear').disabled = busy || !count;
        $('dev-state').textContent = !token ? '需要密码' : on ? '录制中（只录战斗中的帧）' : '已解锁，未开启';
        const pause = $('btn-pause-dev');
        if (pause) pause.style.display = on ? '' : 'none';
        if (on) this.stats();
      },
      // 统计：整理一遍缓冲区，只在面板打开时算
      stats() {
        const el = $('dev-stats');
        if (!count) { el.innerHTML = '<div class="dev-empty">还没有数据：进入战斗玩一会儿再回来看。玩的时候觉得哪里不对就按 ' + C.markerKey + ' 打个标记。</div>'; drawGraph(null); return; }
        const s = summarize();
        const cell = (label, v) => `<div><span>${label}</span><b>${v}</b></div>`;
        el.innerHTML = [
          cell('时长', `${s.seconds.toFixed(1)} 秒 / ${count} 帧`),
          cell('帧率', `${s.fps.toFixed(0)} FPS`),
          cell('帧时间', `中位 ${s.median.toFixed(1)} · 最慢 1% ${s.p99.toFixed(1)} · 最慢 ${s.max.toFixed(1)} ms`),
          cell('卡顿', `${s.hitches} 次（超过中位 ${C.hitchFactor} 倍）`),
          cell('标记', `${markers}（${C.markerKey}）`),
          cell('录制耗时', `平均 ${(cost.n ? (cost.sum / cost.n) * 1000 : 0).toFixed(0)} µs · 最大 ${(cost.max * 1000).toFixed(0)} µs / 帧`),
          cell('画面', Video.on || Video.segments.length ? `${Video.segments.length} 片 · ${(Video.bytes() / 1048576).toFixed(1)} MB · 已拷 ${Video.shots} 帧` : '未录'),
        ].join('');
        drawGraph(s);
      },
    };
  })();

  function drawGraph(s) {
    const cv = document.getElementById('dev-graph');
    if (!cv) return;
    const w = cv.clientWidth || 600, h = cv.height;
    if (cv.width !== w) cv.width = w;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, w, h);
    if (!s) return;
    const n = count;
    const maxMs = Math.max(34, s.p99 * 1.5);
    x.fillStyle = 'rgba(233,228,212,.2)';
    for (const ref of [16.7, 33.3]) x.fillRect(0, h - (ref / maxMs) * h, w, 1);
    // 每个像素一列，取这列里最慢的一帧
    for (let px = 0; px < w; px++) {
      const a = Math.floor((px / w) * n), bEnd = Math.max(a + 1, Math.floor(((px + 1) / w) * n));
      let m = 0;
      for (let k = a; k < bEnd; k++) m = Math.max(m, data[((head - n + k + cap) % cap) * NCH + I.dtRaw]);
      x.fillStyle = m > s.median * C.hitchFactor ? '#ff4b3a' : '#9fd356';
      const hh = Math.min(h, (m / maxMs) * h);
      x.fillRect(px, h - hh, 1, hh);
    }
    // 标记
    const tA = times[(head - n + cap) % cap], tB = times[(head - 1 + cap) % cap];
    x.fillStyle = '#ff5f00';
    forEachEvent((t, code) => {
      if (code !== E.marker || t < tA) return;
      x.fillRect(((t - tA) / (tB - tA || 1)) * w - 1, 0, 2, h);
    });
  }

  function forEachEvent(fn) {
    for (let i = 0; i < evCount; i++) {
      const k = (evHead - evCount + i + C.maxEvents) % C.maxEvents;
      fn(evT[k], evCode[k], evVal[k]);
    }
  }

  function summarize() {
    const n = count;
    const arr = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { arr[i] = data[((head - n + i + cap) % cap) * NCH + I.dtRaw]; sum += arr[i]; }
    const sorted = arr.slice().sort();
    const median = sorted[Math.floor(n / 2)];
    let hitches = 0;
    for (let i = 0; i < n; i++) if (arr[i] > median * C.hitchFactor) hitches++;
    return {
      seconds: sum / 1000, fps: n / (sum / 1000), median,
      p99: sorted[Math.min(n - 1, Math.floor(n * 0.99))], max: sorted[n - 1], hitches,
    };
  }


  // ============================================================
  // 接口：解锁、上传
  // ============================================================
  async function api(method, path, body, headers = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const res = await fetch(C.api + path, { method, headers: h, body });
    let json = null;
    try { json = await res.json(); } catch (e) { /* 不是 JSON（比如服务没起来，返回了网页） */ }
    if (!res.ok || !json) {
      const err = new Error((json && json.error) || `服务器返回 ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function unlock(password) {
    if (!password) { Panel.msg('请输入密码', 'err'); return; }
    Panel.msg('校验中…');
    try {
      const r = await api('POST', '/login', { password });
      token = r.token;
      state.token = r.token;
      state.exp = r.exp;
      save();
      document.getElementById('dev-pw').value = '';
      Panel.msg('已解锁');
      setOn(true);
    } catch (e) {
      Panel.msg(e.status === 404 || e.status === 405 || e.status === 501 ? '服务器没有开发接口（本地请用 start.sh 启动）' : e.message, 'err');
    }
  }

  function logout() {
    setOn(false);
    token = null;
    delete state.token;
    delete state.exp;
    save();
    Panel.msg('已退出开发者模式');
    Panel.render();
  }

  // 启动时向服务器确认令牌还有效（改了密码会失效）。网络不通就先照常用
  function verifyToken() {
    if (!token) return;
    api('GET', '/session').catch((e) => {
      if (e.status === 401) {
        logout();
        if (g && g.ui) g.ui.toast('开发者授权已失效，请在设置里重新输入密码');
      }
    });
  }

  // 帧数据整理成 JSON（按通道分列，从旧到新），压缩成 gzip
  function buildFrames() {
    const n = count;
    const cols = {};
    const round = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
    const t = new Array(n);
    for (let i = 0; i < n; i++) t[i] = round(times[(head - n + i + cap) % cap]);
    for (let c = 0; c < NCH; c++) {
      const col = new Array(n);
      for (let i = 0; i < n; i++) col[i] = round(data[((head - n + i + cap) % cap) * NCH + c]);
      cols[CH[c]] = col;
    }
    const events = [];
    forEachEvent((tt, code, v) => events.push({ t: round(tt), type: EV[code], v: round(v) }));
    const video = Video.segments.map((s) => ({ file: segName(s), t0: round(s.t0), t1: round(s.t1), bytes: s.blob.size }));
    return {
      format: 'direct-strike-devlog', formatVersion: 1,
      meta: meta(),
      stats: summarize(),
      recordCost: { avgUs: cost.n ? (cost.sum / cost.n) * 1000 : 0, maxUs: cost.max * 1000, frames: cost.n },
      channels: CH, weapons: WEAPONS, actions: Game.Input.ACTIONS.map((a) => a[0]),
      t, data: cols, events, video,
    };
  }

  function segName(s) { return `seg-${String(s.n % 1000).padStart(3, '0')}.${Video.mime.includes('mp4') ? 'mp4' : 'webm'}`; }

  function meta() {
    const ver = (document.querySelector('.brand small') || {}).textContent || '';
    const cv = g.renderer.domElement;
    let config = null;
    try { config = JSON.parse(JSON.stringify(Game.Config)); } catch (e) { /* 有循环引用就不带 */ }
    return {
      // 隐私：只录游戏本身的东西（版本、画面大小、设置、帧数据）。不录浏览器、系统、显卡型号、屏幕这些设备信息，
      // 服务器也不记 IP（docs/devmode.md 的"隐私"）
      version: ver, recordedAt: new Date().toISOString(),
      canvas: { w: cv.width, h: cv.height }, pixelRatio: g.renderer.getPixelRatio(),
      fullscreen: !!document.fullscreenElement,
      mode: g.hud.mode, weapons: { rifle: Game.Settings.get('rifle'), pistol: Game.Settings.get('pistol') },
      markers, video: Video.on ? { mime: Video.mime, ...C.video } : null,
      bindings: g.input.bindings, config,
    };
  }

  async function gzip(text) {
    if (typeof CompressionStream === 'undefined') throw new Error('这个浏览器不支持压缩（请用新版 Chrome / Edge / Firefox）');
    const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(s).blob();
  }

  async function upload() {
    if (!count) return;
    Panel.busy = true;
    try {
      Panel.msg('整理数据…');
      const frames = buildFrames();
      const blob = await gzip(JSON.stringify(frames));
      const segs = Video.segments.filter((s) => s.blob);
      const m = frames.meta;
      const brief = { version: m.version, frames: count, seconds: frames.stats.seconds,
        fps: frames.stats.fps, markers, videoSegments: segs.length, mode: m.mode };
      const { id } = await api('POST', '/uploads', { meta: brief });
      const total = 1 + segs.length;
      Panel.msg(`上传中 1 / ${total}（帧数据 ${(blob.size / 1048576).toFixed(1)} MB）…`);
      await api('PUT', `/uploads/${id}/frames.json.gz`, blob);
      for (let i = 0; i < segs.length; i++) {
        Panel.msg(`上传中 ${i + 2} / ${total}（画面）…`);
        await api('PUT', `/uploads/${id}/${segName(segs[i])}`, segs[i].blob);
      }
      Panel.msg(`已上传：${id}（把这个编号告诉开发）`, 'ok');
    } catch (e) {
      console.error(e);
      Panel.msg(`上传失败：${e.message}。可以先"下载到本地"`, 'err');
    } finally {
      Panel.busy = false;
    }
  }

  async function download() {
    if (!count) return;
    Panel.busy = true;
    try {
      const blob = await gzip(JSON.stringify(buildFrames()));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `devlog-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json.gz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      Panel.msg('已下载帧数据（画面只能上传）');
    } catch (e) {
      Panel.msg(`下载失败：${e.message}`, 'err');
    } finally {
      Panel.busy = false;
    }
  }

  // 按键位掩码：按 Input.ACTIONS 的顺序每个动作一位。down = 按住，pressed = 上次 sample 以来按下过
  const Keys = (() => {
    const k = { down: 0, pressed: 0 };
    const bit = (code) => {
      if (!g) return 0;
      const A = Game.Input.ACTIONS;
      let m = 0;
      for (let i = 0; i < A.length; i++) if ((g.input.bindings[A[i][0]] || []).includes(code)) m |= 1 << i;
      return m;
    };
    const press = (code) => { if (!on || !g.input.locked) return; const m = bit(code); k.down |= m; k.pressed |= m; };
    const release = (code) => { if (on) k.down &= ~bit(code); };
    document.addEventListener('keydown', (e) => { if (!e.repeat) press(e.code); });
    document.addEventListener('keyup', (e) => release(e.code));
    document.addEventListener('mousedown', (e) => press(`Mouse${e.button}`));
    document.addEventListener('mouseup', (e) => release(`Mouse${e.button}`));
    document.addEventListener('pointerlockchange', () => { k.down = 0; });
    document.addEventListener('inputrelease', () => { k.down = 0; });   // 失去焦点、按了 ⌘：input.js 把按住的键全放开
    return k;
  })();

  // 标记键：战斗中按下就记一个标记
  document.addEventListener('keydown', (e) => {
    if (!on || e.code !== C.markerKey || !g || !g.input.locked) return;
    e.preventDefault();
    if (e.repeat) return;
    markers++;
    event(E.marker, markers);
    Overlay.marked();
  });

  return {
    get on() { return on; },
    // main.js 创建完游戏对象后调用
    attach(objs) {
      g = objs;
      Panel.bind();
      if (token && state.enabled) setOn(true);
      if (on && state.video) Video.set(true);
      verifyToken();
    },
    sample, afterRender,
    renderPanel: () => Panel.render(),
    // 给测试用
    _debug: { CH, EV, get count() { return count; }, buildFrames, summarize, cost: () => cost, setToken(t) { token = t; }, set simNow(v) { simNow = v; }, video: Video },
  };
})();
