#!/usr/bin/env bash
# 安装 Mac mini（Apple Silicon）上的工具链（#125）。可重复执行，已安装的会跳过。
# 全部装在当前用户的 ~/.local 下，不用 sudo、不用 Homebrew：机器上的 Homebrew 和 /usr/local 是出租方的，不去动。
# 一般不直接跑，由开发机上的 tools/mac.sh setup 同步仓库后调用。
# 这台 Mac 在国内，直连 nodejs.org / blender.org / Playwright CDN 只有几十到几百 KB/s，所以大文件走国内镜像（实测 10 ~ 30 MB/s），
# 校验值仍从官方站点取（文件小，慢也无所谓），镜像给的包对不上就失败。npm 官方源实测 2 MB/s，不用换。
set -euo pipefail
cd "$(dirname "$0")"
NODE=26.13.0       # 和开发机一致
BLENDER=5.2.3      # 和 tools/setup.sh 一致
NODE_MIRROR=https://cdn.npmmirror.com/binaries/node
BLENDER_MIRROR=https://mirrors.aliyun.com/blender/release
# Playwright 的浏览器：npmmirror 的路径和官方 CDN 一样（builds/cft/<版本>/…）
export PLAYWRIGHT_DOWNLOAD_HOST=${PLAYWRIGHT_DOWNLOAD_HOST:-https://cdn.npmmirror.com/binaries/playwright}
mkdir -p ~/.local/bin ~/.local/opt ~/Applications
export PATH="$HOME/.local/bin:$PATH"

# 非交互 SSH 的 zsh 只读 ~/.zshenv，PATH 写在这里
grep -qs '.local/bin' ~/.zshenv || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if [ "$(node -v 2>/dev/null)" != "v$NODE" ] || [ "$(command -v node)" != "$HOME/.local/bin/node" ]; then
  f=node-v$NODE-darwin-arm64.tar.xz
  curl -fsSL -o "$tmp/$f" "$NODE_MIRROR/v$NODE/$f"
  curl -fsSL -o "$tmp/sums" "https://nodejs.org/dist/v$NODE/SHASUMS256.txt"
  (cd "$tmp" && grep " $f\$" sums | shasum -a 256 -c -)
  tar xJf "$tmp/$f" -C ~/.local/opt
  for b in node npm npx; do ln -sfn ~/.local/opt/node-v$NODE-darwin-arm64/bin/$b ~/.local/bin/$b; done
fi

app=~/Applications/Blender-$BLENDER.app
if [ ! -x "$app/Contents/MacOS/Blender" ]; then
  f=blender-$BLENDER-macos-arm64.dmg
  curl -fsSL -o "$tmp/$f" "$BLENDER_MIRROR/Blender${BLENDER%.*}/$f"
  curl -fsSL -o "$tmp/sums" "https://download.blender.org/release/Blender${BLENDER%.*}/blender-$BLENDER.sha256"
  (cd "$tmp" && grep " $f\$" sums | shasum -a 256 -c -)
  hdiutil attach -nobrowse -readonly -mountpoint "$tmp/mnt" "$tmp/$f" >/dev/null
  cp -R "$tmp/mnt/Blender.app" "$app"
  hdiutil detach "$tmp/mnt" >/dev/null
fi
# 不能用软链接：Blender 按自己的路径找包里的 Python，经软链接启动会报找不到 encodings
rm -f ~/.local/bin/blender
printf '#!/bin/sh\nexec "%s/Contents/MacOS/Blender" "$@"\n' "$app" > ~/.local/bin/blender
chmod +x ~/.local/bin/blender

npm ci --no-audit --no-fund
npx playwright install chromium
echo "完成：node $(node -v)，$(blender -b --version 2>/dev/null | head -1)"
