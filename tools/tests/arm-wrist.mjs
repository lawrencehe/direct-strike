// v0.22 的针对性测试：第一人称手臂的手腕不弯折过度、不扭转（gunmodel.js 的 buildArms().solve）。
// 每把枪 / 手雷、换弹中左手去抓弹匣时，量手腕骨骼相对蒙皮绑定姿势转了多少，拆成"弯折"和"绕小臂的扭转"。
// v0.29（#11）：步枪左手托护木时，小臂从画面下方伸出去、手肘不在画面里（以前小臂水平往左，手肘折在画面中间）。
// 用法（在仓库根目录）：node tools/tests/arm-wrist.mjs
import { openGame } from '../lib/game-page.mjs';
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;
  game.startMode('range');
  window.press = (c) => game.input.pressed.add(c);
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec; t += step) {
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) { game.economy.update(step); game.weapon.update(step, game.input); }
      game.input.endFrame();
    }
  };
  // 量 model 下所有手臂的手腕：相对绑定姿势的弯折、扭转，和手肘的弯曲（度）
  window.measure = (model) => {
    const deg = (q) => 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
    const qOf = (m) => { const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
    let sk = null;
    model.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o.skeleton; });
    const bind = (b) => new THREE.Matrix4().copy(sk.boneInverses[sk.bones.indexOf(b)]).invert();
    const out = {};
    for (const s of ['L', 'R']) {
      const E = sk.bones.find((b) => b.name.startsWith(s + '_elbow_')), W = sk.bones.find((b) => b.name.startsWith(s + '_wrist_'));
      const S = sk.bones.find((b) => b.name.startsWith(s + '_arm_'));
      if (S.scale.x < 1e-3) continue;   // 没用到、缩成点的那条手臂
      const relRest = qOf(bind(E)).invert().multiply(qOf(bind(W)));
      const relNow = E.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(W.getWorldQuaternion(new THREE.Quaternion()));
      const d = relRest.invert().multiply(relNow);
      const axis = W.position.clone().normalize().applyQuaternion(relRest.clone().invert());   // 小臂长轴，在手腕自身坐标里
      const v = new THREE.Vector3(d.x, d.y, d.z), pr = axis.multiplyScalar(v.dot(axis));
      const tw = new THREE.Quaternion(pr.x, pr.y, pr.z, d.w).normalize();
      const P = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
      out[s] = {
        bend: +deg(d.clone().multiply(tw.clone().invert())).toFixed(1), twist: +deg(tw).toFixed(1),
        elbow: +P(E).sub(P(S)).angleTo(P(W).sub(P(E))).toFixed(2) * 57.3 | 0,
      };
    }
    return out;
  };
  // 步枪左臂在画面里的样子：手肘在屏幕上的位置（NDC，-1 是画面下沿 / 左沿）、小臂（手腕 → 手肘）在枪模相机里的方向
  window.leftArmView = (model) => {
    let sk = null;
    model.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o.skeleton; });
    const cam = game.weapon.weaponCamera;
    cam.updateMatrixWorld();
    const B = (n) => sk.bones.find((b) => b.name.startsWith('L_' + n + '_'));
    const P = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const e = P(B('elbow')).project(cam);
    const fore = cam.worldToLocal(P(B('elbow'))).sub(cam.worldToLocal(P(B('wrist')))).normalize();
    return { elbowX: +e.x.toFixed(2), elbowY: +e.y.toFixed(2), foreDown: +(-fore.y).toFixed(2) };
  };
});

const maxBend = await p.evaluate(() => Game.Config.weapons.arms.wristMaxBend);
const judge = (name, r) => {
  for (const [s, v] of Object.entries(r)) check(v.bend <= maxBend + 0.5 && v.twist <= 1, `${name} ${s} 手腕弯折 ≤ ${maxBend}°、不扭转`, v);
};

for (const [rifle, pistol] of [['m4', 'sg'], ['ak', 'beretta']]) {
  await p.evaluate(([r, s]) => { game.ui.pickLoadout('rifle', r); game.ui.pickLoadout('pistol', s); }, [rifle, pistol]);
  await p.waitForFunction(([r, s]) => game.weapon.guns.rifle.key === r && game.weapon.guns.pistol.key === s, [rifle, pistol], { timeout: 60000 });
  for (const [key, slot, name] of [['Digit1', 'rifle', rifle], ['Digit2', 'pistol', pistol]]) {
    judge(name, await p.evaluate(([k, slot]) => { press(k); tick(1.2); return measure(game.weapon.guns[slot].model); }, [key, slot]));
    if (slot === 'rifle') {
      const v = await p.evaluate(() => leftArmView(game.weapon.guns.rifle.model));
      // 手肘在画面下沿附近或以外；小臂往下伸（方向的向下分量 ≥ 0.4，以前是 0.2 左右、几乎水平）
      check(v.elbowY <= -0.9 || v.elbowX <= -1, `${name} 左手肘不在画面中间`, v);
      check(v.foreDown >= 0.4, `${name} 左小臂从画面下方伸出`, v);
      await p.waitForTimeout(600);
      await p.screenshot({ path: `tools/out/tests/arm-${name}.jpg`, type: 'jpeg', quality: 85 });
    }
    // 换弹到一半：左手去抓弹匣
    judge(`${name} 换弹中`, await p.evaluate((slot) => {
      const it = game.weapon.guns[slot]; it.ammo = 0; it.reserve = it.cfg.magSize; tick(0.5);   // 没备弹不换弹（#7）
      if (!game.weapon.reloading) return { X: { bend: 999, twist: 999, note: '没进入换弹' } };
      const r = measure(it.model); tick(3); return r;
    }, slot));
  }
}
for (const kind of ['frag', 'flash', 'smoke']) {
  judge(kind, await p.evaluate((kind) => { press({ frag: 'Digit3', flash: 'Digit4', smoke: 'Digit5' }[kind]); tick(1); return measure(game.weapon.throwables[kind].model); }, kind));
}

check(g.problems.length === 0, '控制台无报错', g.problems);
await g.close();
console.log(fails ? `${fails} 项失败` : '全部通过');
process.exit(fails ? 1 : 0);
