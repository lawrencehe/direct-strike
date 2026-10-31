// ============================================================
// HUD：准星、命中标记、弹药、统计数据、开始/暂停界面
// 用普通 HTML 元素叠在 3D 画面上面，比在 3D 里画文字简单得多。
// ============================================================
Game.Hud = class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), reloadTip: $('reload-tip'),
      shots: $('stat-shots'), hits: $('stat-hits'), heads: $('stat-heads'), acc: $('stat-acc'),
      ammo: $('ammo'), ammoCur: $('ammo-cur'),
      overlay: $('overlay'), overlaySub: $('overlay-sub'), startBtn: $('start-btn'),
    };
    this.hitTimer = 0;
    this.resetStats();
  }

  showOverlay(show, paused) {
    this.el.overlay.classList.toggle('hidden', !show);
    if (paused) {
      this.el.overlaySub.textContent = '已暂停';
      this.el.startBtn.textContent = '点击继续';
    }
  }

  setAmmo(ammo, mag, reloading) {
    this.el.ammoCur.textContent = ammo;
    this.el.ammo.classList.toggle('low', ammo <= mag * 0.2);
    this.el.reloadTip.style.display = reloading ? 'block' : 'none';
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

  recordHit(head) {
    this.stats.hits++;
    if (head) this.stats.heads++;
    this.renderStats();
    this.el.hitmarker.classList.toggle('head', head);
    this.hitTimer = 0.15;
  }

  resetStats() {
    this.stats = { shots: 0, hits: 0, heads: 0 };
    this.renderStats();
  }

  renderStats() {
    const s = this.stats;
    this.el.shots.textContent = s.shots;
    this.el.hits.textContent = s.hits;
    this.el.heads.textContent = s.heads;
    this.el.acc.textContent = s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '0%';
  }

  update(dt) {
    this.hitTimer -= dt;
    this.el.hitmarker.style.opacity = this.hitTimer > 0 ? 1 : 0;
  }
};
