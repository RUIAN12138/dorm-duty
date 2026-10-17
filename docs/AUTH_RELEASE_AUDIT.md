# 认证准入与部署核验（2026-10-17）

## 唯一正式运行路线

`nginx -> 127.0.0.1:8086 -> scripts/local-server.mjs -> site/runtime/email-runtime.cjs -> Worker business API -> SQLite`。
业务 Worker 只是 Node 服务内部复用的业务模块，不能单独对公网部署为新版服务。Python `backend/` 已废弃，根 compose 仅显式 `legacy` profile 可启动。

修改前正式 `current` 为 `20261017-foreground-recovery-v43`，systemd active；正式 v43 包内已核实 `randomInt(0,1e6).padStart(6,"0")` 六位逻辑；不是旧四位实现。nginx 的 `/dorm-duty/` location 确实设置 `X-Real-IP $remote_addr`。Node 覆盖内部 `X-Dorm-Client`，删除外来 `CF-Connecting-IP`，不信任 X-Forwarded-For 链。

## Cloudflare 旧入口

2026-10-17 经已授权 Wrangler 控制面核验并执行：

- Worker `lundao-dorm-duty` 原部署仍存在；使用 triggers deploy 取消全部公网目标，`workers_dev=false`、`preview_urls=false`、routes=[]；命令返回 No targets deployed。公网原 `/health` 返回 Cloudflare HTTP 404。
- Pages `lundao-dorm-duty-2968530971` 已删除，project list 返回空数组。删除包括该项目旧预览部署；本站无需再支持这些入口。当前电脑直连旧域名 TLS 失败只作为网络现象，下线结论来自控制面删除和列表确认。
- D1 `lundao-dorm-duty-db` 仍存在，未删除、清空、迁移或改写数据。核验记录在本机忽略目录 `data/server-deploy/`。
- `cloud:deploy`、`pages:deploy` 拒绝旧业务发布；不应绕过脚本直接用旧 Worker 重新上线。

## 会话与入口规则

- 任一正式退出入口调用同一 logoutAll：并行尝试 `/auth/logout`（本机已保存的管理员/成员凭据）和 `/email/logout`（HttpOnly Cookie）。注销幂等，失效凭据也可清除。
- 本地立即退出；服务端失败明确提示“服务端会话未撤销”，持久保留待撤销列表。再次联网/进站先重试撤销，不能靠残留 Cookie 静默恢复登录。同源标签页同步退出。
- `/email/logout` 删除该邮箱登录会话及它派生的房间 grants；不撤销另一设备独立登录的邮箱会话。`/auth/logout` 删除请求所持凭据，不授权查询其他用户。
- 邮箱验证未完成时，关闭验证抽屉回安全入口；原正式任务不会因关闭弹层继续操作。已有邮箱登录重新验证时，错码显示仍使用旧邮箱身份。
- 邮箱准入启用后 `/admin/login` 返回邮箱入口，策略加载失败也不退回旧密码表单；正式旧 login/register API 仍返回统一409。离线开发中保留旧账号流程，但注册结果统一201及同一提示，需登录后才能读取用户资料。
- 遗留密码端点：账号桶5次/15分钟，IP桶60次/15分钟；成功登录清账号失败桶。数据库原子计数并清过期桶。新旧账号注册均执行密码哈希，避免立即返回暴露用户名存在性。
- 设备和成员会话固定90天；迁移仅压缩过长 expiry，不旋转凭据，不修改用户或历史。邮箱登录仍固定30天，旧密码账号仍固定7天；`/auth/me` 不续期。

## 邮箱发送与错误处理

- 六位验证码使用 `randomInt(0,1000000).padStart(6,"0")`；只存 HMAC。
- code_hash 非64位hex明确401，不触发 timingSafeEqual 长度异常500。
- 重发不废除仍有效且未使用的其他验证码，避免第三方重发立即破坏已送达验证码。每challenge最多5次失败、10分钟有效；现有每邮箱5次/小时、每IP30次/小时、全站100次/小时及60秒间隔仍有效。
- 图形验证未接入。发送额度仍可能被定向消耗，这是未消除的风险，不能把限流称为完全防锁号。若观察到持续滥用，再接入需服务端校验的一次性挑战；仅前端图形/勾选无防护价值。
- 首次注册说明直接在表单显示，邮件提醒默认不选；已存在账号偏好保持原值。
- 首屏网络读取最多自动重试两次；online/focus再恢复，手动重试不整页刷新。服务更新仍由原更新提示激活，避免用户输入中突然强刷。

## 验收

`node site/scripts/check-auth-boundaries.mjs` 使用独立SQLite和注入邮件验证注销、过期、限流、注册同响应、OTP脏数据及重发规则。
`node scripts/check-email-experience.mjs` / `DORM_BROWSER=webkit ...` 使用HTTPS Cookie与真实Vue页面，检查入口、退到安全页、离线注销重试、其他标签页同步退出、初始化重试、游客退出及移动布局。
实体手机后台恢复、实际收件和原生安装版本轮未验收，不能从浏览器自动化推导通过。
