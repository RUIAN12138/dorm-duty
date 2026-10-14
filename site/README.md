# 轮到 · Cloudflare Workers + D1 托管源码

本目录复用原 Sites 站点身份，将 Vue 资源和业务 API 打包为单个 Worker ESM。业务直接访问 `env.DB`，不再调用 Mac、FastAPI 或临时隧道，也不读取 `API_ORIGIN`。迁移代码已完成本地验收，尚未发布；步骤见 [CLOUDFLARE_DEPLOYMENT](../docs/CLOUDFLARE_DEPLOYMENT.md)。

- `worker/backend.mjs`：排班、宿舍、匿名创建、本人打卡、历史、消息与管理权限。
- `worker/chores.mjs`：地板、厕所、抬水、专用成员身份、创建者配置、定向提醒及完成日历。
- `db/schema.ts`：原六张业务表加 `sessions`，以及六张新 chores / 成员身份表；令牌只保存 SHA-256 哈希。
- `drizzle/`：不可改写的 `0000` 初始结构及新增 `0001` 迁移；迁移仅含结构，演示数据另行初始化。
- `.openai/hosting.json`：原 project_id，`d1: "DB"`、`r2: null`。

## 构建与检查

先在 `../frontend` 完成前端生产构建，再执行：

```sh
node scripts/check-cloud-backend.mjs
node scripts/check-chores.mjs
node scripts/embed-frontend.mjs
node --check worker/index.js
node scripts/check-worker.mjs
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

`worker/index.js` 是生成的正式部署入口，包含全部前端资源和业务实现。产物包含 Worker、托管 Manifest 和 Drizzle 迁移。业务检查使用真实 SQLite 的原子 D1 API 适配器；Worker 检查验证逐字节资源、SPA、缓存、绑定错误，以及禁止外部 fetch 时仍能处理业务。本地通过不等于实际 Worker / D1 通过。

## 数据与运行时配置

`DEFAULT_DORM_INVITE_CODE` 指向用户主动选择游客模式时的演示宿舍；缺少有效默认值时要求显式邀请码，不会挑选真实宿舍。正式用户通过自己的邀请码进入。发布新 Worker 时删除旧平台 `API_ORIGIN`。

新增结构时更新 `db/schema.ts`，运行 `npm run db:generate` 并检查 SQL；已部署的 SQL / journal / snapshot 不得覆盖。没有 R2 上传、云端 Cron 或 Web Push 投递。成员可主动发送站内提醒，页面打开时获取；原消息接口的自动提醒保持访问触发。

匿名创建返回当前设备的管理员令牌。正式宿舍通过邀请码选择名字、确认图案，可领取只绑定该成员的专用 chores 令牌，用于本人打卡、提醒同宿舍成员及修改本人图案；它不能访问原账号管理 API。选择创建者名字也不授予管理员权限。这是熟人宿舍的信任式选人流程，不提供强身份验证。管理设置校验创建者权限，游客示例只读。业务响应 `no-store`，SW 不缓存 API；含邀请码页面使用 `Referrer-Policy: no-referrer`。完整规则见 [CHORES](../docs/CHORES.md)。

## 发布

通过 Sites 官方 `site-workflow.mjs` 同步源码、运行剩余检查并打包，源码提交与部署包一致后保存 / 部署。凭据只保留在会话内存并经隐藏 stdin 使用。用户要求免登录入口，最终需要开放网页访问；当前连接无法读取原站点，尚未改变线上访问范围或发布新版。
