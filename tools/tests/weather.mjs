// 天气 / 时段的针对性测试（#77）：
// - 默认是晴天：程序画的天空和云、地图自己的环境光
// - 切到阴雨傍晚：天空换成贴图、环境光换成天空图、曝光和雾变了、地面变光滑变暗、多出水洼，设置存下来
// - 切回晴天：全部恢复原样
// - 两种天气下，从同一个机位看 12 米、25 米外站着的 NPC，截图对比能不能看清：tools/out/tests/weather/*.png
// 开发机是软件渲染，截图能看颜色和亮度，看不了帧率。
// 用法（在仓库根目录）：node tools/tests/weather.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openGame, OUT } from '../lib/game-page.mjs';

const dir = path.join(OUT, 'tests/weather');
fs.mkdirSync(dir, { recursive: true });
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
let fails = 0;
const check = (ok, name, v) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, v === undefined ? '' : JSON.stringify(v)); };

await p.evaluate(() => {
  game.ui.show(null);
  game.input.locked = false;       // 不跑真实的游戏逻辑，只靠真实循环画画面
  game.startMode('duel');
  window.bot = game.bots.bots[0];
  bot.update = () => false;        // NPC 站着不动，只看画面
  // 读当前天气的状态
  window.state = () => {
    const w = game.world;
    let sky = null, procVisible = null;
    game.scene.traverse((o) => {
      if (o.geometry && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 280) sky = o.material;
      if (o.isGroup && o.children.some((c) => c.isSprite)) procVisible = o.visible;
    });
    let asphalt = null, puddles = 0;
    game.scene.traverse((o) => {
      if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.width === 37 && o.geometry.parameters.height === 49) asphalt = o.material;
      if (o.geometry && o.geometry.type === 'CircleGeometry' && o.visible && o.material.transparent) puddles++;
    });
    return {
      weather: w.weather, saved: JSON.parse(localStorage.getItem('direct-strike.settings.v1') || '{}').weather,
      skyImage: !!(sky && sky.map && sky.map.image && sky.map.image.width >= 2048 && sky.toneMapped === false),
      procVisible, exposure: game.renderer.toneMappingExposure,
      fog: game.scene.fog.color.getHex(),
      envIsSky: !!(asphalt.envMap && sky.map && asphalt.envMap.source === sky.map.source),
      envMapOn: !!asphalt.envMap,
      roughness: asphalt.roughness, colorR: asphalt.color.r, puddles,
      button: document.querySelector('#weather-pick .on')?.textContent,
    };
  };
});

const shots = async (tag) => {
  for (const dist of [12, 25]) {
    await p.evaluate((d) => {
      const pl = game.player;
      pl.position.set(5.7, 0, 21); pl.yaw = 0; pl.pitch = -0.02; pl.update(0, game.input);
      bot.pos.set(5.7, 0, 21 - d); bot.updateBox();   // 东侧集装箱和隔离墩之间的通道，中间没有遮挡
      bot.yaw = Math.PI;               // 面朝玩家
      bot.syncModel(0);                // update 停掉了，手动把模型摆到位置上
    }, dist);
    await p.waitForTimeout(1500);
    const f = path.join(dir, `${tag}-npc-${dist}m.png`);
    await p.screenshot({ path: f });
    console.log('截图', path.relative(process.cwd(), f));
  }
};

const C = await p.evaluate(() => Game.Config.weather);
const sunny = await p.evaluate(() => state());
check(sunny.weather === 'sunny' && !sunny.skyImage && sunny.procVisible === true, '默认晴天：程序画的天空和云', sunny);
check(sunny.exposure === C.presets.sunny.exposure && sunny.fog === C.presets.sunny.fog.color, '晴天的曝光和雾', sunny);
check(sunny.envMapOn && !sunny.envIsSky, '晴天用地图自己的环境光 HDRI');
check(sunny.button === '晴天', '首页天气按钮亮的是晴天', sunny.button);
await shots('sunny');

// 点首页的按钮切换（走真实的界面 → 设置 → main.js → world 这条路）
await p.evaluate(() => [...document.querySelectorAll('#weather-pick button')].find((b) => b.textContent === '阴雨傍晚').click());
await p.waitForFunction(() => game.world.weather === 'rainDusk', null, { timeout: 60000 });
const rain = await p.evaluate(() => state());
check(rain.skyImage && rain.procVisible === false, '阴雨傍晚：天空换成贴图，程序画的云和太阳藏起来', rain);
check(rain.exposure === C.presets.rainDusk.exposure && rain.fog === C.presets.rainDusk.fog.color, '阴雨傍晚的曝光和雾', rain);
check(rain.envIsSky, '环境光换成天空贴图');
check(Math.abs(rain.roughness - sunny.roughness * C.wetGround.roughness) < 1e-6 && rain.colorR < sunny.colorR, '地面变光滑、变暗', [sunny.roughness, rain.roughness]);
check(rain.puddles === sunny.puddles + C.presets.rainDusk.extraPuddles, '多撒了水洼', [sunny.puddles, rain.puddles]);
check(rain.saved === 'rainDusk' && rain.button === '阴雨傍晚', '设置存下来了，按钮跟着变', rain);
await shots('rainDusk');

await p.evaluate(() => Game.Settings.set('weather', 'sunny'));
await p.waitForFunction(() => game.world.weather === 'sunny', null, { timeout: 60000 });
const back = await p.evaluate(() => state());
const same = ['skyImage', 'procVisible', 'exposure', 'fog', 'envIsSky', 'envMapOn', 'roughness', 'colorR', 'puddles'].every((k) => back[k] === sunny[k]);
check(same, '切回晴天全部恢复', back);

check(g.problems.length === 0, '控制台没有报错', g.problems.slice(0, 3));
await g.close();
console.log(fails ? `失败 ${fails} 项` : '全部通过');
process.exit(fails ? 1 : 0);
