#!/usr/bin/env bash
# 安装 / 管理自动任务的 systemd 用户定时器（每 30 分钟跑一次 tools/autopilot/autopilot.sh）。说明见 docs/autopilot.md。
#
#   tools/autopilot/install.sh            安装并启动
#   tools/autopilot/install.sh pause      暂停（定时器照跑，但脚本什么都不做）
#   tools/autopilot/install.sh resume     恢复
#   tools/autopilot/install.sh status     看定时器、最近日志
#   tools/autopilot/install.sh uninstall  停掉并删除定时器
set -euo pipefail
REPO_DIR=${AUTOPILOT_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}   # 从别的 worktree 装时用 AUTOPILOT_REPO 指向主仓库目录
UNIT=direct-strike-autopilot
DIR=$HOME/.config/systemd/user
STATE=$HOME/.local/state/direct-strike-autopilot
INTERVAL=${AUTOPILOT_INTERVAL:-30min}

case "${1:-install}" in
  pause)   mkdir -p "$STATE"; touch "$STATE/paused"; echo "已暂停（tools/autopilot/install.sh resume 恢复）"; exit 0 ;;
  resume)  rm -f "$STATE/paused"; echo "已恢复"; exit 0 ;;
  status)
    systemctl --user list-timers "$UNIT.timer" --no-pager || true
    [ -f "$STATE/paused" ] && echo "（暂停中）"
    tail -n 20 "$STATE/logs/autopilot.log" 2>/dev/null || echo "还没有日志"
    exit 0 ;;
  uninstall)
    systemctl --user disable --now "$UNIT.timer" 2>/dev/null || true
    rm -f "$DIR/$UNIT.service" "$DIR/$UNIT.timer"; systemctl --user daemon-reload
    echo "已删除定时器（worktree 和日志留着：$STATE）"; exit 0 ;;
  install) ;;
  *) echo "未知参数：$1"; exit 2 ;;
esac

# 服务里没有登录 shell 的 PATH，把 claude、node、gh 所在目录写进去
P=""
for b in claude node gh docker rsync git jq envsubst flock; do
  d=$(dirname "$(command -v "$b")") || { echo "找不到 $b"; exit 1; }
  case ":$P:" in *":$d:"*) ;; *) P="$P:$d" ;; esac
done
P="${P#:}:/usr/bin:/bin"

# 启动器：每次从 origin/main 取 autopilot.sh、prompt.md、ship.sh 到 $STATE/run/ 再跑。
# ship.sh 也取 main 的：功能分支是从旧的 main 开出来的，分支上的 ship.sh 可能是有毛病的旧版本（#31）。
# 不直接跑工作目录里的脚本：手动会话和自动任务都会切分支，bash 边读边执行，文件中途被换掉会出错；
# 也保证跑的是已经合并的版本。写临时文件再 mv（原子替换），正在跑的上一轮不受影响。
mkdir -p "$DIR" "$STATE/run"
cat > "$STATE/run/launch.sh" <<'LAUNCH'
#!/usr/bin/env bash
set -euo pipefail
RUN=$(dirname "$0")
cd "$AUTOPILOT_REPO"
git fetch -q origin main
for f in tools/autopilot/autopilot.sh tools/autopilot/prompt.md tools/ship.sh; do
  b=$(basename "$f")
  git show "origin/main:$f" > "$RUN/.$b.tmp" && mv "$RUN/.$b.tmp" "$RUN/$b"
done
chmod +x "$RUN/autopilot.sh" "$RUN/ship.sh"
AUTOPILOT_PROMPT="$RUN/prompt.md" exec "$RUN/autopilot.sh" "$@"
LAUNCH
chmod +x "$STATE/run/launch.sh"
cat > "$DIR/$UNIT.service" <<EOF
[Unit]
Description=Direct-Strike 自动任务：处理 GitHub 上交给 Claude 的 issue（一次一个）

[Service]
Type=oneshot
WorkingDirectory=$REPO_DIR
Environment=PATH=$P
Environment=AUTOPILOT_REPO=$REPO_DIR
ExecStart=$STATE/run/launch.sh
EOF
cat > "$DIR/$UNIT.timer" <<EOF
[Unit]
Description=每 $INTERVAL 检查一次 Direct-Strike 的自动任务

[Timer]
OnBootSec=5min
OnUnitInactiveSec=$INTERVAL
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT.timer"
echo "✓ 已安装定时器 $UNIT.timer（每 $INTERVAL）"
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != yes ]; then
  echo "! 这个用户没开 linger：没有登录会话时 systemd 用户定时器会停。开启：sudo loginctl enable-linger $USER"
fi
