// ============================================================
// 输入：键盘、鼠标、指针锁定（Pointer Lock）
// 指针锁定 = 隐藏鼠标并把它"锁"在窗口里，这样鼠标可以无限转动视角。
// 所有 FPS 网页游戏都靠它。
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

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.down.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 某些浏览器偶尔会报一个异常大的跳变，直接丢掉
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked || e.button !== 0) return;
      this.down.add('Mouse0');
      this.pressed.add('Mouse0');
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.down.delete('Mouse0');
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() { this.element.requestPointerLock(); }

  isDown(code)     { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  // 取出本帧鼠标移动量并清零
  consumeMouse() {
    const m = { x: this.mouseX, y: this.mouseY };
    this.mouseX = this.mouseY = 0;
    return m;
  }

  // 每帧结束时调用
  endFrame() { this.pressed.clear(); }
};
