# 部署与通知配置

本地应用已运行验证，2026-10-11 已通过 Cloudflare Quick Tunnel 提供公网 HTTPS 手机验收入口。下方长期服务器方案已准备配置，尚未在真实云服务器执行。

同日已另行发布到 [Sites 固定入口](https://lundao-dorm-duty.dapper-eft-1618.chatgpt.site)。该入口托管正式 Vue 构建并代理下方临时后端；手机优先使用 Sites 地址。访问范围、已通过的真实站点核验和后端依赖见 [Sites 发布记录](SITES_DEPLOYMENT.md)。

## 0. 当前手机验收入口

打开 [HTTPS 手机验收入口](https://interfaces-project-trek-authorized.trycloudflare.com/)，或扫描 [二维码](evidence/public-deploy/mobile-qr.png)。用 Safari 打开后可通过分享菜单添加到主屏幕。入口与当前本地演示服务共享数据，可注册自己的验收账号、创建宿舍并邀请室友。

这是临时验收入口，依赖 Mac 上的 API、唯一提醒 worker、静态网关与 cloudflared 持续运行；电脑休眠、断网或进程停止会中断访问。Quick Tunnel 重建会改变域名，不能作为长期运行承诺。详见 [Cloudflare 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

本次网关仅监听 `127.0.0.1:8080`，服务正式构建的 `frontend/dist`，同域代理业务 API 并设置 `no-store`。没有对外暴露 Vite 开发服务器。手机步骤、已验证范围和待验证范围见 [手机验收说明](MOBILE_ACCEPTANCE.md)。

需要重建临时入口时，先保证 API 与 worker 已运行，在项目根目录分别开启并保持以下两个进程：

```bash
node scripts/web-gateway.mjs
data/tools/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080 --protocol quic
```

`data/tools/cloudflared` 是本次从官方发行包下载并校验 SHA-256 的本机工具，不纳入源码仓库；其他环境需按 [官方安装说明](https://developers.cloudflare.com/tunnel/downloads/) 安装，使用自己的可执行文件路径。每次启动以终端输出的新地址为准，不要重用已经停止的旧入口。

## 1. 环境变量

| 变量              | 用途                                                    |
| ----------------- | ------------------------------------------------------- |
| JWT_SECRET        | 至少 32 字符的随机值，生产所有 API 实例使用同一个稳定值 |
| DATABASE_URL      | 本地默认 SQLite，Compose 默认 `sqlite:////data/dorm.db` |
| WEB_PORT          | Compose 静态网页端口，默认 8080                         |
| VAPID_PRIVATE_KEY | 服务端推送私钥，不能放前端 / 仓库 / 日志                |
| VAPID_PUBLIC_KEY  | 前端订阅时由接口提供的公钥                              |
| VAPID_SUBJECT     | 真实联系地址，如 `mailto:管理员邮箱`                    |

从部署平台的密钥管理或进程环境注入真实值。根 `.env.example` 只有示例，不要直接拿其中示例密钥对外发布；本项目工具不会创建真实 .env。

## 2. Docker Compose

需要可用 Docker Engine 与支持条件依赖的 Compose。当前 Mac 未安装 Docker，以下尚未运行验证：

```bash
docker compose config --quiet
docker compose up --build -d
```

环境缺少 JWT_SECRET 时配置解析会明确失败。migrate 一次性升级数据库；成功后启动 api，health 正常后启动唯一 worker 和 web。基础配置将网页绑定在服务器本机 `http://127.0.0.1:8080`，不会直接公开明文端口。公网使用下一节的 HTTPS 入口，API 不必公开另一端口。

SQLite 使用 `dorm-data` 卷；不要用 `docker compose down -v` 清理含真实宿舍数据的卷。更新源代码后先备份，在维护窗口重新构建与迁移；数据库 schema 回滚必须按备份和版本计划执行，不能仅切回镜像后忽略迁移。

worker 默认一个实例，不要手工 scale 到多个。API 可以扩实例，但 SQLite 适合小规模单机；扩大并发时迁移到 PostgreSQL，并单独实测事务与锁行为。

## 3. HTTPS 与反向代理

将自己的域名 DNS 指向真实服务器，允许外网访问 TCP 80/443。稳定的 JWT_SECRET 由部署平台密钥管理或受保护进程环境注入；项目不会创建或覆盖真实 .env。提供 DOMAIN 后使用新增的 Caddy 组合配置：

```bash
export DOMAIN='duty.example.com' # 替换为已经解析到服务器的真实域名
docker compose -f docker-compose.yml -f docker-compose.https.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.https.yml ps
curl -I "http://$DOMAIN/"
curl -fsS "https://$DOMAIN/health"
```

`docker-compose.https.yml` 与 `deploy/Caddyfile` 让 Caddy 负责证书申请 / 续期、HTTP 转 HTTPS 和 gzip/zstd 压缩，证书存储在持久卷中。默认内部桥接网段是 `172.30.61.0/24`；若与服务器或 VPN 网络冲突，设置 `DORM_PROXY_SUBNET` 为未占用网段。FastAPI 只信任此内部网络的代理头，API 没有公开端口；不要将不可信容器加入该网络。Nginx 保留 Caddy 提供的 HTTPS 协议头，避免斜杠补正重定向降级成 HTTP。

Docker Compose 合并解析、Nginx 原生语法检查、容器启动、服务器证书签发和云端重启恢复还未实测。本机没有 Docker；不能用 YAML 静态检查代替这些验收。

前端 Nginx 已配置：业务路径 `/auth /dorms /duties /notifications /push /health /docs /openapi.json` 转发 API，其他深链接回退 index.html；SW / Manifest 不长期缓存，带哈希静态资源可长期缓存。个人 API 响应标记 no-store，自定义 SW 只预缓存应用静态文件。

上线后逐项验证 `/health`、Swagger、`/schedule` 刷新、Manifest 和 `/sw.js`。普通 HTTP 局域网访问可以调试业务，iPhone PWA Push 必须用真实 HTTPS。

## 4. Web Push

1. 用户在本机执行 `backend/.venv/bin/python scripts/vapid_keys.py`，保存生成值到自己的部署密钥管理；替换为真实 VAPID_SUBJECT。
2. API 与唯一 worker 同时注入三个变量并重启，不要频繁更换 VAPID 密钥。
3. 打开 `/push/public-key`（登录后）确认 available 为 true；“我的”会根据配置显示能否开启通知。
4. iPhone 需要 iOS 16.4+，在 Safari 添加到主屏幕，并从图标打开，再主动点击“开启本设备通知”。授权请求在点击处理里直接触发，避免失去 Safari 用户手势。
5. 订阅成功后发送本人测试通知，队列由 worker 下一次扫描投递；关闭网页并锁屏，实际确认收到，再点击通知检查目标日期。
6. 拒绝、未安装、不支持时页面提供说明；专注模式与系统通知设置可能影响显示，记录实际结果。

推送地址只接受 Apple / Google / Mozilla / Windows 支持的 HTTPS 服务域名，避免把任意用户地址作为服务端请求目标。超时 / 崩溃时仍可能重复投递，稳定 tag 合并同一提醒；不承诺端到端恰好一次。

## 5. 提醒和恢复

业务时区 Asia/Shanghai。每分钟扫描，进程启动扫描最近 60 分钟；前日 21:00、当日 08:00、19:00 的每个任务 / 接收人 / 类型只创建一条站内消息。超过补查窗口不补发，首页仍显示未完成或逾期状态。

Push 每设备首次发送 + 最多三次重试，间隔约 2 / 4 / 8 分钟；一小时后停止过时消息投递。发送前在事务中确认当前有效成员、执行人、任务未完成与设备归属；SQLite 逐设备事务避免整批网络请求持有写锁，每次发送网络超时 5 秒，每轮最多处理 8 个待投递设备。API 完成 / 调整与发送检查串行化；已经在传输中的系统通知无法撤回。

主屏幕网页的长期登录目前使用 sessionStorage，关闭页面后可能需要重新登录；推送订阅保留到用户取消或失效。退出登录会尝试取消本设备订阅，离线失败时明确提示。后续需要长期自动登录时再增加刷新令牌机制。

## 6. 数据备份与恢复

开发 SQLite 在线备份：

```bash
backend/.venv/bin/python scripts/backup.py data/dorm.db data/backups/填写时间-dorm.db
```

目标必须是新路径，脚本拒绝覆盖。使用 SQLite backup API，不直接复制正在写入的数据库文件；备份后执行 integrity_check。

恢复先停止 API / worker，在隔离临时目录检查备份的 integrity_check / foreign_key_check 和账号、任务数量。确认需要恢复的版本与路径，再由运维替换实际数据；不要用测试数据库覆盖正式库。本次已在临时目录实际演练恢复，证据在 `docs/evidence/persistence.json`。

PostgreSQL 使用 `postgresql+psycopg://...` 配置与 Alembic，连接凭据由环境注入；SQLite 转移数据需要单独迁移脚本和一致性检查。当前只有兼容设计与依赖，未实际运行 PostgreSQL，不能直接标记生产迁移完成。
