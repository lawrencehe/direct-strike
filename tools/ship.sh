#!/usr/bin/env bash
# 一键"提交 → 推送分支 → 建 PR 并在 GitHub 上合并进 main → 部署 → 线上检查 → tag 和 Release"。
# 流程约定见 docs/workflow.md，Claude Code 里是 /ship。需要 gh 已登录（gh auth status）。
# 输出尽量少：每步一行，出错才打印细节。
#
# 用法：tools/ship.sh [-v vX.Y] [-m 提交信息文件] [-c 6,27] [--tag] [--no-deploy] [--no-pr] [--live-verify] [--skip-verify]
#   -v vX.Y          发版：把 README.md 标题和 index.html 的 <small> 改成这个版本号
#   -m 文件          提交信息（首行 "vX.Y：摘要"，版本号必须和 README 一致）。工作区没改动时可省略
#   -c 6,27          这次 PR 关闭的 issue 编号（逗号分隔），写成 PR 正文里的 "Closes #N"，合并后 GitHub 自动关闭
#   --no-pr          不走 PR，在本地把分支并入 main 再推送（gh 不能用时的备用办法）
#   --tag            部署成功后给 main 打 tag（版本号就是 tag 名，带注释 = 提交首行）并推送，回滚靠它（docs/deploy.md）。
#                    同一个版本的 tag 已经在别的提交上时报错，不移动已发布的 tag
#   --no-deploy      只提交、合并和推送，不部署（加了 --tag 就在推送 main 后打）
#                    加了 --tag 时还会建 GitHub Release；同名 Milestone 的 issue 都关了就关掉 Milestone
#   --live-verify    部署后再用无头浏览器验证线上（慢，约 1 分钟）
#   --skip-verify    跳过本地 verify（只改了文档时会自动跳过）
set -euo pipefail
# SHIP_DIR：要发布的仓库目录。自动任务跑的是 origin/main 上的 ship.sh 副本（不在仓库里），用它指定 worktree
cd "${SHIP_DIR:-$(dirname "$0")/..}"

VER="" MSG="" DEPLOY=1 LIVE=0 SKIPV=0 TAG=0 PR=1 CLOSES=""
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VER="$2"; shift 2 ;;
    -m) MSG="$2"; shift 2 ;;
    --no-deploy) DEPLOY=0; shift ;;
    --live-verify) LIVE=1; shift ;;
    --skip-verify) SKIPV=1; shift ;;
    --tag) TAG=1; shift ;;
    -c) CLOSES="$2"; shift 2 ;;
    --no-pr) PR=0; shift ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done
die() { echo "✗ $*"; exit 1; }
SITE=https://game.lightup.host
if [ $PR = 1 ]; then
  gh auth status >/dev/null 2>&1 || die "gh 没登录（gh auth login），或者加 --no-pr 走本地合并"
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) || die "gh 读不到仓库信息"
fi
[ -z "$CLOSES" ] || [[ "$CLOSES" =~ ^[0-9]+(,[0-9]+)*$ ]] || die "-c 的格式应为 6 或 6,27：$CLOSES"

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
PRNUM=""
if [ "$BR" != main ]; then
  git push -q -u origin "$BR" && echo "✓ 推送分支 $BR"
  if [ $PR = 1 ]; then
    # 建 PR（这个分支已有开着的 PR 就沿用），在 GitHub 上用合并提交并入 main，不删分支
    PRNUM=$(gh pr list --head "$BR" --state open --json number -q '.[0].number')
    if [ -z "$PRNUM" ]; then
      BODY=$(mktemp)
      { git log -1 --format=%b | grep -v '^Co-Authored-By' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' || true
        if [ -n "$CLOSES" ]; then echo; for n in ${CLOSES//,/ }; do echo "Closes #$n"; done; fi
      } > "$BODY"
      MS=(); gh api "repos/$REPO/milestones?state=open&per_page=100" -q '.[].title' | grep -qx "$CUR" && MS=(--milestone "$CUR")
      URL=$(gh pr create --base main --head "$BR" --title "$(git log -1 --format=%s)" --body-file "$BODY" "${MS[@]}") \
        || { rm -f "$BODY"; die "建 PR 失败"; }
      rm -f "$BODY"; PRNUM=${URL##*/}
      echo "✓ 建 PR #$PRNUM $URL"
    else
      echo "· 沿用开着的 PR #$PRNUM"
      if [ -n "$CLOSES" ]; then
        BODY=$(mktemp); gh pr view "$PRNUM" --json body -q .body > "$BODY" || true
        for n in ${CLOSES//,/ }; do grep -qx "Closes #$n" "$BODY" || printf '\nCloses #%s' "$n" >> "$BODY"; done
        # 不用 gh pr edit：gh 2.46 会去读已下线的 Projects (classic)，报 GraphQL 错（#31 上线因此失败），改走 REST
        gh api -X PATCH "repos/$REPO/pulls/$PRNUM" -F "body=@$BODY" >/dev/null || echo "! 没改成 PR 正文（Closes 没加上，合并后手动关 issue）"
        rm -f "$BODY"
      fi
    fi
    gh pr merge "$PRNUM" --merge >/dev/null 2>&1 \
      || die "PR #$PRNUM 合并失败（多半是和 main 冲突）：在分支上 git merge origin/main 解决冲突后再跑一次"
    echo "✓ PR #$PRNUM 已合并进 main"
    # 切到 GitHub 上合并后的 main 来部署。main 已经在别的 worktree 里检出时（自动任务的 worktree）用分离头指针，
    # 本地 main 留给那个目录；没被占用就照常切到本地 main 并拉到最新
    git fetch -q origin main
    if git worktree list --porcelain | grep -qx 'branch refs/heads/main'; then
      git checkout -q --detach origin/main
    else
      git checkout -q main
      git pull -q --ff-only origin main || { git checkout -q "$BR"; die "本地 main 拉不下来（本地 main 有没推送的提交？）"; }
    fi
  else
    git checkout -q main
    git pull -q --ff-only origin main
    git merge -q --no-edit "$BR" || { git merge --abort 2>/dev/null; git checkout -q "$BR"; die "合并 $BR 到 main 有冲突，已放弃合并"; }
    echo "✓ $BR 并入 main（本地合并）"
  fi
fi
# PR 合并的已经在 GitHub 上了，不用再推
if [ "$BR" = main ] || [ $PR = 0 ]; then git push -q origin main && echo "✓ 推送 main $(git rev-parse --short HEAD)"; fi

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

  # GitHub Release：说明用这个版本第一次提交的正文，附上 PR；已经有了就不动
  if [ $PR = 1 ]; then
    if gh release view "$CUR" >/dev/null 2>&1; then
      echo "· Release $CUR 已存在"
    else
      NOTES=$(mktemp)
      FIRST=$(git log --format='%H %s' HEAD | grep -E "^[0-9a-f]+ $CUR：" | tail -1 | cut -d' ' -f1 || true)
      { git log -1 --format=%b "${FIRST:-HEAD}" | grep -v '^Co-Authored-By' || true
        if [ -n "$PRNUM" ]; then printf '\nPR：#%s\n' "$PRNUM"; fi
        if [ -n "$CLOSES" ]; then printf '需求：#%s\n' "${CLOSES//,/ #}"; fi
      } > "$NOTES"
      gh release create "$CUR" --verify-tag --title "$(git log -1 --format=%s "${FIRST:-HEAD}")" --notes-file "$NOTES" --latest >/dev/null \
        && echo "✓ Release $CUR" || echo "✗ 建 Release 失败，手动：gh release create $CUR --verify-tag"
      rm -f "$NOTES"
    fi
    # 同名 Milestone 的 issue 都关了就关掉它
    MSN=$(gh api "repos/$REPO/milestones?state=open&per_page=100" -q ".[] | select(.title==\"$CUR\") | \"\\(.number) \\(.open_issues)\"")
    if [ -n "$MSN" ]; then
      if [ "${MSN#* }" = 0 ]; then
        gh api -X PATCH "repos/$REPO/milestones/${MSN%% *}" -f state=closed >/dev/null && echo "✓ Milestone $CUR 已关闭"
      else
        echo "· Milestone $CUR 还有 ${MSN#* } 个开着的 issue，没关"
      fi
    fi
  fi
fi

# 回到原来的分支继续开发
[ "$BR" != main ] && git checkout -q "$BR" && echo "· 回到分支 $BR"
exit 0
