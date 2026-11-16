#!/usr/bin/env bash
# 打包 Blender 地图工具（#115）：插件代码 + 还原过的道具模型 + 游戏的地图文件 → 一个 zip，在 Blender 里"从磁盘安装"。
# 用法：tools/mapkit/build.sh [输出目录]        默认 tools/out/mapkit/
# 部署时 deploy.sh 会打包到站点的 mapkit/ 下（https://game.lightup.host/mapkit/），版本号跟着游戏走
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=$(realpath -m "${1:-tools/out/mapkit}")
VER=$(head -1 README.md | grep -oE 'v[0-9]+\.[0-9]+' | tr -d v)
STAGE=tools/out/mapkit-stage
rm -rf "$STAGE"
mkdir -p "$STAGE/maps" "$OUT"
cp tools/mapkit/ds_mapkit/*.py "$STAGE/"
sed "s/^version = .*/version = \"$VER.0\"/" tools/mapkit/ds_mapkit/blender_manifest.toml > "$STAGE/blender_manifest.toml"
for m in maps/*.json; do
  cp "$m" "$STAGE/maps/"
  node tools/mapkit/decode-props.mjs "$m" "$STAGE/assets" > /dev/null
done
rm -f "$OUT/ds_mapkit.zip"
(cd "$STAGE" && zip -qr -X "$OUT/ds_mapkit.zip" .)
printf '{"version": "%s", "bytes": %s}\n' "$VER" "$(stat -c %s "$OUT/ds_mapkit.zip")" > "$OUT/ds_mapkit.json"
echo "Blender 地图工具 v$VER：$OUT/ds_mapkit.zip（$(du -h "$OUT/ds_mapkit.zip" | cut -f1)）"
