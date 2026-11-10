#!/usr/bin/env bash
# 自动任务：定时检查 GitHub 上负责人交给 Claude 的 issue，一次处理一个。约定和用法见 docs/autopilot.md。
#
#   标签流转：交给Claude（排队）→ Claude处理中 → 待验收（PR 已提）/ 等你回复（有问题）
#   待验收 时负责人评论 "commit push & deploy" 或打 授权部署 → 本脚本跑 ship.sh 合并上线、关 issue；评论别的 → 当修改意见
#   授权部署 和 交给Claude 一起打（提前授权）→ Claude 做完、改成 待验收 后，同一轮直接上线
#   等你回复 时负责人评论 → 自动重新排队
#
# 用法：tools/autopilot/autopilot.sh [--dry-run]     （systemd 定时器每 30 分钟跑一次，见 tools/autopilot/install.sh）
#   --dry-run  只打印这一轮会做什么，不改标签、不跑 Claude
#
# 只认仓库主人（负责人）的标签和评论。Claude 和负责人用的是同一个 GitHub 账号，
# 所以 Claude 发的评论都带 MARK，靠它区分"负责人说的"和"Claude 说的"。
set -euo pipefail

# 定时器跑的是启动器从 origin/main 取出来的副本（不直接跑工作目录里的，见 install.sh），
# 所以仓库位置和提示词位置由环境变量给；手动在仓库里运行时按脚本所在位置推算
REPO_DIR=${AUTOPILOT_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
PROMPT_FILE=${AUTOPILOT_PROMPT:-$(dirname "$0")/prompt.md}
WT=${AUTOPILOT_WORKTREE:-/home/donkey/direct-strike-autopilot}     # 自动任务专用的 worktree，不碰手动会话的目录
STATE=${AUTOPILOT_STATE:-$HOME/.local/state/direct-strike-autopilot}
MAX_PER_DAY=${AUTOPILOT_MAX_PER_DAY:-5}         # 每天最多启动几次 Claude（开发和修改都算，上线不算）
TIMEOUT_MIN=${AUTOPILOT_TIMEOUT_MIN:-90}        # 单个任务最长多少分钟
COOLDOWN_MIN=${AUTOPILOT_COOLDOWN_MIN:-60}      # 碰到额度限制后歇多久
MARK='<!-- autopilot -->'
L_QUEUE=交给Claude L_DOING=Claude处理中 L_ASK=等你回复 L_REVIEW=待验收 L_PRIO=优先 L_AUTH=授权部署
DRY=0; [ "${1:-}" = --dry-run ] && DRY=1

mkdir -p "$STATE/logs"
# 一次只做一个任务：上一轮（可能正在跑 Claude）还没结束，这一轮直接退出，新任务留在队列里等下一轮
exec 9>"$STATE/lock"
flock -n 9 || { echo "上一轮还没结束，跳过"; exit 0; }
# 定时检查本身只调 gh，不启动 Claude、不耗 token；只有真有任务时才启动 Claude（上线也不启动）
log() { echo "[$(date '+%F %T')] $*" | tee -a "$STATE/logs/autopilot.log"; }

[ -f "$STATE/paused" ] && { echo "已暂停（tools/autopilot/install.sh resume 恢复）"; exit 0; }
if [ -f "$STATE/cooldown-until" ] && [ "$(date +%s)" -lt "$(cat "$STATE/cooldown-until")" ]; then
  log "额度冷却中，到 $(date -d @"$(cat "$STATE/cooldown-until")" '+%H:%M') 为止"; exit 0
fi

cd "$REPO_DIR"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=${REPO%%/*}

# ---- 小工具 ----
comment() {  # comment 编号 正文：以 Claude 的身份留言（带 MARK）
  [ $DRY = 1 ] && { log "（dry-run）评论 #$1：${2%%$'\n'*}"; return; }
  gh issue comment "$1" --body "$(printf '%s\n🤖 **Claude 自动任务**\n\n%s' "$MARK" "$2")" >/dev/null
}
relabel() {  # relabel 编号 要加的 要去掉的（逗号分隔，可空）
  [ $DRY = 1 ] && { log "（dry-run）#$1 标签 +[$2] -[$3]"; return; }
  local args=()
  [ -n "$2" ] && args+=(--add-label "$2")
  [ -n "$3" ] && args+=(--remove-label "$3")
  gh issue edit "$1" "${args[@]}" >/dev/null
}
labels_of() { gh issue view "$1" --json labels -q '[.labels[].name] | join(",")'; }
# 负责人在 Claude 最后一条评论之后说的话（没有就空）
owner_reply() {
  gh api "repos/$REPO/issues/$1/comments?per_page=100" --paginate \
    | jq -rs --arg o "$OWNER" --arg m "$MARK" '
        add as $c
        | ([$c[] | select(.body | contains($m)) | .created_at] | max // "") as $last
        | [$c[] | select(.user.login == $o and (.body | contains($m) | not) and .created_at > $last)]
        | map(.body) | join("\n\n---\n\n")'
}
# Claude 最后一条 待验收 评论里记的 分支 / PR / 版本：<!-- autopilot:branch=... pr=... version=... -->
meta() {
  gh api "repos/$REPO/issues/$1/comments?per_page=100" --paginate \
    | jq -rs --arg k "$2" '[add[] | .body | capture("autopilot:(?<m>[^>]*)-->") | .m] | last // ""
                           | capture("\($k)=(?<v>[^ ]+)").v // ""'
}
# 打上某个标签的人和时间（最后一次）
labeled_by() {
  gh api "repos/$REPO/issues/$1/events?per_page=100" --paginate \
    | jq -rs --arg l "$2" '[add[] | select(.event == "labeled" and .label.name == $l)] | last | "\(.actor.login) \(.created_at)"'
}

# 负责人打了 授权部署（别人打的不算）
authorized() { [[ ",$(labels_of "$1")," == *",$L_AUTH,"* ]] && [ "$(labeled_by "$1" "$L_AUTH" | cut -d' ' -f1)" = "$OWNER" ]; }

# 上线：跑 origin/main 上的 ship.sh（启动器取到脚本旁边；手动跑时用仓库里的），不启动 Claude。
# 调用前标签已经是 处理中，worktree 已经在任务分支上
do_ship() {
  local ship=$(dirname "$0")/ship.sh; [ -x "$ship" ] || ship=$(dirname "$0")/../ship.sh
  if [ -z "$BRANCH" ] || [ -z "$VER" ]; then
    comment "$NUM" "找不到这个任务的分支或版本号（应该记在我上一条\"待验收\"评论里），没法上线。请在 Claude Code 里处理。"
    relabel "$NUM" "$L_ASK" "$L_DOING,$L_AUTH"; exit 1
  fi
  if OUT=$(SHIP_DIR="$WT" "$ship" -c "$NUM" --tag 2>&1 9>&-); then
    log "#$NUM 已上线 $VER"
    relabel "$NUM" "" "$L_DOING,$L_AUTH" || true
    sleep 5   # PR 的 Closes 关 issue 是异步的，等一下；没关上就手动关
    [ "$(gh issue view "$NUM" --json state -q .state)" = OPEN ] && gh issue close "$NUM" >/dev/null || true
    comment "$NUM" "已上线 **$VER**：https://game.lightup.host ，issue 已关闭。

\`\`\`
$(echo "$OUT" | grep -E '^[✓·]')
\`\`\`
真机试玩有问题就开新 issue（要我做的话打 \`$L_QUEUE\`）。"
  else
    log "#$NUM 上线失败"; echo "$OUT" >> "$STATE/logs/autopilot.log"
    # 去掉 授权部署，免得每一轮都重试；处理好后负责人重新打标签或评论
    relabel "$NUM" "$L_REVIEW" "$L_DOING,$L_AUTH"
    comment "$NUM" "上线没成功，停在这一步：

\`\`\`
$(echo "$OUT" | tail -15)
\`\`\`
线上没有变（失败的话 ship.sh 不会打 tag）。处理好后重新打 \`$L_AUTH\`（或回复 \`commit push & deploy\`）再试，或者在 Claude Code 里处理。"
  fi
}

# ---- 0. 上一轮崩掉留下的 处理中 ----
for n in $(gh issue list --state open --label "$L_DOING" --json number -q '.[].number'); do
  log "#$n 停在 $L_DOING（上一轮异常退出）"
  comment "$n" "上一轮处理这个 issue 时异常退出了，没做完。日志在开发机 \`$STATE/logs/\`。
回复评论（随便写点什么，比如\"继续\"）我会重新接手。"
  relabel "$n" "$L_ASK" "$L_DOING"
done

# ---- 1. 找这一轮要做的事：上线 > 修改意见 > 回复后继续 > 排队的新任务 ----
TASK="" NUM=""
# 待验收：说了 commit push & deploy → 上线；写了别的 → 修改（有 授权部署 的改完再上线）；没说话但打了 授权部署 → 上线
for n in $(gh issue list --state open --label "$L_REVIEW" --json number -q 'sort_by(.number) | .[].number'); do
  r=$(owner_reply "$n")
  if [ -n "$r" ] && echo "$r" | grep -qiE 'commit[[:space:]]*(,|&|＆|and)?[[:space:]]*push[[:space:]]*(&|＆|and)[[:space:]]*deploy|^/ship'; then
    TASK=ship; NUM=$n; break
  fi
  if [ -z "$r" ]; then authorized "$n" && { TASK=ship; NUM=$n; break; }; continue; fi
  [ -z "$TASK" ] && { TASK=revise; NUM=$n; }
done
if [ -z "$TASK" ]; then
  for n in $(gh issue list --state open --label "$L_ASK" --json number -q 'sort_by(.number) | .[].number'); do
    [ -n "$(owner_reply "$n")" ] && { TASK=resume; NUM=$n; break; }
  done
fi
if [ -z "$TASK" ]; then
  # 排队：先 优先，再按打 交给Claude 的时间；只认负责人打的
  BEST=""
  while read -r n prio; do
    [ -z "$n" ] && continue
    read -r who when <<<"$(labeled_by "$n" "$L_QUEUE")"
    if [ "$who" != "$OWNER" ]; then log "#$n 的 $L_QUEUE 是 $who 打的，不理"; continue; fi
    key="$((1 - prio)) $when $n"
    { [ -z "$BEST" ] || [[ "$key" < "$BEST" ]]; } && BEST=$key
  done < <(gh issue list --state open --label "$L_QUEUE" --json number,labels \
             -q ".[] | \"\(.number) \(if any(.labels[]; .name == \"$L_PRIO\") then 1 else 0 end)\"")
  [ -n "$BEST" ] && { TASK=develop; NUM=${BEST##* }; }
fi
[ -z "$TASK" ] && { echo "没有要做的"; exit 0; }
log "这一轮：#$NUM $TASK"

# ---- 2. 每天的上限（上线不启动 Claude，不算） ----
TODAY="$STATE/count-$(date +%F)"
if [ "$TASK" != ship ] && [ "$(cat "$TODAY" 2>/dev/null || echo 0)" -ge "$MAX_PER_DAY" ]; then
  log "今天已经启动了 $MAX_PER_DAY 次 Claude，明天再做 #$NUM"
  if [ ! -f "$STATE/notified-$(date +%F)" ] && [ $DRY = 0 ]; then
    comment "$NUM" "今天自动处理的任务数到上限了（$MAX_PER_DAY 个），这个明天接着做。想马上做，在 Claude Code 里说\"做 #$NUM\"。"
    touch "$STATE/notified-$(date +%F)"
  fi
  exit 0
fi
[ $DRY = 1 ] && { log "（dry-run）到此为止"; exit 0; }

# 先挂上 处理中，别的轮次就不会再挑它
case $TASK in
  ship|revise) relabel "$NUM" "$L_DOING" "$L_REVIEW" ;;
  resume)      relabel "$NUM" "$L_DOING" "$L_ASK" ;;
  develop)     relabel "$NUM" "$L_DOING" "$L_QUEUE,$L_PRIO" ;;
esac

# ---- 3. 准备 worktree ----
git fetch -q origin
[ -d "$WT" ] || git worktree add -q --detach "$WT" origin/main
cd "$WT"
if [ -n "$(git status --porcelain)" ]; then   # 上一轮留下的改动收进 stash，不丢也不带进这一轮
  git stash push -q -u -m "autopilot 残留（$(date '+%F %T')，接手 #$NUM 前）"
  log "worktree 有上一轮的残留，已收进 git stash"
fi
BRANCH=$(meta "$NUM" branch); PR=$(meta "$NUM" pr); VER=$(meta "$NUM" version)
if [ "$TASK" = develop ] || [ -z "$BRANCH" ]; then
  git checkout -q --detach origin/main
else
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
  git pull -q --ff-only origin "$BRANCH" || true
fi

# ---- 4a. 上线：直接跑 ship.sh，不启动 Claude ----
[ "$TASK" = ship ] && { do_ship; exit 0; }

# ---- 4b. 开发 / 修改 / 继续：启动 Claude ----
echo $(( $(cat "$TODAY" 2>/dev/null || echo 0) + 1 )) > "$TODAY"
PROMPT=$(REPO="$REPO" NUM="$NUM" TASK="$TASK" BRANCH="$BRANCH" PR="$PR" VER="$VER" MARK="$MARK" \
         L_REVIEW="$L_REVIEW" L_ASK="$L_ASK" L_DOING="$L_DOING" L_QUEUE="$L_QUEUE" \
         envsubst '$REPO $NUM $TASK $BRANCH $PR $VER $MARK $L_REVIEW $L_ASK $L_DOING $L_QUEUE' < "$PROMPT_FILE")
RUNLOG="$STATE/logs/$(date +%Y%m%d-%H%M%S)-issue$NUM-$TASK.json"
log "#$NUM 启动 Claude（$TASK），日志 $RUNLOG"
set +e
timeout "${TIMEOUT_MIN}m" claude -p "$PROMPT" --permission-mode auto --output-format json > "$RUNLOG" 2>&1 9>&-   # 9>&-：Claude 留下的后台进程不占锁
RC=$?
set -e
RESULT=$(jq -r '.result // empty' "$RUNLOG" 2>/dev/null || tail -c 2000 "$RUNLOG")
log "#$NUM Claude 结束 rc=$RC"

NOW_LABELS=$(labels_of "$NUM")
# 提前授权过（授权部署）：Claude 做完改成了 待验收，这一轮直接上线，不用等负责人
if [[ ",$NOW_LABELS," == *",$L_REVIEW,"* ]] && authorized "$NUM"; then
  log "#$NUM 已授权部署，直接上线"
  relabel "$NUM" "$L_DOING" "$L_REVIEW"
  BRANCH=$(meta "$NUM" branch); PR=$(meta "$NUM" pr); VER=$(meta "$NUM" version)
  git checkout -q "$BRANCH" 2>/dev/null || true
  [ -n "$(git status --porcelain)" ] && git stash push -q -u -m "autopilot 上线前残留（#$NUM）"
  do_ship; exit 0
fi
if [[ ",$NOW_LABELS," == *",$L_DOING,"* ]]; then   # Claude 没走到最后一步（没改成 待验收 / 等你回复）
  if echo "$RESULT" | grep -qiE 'usage limit|rate limit|limit reached|额度|quota'; then
    echo $(( $(date +%s) + COOLDOWN_MIN * 60 )) > "$STATE/cooldown-until"
    log "碰到额度限制，冷却 $COOLDOWN_MIN 分钟"
    comment "$NUM" "碰到 Claude 的额度限制，先停下，$(date -d "+$COOLDOWN_MIN min" '+%H:%M') 以后自动接着做。"
    relabel "$NUM" "$L_QUEUE" "$L_DOING"
  else
    [ $RC = 124 ] && why="超过 $TIMEOUT_MIN 分钟没做完" || why="没做完就退出了（rc=$RC）"
    comment "$NUM" "这次$why，停下了。最后的输出：

> $(echo "$RESULT" | tail -c 1200 | sed 's/^/> /')

回复评论（比如\"继续\"或补充说明）我会重新接手；也可以在 Claude Code 里处理。"
    relabel "$NUM" "$L_ASK" "$L_DOING"
  fi
fi
exit 0
