// ============================================================
// HUD：准星、命中标记、弹药、生命值、受击方向、比分/波次、统计、菜单
// 用普通 HTML 元素叠在 3D 画面上面，比在 3D 里画文字简单得多。
// ============================================================
Game.Hud = class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), reloadTip: $('reload-tip'),
      stats: $('stats'), shots: $('stat-shots'), hits: $('stat-hits'), heads: $('stat-heads'),
      acc: $('stat-acc'), kills: $('stat-kills'),
      ammo: $('ammo'), ammoCur: $('ammo-cur'), ammoMax: $('ammo-max'), weapons: $('weapons'),
      flashWhite: $('flash-white'), cookBar: $('cook-bar'),
      health: $('health'), healthVal: $('health-val'), healthBar: $('health-bar'),
      damageFlash: $('damage-flash'), damageDir: $('damage-dir'),
      wave: $('wave-info'), banner: $('banner'), hint: $('hint'),
      overlay: $('overlay'), overlaySub: $('overlay-sub'), result: $('overlay-result'),
      resume: $('btn-resume'), loading: $('loading'),
      keys: $('keys'), keysReset: $('btn-keys-reset'),
      modeBtns: [$('btn-duel'), $('btn-waves')],
    };
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.damageTimer = 0;
    this.damageFrom = null;
    this.flashTimer = 0;
    this.flashFade = 1;
    this.flashPeak = 0;
    this.slots = [];
    this.resetStats();
  }

  // kind: 'menu' | 'paused' | 'dead' | 'win' | 'lose'
  showOverlay(kind, score) {
    const el = this.el;
    el.overlay.classList.remove('hidden');
    el.resume.style.display = kind === 'paused' ? 'block' : 'none';
    el.result.style.display = kind === 'menu' || kind === 'paused' ? 'none' : 'block';
    el.overlaySub.textContent = {
      menu: '选择模式开始', paused: '已暂停', dead: '你阵亡了', win: '你赢了！', lose: '你输了',
    }[kind];
    const s = this.stats;
    if (kind === 'dead') {
      el.result.innerHTML =
        `坚持到 <b>第 ${this.waveNum} 波</b><br>` +
        `击杀 <b>${s.kills}</b> · 爆头 <b>${s.heads}</b> · 命中率 <b>${this.accuracy()}</b>`;
    } else if (kind === 'win' || kind === 'lose') {
      el.result.innerHTML =
        `比分 <b>${score.player} : ${score.bot}</b><br>` +
        `爆头 <b>${s.heads}</b> · 命中率 <b>${this.accuracy()}</b>`;
    }
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
    if (this.input && this.input.capture) this.input.finishCapture(null);   // 改到一半就开始游戏：取消
  }

  // ---------- 改键界面 ----------
  // 把动作列表画成表格，点按键名 → 等待玩家按一个键 → 保存并重画
  bindKeySettings(input) {
    this.input = input;
    this.el.keysReset.addEventListener('click', (e) => {
      e.preventDefault();
      input.finishCapture(null);
      input.resetBindings();
      this.renderKeys();
      this.renderSlots();
      if (this.mode) this.setMode(this.mode);   // 刷新底部的按键提示
    });
    this.renderKeys();
  }

  renderKeys() {
    const input = this.input;
    const table = this.el.keys;
    table.innerHTML = '';
    const row = (label, html) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${html}</td>`;
      table.appendChild(tr);
      return tr;
    };
    row('转动视角', '<span style="opacity:.7">鼠标</span>');
    for (const [action, label] of Game.Input.ACTIONS) {
      const tr = row(label, `<span class="key">${Game.Input.bindingName(input.bindings[action])}</span>`);
      const btn = tr.querySelector('.key');
      btn.addEventListener('click', () => {
        if (input.capture) { input.finishCapture(null); this.renderKeys(); return; }
        btn.textContent = '按一个键…';
        btn.classList.add('waiting');
        input.startCapture((code) => {
          if (code) input.bind(action, code);
          this.renderKeys();
          this.renderSlots();
          if (this.mode) this.setMode(this.mode);
        });
      });
    }
  }

  // 模型加载中：禁用对战按钮
  setLoading(on, note = '') {
    this.el.loading.textContent = on ? 'NPC 模型加载中…' : note;
    this.el.loading.style.display = on || note ? 'block' : 'none';
    for (const b of this.el.modeBtns) b.disabled = on;
  }

  // 不同模式显示不同的 HUD 元素
  setMode(mode) {
    const battle = mode === 'duel' || mode === 'waves';
    this.el.stats.classList.toggle('battle', battle);
    this.el.health.style.display = battle ? 'block' : 'none';
    this.el.wave.style.display = battle ? 'block' : 'none';
    const key = (a) => this.input ? Game.Input.bindingName(this.input.bindings[a]) : '?';
    const common = `${key('reload')} 换弹 · ${key('lastWeapon')} / 滚轮 切枪`;
    this.el.hint.textContent = battle
      ? `${common} · Esc 暂停`
      : `${common} · ${key('resetStats')} 重置统计 · Esc 暂停`;
    this.mode = mode;
    this.damageTimer = this.bannerTimer = 0;
    this.flashTimer = 0;
    this.el.flashWhite.style.opacity = 0;
  }

  setAmmo(ammo, mag, reloading) {
    this.el.ammoCur.textContent = ammo;
    this.el.ammoMax.textContent = '/ ∞';
    this.el.ammo.classList.toggle('low', ammo <= mag * 0.2);
    this.el.reloadTip.style.display = reloading ? 'block' : 'none';
  }

  // 手上拿的是投掷物：只显示还剩几个
  setThrowable(count) {
    this.el.ammoCur.textContent = count;
    this.el.ammoMax.textContent = '';
    this.el.ammo.classList.remove('low');
    this.el.reloadTip.style.display = 'none';
  }

  // 手雷倒计时：left 是还剩的比例 1 → 0，null 表示隐藏
  setCook(left) {
    const on = left !== null;
    this.el.cookBar.style.display = on ? 'block' : 'none';
    if (!on) return;
    this.el.cookBar.firstElementChild.style.width = `${Math.max(0, left) * 100}%`;
    this.el.cookBar.classList.toggle('danger', left < 0.34);
  }

  // 武器栏。slots: [{ action, name, count?, on, empty }]
  setSlots(slots) {
    this.slots = slots;
    this.renderSlots();
  }

  renderSlots() {
    const name = (a) => this.input ? Game.Input.bindingName(this.input.bindings[a]) : '';
    this.el.weapons.innerHTML = this.slots.map((s) => {
      const cls = `slot${s.on ? ' on' : ''}${s.empty ? ' empty' : ''}`;
      const count = s.count === undefined ? '' : `<b>${s.count}</b>`;
      return `<div class="${cls}"><kbd>${name(s.action)}</kbd>${s.name}${count}</div>`;
    }).join('');
  }

  // 被闪光弹闪到：强度 0 ~ 1，白屏持续 seconds 秒，最后一段慢慢淡出
  flash(strength, seconds) {
    // 还在白屏时又被闪一次，取更强的那个，不要反而变弱
    if (this.flashPeak * Math.min(1, this.flashTimer / this.flashFade) > strength) return;
    this.flashPeak = strength;
    this.flashTimer = seconds;
    this.flashFade = Math.max(0.4, seconds * 0.55);
  }

  // 不计入命中率的命中提示（手雷炸到人）
  showHit(killed) {
    if (killed) { this.stats.kills++; this.renderStats(); }
    this.el.hitmarker.classList.remove('head');
    this.el.hitmarker.classList.toggle('kill', killed);
    this.hitTimer = killed ? 0.35 : 0.15;
  }

  setHealth(hp, max) {
    this.el.healthVal.textContent = Math.ceil(hp);
    this.el.healthBar.style.width = `${(hp / max) * 100}%`;
    this.el.health.classList.toggle('low', hp <= max * 0.3);
  }

  // 受伤：屏幕边缘闪红 + 一个指向攻击者的红色弧
  showDamage(fromPos) {
    this.damageTimer = 1;
    this.damageFrom = fromPos.clone();
    this.el.damageFlash.style.opacity = 0.6;
  }

  setWave(wave, alive, total) {
    this.waveNum = wave;
    this.el.wave.textContent = `第 ${wave} 波 · 剩余敌人 ${alive} / ${total}`;
  }

  // 对决比分
  setScore(mine, theirs, target) {
    this.el.wave.innerHTML = `你 <b class="me">${mine}</b> : <b class="enemy">${theirs}</b> 敌 · 先到 ${target} 杀`;
  }

  banner(text, seconds = 2) {
    this.el.banner.textContent = text;
    this.bannerTimer = seconds;
  }

  // 把散布角度换算成屏幕像素，让准星张开的大小和真实散布一致
  setSpread(spread) {
    const halfFov = THREE.MathUtils.degToRad(Game.Config.view.fov / 2);
    const px = (Math.tan(spread) / Math.tan(halfFov)) * (window.innerHeight / 2);
    this.el.crosshair.style.setProperty('--gap', `${Math.max(4, px).toFixed(1)}px`);
  }

  recordShot() {
    this.stats.shots++;
    this.renderStats();
  }

  recordHit(head, killed) {
    this.stats.hits++;
    if (head) this.stats.heads++;
    if (killed) this.stats.kills++;
    this.renderStats();
    this.el.hitmarker.classList.toggle('head', head);
    this.el.hitmarker.classList.toggle('kill', killed);
    this.hitTimer = killed ? 0.35 : 0.15;
  }

  resetStats() {
    this.stats = { shots: 0, hits: 0, heads: 0, kills: 0 };
    this.waveNum = 0;
    this.renderStats();
  }

  accuracy() {
    const s = this.stats;
    return s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '0%';
  }

  renderStats() {
    const s = this.stats;
    this.el.shots.textContent = s.shots;
    this.el.hits.textContent = s.hits;
    this.el.heads.textContent = s.heads;
    this.el.kills.textContent = s.kills;
    this.el.acc.textContent = this.accuracy();
  }

  update(dt, player) {
    this.hitTimer -= dt;
    this.el.hitmarker.style.opacity = this.hitTimer > 0 ? 1 : 0;

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      this.el.flashWhite.style.opacity = this.flashPeak * Math.min(1, this.flashTimer / this.flashFade);
    }

    this.bannerTimer -= dt;
    this.el.banner.style.opacity = Math.max(0, Math.min(1, this.bannerTimer * 2));

    this.damageTimer = Math.max(0, this.damageTimer - dt);
    const flash = parseFloat(this.el.damageFlash.style.opacity) || 0;
    this.el.damageFlash.style.opacity = Math.max(0, flash - dt * 2);

    // 受击方向随玩家转身实时更新：攻击者在正前方时红弧在上方
    if (this.damageTimer > 0 && this.damageFrom) {
      const dx = this.damageFrom.x - player.position.x;
      const dz = this.damageFrom.z - player.position.z;
      const rel = Math.atan2(-dx, -dz) - player.yaw;
      this.el.damageDir.style.transform = `rotate(${-rel}rad)`;
    }
    this.el.damageDir.style.opacity = this.damageTimer;
  }
};
