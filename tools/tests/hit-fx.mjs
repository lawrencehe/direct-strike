// #116 的针对性测试：打中 NPC 和爆头的表现
//   1. 准星上没有命中标记（#hitmarker 已删）
//   2. 打中身体：闪红强度按 hitFx.flash（减弱了），入口 + 背后出口两团血雾
//   3. 血雾远了按距离放大（mistMinAngle），近处不放大
//   4. 爆头：两种形象各打一次，头盔（乌克兰士兵）/ 面罩（特种兵）从头上飞出去：原网格藏起来、
//      飞出的位置在头附近、顺着子弹方向飞、落地停住、尸体消失时一起移除；头后面多几团停留更久的血雾
// 用法（在仓库根目录）：node tools/tests/hit-fx.mjs
// 截图在 tools/out/tests/hit-fx/：<形象>-body（打中身体）、<形象>-head（爆头瞬间）、<形象>-helmet（头盔落地）
import { mkdirSync } from 'node:fs';
import { openGame } from '../lib/game-page.mjs';
const OUT = new URL('../out/tests/hit-fx/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };
const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 85 }); };

await p.evaluate(async () => {
  await Promise.all(Game.Character.paths().map((path) => Game.Character.load(path)));   // 两种形象都下好，才能挑
  Game.Config.spawnProtect.time = 0;
  game.ui.show(null);
  game.input.locked = false;
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += step) {
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      game.bots.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
  // 开一局对决，直到 NPC 是想要的形象（带名为 mesh 的网格）；NPC 站在玩家正前方 7 米、瞎着不开枪
  window.setup = (mesh) => {
    for (let i = 0; i < 40; i++) {
      game.startMode('duel');
      const b = game.bots.bots[0];
      let has = false;
      b.model.root.traverse((o) => { if (o.name === mesh) has = true; });
      if (has) break;
    }
    window.bot = game.bots.bots[0];
    const pl = game.player, o = openSpot();
    pl.position.set(o.x, pl.position.y, o.z + 4); pl.yaw = 0; pl.pitch = 0;
    bot.pos.set(o.x, 0, o.z - 3); bot.updateBox();
    bot.flash(999);
    bot.update = () => false;   // 活着时不动；打死后换回真的 update（布娃娃、流血都在里面）
    game.bots.bots[0].model.root.position.copy(bot.pos);
    game.effects.clear();
    tick(0.05);
    bot.model.update(0.016);
    bot.model.root.updateMatrixWorld(true);
  };
  // 找一块空地：NPC 前后左右几米内没有东西（地图正中是平台，不能直接用原点）
  window.openSpot = () => {
    const cs = game.world.colliders.filter((c) => c.max.y > 0.05);
    for (let x = -30; x <= 30; x += 2) for (let z = -30; z <= 30; z += 2) {
      if (!cs.some((c) => c.max.x > x - 3 && c.min.x < x + 3 && c.max.z > z - 9 && c.min.z < z + 5)) return { x, z };
    }
    throw new Error('找不到空地');
  };
  window.helmetMesh = (mesh) => { let m = null; bot.model.root.traverse((o) => { if (o.name === mesh) m = o; }); return m; };
});

check(await p.evaluate(() => !document.getElementById('hitmarker')), '准星上没有命中标记');

for (const [skin, mesh] of [['ukrainian', 'Hats'], ['soldier', 'vanguard_visor']]) {
  console.log(`--- ${skin}（${mesh}）`);
  // ---- 打中身体 ----
  let r = await p.evaluate((mesh) => {
    setup(mesh);
    const chest = bot.model.bones.spine.getWorldPosition(new THREE.Vector3());
    const dir = chest.clone().sub(game.camera.position).normalize();
    const n0 = game.effects.items.length;
    const res = bot.takeDamage(20, { part: 'body', point: chest, dir, force: 1 });
    game.effects.bloodHit(chest, dir);   // 和 weapon.js 一样：没死时开枪的那边冒血
    bot.model.update(0.001);
    const m = bot.model.flashMats[0];
    return { found: !!helmetMesh(mesh), killed: res.killed, puffs: game.effects.items.length - n0, red: m.emissive.r, cfg: Game.Config.hitFx.flash };
  }, mesh);
  check(r.found, `形象带 ${mesh}`);
  check(!r.killed && r.puffs === 2, '打中身体：入口 + 出口两团血雾', r);
  check(Math.abs(r.red - r.cfg) < 0.02, `闪红强度 = hitFx.flash（${r.cfg}）`, r.red);
  await shot(`${skin}-body`);

  // ---- 爆头 ----
  r = await p.evaluate((mesh) => {
    tick(0.5);
    bot.health = 100;
    const head = bot.model.bones.head.getWorldPosition(new THREE.Vector3());
    const dir = head.clone().sub(game.camera.position).normalize();
    const n0 = game.effects.items.length;
    const res = bot.takeDamage(100, { part: 'head', point: head.clone(), dir, force: 1 });
    bot.update = bot.realUpdate || Object.getPrototypeOf(bot).update;
    const prop = game.effects.props[0];
    return {
      killed: res.killed, hidden: !helmetMesh(mesh).visible, props: game.effects.props.length,
      puffs: game.effects.items.length - n0,
      fromHead: prop ? prop.mesh.position.distanceTo(head) : -1, head: head.toArray(), dir: dir.toArray(),
    };
  }, mesh);
  check(r.killed && r.hidden && r.props === 1, '爆头：原来的头盔藏起来、飞出一个', r);
  check(r.fromHead >= 0 && r.fromHead < 0.35, '飞出的位置在头上', r.fromHead);
  check(r.puffs >= 4, '爆头的血雾比打身体多（入口一团 + 头后面三团）', r.puffs);
  await p.evaluate(() => tick(0.08));
  await shot(`${skin}-head`);

  r = await p.evaluate(() => {
    const prop = game.effects.props[0], start = prop.mesh.position.clone();
    let peak = start.y;
    for (let i = 0; i < 15; i++) { tick(1 / 60); peak = Math.max(peak, prop.mesh.position.y); }
    const mid = prop.mesh.position.clone();
    tick(3);
    return { up: peak - start.y, moved: mid.clone().sub(start).toArray(), resting: prop.resting, y: prop.mesh.position.y, rest: prop.mesh.position.toArray() };
  });
  check(r.up > 0.05, '头盔先往上飞起来', r.up);
  check(r.moved[2] < -0.3, '头盔顺着子弹方向飞出去', r.moved);
  check(r.resting && r.y < 0.4, '头盔落地停住', r);
  // 镜头转过去看落地的头盔
  await p.evaluate((rest) => {
    const pl = game.player;
    pl.position.set(rest[0] + 1.8, pl.position.y, rest[2] + 1.8);
    pl.yaw = Math.atan2(1.8, 1.8); pl.pitch = -0.5;
    tick(0.02);
  }, r.rest);
  await shot(`${skin}-helmet`);
  r = await p.evaluate(() => { tick(Game.Config.ragdoll.corpseTime); return game.effects.props.length; });
  check(r === 0, '尸体留的时间到了头盔一起移除', r);
}

// ---- 远处血雾放大 ----
const r = await p.evaluate(() => {
  const e = game.effects, cam = game.camera.position;
  const near = cam.clone().add(new THREE.Vector3(0, 0, -5)), far = cam.clone().add(new THREE.Vector3(0, 0, -60));
  return { near: e.mistScale(near, 0.25), far: e.mistScale(far, 0.25), minAngle: Game.Config.hitFx.mistMinAngle };
});
check(r.near === 1 && Math.abs(r.far * 0.25 - 60 * r.minAngle) < 1e-6, '血雾 5 米不放大、60 米放大到最小视角', r);

check(g.problems.length === 0, '控制台没有报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
