// ============================================================
// 玩家设置：灵敏度、视野、音量、准星颜色、自动全屏、对决杀数、上次选的模式、选的装备（主副武器、NPC 形象）、天气 / 时段
// 存在浏览器 localStorage 里，下次打开还在。加载时把值写回 Game.Config，
// 游戏其他地方照常读 Game.Config，不用关心设置是从哪来的。
// 默认值和可调范围在 config.js 的 view / audio / duel / ui / loadout 里。
// ============================================================
Game.Settings = (() => {
  const KEY = 'direct-strike.settings.v1';
  const OLD_DUEL_KEY = 'direct-strike.duelWinScore';   // v0.16 及以前单独存的对决杀数
  const C = Game.Config;
  const L = C.loadout;
  // 枪的默认数值：选了哪把枪，就用"默认数值 + 那把枪自己写的覆盖项"拼出 weapons.rifle / weapons.pistol
  const baseGun = { rifle: { ...C.weapons.rifle }, pistol: { ...C.weapons.pistol } };

  // 每项设置：默认值 + 校验（存的值坏了就退回默认）
  const defaults = {
    sensitivity: 1,                          // 灵敏度倍率，乘 view.mouseSensitivity
    fov: C.view.fov,
    volume: C.audio.volume,
    crosshair: C.ui.crosshairColors[0],
    fullscreen: C.view.fullscreen,
    winScore: C.duel.winScore,
    mode: 'duel',
    rifle: Object.keys(L.rifle)[0],
    pistol: Object.keys(L.pistol)[0],
    npc: Object.keys(L.npc)[0],
    weather: C.weather.default,              // 天气 / 时段（#77），预设在 config.js 的 weather.presets
  };
  const valid = {
    sensitivity: (v) => typeof v === 'number' && v >= C.ui.sensitivityRange[0] && v <= C.ui.sensitivityRange[1],
    fov: (v) => typeof v === 'number' && v >= C.ui.fovRange[0] && v <= C.ui.fovRange[1],
    volume: (v) => typeof v === 'number' && v >= 0 && v <= 1,
    crosshair: (v) => C.ui.crosshairColors.includes(v),
    fullscreen: (v) => typeof v === 'boolean',
    winScore: (v) => C.duel.winScoreOptions.includes(v),
    mode: (v) => ['duel', 'waves', 'range'].includes(v),
    rifle: (v) => Object.prototype.hasOwnProperty.call(L.rifle, v),
    pistol: (v) => Object.prototype.hasOwnProperty.call(L.pistol, v),
    npc: (v) => Object.prototype.hasOwnProperty.call(L.npc, v),
    weather: (v) => Object.prototype.hasOwnProperty.call(C.weather.presets, v),
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
    for (const slot of ['rifle', 'pistol']) C.weapons[slot] = { ...baseGun[slot], ...L[slot][values[slot]] };
    C.character.model = L.npc[values.npc].model;
  }
  apply();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 忽略 */ }
  }

  return {
    get: (k) => values[k],
    // 某把枪的完整数值（默认数值 + 这把枪的覆盖项），NPC 随机拿到的枪用它（#54）
    gunConfig: (slot, key) => ({ ...baseGun[slot], ...L[slot][key] }),
    defaultOf: (k) => defaults[k],
    set(k, v) {
      if (!valid[k](v) || values[k] === v) return;
      values[k] = v;
      apply();
      save();
      for (const fn of listeners) fn(k, v);
    },
    // 恢复默认（不含上次选的模式、对决杀数、装备和天气，它们不在设置页里）
    reset() {
      for (const k of ['sensitivity', 'fov', 'volume', 'crosshair', 'fullscreen']) this.set(k, defaults[k]);
    },
    // 设置变了要立刻生效的（视野、音量、准星颜色），在这里注册
    onChange(fn) { listeners.push(fn); },
  };
})();
