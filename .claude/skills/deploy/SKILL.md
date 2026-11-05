---
name: deploy
description: 把游戏发布到 https://game.lightup.host（本机）。用户说"部署 / 上线 / 发布 / 更新线上"时用。包含发布、验证、回滚和故障排查。
---

# 部署到 game.lightup.host

详细说明见 `docs/deploy.md`。这里只列操作。

## 日常更新（最常用）

```bash
./deploy.sh
```

它把代码 rsync 到 `/home/donkey/fps-site`（排除 .git、refer、docs、.claude、tools、assets-src、部署脚本），再 `docker compose up -d` 确保 fps-game 容器在跑。
rsync 完立刻生效，不需要重启任何容器。

## 发布后验证（每次都做）

```bash
for u in / /js/main.js /maps/yard.json /assets/models/soldier.glb /refer/ak.png /.git/HEAD; do
  printf '%-28s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "https://game.lightup.host$u"
done
```

预期：前四个 200，`/refer/` 和 `/.git/` 必须 404。任何一个不对，先别告诉用户"已上线"。

## 红线

- **不要动 relay 服务**：`/home/donkey/paseo-relay/` 下的 relay 容器和 Caddy 容器都不要重启、重建。
  80/443 归它们，游戏只是借它的 Caddy 按域名分流。
- 改 `/home/donkey/paseo-relay/Caddyfile` 属于改共享资源，先征得用户同意，改完只用 `caddy reload` 热更新，不要 `docker compose up`。
- 不要把 `/home/donkey/direct-strike` 直接挂进容器：会暴露 `.git` 和 `refer/`。

## 故障排查

| 现象 | 看什么 | 处理 |
|---|---|---|
| 502 Bad Gateway | `docker ps` 里没有 fps-game | `./deploy.sh` 会拉起它 |
| 页面是旧版本 | `/home/donkey/fps-site` 里文件日期 | 重跑 `./deploy.sh`；浏览器硬刷新 |
| 证书错误 / 连不上 | `docker logs paseo-relay-caddy-1 --since 10m` | 检查 DNS `getent hosts game.lightup.host` 是否还是本机 IP |
| Caddyfile 里没有 game 段 | `grep game.lightup /home/donkey/paseo-relay/Caddyfile` | 按 `docs/deploy.md` 的"首次接入"重新追加，经用户同意 |

## 回滚

代码回滚：`git checkout <版本>` 后 `./deploy.sh`。
Caddyfile 回滚：同目录下有 `Caddyfile.bak-<时间戳>`，复制回去后 `caddy reload`。
