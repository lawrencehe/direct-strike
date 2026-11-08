// ============================================================
// 玩家设置：灵敏度、视野、音量、准星颜色、自动全屏、对决杀数、上次选的模式
// 存在浏览器 localStorage 里，下次打开还在。加载时把值写回 Game.Config，
// 游戏其他地方照常读 Game.Config，不用关心设置是从哪来的。
// 默认值和可调范围在 config.js 的 view / audio / duel / ui 里。
// ============================================================
Game.Settings = (() => {
  const KEY = 'direct-strike.settings.v1';
  const OLD_DUEL_KEY = 'direct-strike.duelWinScore';   // v0.16 及以前单独存的对决杀数
  const C = Game.Config;
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

  // 每项设置：默认值 + 校验（存的值坏了就退回默认）
  const defaults = {
    sensitivity: 1,                          // 灵敏度倍率，乘 view.mouseSensitivity
    fov: C.view.fov,
    volume: C.audio.volume,
    crosshair: C.ui.crosshairColors[0],
    fullscreen: C.view.fullscreen,
    winScore: C.duel.winScore,
    mode: 'duel',
  };
  const valid = {
    sensitivity: (v) => typeof v === 'number' && v >= C.ui.sensitivityRange[0] && v <= C.ui.sensitivityRange[1],
    fov: (v) => typeof v === 'number' && v >= C.ui.fovRange[0] && v <= C.ui.fovRange[1],
    volume: (v) => typeof v === 'number' && v >= 0 && v <= 1,
    crosshair: (v) => C.ui.crosshairColors.includes(v),
    fullscreen: (v) => typeof v === 'boolean',
    winScore: (v) => C.duel.winScoreOptions.includes(v),
    mode: (v) => ['duel', 'waves', 'range'].includes(v),
  };

  const baseSensitivity = C.view.mouseSensitivity;
  const values = { ...defaults };
  const listeners = [];

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    const oldDuel = Number(localStorage.getItem(OLD_DUEL_KEY));
    if (saved.winScore === undefined && oldDuel) saved.winScore = oldDuel;
    for (const k of Object.keys(defaults)) if (valid[k](saved[k])) values[k] = saved[k];
  } catch (e) { /* 隐私模式下可能不可用，或者存的东西坏了：用默认 */ }

  // 把设置写回 Game.Config
  function apply() {
    C.view.mouseSensitivity = baseSensitivity * values.sensitivity;
    C.view.fov = values.fov;
    C.audio.volume = values.volume;
    C.view.fullscreen = values.fullscreen;
    C.duel.winScore = values.winScore;
  }
  apply();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 忽略 */ }
  }

  return {
    get: (k) => values[k],
    defaultOf: (k) => defaults[k],
    set(k, v) {
      if (!valid[k](v) || values[k] === v) return;
      values[k] = v;
      apply();
      save();
      for (const fn of listeners) fn(k, v);
    },
    // 恢复默认（不含上次选的模式和对决杀数，它们不在设置页里）
    reset() {
      for (const k of ['sensitivity', 'fov', 'volume', 'crosshair', 'fullscreen']) this.set(k, defaults[k]);
    },
    // 设置变了要立刻生效的（视野、音量、准星颜色），在这里注册
    onChange(fn) { listeners.push(fn); },
  };
})();
