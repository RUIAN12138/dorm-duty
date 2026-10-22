<div align="center">

# 轮到 · 宿舍值日管理系统

**让宿舍值日、抬水轮换和提醒变得清楚、公平、可追溯。**

Vue 3 · TypeScript · Vite · Node.js · SQLite · Android · HarmonyOS

[本地部署](#本地运行) · [使用说明](docs/CHORES.md) · [开发进度](docs/PROGRESS.md) · [参与协作](CONTRIBUTING.md)

</div>

---

## 项目简介

**轮到**是一套面向宿舍日常协作的多端值日管理系统。通过任务轮换、完成打卡、日历记录和提醒，减少“今天该谁做”的沟通成本。

提供移动端 Web 页面，以及 Android / HarmonyOS 安装版工程。前端重视简洁排版、细腻的动效与触控体验；业务数据由 Node.js + SQLite 服务维护。

> **版本说明：** 本 README 介绍 `main` 分支已包含的架构与基础功能。正在开发或待合并的交互动效、聊天功能与平台能力，以对应 PR、CI 和实际验收结果为准；PR 创建不代表已发布。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 值日轮换 | 地板、厕所等任务可分别轮换；支持自由轮次及按日排班 |
| 抬水交接 | 按顺序轮换，实际完成后打卡并交给下一位 |
| 日历与记录 | 按实际完成日期查看热力、成员记录及历史情况 |
| 提醒与通知 | 站内提醒、Web Push，以及账号邮件提醒相关能力 |
| 宿舍与身份 | 邮箱验证、邀请码加入宿舍、成员身份绑定及跨设备恢复 |
| 多端使用 | 移动网页、Android 和 HarmonyOS 工程，共享核心业务体验 |

**球球交互、聊天体验、玻璃动效等持续优化中。** 查看 [Pull Requests](../../pulls) 了解尚未合并的工作；正式上线状态以发布和验收记录为准。

## 项目截图

项目采用面向手机的黑白极简界面，涵盖值日任务、抬水轮换、日历记录与球球互动等场景。

**截图待补充：** 为保证展示内容与实际版本一致，仓库主页仅使用真实运行截图，不使用概念图或伪造的 UI。可将经过隐私处理的截图存放于 `docs/screenshots/`，并在此展示首页、日历、抬水和球球聊天等页面。

## 使用方式

**本项目的个人服务器仅供作者自用，不对外开放。** 仓库不提供公共在线体验入口，也不接受通过作者服务器注册或使用。

感兴趣的开发者可以克隆仓库，在自己的电脑上运行本地版本；本地数据与作者的私人服务器完全独立。

## 本地运行

要求 **Node.js 22.13.0 或更新版本**。

```bash
git clone https://github.com/RUIAN12138/dorm-duty.git
cd dorm-duty
./scripts/setup.sh
npm run web:dev
```

浏览器访问 http://127.0.0.1:8081/ 。

常用命令：

```bash
npm run web:build    # 构建网页
npm run web:verify   # Web 与业务验收
```

本地 SQLite 数据库 `data/dorm-local.db` 与正式服务器数据相互独立，不会自动同步。更多启动与发布说明见 [部署文档](docs/SERVER_DEPLOYMENT.md)。

## 技术架构

```text
dorm-duty/
├── frontend/   Vue 3 / TypeScript / Vite / Vant / Pinia / Router
├── site/       业务服务、SQLite 适配器、数据库迁移
├── scripts/    本地 Node 服务、构建与验证脚本
├── native/     Android / HarmonyOS 工程
├── docs/       产品规则、设计、进度与部署说明
└── backend/    历史 FastAPI 代码（非正式部署入口）
```

**当前自用服务器业务链路：** `scripts/local-server.mjs → site/worker/`（Node.js + SQLite）。

`backend/` 为历史代码，不具备当前邮箱准入机制；旧 Cloudflare Worker/Pages 代码也不是当前正式业务部署入口。正式发布应使用 `deploy/prepare-release.py` 和 `deploy/install-release.py`，不要将历史服务直接发布为生产环境。参见 [架构与发布审计](docs/AUTH_RELEASE_AUDIT.md)。

## 质量检查

```bash
npm run web:verify
node site/scripts/check-cloud-backend.mjs
node site/scripts/check-chores.mjs
node site/scripts/check-recency.mjs
node site/scripts/check-rounds.mjs
node site/scripts/check-worker.mjs
```

GitHub Actions 对 PR 和 main 执行自动检查。**CI 通过不等于真机验收完成，也不等于生产环境已经部署。**

## 文档导航

- [值日与抬水规则](docs/CHORES.md)
- [邮箱账号与提醒](docs/EMAIL_ACCOUNTS.md)
- [当前开发进度](docs/PROGRESS.md)
- [界面与动效设计](docs/FOCUS_COMPACT_UI.md)
- [App 演进路线](docs/APP_ROADMAP.md)
- [部署与备份](docs/SERVER_DEPLOYMENT.md)
- [协作与提交规范](CONTRIBUTING.md)

## 参与开发

欢迎通过 [Issues](../../issues) 反馈问题、提出需求，或查看 [Pull Requests](../../pulls) 参与代码审查。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，在独立分支开发并通过 PR 提交。

---

<div align="center">

**轮到 · 让每一次值日都有记录，让下一次轮换有据可循。**

</div>
