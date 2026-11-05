# 本地工具链

开发工具都在 `tools/`，不会发布到线上。Claude Code 通过 `/verify`、`/glb`、`/img`、`/rig`、`/map` 这五个 Skill 调用，也可以直接在终端运行。

## 安装

```bash
tools/setup.sh
```

可重复执行。Blender 和 oxipng 装在 `~/.local`，下载时校验 SHA256。

| 工具 | 版本 | 用途 |
|---|---|---|
| Playwright + Chromium | 1.64.1 | 无头运行游戏、截图、读状态 |
| gltf-transform | 4.5.1 | glb 优化和编辑，也可以直接用 `npx gltf-transform` |
| Blender | 5.2.3 LTS | 动画重定向、骨骼处理、减面、建硬表面道具 |
| pngquant / oxipng / cwebp / ImageMagick / rsvg-convert | 系统版本（oxipng 10.2.1） | 图片处理 |

## 资源目录

- `assets-src/`：未压缩的母版，进 git，不发布。所有加工都从这里开始。
- `assets/`：压缩后的结果，发布到线上，由母版生成。

Blender 读不了 meshopt 压缩过的文件，所以母版不能省。

## 常用命令

```bash
node tools/verify.mjs                                 # 验证游戏
node tools/map-check.mjs                              # 检查地图，生成俯视图
node tools/glb.mjs info 文件.glb                       # 查看模型
node tools/glb.mjs optimize 输入.glb 输出.glb --drop TPose
node tools/glb.mjs attach 模型.glb 枪.glb 输出.glb --bone RightHand
node tools/glb-view.mjs compare 原始.glb 新.glb        # 压缩前后对比
tools/rig.sh add-anim 模型.glb 动画.fbx --name Jump -o 输出.glb
tools/img.sh png 输入.png 输出.png
```

详细参数见各脚本开头，或 `.claude/skills/*/SKILL.md`。输出都写到 `tools/out/`（不进 git）。

## 给角色加 Mixamo 动画

1. 在 Mixamo 下载 **FBX + With Skin**。Without Skin 的文件静止姿态不对，会被工具拒绝。
2. 把 FBX 放到本机，运行：

```bash
tools/rig.sh add-anim assets-src/models/soldier.glb 动画.fbx --name Jump -o tools/out/a.glb
node tools/glb.mjs optimize tools/out/a.glb tools/out/b.glb --drop TPose
node tools/glb-view.mjs preview tools/out/b.glb --clip Jump --time 0.3 --angle 200
cp tools/out/a.glb assets-src/models/soldier.glb
cp tools/out/b.glb assets/models/soldier.glb
node tools/verify.mjs
```

## 这台机器的限制

- **没有 GPU。** WebGL 靠 SwiftShader 软件渲染，帧率只有个位数，启动可达 40 秒，这些都不代表玩家体验。手感和真实帧率要在有显卡的电脑上测。
- **指针锁定没有真实测试。** 工具直接把 `game.input.locked` 设为真。
- **Ubuntu 26.10** 不在 Playwright 官方支持列表里，目前实测能用，升级 Playwright 后要留意。
- `npm audit` 有 4 个中等级别提示，来自 gltf-transform CLI 的依赖（minimatch）。工具只在本地运行，不会发布到线上。
