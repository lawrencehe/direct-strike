// ============================================================
// 主程序：创建所有对象，然后进入"游戏循环"
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
  const targets = Game.Targets.create(scene, world.shootables);
  const input = new Game.Input(canvas);
  const audio = new Game.Audio();
  const hud = new Game.Hud();
  const player = new Game.Player(camera, world.colliders, world.spawn);
  const weapon = new Game.Weapon({
    scene, camera, weaponCamera, player, audio, hud, shootables: world.shootables,
  });

  // ---- 开始 / 暂停 ----
  hud.el.startBtn.addEventListener('click', () => {
    audio.init();
    input.lock();
  });
  input.onLockChange = (locked) => hud.showOverlay(!locked, !locked);

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
      player.update(dt, input);
      camera.updateMatrixWorld();
      weapon.update(dt, input);
      for (const t of targets) t.update(dt, time);
      if (input.wasPressed('KeyT')) hud.resetStats();
    }
    hud.update(dt);
    input.endFrame();

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);

    requestAnimationFrame(frame);
  }

  // 先摆好摄像机，让开始界面背后就能看到场景
  player.update(0, input);
  frame();

  // 方便在浏览器控制台（F12）里调试，例如输入 game.player.position 查看位置
  window.game = { scene, camera, renderer, world, targets, input, audio, hud, player, weapon };
})();
