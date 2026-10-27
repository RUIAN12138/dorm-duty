# Verification（本地独立预览，尚待用户和实体设备验收）

- 创建页：`node --experimental-strip-types frontend/src/components/onboarding/creation/CreationFlow.browser.mjs`，Chromium 44 项；`DORM_BROWSER=webkit` 同命令，WebKit 44 项。覆盖 320×650、390×844、430×932 五步骤、20 项任务、选择/编辑与规则切换、中间帧、快速切换、深色及减少动态效果、模拟键盘视口；旧工作台分支局部挂载对比通过。编辑与步骤切换期间拦截业务 API 为零；退出后恢复原页面触发一次只读 `GET /chores/board`（测试使用临时隔离服务并拦截该请求）。
- 沙箱及教程：`node frontend/src/components/onboarding/sandbox/Sandbox.browser.mjs` 和 `DORM_BROWSER=webkit` 同命令各 23 项，真实组件预览、四节练习、无业务请求和临时数据库内容不变通过。
- `npm run build --prefix frontend`、`npm run spec:check`、`git diff --check` 通过。桌面浏览器 WebKit 不是 iOS Safari 真机，模拟 visualViewport 不是系统键盘验收。
- 对照：`data/wizard-before/chromium/tasks.png`、`data/creation-polish/chromium/tasks.png` 与 `editor.png`；中间帧 `panel-frames.json`；操作录屏为对应目录 WebM。以上本地数据未纳入提交。
- 未执行实体 iPhone Safari/PWA、vivo Android WebView 或 HarmonyOS ArkWeb；未运行完整远端 CI。未访问生产数据或部署。
