// ============================================================
// 主程序：创建所有对象，管理模式切换，然后进入"游戏循环"
// 游戏循环每秒执行约 60 次：读取输入 → 更新逻辑 → 渲染画面
// ============================================================
(function () {
  const canvas = document.getElementById('game');

  // ---- 渲染器 ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;  // 要分两次画（世界 + 枪模），手动清屏

  // ---- 世界场景 ----
  const scene = new THREE.Scene();
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(Game.Config.view.fov, aspect, 0.05, 300);
  scene.add(camera);

  // ---- 枪模场景 ----
  // 枪模单独画在最上层，这样贴着墙时枪不会"插进"墙里
  const weaponScene = new THREE.Scene();
  const weaponCamera = new THREE.PerspectiveCamera(Game.Config.view.weaponFov, aspect, 0.01, 10);
  weaponScene.add(weaponCamera);
  weaponScene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 0.8));
  const weaponSun = new THREE.DirectionalLight(0xfff2dd, 0.8);
  weaponSun.position.set(1, 2, 1);
  weaponScene.add(weaponSun);

  // ---- 游戏对象 ----
  const world = Game.World.build(scene);
  const targets = Game.Targets.create(scene);
  const input = new Game.Input(canvas);
  const audio = new Game.Audio();
  const hud = new Game.Hud();
  const effects = new Game.Effects(scene);
  const player = new Game.Player(camera, world.colliders, world.spawn);

  // 武器射线能打到的所有物体。内容随模式和 NPC 生死变化，所以用同一个数组原地更新
  const shootables = [];
  const weapon = new Game.Weapon({ scene, camera, weaponCamera, player, audio, hud, shootables });
  const bots = new Game.Bots.Manager({ scene, camera, world, player, audio, hud, effects });

  let mode = null;

  function refreshShootables() {
    shootables.length = 0;
    shootables.push(...world.shootables);
    if (mode === 'range') targets.forEach((t) => shootables.push(...t.meshes));
    if (mode === 'battle') shootables.push(...bots.aliveMeshes());
  }
  bots.onChange = refreshShootables;

  // 每清完一波：回满血、补满子弹
  bots.onWaveCleared = () => {
    player.health = Game.Config.player.maxHealth;
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    weapon.refill();
  };

  player.onDamage = (amount, fromPos) => {
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    hud.showDamage(fromPos);
    audio.hurt();
  };

  // 阵亡：先让镜头倒下 1.5 秒，再弹出结算界面
  player.onDeath = () => {
    audio.death();
    hud.banner('你阵亡了', 1.5);
    setTimeout(() => {
      if (player.alive) return;  // 这 1.5 秒里已经开了新一局
      if (document.pointerLockElement) document.exitPointerLock();
      else hud.showOverlay('dead');
    }, 1500);
  };

  function startMode(m) {
    mode = m;
    player.reset();
    weapon.reset();
    hud.resetStats();
    hud.setMode(m);
    hud.setHealth(player.health, Game.Config.player.maxHealth);
    targets.forEach((t) => t.setActive(m === 'range'));
    if (m === 'battle') bots.start();
    else bots.stop();
    refreshShootables();
  }

  // ---- 菜单按钮 ----
  const play = (m) => {
    audio.init();
    if (m) startMode(m);
    input.lock();
  };
  document.getElementById('btn-range').addEventListener('click', () => play('range'));
  document.getElementById('btn-battle').addEventListener('click', () => play('battle'));
  document.getElementById('btn-resume').addEventListener('click', () => play(null));

  input.onLockChange = (locked) => {
    if (locked) hud.hideOverlay();
    else hud.showOverlay(player.alive ? 'paused' : 'dead');
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
      }
      if (mode === 'range') {
        for (const t of targets) t.update(dt, time);
        if (input.wasPressed('KeyT')) hud.resetStats();
      }
      bots.update(dt);
    }
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
  player.update(0, input);
  frame();

  // 方便在浏览器控制台（F12）里调试，例如输入 game.player.position 查看位置
  window.game = { scene, camera, renderer, world, targets, input, audio, hud, player, weapon, bots, startMode };
})();
