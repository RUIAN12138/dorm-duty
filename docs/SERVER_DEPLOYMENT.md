# 服务器 IP 入口

用户已授权将 `8.148.190.114` 作为正式入口，明确不使用现有域名。正式地址为 [https://8.148.190.114/dorm-duty/](https://8.148.190.114/dorm-duty/)。2026-10-14 已上线，普通浏览器与真实 API 验证通过；用户已确认手机 Safari 能正常打开并看到任务，具体网络类型未记录。

## 最新发布

2026-10-14 V6 发布 `20261014-system-push-v6`：系统通知订阅、加密发送、测试与停用已接入，iPhone 用户已确认收到通知。该版本同时保留自由轮次：地板、厕所分别使用自由轮次；每人一次，全员完成该项后自动重开。抬水按实际完成驱动顺序轮换，不显示每日截止。创建者可以保留自由轮次或切换按日排班。提醒自动弹出、日历类型图标和列表继续保留。

此次在备份后应用新增迁移 `0002_unknown_galactus.sql`，未修改既有迁移。旧的未完成地板 / 厕所日排班取消，已有完成历史逐条校验不变，自由轮次从第 1 轮开始；抬水当前人和序号保留。详见 [自由轮次验收](evidence/voluntary-rounds/README.md)。

浏览器缓存旧版本时，刷新并点击「有新版本可用 → 更新页面」。不要清除网站数据，否则会丢失当前设备身份与创建者管理凭据。

## 当前进度

2026-10-14 最新版本为 `20261014-bottom-sheet-v15`，bundle SHA-256 `b22686b50f572d431c51d03e5d0c5e97b66b0b3d80028449ca6829ac895dec07`。抬水详情独立使用底部垂直转场，遮罩分开淡入淡出，关闭完成才清空任务内容；轻拖平滑回正、下拉关闭。浏览器捕获的进出帧无缩放，退出时高度与内容保持一致；真机触摸手感尚待验收。12 个公网资源与发布构建一致，39 条既有完成记录逐条校验保留。证据见 `evidence/bottom-sheet/README.md`。此前打卡同步与导航验收见 `evidence/sync-back/README.md`、`evidence/mobile-navigation/README.md`。

- 顶部名字不可点击，右上角只有一个「…」；从菜单明确选择加入其他宿舍才打开邀请码，取消或刷新仍保留原成员。
- 抬水页点名字催促：按压回弹、波纹和浮字；实际提醒合并为同一发送者/任务 60 秒一次。游客动画不发送消息。
- 新增 `0004_native_push.sql`，只扩展设备元数据；发布前后 39 条完成记录一致。新增原生设备绑定和定向投递接口。
- Android APK 和鸿蒙未签名 HAP 已构建，尚无推送平台应用、厂商通道配置和鸿蒙签名，也未在安卓/鸿蒙真机验收。详细步骤见 [安装版通知接入](../native/README.md)。
- 服务器 Python 默认是 3.6.8，部署、在线备份及记录验证必须显式使用 `/usr/bin/python3.11`。备份服务已经使用该版本。
- 原 iPhone Web Push 验收和历史版本说明保留在下方。


- Node 22 与持久化 SQLite 后台已经安装在独立目录；systemd 管理 `dorm-duty.service`，监听 `127.0.0.1:8086`。
- D1 已导出私有备份，并通过表结构、完整性、外键检查后迁入服务器。切换前、切换后再次导出，均与初始备份字节一致。原 D1 保留，正式写入统一到服务器 SQLite。
- 前端已构建为 `/dorm-duty/` 前缀，路由、API、图标、Manifest 和 Service Worker 使用同一前缀。
- IP HTTPS 已上线，证书自动续期、每日数据库备份均已启用并成功运行；Certbot 模拟续期及 deploy hook 平滑重载通过。
- 现有 Nginx 不处于 `nginx.service` 的活动状态，不能使用 `systemctl reload nginx`。已确认现有 master 与 `/usr/local/nginx/sbin/nginx` 配置一致，使用 Nginx 自身的 `-s reload` 成功加载；不启动第二个 Nginx，也不停止现有网站。

## 发布与回滚边界

业务文件：`/opt/dorm-duty/releases/20261014-bottom-sheet-v15`，`/opt/dorm-duty/current` 指向当前版本。持久化数据库：`/var/lib/dorm-duty/dorm.sqlite`，不会随源码更新重建。

IP 虚拟主机配置：`deploy/nginx-ip.conf`，安装到 `/opt/dorm-duty/nginx-ip.conf`。首次证书验证先使用 `deploy/nginx-ip-acme.conf`，仅开放 ACME 验证文件，其余 IP HTTP 请求返回 503。

原 Nginx 配置修改前复制为服务器私有备份。只将旧虚拟主机的 IP 别名移到独立虚拟主机，保留原域名及全部原网站接口。先执行 `nginx -t`，失败则恢复备份，验证成功后平滑重载。

Certbot 使用独立 Python 虚拟环境和 `/opt/dorm-duty/letsencrypt` 配置目录，不读取或修改现有域名证书。IP 证书使用 Let's Encrypt `shortlived`，有效期六天；续期 timer 每天检查两次，续期后执行 Nginx 配置检查及平滑重载。必须验收真实生产证书以及 staging `renew --dry-run`，不能把测试证书安装到公网。

数据库每日通过 SQLite backup API 在线备份，包含已提交的 WAL 数据，备份需通过完整性与外键检查。备份仅保存在服务器私有目录 `/opt/dorm-duty/backups`，不提交仓库。目前脚本不自动删除备份；后续应依据磁盘使用及恢复需要制定保留策略。

## 验收

`node scripts/verify-server.mjs https://8.148.190.114 data/rounds-release-v5/site/worker/index.js` 会创建独立测试宿舍，通过标准 TLS 校验检查同源资源、创建、成员权限、自定义、提醒、本人打卡、抬水并发轮换、日历和刷新；输出脱敏证据到 `docs/evidence/server/`。

实际服务重启后，16 条完成记录与任务设置的摘要保持一致；独立验收宿舍完成地板、厕所与两轮抬水。真实公网检查 8 组 / 329 项通过。原域名首页返回 200，Tabbit 与内置浏览器无证书警告，三页和刷新恢复成员正常。未重启整台共享服务器，不能把应用重启验证视为整机恢复验收。现有 Nginx 开机单元已启用。

用户已通过手机 Safari 确认入口和任务正常，证据为 `docs/evidence/server/phone-access.json`。Wi-Fi 与蜂窝网络未分别记录；主屏幕安装和系统 Push 本轮未验收。

证据：`docs/evidence/server/service-status.json`、`deployment.json`、`cloud-cutover.json` 和 `2026-10-14T03-46-43-200Z_mv7kiyyo_471a09d8/api.json`。

## 自由轮次发布校验

- `node site/scripts/check-rounds.mjs`：使用独立内存 SQLite 验证轮次、并发、成员变化、模式切换及历史迁移。服务器 Node 22 同样通过。
- `node scripts/verify-rounds.mjs https://8.148.190.114`：创建独立六人验收宿舍，验证实际公网并发和任务完成；仅测试宿舍有写入。
- `node scripts/verify-rounds.mjs https://8.148.190.114 verify`：读取本机私有测试夹具，检查应用重启后轮次、抬水序号和历史恢复；不写业务数据。
- `node scripts/verify-public-assets.mjs https://8.148.190.114`：只读验证当前主页面、JS/CSS、Manifest 和 SW 字节一致。

V5 bundle SHA-256 为 `81c9907d9917ed08c4798d6c7cfb3210b05f9fca8c6a6e1abaa22c167dfb707c`。完整新功能、原三类接口和原管理 API 检查分别见本轮证据目录；应用重启不等于整机重启、实体手机新版本或锁屏通知验收。

## 迁移与回退

原 Cloudflare Workers 和 Pages 的生产入口已部署 `deploy/cloudflare-moved.mjs`：网页 302 到 IP 地址，旧 API 所有方法返回 410 与新入口提示；新的 SW 替换旧导航缓存。数据仍保留在原 D1，迁移后不向旧生产 API 写入。历史 Pages 预览部署保留作回退资料，不应继续访问或写入旧预览版；预览并未删除或宣称完全关闭。

创建者的设备凭据不会自动从旧域名复制到 IP 来源。已有成员可用原邀请码重新选择自己；原管理员的恢复需其原设备凭据，不能仅选同名成员就授予管理权限。新宿舍应在正式 IP 地址创建。

Nginx 原配置备份：`/opt/dorm-duty/nginx-before-ip-20261014T034545Z.conf`。IP 虚拟主机独立，原域名证书与代理位置保留。原 Worker 版本 `8d6871d2-f117-4fdd-ab4f-42674763c14c`、Pages 部署 `6dbfb721-dff5-4cef-95b9-02382c648467` 保留；回退前先冻结写入、备份并迁回服务器最新记录，不能直接启用旧 D1 造成历史丢失。

当前服务维护通过 SSH 进行。检查 `systemctl status dorm-duty`；修改宿舍代码后先构建并校验独立版本，备份数据库，原子切换 `/opt/dorm-duty/current`，再重启 `dorm-duty`。修改 Nginx 后先 `nginx -t` 再 `nginx -s reload`，不要在已有实例运行时启动第二个 Nginx。

官方 IP 证书配置参考：[Let's Encrypt：Certbot 的 IP 与六天证书](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)。

### 本轮回退注意

V4 和 V5 的后端与迁移相同，V5 只修正小屏容器高度，可以在这两版之间回退源码。若回退 V3，旧程序并不理解自由轮次：不能仅交换符号链接并认为业务规则已回退；应先冻结写入，备份当前最新数据，再明确未完成任务的转换方案。保留新增完成历史，不恢复旧数据库覆盖新打卡。

## 系统通知维护（V6）

新增迁移 `0003_grey_jimmy_woo.sql`，独立保存 `chore_push_subscriptions`、`chore_push_jobs`，不更改任务完成历史。站内消息和设备发送队列原子入库，队列在 Node 服务内每两秒处理；关闭服务不会丢已提交任务，重启会恢复。5 次有界发送与退避，超 24 小时取消；推送提供商 accepted 仅表示接受，不表示手机收到。

打包运行模块 `site/runtime/push-runtime.cjs` 由 `node site/scripts/build-push-runtime.mjs` 构建，构建依赖锁定 `web-push@3.6.7`；Node 运行不用联网安装 npm。代码发布包必须包含该模块和全部迁移。模块由 `scripts/local-server.mjs` 加载；只有 `DORM_DEPLOYMENT=server` 启用推送，原本地 HTTP 服务保持站内模式。

VAPID 仅首次生成在 `/var/lib/dorm-duty/webpush-vapid.json`，0600，不写源码，不与原应用凭据共用。备份脚本同步保存 0600 的 `.vapid.json`；恢复业务数据库须同时恢复匹配通知密钥。不能重新生成已有密钥来解决浏览器兼容问题，否则已有设备订阅失效。

V6 bundle SHA-256 `d73d64215de074ff1b91a526a2c554d2e4d21dbbf811e5b51b9b47a0a6eebec8`。最新同源资源只读检查：

```bash
node scripts/verify-public-assets.mjs https://8.148.190.114 docs/evidence/system-push/public-assets.json
node site/scripts/check-member-push.mjs
```

[系统推送证据](evidence/system-push/README.md)包含 Node 22 8 组 / 119 项、公网权限与配置、重启公钥保持、原 38 条完成记录逐条不变，以及用户明确确认的 iPhone 实际接收。安卓 / 鸿蒙实体接收、锁屏与点击导航单独验收。V5 的资源路径和 bundle 摘要在前文保留为该版本的历史证据。回退 V5 会停止新推送，已提交数据和密钥仍保留；不要恢复旧数据库覆盖新打卡。
