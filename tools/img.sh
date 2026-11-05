#!/usr/bin/env bash
# 图片处理。每条命令只输出一行“前 → 后”。默认不覆盖原图，输出到新文件。
#   img.sh png    输入.png [输出.png]            有损量化 + 无损优化（UI、图标首选）
#   img.sh lossless 输入.png [输出.png]          只做无损优化
#   img.sh webp   输入 [输出.webp] [质量=80]     转 WebP（支持透明）
#   img.sh resize 输入 尺寸 输出                 缩放，尺寸如 512x512（保持比例、只缩不放）
#   img.sh crop   输入 宽x高+X+Y 输出            裁切
#   img.sh svg    输入.svg 宽度 输出.png         SVG 转 PNG
#   img.sh info   文件...                        查看格式、尺寸、体积
set -euo pipefail
die() { echo "错误: $*" >&2; exit 2; }
size() { stat -c %s "$1"; }
kb() { awk -v n="$1" 'BEGIN { printf "%.1fKB", n / 1024 }'; }
report() {
  local a b; a=$(size "$1"); b=$(size "$2")
  echo "$2: $(kb "$a") → $(kb "$b")（$(magick identify -format '%wx%h' "$2[0]")）"
}
cmd="${1:-}"; [ $# -ge 2 ] || die "用法见文件开头"; in="$2"
if [ "$cmd" != info ]; then [ -f "$in" ] || die "找不到 $in"; fi
case "$cmd" in
  png)
    out="${3:-${in%.*}.opt.png}"; [ "$in" != "$out" ] || die "输出不能和输入同名"
    # 99 = 达不到质量下限，放弃有损压缩，退回原图再做无损优化
    pngquant --force --skip-if-larger --quality=65-90 --output "$out" -- "$in" || { rc=$?; [ $rc -eq 98 ] || [ $rc -eq 99 ] || exit $rc; cp "$in" "$out"; }
    oxipng -q -o 4 --strip safe "$out"; report "$in" "$out" ;;
  lossless)
    out="${3:-${in%.*}.opt.png}"; [ "$in" != "$out" ] || die "输出不能和输入同名"
    cp "$in" "$out"; oxipng -q -o 4 --strip safe "$out"; report "$in" "$out" ;;
  webp)
    out="${3:-${in%.*}.webp}"; cwebp -quiet -q "${4:-80}" -alpha_q 90 "$in" -o "$out"; report "$in" "$out" ;;
  resize)
    [ $# -eq 4 ] || die "resize 需要：输入 尺寸 输出"; magick "$in" -resize "$3>" "$4"; report "$in" "$4" ;;
  crop)
    [ $# -eq 4 ] || die "crop 需要：输入 宽x高+X+Y 输出"; magick "$in" -crop "$3" +repage "$4"; report "$in" "$4" ;;
  svg)
    [ $# -eq 4 ] || die "svg 需要：输入.svg 宽度 输出.png"; rsvg-convert -w "$3" -o "$4" "$in"; report "$in" "$4" ;;
  info)
    shift; for f in "$@"; do magick identify -format "$f: %m %wx%h " "$f[0]"; kb "$(size "$f")"; echo; done ;;
  *) die "未知命令 $cmd" ;;
esac
