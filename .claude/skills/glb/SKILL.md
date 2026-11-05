---
name: glb
description: 查看、压缩 glb 模型，删减动画，把道具挂到骨骼上，对比压缩前后差异。处理 glb、模型体积过大、给角色加武器或道具时用。
---

# glb 处理

```bash
node tools/glb.mjs info 文件.glb
node tools/glb.mjs optimize 输入.glb 输出.glb [--drop TPose] [--texture-size 1024] [--quality 80] [--level medium]
node tools/glb.mjs attach 模型.glb 道具.glb 输出.glb --bone RightHand [--offset x,y,z（米）] [--rot x,y,z（度）] [--scale s]
node tools/glb-view.mjs preview 文件.glb [--clip Walk] [--time 0.3] [--angle 200] [--out 图.jpg]
node tools/glb-view.mjs compare 原始.glb 新.glb [--clip Walk] [--tolerance 0.01]
```

## 替换资源的流程（不要跳步）

`assets-src/` 放未压缩母版（不发布），`assets/` 放压缩结果（发布）。始终从母版开始处理，避免累积有损压缩。

1. `optimize` 输出到新文件。工具不允许覆盖输入文件。
2. `compare` 检查骨骼和蒙皮偏差，再看 `tools/out/glb/compare.jpg`。
3. 用 `cp` 替换后跑 `/verify`。

## 注意

- 删动画前先 grep 代码。`js/character.js` 用到 Idle、Walk、Run，并用 Walk 和 Run 测步幅。
- 游戏已带 `vendor/meshopt_decoder.js`，支持 meshopt、WebP 和量化。**KTX2 和 Draco 没有接入**，不要产出这两种格式。
- 新地图资源按地图拆分、按需加载。
- 角色面朝 -z，预览正面要加 `--angle 200`。
