// ============================================================
// 输入：键盘、鼠标、指针锁定（Pointer Lock）、按键绑定
// 指针锁定 = 隐藏鼠标并把它"锁"在窗口里，这样鼠标可以无限转动视角。
// 所有 FPS 网页游戏都靠它。
//
// 游戏逻辑不直接问"W 有没有按下"，而是问"forward 这个动作有没有按下"，
// 动作 → 按键 的对应关系（绑定）可以在开始界面里改，并保存在浏览器里。
// ============================================================
Game.Input = class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();     // 当前按住的键
    this.pressed = new Set();  // 这一帧刚按下的键（只持续一帧）
    this.mouseX = 0;           // 这一帧累计的鼠标移动量
    this.mouseY = 0;
    this.locked = false;
    this.onLockChange = null;

    this.bindings = Game.Input.loadBindings();
    this.capture = null;       // 正在等待玩家按键来改绑定时的回调

    document.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        if (!e.repeat) this.finishCapture(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (!this.locked) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      // 这些键在浏览器里有默认行为（滚动、切换焦点…），游戏里要拦下来
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.down.delete(e.code));

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
    document.addEventListener('contextmenu', (e) => { if (this.locked || this.capture) e.preventDefault(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() { this.element.requestPointerLock(); }

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

  // 每帧结束时调用
  endFrame() { this.pressed.clear(); }

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
  ['fire', '射击'], ['reload', '换弹'], ['resetStats', '重置统计（训练场）'],
];
