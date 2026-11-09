@echo off
rem 启动本地服务并打开游戏（Windows）。浏览器不允许 file:// 页面加载 .glb 模型，必须通过 http 访问。
rem 用 server/api.py：出静态文件，同时提供开发者模式的接口（本地密码 dev）。
cd /d "%~dp0"
set PORT=8000
start "" "http://localhost:%PORT%"
echo 游戏地址：http://localhost:%PORT%   （关闭此窗口即停止）
python server\api.py --static . --bind 127.0.0.1 --port %PORT%
