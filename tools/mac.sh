#!/usr/bin/env bash
# 在 Mac mini（Apple M4，真 GPU）上跑工具（#125）：把仓库同步过去 → 在那边执行命令 → 把 tools/out/ 拷回本机的 tools/out/mac/。
#   tools/mac.sh setup                        首次：同步并安装工具链（tools/setup-mac.sh）
#   tools/mac.sh node tools/verify.mjs        在 Mac 上跑 verify（WebGL 走 Metal）
#   tools/mac.sh node tools/tests/xxx.mjs     跑测试脚本
#   tools/mac.sh blender -b --version         Blender 也装在那边
#   tools/mac.sh sync                         只同步
# 只同步 git 管的文件（含未提交的改动），gitignore 掉的不上传：refer/、本地母版、密钥都不会出现在 Mac 上。
# 那台机器上有出租方的管理员账号，所以 Mac 上只放公开仓库的代码，不放部署密钥和 GitHub 令牌。
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${MAC_HOST:-macmini}   # 备用机：MAC_HOST=mac-gpu（docs/tools.md）
DIR=direct-strike            # Mac 上的目录，相对 home

[ $# -ge 1 ] || { sed -n '2,9p' "$0"; exit 1; }

# macOS 自带的是 openrsync（协议 29），开发机的 rsync 3.x 默认协议和它握手会卡死，要指定 --protocol=29。
# 资源清单 assets/manifest.json 被 gitignore，不用传：game-page.mjs 起服务时现算
git ls-files -co --exclude-standard | rsync -a --protocol=29 --files-from=- . "$HOST:$DIR/"
[ "$1" = sync ] && exit 0
[ "$1" = setup ] && set -- bash tools/setup-mac.sh

rc=0
ssh "$HOST" "cd ~/$DIR && $(printf '%q ' "$@")" || rc=$?
mkdir -p tools/out/mac
rsync -a --protocol=29 "$HOST:$DIR/tools/out/" tools/out/mac/ 2>/dev/null || true
exit $rc
