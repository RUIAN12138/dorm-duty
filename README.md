# 轮到 · 宿舍值日管理系统

宿舍值日、抬水轮换、完成日历与提醒。Vue 手机网页、Node SQLite 后台、Android / HarmonyOS 安装版工程。

**正式公网入口：** [打开轮到](https://8.148.190.114/dorm-duty/)。无需账号密码，先创建宿舍或凭邀请码加入，再选择成员。

## 快速开始

双击 `启动.command`，或在项目根目录运行：

```bash
./scripts/local.sh
```

访问 http://127.0.0.1:8081/。本地数据库 `data/dorm-local.db` 与正式服务器数据独立，不自动同步。

> 注意：`site/worker/index.js` 是 `site/scripts/embed-frontend.mjs` 生成的部署入口，不提交到仓库。`local.sh` 与 CI 会在构建时重新生成；新鲜克隆后需先构建再运行依赖该文件的脚本。

## 核心规则

- **值日**：地板、厕所默认各自使用自由轮次，每人本轮主动做一次，全员完成这一项后自动开启下一轮；创建者也可切换为按日排班并配置时间。
- **抬水**：按顺序轮换，实际抬完才打卡，自动交给下一位。
- **日历**：按上海时区实际完成日期留下成员标记，点击日期查看记录。
- **提醒**：站内提醒（同一发送人、接收人、任务一分钟内最多一条）与系统通知（Web Push，iPhone 需 iOS 16.4+ 添加主屏幕并授权）。
- **身份**：信任式选人入口，知道邀请码的人可选择已有名字，不提供强身份验证；创建者凭据保存在当前浏览器，清除网站数据会丢失管理权限（可凭邀请码和恢复码取回，见 [创建者恢复](docs/CREATOR_RECOVERY.md)）。

完整规则见 [CHORES](docs/CHORES.md)。

## 检查

```bash
./scripts/check.sh
```

业务检查（独立测试数据库）：

```bash
node site/scripts/check-cloud-backend.mjs
node site/scripts/check-chores.mjs
node site/scripts/check-rounds.mjs
node site/scripts/check-worker.mjs
```

## 技术与目录

```text
dorm-duty/
├── frontend/   Vue 3 / TS / Vite / Vant / Pinia / Router
├── backend/    原 FastAPI 账号版（保留参考）
├── site/       Worker 业务、文件 SQLite 适配器、Drizzle 迁移
├── scripts/    local.sh / local-server.mjs 等本地脚本
├── docs/       规格、进度、验收、部署与验证证据
└── native/     Android / HarmonyOS 安装版工程
```

当前线上业务使用 `site/worker/` 的 Node / Worker 共用实现；`backend/` 是保留的 FastAPI 账号版。改当前轮次与抬水规则时，先看 `site/worker/chores.mjs`。

## 文档

- [协作开发](CONTRIBUTING.md) —— Issue、任务分支、PR 与审查流程
- [当前进度](docs/PROGRESS.md) —— 交付状态与待完成项
- [部署说明](docs/SERVER_DEPLOYMENT.md) —— 服务器部署、证书与备份
- [App 演进清单](docs/APP_ROADMAP.md) —— 通知、替干、请假、水票、桌面卡片等目标

## 协作

两人协作请先阅读 [CONTRIBUTING](CONTRIBUTING.md)，在 Issues 选择问题或开发任务模板，各自使用任务分支，通过 PR 互相审查。PR 自动提供验收与发布交接模板。GitHub Actions 在 main 提交和 PR 上自动构建网页、检查业务 / 通知规则及安卓安装版；合并后由发布负责人单独验收与发布。
