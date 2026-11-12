// ============================================================
// 经济：打死敌人拿赏金，回到自己的出生点买子弹和投掷物
//
// 只在对决和波次里有（训练场子弹和投掷物不限量，不需要钱）。参数在 config.js 的 economy（数值见 #7）。
//   赏金：只看最后一击是怎么打死的（爆头 / 枪打身体或腿 / 手雷炸死），NPC 被自己的雷炸死不算。
//   钱有上限，到了上限再打死人也不涨。开局 startMoney；钱跟着整局走，死了不清零，重生时不足 startMoney 补到 startMoney。
//   购买区：玩家这条命出生的那个点，周围 buyRadius 米内，地上有一圈橙色的环。
//   进了购买区，屏幕左侧滑出一个购物车图标（带购买键的键帽），能买得起东西时亮橙色，买不起时变灰；不写文字提示。
//
// 两个购买菜单（#81），都在屏幕中间，开着照样能走：
//   B 经典菜单：按分类分列的卡片（economy.categories）。数字键先选分类、再选商品，一次买一件（子弹一个弹匣、投掷物一个），
//     买完面板不关，可以接着买；也能用鼠标点卡片。
//   F 快捷菜单：几张套餐卡（economy.packages + 自定义），按数字键或点一下就 Smart Buy（smartPlan）：套餐写的是"买到多少"，
//     已经够了的跳过；按优先级一件件买，钱不够的那件跳过、接着买后面的。买完面板关掉。
//     自定义套餐 = 上一次在 B 菜单里买完时的装备（只记买过的那几样，存在浏览器里）。
//   菜单开着时不解锁鼠标（解锁会进暂停）：屏幕上画一个光标，鼠标移动光标、不转视角；左键点卡片，不开枪；
//     槽位键、滚轮、上一把武器都被菜单吃掉，不切枪。走出购买区、死了、再按一次同一个键都会关。
//   能带多少有上限（投掷物 economy.maxCarry，子弹 weapons.maxMags 个弹匣），满了买不了；离子弹上限不到一个弹匣就只补到上限、按发收钱。
//
// 死了重生时子弹和投掷物回到开局的数量（多买的随人一起没了），波次之间补给不收走多买的。
// ============================================================
Game.Economy = class Economy {
  constructor({ scene, hud, audio, player, weapon, input }) {
    Object.assign(this, { scene, hud, audio, player, weapon, input });
    this.enabled = false;
    this.money = 0;
    this.menu = null;          // 开着的购买菜单：'classic'（B）| 'quick'（F）| null
    this.cat = -1;             // B 菜单里用数字键选中的分类，-1 = 还没选
    this.cursor = { x: 0, y: 0 };   // 菜单里的光标（屏幕像素）
    this.session = [];         // 这次打开 B 菜单买过的东西（按先后），关菜单时记成自定义套餐
    this.custom = Economy.loadCustom();   // 自定义套餐 [[商品, 买到多少], …]
    this.inZone = false;
    this.pulseT = 0;

    // 出生点地上的环。一开始就放进场景（材质提前编译，不在开局时卡一下），不用的时候透明度 0
    const cfg = Game.Config.economy;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(cfg.buyRadius - 0.12, cfg.buyRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xff5f00, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 1;
    scene.add(this.ring);
  }

  // 开新一局（main.js 的 startMode）
  start(mode) {
    this.enabled = mode === 'duel' || mode === 'waves';
    this.money = Game.Config.economy.startMoney;
    this.close();
    this.inZone = false;
    this.hud.setBuyCue(null);
    this.hud.setMoney(this.money, this.enabled);
    this.ring.material.opacity = 0;
  }

  // 重生（main.js 的 respawnPlayer）：钱不足开局的数补到开局的数，多的保留
  onRespawn() {
    if (!this.enabled) return;
    this.money = Math.max(this.money, Game.Config.economy.startMoney);
    this.hud.setMoney(this.money);
  }

  // 打死一个敌人。kind：'head' 爆头 | 'body' 枪打身体或腿 | 'frag' 手雷炸死
  award(kind) {
    if (!this.enabled) return;
    const cfg = Game.Config.economy;
    const gain = Math.max(0, Math.min(cfg.reward[kind] || 0, cfg.maxMoney - this.money));
    this.money += gain;
    this.hud.setMoney(this.money);
    this.hud.moneyGain(gain, Economy.LABELS[kind]);
    this.refreshMenu();
  }

  get open() { return !!this.menu; }

  // 每帧（玩家活着时）：判断在不在购买区，处理菜单里的按键和鼠标。
  // 要在 player.update 和 weapon.update 之前调用：菜单开着时它先拿走鼠标移动（不转视角）、左键（不开枪）和槽位键（不切枪）
  update(dt) {
    if (!this.enabled) return;
    const cfg = Game.Config.economy;
    const spawn = this.player.spawn, pos = this.player.position;
    this.inZone = Math.hypot(pos.x - spawn.x, pos.z - spawn.z) < cfg.buyRadius && Math.abs(pos.y - spawn.y) < 1.5;

    // 环跟着出生点走（对决里每次重生的点不一样），在里面时亮一些
    this.pulseT += dt;
    this.ring.position.set(spawn.x, spawn.y + 0.03, spawn.z);
    this.ring.material.opacity = (this.inZone ? 0.55 : 0.3) + Math.sin(this.pulseT * 3) * 0.08;

    const input = this.input;
    const key = (a) => Game.Input.bindingName(input.bindings[a]);
    if (!this.inZone) {
      this.close();
      this.hud.setBuyCue(null);
      // 不在购买区按购买键：灰色购物车从左边探出来晃一下又收回，响一声"不行"
      if (input.wasAction('buy') || input.wasAction('quickBuy')) { this.hud.buyCueDenied(); this.audio.denied(); }
      return;
    }
    if (input.wasAction('buy')) this.menu === 'classic' ? this.close() : this.openMenu('classic');
    else if (input.wasAction('quickBuy')) this.menu === 'quick' ? this.close() : this.openMenu('quick');

    if (this.menu) this.menuInput();

    // 购物车图标：面板开着时收起；能买得起任何一样亮，买不起灰
    this.hud.setBuyCue(this.menu ? null : (Economy.ITEMS.some((k) => this.canBuy(k)) ? 'ok' : 'poor'), key('buy'), key('quickBuy'));
  }

  // 菜单开着时的输入：数字键、鼠标光标、左键
  menuInput() {
    const input = this.input;
    // 先记下数字键和左键，再把会让武器动的输入吃掉（槽位键默认就是数字键，先吃掉就读不到了）。
    // 数字键：物理的 1 ~ 9（主键盘或小键盘），不管槽位键改成了什么；同一帧按了几个只认第一个
    let digit = 0;
    for (let n = 1; n <= 9 && !digit; n++) {
      if (input.pressed.has(`Digit${n}`) || input.pressed.has(`Numpad${n}`)) digit = n;
    }
    for (let n = 1; n <= 9; n++) { input.pressed.delete(`Digit${n}`); input.pressed.delete(`Numpad${n}`); }
    const click = input.pressed.has('Mouse0');
    // 槽位键、上一把、滚轮、开火都吃掉（开火按住的也放掉，不然自动枪会接着打）
    for (const a of Object.values(Game.Weapon.ACTIONS)) input.consumeAction(a);
    input.consumeAction('lastWeapon');
    input.wheel = 0;
    for (const c of input.bindings.fire || []) { input.pressed.delete(c); input.down.delete(c); }
    input.pressed.delete('Mouse0'); input.down.delete('Mouse0');
    if (this.menu === 'classic' && input.pressed.has('Backspace') && this.cat >= 0) { this.cat = -1; this.refreshMenu(); }
    if (digit) this.pressDigit(digit);

    // 光标：鼠标移动的量按 cursorSpeed 移到光标上，不转视角
    const m = input.consumeMouse(), sp = Game.Config.economy.cursorSpeed;
    const c = this.cursor;
    c.x = Math.max(0, Math.min(window.innerWidth, c.x + m.x * sp));
    c.y = Math.max(0, Math.min(window.innerHeight, c.y + m.y * sp));
    const hover = this.hud.buyCursor(c.x, c.y);
    if (click && hover) this.choose(hover);
  }

  // 菜单里按了数字键 n
  pressDigit(n) {
    if (this.menu === 'quick') {
      const p = this.packages()[n - 1];
      if (p) this.choose(p.id);
      return;
    }
    const cats = Game.Config.economy.categories;
    if (this.cat < 0) {                 // 第一下：选分类
      if (n > cats.length) return;
      this.cat = n - 1;
      this.refreshMenu();
      return;
    }
    const kind = cats[this.cat].items[n - 1];   // 第二下：选商品
    if (kind) this.choose(kind);
  }

  // 选中一张卡片（数字键或鼠标）：id 是商品（rifle / frag …）或套餐（pack0 …）
  choose(id) {
    if (Economy.ITEMS.includes(id)) {
      if (this.canBuy(id)) {
        this.buy(id);
        this.cat = -1;                  // 买到了回到选分类（和 CS 一样），面板不关
        this.refreshMenu();
      } else this.deny(id);
      return;
    }
    const p = this.packages().find((q) => q.id === id);
    if (!p) return;
    const plan = this.smartPlan(p.items);
    if (!plan.buys.length) { this.deny(id); return; }
    this.buyPlan(plan);
    this.close();
  }

  // 买不了：那张卡红一下、左右晃，响一声"不行"，面板留着
  deny(id) {
    this.audio.denied();
    this.hud.buyDenied(id);
  }

  isGun(kind) { return kind === 'rifle' || kind === 'pistol'; }

  // 子弹这次买几发：一个弹匣，离上限不到一个弹匣就只补到上限
  rounds(kind) { return Math.min(this.weapon.guns[kind].cfg.magSize, this.weapon.ammoRoom(kind)); }

  // 这一下要花多少钱。子弹满了的时候按一个弹匣算（面板上照样显示价格）
  price(kind) {
    const cfg = Game.Config.economy;
    if (!this.isGun(kind)) return cfg.prices[kind];
    return (this.rounds(kind) || this.weapon.guns[kind].cfg.magSize) * cfg.bulletPrice;
  }

  canBuy(kind) {
    const cfg = Game.Config.economy;
    const room = this.isGun(kind) ? this.rounds(kind) > 0 : this.weapon.counts[kind] < cfg.maxCarry[kind];
    return room && this.money >= this.price(kind);
  }

  // 买一个弹匣 / 一个投掷物。买成功的回应（不用文字）：purchase 音效、钱数闪一下并飘 "-$价格"、武器栏里那一格闪亮回弹
  buy(kind) {
    if (!this.canBuy(kind)) return false;
    const price = this.price(kind);
    this.money -= price;
    this.hud.pulseSlot(Game.Weapon.ACTIONS[kind]);   // 先记下，addAmmo / addThrowable 重画武器栏时带上
    if (this.isGun(kind)) this.weapon.addAmmo(kind, this.rounds(kind));
    else this.weapon.addThrowable(kind);
    if (this.menu === 'classic' && !this.session.includes(kind)) this.session.push(kind);
    this.audio.purchase();
    this.hud.setMoney(this.money);
    this.hud.moneySpend(price);
    this.refreshMenu();
    return true;
  }

  // 现在有多少：子弹按发（枪里 + 备弹），投掷物按个
  have(kind) {
    const w = this.weapon;
    return this.isGun(kind) ? w.guns[kind].ammo + w.guns[kind].reserve : w.counts[kind];
  }

  // Smart Buy 的计划（不真的买）：items 是 [[商品, 买到多少], …]，按顺序就是优先级；子弹的数量按弹匣算（含枪里的），超过上限按上限。
  // 一件一件往上买，已经够了的跳过；买下一件的钱不够就跳过这一样、接着看后面的。
  // 返回 { buys: [{ kind, n, price }], lines: [{ kind, want, need, got }], cost }：
  //   want 目标（弹匣 / 个），need 还差几件，got 这次能买到几件
  smartPlan(items) {
    const cfg = Game.Config.economy, w = this.weapon;
    let money = this.money;
    const have = {}, buys = [], lines = [];
    for (const k of Economy.ITEMS) have[k] = this.have(k);
    for (const [kind, target] of items) {
      const gun = this.isGun(kind);
      const unit = gun ? w.guns[kind].cfg.magSize : 1;
      const cap = gun ? w.maxRounds(kind) : cfg.maxCarry[kind];
      const goal = Math.min(cap, target * unit);
      const line = { kind, want: Math.ceil(goal / unit), need: Math.max(0, Math.ceil((goal - have[kind]) / unit)), got: 0 };
      while (have[kind] < goal) {
        const n = gun ? Math.min(unit, cap - have[kind]) : 1;
        const price = gun ? n * cfg.bulletPrice : cfg.prices[kind];
        if (price > money) break;
        money -= price;
        have[kind] += n;
        buys.push({ kind, n, price });
        line.got++;
      }
      lines.push(line);
    }
    return { buys, lines, cost: this.money - money };
  }

  // 按计划买：一次扣钱、响一声，钱数飘一个总价，武器栏闪第一件买到的那一格
  buyPlan(plan) {
    const w = this.weapon;
    this.hud.pulseSlot(Game.Weapon.ACTIONS[plan.buys[0].kind]);
    for (const b of plan.buys) {
      this.money -= b.price;
      if (this.isGun(b.kind)) w.addAmmo(b.kind, b.n);
      else w.addThrowable(b.kind);
    }
    this.audio.purchase();
    this.hud.setMoney(this.money);
    this.hud.moneySpend(plan.cost);
  }

  // F 菜单里的套餐：config 里的几套 + 自定义（没记过就是空的）
  packages() {
    const list = Game.Config.economy.packages.map((p, i) => ({ id: `pack${i}`, name: p.name, items: p.items }));
    list.push({ id: `pack${list.length}`, name: '自定义', items: this.custom, custom: true });
    return list;
  }

  // 关 B 菜单时：这次买过东西，就把买过的那几样现在的数量记成自定义套餐（子弹按弹匣，向上取整）
  saveCustom() {
    if (!this.session.length) return;
    const w = this.weapon;
    this.custom = this.session.map((k) => [k, this.isGun(k) ? Math.ceil(this.have(k) / w.guns[k].cfg.magSize) : this.have(k)]);
    this.session = [];
    try { localStorage.setItem(Economy.CUSTOM_KEY, JSON.stringify(this.custom)); } catch (e) { /* 隐私模式下可能不可用 */ }
  }

  static loadCustom() {
    try {
      const v = JSON.parse(localStorage.getItem(Economy.CUSTOM_KEY) || '[]');
      if (Array.isArray(v)) return v.filter((x) => Array.isArray(x) && Economy.ITEMS.includes(x[0]) && x[1] > 0);
    } catch (e) { /* 存的东西坏了就当没有 */ }
    return [];
  }

  openMenu(type) {
    if (this.menu === 'classic') this.saveCustom();
    this.menu = type;
    this.cat = -1;
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };   // 光标从屏幕中间（准星）出发
    this.input.consumeMouse();
    this.refreshMenu();
  }

  close() {
    if (!this.menu) return;
    if (this.menu === 'classic') this.saveCustom();
    this.menu = null;
    this.hud.setBuyMenu(null);
  }

  // 玩家阵亡：关掉面板，地上的环也藏起来（重生后再出现在新的出生点）
  onPlayerDeath() {
    this.close();
    this.hud.setBuyCue(null);
    this.ring.material.opacity = 0;
  }

  // 重画菜单（买了东西、钱变了、换了分类）。光标和悬停在 hud.buyCursor 里每帧更新，不重画
  refreshMenu() {
    if (!this.menu) return;
    const cfg = Game.Config.economy, w = this.weapon;
    const name = (a) => Game.Input.bindingName(this.input.bindings[a]);
    const itemName = (k) => this.isGun(k) ? `${w.guns[k].cfg.name} 弹匣` : Game.Config.grenades[k].name;
    const view = { type: this.menu, money: this.money, buyKey: name('buy'), quickKey: name('quickBuy') };
    if (this.menu === 'classic') {
      view.cat = this.cat;
      view.cats = cfg.categories.map((c) => ({
        name: c.name,
        items: c.items.map((kind) => {
          const gun = this.isGun(kind);
          // 子弹的数量是"枪里 + 备弹 / 上限"（发）
          return { id: kind, name: itemName(kind), price: this.price(kind), ok: this.canBuy(kind),
            count: this.have(kind), max: gun ? w.maxRounds(kind) : cfg.maxCarry[kind] };
        }),
      }));
    } else {
      view.packs = this.packages().map((p) => {
        const plan = this.smartPlan(p.items);
        return { id: p.id, name: p.name, custom: p.custom, cost: plan.cost, ok: plan.buys.length > 0,
          lines: plan.lines.map((l) => ({ kind: l.kind, name: itemName(l.kind), want: l.want,
            state: l.need === 0 ? 'have' : l.got === l.need ? 'buy' : 'poor' })) };
      });
    }
    this.hud.setBuyMenu(view);
  }
};

Game.Economy.ITEMS = ['rifle', 'pistol', 'frag', 'flash', 'smoke'];   // 所有能买的东西，和武器栏的顺序一致
Game.Economy.LABELS = { head: '爆头', body: '击杀', frag: '手雷击杀' };
Game.Economy.CUSTOM_KEY = 'ds.buy.custom.v1';   // 自定义套餐存在浏览器里的键名
