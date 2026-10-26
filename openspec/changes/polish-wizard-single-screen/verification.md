# 隔离验收记录 · 2026-10-26

## 实际执行

- Node.js 22.23.4；独立预览 UI 8104 / API 8105，合成 SQLite 与测试身份，不接触正式数据库。
- `node scripts/check-wizard-single-screen.mjs`：Chromium 50 项通过。
- `DORM_BROWSER=webkit node scripts/check-wizard-single-screen.mjs`：桌面 WebKit 50 项通过。
- `DORM_WIZARD_ORIGIN=http://127.0.0.1:8104 node scripts/check-dorm-wizard-browser.mjs`：Chromium 212 项通过。
- 同命令加 `DORM_BROWSER=webkit`：桌面 WebKit 212 项通过。
- `node scripts/web-command.mjs test-state`：22 项前端状态回归通过。
- `npm run build --prefix frontend -- --outDir ../data/wizard-polish-build --emptyOutDir`：类型、Vite 与 PWA 构建通过；现有大分块提示仍在，未顺手重构。
- OpenSpec strict、范围检查及 `git diff --check` 通过。

## 覆盖

五步在 375×700、390×844、430×932 视口额外加入 47px 顶部与 34px 底部安全区，正文无需纵向滚动。任务编辑、统一时间、单项规则面板亦在 375×700 验证。320×568 保留必要安全滚动和可达底栏。

验证 20 项任务 ID/名称全部可达，双列三项分页，原值日页四任务上限保持；模板水平切组不会误选任务。进度按住立即出现、拖动中切页、反向、吸附、取消、连续点按、Home/End、无可见节点的连续轨道、暗色/减动效通过。轻点处在 0.5–0.58 步边界时，页面与滑块最终目标一致。任务输入聚焦取消双重缩放，字段边界完整。

本专项中业务写入请求 0、浏览器异常 0；独立环境每次导航的 `/email/enter` 测试身份初始化单独记录为 startupAuth，不冒称整个启动零网络。完整原回归另验证正式组件沙箱的零 fetch/XHR、真实组件复用、导航排序、草稿保留、设置工作台动态多步骤及旧工作台玻璃常驻。

## 本机证据

- 预览：`http://127.0.0.1:8104/?preview=new-dorm`
- 截图：`data/wizard-single-screen/{chromium,webkit}/step-{0..4}.png`，另含 task-editor、time-panel、many-tasks、dark-reduced。
- 录屏：`data/wizard-single-screen/progress-drag.mp4` / `.webm`（390×844 桌面 WebKit UI 实录），专项全流程 `data/wizard-single-screen/{chromium,webkit}/create-flow.webm`。
- 原始日志：`data/wizard-single-screen-*.log`、`data/wizard-polish-original-*.log`、`data/wizard-polish-state.log`、`data/wizard-polish-build.log`。

## 限制与边界

桌面浏览器移动视口、模拟键盘高度和模拟震动调用不等于实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 验收；这三端真机均未验证。没有改变后端、正式页面或全局样式，没有读取或写入生产数据。用户视觉验收仍 pending；未创建 PR、合并或部署。
