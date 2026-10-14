# 直接发布到 Cloudflare

> 2026-10-14 更新：正式服务已迁至 [HTTPS IP 入口](https://8.148.190.114/dorm-duty/)。旧 Workers 与 Pages 生产入口已改为迁移跳转，旧业务接口返回 410，不再写原 D1。下文是此前 Cloudflare 阶段的历史记录，不能作为当前正式发布状态。服务器验证及维护见 [SERVER_DEPLOYMENT](SERVER_DEPLOYMENT.md)。


> 公网可用性更新（2026-10-13 晚）：用户的 Tabbit 报 `ERR_TUNNEL_CONNECTION_FAILED`，手机 Safari 显示连接服务失败，另开 `/health` 也无法访问。此前手机入口成功是历史反馈；当前部署与 D1 可经受限测试连接正常响应，但普通电脑及手机网络可用性尚未通过验收。正在落实正式入口与跨网络验收，不能把本机固定 IP 检查代替用户正常访问。见 [当前连接失败证据](evidence/cloudflare/access-failure-2026-10-13.json)。

此路径使用自己的 Cloudflare 账号，独立于旧 Sites 站点，不修改其身份或线上版本。网站已实际上传并发布到 [轮到 · 宿舍值日](https://lundao-dorm-duty.2968530971.workers.dev)，版本 `8d6871d2-f117-4fdd-ab4f-42674763c14c`。真实 Workers / D1 健康检查及 8 组 / 327 项远程 API 断言通过；当前电脑默认 DNS / 代理访问失败；用户已确认手机可以正常打开，完整真机业务、主屏幕和锁屏通知仍待验收。

## 本次发布结果

- Worker：`lundao-dorm-duty`；D1：`lundao-dorm-duty-db`，已应用两条迁移。
- 访问范围：公开网页入口，室友使用邀请码，无需 Cloudflare 账号或账号密码登录。
- 源 Worker SHA-256：`34dc3d2d02f7f2f2c50bc239bc2f079be998c1dc9037e799fe749056b9b7a250`。
- [部署记录](evidence/cloudflare/deployment.json)；[真实云端 API 验收](evidence/cloudflare/2026-10-13T12-56-48-173Z_mv6oqj3h_8a800386/api.json)。

公网验收只创建一个随机命名的独立假数据宿舍，保留两成员、四条完成记录用于追踪；没有修改其他宿舍或上传本地数据库。网页三个路径、入口 JS/CSS、Manifest、Service Worker 和图标与当前构建一致；真实 D1 中的三类自定义、权限、本人及重复打卡、并发抬水轮换、提醒限频和完成日历通过。

本机域名解析返回 `198.18` 段的代理虚拟地址，默认 Node 请求连接重置；本机 HTTP 代理对该域名 CONNECT 返回 503，内置浏览器报 `ERR_TUNNEL_CONNECTION_FAILED`。Cloudflare 公开 DoH 返回真实 A 地址后，通过限定该域名的解析建立正常 HTTPS，健康和业务验收全部通过。该验证保留原域名、SNI 与证书检查，没有使用模拟请求，也没有更改系统代理、DNS、证书或安全设置。它证明当前云端应用和 D1 正常响应。用户随后确认手机可以正常打开，见[手机入口确认](evidence/cloudflare/phone-access.json)；这项用户反馈仅确认入口访问，不代表完整真机业务、主屏幕安装或锁屏通知验收。

如果发布命令已返回 Uploaded、正式 URL 和 Current Version ID，而随后的网络健康检查失败，应先保留部署结果并复查连接，再运行 HTTP / API 验收，不重复上传或新建 D1。用户已选择继续使用 Cloudflare，另有服务器暂作备用；服务器尚未接入，也不是实时备份。

## 发布内容

- 网页与 API：`site/worker/index.js`，Vue 页面和静态资源包含在同一个 Worker 中。
- 数据库：独立 D1 `lundao-dorm-duty-db`，绑定名 `DB`。
- 迁移：复用 `site/drizzle/0000_demonic_pixie.sql` 与 `0001_far_crusher_hogan.sql`；不改写迁移。
- 游客：单独创建只读 `6-402` 和六位假成员；密码禁用，无管理员设备会话。
- 正式用户：先创建 / 加入宿舍，选名字与像素标记；创建者可自定义内容、时间与顺序。

本地 `data/dorm-local.db` 不上传。首次云端部署是独立的新数据集，已有本地验收数据继续保留。

## 账号授权

在 `site/` 中运行官方 OAuth 登录，由账号本人在官方网页完成登录与授权：

```sh
npx --yes wrangler@4.149.0 login --scopes account:read user:read workers:write workers_scripts:write d1:write
npm run cloud:check
```

普通浏览器回调不可用时，可用 `login --device --browser=false` 加相同 scopes，由本人在官方设备授权页提交。`workers_scripts:write` 是上传网站脚本所需的独立权限，发布脚本在操作远程资源前检查已知 OAuth scopes，避免把权限缺失误判为资源不存在。

凭据由 Wrangler 管理。不要把密码、API Token 或授权回调代码发到聊天或提交到 Git；辅助发布脚本不读取凭据文件，不把用户邮箱或令牌写入证据。

只有一个账号时自动选择；有多个账号时通过当前命令的 `CLOUDFLARE_ACCOUNT_ID` 指定目标。账号 ID 和 D1 ID 是非密钥的资源配置，将写入 `site/wrangler.json`；不修改 `.env` 或旧 Sites Manifest。

## 试发布与实际发布

```sh
# 不上传，不创建远程资源，也不需要登录。
npm run cloud:dry-run

# 仅在确认开放入口后执行，创建 D1、应用迁移、初始化游客并发布。
npm run cloud:deploy
```

`cloud:deploy` 明确发布开放的 `workers.dev` 网页入口，不要求 Cloudflare 平台账号登录。成员使用宿舍邀请码进入，业务权限由设备令牌校验。这是熟人宿舍之间的信任式选名入口。

用户已明确选择开放入口、室友凭邀请码免账号使用，本轮按此范围发布。若以后改为仅本人使用，先配置 Cloudflare Access 保护入口，不运行开放入口发布命令。

如果账号已有同名 D1，但配置尚未记录 ID，脚本停止，不会自行覆盖或猜测其他数据库。核对目标资源后填写实际 `database_id` 再继续。已创建的数据库会被记录，后续发布复用它；只执行尚未应用的迁移。重复发布不重建游客，也不重置宿舍和完成记录。

## 交付验证

成功发布必须取得真实返回的 URL 和版本 ID，并确认 `/health` 返回：

```json
{ "status": "ok", "runtime": "cloudflare-worker", "storage": "d1" }
```

发布摘要写入 `docs/evidence/cloudflare/deployment.json`，包括部署地址、版本 ID、D1 ID、源 Worker SHA-256、健康结果；不包含令牌。

继续对真实 HTTPS 地址运行独立远程验收：

```sh
node scripts/verify-cloudflare.mjs https://实际返回的地址.workers.dev
```

远程验收创建随机命名的独立测试宿舍，令牌只保存在内存，检查创建 / 配置、本人完成、权限、重复请求、抬水并发轮换、定向提醒、完成日历与三个页面。结果写入单独的 `docs/evidence/cloudflare/`，不会冒用旧的本地证据。

Wrangler 的 dry run 仅确认部署包可以生成，不代表实际 Workers、实际 D1 或公网发布成功。iPhone Safari、主屏幕安装和锁屏 Web Push 仍需单独真机验收；当前未启用云端 Cron 或 Web Push。
