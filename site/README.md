# 轮到 · Web 业务模块

本目录是正式 Node/SQLite 服务复用的业务模块。唯一正式链路是：`frontend -> scripts/local-server.mjs -> site/worker -> SQLite`。

Cloudflare Worker/Pages 代码只保留历史兼容与停用提示，禁止单独发布；`backend/` FastAPI 同样属于历史实现。正式发布只使用根目录 `npm run web:release -- <名称>` 生成包，再交给 `deploy/install-release.py` 安装。

- `worker/backend.mjs`：排班、宿舍、匿名创建、本人打卡、历史、消息与管理权限。
- `worker/chores.mjs`：地板、厕所、洗手池、抬水、专用成员身份、创建者配置、定向提醒及完成日历。
- `db/schema.ts`：原六张业务表加 `sessions`，以及六张新 chores / 成员身份表；令牌只保存 SHA-256 哈希。
- `drizzle/`：不可改写的 `0000` 初始结构及新增 `0001` 迁移；迁移仅含结构，演示数据另行初始化。
- `.openai/hosting.json`：原 project_id，`d1: "DB"`、`r2: null`。

## 构建与检查

在仓库根目录运行统一命令：

```sh
npm run web:build
npm run web:verify
```

`worker/index.js` 是本地开发兼容入口，不是可独立部署的 Worker。`web:build` 的独立产物位于根目录 `data/web-build-*/`；业务检查使用临时 SQLite 数据，不访问正式数据库。

## 数据与运行时配置

`DEFAULT_DORM_INVITE_CODE` 指向用户主动选择游客模式时的演示宿舍；缺少有效默认值时要求显式邀请码，不会挑选真实宿舍。正式用户通过自己的邀请码进入。

新增结构时更新 `db/schema.ts`，运行 `npm run db:generate` 并检查 SQL；已部署的 SQL / journal / snapshot 不得覆盖。成员可主动发送站内提醒，页面打开时获取。

匿名创建返回当前设备的管理员令牌。正式宿舍通过邀请码选择名字、确认图案，可领取只绑定该成员的专用 chores 令牌，用于本人打卡、提醒同宿舍成员及修改本人图案；它不能访问原账号管理 API。选择创建者名字也不授予管理员权限。这是熟人宿舍的信任式选人流程，不提供强身份验证。管理设置校验创建者权限，游客示例只读。业务响应 `no-store`，SW 不缓存 API；含邀请码页面使用 `Referrer-Policy: no-referrer`。完整规则见 [CHORES](../docs/CHORES.md)。

## 历史代码

- `scripts/cloudflare.mjs`、`scripts/build-pages.mjs`：仅用于历史产物检查。
- `scripts/retired-deployment.mjs`、`deploy/cloudflare-moved.mjs`：旧入口只返回停用或迁移提示。
- 不要为历史 Worker/Pages 增加业务功能；业务修改进入 `worker/`，通过正式 Node 链路验收。
