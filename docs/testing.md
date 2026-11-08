# 测试

## 冒烟验证

每次改完都跑：

```bash
node tools/verify.mjs            # Claude Code 里是 /verify
```

它会起一个本机静态服务，用无头 Chromium 打开游戏，检查 WebGL、模型加载、控制台报错，并给各模式截图（`tools/out/verify/`）。
输出"问题: 0"才算通过。`--url https://game.lightup.host` 可以验证线上版本，其他参数见脚本开头。

## 写针对性的测试脚本

改了玩法逻辑（武器、投掷物、NPC、死亡效果）时，冒烟验证不够，需要写脚本把场景摆出来、模拟操作、检查状态并截图。
`tools/lib/game-page.mjs` 的 `openGame` 负责启动页面，剩下的靠 `window.game`。

要点：

- **不要依赖实时帧。** 开发机没有 GPU，帧率只有个位数且不稳定。自己写一个 `tick(秒数)`，按固定步长依次调用各对象的 `update`。
- **模拟按键**：`game.input.pressed.add(code)` 是"这帧刚按下"，`game.input.down` 是"按住"，每步结束调 `game.input.endFrame()`。
  鼠标左键的 code 是 `Mouse0`，数字键是 `Digit1` 等。
- **不要设 `input.locked = true`**，否则真实的 `requestAnimationFrame` 循环也会推进游戏，和 `tick` 叠加。
- **NPC 碍事时**把它挪远并替换 `update`。
- 截图前 `waitForTimeout` 一小会儿，让真实循环画一帧。

模板（脚本放在仓库外的临时目录，或 `tools/out/`）：

```js
import { openGame } from '/home/donkey/direct-strike/tools/lib/game-page.mjs';
const g = await openGame({ width: 1280, height: 720 });
const p = g.page;
await p.evaluate(() => {
  game.ui.show(null);   // 隐藏所有界面，显示 HUD（只隐藏 #overlay 的话 HUD 也是藏着的）
  game.input.locked = false;
  game.startMode('waves');
  for (const b of game.bots.bots) { b.pos.set(30, 0, 30); b.update = () => false; }   // NPC 先挪开
  window.press = (c) => game.input.pressed.add(c);
  window.tick = (sec, step = 1 / 60) => {
    for (let t = 0; t < sec; t += step) {
      game.player.update(step, game.input); game.camera.updateMatrixWorld();
      if (game.player.alive) game.weapon.update(step, game.input);
      game.bots.update(step); game.grenades.update(step); game.hud.update(step, game.player);
      game.input.endFrame();
    }
  };
});

const r = await p.evaluate(() => { press('Digit3'); tick(0.5); return game.weapon.current; });
console.log(r === 'frag' ? 'PASS' : 'FAIL', '切到手雷', r);
await p.waitForTimeout(600);
await p.screenshot({ path: 'tools/out/frag.jpg', type: 'jpeg', quality: 85 });
await g.close();
```

`openGame` 还返回 `problems`（控制台报错列表），结束前检查它为空。

## 什么测不了

- 帧率、卡顿、真实手感：要在有显卡的电脑上用浏览器试玩。
- 指针锁定：无头环境没有真实的指针锁定。
- Safari：目前不支持，也没测。
