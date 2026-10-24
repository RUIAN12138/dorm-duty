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

## 2026-10-24 欢迎引导继续与跳过路径

- `WelcomeSlides.vue` 现在每页都有显式主操作：前两页“继续”，最后一页“开始设置”；三页都保留独立的“跳过介绍”。主操作在同一个固定高度区域替换，减少按钮变化造成的上下位移；按系统减少动态效果设置，分页滚动切换为即时定位。
- `DormWizard.vue` 将“完成介绍”和“跳过介绍”拆成不同事件。完成介绍保留原有一次性进度条聚光讲解；跳过只记录已看过并进入向导，不自动打开讲解。
- 更新 OpenSpec 行为要求和隔离浏览器回归。`node scripts/check-dorm-wizard-browser.mjs`（Chromium）与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`（WebKit）均通过；覆盖逐页继续、完成后打开一次性讲解、跳过不打开讲解、本地体验不调用正式宿舍创建 API，以及向导既有相关检查。两次运行的页面错误列表均为空。
- `npm run web:build`：`vue-tsc`、Vite 与 PWA 构建通过；保留项目既有大 chunk 提示。`npm run spec:check` 在本次 OpenSpec 更新后重新运行通过。
- 隔离预览截图：`data/startup-review/chromium-local-wizard-open.png`、`data/startup-review/webkit-local-wizard-open.png`。展示为 390×844 移动视口模拟；不是实体 iPhone Safari。Android WebView、HarmonyOS ArkWeb 也未做真机验证。
- 仅修改创建向导欢迎页、其事件连接、浏览器回归及该 OpenSpec change；没有改旧宿舍数据或生产站点。未提交/推送代码、未创建 PR、未合并、未部署。

## 2026-10-24 独立教程跳页状态同步

- 复现：从页码点直接跳至末页时，`goTo()` 立即设置目标页索引，但横向滚动仍从当前页开始；末页标题、无障碍活动页和“开始使用”先显示，画面还停留在第一页。现在教程状态由滚动轨道最近的可见页驱动；减少动态效果时仍即时落位。
- 回归在跳转过程采样活动页、物理滚动页和底部主操作，等待滚动完成后再截图与断言，不再仅等待 `aria-hidden` 改变。
- `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：隔离浏览器流程通过，含教程跳页、创建/跳过教程、创建向导、预览隔离及 320/390/430px 视口检查；页面错误列表为空。
- `node scripts/check-dorm-wizard-browser.mjs`：Chromium 同一流程通过；页面错误列表为空。
- `npm run web:build`：Vue 类型检查、Vite/PWA 构建通过，保留既有的大 chunk 警告。`npm run spec:check`：OpenSpec 校验和范围门禁通过。
- WebKit 更新后的末页截图：`data/startup-review/webkit-welcome-guide.png`；Chromium：`data/startup-review/chromium-welcome-guide.png`。均为 macOS 浏览器的移动视口模拟，不代表实体 iPhone/Android/HarmonyOS 验收。
- 本轮仍只在本地隔离分支修改；未提交/推送、未创建 PR、未合并、未部署、未连接正式服务或接触正式数据库。

## 2026-10-24 引导页码胶囊稳定性

- 视觉检查发现活动页码切换 `width` 会触发整个页码组重新排布。现改为固定触摸轨道与固定布局宽度，只通过内部圆点的 `transform: scaleX()` 伸展为胶囊，保留原黑白外观，减少切页时的细小横向挪动。
- `node scripts/check-dorm-wizard-browser.mjs`（Chromium）与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`（WebKit）：各 78 项通过，页面错误列表为空；新增断言确认独立教程与创建介绍的页码布局位置不因活动胶囊变化，并检查页码按钮 24×44px 触摸区域及 `aria-current` 当前步状态。
- `npm run web:build`：Vue 类型检查、Vite 与 PWA 构建通过；仅有项目既有的大 chunk 提示。`npm run spec:check`：18 项规范校验、范围检查与 18 项门禁测试通过。
- Impeccable 检查：`WelcomeSlides.vue`、`WelcomeGuide.vue` 与 `DormWizard.vue` 无剩余自动检测警告。
- 新截图：`data/startup-review/webkit-welcome-guide.png`；同一文件夹中的浏览器流程录屏由 WebKit 移动视口模拟生成。不是实体 iPhone Safari 录像；Android WebView 与 HarmonyOS ArkWeb 仍未做真机测试。
- 未提交/推送、未创建 PR、未合并、未部署；未修改生产数据或旧宿舍配置。

## 2026-10-24 创建进度条最终抬手坐标回归

- 复现：在隔离浏览器中只派发起始步骤的 `pointerdown`，再派发目标步骤的 `pointerup`，刻意不派发中间 `pointermove`。修复前页面仍留在宿舍名称页，目标步骤没有选中；说明只依赖 `pointermove` 的实现会漏掉平台合并的最后坐标。
- 修复：滑块拖动在松手时再次采样实际 `pointerup.clientX`，实时更新最后目标后再吸附；若手势以明显纵向位移结束，取消滑块手势并保持当前步骤，继续交还纵向滚动。没有改变进度轨道尺寸、步骤顺序、页面动画或草稿结构。
- `node scripts/check-dorm-wizard-browser.mjs`：Chromium 完整创建流程及创建预览检查通过，新增覆盖无中间移动事件时抬手切页、触感回调、纵向抬手不切页；页面错误列表为 `[]`。自动化记录的两条 `ERR_ABORTED` 是离开页面时取消中的隔离 board 读取，不是页面异常或预览业务写入。
- `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：WebKit 同一完整流程通过，页面错误列表为 `[]`；同样仅在导航离开时记录取消的隔离 board 读取。
- 浏览器测试同时回归欢迎教程继续/跳过、创建任务与草稿返回、进度实时切页、页面编排窄屏、预览正式组件和副作用隔离、工作台及减少动态效果。截图仍使用 macOS 浏览器移动视口模拟；不代表实体 iPhone Safari、Android WebView 或 HarmonyOS ArkWeb 真机验收。
- `npm run web:build`：`vue-tsc`、Vite/PWA 构建通过；保留既有 558KB 页面 chunk 警告。
- `npm run spec:check`：18 项 OpenSpec 校验、范围检查和 18 项范围门禁测试通过（17 个 active changes、363 个登记文件）；摘要以本轮命令输出为准，不在被摘要覆盖的验证文件中自引用。
- `git diff --check`：通过。仅在隔离 worktree 修改；不创建 PR、不推送、不合并、不部署。

## 2026-10-24 首创直达可编辑问题与提前抬水撤回回执

- 创建入口问题根因：删除创建专用介绍页后遗留的普通 `<template>` 包装在真实 DOM 中形成隐藏模板节点，导致宿舍名称步骤、正文和操作栏被浏览器隐藏。移除了多余模板包装；页面结构和表单样式未改。
- 创建入口对比：修改前截图 `data/startup-review/chromium-local-wizard-before-direct-start.png` 显示创建介绍页；修改后 `data/startup-review/chromium-local-wizard-open.png` 与 `data/startup-review/webkit-local-wizard-open.png` 显示首屏直接进入宿舍名称步骤。均为本地桌面浏览器移动视口截图，不是实体 iPhone/Android/HarmonyOS。
- `node scripts/check-dorm-wizard-browser.mjs`（Chromium）与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`（WebKit）：整套隔离向导流程通过。覆盖首次创建入口、独立教程保留、草稿和旧宿舍路径、五步进度、页面编排、实时预览副作用隔离、旧工作台、窄屏及减少动态效果；页面错误列表均为 `[]`。
- 提前抬水额度撤回根因：`undoOnce()` 将数据库任务更新成 `cancelled`，但 API 回执虚报 `pending`，并留下 `completed_by`。现在持久化与回执均为 `cancelled`、`completed_at=null`、`completed_by=null`；同一取消额度重复撤回返回 409。没有更改额度撤回人的权限、计划队列、轮序或通知规则。
- 新增的 API/SQLite 断言先在原实现上失败，修复后 `node scripts/check-dorm-wizard.mjs` 的 94 项隔离检查通过，包括：他人不能撤回、创建者撤回后回执与同 ID SQLite 行一致、重复撤回无副作用、后续 board GET 不展示已取消额度任务、计划抬水任务保持不变。
- 回归：`node site/scripts/check-undo.mjs`（73 项）、`node site/scripts/check-water-flex.mjs`（74 项）、`node site/scripts/check-water-reassign.mjs`（45 项）均通过；两个修改后的 JS 文件 `node --check` 及 `git diff --check` 通过。
- 本节尚未验证本轮完整 `npm run web:verify`、GitHub CI 或实体设备。先前记录的四项 Web 回归阻塞仍按 P1-B 保留；不能据本轮定向测试宣称全套回归全绿。iPhone Safari/PWA、Android WebView 与 HarmonyOS ArkWeb 未真机验收。
- 仅使用本地隔离 API/SQLite 合成数据和本地浏览器预览，没有连接正式服务或读写正式宿舍数据。未合并、未部署；等待对应预览验收，正式 PR 不在本轮范围。
