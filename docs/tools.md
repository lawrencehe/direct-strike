# 本地工具链

开发工具都在 `tools/`，不会发布到线上。Claude Code 里用下面的斜杠命令调用（就是 `.claude/skills/<名字>/SKILL.md`），也可以直接在终端运行脚本。

## 斜杠命令速查

命令后面的参数可以不写，也可以用中文说要做什么。不打斜杠、直接说"部署""验证一下"，Claude 也会按意思选对应的命令。

| 命令 | 做什么 | 例子 |
|---|---|---|
| `/issue <编号>` | 做指定的 issue，跟到 PR 待验收 | `/issue 51` |
| `/deploy [编号] [推送]` | 提交 → PR 合并进 main → 部署 → tag 和 Release（`tools/ship.sh`）；加"推送"只推不部署 | `/deploy`、`/deploy 51`、`/deploy 推送` |
| `/rollback [vX.Y]` | 把线上退回某个版本；不带版本号就列出版本让你选。线上排查也用它（`deploy.sh`） | `/rollback v0.50` |
| `/verify [模式] [线上] [尺寸] [mac]` | 启动游戏查报错、截图 | `/verify`、`/verify duel,waves`、`/verify 线上`、`/verify mac` |
| `/map [上传编号 \| 文件 \| 改动]` | 检查或修改地图，出俯视图 | `/map`、`/map 3f2a`、`/map C4 往北挪两格` |
| `/glb <文件> [做什么]` | 查看、压缩模型，挂道具 | `/glb assets/models/gun/m4.glb 压缩` |
| `/img <图片> [做什么]` | 压缩、转 WebP、缩放、裁切 | `/img logo.png 转 webp` |
| `/rig <模型> [做什么]` | Blender 处理骨骼和动画 | `/rig soldier 加 Jump 动画` |
| `/analyze [编号 \| 列表] [时刻] [哪里不对]` | 分析开发者模式录下的真机数据和画面，说清楚卡在哪、哪里闪 | `/analyze`、`/analyze c894f9 12.5 换弹手闪一下` |
| `/tripo <参考图 \| 描述>` | AI 生成 3D 底模（先报价，同意了才花积分） | `/tripo refer/ak.png` |

命名的坑（#127）：项目命令不要跟 Claude Code 自带的命令重名，重名时启动会报警告。所以提交部署一条龙叫 `/deploy` 不叫 `/ship`
（自带的 `/ship` 只建 PR、盯 CI，不合并也不部署）。加新命令时在 `.claude/skills/<名字>/SKILL.md` 里写 `name`、`description`（Claude 靠它判断什么时候自动用）
和 `argument-hint`，正文里用 `$ARGUMENTS` 接参数，再补进上面这张表。

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

| Tripo CLI（`tripo`） | 0.11.2 | AI 从图片 / 文字生成 3D 底模（#72），`setup.sh` 用 npm 全局安装；要登录，见下面"Tripo" |

## Tripo

用来生成模型底模，流程和规约见 `art-sources.md` 的"用 Tripo 生成底模"，Claude 的操作步骤见 `/tripo` skill（#72）。

- 安装：`npm install -g tripo-cli`（官方仓库 [vast-enterprise/Tripo-API-CLI](https://github.com/vast-enterprise/Tripo-API-CLI)），装在 nvm 的 node 下。
- 登录（负责人做，key 不经过聊天）：在 Claude Code 里输入 `! tripo login --region ov`，浏览器授权后 key 自动存到 `~/.tripo/config.json`。
  现在登录的是负责人的**国际站**账号（`ov`，控制台 developers.tripo3d.ai）。换开发机要重新登录。
- 检查：`tripo whoami`（账号和余额）、`tripo balance`、`tripo usage`（最近花了多少）、`tripo doctor`（排查登录和网络）。
- 充值：`tripo topup` 打开充值页（负责人做）。
- 文档：`tripo docs --llm`（给 AI 看的完整规则），`tripo docs --topic commands/generate`（模型版本、参数、价格）。
- 在哪个目录跑 `tripo`，就在那里写一个 `.tripo/context.json`（记上一个任务号，`@last` 用），已 gitignore。
- 这个 CLI 默认会把用量统计（命令名、任务号、花了多少积分）发给 Tripo，不发提示词、图片和模型；不想发就设 `TRIPO_ANALYTICS_ENABLED=0`。

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

- `assets-src/`：未压缩的母版和加工脚本，不发布。所有加工都从这里开始。目录和 `assets/` 一一对应（#105），
  体积大的原始下载和能重新生成的中间母版只在开发机上（`.gitignore` 里列着），其余进 git。
- `assets/`：压缩后的结果，**整个目录都会发布到线上**，由母版生成。还没接进游戏的模型不要放这里。
- 现在有哪些资源、各在哪、怎么来的：`art-sources.md` 的"现有资源"。

Blender 读不了 meshopt 压缩过的文件，所以母版不能省。Blender 地图工具要显示游戏里的道具，用 `tools/mapkit/decode-props.mjs` 把压缩过的 glb 还原（#115，`blender-maps.md`）。

开发机没有显示器，要看 Blender 的真实界面（侧栏面板）用虚拟显示器：`xvfb-run -a -s "-screen 0 1600x1000x24" blender --enable-event-simulate --python …`，
截图用 ImageMagick 的 `import -window root`（Blender 自己的截图在软件渲染下是黑的），例子见 `tools/mapkit/shot_ui.py`。

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
blender -b --python assets-src/sound/build.py         # 重新剪音效（切点在脚本的 CLIPS 里），输出到 assets/sound/
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

## Mac mini（真 GPU 的执行机）

负责人租的 Mac mini，通过 tailscale 用 `ssh macmini` 登录（开发机的 `~/.ssh/config` 里配好了 IP 和账号 `super-agent`）（#125）。
开发机没有 GPU，要真 GPU 跑浏览器或 Blender 时，用 `tools/mac.sh` 把仓库同步过去在那边跑，输出拷回 `tools/out/mac/`：

```bash
tools/mac.sh setup                        # 首次：同步并安装（tools/setup-mac.sh），可重复执行
tools/mac.sh node tools/verify.mjs        # verify，WebGL 走 Metal
tools/mac.sh node tools/tests/sniper.mjs  # 测试脚本
tools/mac.sh blender -b --version
tools/mac.sh sync                         # 只同步
```

- 机器：Apple M4（10 核 CPU / 10 核 GPU，Metal 4），16 GB 内存，macOS 26。无头 Chromium 的 WebGL 渲染器是 `ANGLE Metal Renderer: Apple M4`。
- **实测对比**（`verify`，1280x720）：开发机 SwiftShader 启动 13 秒、0.3 ~ 0.7 帧、整个 verify 2 分半；Mac 启动 1.2 秒、54 ~ 60 帧、半分钟。
  `asset-cache` 测试 27 秒。Mac 上的帧率是这台 M4 的数字，用来比较改动前后，不代表玩家的电脑。
- Blender 能用 Metal GPU（`Apple M4 (GPU - 10 cores)`），Cycles 渲染预览图可以选 METAL。
- `tools/lib/game-page.mjs` 的 `GL_ARGS` 按平台选 WebGL 参数：macOS 用 `--use-angle=metal`，开发机用 SwiftShader。自己起 Chromium 的测试也用它。
- 装了什么：node、Playwright Chromium（`tools/node_modules` 和 `~/Library/Caches/ms-playwright`）、Blender（`~/Applications/Blender-5.2.3.app`，`~/.local/bin/blender`）。
  全部在 `super-agent` 自己的目录，不用 sudo，不用机器上的 Homebrew 和 `/usr/local/bin/node`：那是出租方账号装的。
- **只同步 git 管的文件**（`git ls-files -co --exclude-standard`，含没提交的改动）。`refer/`、本地母版这些 gitignore 掉的不上传，
  要用 Blender 处理这些母版的活还是在开发机上做。Mac 上不放部署密钥和 GitHub 令牌：机器上有出租方的管理员账号。

坑：

- **网络慢。** Mac 在国内，开发机 → Mac 只有约 100 KB/s，首次同步整个仓库（约 95 MB）要十几分钟，之后只传改动的文件；
  在 Mac 上直连 GitHub 约 20 KB/s，所以不在 Mac 上 `git clone`。下载 node / Blender / Chromium 走国内镜像（npmmirror、阿里云），
  校验值仍然从官方取，见 `setup-mac.sh` 开头。
- **Mac 上没有 ImageMagick**：`verify.mjs` 的缩略图在 macOS 上改用系统自带的 `sips`。别的工具脚本如果调 `magick` 在 Mac 上会失败，需要时同样加平台判断。
- **`blender` 是启动脚本，不是软链接。** Blender 按自己的路径找 App 包里的 Python，软链接启动会报 `No module named 'encodings'`。
- **rsync 要加 `--protocol=29`。** macOS 自带的是 openrsync，和开发机的 rsync 3.x 用默认协议握手会卡死不动。
- 同一时间只跑一个 `mac.sh`：两个 rsync 同时往 Mac 传，有一个会被断掉。

## 这台机器的限制

开发机是 GCP 实例：4 核 32G，x86_64，无 GPU、无显示器。

- **没有 GPU。** WebGL 靠 SwiftShader 软件渲染，帧率只有个位数，启动可达 40 秒，这些都不代表玩家体验。要真 GPU 用上面的 Mac mini；手感和玩家显示器上的帧率靠开发者模式录数据（`devmode.md`）。
- **指针锁定没有真实测试。** 工具直接把 `game.input.locked` 设为真。
- **Ubuntu 26.10** 不在 Playwright 官方支持列表里，目前实测能用，升级 Playwright 后要留意。
- `npm audit` 有 4 个中等级别提示，来自 gltf-transform CLI 的依赖（minimatch）。工具只在本地运行，不会发布到线上。
