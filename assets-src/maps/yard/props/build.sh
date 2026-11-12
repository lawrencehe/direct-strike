#!/usr/bin/env bash
# yard 地图道具：Blender 建模烘焙 → 压缩进 assets/maps/yard/props/（#50）
# 用法：assets-src/maps/yard/props/build.sh [container jersey sandbag platform]（不写就全做）
#   platform 是中央战术平台：Tripo 底模，修整脚本在 assets-src/models/map/central-platform/build.py
#   调试时 TEX=512 assets-src/maps/yard/props/build.sh container 跑得快
set -euo pipefail
cd "$(dirname "$0")/../../../.."
OUT=tools/out/props
DST=assets/maps/yard/props
mkdir -p "$DST"
for p in ${@:-container jersey sandbag platform}; do
  if [ "$p" = platform ]; then
    blender -b --factory-startup --python assets-src/models/map/central-platform/build.py 2>&1 | grep -E "PART|DROP|WROTE|Error|Traceback" || true
    rm -f "$DST/central-platform.glb"
    node tools/glb.mjs optimize assets-src/models/map/central-platform/central-platform.glb "$DST/central-platform.glb" --texture-size 2048
    continue
  fi
  blender -b --factory-startup --python "assets-src/maps/yard/props/$p.py" 2>&1 | grep -E "烘焙|导出|三角形|Error|Traceback|File \"" || true
  [ -f "$OUT/$p.glb" ] || { echo "✗ $p 没有导出"; exit 1; }
  rm -f "$DST/$p.glb"
  node tools/glb.mjs optimize "$OUT/$p.glb" "$DST/$p.glb" --texture-size "${TEX:-2048}"
done
# 集装箱的其他颜色：颜色贴图单独放，游戏里按颜色换
for f in "$OUT"/container_*_diff.png; do
  [ -e "$f" ] || continue
  magick "$f" -quality 85 "$DST/$(basename "${f%.png}").webp"
done
ls -la "$DST"
