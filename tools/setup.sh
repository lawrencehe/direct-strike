#!/usr/bin/env bash
# 安装本地工具链（x86_64 Linux）。可重复执行，已安装的会跳过。
set -euo pipefail
cd "$(dirname "$0")"
OXIPNG=10.2.1
OXIPNG_SHA=1813750ef592c5350ca79c88f98b2c0876d05c826dc7156245256d4255c1ad17
BLENDER=5.2.3
mkdir -p ~/.local/bin ~/.local/opt

sudo apt-get install -y -qq pngquant webp imagemagick librsvg2-bin

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if ! command -v oxipng >/dev/null; then
  f=oxipng-$OXIPNG-x86_64-unknown-linux-musl.tar.gz
  curl -fsSL -o "$tmp/$f" "https://github.com/oxipng/oxipng/releases/download/v$OXIPNG/$f"
  echo "$OXIPNG_SHA  $tmp/$f" | sha256sum -c -
  tar xzf "$tmp/$f" -C "$tmp"
  install -m755 "$tmp"/oxipng-*/oxipng ~/.local/bin/oxipng
fi

if ! command -v blender >/dev/null; then
  base=https://download.blender.org/release/Blender${BLENDER%.*}
  f=blender-$BLENDER-linux-x64.tar.xz
  curl -fsSL -o "$tmp/$f" "$base/$f"
  curl -fsSL -o "$tmp/sums" "$base/blender-$BLENDER.sha256"
  (cd "$tmp" && grep " $f\$" sums | sha256sum -c -)
  tar xJf "$tmp/$f" -C ~/.local/opt
  ln -sfn ~/.local/opt/blender-$BLENDER-linux-x64/blender ~/.local/bin/blender
fi

npm ci
npx playwright install --with-deps chromium

# Tripo CLI（AI 生成底模，#72）：装完还要负责人登录，见 docs/tools.md 的"Tripo"
command -v tripo >/dev/null || npm install -g tripo-cli@0.11.2
echo "完成。确认 ~/.local/bin 在 PATH 里。"
