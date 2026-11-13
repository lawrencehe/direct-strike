// ============================================================
// 输入：键盘、鼠标、指针锁定（Pointer Lock）、按键绑定
// 指针锁定 = 隐藏鼠标并把它"锁"在窗口里，这样鼠标可以无限转动视角。
// 所有 FPS 网页游戏都靠它。
//
// 游戏逻辑不直接问"W 有没有按下"，而是问"forward 这个动作有没有按下"，
// 动作 → 按键 的对应关系（绑定）可以在设置里改，并保存在浏览器里。
// ============================================================
Game.Input = class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();     // 当前按住的键
    this.pressed = new Set();  // 这一帧刚按下的键（只持续一帧）
    this.mouseX = 0;           // 这一帧累计的鼠标移动量
    this.mouseY = 0;
    this.wheel = 0;            // 这一帧的滚轮方向：1 向下，-1 向上（切枪用）
    this.locked = false;
    this.onLockChange = null;
    this.onLockError = null;   // 浏览器拒绝锁定鼠标，自动重试也没成功
    this.lockRetry = 0;        // 这次 lock() 还能自动重试几次
    this.fsPending = false;    // 这次 lock() 发起的全屏请求还没出结果
    this.afterFs = null;       // 全屏有结果后要做的事（重试锁鼠标）
    this.keyboardLocked = false;   // 全屏里已经用 Keyboard Lock 接管了 Esc 和浏览器快捷键

    this.bindings = Game.Input.loadBindings();
    this.capture = null;       // 正在等待玩家按键来改绑定时的回调

    document.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        if (!e.repeat) this.finishCapture(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (!this.locked) return;
      // 接管键盘后（见 syncKeyboardLock）短按 Esc 不再由浏览器处理，自己解锁鼠标进暂停，全屏保留。
      // 没接管时浏览器已经处理了，这里再调一次也没有副作用
      if (e.code === 'Escape') { document.exitPointerLock(); return; }
      // Mac：按住 ⌘ 时别的键不会有 keyup，记下来就会一直"按着"。⌘ 按下时把按住的键全放开，带 ⌘ 的组合键不算游戏按键
      if (e.code === 'MetaLeft' || e.code === 'MetaRight') { this.releaseAll(); return; }
      if (e.metaKey) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      // 这些键在浏览器里有默认行为（滚动、切换焦点…），游戏里要拦下来
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'MetaLeft' || e.code === 'MetaRight') this.releaseAll();   // ⌘ 按住期间松开的键收不到 keyup
      else this.down.delete(e.code);
    });

    // 窗口失去焦点（Mac 的 ⌘+空格 弹出聚焦搜索、⌘+Tab 切走…）：之后的 keyup 收不到，先把按住的键全放开。
    // 过一会儿焦点还没回来就解锁鼠标进暂停；等一下是因为进出全屏的过渡里焦点可能闪一下
    window.addEventListener('blur', () => {
      this.releaseAll();
      clearTimeout(this.blurTimer);
      this.blurTimer = setTimeout(() => {
        if (this.locked && !document.hasFocus()) document.exitPointerLock();
      }, Game.Config.view.blurPauseDelay * 1000);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.releaseAll();
      if (this.locked) document.exitPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 某些浏览器偶尔会报一个异常大的跳变，直接丢掉
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });

    // 鼠标键统一叫 Mouse0（左）、Mouse1（中）、Mouse2（右）、Mouse3/4（侧键）
    document.addEventListener('mousedown', (e) => {
      if (this.capture) {
        e.preventDefault();
        if (e.button !== 0) this.finishCapture(`Mouse${e.button}`);  // 左键留给点按钮用
        return;
      }
      if (!this.locked) return;
      this.down.add(`Mouse${e.button}`);
      this.pressed.add(`Mouse${e.button}`);
    });
    document.addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    document.addEventListener('wheel', (e) => {
      if (this.locked && e.deltaY) this.wheel = Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.locked || this.capture) e.preventDefault(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.releaseAll();
        // 进全屏的过渡把刚拿到的锁定弄掉了：等全屏有结果再锁一次
        if (this.fsPending && this.lockRetry > 0) { this.lockRetry--; this.afterFs = () => this.requestLock(); }
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    // 锁定被拒：自动再试一次（正在进全屏就等全屏有结果），还不行才提示玩家
    document.addEventListener('pointerlockerror', () => {
      if (this.lockRetry > 0) {
        this.lockRetry--;
        if (this.fsPending) this.afterFs = () => this.requestLock();
        else setTimeout(() => this.requestLock(), Game.Config.view.lockRetryDelay * 1000);
        return;
      }
      if (this.onLockError) this.onLockError();
    });
    document.addEventListener('fullscreenchange', () => { this.syncKeyboardLock(); this.settleFullscreen(); });
  }

  // 把按住的键全部放开（失去焦点、解锁鼠标、按了 ⌘ 时）。开发者模式的按键记录也听这个事件
  releaseAll() {
    this.down.clear();
    this.pressed.clear();
    document.dispatchEvent(new Event('inputrelease'));
  }

  // 全屏时用 Keyboard Lock 接管键盘（只有 Chrome / Edge 支持，而且只在全屏里生效）：
  // - 短按 Esc 交给页面（上面 keydown 里解锁鼠标进暂停），不退出全屏；长按 Esc 才退出全屏
  // - Ctrl/⌘+W、⌘+T 这类浏览器快捷键不再生效，不会误关标签页
  // 系统级的快捷键（Mac 的 ⌘+空格、⌘+Tab）网页拦不住，靠上面的失焦处理兜底
  syncKeyboardLock() {
    const kb = navigator.keyboard;
    if (!kb || !kb.lock || !Game.Config.view.keyboardLock) return;
    if (document.fullscreenElement) {
      kb.lock().then(() => { this.keyboardLocked = !!document.fullscreenElement; }, () => { this.keyboardLocked = false; });
    } else {
      kb.unlock();
      this.keyboardLocked = false;
    }
  }

  // 这次 lock() 的全屏请求有结果了（成功或被拒）：做完等着它的事
  settleFullscreen() {
    this.fsPending = false;
    const f = this.afterFs;
    this.afterFs = null;
    if (f) f();
  }

  requestLock() {
    if (this.locked) return;
    const r = this.element.requestPointerLock();
    if (r && r.catch) r.catch(() => {});   // 失败走 pointerlockerror 事件
  }

  // 锁定鼠标；fullscreen=true 时顺带进入全屏（首页不全屏，进入战斗才全屏）。
  // 两个请求都必须在同一次点击里同步发出（浏览器要求"用户手势"）。
  // **先锁鼠标再请求全屏**：Chrome 里全屏请求会把这次点击的"用户手势"用掉，而玩家按 Esc 退出锁定之后
  // 再锁必须有手势，先请求全屏的话锁鼠标就被拒（按 Esc 退出全屏后点"继续"报"没能锁定鼠标"）。
  // 全屏挂在整个页面上而不是 canvas，这样 HUD 和菜单也在全屏里。
  lock(fullscreen) {
    const root = document.documentElement;
    const wantFs = !!(fullscreen && !document.fullscreenElement && root.requestFullscreen);
    this.lockRetry = 1;
    this.afterFs = null;
    this.fsPending = wantFs;
    this.requestLock();
    if (wantFs) {
      const r = root.requestFullscreen({ navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => this.settleFullscreen());   // 被拒绝就照常窗口玩
    }
  }

  // 按物理键查询（一般不用，优先用下面按动作查询的）
  isDown(code)     { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  // 按动作查询：isAction('forward')、wasAction('reload')
  isAction(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  wasAction(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  // 取出本帧鼠标移动量并清零
  consumeMouse() {
    const m = { x: this.mouseX, y: this.mouseY };
    this.mouseX = this.mouseY = 0;
    return m;
  }

  // 把这一帧"刚按下"的某个动作吃掉，后面的代码就看不到了（购买菜单开着时数字键是买东西，不切武器）
  consumeAction(action) {
    for (const c of this.bindings[action] || []) this.pressed.delete(c);
  }

  // 每帧结束时调用
  endFrame() { this.pressed.clear(); this.wheel = 0; }

  // ---------- 改键 ----------
  // 开始等待玩家按下一个键；按下后调用 cb(code)，按 Esc 取消则 cb(null)
  startCapture(cb) { this.capture = cb; }
  finishCapture(code) {
    const cb = this.capture;
    this.capture = null;
    if (cb) cb(code);
  }

  // 把动作绑定到一个键。同一个键只能绑一个动作：别的动作用了它就解绑
  bind(action, code) {
    for (const a of Object.keys(this.bindings)) {
      this.bindings[a] = this.bindings[a].filter((c) => c !== code);
    }
    this.bindings[action] = [code];
    Game.Input.saveBindings(this.bindings);
  }

  resetBindings() {
    this.bindings = Game.Input.defaultBindings();
    try { localStorage.removeItem(Game.Input.STORAGE_KEY); } catch (e) { /* 隐私模式下可能不可用 */ }
  }

  static defaultBindings() {
    const out = {};
    for (const [a, codes] of Object.entries(Game.Config.keys)) out[a] = codes.slice();
    return out;
  }

  static loadBindings() {
    const b = Game.Input.defaultBindings();
    try {
      const saved = JSON.parse(localStorage.getItem(Game.Input.STORAGE_KEY) || 'null');
      if (saved) for (const a of Object.keys(b)) if (Array.isArray(saved[a])) b[a] = saved[a];
    } catch (e) { /* 存的东西坏了就用默认 */ }
    return Game.Input.dedupeBindings(b);
  }

  // 同一个键只能给一个动作。存下的改键和后来新加动作的默认键可能撞上
  // （例如以前把 buy 改成 F，后来新加的 quickBuy 默认也是 F），撞上时：
  // 用着自己默认键的动作留下这个键，另一个退回它自己的默认键，默认键也被占了就不绑定（#94）
  static dedupeBindings(b) {
    const def = Game.Input.defaultBindings();
    const isDefault = (a) => JSON.stringify(b[a]) === JSON.stringify(def[a]);
    const owner = {};
    const order = Object.keys(b).sort((x, y) => isDefault(y) - isDefault(x));   // 用默认键的先占
    const losers = [];
    for (const a of order) {
      if (b[a].some((c) => owner[c])) { losers.push(a); continue; }
      for (const c of b[a]) owner[c] = a;
    }
    for (const a of losers) {
      b[a] = def[a].some((c) => owner[c]) ? [] : def[a].slice();
      for (const c of b[a]) owner[c] = a;
    }
    return b;
  }

  static saveBindings(b) {
    try { localStorage.setItem(Game.Input.STORAGE_KEY, JSON.stringify(b)); } catch (e) { /* 忽略 */ }
  }

  // 把 KeyboardEvent.code 变成给人看的名字
  static keyName(code) {
    const special = {
      Space: '空格', ShiftLeft: '左 Shift', ShiftRight: '右 Shift',
      ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl', AltLeft: '左 Alt', AltRight: '右 Alt',
      CapsLock: 'CapsLock', Tab: 'Tab', Enter: '回车', Backspace: '退格',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Mouse0: '鼠标左键', Mouse1: '鼠标中键', Mouse2: '鼠标右键', Mouse3: '鼠标侧键 1', Mouse4: '鼠标侧键 2',
    };
    if (special[code]) return special[code];
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^Numpad(.+)$/.exec(code))) return `小键盘 ${m[1]}`;
    return code;
  }

  // 一组按键的显示名："左 Shift / 右 Shift" → 简化成 "Shift"
  static bindingName(codes) {
    if (!codes || !codes.length) return '未绑定';
    if (codes.length === 2 && codes[0].replace('Left', '') === codes[1].replace('Right', '')) {
      return Game.Input.keyName(codes[0]).replace('左 ', '');
    }
    return codes.map(Game.Input.keyName).join(' / ');
  }
};

Game.Input.STORAGE_KEY = 'fps.keys.v1';   // 项目改名前的键名，不要改，否则玩家保存的改键设置会丢失

// 设置界面里显示的动作顺序和中文名
Game.Input.ACTIONS = [
  ['forward', '前进'], ['back', '后退'], ['left', '左移'], ['right', '右移'],
  ['jump', '跳跃'], ['crouch', '下蹲（按住）'], ['sprint', '奔跑（按住）'],
  ['fire', '射击 / 投掷'], ['reload', '换弹'],
  ['slotRifle', '主武器'], ['slotPistol', '手枪'], ['slotFrag', '手雷'], ['slotFlash', '闪光弹'], ['slotSmoke', '烟雾弹'],
  ['lastWeapon', '上一把武器'], ['buy', '购买（在出生点）'], ['quickBuy', '快捷购买（在出生点）'], ['resetStats', '重置统计（训练场）'],
];
