#!/usr/bin/env bash
# 发布到 https://game.lightup.host
# 做三件事：1) 把站点文件同步到独立目录（不带 .git / refer / tools / assets-src / server / 部署脚本）；
# 2) 把开发接口 server/ 同步到它自己的目录；3) 确保容器在跑，配置或接口代码变了就重载 / 重启。
# 改完代码想上线，跑一遍这个脚本就行。静态文件 rsync 完立刻生效，不用重启。
set -euo pipefail
cd "$(dirname "$0")"
SITE=/home/donkey/fps-site
API=/home/donkey/fps-api
DATA=/home/donkey/direct-strike-data

rsync -a --delete \
  --exclude .git --exclude .gitignore --exclude refer \
  --exclude deploy --exclude deploy.sh --exclude 'start.*' --exclude server \
  --exclude docs --exclude .claude --exclude CLAUDE.md --exclude tools --exclude assets-src \
  ./ "$SITE/"

# 开发接口要的密码文件和数据目录（首次部署时生成密码，之后不动）
mkdir -p "$DATA/devlogs" "$API"
if [ ! -f "$DATA/api.env" ]; then
  umask 077
  printf 'DEV_PASSWORD=%s\nAPI_SECRET=%s\nDATA_QUOTA_GB=10\n' \
    "$(head -c 9 /dev/urandom | base64 | tr '+/' 'xy')" "$(head -c 32 /dev/urandom | base64 | tr -d '\n')" > "$DATA/api.env"
  echo "已生成开发者模式密码：$DATA/api.env"
fi
api_changed=$(rsync -a --delete --itemize-changes server/ "$API/" | grep -c '^>f' || true)

docker compose -f deploy/compose.yaml up -d
[ "$api_changed" -gt 0 ] && docker restart fps-api >/dev/null && echo "开发接口已重启"
# Caddyfile 是单文件挂载：git 切分支会换掉文件，容器里看到的还是旧的，这时要重建 fps-game（一两秒）；
# 文件是同一个时，容器里能看到新内容，但正在跑的 Caddy 不会自己重读，所以每次都平滑重载一下（不中断）。
# 只动本项目的 fps-game，relay 的 Caddy 不碰
if ! docker exec fps-game cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - deploy/Caddyfile; then
  docker compose -f deploy/compose.yaml up -d --force-recreate game >/dev/null 2>&1 && echo "fps-game 已按新 Caddyfile 重建"
else
  docker exec fps-game caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || echo "警告：fps-game 的 Caddy 重载失败"
fi
echo "已发布：https://game.lightup.host"
