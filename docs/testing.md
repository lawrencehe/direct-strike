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

模板（一次性的脚本放在仓库外的临时目录或 `tools/out/`；要留着反复跑的放 `tools/tests/`，见下文）：

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
      if (game.player.alive) { game.economy.update(step); game.weapon.update(step, game.input); }   // 顺序和 main.js 一样
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

- 用 tick 推进时如果开着开发者模式，录下的时间是真实时钟，几秒的模拟会挤在一瞬间；要像真机一样的时间，
  每步设 `Game.DevLog._debug.simNow`（毫秒），用完设回 -1，见 `tools/tests/devlog.mjs`。
- 换弹、投掷这类按进度做的动作，可以按进度推进到某一点再截图，例如推到换弹进度 0.56 看新弹匣插入。
- 经济：`game.economy.money` 是钱，`game.player.position.copy(game.player.spawn)` 站进购买区，按 `KeyB` 开面板。
  测试里直接 `bot.takeDamage(999, { part: 'head' })` 模拟击杀，`hit` 决定赏金类型（`explosion: true` 是手雷，`byBot: true` 不给钱）。

## 留在仓库里的测试

需要反复跑的测试放 `tools/tests/`，按需求起名，在需求文档的"验证"一节写上路径。截图写到 `tools/out/tests/`（不入仓库）。
失败时退出码非 0。

| 脚本 | 测什么 |
|---|---|
| `tools/tests/reload-nade-economy.mjs` | v0.20：自动换弹、换弹中切枪、手雷两道保险、经济（赏金、上限、购买、补给） |
| `tools/tests/devlog.mjs` | v0.21：开发者模式的解锁、录制开销和零内存分配、事件、录画面的自动关闭保护、上传、分析脚本 |

```bash
node tools/tests/reload-nade-economy.mjs
```

## 什么测不了

- 帧率、卡顿、真实手感：要在有显卡的电脑上用浏览器试玩。负责人试玩时打开开发者模式录下来上传，开发用
  `tools/devlog/analyze.mjs` 看（`devmode.md`）。
- 录 WebGL 画面：无头 Chromium + 软件渲染下会卡住出帧、录出来是空的。
- 指针锁定：无头环境没有真实的指针锁定。
- Safari：目前不支持，也没测。
