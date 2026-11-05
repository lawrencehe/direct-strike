#!/usr/bin/env bash
# 运行 rig.py（Blender 无头模式）。Blender 的日志写到 tools/out/rig.log，只显示结果行。
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$here/out"
# Blender 的 glTF 导入器不支持 meshopt，会读到错误的骨骼数据却不报错，所以这里先拦下
for f in "$@"; do
  case "$f" in *.glb)
    if [ -f "$f" ] && grep -aq EXT_meshopt_compression "$f"; then
      echo "错误: $f 是 meshopt 压缩过的，Blender 读不了。请用 assets-src/ 里未压缩的母版。" >&2; exit 2
    fi ;;
  esac
done
blender -b --python-exit-code 1 -P "$here/rig.py" -- "$@" >"$here/out/rig.log" 2>&1; rc=$?
grep -E '^(RESULT|WARN|ERROR):' "$here/out/rig.log" | sed -E 's/^RESULT: //'
[ $rc -eq 0 ] || { echo "失败（退出码 $rc），日志末尾："; tail -15 "$here/out/rig.log"; }
exit $rc
