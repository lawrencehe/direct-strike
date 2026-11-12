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
      money: $('money'), moneyVal: $('money-val'), moneyGain: $('money-gain'), buyCue: $('buy-cue'), buyCueKey: $('buy-cue-key'), buyCueKey2: $('buy-cue-key2'), buy: $('buy'), buyCursor: $('buy-cursor'),
      health: $('health'), healthVal: $('health-val'), healthBar: $('health-bar'), healthTrail: $('health-trail'),
      damageFlash: $('damage-flash'), damageBlood: $('damage-blood'), damageDir: $('damage-dir'),
      wave: $('wave-info'), banner: $('banner'), hint: $('hint'),
    };
    this.input = null;   // main.js 设置，用来显示当前绑定的按键名
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.damageTimer = 0;
    this.damageFrom = null;
    this.blood = 0;          // 画面边缘血迹的浓度（#60）
    this.trailHp = 100;      // 血条后面那一截停在哪（掉血前的血量），慢慢缩到当前血量
    this.trailWait = 0;
    this.maxHp = 100;
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
      ? `${common} · ${key('buy')} / ${key('quickBuy')} 出生点购买 · Esc 暂停`
      : `${common} · ${key('resetStats')} 重置统计 · Esc 暂停`;
    this.mode = mode;
    this.damageTimer = this.bannerTimer = 0;
    this.flashTimer = 0;
    this.blood = 0;
    this.el.damageBlood.style.opacity = 0;
    this.el.flashWhite.style.opacity = 0;
  }

  // 弹药：枪里的 / 备弹。reserve = null 表示备弹无限（训练场）
  setAmmo(ammo, mag, reserve = null) {
    this.el.ammoCur.textContent = ammo;
    this.el.ammoMax.textContent = `/ ${reserve === null ? '∞' : reserve}`;
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
    el.classList.remove('spend');
    Hud.replay(el, 'show');
  }

  // 买东西花了钱：钱数白闪一下，旁边飘 "-$300"（只有数字）
  moneySpend(amount) {
    const el = this.el.moneyGain;
    el.textContent = `-$${amount}`;
    el.classList.add('spend');
    Hud.replay(el, 'show');
    Hud.replay(this.el.money, 'spent');
  }

  // 重新触发一个只播一次的 CSS 动画
  static replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // 买成功：武器栏里这一格闪亮、放大回弹 economy.boughtPulse 秒（在 renderSlots 里画）
  pulseSlot(action) {
    this.slotPulse = { action, t0: performance.now() };
  }

  // 菜单里买不了的那张卡：红一下、左右晃
  buyDenied(id) {
    const card = this.el.buy.querySelector(`[data-buy="${id}"]`);
    if (card) Hud.replay(card, 'denied');
  }

  // 不在购买区按了购买键：灰色购物车从左边探出来晃一下又收回
  buyCueDenied() {
    Hud.replay(this.el.buyCue, 'denied');
  }

  // 在购买区里：屏幕左侧的购物车图标（不用文字）。state：'ok' 买得起东西（橙色）| 'poor' 买不起（灰）| null 收起
  setBuyCue(state, keyName, quickName) {
    const el = this.el.buyCue;
    if (keyName && this.el.buyCueKey.textContent !== keyName) this.el.buyCueKey.textContent = keyName;
    if (quickName && this.el.buyCueKey2.textContent !== quickName) this.el.buyCueKey2.textContent = quickName;
    el.classList.toggle('show', !!state);
    el.classList.toggle('poor', state === 'poor');
    if (state) el.classList.remove('denied');
  }

  // 购买菜单（#81），view 由 economy.refreshMenu 给，null 表示关掉：
  //   { type: 'classic', money, cat, cats: [{ name, items: [{ id, name, price, count, max, ok }] }], buyKey, quickKey }
  //   { type: 'quick', money, packs: [{ id, name, custom, cost, ok, lines: [{ kind, name, want, state }] }], buyKey, quickKey }
  // 每张卡都带 data-buy（商品或套餐的 id），鼠标点哪张由 buyCursor 判断
  setBuyMenu(view) {
    const el = this.el.buy;
    el.style.display = view ? 'block' : 'none';
    this.el.buyCursor.style.display = view ? 'block' : 'none';
    this.buyCards = null;
    this.buyHover = null;
    if (!view) return;
    const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${Hud.BUY_ICONS[k]}</svg>`;
    const head = (title) => `<header><h4>${title}</h4><b>$${view.money}</b></header>`;
    let html;
    if (view.type === 'classic') {
      html = head('购买') + '<div class="buy-cols">' + view.cats.map((c, ci) =>
        `<section class="${view.cat === ci ? 'sel' : view.cat >= 0 ? 'dim' : ''}"><h5><kbd>${ci + 1}</kbd>${c.name}</h5>` +
        c.items.map((it, ii) =>
          `<div class="buy-card${it.ok ? '' : ' off'}" data-buy="${it.id}"><kbd>${ii + 1}</kbd>${icon(it.id)}` +
          `<span>${it.name}</span><i>${it.count} / ${it.max}</i><b>$${it.price}</b></div>`).join('') +
        '</section>').join('') + '</div>' +
        `<p>${view.cat < 0 ? '数字键选分类' : '数字键选商品 · 退格返回'} · 点击购买 · ${view.quickKey} 快捷套餐 · ${view.buyKey} 关闭</p>`;
    } else {
      const lineHtml = (l) => `<li class="${l.state}">${icon(l.kind)}<span>${l.name}</span><i>×${l.want}</i></li>`;
      html = head('快捷购买') + '<div class="buy-packs">' + view.packs.map((p, i) =>
        `<div class="buy-card pack${p.ok ? '' : ' off'}" data-buy="${p.id}"><h5><kbd>${i + 1}</kbd>${p.name}</h5>` +
        (p.lines.length ? `<ul>${p.lines.map(lineHtml).join('')}</ul>` : '<ul class="empty"><li>在 B 菜单里买过一次后，自动记住那套</li></ul>') +
        `<b>${p.ok ? `$${p.cost}` : p.lines.length && p.lines.every((l) => l.state === 'have') ? '已齐' : '—'}</b></div>`).join('') + '</div>' +
        `<p>已有的跳过，钱不够的跳过 · 点击或数字键购买 · ${view.buyKey} 经典菜单 · ${view.quickKey} 关闭</p>`;
    }
    el.className = view.type;
    el.innerHTML = html;
  }

  // 菜单里的光标移到 (x, y)（屏幕像素），返回光标下面那张卡的 id（没有就 null）
  buyCursor(x, y) {
    this.el.buyCursor.style.transform = `translate(${x}px, ${y}px)`;
    // 卡片的位置在菜单重画后量一次，之后每帧只比坐标（getBoundingClientRect 每帧对几张卡来说也不贵，但没必要）
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (!this.buyCards || this.buyCardsSize !== size) {
      this.buyCardsSize = size;
      this.buyCards = [...this.el.buy.querySelectorAll('[data-buy]')].map((c) => ({ el: c, id: c.dataset.buy, r: c.getBoundingClientRect() }));
    }
    const hit = this.buyCards.find((c) => x >= c.r.left && x <= c.r.right && y >= c.r.top && y <= c.r.bottom);
    const id = hit ? hit.id : null;
    if (id !== this.buyHover) {
      for (const c of this.buyCards) c.el.classList.toggle('hover', c.id === id);
      this.buyHover = id;
    }
    return id;
  }

  // 武器栏。slots: [{ action, name, count?, on, empty }]
  setSlots(slots) {
    this.slots = slots;
    this.renderSlots();
  }

  renderSlots() {
    const name = (a) => this.input ? Game.Input.bindingName(this.input.bindings[a]) : '';
    // 刚买到的那一格加 bought；武器栏中途重画时用负的 animation-delay 接着播，动画不会从头再来
    const dur = Game.Config.economy.boughtPulse;
    const p = this.slotPulse, age = p ? (performance.now() - p.t0) / 1000 : Infinity;
    if (age >= dur) this.slotPulse = null;
    this.el.weapons.innerHTML = this.slots.map((s) => {
      const bought = age < dur && s.action === p.action;
      const cls = `slot${s.on ? ' on' : ''}${s.empty ? ' empty' : ''}${bought ? ' bought' : ''}`;
      const style = bought ? ` style="animation-duration:${dur}s;animation-delay:-${age.toFixed(3)}s"` : '';
      const count = s.count === undefined ? '' : `<b>${s.count}</b>`;
      return `<div class="${cls}"${style}><kbd>${name(s.action)}</kbd>${s.name}${count}</div>`;
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
    this.maxHp = max;
    this.hp = hp;
    if (hp >= this.trailHp) { this.trailHp = hp; this.trailWait = 0; this.drawTrail(); }   // 回血 / 重生：直接到位
  }

  drawTrail() {
    this.el.healthTrail.style.width = `${(this.trailHp / this.maxHp) * 100}%`;
  }

  // 受伤：屏幕边缘闪红 + 一个指向攻击者的红色弧；四角溅血、血条掉的那一截留一会儿、血量数字闪一下（#60）
  showDamage(fromPos, amount = 30) {
    this.damageTimer = 1;
    this.damageFrom = fromPos.clone();
    this.el.damageFlash.style.opacity = 0.6;
    this.blood = Math.min(1, Math.max(this.blood, 0.35 + amount / 60));
    this.el.damageBlood.style.transform = `scale(${Math.random() < 0.5 ? -1 : 1}, ${Math.random() < 0.5 ? -1 : 1})`;
    this.trailWait = Game.Config.hitReaction.trailDelay;
    const v = this.el.healthVal;
    v.classList.remove('hit');
    void v.offsetWidth;   // 重新触发动画
    v.classList.add('hit');
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
    const hr = Game.Config.hitReaction;
    if (this.blood > 0) {
      this.blood = Math.max(0, this.blood - dt / hr.bloodFade);
      this.el.damageBlood.style.opacity = this.blood;
    }
    if (this.trailWait > 0) this.trailWait -= dt;
    else if (this.trailHp > this.hp) {
      this.trailHp = Math.max(this.hp, this.trailHp - hr.trailSpeed * dt);
      this.drawTrail();
    }
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

// 购买菜单里的小图标（内嵌 SVG 路径，线条用 currentColor）
Game.Hud.BUY_ICONS = {
  rifle: '<path d="M8 3h7l-1 18H9z"/><path d="M9 8h6M9 13h5"/>',                                     // 步枪弹匣
  pistol: '<path d="M9 4h6v16H9z"/><path d="M9 9h6"/>',                                                // 手枪弹匣
  frag: '<circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5l4-2"/>',                            // 手雷
  flash: '<path d="M9 7h6v13H9z"/><path d="M10 7V4h4v3M6 10l-2-1M6 14H3M18 10l2-1M18 14h3"/>',       // 闪光弹
  smoke: '<path d="M8 8h8v12H8z"/><path d="M10 8V5h4v3M8 12h8"/>',                                    // 烟雾弹
};
