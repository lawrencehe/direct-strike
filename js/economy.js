// ============================================================
// 经济：打死敌人拿赏金，回到自己的出生点买投掷物
//
// 只在对决和波次里有（训练场投掷物不限量，不需要钱）。参数在 config.js 的 economy。
//   赏金：只看最后一击是怎么打死的（爆头 / 枪打身体或腿 / 手雷炸死），NPC 被自己的雷炸死不算。
//   钱有上限，到了上限再打死人也不涨。钱跟着整局走，死了不清零；开新一局清零。
//   购买区：玩家这条命出生的那个点，周围 buyRadius 米内，地上有一圈橙色的环。
//   在购买区里按"购买"键（默认 B）打开面板，面板开着时按投掷物自己的槽位键（默认 3 / 4 / 5）买一个，
//   不会切到那个投掷物。走出购买区、死了、再按一次购买键都会关掉面板。
//   能带几个有上限（economy.maxCarry），满了买不了。
//
// 死了重生时投掷物回到开局的数量（多买的随人一起没了），波次之间补给不收走多买的。
// ============================================================
Game.Economy = class Economy {
  constructor({ scene, hud, audio, player, weapon, input }) {
    Object.assign(this, { scene, hud, audio, player, weapon, input });
    this.enabled = false;
    this.money = 0;
    this.open = false;         // 购买面板开着
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
    this.hud.setBuyTip(null);
    this.hud.setMoney(this.money, this.enabled);
    this.ring.material.opacity = 0;
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

  // 每帧（玩家活着时）：判断在不在购买区，处理面板里的按键。
  // 要在 weapon.update 之前调用：面板开着时把投掷物的槽位键吃掉，武器就不会切过去
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
      this.hud.setBuyTip(null);
      return;
    }
    if (input.wasAction('buy')) this.open ? this.close() : this.openMenu();
    this.hud.setBuyTip(this.open ? null : `购买区 · ${key('buy')} 购买投掷物`);
    if (!this.open) return;

    for (const kind of Economy.ITEMS) {
      const action = Game.Weapon.ACTIONS[kind];
      if (!input.wasAction(action)) continue;
      input.consumeAction(action);
      this.buy(kind);
    }
  }

  canBuy(kind) {
    const cfg = Game.Config.economy;
    return this.money >= cfg.prices[kind] && this.weapon.counts[kind] < cfg.maxCarry[kind];
  }

  buy(kind) {
    if (!this.canBuy(kind)) { this.audio.empty(); return; }
    this.money -= Game.Config.economy.prices[kind];
    this.weapon.addThrowable(kind);
    this.audio.cash();
    this.hud.setMoney(this.money);
    this.refreshMenu();
  }

  openMenu() {
    this.open = true;
    this.refreshMenu();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.hud.setBuyMenu(null);
  }

  // 玩家阵亡：关掉面板，地上的环也藏起来（重生后再出现在新的出生点）
  onPlayerDeath() {
    this.close();
    this.hud.setBuyTip(null);
    this.ring.material.opacity = 0;
  }

  refreshMenu() {
    if (!this.open) return;
    const cfg = Game.Config.economy;
    const name = (a) => Game.Input.bindingName(this.input.bindings[a]);
    const rows = Economy.ITEMS.map((kind) => ({
      key: name(Game.Weapon.ACTIONS[kind]), name: Game.Config.grenades[kind].name,
      price: cfg.prices[kind], count: this.weapon.counts[kind], max: cfg.maxCarry[kind], ok: this.canBuy(kind),
    }));
    this.hud.setBuyMenu(rows, this.money, name('buy'));
  }
};

Game.Economy.ITEMS = ['frag', 'flash', 'smoke'];
Game.Economy.LABELS = { head: '爆头', body: '击杀', frag: '手雷击杀' };
