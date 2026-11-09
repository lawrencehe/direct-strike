# 部署说明

线上地址：**https://game.lightup.host**，跑在本机（GCP 实例）。

## 架构

```
浏览器
  │ https://game.lightup.host
  ▼
paseo-relay 的 Caddy 容器（占 80/443，自动签 Let's Encrypt 证书）
  │ 按域名分流：relay.lightup.host → relay 容器；game.lightup.host → fps-game 容器
  ▼
fps-game 容器（caddy:alpine，只在 Docker 网络 paseo-relay_default 内开 80，gzip 压缩）
  │ 只读挂载                                    │ /api/* 转发
  ▼                                             ▼
/home/donkey/fps-site                    fps-api 容器（python:alpine，网络内开 8080，开发者模式的登录和上传）
（deploy.sh 用 rsync 同步过去的纯站点文件）       │ 代码只读挂载 /home/donkey/fps-api（deploy.sh 同步的 server/）
                                                 │ 数据挂载 /home/donkey/direct-strike-data/devlogs
```

容器 `fps-game` 和站点目录 `fps-site` 保留了项目改名前的名字：relay 的 Caddyfile 写死了 `reverse_proxy fps-game:80`，改容器名要动共享配置，收益只是好看。

为什么这样设计：

- **80/443 已经被 relay 项目的 Caddy 占了**，而且 relay 不能中断。游戏不另起端口，而是借它的 Caddy 按域名分流，这是 Caddy 的原生能力。
- **游戏单独一个容器**，加入 relay 的 Docker 网络。这样接入时只需往 Caddyfile 追加几行并热重载，Caddy 容器不用重建，relay 零中断。
- **站点目录和代码目录分开**。`/home/donkey/direct-strike` 里有 `.git`、`refer/` 草图、文档、开发工具和模型母版，不该公开；而且改代码改到一半不该被玩家看到。`deploy.sh` 用 rsync 做一次性同步并排除这些。

## 文件

| 路径 | 作用 |
|---|---|
| `deploy.sh` | 一键发布：rsync 到站点目录 + 拉起容器 |
| `deploy/compose.yaml` | fps-game 容器定义，网络指向 `paseo-relay_default` |
| `deploy/Caddyfile` | fps-game 的配置：`/api/*` 转给 fps-api，其他出静态文件（根目录、gzip、缓存策略） |
| `server/api.py` | 开发接口（fps-api 容器里跑），说明见 `devmode.md` |
| `/home/donkey/direct-strike-data/api.env` | 开发者模式密码 `DEV_PASSWORD`、签名随机串 `API_SECRET`、数据上限 `DATA_QUOTA_GB`。首次 `deploy.sh` 自动生成，不在仓库里 |
| `/home/donkey/direct-strike-data/devlogs/` | 上传的开发者数据，每次上传一个目录，总量超过上限删最旧的 |
| `/home/donkey/paseo-relay/Caddyfile` | relay 项目的 Caddy 配置，末尾有 `game.lightup.host` 一段（不在本仓库） |

## 日常更新

```bash
./deploy.sh
```

静态文件 rsync 完立刻生效。`server/` 有变化时脚本会重启 fps-api；`deploy/Caddyfile` 和容器里的不一致时会重建 fps-game
（单文件挂载，git 切分支会换掉文件，容器里看到的还是旧的；重建只影响本项目的容器，一两秒，relay 不动）。

缓存策略是 `Cache-Control: no-cache`：浏览器每次先向服务器确认文件有没有变，
没变就返回 304 用本地缓存。所以推了新版本玩家刷新就能看到，2 MB 的模型又不会被反复下载。

## 首次接入（已经做过，记录在这里以便重建）

1. DNS：给 `game.lightup.host` 加 A 记录指向本机公网 IP。
2. `./deploy.sh` 拉起 fps-game 容器。
3. 在 `/home/donkey/paseo-relay/Caddyfile` 末尾追加：

   ```
   game.lightup.host {
   	reverse_proxy fps-game:80
   }
   ```

4. 校验并热重载（在 paseo-relay 目录）：

   ```bash
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose exec caddy caddy reload   --config /etc/caddy/Caddyfile
   ```

   校验不过 reload 不会执行，旧配置继续跑。重载后十几秒内证书自动签好。

## 验证

```bash
curl -sI https://game.lightup.host/ | head -1                      # 200
curl -s -o /dev/null -w '%{http_code}\n' https://game.lightup.host/refer/ak.png   # 必须 404
curl -s -o /dev/null -w '%{http_code}\n' https://game.lightup.host/.git/HEAD      # 必须 404
curl -s https://game.lightup.host/api/health                                        # {"ok": true}
curl -s -o /dev/null -w '%{http_code}\n' https://game.lightup.host/server/api.py   # 必须 404（接口代码不在站点目录里）
```

## 回滚

- 代码：`git tag --sort=v:refname` 看有哪些版本，`git checkout <tag>` 然后 `./deploy.sh`，部署完 `git checkout main` 回来。
  每个上线的版本都有 tag（`ship.sh --tag` 打的，见 `workflow.md` 的"版本号"）。
  回滚只是临时措施：线上这时比 `main` 旧，修好后照常从 `main` 发新版本。
- Caddyfile：同目录有 `Caddyfile.bak-<时间戳>`，复制回去再 `caddy reload`。

## 以后加地图要注意

每张地图的模型和贴图单独放，选了哪张才加载哪张。这样首次必须下载的体积一直保持在引擎加一张图，
总体积变大也不影响打开速度。
