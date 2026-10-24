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

## 2026-10-24 ChatGPT P0 follow-up

- `node scripts/check-dorm-wizard.mjs`：37 项隔离 SQLite 检查通过。新增覆盖 v2 三种节奏持久化、completion 单一接力任务、并发完成一次推进、撤销/重做不复用序号，以及旧宿舍不能启用非抬水 completion。
- `npm run web:build`：`vue-tsc`、Vite 与 PWA 构建通过；保留既有大 chunk 警告，无本轮类型/构建错误。构建同步更新 `site/runtime/push-runtime.cjs`。
- `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：70 项通过，页面错误为 0。
- `node scripts/check-dorm-wizard-browser.mjs`：70 项通过，页面错误为 0。
- 浏览器测试覆盖五步创建、创建时第二页类型选择、三种节奏、同一步内的执行/截止滚轮、规则页单屏、真实 ChoreBoard/底栏/日历预览、预览 handler 直接调用、预览操作业务 API 请求数为 0、创建后自动欢迎引导、手动跳过安全返回、任务工作台保存与减少动态效果。
- `npm run spec:scope`、`npm run spec:validate` 与 `git diff --check`：通过；OpenSpec 验证 18 项无错误。
- 本轮截图/录屏保存在忽略目录 `data/startup-review/`，包括 WebKit 与 Chromium 的向导、页面拖动、真实组件预览、欢迎引导、值日细节与设置视口证据。

### 未验证与交付边界

- 浏览器运行于 macOS WebKit/Chromium 的移动视口模拟，不代表实体 iPhone Safari、Android WebView 或 HarmonyOS ArkWeb；这些设备仍未连接/测试。
- 没有可报告的 GitHub CI 运行状态；本地构建与自动化不等于 CI。
- 仅使用脚本创建的隔离 SQLite 宿舍与合成身份，没有读取或写入正式数据库。
- 未创建 PR、未合并 main、未部署正式网站。

## 2026-10-24 ChatGPT P1 follow-up (`reviewed_code_sha=9e9512b`)

### 修复与隔离测试

- `site/worker/chores.mjs`：完成 API 的即时 `task` 回执现在携带实际 `completed_by`；普通撤销回执明确将其清为 `null`，与撤销事务写入后的数据库状态一致。未改变授权谓词、任务推进、历史结构或旧宿舍业务规则。
- `scripts/check-dorm-wizard.mjs`：共 88 项隔离 SQLite/API 检查通过。新增本人完成→撤销、硬性代做→代做者撤销的 PATCH 回执与数据库/下一次 board GET 对照；新增新版抬水软性代做拒绝、硬性代做允许、队列推进与撤回、提前抬水额度创建/撤回及提醒/推送副作用检查。
- 相关回归：`node site/scripts/check-water-flex.mjs`（74 项）、`node site/scripts/check-water-reassign.mjs`（45 项）、`node site/scripts/check-undo.mjs`（73 项）通过；`node --check site/worker/chores.mjs`、`node --check scripts/check-dorm-wizard.mjs`、`git diff --check` 通过。

### P1-B 四项 Web 回归调查

- 当前 `9e9512b` 工作树上逐项重跑，四项与前交接描述一致：`scripts/check-screen-gesture-check.mjs` 的 `swipePose.opacity<1` 断言失败；`scripts/check-settings-save-lifecycle.mjs` 与 `scripts/check-navigation-components.mjs` 因打包夹具无法导入 `memberNames.css` 失败；`site/scripts/check-scheduled-reminders.mjs` 的旧迁移用例 `/guest/create` 返回 500、期望 201（其余 10 个子用例、177 个断言通过）。
- 在只读 detached worktree `6b7d6761daa80d8f285ca14e96c4ff51620bdbd0` 以相同命令对照复跑：前三项出现相同断言/导入错误；定时提醒测试同样 10/11 子用例通过，失败仍为 `/guest/create` 500 而期望 201。故这些是当前权限补丁之前已存在的失败；本轮未改动四个对应测试文件或其无关产品组件。
- `npm run web:verify`：前端构建、Worker 构建、邮件运行时构建通过；整套回归仅上述四项失败，其余脚本通过。不能报告全套验证为绿色。
- `npm run spec:validate`：18/18 通过；`npm run spec:scope`：17 个 active changes、363 个登记文件通过范围检查。最终摘要随 handoff 记录；文档本身不嵌入自引用摘要。

### 设备、CI 与边界

- GitHub CI 尚无本轮新业务提交状态；浏览器/自动化均为本地隔离测试，iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 未做真机验证。
- 仅使用本地临时 SQLite 和合成身份；没有连接生产服务、读取/修改正式宿舍数据库、创建 PR、合并 main 或部署。
- 剩余事项：四项先存 Web 回归失败仍保持阻塞，需后续在对应范围单独处理；P1-A 和 P1-C 本地验收通过，等待新业务 SHA 的独立评审。
