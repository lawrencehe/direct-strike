// ============================================================
// 主程序：创建所有对象，管理模式切换，然后进入"游戏循环"
// 游戏循环每秒执行约 60 次：读取输入 → 更新逻辑 → 渲染画面
//
// 三种模式：
//   range  训练场：站在高台上打靶
//   duel   1v1 对决：和一个 NPC 互相击杀，先到 N 杀获胜
//   waves  波次：一波波的敌人，看能撑到第几波
// ============================================================
// 界面流程（首页 → 简报 → 战斗 → 暂停 / 结算）在 ui.js，这里只负责开局、锁鼠标、全屏这些动作。
// ============================================================
// 打开网页只建首页（背景是静态图），不下载地图和模型（#85）。点"进入战斗"才下载这一局要的资源，
// 加载页显示进度和总大小；资源在本地缓存里且没有更新就不下载（js/assets.js）。都好了再创建渲染器和游戏对象（startGame）。
// 之后回首页背景换成实时 3D，再进战斗不用再等。
// 有问题时把原因显示在加载页上，并给一个"返回首页"，不要留一个什么都点不动的页面
Game.Main = (function () {
  const $ = (id) => document.getElementById(id);
  let shell = null;     // 首页就要用的对象 { input, audio, hud, ui }
  let game = null;      // startGame 的结果（也挂在 window.game 上）
  let loading = null;   // 正在下载、创建游戏的 Promise

  function fail(err, text) {
    console.error(err);
    window.gameError = err.message;
    Game.UI.bootError(text || err.message);
    $('btn-boot-back').hidden = !shell;
  }

  // 打开网页：读清单和地图文件（几 KB），建首页
  async function boot() {
    await Game.Assets.init();
    const mapData = await Game.World.loadMapData(Game.Config.map);
    const input = new Game.Input($('game'));
    const audio = new Game.Audio();
    const hud = new Game.Hud();
    hud.input = input;            // 武器栏和底部提示要显示当前绑定的按键
    const ui = new Game.UI({ input, hud, audio, world: { mapName: mapData.name || Game.Config.map } });
    shell = { input, audio, hud, ui };
    // 首页阶段换装备只记下选择，模型进入战斗时一起下载
    ui.npcReady = true;
    ui.npcNote = '';
    ui.onLoadout = () => Promise.resolve();
    ui.onDeploy = (m) => {
      enterFullscreen();   // 要在点击里同步发起，不能等下载完
      load(m).then((g) => g.deploy(m), () => {});
    };
    $('btn-boot-back').addEventListener('click', (e) => {
      e.preventDefault();
      exitFullscreen();
      ui.goHome();
    });
    Game.DevLog.attach({ input, hud, ui });   // 首页的设置里就能解锁开发者模式；进入战斗后再补上渲染器等
    ui.goHome();
    Main.ready = true;
  }

  // 下载这一局要的资源并创建游戏。mode 决定要不要 NPC 模型。返回 Promise<game>
  function load(mode) {
    if (game) return Promise.resolve(game);
    if (loading) return loading;
    const { ui } = shell;
    const C = Game.Config, A = Game.Assets;
    let failed = false;   // 出错后别的文件还会陆续报进度，不能把错误原因盖掉
    const bar = (frac, text) => {
      if (failed) return;
      $('boot-progress').style.width = `${Math.round(frac * 100)}%`;
      const el = $('loading');
      el.classList.remove('error');
      el.textContent = text;
    };
    const MB = (n) => (n / 1048576).toFixed(1);
    $('btn-boot-back').hidden = true;
    bar(0, '检查资源…');
    ui.show('boot');
    const npc = Game.UI.MODES[mode].npc;
    loading = (async () => {
      // 1. 下载：地图目录、开局天气、选中的枪、手臂、音效，对战模式再加 NPC。本地缓存里有的不算
      const files = [
        `maps/${C.map}.json`, ...A.under(`assets/maps/${C.map}/`), ...Game.World.weatherDirs().flatMap(A.under),
        C.weapons.rifle.model, C.weapons.pistol.model, C.weapons.arms.model, ...A.under(C.audio.samples.dir),
        npc ? C.character.model : null,
      ].filter(Boolean);
      const total = await A.prefetch(files, (got, all) => bar(0.85 * got / all, `下载资源 ${MB(got)} / ${MB(all)} MB`));
      // 2. 解码、创建场景（没有清单时下载也在这一步，进度按件数算）
      const head = total ? 0.85 : 0;
      const loads = [Game.World.loadMap(C.map), Game.GunModel.loadGun(C.weapons.rifle.model),
        Game.GunModel.loadGun(C.weapons.pistol.model), Game.GunModel.loadArms()];
      if (npc) loads.push(Game.Character.load());
      let done = 0;
      const text = A.version ? '准备场景…' : '加载中…';
      bar(head, text);
      for (const p of loads) p.then(() => bar(head + (1 - head) * (++done / (loads.length + 1)), text), () => {});
      const [mapData] = await Promise.all(loads);
      game = startGame(mapData, shell);
      bar(1, text);
      document.body.classList.add('game-ready');   // 回首页时背景换成实时 3D
      return game;
    })();
    loading.catch((err) => {
      failed = true;
      loading = null;
      fail(err);
    });
    return loading;
  }

  const Main = { ready: false, load };
  boot().catch((err) => {
    // 浏览器不允许 file:// 页面读取地图文件
    fail(err, location.protocol === 'file:' ? '不能直接打开 index.html，请用 start.sh 启动' : err.message);
  });
  return Main;
})();

// 全屏要在点击里同步发起，被拒绝就照常窗口玩
function enterFullscreen() {
  const root = document.documentElement;
  if (Game.Config.view.fullscreen && !document.fullscreenElement && root.requestFullscreen) {
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}
function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

// shell：首页阶段已经建好的 { input, audio, hud, ui }
function startGame(mapData, { input, audio, hud, ui }) {
  const canvas = document.getElementById('game');

  // ---- 渲染器 ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 电影式色调映射：高光不会死白，颜色更有层次
  // 曝光（画面整体亮度）跟着天气，见下面 world.onWeather
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;  // 要分两次画（世界 + 枪模），手动清屏

  // ---- 世界场景 ----
  const scene = new THREE.Scene();
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(Game.Config.view.fov, aspect, 0.05, 320);   // 视野可在设置里改
  scene.add(camera);

  // ---- 枪模场景 ----
  // 枪模单独画在最上层，这样贴着墙时枪不会"插进"墙里
  const weaponScene = new THREE.Scene();
  const weaponCamera = new THREE.PerspectiveCamera(Game.Config.view.weaponFov, aspect, 0.01, 10);
  weaponScene.add(weaponCamera);
  const weaponHemi = new THREE.HemisphereLight(0xdfefff, 0x5a5040, 0.8);
  weaponScene.add(weaponHemi);
  weaponScene.environment = Game.GunModel.environment();   // 让枪上的金属件有反光
  const weaponSun = new THREE.DirectionalLight(0xffe3c0, 0.9);
  weaponSun.position.set(-1, 2, 1);
  weaponScene.add(weaponSun);

  // ---- 游戏对象 ----
  const world = Game.World.build(scene, mapData);
  // 天气 / 时段（#77）：世界场景的天空、雾、灯光在 world.js 里换；曝光和枪模场景的灯在这里
  world.onWeather = (p) => {
    renderer.toneMappingExposure = p.exposure;
    weaponHemi.intensity = p.weaponHemi;
    weaponSun.color.setHex(p.weaponSun.color);
    weaponSun.intensity = p.weaponSun.intensity;
  };
  world.onWeather(Game.Config.weather.presets[world.weather]);
  const targets = Game.Targets.create(scene, world.targetLayout);
  ui.world = world;
  const effects = new Game.Effects(scene, world.colliders);
  const player = new Game.Player(camera, world.colliders, world.spawn);

  // 武器射线能打到的所有物体。内容随模式和 NPC 生死变化，所以用同一个数组原地更新
  const shootables = [];
  const grenades = new Game.Grenades({ scene, camera, world, targets, player, audio, hud, effects });
  const weapon = new Game.Weapon({ scene, camera, weaponCamera, player, audio, hud, effects, shootables, grenades });
  const bots = new Game.Bots.Manager({ scene, camera, world, player, audio, hud, effects });
  grenades.bots = bots;
  bots.grenades = grenades;
  weapon.onShot = () => bots.hearPlayer(player.position);   // 枪声会暴露玩家的位置
  const economy = new Game.Economy({ scene, hud, audio, player, weapon, input });
  // 赏金只看最后一击怎么打死的
  bots.onPlayerKill = (hit) => economy.award(hit.explosion ? 'frag' : hit.part === 'head' ? 'head' : 'body');

  let mode = null;
  let respawnTimer = 0;   // 对决里玩家阵亡后的重生倒计时

  function refreshShootables() {
    shootables.length = 0;
    shootables.push(...world.shootables);
    if (mode === 'range') targets.forEach((t) => shootables.push(...t.meshes));
    if (mode === 'duel' || mode === 'waves') shootables.push(...bots.aliveMeshes());
  }
  bots.onChange = refreshShootables;

  // 波次模式：每清完一波回满血，子弹和投掷物至少补到开局数量、枪里换满（多买的不收走）
  bots.onWaveCleared = () => {
    player.health = Game.Config.player.maxHealth;
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    weapon.refill(true);
  };

  // 当前对局的数据，暂停和结算界面用
  const matchInfo = () => ({
    score: bots.score, wave: hud.waveNum, alive: hud.waveAlive, total: hud.waveTotal,
    stats: hud.stats, accuracy: hud.accuracy(),
  });

  // 结算：先显示结算界面再解锁鼠标，这样 onLockChange 不会把它当成暂停
  function finish(kind) {
    ui.showResult(mode, kind, matchInfo());
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // 对决结束
  bots.onDuelEnd = (result) => {
    hud.banner(result === 'win' ? '胜利！' : '失败', 2);
    const m = mode;
    setTimeout(() => {
      if (mode !== m || ui.screen === 'home') return;   // 这期间已经回首页或换了模式
      finish(result);
    }, 1800);
  };

  player.onDamage = (amount, fromPos) => {
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    hud.showDamage(fromPos, amount);
    weapon.onHurt(amount);
    audio.hurt();
  };

  // 阵亡：先让镜头倒下，再决定是重生（对决）还是结算（波次）
  player.onDeath = () => {
    audio.death();
    weapon.onPlayerDeath();   // 手里攥着拔了环的手雷：掉在脚下
    economy.onPlayerDeath();
    if (mode === 'duel' && bots.onPlayerKilled()) {
      hud.banner('你被击杀了', 1.5);
      respawnTimer = Game.Config.duel.respawnDelay;
      return;
    }
    if (mode === 'duel') return;   // 对决已分出胜负，由 onDuelEnd 处理
    hud.banner('你阵亡了', 1.5);
    setTimeout(() => {
      if (player.alive || ui.screen === 'home') return;  // 这 1.5 秒里已经开了新一局或回了首页
      finish('dead');
    }, 1500);
  };

  function respawnPlayer() {
    player.setSpawn(bots.playerSpawn());
    player.reset();
    weapon.respawn();
    economy.onRespawn();
    hud.setHealth(player.health, Game.Config.player.maxHealth);
  }

  function startMode(m) {
    mode = m;
    respawnTimer = 0;
    player.setSpawn(m === 'range' ? world.rangeSpawn : world.spawns[0]);
    player.reset();
    weapon.unlimitedThrowables = m === 'range';   // 训练场投掷物和备弹不限量，方便练习
    weapon.unlimitedAmmo = m === 'range';
    weapon.reset();
    economy.start(m);
    grenades.clear();
    hud.resetStats();
    hud.setMode(m);
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    targets.forEach((t) => t.setActive(m === 'range'));
    if (m === 'duel' || m === 'waves') bots.start(m);
    else bots.stop();
    refreshShootables();
  }

  // ---- 界面动作 ----
  // 全屏和锁鼠标都要在点击里同步发起，这些回调里不能 await
  // 全屏和锁鼠标都要在点击里同步发起，这些回调里不能 await（enterFullscreen 在文件开头）
  // 首页点"进入战斗"：全屏 → 开局 → 简报，简报里再点一下才锁鼠标
  // 第一次是下载完资源后由 Game.Main 调 deploy（全屏已经在点击时发起了）
  function deploy(m) {
    startMode(m);
    player.update(0, input);   // 镜头从首页背景移到出生点
    ui.showBrief(m);
  }
  ui.onDeploy = (m) => {
    enterFullscreen();
    deploy(m);
  };
  ui.onStart = () => { audio.init(); input.lock(false); };
  ui.onResume = () => { audio.init(); input.lock(Game.Config.view.fullscreen); };
  ui.onRestart = () => {
    audio.init();
    startMode(mode);
    input.lock(Game.Config.view.fullscreen);
  };
  // 首页背景：停在 config.ui.menuCamera 的镜头上（没锁鼠标时游戏循环不更新玩家，镜头会一直停在这）
  function menuShot() {
    const c = Game.Config.ui.menuCamera;
    camera.position.set(...c.pos);
    camera.lookAt(...c.lookAt);
  }

  // 回首页：退出全屏，场景换回训练场（没有 NPC），镜头切到首页背景
  ui.onQuit = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    exitFullscreen();
    startMode('range');
    menuShot();
    ui.goHome();
  };

  input.onLockChange = (locked) => {
    if (locked) { ui.show(null); return; }
    if (ui.screen) return;   // 结算、回首页这些是先切界面再解锁的，不用管
    if (bots.phase === 'over') finish(bots.score.player > bots.score.bot ? 'win' : 'lose');
    else if (!player.alive && respawnTimer <= 0) finish('dead');
    else ui.showPause(mode, matchInfo());   // 对决里等重生时按 Esc 只是暂停
  };

  // 设置里改了视野、音量：立刻生效
  Game.Settings.onChange((k) => {
    if (k === 'fov') { camera.fov = Game.Config.view.fov; camera.updateProjectionMatrix(); }
    if (k === 'volume') audio.setVolume(Game.Config.audio.volume);
    if (k === 'weather') world.setWeather(Game.Settings.get('weather'));
  });

  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight;
    camera.aspect = weaponCamera.aspect = a;
    camera.updateProjectionMatrix();
    weaponCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- 游戏循环 ----
  const clock = new THREE.Clock();
  let time = 0;

  const dev = Game.DevLog;
  function frame() {
    const frameStart = performance.now();
    // 限制单帧最长 0.05 秒，防止切出窗口再回来时一下子"穿墙"
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    if (input.locked) {
      time += dt;
      player.extraColliders = bots.aliveBoxes();
      if (player.alive) {
        economy.update(dt);       // 要在 player、weapon 之前：购买菜单开着时鼠标移动是光标、左键和数字键是买东西
        player.update(dt, input);
        camera.updateMatrixWorld();
        weapon.update(dt, input);
      } else {
        player.updateDead(dt);
        input.consumeMouse();
        if (respawnTimer > 0) {
          respawnTimer -= dt;
          if (respawnTimer <= 0) respawnPlayer();
        }
      }
      if (mode === 'range') {
        for (const t of targets) t.update(dt, time);
        if (input.wasAction('resetStats')) hud.resetStats();
      }
      bots.update(dt);
      grenades.update(dt);   // 人死了手雷还在飞
    }
    world.update(dt);
    hud.update(dt, player);
    if (dev.on) dev.sample(rawDt, dt);   // 开发者模式：录这一帧（要在 endFrame 之前，读"刚按下"的键）
    input.endFrame();

    renderer.clear();
    renderer.render(scene, camera);
    // 首页和简报不画手里的枪
    if (player.alive && ui.screen !== 'home' && ui.screen !== 'brief') {
      renderer.clearDepth();
      renderer.render(weaponScene, weaponCamera);
    }
    if (dev.on) dev.afterRender(frameStart);   // 补上这一帧花的时间、拷一帧画面

    requestAnimationFrame(frame);
  }

  // 开发者模式（设置里输入密码打开）
  dev.attach({ renderer, input, player, weapon, hud, ui });

  // 先摆好场景（训练场）和首页背景的镜头
  startMode('range');
  player.update(0, input);
  menuShot();
  effects.precompile(renderer, camera);
  grenades.precompile(renderer, camera);
  frame();

  // NPC 模型是异步加载的，加载完才允许进入对战模式（对战模式进来的已经加载好了，这里马上就回来）
  ui.npcReady = false;
  ui.npcNote = 'NPC 模型加载中…';
  Game.Character.load().then((ok) => ui.setNpcReady(ok));

  // NPC 每次出生随机拿 loadout 里的一把主武器、一把副武器（#54）。玩家没选的枪等首页出来后在后台下载，
  // 不拖慢首次加载；没下载完之前 NPC 只从已经加载好的枪里挑（bots.js 的 pickGuns）
  for (const slot of ['rifle', 'pistol']) {
    for (const g of Object.values(Game.Config.loadout[slot])) Game.GunModel.loadGun(g.model).catch(() => {});
  }

  // 首页换了装备（settings 已经把选择写回 Game.Config）：下载新模型，好了再换上。
  // 下载期间 ui 不让进入战斗；返回的 Promise 结束时 ui 刷新首页
  ui.onLoadout = (slot) => {
    if (slot === 'npc') return Game.Character.load().then((ok) => { ui.setNpcReady(ok); return ok; });
    const key = Game.Settings.get(slot);
    return Game.GunModel.loadGun(Game.Config.weapons[slot].model).then(() => {
      if (Game.Settings.get(slot) === key) weapon.buildGun(slot);   // 下载期间又换了别的就不管
    });
  };

  // 方便在浏览器控制台（F12）里调试，例如输入 game.player.position 查看位置
  window.game = { scene, camera, renderer, world, targets, input, audio, hud, ui, player, weapon, grenades, effects, bots, economy, startMode, deploy };
  return window.game;
}
