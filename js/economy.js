// ============================================================
// 经济：打死敌人拿赏金，回到自己的出生点买枪、子弹和投掷物
//
// 对决和波次要花钱；训练场也走同一套购买，但一切免费、不显示钱（训练场子弹和投掷物本来不限量，只有买枪有意义）。
// 参数在 config.js 的 economy（数值见 #7、#90）。
//   出生只有手枪，主武器要买；死了主武器跟人一起没了（#90）。原则：出生后一定买得起主武器——
//     开局 startMoney，钱跟着整局走，死了不清零，重生时不足 startMoney 补到 startMoney，而 startMoney ≥ 主武器的价格。
//   赏金：只看最后一击是怎么打死的（爆头 / 枪打身体或腿 / 手雷炸死），NPC 被自己的雷炸死不算。钱有上限，到了上限再打死人也不涨。
//   购买区：玩家这条命出生的那个点，周围 buyRadius 米内，地上有一圈橙色的环。
//   进了购买区，屏幕左侧滑出一个购物车图标（带购买键的键帽），能买得起东西时亮橙色，买不起时变灰；不写文字提示。
//
// 两个购买菜单（#81、#90）：
//   F 快捷菜单：屏幕左侧一列窄条，几个套餐（economy.packages + "上次"），**纯键盘**：鼠标照常瞄准、左键照常开枪，
//     只有数字键被菜单拿走。按数字键 Smart Buy（smartPlan）后马上关；再按 F、走出购买区、中弹也关。快进快出，不挡视线。
//     套餐写的是"买到多少"，已经够了的跳过；按优先级一件件买，钱不够的那件跳过、接着买后面的。
//     套餐里的 primary = 主武器：手上有就不换，没有才买，买的是上一次买的那把（Game.Settings 的 rifle）。
//     "上次" = 上一次在 B 菜单里买完时的装备（只记买过的那几样，买过主武器就记成 primary，存在浏览器里）。
//   B 经典菜单：屏幕中间，按分类分列的卡片（economy.categories：主武器 / 手枪 / 弹药 / 投掷物）。数字键先选分类、再选商品，
//     一次买一件，买完面板不关，可以接着买；也能用鼠标点卡片——适合在安全的地方慢慢配。
//     菜单开着时不解锁鼠标（解锁会进暂停）：屏幕上画一个光标，鼠标移动光标、不转视角；左键点卡片，不开枪；
//     槽位键、滚轮、上一把武器都被菜单吃掉，不切枪。走出购买区、死了、再按一次 B 都会关。
//   买枪：主武器买另一把会换掉手上那把；手枪出生就有，换一把也要花钱。新枪枪里一个满弹匣、没有备弹，马上掏出来。
//   能带多少有上限（投掷物 economy.maxCarry，子弹 weapons.maxMags 个弹匣），满了买不了；离子弹上限不到一个弹匣就只补到上限、按发收钱。
//
// 死了重生时又只有手枪，子弹和投掷物回到开局的数量（多买的随人一起没了），波次之间补给不收走多买的。
// ============================================================
Game.Economy = class Economy {
  constructor({ scene, hud, audio, player, weapon, input }) {
    Object.assign(this, { scene, hud, audio, player, weapon, input });
    this.enabled = false;
    this.free = false;         // 训练场：一切免费，不显示钱
    this.money = 0;
    this.menu = null;          // 开着的购买菜单：'classic'（B）| 'quick'（F）| null
    this.cat = -1;             // B 菜单里用数字键选中的分类，-1 = 还没选
    this.cursor = { x: 0, y: 0 };   // B 菜单里的光标（屏幕像素）
    this.session = [];         // 这次打开 B 菜单买过的东西（按先后），关菜单时记成"上次"套餐
    this.custom = Economy.loadCustom();   // "上次"套餐 [[商品, 买到多少], …]
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

    // 负责人定的原则：出生后一定买得起主武器（#90）
    const L = Game.Config.loadout;
    const maxRifle = Math.max(...Object.keys(L.rifle).map((k) => cfg.gunPrices[k] || 0));
    if (cfg.startMoney < maxRifle) console.error(`economy.startMoney（$${cfg.startMoney}）买不起最贵的主武器（$${maxRifle}），见 config.js`);
  }

  // 开新一局（main.js 的 startMode）。首页背景也是一局训练场，那时玩家不动，不影响
  start(mode) {
    this.enabled = true;
    this.free = mode === 'range';
    this.money = Game.Config.economy.startMoney;
    this.close();
    this.inZone = false;
    this.hud.setBuyCue(null);
    this.showMoney();
    this.ring.material.opacity = 0;
  }

  showMoney() { this.hud.setMoney(this.money, this.enabled && !this.free); }

  // 重生（main.js 的 respawnPlayer）：钱不足开局的数补到开局的数，多的保留
  onRespawn() {
    if (!this.enabled) return;
    this.money = Math.max(this.money, Game.Config.economy.startMoney);
    this.showMoney();
  }

  // 打死一个敌人。kind：'head' 爆头 | 'body' 枪打身体或腿 | 'frag' 手雷炸死
  award(kind) {
    if (!this.enabled || this.free) return;
    const cfg = Game.Config.economy;
    const gain = Math.max(0, Math.min(cfg.reward[kind] || 0, cfg.maxMoney - this.money));
    this.money += gain;
    this.showMoney();
    this.hud.moneyGain(gain, Economy.LABELS[kind]);
    this.refreshMenu();
  }

  // 玩家中弹（main.js 的 player.onDamage）：F 菜单马上关，数字键还给切枪（#90）。B 菜单是在安全处慢慢买的，不关
  onHurt() {
    if (this.menu === 'quick') this.close();
  }

  get open() { return !!this.menu; }

  // 每帧（玩家活着时）：判断在不在购买区，处理菜单里的按键和鼠标。
  // 要在 player.update 和 weapon.update 之前调用：菜单开着时它先拿走数字键（不切枪），B 菜单还拿走鼠标移动和左键
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
    this.hud.setBuyCue(this.menu ? null : (this.buyable().some((k) => this.canBuy(k)) ? 'ok' : 'poor'), key('buy'), key('quickBuy'));
  }

  // 菜单开着时的输入
  menuInput() {
    const input = this.input;
    // 先记下数字键，再吃掉（槽位键默认就是数字键，先吃掉就读不到了）。
    // 数字键：物理的 1 ~ 9（主键盘或小键盘），不管槽位键改成了什么；同一帧按了几个只认第一个
    let digit = 0;
    for (let n = 1; n <= 9 && !digit; n++) {
      if (input.pressed.has(`Digit${n}`) || input.pressed.has(`Numpad${n}`)) digit = n;
    }
    for (let n = 1; n <= 9; n++) { input.pressed.delete(`Digit${n}`); input.pressed.delete(`Numpad${n}`); }

    // F 菜单纯键盘：鼠标、左键、滚轮、改到别的键上的槽位键都照常给视角和武器（#90）
    if (this.menu === 'quick') {
      if (digit) this.pressDigit(digit);
      return;
    }

    // B 菜单：槽位键、上一把、滚轮、开火都吃掉（开火按住的也放掉，不然自动枪会接着打）
    const click = input.pressed.has('Mouse0');
    for (const a of Object.values(Game.Weapon.ACTIONS)) input.consumeAction(a);
    input.consumeAction('lastWeapon');
    input.wheel = 0;
    for (const c of input.bindings.fire || []) { input.pressed.delete(c); input.down.delete(c); }
    input.pressed.delete('Mouse0'); input.down.delete('Mouse0');
    if (input.pressed.has('Backspace') && this.cat >= 0) { this.cat = -1; this.refreshMenu(); }
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

  // 选中一张卡片（数字键或鼠标）：id 是商品（ak / rifle / frag …）或套餐（pack0 …）
  choose(id) {
    if (this.buyable().includes(id)) {
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

  // ---- 商品 ----
  // 所有能单买的东西：枪（loadout 里的 key）+ 子弹 + 投掷物
  buyable() { return [...Object.keys(Economy.GUN_SLOT), ...Economy.ITEMS]; }
  isAmmo(kind) { return kind === 'rifle' || kind === 'pistol'; }
  // 枪属于哪一格（'rifle' | 'pistol'），不是枪返回 undefined
  gunSlot(id) { return Economy.GUN_SLOT[id]; }
  // 手上就是这把枪
  ownsGun(id) {
    const slot = this.gunSlot(id), w = this.weapon;
    return (slot === 'pistol' || w.hasRifle) && w.guns[slot].key === id;
  }
  // 主武器的子弹要先有主武器
  hasGunFor(kind) { return kind !== 'rifle' || this.weapon.hasRifle; }

  // 子弹这次买几发：一个弹匣，离上限不到一个弹匣就只补到上限
  rounds(kind) { return Math.min(this.weapon.guns[kind].cfg.magSize, this.weapon.ammoRoom(kind)); }

  // 这一下要花多少钱（训练场免费）。子弹满了的时候按一个弹匣算（面板上照样显示价格）
  price(kind) {
    if (this.free) return 0;
    const cfg = Game.Config.economy;
    if (this.gunSlot(kind)) return cfg.gunPrices[kind] || 0;
    if (!this.isAmmo(kind)) return cfg.prices[kind];
    return (this.rounds(kind) || this.weapon.guns[kind].cfg.magSize) * cfg.bulletPrice;
  }

  // 还有没有地方装（不看钱）
  hasRoom(kind) {
    const w = this.weapon, slot = this.gunSlot(kind);
    if (slot) return !this.ownsGun(kind) && Game.GunModel.isGunLoaded(Game.Config.loadout[slot][kind].model);   // 枪模没下载好也买不了
    if (this.isAmmo(kind)) return !w.unlimitedAmmo && this.hasGunFor(kind) && this.rounds(kind) > 0;
    return !w.unlimitedThrowables && w.counts[kind] < Game.Config.economy.maxCarry[kind];
  }

  canBuy(kind) { return this.hasRoom(kind) && this.money >= this.price(kind); }

  // 买一件。买成功的回应（不用文字）：purchase 音效、钱数闪一下并飘 "-$价格"、武器栏里那一格闪亮回弹
  buy(kind) {
    if (!this.canBuy(kind)) return false;
    const price = this.price(kind);
    this.money -= price;
    const slot = this.gunSlot(kind);
    this.hud.pulseSlot(Game.Weapon.ACTIONS[slot || kind]);   // 先记下，武器栏重画时带上
    if (slot) this.giveGun(slot, kind);
    else if (this.isAmmo(kind)) this.weapon.addAmmo(kind, this.rounds(kind));
    else this.weapon.addThrowable(kind);
    if (this.menu === 'classic') {
      const rec = slot === 'rifle' ? 'primary' : slot ? null : kind;   // 换手枪不记（出生就有）
      if (rec && !this.session.includes(rec)) this.session.push(rec);
    }
    this.paid(price);
    this.refreshMenu();
    return true;
  }

  // 拿到一把枪：记成"上次买的"（下次出生的手枪、套餐里的主武器都用它），换到手上
  giveGun(slot, key) {
    Game.Settings.set(slot, key);
    this.weapon.giveGun(slot);
  }

  paid(price) {
    this.audio.purchase();
    this.showMoney();
    if (price > 0) this.hud.moneySpend(price);
  }

  // 现在有多少：子弹按发（枪里 + 备弹，没有主武器就是 0），投掷物按个
  have(kind) {
    const w = this.weapon;
    if (kind === 'primary') return w.hasRifle ? 1 : 0;
    if (this.isAmmo(kind)) return this.hasGunFor(kind) ? w.guns[kind].ammo + w.guns[kind].reserve : 0;
    return w.counts[kind];
  }

  // Smart Buy 的计划（不真的买）：items 是 [[商品, 买到多少], …]，按顺序就是优先级；子弹的数量按弹匣算（含枪里的），超过上限按上限。
  // primary（主武器）：有就跳过，没有买上次买的那把（买到的枪里有一个弹匣，后面的主武器子弹接着算）。
  // 一件一件往上买，已经够了的跳过；买下一件的钱不够就跳过这一样、接着看后面的。不限量的（训练场的子弹、投掷物）不买。
  // 返回 { buys: [{ kind, n, price, key? }], lines: [{ kind, want, need, got }], cost }：
  //   want 目标（弹匣 / 个），need 还差几件，got 这次能买到几件
  smartPlan(items) {
    const cfg = Game.Config.economy, w = this.weapon;
    let money = this.money;
    let rifle = w.hasRifle;
    const have = {}, buys = [], lines = [];
    for (const k of Economy.ITEMS) have[k] = this.have(k);
    const pref = Game.Settings.get('rifle');
    for (const [kind, target] of items) {
      if (kind === 'primary') {
        const line = { kind, want: 1, need: rifle ? 0 : 1, got: 0 };
        const price = this.free ? 0 : cfg.gunPrices[pref] || 0;
        if (!rifle && price <= money && Game.GunModel.isGunLoaded(Game.Config.loadout.rifle[pref].model)) {
          money -= price;
          rifle = true;
          have.rifle = Game.Settings.gunConfig('rifle', pref).magSize;   // 新枪：枪里一个满弹匣
          buys.push({ kind, key: pref, n: 1, price });
          line.got = 1;
        }
        lines.push(line);
        continue;
      }
      const ammo = this.isAmmo(kind);
      if (ammo ? w.unlimitedAmmo : w.unlimitedThrowables) continue;   // 训练场不限量，不用买、也不列出来
      // 这次计划里新买的主武器按它自己的弹匣算
      const unit = !ammo ? 1 : kind === 'rifle' && !w.hasRifle ? Game.Settings.gunConfig('rifle', pref).magSize : w.guns[kind].cfg.magSize;
      const cap = ammo ? Game.Config.weapons.maxMags * unit : cfg.maxCarry[kind];
      const goal = Math.min(cap, target * unit);
      const line = { kind, want: Math.ceil(goal / unit), need: Math.max(0, Math.ceil((goal - have[kind]) / unit)), got: 0 };
      // 没有主武器（这次也没买到）：主武器的子弹买不了
      while (have[kind] < goal && (kind !== 'rifle' || rifle)) {
        const n = ammo ? Math.min(unit, cap - have[kind]) : 1;
        const price = this.free ? 0 : ammo ? n * cfg.bulletPrice : cfg.prices[kind];
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
    const first = plan.buys[0].kind;
    this.hud.pulseSlot(Game.Weapon.ACTIONS[first === 'primary' ? 'rifle' : first]);
    for (const b of plan.buys) {
      this.money -= b.price;
      if (b.kind === 'primary') this.giveGun('rifle', b.key);   // 计划里主武器排在它的子弹前面：新枪会重置子弹
      else if (this.isAmmo(b.kind)) w.addAmmo(b.kind, b.n);
      else w.addThrowable(b.kind);
    }
    this.paid(plan.cost);
  }

  // F 菜单里的套餐：config 里的几套 + "上次"（没记过就是空的）
  packages() {
    const list = Game.Config.economy.packages.map((p, i) => ({ id: `pack${i}`, name: p.name, items: p.items }));
    list.push({ id: `pack${list.length}`, name: '上次', items: this.custom, custom: true });
    return list;
  }

  // 关 B 菜单时：这次买过东西，就把买过的那几样现在的数量记成"上次"套餐（子弹按弹匣，向上取整；主武器记成 primary）
  saveCustom() {
    if (!this.session.length) return;
    const w = this.weapon;
    this.custom = this.session.map((k) => [k, this.isAmmo(k) ? Math.ceil(this.have(k) / w.guns[k].cfg.magSize) : this.have(k)])
      .filter(([, n]) => n > 0);
    this.session = [];
    try { localStorage.setItem(Economy.CUSTOM_KEY, JSON.stringify(this.custom)); } catch (e) { /* 隐私模式下可能不可用 */ }
  }

  static loadCustom() {
    try {
      const v = JSON.parse(localStorage.getItem(Economy.CUSTOM_KEY) || '[]');
      const ok = [...Economy.ITEMS, 'primary'];
      if (Array.isArray(v)) return v.filter((x) => Array.isArray(x) && ok.includes(x[0]) && x[1] > 0);
    } catch (e) { /* 存的东西坏了就当没有 */ }
    return [];
  }

  openMenu(type) {
    if (this.menu === 'classic') this.saveCustom();
    this.menu = type;
    this.cat = -1;
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };   // B 菜单的光标从屏幕中间（准星）出发
    if (type === 'classic') this.input.consumeMouse();
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
    const cfg = Game.Config.economy, w = this.weapon, L = Game.Config.loadout;
    const name = (a) => Game.Input.bindingName(this.input.bindings[a]);
    const itemName = (k) => {
      if (k === 'primary') return w.hasRifle ? w.guns.rifle.cfg.name : L.rifle[Game.Settings.get('rifle')].name;
      const slot = this.gunSlot(k);
      if (slot) return L[slot][k].name;
      return this.isAmmo(k) ? `${w.guns[k].cfg.name} 弹匣` : Game.Config.grenades[k].name;
    };
    const view = { type: this.menu, money: this.money, free: this.free, buyKey: name('buy'), quickKey: name('quickBuy') };
    if (this.menu === 'classic') {
      view.cat = this.cat;
      view.cats = cfg.categories.map((c) => ({
        name: c.name,
        items: c.items.map((kind) => {
          const slot = this.gunSlot(kind);
          const it = { id: kind, icon: slot ? `${slot}Gun` : kind, name: itemName(kind), price: this.price(kind), ok: this.canBuy(kind) };
          if (slot) it.note = this.ownsGun(kind) ? '手上' : '';
          else if (this.isAmmo(kind) ? w.unlimitedAmmo : w.unlimitedThrowables) it.note = '不限量';
          else if (!this.hasGunFor(kind)) it.note = '先买主武器';
          else it.note = `${this.have(kind)} / ${this.isAmmo(kind) ? w.maxRounds(kind) : cfg.maxCarry[kind]}`;   // 子弹按发
          return it;
        }),
      }));
    } else {
      view.packs = this.packages().map((p) => {
        const plan = this.smartPlan(p.items);
        return { id: p.id, name: p.name, custom: p.custom, cost: plan.cost, ok: plan.buys.length > 0,
          lines: plan.lines.map((l) => ({ kind: l.kind, icon: l.kind === 'primary' ? 'rifleGun' : l.kind,
            name: itemName(l.kind), want: l.want, state: l.need === 0 ? 'have' : l.got === l.need ? 'buy' : 'poor' })) };
      });
    }
    this.hud.setBuyMenu(view);
  }
};

Game.Economy.ITEMS = ['rifle', 'pistol', 'frag', 'flash', 'smoke'];   // 子弹和投掷物，和武器栏的顺序一致
// 枪：loadout 里的 key → 哪一格（'rifle' | 'pistol'）
Game.Economy.GUN_SLOT = {};
for (const slot of ['rifle', 'pistol']) for (const k of Object.keys(Game.Config.loadout[slot])) Game.Economy.GUN_SLOT[k] = slot;
Game.Economy.LABELS = { head: '爆头', body: '击杀', frag: '手雷击杀' };
Game.Economy.CUSTOM_KEY = 'ds.buy.custom.v1';   // "上次"套餐存在浏览器里的键名
