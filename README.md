# 轮到 · 宿舍值日管理系统

宿舍值日、抬水轮换、完成日历与提醒。Vue 手机网页、Node SQLite 后台、Android / HarmonyOS 安装版工程。

**正式公网入口：** [打开轮到](https://8.148.190.114/dorm-duty/)。先验证邮箱，再创建宿舍或凭邀请码与完整名字绑定身份；游客体验只访问演示数据。

**新的账号路线：** 邮箱验证码注册 / 登录、现有身份绑定、跨设备找回和 SMTP 邮件提醒已实现；正式 SMTP 测试邮件及验证码绑定已由用户确认成功。新版正式入口要求先验证邮箱，新建宿舍自动关联创建者；旧成员重新验证后恢复原身份。极光基础通知作为 App 在线补充，iOS 原有 Web Push 保留，详见 [邮箱账号与邮件提醒](docs/EMAIL_ACCOUNTS.md)。

## 唯一正式部署路线

正式服务使用 `scripts/local-server.mjs` + `site/` Node/SQLite 邮箱准入包装层，发布入口是 `deploy/prepare-release.py` / `deploy/install-release.py`。
`backend/` Python/FastAPI 已废弃，仅保留历史回归，不具备邮箱准入，禁止作为正式服务部署。根目录 compose 仅可显式启用 `legacy` profile。
旧 Cloudflare Worker/Pages 代码不包含 Node 邮箱包装层，不得重新发布为业务入口；旧域名停用状态须经控制面和公网核验，详见 `docs/AUTH_RELEASE_AUDIT.md`。

## 快速开始

双击 `启动.command`，或在项目根目录运行：

```bash
./scripts/local.sh
```

访问 http://127.0.0.1:8081/。本地数据库 `data/dorm-local.db` 与正式服务器数据独立，不自动同步。

根级 Web 命令：`npm run web:dev` 启动、`npm run web:build` 构建、`npm run web:verify` 验收、`npm run web:release -- <名称>` 只生成发布包。

> 注意：`site/worker/index.js` 仅是本地开发兼容入口，不提交到仓库。`web:build` 产物写入带时间戳的 `data/web-build-*/`；发布包写入 `data/<名称>/`，不会覆盖正式入口。

## 核心规则

- **值日**：地板、厕所默认各自使用自由轮次，每人本轮主动做一次，全员完成这一项后自动开启下一轮；创建者也可切换为按日排班并配置时间。
- **抬水**：按顺序轮换，实际抬完才打卡，自动交给下一位。
- **日历**：按上海时区实际完成日期显示热力深浅，点击日期查看人员与记录；列表按日期折叠。
- **提醒**：站内提醒（同一发送人、接收人、任务一分钟内最多一条）与系统通知（Web Push，iPhone 需 iOS 16.4+ 添加主屏幕并授权）。
- **身份**：正式成员先验证邮箱，再凭邀请码和完整名字绑定；名字本身不是秘密凭证，已绑定身份不能被其他邮箱抢占。创建者恢复规则见 [创建者恢复](docs/CREATOR_RECOVERY.md)。

完整规则见 [CHORES](docs/CHORES.md)。

## 检查

```bash
npm run web:verify
```

业务检查（独立测试数据库）：

```bash
node site/scripts/check-cloud-backend.mjs
node site/scripts/check-chores.mjs
node site/scripts/check-recency.mjs
node site/scripts/check-rounds.mjs
node site/scripts/check-worker.mjs
```

## 技术与目录

```text
dorm-duty/
├── frontend/   Vue 3 / TS / Vite / Vant / Pinia / Router
├── backend/    原 FastAPI 账号版（历史只读）
├── site/       Worker 业务、文件 SQLite 适配器、Drizzle 迁移
├── scripts/    local.sh / local-server.mjs 等本地脚本
├── docs/       规格、进度、验收、部署与验证证据
└── native/     Android / HarmonyOS 安装版工程
```

当前线上业务只使用 `scripts/local-server.mjs -> site/worker/` 的 Node/SQLite 链路；`backend/` 和 Cloudflare/Pages 发布脚本均为历史代码。改当前轮次与抬水规则时，先看 `site/worker/chores.mjs`。

## 文档

- [聚焦任务与一屏日历](docs/FOCUS_COMPACT_UI.md) —— 恢复大字任务、交接动画、合并热度与分页叠卡

- [P0 界面与历史修正](docs/P0_INTERFACE.md) —— 统一代币、简约任务卡、三月统计、补改记录及动效边界

- [协作开发](CONTRIBUTING.md) —— Issue、任务分支、PR 与审查流程
- [当前进度](docs/PROGRESS.md) —— 交付状态与待完成项
- [部署说明](docs/SERVER_DEPLOYMENT.md) —— 服务器部署、证书与备份
- [App 演进清单](docs/APP_ROADMAP.md) —— 通知、替干、请假、水票、桌面卡片等目标

## 协作

两人协作请先阅读 [CONTRIBUTING](CONTRIBUTING.md)，在 Issues 选择问题或开发任务模板，各自使用任务分支，通过 PR 互相审查。PR 自动提供验收与发布交接模板。GitHub Actions 在 main 提交和 PR 上自动构建网页、检查业务 / 通知规则及安卓安装版；合并后由发布负责人单独验收与发布。

最新界面与间隔提醒说明见 [RESTORE_MOTION_RECENCY](docs/RESTORE_MOTION_RECENCY.md)。
1111
