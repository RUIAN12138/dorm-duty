# 轮到 · Web 业务模块

本目录是正式 Node/SQLite 服务复用的业务模块。唯一正式链路是：`frontend -> scripts/local-server.mjs -> site/worker -> SQLite`。

Cloudflare Worker/Pages 代码只保留历史兼容与停用提示，禁止单独发布；`backend/` FastAPI 同样属于历史实现。正式发布只使用根目录 `npm run web:release -- <名称>` 生成包，再交给 `deploy/install-release.py` 安装。

- `worker/backend.mjs`：宿舍、排班、本人打卡、历史、消息与管理权限；正式调用要求 Node 邮箱网关能力。
- `local/email-runtime.mjs`：邮箱验证码、Cookie 会话、成员绑定与解绑、准入和邮件投递。
- `worker/chores.mjs`：地板、厕所、洗手池、抬水、专用成员身份、创建者配置、定向提醒及完成日历。
- `db/schema.ts`、`drizzle/`：业务、邮箱、会话、通知与审计结构；迁移只新增，已应用文件不得改写。实际迁移清单以目录为准。

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

正式用户先验证邮箱，再创建宿舍，或凭邀请码与完整姓名绑定未被其他邮箱绑定的成员。创建者权限来自邮箱关联，不再签发独立设备管理员会话。邮箱会话固定有效期，退出会撤销相应会话；解绑只撤销目标宿舍的关联授权，不改写打卡历史。完整身份与边界见 [准入审计](../docs/AUTH_RELEASE_AUDIT.md)。

仅“知道邀请码与姓名”仍不是实名证明，未绑定身份存在被知情者先认领的边界。游客示例只读。业务响应 `no-store`，SW 不缓存 API；含邀请码页面使用 `Referrer-Policy: no-referrer`。

## 历史代码

- `scripts/cloudflare.mjs`、`scripts/build-pages.mjs`：仅用于历史产物检查。
- `scripts/retired-deployment.mjs`、`deploy/cloudflare-moved.mjs`：旧入口只返回停用或迁移提示。
- 不要为历史 Worker/Pages 增加业务功能；业务修改进入 `worker/`，通过正式 Node 链路验收。
