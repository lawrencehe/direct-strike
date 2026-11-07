#!/usr/bin/env bash
# 乌克兰士兵 NPC 模型的加工流程（从原始下载重新生成）：
#   1. turn.py：模型原本面朝反方向，绕竖轴转 180°，删掉自带的空动画
#   2. rig.sh add-anim：从 init_soldier.glb 移植 Idle / Walk / Run（同为 Mixamo 骨骼）。
#      脖子的静止姿态差 17°（体型不同），所以加 --force；看过预览图，动作正常
#   3. fixmat.mjs：Opacity 贴图合进颜色贴图的 alpha，BLEND 改 MASK，法线强度 0 改 1
#   4. glb.mjs optimize：贴图缩到 1024 转 WebP，网格 meshopt 压缩
# 用法：在仓库根目录运行 assets-src/models/human/ukrainian-soldier/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../../.."
H=assets-src/models/human; S=$H/ukrainian-soldier; O=tools/out/ua; mkdir -p $O
blender -b --python-exit-code 1 -P $S/turn.py -- $H/ukrainian-soldier-download.glb $O/0.glb > $O/turn.log 2>&1
tools/rig.sh add-anim $O/0.glb $H/init_soldier.glb --name Idle --clip Idle --force -o $O/1.glb
tools/rig.sh add-anim $O/1.glb $H/init_soldier.glb --name Walk --clip Walk --force -o $O/2.glb
tools/rig.sh add-anim $O/2.glb $H/init_soldier.glb --name Run --clip Run --force -o $O/3.glb
cp $S/fixmat.mjs tools/out/_fixmat.mjs   # 放到 tools/ 下才能找到 tools/node_modules
node tools/out/_fixmat.mjs $O/3.glb $H/ukrainian-soldier.glb $S/textures
rm -f assets/models/human/ukrainian-soldier.glb
node tools/glb.mjs optimize $H/ukrainian-soldier.glb assets/models/human/ukrainian-soldier.glb --texture-size 1024
