// ============================================================
// HUD：准星、命中标记、弹药、生命值、受击方向、比分/波次、统计
// 用普通 HTML 元素叠在 3D 画面上面，比在 3D 里画文字简单得多。
// 首页、暂停、结算这些界面在 ui.js。
// ============================================================
Game.Hud = class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), reloadBar: $('ammo-reload'),
      stats: $('stats'), shots: $('stat-shots'), hits: $('stat-hits'), heads: $('stat-heads'),
      acc: $('stat-acc'), kills: $('stat-kills'),
      ammo: $('ammo'), ammoCur: $('ammo-cur'), ammoMax: $('ammo-max'), weapons: $('weapons'),
      flashWhite: $('flash-white'),
      money: $('money'), moneyVal: $('money-val'), moneyGain: $('money-gain'), buyTip: $('buy-tip'), buy: $('buy'),
      health: $('health'), healthVal: $('health-val'), healthBar: $('health-bar'),
      damageFlash: $('damage-flash'), damageDir: $('damage-dir'),
      wave: $('wave-info'), banner: $('banner'), hint: $('hint'),
    };
    this.input = null;   // main.js 设置，用来显示当前绑定的按键名
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

  // 不同模式显示不同的 HUD 元素
  setMode(mode) {
    const battle = mode === 'duel' || mode === 'waves';
    this.el.stats.classList.toggle('battle', battle);
    this.el.health.style.display = battle ? 'block' : 'none';
    this.el.wave.style.display = battle ? 'flex' : 'none';
    const key = (a) => this.input ? Game.Input.bindingName(this.input.bindings[a]) : '?';
    const common = `${key('reload')} 换弹 · ${key('lastWeapon')} / 滚轮 切枪`;
    this.el.hint.textContent = battle
      ? `${common} · ${key('buy')} 出生点购买 · Esc 暂停`
      : `${common} · ${key('resetStats')} 重置统计 · Esc 暂停`;
    this.mode = mode;
    this.damageTimer = this.bannerTimer = 0;
    this.flashTimer = 0;
    this.el.flashWhite.style.opacity = 0;
  }

  setAmmo(ammo, mag) {
    this.el.ammoCur.textContent = ammo;
    this.el.ammoMax.textContent = '/ ∞';
    this.el.ammo.classList.toggle('low', ammo <= mag * 0.2);
  }

  // 换弹进度：弹药数变暗，下面一条细线从左往右走满。progress 0 ~ 1，null 表示没在换弹
  // （不在准星旁边写字，换弹看手上的动作；这条线只是告诉你还要多久）
  setReload(progress) {
    const on = progress !== null;
    this.el.ammo.classList.toggle('reloading', on);
    if (on) this.el.reloadBar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
  }

  // 手上拿的是投掷物：只显示还剩几个
  setThrowable(count) {
    this.el.ammoCur.textContent = count;
    this.el.ammoMax.textContent = '';
    this.el.ammo.classList.remove('low');
    this.setReload(null);
  }

  // ---- 经济（economy.js 调用）----
  setMoney(money, show = true) {
    this.el.money.style.display = show ? 'block' : 'none';
    this.el.moneyVal.textContent = money;
  }

  // 拿到赏金：钱数旁边飘一行 "+$300 爆头"，到了上限显示"钱已到上限"
  moneyGain(amount, label) {
    const el = this.el.moneyGain;
    el.textContent = amount > 0 ? `+$${amount} ${label}` : `${label} · 钱已到上限`;
    el.classList.remove('show');
    void el.offsetWidth;   // 重新触发 CSS 动画
    el.classList.add('show');
  }

  // 在购买区里：准星下方提示按哪个键买
  setBuyTip(text) {
    this.el.buyTip.textContent = text || '';
    this.el.buyTip.style.display = text ? 'block' : 'none';
  }

  // 购买面板。rows: [{ key, name, price, count, max, ok }]，null 表示关掉
  setBuyMenu(rows, money, closeKey) {
    const el = this.el.buy;
    el.style.display = rows ? 'block' : 'none';
    if (!rows) return;
    el.innerHTML = `<h4>购买<b>$${money}</b></h4>` + rows.map((r) =>
      `<div class="${r.ok ? '' : 'off'}"><kbd>${r.key}</kbd><span>${r.name}</span><i>${r.count} / ${r.max}</i><b>$${r.price}</b></div>`
    ).join('') + `<p>${closeKey} 关闭 · 离开出生点自动关闭</p>`;
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
    this.waveAlive = alive;   // 暂停界面要显示
    this.waveTotal = total;
    this.el.wave.innerHTML = `<small>第</small><b>${wave}</b><small>波</small><span class="sep"></span>剩余敌人 <b class="enemy">${alive}</b> / ${total}`;
  }

  // 对决比分
  setScore(mine, theirs, target) {
    this.el.wave.innerHTML =
      `<span class="side me">你</span><b class="me">${mine}</b><i>:</i><b class="enemy">${theirs}</b>` +
      `<span class="side enemy">敌</span><small>先到 ${target} 杀</small>`;
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
