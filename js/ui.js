// ============================================================
// 界面流程：加载 → 首页 → 作战简报 → 战斗 ⇄ 暂停 → 结算 → 首页
//
//   boot    加载页：地图、枪模、手臂加载进度（main.js 在创建游戏对象前就会用到，所以是静态方法）
//   home    首页：选模式、看地图和装备、设置。不全屏，背后是训练场的 3D 画面
//   brief   作战简报：点"进入战斗"后进入全屏并显示，再点一下锁定鼠标开始
//   null    战斗中：所有界面隐藏，只剩 HUD
//   pause   暂停：按 Esc 解锁鼠标时出现，可以继续、改设置、重开、回首页
//   result  结算：对决分出胜负、波次阵亡
//
// 本文件只管界面，开局、锁鼠标这些动作通过 on* 回调交给 main.js 做。
// 浏览器规定全屏和指针锁定必须在点击里同步发起，所以回调里不能 await。
// ============================================================
Game.UI = class UI {
  // ---------- 加载页（startGame 之前就要用） ----------
  static bootProgress(done, total) {
    document.getElementById('boot-progress').style.width = `${(done / total) * 100}%`;
  }

  static bootError(text) {
    const el = document.getElementById('loading');
    el.textContent = text;
    el.classList.add('error');
  }

  constructor({ input, hud, audio, world }) {
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.input = input;
    this.hud = hud;
    this.audio = audio;
    this.world = world;
    this.screen = 'boot';
    this.mode = Game.Settings.get('mode');   // 首页当前选中的模式
    this.npcReady = false;
    this.npcNote = 'NPC 模型加载中…';
    this.loading = {};       // 正在下载模型的装备槽：rifle / pistol / npc → true

    // main.js 设置的回调
    this.onDeploy = null;    // (mode) 点"进入战斗"：开局并进入全屏
    this.onStart = null;     // 简报页点击：锁定鼠标开始
    this.onResume = null;    // 暂停里点"继续"
    this.onRestart = null;   // 重新开始 / 再来一局
    this.onQuit = null;      // 回首页
    this.onLoadout = null;   // (slot) 首页换了装备：下载并换上新模型，返回 Promise

    this.buildHome();
    this.buildSettings();
    this.bindScreens();
    this.applyCrosshair();
    Game.Settings.onChange((k) => { if (k === 'crosshair') this.applyCrosshair(); });

    // 鼠标锁定失败（比如按 Esc 后立刻点继续，浏览器会拒绝），input.js 自动重试一次也没成功：提示再点一次
    input.onLockError = () => this.toast('没能锁定鼠标，请再点一次');
  }

  // ---------- 切换界面 ----------
  show(screen) {
    this.screen = screen;
    const overlay = this.$('overlay');
    overlay.classList.toggle('hidden', !screen);
    for (const s of overlay.querySelectorAll('.screen')) s.classList.toggle('on', s.id === `scr-${screen}`);
    document.body.dataset.screen = screen || 'game';
    if (!screen && this.input.capture) this.input.finishCapture(null);   // 改键改到一半就开始游戏：取消
    if (screen !== 'pause') this.closePauseSettings();
  }

  goHome() {
    this.show('home');
    this.renderMode();
  }

  // 作战简报：模式、地图、目标、按键提示
  showBrief(mode) {
    const m = UI.MODES[mode];
    this.$('brief-mode').textContent = `作战简报 · ${m.title}`;
    this.$('brief-map').textContent = this.world.mapName;
    const k = (a) => Game.Input.bindingName(this.input.bindings[a]);
    this.$('brief-goal').textContent = m.goal(k);
    const keys = [
      ['移动', ['forward', 'left', 'back', 'right'].map(k).join(' ')],
      ['射击 / 投掷', k('fire')], ['换弹', k('reload')], ['跳跃', k('jump')],
      ['下蹲', k('crouch')], ['奔跑', k('sprint')],
      ...(mode === 'range' ? [] : [['出生点购买', k('buy')]]),
      ['切换武器', `${['slotRifle', 'slotPistol', 'slotFrag', 'slotFlash', 'slotSmoke'].map(k).join(' ')} / 滚轮`],
      ['暂停', 'Esc'],
    ];
    this.$('brief-keys').innerHTML = keys.map(([label, key]) => `<div><kbd>${key}</kbd><span>${label}</span></div>`).join('');
    this.show('brief');
  }

  // info：{ score, wave, alive, total, stats, accuracy }
  showPause(mode, info) {
    this.$('pause-mode').textContent = UI.MODES[mode].title;
    let html = '';
    if (mode === 'duel') html = `比分 <b class="me">${info.score.player}</b> : <b class="enemy">${info.score.bot}</b>　先到 ${Game.Config.duel.winScore} 杀`;
    else if (mode === 'waves') html = `第 <b>${info.wave}</b> 波　剩余敌人 <b class="enemy">${info.alive}</b> / ${info.total}`;
    else html = `射击 <b>${info.stats.shots}</b>　命中率 <b>${info.accuracy}</b>`;
    this.$('pause-info').innerHTML = html;
    this.show('pause');
  }

  // kind：'win' | 'lose' | 'dead'
  showResult(mode, kind, info) {
    const s = info.stats;
    this.$('result-mode').textContent = `${UI.MODES[mode].title} · ${this.world.mapName}`;
    const title = this.$('result-title');
    title.textContent = { win: '胜利', lose: '失败', dead: '阵亡' }[kind];
    title.className = kind;
    this.$('result-score').innerHTML = mode === 'duel'
      ? `<b class="me">${info.score.player}</b><i>:</i><b class="enemy">${info.score.bot}</b>`
      : `坚持到第 <b>${info.wave}</b> 波`;
    const cells = [
      ['击杀', s.kills], ['爆头', s.heads], ['命中率', info.accuracy], ['射击', s.shots], ['命中', s.hits],
    ];
    this.$('result-stats').innerHTML = cells.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    this.show('result');
  }

  // NPC 模型加载完才能进对战模式。ok=false 表示加载失败，退回方块小人照样能玩
  setNpcReady(ok) {
    this.npcReady = true;
    this.npcNote = ok ? '' : 'NPC 模型加载失败，使用简易小人';
    this.renderMode();
  }

  toast(text) {
    let el = this.$('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // ---------- 首页 ----------
  buildHome() {
    const $ = this.$;
    // 顶栏的标签页
    for (const a of document.querySelectorAll('[data-tab]')) {
      a.addEventListener('click', (e) => { e.preventDefault(); this.setTab(a.dataset.tab); });
    }
    this.setTab('play');

    // 模式列表
    const list = $('mode-list');
    Object.entries(UI.MODES).forEach(([key, m], i) => {
      const b = document.createElement('button');
      b.className = 'mode';
      b.dataset.mode = key;
      b.innerHTML = `<span class="num">0${i + 1}</span><span class="txt"><b>${m.title}</b><small>${m.sub}</small></span><span class="en">${m.en}</span>`;
      b.addEventListener('click', () => {
        this.mode = key;
        Game.Settings.set('mode', key);
        this.renderMode();
      });
      list.appendChild(b);
    });

    // 地图
    const img = $('map-img');
    img.addEventListener('error', () => img.classList.add('missing'));
    img.src = `${Game.Config.ui.mapPreview}${Game.Config.map}.webp`;
    $('map-name').textContent = this.world.mapName;

    // 天气 / 时段（#77）：存进设置，main.js 收到变化后换场景
    const weather = $('weather-pick');
    for (const [key, p] of Object.entries(Game.Config.weather.presets)) {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.dataset.key = key;
      b.addEventListener('click', () => Game.Settings.set('weather', key));
      weather.appendChild(b);
    }
    const renderWeather = () => {
      for (const b of weather.children) b.classList.toggle('on', b.dataset.key === Game.Settings.get('weather'));
    };
    Game.Settings.onChange((k) => { if (k === 'weather') renderWeather(); });
    renderWeather();

    // 对决杀数
    const duelLen = $('duel-len');
    for (const n of Game.Config.duel.winScoreOptions) {
      const b = document.createElement('button');
      b.textContent = `先到 ${n} 杀`;
      b.dataset.n = n;
      b.addEventListener('click', () => { Game.Settings.set('winScore', n); this.renderMode(); });
      duelLen.appendChild(b);
    }

    // 装备选择：点按钮切换（事件委托，按钮每次 renderMode 重画）
    $('loadout-pick').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-slot]');
      if (b) this.pickLoadout(b.dataset.slot, b.dataset.key);
    });

    $('btn-deploy').addEventListener('click', () => {
      if (this.deployBlocked()) return;
      this.audio.init();
      if (this.onDeploy) this.onDeploy(this.mode);
    });

    // 静音按钮：记住静音前的音量，再点恢复
    const mute = $('btn-mute');
    const renderMute = () => {
      const on = Game.Settings.get('volume') === 0;
      mute.classList.toggle('muted', on);
      mute.title = on ? '取消静音' : '静音';
      mute.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/>${on ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`;
    };
    mute.addEventListener('click', () => {
      const v = Game.Settings.get('volume');
      if (v > 0) { this.lastVolume = v; Game.Settings.set('volume', 0); }
      else Game.Settings.set('volume', this.lastVolume || Game.Settings.defaultOf('volume'));
    });
    Game.Settings.onChange((k) => { if (k === 'volume') renderMute(); });
    renderMute();
  }

  setTab(tab) {
    this.$('scr-home').dataset.tab = tab;
    for (const a of document.querySelectorAll('.tabs [data-tab]')) a.classList.toggle('on', a.dataset.tab === tab);
    if (tab === 'settings') { this.renderKeys(); if (Game.DevLog) Game.DevLog.renderPanel(); }
  }

  deployBlocked() {
    return (UI.MODES[this.mode].npc && (!this.npcReady || this.loading.npc)) || this.loading.rifle || this.loading.pistol;
  }

  // 换装备：存进设置（settings 写回 Game.Config），交给 main.js 下载模型；失败就换回原来的
  pickLoadout(slot, key) {
    const prev = Game.Settings.get(slot);
    if (key === prev || this.loading[slot]) return;
    Game.Settings.set(slot, key);
    this.loading[slot] = true;
    this.renderMode();
    const done = this.onLoadout ? this.onLoadout(slot) : Promise.resolve();
    done.then((ok) => {
      if (ok === false) {    // NPC 模型加载失败
        this.toast(`${Game.Config.loadout.npc[key].name} 模型加载失败`);
        Game.Settings.set(slot, prev);
        return this.onLoadout(slot);
      }
    }).catch((err) => {
      console.error(err);
      this.toast(`${Game.Config.loadout[slot][key].name} 模型加载失败`);
      Game.Settings.set(slot, prev);
      return this.onLoadout(slot);
    }).finally(() => {
      this.loading[slot] = false;
      this.renderMode();
    });
  }

  // 按当前选中的模式刷新首页
  renderMode() {
    const $ = this.$;
    const m = UI.MODES[this.mode];
    $('mode-title').textContent = m.title;
    $('mode-desc').textContent = m.desc;
    $('mode-tags').innerHTML = m.tags().map((t) => `<span>${t}</span>`).join('');
    for (const b of document.querySelectorAll('#mode-list .mode')) b.classList.toggle('on', b.dataset.mode === this.mode);
    $('opt-duel').style.display = this.mode === 'duel' ? '' : 'none';
    for (const b of $('duel-len').children) b.classList.toggle('on', Number(b.dataset.n) === Game.Config.duel.winScore);
    $('loadout-pick').innerHTML = this.pickHtml();
    $('loadout').innerHTML = this.loadoutHtml();

    const blocked = this.deployBlocked();
    const btn = $('btn-deploy');
    btn.disabled = blocked;
    btn.firstElementChild.textContent = !blocked ? '进入战斗'
      : this.loading.rifle || this.loading.pistol ? '枪模加载中…' : 'NPC 模型加载中…';
    const chip = $('npc-status');
    chip.textContent = this.npcNote;
    chip.style.display = this.npcNote ? '' : 'none';
  }

  // 可切换的装备：主武器、副武器，有 NPC 的模式再加一行对手形象
  pickHtml() {
    const L = Game.Config.loadout;
    const rows = [['rifle', '主武器'], ['pistol', '副武器']];
    if (UI.MODES[this.mode].npc) rows.push(['npc', '对手']);
    return rows.map(([slot, label]) => {
      const cur = Game.Settings.get(slot);
      const btns = Object.entries(L[slot]).map(([key, it]) => {
        const on = key === cur;
        const busy = on && this.loading[slot];
        return `<button data-slot="${slot}" data-key="${key}" class="${on ? 'on' : ''}${busy ? ' busy' : ''}">${it.name}${busy ? '…' : ''}</button>`;
      }).join('');
      return `<div class="pick"><span>${label}</span><div class="seg">${btns}</div></div>`;
    }).join('');
  }

  // 投掷物：数量
  loadoutHtml() {
    const G = Game.Config.grenades;
    const unlimited = this.mode === 'range';   // 训练场投掷物不限量
    return ['frag', 'flash', 'smoke']
      .map((k) => `<div><b>${G[k].name}</b><small>${unlimited ? '× ∞' : `× ${G[k].count}`}</small></div>`).join('');
  }

  // ---------- 设置 ----------
  buildSettings() {
    const $ = this.$;
    const S = Game.Settings;
    const R = Game.Config.ui;

    // 滑块：拖动时立即生效，并在右边显示数值
    const slider = (id, key, { min, max, toUi = (v) => v, fromUi = (v) => v, fmt }) => {
      const el = $(id);
      const out = $(`${id}-v`);
      el.min = min; el.max = max;
      const render = () => { el.value = toUi(S.get(key)); out.textContent = fmt(S.get(key)); };
      el.addEventListener('input', () => { S.set(key, fromUi(Number(el.value))); out.textContent = fmt(S.get(key)); });
      S.onChange((k) => { if (k === key) render(); });
      render();
    };
    slider('set-sens', 'sensitivity', { min: R.sensitivityRange[0], max: R.sensitivityRange[1], fmt: (v) => v.toFixed(2) });
    slider('set-fov', 'fov', { min: R.fovRange[0], max: R.fovRange[1], fmt: (v) => `${v}°` });
    slider('set-vol', 'volume', { min: 0, max: 100, toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100, fmt: (v) => `${Math.round(v * 100)}` });

    const fs = $('set-fs');
    fs.checked = S.get('fullscreen');
    fs.addEventListener('change', () => S.set('fullscreen', fs.checked));
    S.onChange((k) => { if (k === 'fullscreen') fs.checked = S.get('fullscreen'); });

    // 准星颜色
    const cross = $('set-cross');
    const renderCross = () => {
      for (const b of cross.children) b.classList.toggle('on', b.dataset.c === S.get('crosshair'));
    };
    for (const c of R.crosshairColors) {
      const b = document.createElement('button');
      b.dataset.c = c;
      b.style.setProperty('--c', c);
      b.title = c;
      b.addEventListener('click', () => S.set('crosshair', c));
      cross.appendChild(b);
    }
    S.onChange((k) => { if (k === 'crosshair') renderCross(); });
    renderCross();

    $('btn-set-reset').addEventListener('click', (e) => { e.preventDefault(); S.reset(); });
    $('btn-keys-reset').addEventListener('click', (e) => {
      e.preventDefault();
      this.input.finishCapture(null);
      this.input.resetBindings();
      this.keysChanged();
    });
    this.renderKeys();
  }

  applyCrosshair() {
    document.documentElement.style.setProperty('--cross', Game.Settings.get('crosshair'));
  }

  // 按键改了：刷新按键表、武器栏和底部提示
  keysChanged() {
    this.renderKeys();
    this.hud.renderSlots();
    if (this.hud.mode) this.hud.setMode(this.hud.mode);
  }

  // 把动作列表画成表格，点按键名 → 等待玩家按一个键 → 保存并重画
  renderKeys() {
    const input = this.input;
    const table = this.$('keys');
    table.innerHTML = '';
    const row = (label, html) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${html}</td>`;
      table.appendChild(tr);
      return tr;
    };
    row('转动视角', '<span class="key fixed">鼠标</span>');
    for (const [action, label] of Game.Input.ACTIONS) {
      const tr = row(label, `<span class="key">${Game.Input.bindingName(input.bindings[action])}</span>`);
      const btn = tr.querySelector('.key');
      btn.addEventListener('click', () => {
        if (input.capture) { input.finishCapture(null); this.renderKeys(); return; }
        btn.textContent = '按一个键…';
        btn.classList.add('waiting');
        input.startCapture((code) => {
          if (code) input.bind(action, code);
          this.keysChanged();
        });
      });
    }
  }

  // ---------- 简报 / 暂停 / 结算的按钮 ----------
  bindScreens() {
    const $ = this.$;
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });

    // 简报页点任意位置开始（"返回首页"除外）
    $('scr-brief').addEventListener('click', () => { if (this.onStart) this.onStart(); });
    click('btn-brief-back', () => this.onQuit && this.onQuit());

    click('btn-resume', () => this.onResume && this.onResume());
    click('btn-restart', () => this.onRestart && this.onRestart());
    click('btn-quit', () => this.onQuit && this.onQuit());
    click('btn-pause-settings', () => this.openPauseSettings());
    click('btn-pause-back', () => this.closePauseSettings());
    // 开发者数据：打开暂停里的设置，滚到"开发者"一栏
    click('btn-pause-dev', () => this.openDevPanel());
    // 快捷键 ⇧⌘=（Windows：Ctrl+Shift+=）：在哪都能直接打开开发者面板。键在 config.dev.panelKey。
    // 拦掉浏览器默认的"放大页面"
    document.addEventListener('keydown', (e) => {
      const k = Game.Config.dev.panelKey;
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || (e.code !== k && !(k === 'Equal' && e.code === 'NumpadAdd'))) return;
      e.preventDefault();
      if (!e.repeat && !this.input.capture) this.openDevPanel();
    });

    click('btn-again', () => this.onRestart && this.onRestart());
    click('btn-home', () => this.onQuit && this.onQuit());
  }

  // 打开设置里的"开发者"一栏：战斗中先解锁鼠标进暂停（main.js 的 onLockChange 会显示暂停页），再打开暂停里的设置
  openDevPanel() {
    const reveal = () => this.$('set-dev').scrollIntoView({ block: 'start' });
    if (this.input.locked) {
      document.addEventListener('pointerlockchange', () => {
        if (this.screen === 'pause') { this.openPauseSettings(); reveal(); }
      }, { once: true });
      document.exitPointerLock();
    } else if (this.screen === 'pause') { this.openPauseSettings(); reveal(); }
    else if (this.screen === 'home') { this.setTab('settings'); reveal(); }
  }

  // 暂停里的设置：把首页那块设置面板搬过来，关掉时搬回去
  openPauseSettings() {
    this.$('pause-settings').appendChild(this.$('settings'));
    this.$('scr-pause').classList.add('with-settings');
    this.renderKeys();
    if (Game.DevLog) Game.DevLog.renderPanel();
  }

  closePauseSettings() {
    const pane = this.$('scr-pause');
    if (!pane.classList.contains('with-settings')) return;
    if (this.input.capture) this.input.finishCapture(null);
    this.$('tab-settings').appendChild(this.$('settings'));
    pane.classList.remove('with-settings');
  }
};

// 模式介绍。只是界面文字，规则本身在 bots.js / main.js
Game.UI.MODES = {
  duel: {
    title: '1v1 对决', en: 'DUEL', sub: '和一名 NPC 对手互相猎杀', npc: true,
    desc: '在集装箱堆场里和一名 NPC 对手正面交锋。双方装备相同，阵亡后几秒重生，先拿到指定击杀数的一方获胜。',
    tags: () => ['1 名对手', `先到 ${Game.Config.duel.winScore} 杀`, `阵亡 ${Game.Config.duel.respawnDelay} 秒重生`],
    goal: () => `先拿到 ${Game.Config.duel.winScore} 次击杀。对手的装备和你一样，注意它也会丢雷。`,
  },
  waves: {
    title: '波次生存', en: 'WAVES', sub: '敌人一波比一波多', npc: true,
    desc: '敌人一波接一波地涌来，人数越来越多。清完一波回满血、补满弹药，只有一条命，看你能撑到第几波。',
    tags: () => ['无限波次', '只有一条命', '清波回血补弹'],
    goal: () => '消灭每一波敌人。清完一波会回满血、补满弹药，阵亡即结束。',
  },
  range: {
    title: '训练场', en: 'RANGE', sub: '打靶、练枪、练投掷', npc: false,
    desc: '站在高台上打固定靶和移动靶，熟悉后坐力、散布和投掷弧线。投掷物不限量，没有敌人。',
    tags: () => ['固定靶 + 移动靶', '投掷物不限量', '没有敌人'],
    goal: (k) => `随便打。按 ${k('resetStats')} 重置统计，Esc 暂停或回首页。`,
  },
};
