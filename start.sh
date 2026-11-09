#!/usr/bin/env bash
# 启动本地服务并打开游戏。
# 为什么需要它：浏览器不允许 file:// 页面加载 .glb 模型文件，必须通过 http 访问。
# 用的是 server/api.py：出静态文件，同时提供开发者模式的接口（/api/），和线上一样。
# 有 ~/direct-strike-data/api.env 就读它的密码（和线上同一个），没有时本地开发者模式的密码是 dev。
cd "$(dirname "$0")"
PORT="${1:-8000}"
URL="http://localhost:$PORT"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

ENV_FILE="$HOME/direct-strike-data/api.env"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

# 尝试自动打开浏览器（Linux / macOS / WSL）
( sleep 1; xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || cmd.exe /c start "$URL" 2>/dev/null ) &

echo "游戏地址：$URL   （Ctrl+C 停止）"
exec "$PY" server/api.py --static . --bind 127.0.0.1 --port "$PORT"
