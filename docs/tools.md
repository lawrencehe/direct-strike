# 本地工具链

开发工具都在 `tools/`，不会发布到线上。Claude Code 通过 `/verify`、`/ship`、`/glb`、`/img`、`/rig`、`/map` 这些 Skill 调用，也可以直接在终端运行。

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
| GitHub CLI（`gh`） | 系统版本 | 开 issue、建和合并 PR、建 Release（`ship.sh` 要用）。不在 `setup.sh` 里，开发机上登录的是机器账号 primorigin（见下面"GitHub 账号"） |

## GitHub 账号

开发机上 Claude 用机器账号 **primorigin** 操作 GitHub，负责人 lawrencehe 在网页上操作，两边在 GitHub 上分得开（#46）。

- primorigin 是仓库协作者（Write）。负责人说"给 primorigin 处理"和"给 Claude 处理"是一回事。
- `gh`：`gh auth login` 登录 primorigin（`gh auth status` 看当前账号）。
- git 推送走 SSH，用 primorigin 名下的密钥 `~/.ssh/id_ed25519_primorigin`（没设密码）。只配在本仓库，所有 worktree 共用：
  ```bash
  git config core.sshCommand "ssh -i ~/.ssh/id_ed25519_primorigin -o IdentitiesOnly=yes"
  git config user.name primorigin
  git config user.email primorigin@outlook.com
  ```
  `~/.ssh/id_ed25519` 是负责人 lawrencehe 的密钥，本仓库不用它。检查：`ssh -i ~/.ssh/id_ed25519_primorigin -o IdentitiesOnly=yes -T git@github.com` 应该回 `Hi primorigin!`。
- 换开发机：新建密钥加到 primorigin 的 SSH keys，照上面配。

## 资源目录

- `assets-src/`：未压缩的母版，进 git，不发布。所有加工都从这里开始。
- `assets/`：压缩后的结果，发布到线上，由母版生成。

Blender 读不了 meshopt 压缩过的文件，所以母版不能省。

## 常用命令

```bash
node tools/verify.mjs                                 # 验证游戏
node tools/tests/<需求>.mjs                           # 某个需求的针对性测试（见 docs/testing.md）
tools/ship.sh -v v0.13 -m 提交信息文件 -c 6 --tag      # 提交、建 PR 并入 main、部署、打 tag、建 Release（见 docs/workflow.md）
node tools/map-check.mjs [--map 文件]                 # 检查地图，生成俯视图（格式见 docs/maps.md）
node tools/glb.mjs info 文件.glb                       # 查看模型
node tools/glb.mjs optimize 输入.glb 输出.glb --drop TPose
node tools/glb.mjs attach 模型.glb 枪.glb 输出.glb --bone RightHand
node tools/glb-view.mjs compare 原始.glb 新.glb        # 压缩前后对比
tools/rig.sh add-anim 模型.glb 动画.fbx --name Jump -o 输出.glb
tools/img.sh png 输入.png 输出.png
```

详细参数见各脚本开头，或 `.claude/skills/*/SKILL.md`。输出都写到 `tools/out/`（不进 git）。

## 分析开发者模式的数据

负责人在游戏里录的真机数据上传到 `~/direct-strike-data/devlogs/<编号>/`，用法和输出见 `devmode.md`：

```bash
node tools/devlog/analyze.mjs --list     # 列出上传
node tools/devlog/analyze.mjs [编号]     # 报告 + 曲线图 + 标记前后的视频帧，输出到 tools/out/devlog/<编号>/
```

画图和拆视频帧都用 Playwright 自带的 Chromium，不用另装 ffmpeg。

## 给角色加 Mixamo 动画

1. 在 Mixamo 下载 **FBX + With Skin**。Without Skin 的文件静止姿态不对，会被工具拒绝。
2. 把 FBX 放到本机，运行：

```bash
tools/rig.sh add-anim assets-src/models/human/init_soldier.glb 动画.fbx --name Jump -o tools/out/a.glb
node tools/glb.mjs optimize tools/out/a.glb tools/out/b.glb --drop TPose
node tools/glb-view.mjs preview tools/out/b.glb --clip Jump --time 0.3 --angle 200
cp tools/out/a.glb assets-src/models/human/init_soldier.glb
cp tools/out/b.glb assets/models/human/init_soldier.glb
node tools/verify.mjs
```

现在游戏里的 NPC 是 `ukrainian-soldier.glb`，它的动画是从 `init_soldier.glb` 移植的。给它加动画后要重跑
`assets-src/models/human/ukrainian-soldier/build.sh`（脚本里加一行 `add-anim`）。
`add-anim` 的来源也可以是另一个同骨架的 glb，用 `--clip` 选其中一段动画。

## 这台机器的限制

开发机是 GCP 实例：4 核 32G，x86_64，无 GPU、无显示器。

- **没有 GPU。** WebGL 靠 SwiftShader 软件渲染，帧率只有个位数，启动可达 40 秒，这些都不代表玩家体验。手感和真实帧率要在有显卡的电脑上测。
- **指针锁定没有真实测试。** 工具直接把 `game.input.locked` 设为真。
- **Ubuntu 26.10** 不在 Playwright 官方支持列表里，目前实测能用，升级 Playwright 后要留意。
- `npm audit` 有 4 个中等级别提示，来自 gltf-transform CLI 的依赖（minimatch）。工具只在本地运行，不会发布到线上。
