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
// 地图文件和枪模（首页上次选的主副武器）是异步加载的，都加载完才开始创建游戏对象，加载页显示进度
// 有问题时把原因显示在加载页上，不要留一个什么都点不动的页面
{
  const W = Game.Config.weapons;
  const loads = [Game.World.loadMap(Game.Config.map), Game.GunModel.loadGun(W.rifle.model), Game.GunModel.loadGun(W.pistol.model), Game.GunModel.loadArms()];
  let done = 0;
  Game.UI.bootProgress(0, loads.length + 1);
  for (const p of loads) p.then(() => Game.UI.bootProgress(++done, loads.length + 1), () => {});
  Promise.all(loads).then(([mapData]) => startGame(mapData)).catch((err) => {
    console.error(err);
    window.gameError = err.message;
    // 浏览器不允许 file:// 页面读取地图文件
    Game.UI.bootError(location.protocol === 'file:' ? '不能直接打开 index.html，请用 start.sh 启动' : err.message);
  });
}

function startGame(mapData) {
  const canvas = document.getElementById('game');

  // ---- 渲染器 ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 电影式色调映射：高光不会死白，颜色更有层次
  renderer.toneMappingExposure = Game.Config.graphics.exposure;
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
  weaponScene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 0.8));
  weaponScene.environment = Game.GunModel.environment();   // 让枪上的金属件有反光
  const weaponSun = new THREE.DirectionalLight(0xffe3c0, 0.9);
  weaponSun.position.set(-1, 2, 1);
  weaponScene.add(weaponSun);

  // ---- 游戏对象 ----
  const world = Game.World.build(scene, mapData);
  const targets = Game.Targets.create(scene, world.targetLayout);
  const input = new Game.Input(canvas);
  const audio = new Game.Audio();
  const hud = new Game.Hud();
  hud.input = input;            // 武器栏和底部提示要显示当前绑定的按键
  const ui = new Game.UI({ input, hud, audio, world });
  const effects = new Game.Effects(scene, world.colliders);
  const player = new Game.Player(camera, world.colliders, world.spawn);

  // 武器射线能打到的所有物体。内容随模式和 NPC 生死变化，所以用同一个数组原地更新
  const shootables = [];
  const grenades = new Game.Grenades({ scene, camera, world, targets, player, audio, hud, effects });
  const weapon = new Game.Weapon({ scene, camera, weaponCamera, player, audio, hud, effects, shootables, grenades });
  const bots = new Game.Bots.Manager({ scene, camera, world, player, audio, hud, effects });
  grenades.bots = bots;
  bots.grenades = grenades;
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

  // 波次模式：每清完一波回满血、补满子弹，投掷物补到开局数量（多买的不收走）
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
    hud.showDamage(fromPos);
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
    hud.setHealth(player.health, Game.Config.player.maxHealth);
  }

  function startMode(m) {
    mode = m;
    respawnTimer = 0;
    player.setSpawn(m === 'range' ? world.rangeSpawn : world.spawns[0]);
    player.reset();
    weapon.unlimitedThrowables = m === 'range';   // 训练场投掷物不限量，方便练习
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
  const enterFullscreen = () => {
    const root = document.documentElement;
    if (Game.Config.view.fullscreen && !document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});   // 被拒绝就照常窗口玩
    }
  };
  const exitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  };

  // 首页点"进入战斗"：全屏 → 开局 → 简报，简报里再点一下才锁鼠标
  ui.onDeploy = (m) => {
    enterFullscreen();
    startMode(m);
    player.update(0, input);   // 镜头从首页背景移到出生点
    ui.showBrief(m);
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
        player.update(dt, input);
        camera.updateMatrixWorld();
        economy.update(dt);       // 要在 weapon 之前：购买面板开着时 3 / 4 / 5 是买东西
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
  Game.UI.bootProgress(1, 1);
  ui.goHome();

  // NPC 模型是异步加载的，加载完才允许进入对战模式
  Game.Character.load().then((ok) => ui.setNpcReady(ok));

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
  window.game = { scene, camera, renderer, world, targets, input, audio, hud, ui, player, weapon, grenades, effects, bots, economy, startMode };
}
