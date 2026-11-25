---
name: rollback
description: 把线上回滚到某个已发布的版本（/rollback v0.50），以及 deploy.sh 本身的线上故障排查、不带新改动重新发布 main 当前版本。用户说"回滚 / 退回 vX.Y / 线上挂了 / 502 / 线上是旧版本"时用。发新改动不用这个，用 /deploy。
argument-hint: "[vX.Y]"
---

# 回滚和线上排查

部署脚本是 `deploy.sh`，细节见 `docs/deploy.md`。本次参数：`$ARGUMENTS`

## 回滚到某个版本

参数是版本号（例如 `v0.50`）就回滚到这个版本；没给参数就列出最近的版本（`git tag --sort=-v:refname | head -10`）和线上当前版本，问负责人退到哪个。
负责人打 `/rollback vX.Y` 已经是明确指令，不用再确认。

在临时 worktree 里部署那个 tag，不动当前工作区和分支（`deploy.sh` 在自己所在的目录里运行）：

```bash
V=v0.50   # 换成参数
git rev-parse -q --verify "refs/tags/$V" >/dev/null || { echo "没有 $V 这个 tag"; git tag --sort=-v:refname | head; }
WT=$(mktemp -d)/rollback-$V
git worktree add -q --detach "$WT" "$V" && "$WT/deploy.sh"; git worktree remove --force "$WT"
```

部署完按下面"验证"检查，页面里的版本号应该是 `$V`。

告诉负责人：
- 线上现在是 `$V`，比 `main` 旧。**下次 `/deploy` 会从 `main` 发布，回滚就被覆盖了**，问题要在 `main` 上修好再发。
- 回滚的是那个版本的全部线上文件，包括开发接口 `server/` 和 `deploy/Caddyfile`。
- 回滚原因开一条 `bug` issue 记下来（写清回滚到哪个版本、为什么）。

退回 `main` 的最新版本：在 `main` 上跑 `./deploy.sh`（见下面）。

## 只重新发布 main 当前版本

```bash
git switch main && git pull -q && ./deploy.sh
```

它把代码 rsync 到 `/home/donkey/fps-site`（排除 .git、refer、docs、.claude、tools、assets-src、部署脚本），再 `docker compose up -d` 确保 fps-game 容器在跑。
rsync 完立刻生效，不需要重启任何容器。**不要从别的分支跑**，否则线上会比 `main` 新。

## 验证（每次部署后都做）

```bash
for u in / /js/main.js /maps/yard.json /assets/models/human/ukrainian-soldier.glb /refer/ak.png /.git/HEAD; do
  printf '%-28s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "https://game.lightup.host$u"
done
curl -s https://game.lightup.host/ | grep -o '<small>v[0-9.]*</small>'
```

预期：前四个 200，`/refer/` 和 `/.git/` 必须 404，版本号对。任何一个不对，先别告诉负责人"已上线"。

## 红线

- **不要动 relay 服务**：`/home/donkey/paseo-relay/` 下的 relay 容器和 Caddy 容器都不要重启、重建。
  80/443 归它们，游戏只是借它的 Caddy 按域名分流。
- 改 `/home/donkey/paseo-relay/Caddyfile` 属于改共享资源，先征得负责人同意，改完只用 `caddy reload` 热更新，不要 `docker compose up`。
- 不要把 `/home/donkey/direct-strike` 直接挂进容器：会暴露 `.git` 和 `refer/`。

## 故障排查

| 现象 | 看什么 | 处理 |
|---|---|---|
| 502 Bad Gateway | `docker ps` 里没有 fps-game | `./deploy.sh` 会拉起它 |
| 页面是旧版本 | `/home/donkey/fps-site` 里文件日期 | 重跑 `./deploy.sh`；浏览器硬刷新 |
| 证书错误 / 连不上 | `docker logs paseo-relay-caddy-1 --since 10m` | 检查 DNS `getent hosts game.lightup.host` 是否还是本机 IP |
| Caddyfile 里没有 game 段 | `grep game.lightup /home/donkey/paseo-relay/Caddyfile` | 按 `docs/deploy.md` 的"首次接入"重新追加，经负责人同意 |

relay 的 Caddyfile 回滚：同目录下有 `Caddyfile.bak-<时间戳>`，复制回去后 `caddy reload`。
