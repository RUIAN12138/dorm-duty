# 页面编排与正式值日复用补充验收

日期：2026-10-24

## 已完成

- `frontend`: `npm run web:build` 通过（`vue-tsc` + Vite/PWA）；仅报告既有大 chunk 提示。
- 根目录：`npm run spec:validate` 通过，18 个 OpenSpec 项目无错误；`npm run spec:scope`、`git diff --check` 通过。
- `node scripts/check-dorm-wizard.mjs`：27 项隔离后端配置与旧宿舍兼容检查通过。
- `DORM_BROWSER=chromium node scripts/check-dorm-wizard-browser.mjs`：63 项浏览器检查通过，页面错误为 0。
- `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：63 项浏览器检查通过，页面错误为 0。
- 浏览器回归覆盖 320×568、320×844、390×844、430×844；390×844 页面编排和硬性规则页单屏，短屏可安全滚动且底部操作可见。
- 进度轨道为 20px，滑块 36px、透明触摸区至少 44px；拖动时即时切页，跨步触发一次轻震动调用，iOS WebKit 不提供震动时功能正常。
- 配置值日页使用正式 `.task-selector` 和完成面板；草稿仅显示分配至值日页的任务。
- Vite 开发预览新增仅开发环境有效的直达参数：`/?preview=new-dorm`。启动验证完成后自动打开创建向导并清理参数，不进入正式构建。
- 320×844、390×844、430×844 下保持双列、无横向溢出，底部操作可见；390×844 下页面主体不需要纵向滚动。320×568 短屏允许安全纵向滚动，末项任务可达且底部操作仍可见。
- 点击任务切换页面、长按拖动、第二页「任务/催促」选择、实时预览同步与减少动态效果均通过。
- 隔离测试确认预览和草稿调整没有调用正式任务写入接口。

## 预览证据

- WebKit 移动视口截图：`data/startup-review/webkit-page-arrangement-single-screen.png`
- WebKit 全流程/任务拖动录屏：`data/startup-review/webkit-wizard-videos/page@84f03a1e1b2a16063f69dbdc466f60d4.webm`
- Chromium 对照截图：`data/startup-review/chromium-page-arrangement-single-screen.png`
- Chromium 全流程/任务拖动录屏：`data/startup-review/chromium-wizard-videos/page@16115b33a5be21b7cf50e634ef125f93.webm`

### 本轮精修证据

- WebKit 正式值日页截图：`data/startup-review/webkit-custom-duty-production-surface.png`
- WebKit 加厚进度条拖动截图：`data/startup-review/webkit-progress-drag-live.png`
- WebKit 硬性任务规则单屏截图：`data/startup-review/webkit-advanced-rule-single-screen.png`
- WebKit 全流程录屏：`data/startup-review/webkit-wizard-refinements.webm`
- Chromium 全流程录屏：`data/startup-review/chromium-wizard-refinements.webm`

## 未验证

- PUA 设备探测返回 `devices: []`，当前没有可用的实体 iPhone。以上截图和录屏来自 390×844 WebKit 移动视口模拟，不作为实体 iPhone Safari 证据。
- Android WebView、HarmonyOS ArkWeb 和实体 iPhone 的触摸体验仍需在真实设备检查。
- 本轮未合并、未提交 PR、未部署正式网站，也未改动既有宿舍数据。
