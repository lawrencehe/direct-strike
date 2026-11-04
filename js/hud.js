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
      ammo: $('ammo'), ammoCur: $('ammo-cur'),
      health: $('health'), healthVal: $('health-val'), healthBar: $('health-bar'),
      damageFlash: $('damage-flash'), damageDir: $('damage-dir'),
      wave: $('wave-info'), banner: $('banner'), hint: $('hint'),
      overlay: $('overlay'), overlaySub: $('overlay-sub'), result: $('overlay-result'),
      resume: $('btn-resume'), loading: $('loading'),
      modeBtns: [$('btn-duel'), $('btn-waves')],
    };
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.damageTimer = 0;
    this.damageFrom = null;
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

  hideOverlay() { this.el.overlay.classList.add('hidden'); }

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
    this.el.hint.textContent = battle ? 'R 换弹 · Esc 暂停' : 'R 换弹 · T 重置统计 · Esc 暂停';
    this.damageTimer = this.bannerTimer = 0;
  }

  setAmmo(ammo, mag, reloading) {
    this.el.ammoCur.textContent = ammo;
    this.el.ammo.classList.toggle('low', ammo <= mag * 0.2);
    this.el.reloadTip.style.display = reloading ? 'block' : 'none';
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
