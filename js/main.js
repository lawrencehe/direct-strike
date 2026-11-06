// ============================================================
// 主程序：创建所有对象，管理模式切换，然后进入"游戏循环"
// 游戏循环每秒执行约 60 次：读取输入 → 更新逻辑 → 渲染画面
//
// 三种模式：
//   range  训练场：站在高台上打靶
//   duel   1v1 对决：和一个 NPC 互相击杀，先到 N 杀获胜
//   waves  波次：一波波的敌人，看能撑到第几波
// ============================================================
// 地图文件和枪模是异步加载的，都加载完才开始创建游戏对象
// 有问题时把原因显示在开始界面上，不要留一个什么都点不动的页面
Promise.all([Game.World.loadMap(Game.Config.map), Game.GunModel.loadAK(), Game.GunModel.loadArms()]).then(([mapData]) => startGame(mapData)).catch((err) => {
  console.error(err);
  window.gameError = err.message;
  const el = document.getElementById('loading');
  // 浏览器不允许 file:// 页面读取地图文件
  el.textContent = location.protocol === 'file:' ? '不能直接打开 index.html，请用 start.sh 启动' : err.message;
  el.style.display = 'block';
});

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
  const camera = new THREE.PerspectiveCamera(Game.Config.view.fov, aspect, 0.05, 320);
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
  hud.bindKeySettings(input);   // 开始界面的改键表格
  hud.bindDuelLength();         // 开始界面的对决杀数选项
  const effects = new Game.Effects(scene, world.colliders);
  const player = new Game.Player(camera, world.colliders, world.spawn);

  // 武器射线能打到的所有物体。内容随模式和 NPC 生死变化，所以用同一个数组原地更新
  const shootables = [];
  const grenades = new Game.Grenades({ scene, camera, world, targets, player, audio, hud, effects });
  const weapon = new Game.Weapon({ scene, camera, weaponCamera, player, audio, hud, effects, shootables, grenades });
  const bots = new Game.Bots.Manager({ scene, camera, world, player, audio, hud, effects });
  grenades.bots = bots;
  bots.grenades = grenades;

  let mode = null;
  let respawnTimer = 0;   // 对决里玩家阵亡后的重生倒计时

  function refreshShootables() {
    shootables.length = 0;
    shootables.push(...world.shootables);
    if (mode === 'range') targets.forEach((t) => shootables.push(...t.meshes));
    if (mode === 'duel' || mode === 'waves') shootables.push(...bots.aliveMeshes());
  }
  bots.onChange = refreshShootables;

  // 波次模式：每清完一波回满血、补满子弹
  bots.onWaveCleared = () => {
    player.health = Game.Config.player.maxHealth;
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    weapon.refill();
  };

  // 对决结束
  bots.onDuelEnd = (result) => {
    hud.banner(result === 'win' ? '胜利！' : '失败', 2);
    setTimeout(() => {
      if (mode !== 'duel') return;
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay(result, bots.score);
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
    weapon.onPlayerDeath();   // 手里攥着拉了环的手雷：掉在脚下
    if (mode === 'duel' && bots.onPlayerKilled()) {
      hud.banner('你被击杀了', 1.5);
      respawnTimer = Game.Config.duel.respawnDelay;
      return;
    }
    if (mode === 'duel') return;   // 对决已分出胜负，由 onDuelEnd 处理
    hud.banner('你阵亡了', 1.5);
    setTimeout(() => {
      if (player.alive) return;  // 这 1.5 秒里已经开了新一局
      if (document.pointerLockElement) document.exitPointerLock();
      else hud.showOverlay('dead');
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
    grenades.clear();
    hud.resetStats();
    hud.setMode(m);
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    targets.forEach((t) => t.setActive(m === 'range'));
    if (m === 'duel' || m === 'waves') bots.start(m);
    else bots.stop();
    refreshShootables();
  }

  // ---- 菜单按钮 ----
  const play = (m) => {
    audio.init();
    if (m) startMode(m);
    input.lock(Game.Config.view.fullscreen);
  };
  document.getElementById('btn-range').addEventListener('click', () => play('range'));
  document.getElementById('btn-duel').addEventListener('click', () => play('duel'));
  document.getElementById('btn-waves').addEventListener('click', () => play('waves'));
  document.getElementById('btn-resume').addEventListener('click', () => play(null));

  input.onLockChange = (locked) => {
    if (locked) hud.hideOverlay();
    else if (bots.phase === 'over') hud.showOverlay(bots.score.player > bots.score.bot ? 'win' : 'lose', bots.score);
    else hud.showOverlay(player.alive || respawnTimer > 0 ? 'paused' : 'dead');   // 对决里等重生时按 Esc 只是暂停
  };

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

  function frame() {
    // 限制单帧最长 0.05 秒，防止切出窗口再回来时一下子"穿墙"
    const dt = Math.min(clock.getDelta(), 0.05);

    if (input.locked) {
      time += dt;
      player.extraColliders = bots.aliveBoxes();
      if (player.alive) {
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
    input.endFrame();

    renderer.clear();
    renderer.render(scene, camera);
    if (player.alive) {
      renderer.clearDepth();
      renderer.render(weaponScene, weaponCamera);
    }

    requestAnimationFrame(frame);
  }

  // 先摆好摄像机、显示训练场，让菜单背后就能看到场景
  startMode('range');
  hud.showOverlay('menu');
  hud.setLoading(true);
  player.update(0, input);
  effects.precompile(renderer, camera);
  grenades.precompile(renderer, camera);
  frame();

  // NPC 模型是异步加载的，加载完才允许进入对战模式
  Game.Character.load().then((ok) => {
    hud.setLoading(false, ok ? '' : '（NPC 模型加载失败，使用简易小人。请用 start.sh 启动）');
  });

  // 方便在浏览器控制台（F12）里调试，例如输入 game.player.position 查看位置
  window.game = { scene, camera, renderer, world, targets, input, audio, hud, player, weapon, grenades, effects, bots, startMode };
}
