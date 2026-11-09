#!/usr/bin/env bash
# 一键"提交 → 并入 main → 推送 → 部署 → 线上检查"。流程约定见 docs/workflow.md，Claude Code 里是 /ship。
# 输出尽量少：每步一行，出错才打印细节。
#
# 用法：tools/ship.sh [-v vX.Y] [-m 提交信息文件] [--tag] [--no-deploy] [--live-verify] [--skip-verify]
#   -v vX.Y          发版：把 README.md 标题和 index.html 的 <small> 改成这个版本号
#   -m 文件          提交信息（首行 "vX.Y：摘要"，版本号必须和 README 一致）。工作区没改动时可省略
#   --tag            部署成功后给 main 打 tag（版本号就是 tag 名，带注释 = 提交首行）并推送，回滚靠它（docs/deploy.md）。
#                    同一个版本的 tag 已经在别的提交上时报错，不移动已发布的 tag
#   --no-deploy      只提交和推送，不部署（加了 --tag 就在推送 main 后打）
#   --live-verify    部署后再用无头浏览器验证线上（慢，约 1 分钟）
#   --skip-verify    跳过本地 verify（只改了文档时会自动跳过）
set -euo pipefail
cd "$(dirname "$0")/.."

VER="" MSG="" DEPLOY=1 LIVE=0 SKIPV=0 TAG=0
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VER="$2"; shift 2 ;;
    -m) MSG="$2"; shift 2 ;;
    --no-deploy) DEPLOY=0; shift ;;
    --live-verify) LIVE=1; shift ;;
    --skip-verify) SKIPV=1; shift ;;
    --tag) TAG=1; shift ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done
die() { echo "✗ $*"; exit 1; }
SITE=https://game.lightup.host

# ---- 1. 版本号 ----
if [ -n "$VER" ]; then
  [[ "$VER" =~ ^v[0-9]+\.[0-9]+$ ]] || die "版本号格式应为 vX.Y：$VER"
  sed -i -E "1s/v[0-9]+\.[0-9]+/$VER/" README.md
  sed -i -E "s#<small>v[0-9]+\.[0-9]+</small>#<small>$VER</small>#" index.html
fi
CUR=$(head -1 README.md | grep -oE 'v[0-9]+\.[0-9]+') || die "README.md 第一行没有版本号"
grep -q "<small>$CUR</small>" index.html || die "index.html 的版本号和 README（$CUR）不一致"

# ---- 2. 提交 ----
BR=$(git branch --show-current)
[ -n "$BR" ] || die "当前不在任何分支上"
git add -A
if git diff --cached --quiet; then
  echo "· 没有新改动，跳过提交"
else
  [ -n "$MSG" ] && [ -f "$MSG" ] || die "有改动但没给提交信息文件（-m）"
  head -1 "$MSG" | grep -qE "^$CUR：" || die "提交信息首行应以 \"$CUR：\" 开头（当前版本 $CUR）"
  CHANGED=$(git diff --cached --name-only)
  if [ $SKIPV = 0 ] && echo "$CHANGED" | grep -qvE '^(docs/|\.claude/|.*\.md$)'; then
    if OUT=$(node tools/verify.mjs --modes menu,duel 2>&1); then
      echo "✓ verify：$(echo "$OUT" | tail -1)"
    else
      git reset -q; echo "$OUT" | tail -8; die "verify 没通过，已取消暂存，什么都没提交"
    fi
  else
    echo "· 跳过 verify（只改了文档或指定跳过）"
  fi
  git commit -q -F "$MSG"
  echo "✓ 提交 $(git log --oneline -1)"
fi

# ---- 3. 并入 main 并推送（分支也推，分支不删） ----
if [ "$BR" != main ]; then
  git push -q -u origin "$BR" && echo "✓ 推送分支 $BR"
  git checkout -q main
  git pull -q --ff-only origin main
  git merge -q --no-edit "$BR" || { git merge --abort 2>/dev/null; git checkout -q "$BR"; die "合并 $BR 到 main 有冲突，已放弃合并"; }
  echo "✓ $BR 并入 main"
fi
git push -q origin main && echo "✓ 推送 main $(git rev-parse --short HEAD)"

# ---- 4. 从 main 部署 ----
if [ $DEPLOY = 1 ]; then
  ./deploy.sh >/dev/null 2>&1 || { [ "$BR" != main ] && git checkout -q "$BR"; die "deploy.sh 失败，手动运行 ./deploy.sh 看报错"; }
  # deploy.sh 最后会让 fps-game 的 Caddy 重载配置，刚重载完的一两秒里请求可能失败，所以检查不通过时隔 2 秒重试，最多 3 次
  for try in 1 2 3; do
    BAD=""
    for u in / /js/main.js /maps/yard.json /assets/models/human/init_soldier.glb; do
      c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$u"); [ "$c" = 200 ] || BAD="$BAD $u=$c"
    done
    for u in /refer/ak.png /.git/HEAD /docs/README.md /server/api.py; do
      c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$u"); [ "$c" = 404 ] || BAD="$BAD $u=$c(应为404)"
    done
    curl -s "$SITE/" | grep -q "<small>$CUR</small>" || BAD="$BAD 线上页面不是$CUR"
    curl -s "$SITE/api/health" | grep -q '"ok": true' || BAD="$BAD 开发接口/api/health不通"
    [ -z "$BAD" ] && break
    if [ $try -lt 3 ]; then sleep 2; fi
  done
  [ -z "$BAD" ] || { [ "$BR" != main ] && git checkout -q "$BR"; die "线上检查失败：$BAD"; }
  echo "✓ 已部署 $CUR，线上检查通过"
  if [ $LIVE = 1 ]; then
    OUT=$(node tools/verify.mjs --url "$SITE" --modes menu,duel 2>&1) && echo "✓ 线上 verify：$(echo "$OUT" | tail -1)" \
      || { echo "$OUT" | tail -8; echo "✗ 线上 verify 没通过"; }
  fi
fi

# ---- 5. 打 tag（部署失败的话上面已经退出，不会打）----
if [ $TAG = 1 ]; then
  HEAD=$(git rev-parse HEAD)
  if OLD=$(git rev-parse -q --verify "refs/tags/$CUR^{commit}"); then
    [ "$OLD" = "$HEAD" ] || { [ "$BR" != main ] && git checkout -q "$BR"; die "tag $CUR 已经在 $(git rev-parse --short "$OLD") 上，不移动已发布的 tag；要打新 tag 请用新版本号 -v"; }
    echo "· tag $CUR 已经在当前提交上"
  else
    git tag -a "$CUR" -m "$(git log -1 --format=%s)"
  fi
  git push -q origin "refs/tags/$CUR" && echo "✓ tag $CUR → $(git rev-parse --short HEAD)，已推送"
fi

# 回到原来的分支继续开发
[ "$BR" != main ] && git checkout -q "$BR" && echo "· 回到分支 $BR"
exit 0
