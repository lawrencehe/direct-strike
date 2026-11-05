---
name: rig
description: 用 Blender 无头模式处理角色骨骼：合并 Mixamo 或其他同骨架动画、重命名骨骼、减面，以及用脚本做硬表面道具。给角色加动画或改骨骼时用。
---

# 骨骼和动画

```bash
tools/rig.sh add-anim 模型.glb 动画.fbx --name Jump -o 输出.glb [--clip 来源动画名] [--force]
tools/rig.sh rename-bones 模型.glb -o 输出.glb --strip-prefix 'mixamorig:'
tools/rig.sh rename-bones 模型.glb -o 输出.glb --map '{"旧":"新"}'
tools/rig.sh decimate 模型.glb --ratio 0.5 -o 输出.glb
```

Blender 日志在 `tools/out/rig.log`，默认只显示结果行。挂道具用 `/glb` 的 `attach`，不要用 Blender。

## 处理结果的流程

输入必须是 `assets-src/` 里未压缩的母版，压缩过的文件 Blender 读不了，rig.sh 会拒绝。

1. rig.sh 处理母版，输出到 `tools/out/`。
2. 结果确认无误后更新母版（`assets-src/`）。
3. 跑 `glb.mjs optimize`（soldier 要加 `--drop TPose`），再用 `glb-view.mjs compare` 或 `preview` 确认。
4. 把优化结果放到 `assets/`，最后 `/verify`。

## 注意

- 从 Mixamo 下载时选 **FBX + With Skin**。Without Skin 的文件静止姿态不对，工具会拒绝。不要随便加 `--force`，之前实测这会造成接近 1 米的骨骼偏差。
- 改骨骼名前先看 `js/character.js` 的 `findBone`，它能识别带 mixamorig 前缀和不带前缀的名字。
- 减面后要让用户在游戏里看关节变形，指标正常不代表好看。
- 从零做自然的人物不现实，人物应该找现成资源。硬表面道具可以写 bpy 脚本，用 `blender -b --python-exit-code 1 -P 脚本.py` 运行，脚本放 scratchpad。
- 没有 GPU，Blender 渲染很慢。预览用 `glb-view.mjs`。
