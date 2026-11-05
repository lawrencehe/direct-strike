---
name: verify
description: 启动游戏检查 WebGL、模型加载和控制台报错，并按模式和分辨率截图。改完代码或资源后要确认游戏正常、用户说"验证 / 跑一下 / 截图看看"时用。
---

# 验证游戏

```bash
node tools/verify.mjs                                   # 默认 menu,range,duel，1280x720
node tools/verify.mjs --modes range,duel,waves --sizes 1280x720,1920x1080
node tools/verify.mjs --eval "game.player.position.toArray()"
node tools/verify.mjs --url https://game.lightup.host   # 检查线上
```

- 退出码 1 表示有报错或模型加载失败。完整问题列表在 `tools/out/verify/report.json`。
- 默认只看摘要；要确认画面时读 `*.small.jpg`（800px），看细节才读同名 `.png`。
- 全局对象是 `window.game`（scene、player、bots、world 等）。
- 可用 `tools/lib/game-page.mjs` 的 `openGame` 写一次性测试脚本，放到 scratchpad。

## 这些结论它给不了

这台机器没有 GPU，用 SwiftShader 软件渲染。**帧率（个位数）和启动耗时（可达 40 秒）没有绝对意义**，只能比较同一配置下改动前后的变化。手感和真实帧率要用户在自己的电脑上测。
测试直接把 `game.input.locked` 设为真，不经过真实的指针锁定，所以这一环节要手动验证。
