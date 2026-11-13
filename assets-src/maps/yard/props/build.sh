#!/usr/bin/env bash
# yard 地图道具：Blender 建模烘焙 → 压缩进 assets/maps/yard/props/（#50）
# 用法：assets-src/maps/yard/props/build.sh [container jersey sandbag platform crate drum]（不写就全做）
#   container、jersey 是纯 Blender 建模，脚本在本目录
#   sandbag 是沙袋墙：Tripo 出单个袋子，assets-src/models/map/sandbag/build.py 拼墙、烘贴图（#98）
#   platform 是中央战术平台：Tripo 底模，修整脚本在 assets-src/models/map/central-platform/build.py
#   crate 是弹药箱：Tripo 底模，修整脚本在 assets-src/models/map/ammo-crate/build.py
#   drum 是油桶：Tripo 底模，修整脚本在 assets-src/models/map/steel-drum/build.py（#98）
#   调试时 TEX=512 assets-src/maps/yard/props/build.sh container 跑得快
set -euo pipefail
cd "$(dirname "$0")/../../../.."
OUT=tools/out/props
DST=assets/maps/yard/props
mkdir -p "$DST"
for p in ${@:-container jersey sandbag platform crate drum}; do
  if [ "$p" = sandbag ]; then
    blender -b --factory-startup --python assets-src/models/map/sandbag/build.py 2>&1 | grep -E "烘焙|PART|DROP|WROTE|Error|Traceback" || true
    [ -f "$OUT/sandbag-tripo.glb" ] || { echo "✗ sandbag 没有导出"; exit 1; }
    rm -f "$DST/sandbag.glb"
    node tools/glb.mjs optimize "$OUT/sandbag-tripo.glb" "$DST/sandbag.glb" --texture-size "${TEX:-1024}"
    continue
  fi
  if [ "$p" = drum ]; then
    blender -b --factory-startup --python assets-src/models/map/steel-drum/build.py 2>&1 | grep -E "PART|WROTE|Error|Traceback" || true
    rm -f "$DST/steel-drum.glb"
    node tools/glb.mjs optimize assets-src/models/map/steel-drum/steel-drum.glb "$DST/steel-drum.glb" --texture-size 1024
    continue
  fi
  if [ "$p" = platform ]; then
    blender -b --factory-startup --python assets-src/models/map/central-platform/build.py 2>&1 | grep -E "PART|DROP|WROTE|Error|Traceback" || true
    rm -f "$DST/central-platform.glb"
    node tools/glb.mjs optimize assets-src/models/map/central-platform/central-platform.glb "$DST/central-platform.glb" --texture-size 2048
    continue
  fi
  if [ "$p" = crate ]; then
    blender -b --factory-startup --python assets-src/models/map/ammo-crate/build.py 2>&1 | grep -E "PART|DROP|WROTE|Error|Traceback" || true
    rm -f "$DST/ammo-crate.glb"
    node tools/glb.mjs optimize assets-src/models/map/ammo-crate/ammo-crate.glb "$DST/ammo-crate.glb" --texture-size 2048
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
