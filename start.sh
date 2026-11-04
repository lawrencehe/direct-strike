#!/usr/bin/env bash
# 启动本地服务并打开游戏。
# 为什么需要它：浏览器不允许 file:// 页面加载 .glb 模型文件，必须通过 http 访问。
cd "$(dirname "$0")"
PORT="${1:-8000}"
URL="http://localhost:$PORT"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

# 尝试自动打开浏览器（Linux / macOS / WSL）
( sleep 1; xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || cmd.exe /c start "$URL" 2>/dev/null ) &

echo "游戏地址：$URL   （Ctrl+C 停止）"
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
