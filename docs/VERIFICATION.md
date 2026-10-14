# 2026-10-10 本地实现与验证记录

本轮由 Codex 按用户“你开始完成吧”的明确授权直接实现。源码、辅助脚本和文档均在 `dorm-duty/` 内。没有修改其他项目、已有 .env 或凭据；没有提交、推送或公网发布。

## 已实现

- Vue 3 / TypeScript / Vant 4 / Pinia / Vue Router 七个页面：登录注册、宿舍、首页、周月排班、历史、我的、消息。
- FastAPI 六张主要表、冻结的 Alembic 初始迁移、Argon2 密码哈希、24 小时 Bearer JWT 和身份恢复。
- 创建 / 加入 / 退出宿舍、成员移除、管理员转移、邀请码更新、轮换顺序和任务 / 截止配置。
- 后端日期 / 轮换计算、补缺生成、未来重排、指定日期调整、版本冲突、成员变更保留历史。
- 本人打卡、数据库并发保护、真实完成时间、逾期完成、任务与昵称快照。
- 站内消息、未读 / 已读、唯一独立 APScheduler worker、三个提醒时间、滚动补齐和持久去重。
- PWA Manifest、四张 PNG 图标、自定义 SW、静态预缓存、更新提示、离线 / 服务不可达提示。
- Push 订阅 / 取消 / 本人测试队列、逐设备发送状态、失败有限重试、过期停用、完成 / 退出抑制、通知点击目标日期。
- Mac 一键启动、依赖锁文件、检查脚本、在线 SQLite 备份、VAPID 值生成辅助、Docker / 同源代理配置和部署说明。

## 验证结果与证据

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| 后端测试 | 17 项通过；隔离临时库每次真实迁移 | [checks-final.txt](evidence/checks-final.txt) |
| 并发 | 独立 SQLAlchemy 会话并发打卡只有一成功；并发加入最多一个有效宿舍 | backend/tests/test_business.py |
| 排班 / 权限 | 重复生成、成员退出、远期重排、手工安排、版本冲突、越权、午夜 / 截止与逾期通过 | 同上 |
| 提醒 | 三时间点、重复扫描、补查窗口、取消、设备归属、模拟失败 / 410、重试上限、过时投递和目标日期通过 | backend/tests/test_reminders.py |
| 静态检查与构建 | Ruff、Vue TS、自定义 SW TS、生产 build 通过；Prettier 格式检查通过 | [构建输出](evidence/frontend-build.txt) |
| 真实浏览器业务 | 两个 Chrome 独立上下文，通过 UI 注册、创建 / 加入、生成、完成、跨会话刷新、身份恢复和昵称修改 | [browser-smoke.json](evidence/browser-smoke.json) |
| 响应式布局 | 六个业务页面 × 五种宽度 = 30 组无横向溢出；另验证登录页五宽度，总 35 组 | browser-smoke.json / [final-browser.json](evidence/final-browser.json) |
| 完成时间同步 | A/B 读取同一服务器 completed_at；重复完成 409，不覆盖时间 | browser-smoke.json |
| 生产 PWA | 桌面 Chrome 实际注册并控制页面；Manifest / PNG、深链接刷新、断网框架和错误提示通过；22 条静态预缓存，无个人 API | [pwa-browser.json](evidence/pwa-browser.json) |
| 真实站内消息 | 实际运行 worker 创建提醒，可在网页读取并标已读；未配置 Push 时按钮和说明正确 | final-browser.json / persistence.json |
| 服务重启 | 实际停止 API、worker、Vite 并重新启动，数据库数量 / 完成记录一致；重新登录读取成功 | [persistence.json](evidence/persistence.json) |
| 备份恢复 | 在线备份后，在独立临时目录恢复，integrity_check 为 ok，foreign_key_check 空 | persistence.json |
| 迁移与模型 | 空库 upgrade head 成功，Alembic check 无待生成变更 | persistence.json |
| 容器配置 | YAML 解析、服务和依赖结构检查通过 | docker-compose.yml；本机无 Docker，未运行容器 |

截图目录 `docs/evidence/` 包括登录、首页、宿舍、日历、历史、我的、消息，以及最终通知设置状态。截图使用实际本地 API 与隔离 QA 宿舍，示例人员是测试账号。已视觉检查主要页面；截图中的固定底栏在整页长截图中位于截图时的视口底部，正常使用可滚动。

本机 Node 26.4.0，后端虚拟环境 Python 3.11.13。测试依赖有一条 AnyIO / Starlette 弃用提示，17 个测试通过，未将其误记为测试失败或修复完成。

## 尚未验证

- 两台真实手机使用同一宿舍的同步与实际 Safari 软键盘 / 安全区行为。
- iPhone 主屏幕安装、iOS 通知授权、锁屏实际接收和点击 Push。浏览器移动 viewport 不等于 iPhone 真机。
- 真实 HTTPS 域名与公网服务器；当前只运行本机服务。
- Web Push 提供商真实接受及手机显示；当前未配置用户 VAPID 值，模拟测试仅证明后端投递逻辑。
- Docker / Nginx / Compose 实际运行（本机无 Docker），以及 PostgreSQL 迁移 / 并发运行。
- 长期自动登录；首版 sessionStorage 允许刷新恢复，不保证关闭页面后仍登录。

## 执行方式

`./scripts/check.sh` 复现代码检查。`frontend/e2e/smoke.mjs` 会创建隔离 QA 用户；只对 QA 数据库执行。`npm run test:pwa` 需要生产 build 和 4173 preview，并读取最近一次业务测试账号。Chrome 路径可由 BROWSER_EXECUTABLE 覆盖。

本次开发服务绑定 `data/qa.db`；默认启动使用 `data/dorm.db`，与演示数据隔离。临时 JWT_SECRET 不保存，服务重启需要重新登录；正式部署须注入稳定随机密钥。

## 2026-10-11 前端优化与自定义扩展

本轮使用 taste skill 与 frontend-design；保留绿色品牌、Vue / Vant、原有导航和路由。参考本机 awesome-design-md 的 Airbnb / Notion 规范与 react-bits 的 TiltedCard 思路，并以 Vue / Pointer Events 实现。

- 后端测试增加至 **24 项通过**，包含星期选择、连续日期轮换、任务模板、休息日、预览 / 生成一致、单日任务与时间编辑、临时任务、权限 / 版本校验、历史保留、提醒内容更新及删除任务的通知关联处理。
- TypeScript、Service Worker TypeScript、Ruff、生产构建与 Prettier 检查通过。
- 自定义浏览器闭环通过：真实 API 与 UI 保存、刷新恢复、单日编辑、休息日加任务、第二位成员同步、权限入口、抽屉拖拽 / 焦点 / Escape、触点倾斜与减少动态效果；30 组业务页面宽度检查无横向溢出。见 [customization.json](evidence/customization.json) 与 `frontend/e2e/customization.mjs`。
- 生产版本的浅 / 深色主页、排班、宿舍和我的页面共 8 组检查通过。实际 SW 控制页面，预缓存不包含私有 API。见 [polish-production.json](evidence/polish-production.json)。
- 演示数据库在迁移前已通过 SQLite 在线备份保存到 `data/backups/qa-before-custom-20261011-092431.db`，随后升级到 Alembic 0002；旧宿舍的轮换默认不变。

截图：`polished-light-home.png`、`polished-dark-home.png`、`polished-editor.png`、`custom-settings.png`。已经视觉检查浅 / 深色首页和编辑抽屉。

以上仍是桌面 Chrome 的浏览器与合成触点证据；iPhone Safari、真实触摸 / 软键盘、PWA 安装和锁屏推送的验收状态未改变。

补充检查：更新后的完整 UI 回归通过注册、六人宿舍创建 / 加入、生成、打卡、两用户同步、重复打卡 409 和历史昵称保留，另有 30 组布局检查。证据独立保存于 [polish-regression/browser-smoke.json](evidence/polish-regression/browser-smoke.json)，没有覆盖原演示账号记录。登录页 Lighthouse 移动配置检查为性能 98、可访问性 100，LCP 2.1 秒、CLS 0；这是一轮本机合成测量，不代表真实手机网络性能。见 [lighthouse-polish.json](evidence/lighthouse-polish.json)。

最终重启后，4173 代理健康返回 200，原演示宿舍读取成功；数据库迁移版本为 0002，integrity_check 为 ok，foreign_key_check 无违规。
