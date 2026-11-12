---
name: tripo
description: 用 Tripo CLI 从参考图或文字生成 3D 底模，再交给 Blender 修整。负责人给了参考图要"生成模型 / 出底模"、提到 Tripo、或找不到合适的现成模型时用。花积分前必须报价并等负责人同意。
---

# Tripo 生成底模

规约见 `docs/art-sources.md` 的"四、用 Tripo 生成底模"，安装登录见 `docs/tools.md` 的"Tripo"（#72）。
完整的 CLI 规则：`tripo docs --llm`；模型、参数、价格：`tripo docs --topic commands/generate`。

## 铁律

- **只出底模**：生成结果不直接进 `assets/`，必须走 Blender 修整 → 预览图 → 负责人确认 → `/glb` 压缩 → 登记 `LICENSES.md`。
- **花积分前先报价**：先 `--dry-run --json`（不花钱），把命令、模型、预计积分告诉负责人，同意了再跑。
  `tripo redo`、`tripo make @last --then ...`、`tripo model texture` 都是新的花费，同样先问。
- 退出码 4（积分不够）立刻停，告诉负责人 `tripo topup`，不换模型、不换参数重试。退出码 7（网络）先 `tripo balance` 和 `tripo task list` 查是不是已经提交了，不重复提交。
- 不拿别的游戏截图、别人的模型渲染图生成（等于照搬别人作品）。参考图来自 `refer/` 或负责人给的链接。
- 登录是负责人的事：没登录（退出码 3）就请负责人输入 `! tripo login --region ov`，不要让人把 key 贴进聊天。

## 步骤

```bash
export TRIPO_CLIENT_APP=claude          # 每条命令都带上（CLI 要求如实标注调用方）
tripo whoami                            # 确认登录和余额

# 1. 报价（不花积分）。底模一般用 H3.1：便宜（20–50 积分），反正要在 Blender 里减面换材质
NAME=container-40ft
OUT=assets-src/models/map/$NAME/tripo
tripo make refer/<图>.jpg --model H3.1 -p pbr=true -p face_limit=20000 \
  -o "$OUT" --name "$NAME" --dry-run --json
#   多视角：tripo make 正面.jpg 侧面.jpg 背面.jpg ...（2–4 张，同一物体）
#   只有文字：tripo make "a rusty 40ft shipping container, battle damaged" ...
#   要干净拓扑（四边面）用 --model P2 -p quad=true（100–130 积分，输出 FBX）

# 2. 负责人同意后去掉 --dry-run 执行（阻塞，等它结束；不要自己加短于 15 分钟的超时）
tripo make ... --json --yes

# 3. 看 $OUT 里的 preview.png，再用项目工具看模型
node tools/glb.mjs info "$OUT"/model.glb
node tools/glb-view.mjs preview "$OUT"/model.glb --out tools/out/tripo-$NAME.jpg
```

输出目录里有 `model.glb`、`preview.png`、`task.json`，原样保留并进 git（花钱生成的，丢了不能免费重来），再拷一份用到的参考图进去。

## 修整（Blender，见 `/rig` 和 `assets-src/models/gun/ak47.py` 的写法）

在 `assets-src/models/<类>/<名字>/build.py` 里写加工脚本，`blender -b --python` 跑，可重复生成：
1. 导入 `tripo/model.glb`，按真实尺寸缩放（米），转到和同类模型一致的朝向，原点放底面中心（落地物体）。
2. 删掉悬空碎片、补洞，Decimate 减面（近处道具几千面，远景几百面）。
3. 材质：生成的贴图能用就留（转 WebP），烘进去的光影太重、太糊就换 Poly Haven / ambientCG 的 PBR 材质。
4. 渲染预览图给负责人看；确认后导出 glb，`/glb` 压缩到 `assets/`，`/verify`。
5. `assets/LICENSES.md` 照"Tripo 生成的模型"一节登记（模型版本、任务号、改动）。

碰撞盒仍然用地图 json 的尺寸，不用生成的网格。
