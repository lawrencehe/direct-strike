#!/usr/bin/env bash
# 发布到 https://game.lightup.host
# 做两件事：1) 把代码同步到独立目录（不带 .git / refer / 部署脚本）；2) 确保站点容器在跑。
# 改完代码想上线，跑一遍这个脚本就行。容器已经在跑的话 rsync 完立刻生效，不用重启。
set -euo pipefail
cd "$(dirname "$0")"
SITE=/home/donkey/fps-site

rsync -a --delete \
  --exclude .git --exclude .gitignore --exclude refer \
  --exclude deploy --exclude deploy.sh --exclude 'start.*' \
  --exclude docs --exclude .claude --exclude CLAUDE.md \
  ./ "$SITE/"

docker compose -f deploy/compose.yaml up -d
echo "已发布：https://game.lightup.host"
