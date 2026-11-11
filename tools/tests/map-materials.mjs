// 地图真实材质的针对性测试（#50）：
// - 地图文件 surfaces 里的 PBR 贴图（颜色、法线、粗糙度）和环境光 HDRI 都加载成功、用上了
// - 贴图按真实尺寸铺（UV 跨度 = 面的米数 / 贴图覆盖的米数）
// - 从几个固定机位截图，看近处地面、水泥墩的质感：tools/out/tests/map-materials/*.png
// 开发机是软件渲染，截图能看质感和颜色，看不了帧率。
// 用法（在仓库根目录）：node tools/tests/map-materials.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openGame, OUT } from '../lib/game-page.mjs';

const dir = path.join(OUT, 'tests/map-materials');
fs.mkdirSync(dir, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => { game.startMode('duel'); game.ui.show(null); game.input.locked = true; });

const info = await p.evaluate(() => {
  const mats = new Map();
  game.world && game.scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial) mats.set(m.uuid, m);
  });
  const all = [...mats.values()];
  const pbr = all.filter((m) => m.normalMap && m.roughnessMap && m.userData.tile);
  const loadedOk = pbr.every((m) => m.map.image && m.map.image.width >= 1024 && m.normalMap.image && m.roughnessMap.image);
  // 场地沥青那块平面：UV 跨度应该是 场地宽 / 贴图米数
  const map = game.world;
  let yardSpan = null;
  game.scene.traverse((o) => {
    if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.width === 37 && o.geometry.parameters.height === 49) {
      const uv = o.geometry.attributes.uv;
      yardSpan = [Math.abs(uv.getX(1) - uv.getX(0)), Math.abs(uv.getY(2) - uv.getY(0)), o.material.userData.tile];
    }
  });
  return {
    pbr: pbr.length, loadedOk, yardSpan, mapName: map.mapName,
    env: all.filter((m) => m.envMap).length,
  };
});
check(info.pbr >= 4, 'PBR 材质（沥青、水泥、水泥地块、场外地面、碎块）都建出来了', info.pbr);
check(info.loadedOk, '贴图都是真的图片（≥1K）');
check(info.env > 0, '地图材质用上了环境光 HDRI', info.env);
const [su, sv, tile] = info.yardSpan || [];
check(info.yardSpan && Math.abs(su - 37 / tile) < 1e-3 && Math.abs(sv - 49 / tile) < 1e-3, '场地沥青按真实尺寸铺', info.yardSpan);

// 固定机位截图：[名字, x, z, yaw, pitch]
const shots = [
  ['ground-near', 0, 20, 0, -0.55],          // 南边出生区，低头看沥青
  ['center-pad', 0, 6, 0, -0.25],            // 看中央高台和水泥地块
  ['fence', -15, 3, 1.2, -0.3],              // 西侧围栏的水泥墩和场外地面
];
for (const [name, x, z, yaw, pitch] of shots) {
  await p.evaluate(([x, z, yaw, pitch]) => {
    const pl = game.player;
    pl.position.set(x, 0, z); pl.yaw = yaw; pl.pitch = pitch;
    pl.update(0, game.input);
  }, [x, z, yaw, pitch]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(dir, `${name}.png`) });
  console.log('截图', path.relative(process.cwd(), path.join(dir, `${name}.png`)));
}

check(g.problems.length === 0, '控制台没有报错', g.problems.slice(0, 3));
await g.close();
console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
