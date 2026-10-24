# 页面编排与正式值日复用补充验收

## 创建完成到正式首页的球球接续

- 修复范围：只给共享位置交接函数增加显式来源元素参数，并在真实邀请码页的「开始使用」动作采集当前球球位置；旧登录入口继续使用原默认来源，纯本地体验不会登记真实宿舍交接。
- 回归：`scripts/check-dorm-wizard-browser.mjs` 在真实创建流程中记录生产值日页的 680ms WAAPI 入场，并将首帧位移与点击前向导球球的可见坐标比较（容差 2px）。Chromium 与 WebKit 均须通过；首访欢迎引导与减少动态效果路径保持原样。
- 首访教程验证：教程导航等待共享过渡状态复位后才发生；自动化检查记录 WAAPI Promise 成功结束，确认不是球球组件卸载时取消。
- 边界：浏览器引擎模拟不等于实体 iPhone、Android WebView 或 HarmonyOS ArkWeb 验收。

## 欢迎引导短屏裁切回归

- 基线复现：在 844×390 和 568×320 CSS 视口下，`.guide-page` 的内容高度超过分页容器，球球顶部被裁切；欢迎页把 `overflow-y` 设为 hidden，内容无法向上滚动查看。
- 目标：短屏/横屏只允许引导页主体纵向滚动，顶部标题栏、底部页码和主按钮保持可见；横向切页与纵向滚动互不干扰。常规竖屏布局保持原样。
- `node scripts/check-dorm-wizard-browser.mjs`（Chromium）与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：完整隔离流程通过；新增 12 项对照断言，检查 844×390、568×320 横屏与 320×568 窄屏下四页内容起始/末尾可达、顶部与底部操作始终可见、纵向滚动不改当前横向页。
- `npm run web:build`：Vue 类型检查、Vite 与 PWA 构建通过；仅保留既有 `GuestHome` 大 chunk 提示。
- `npm run spec:check` 与 `git diff --check`：通过；OpenSpec 18 项验证成功，全部在途变更范围门禁通过。
- 更新后截图：`data/startup-review/chromium-welcome-guide-landscape-568x320.png`、`data/startup-review/chromium-welcome-guide-landscape-844x390.png`。短屏横屏的球球、标题、说明和继续操作可在首屏同时看见；需要时每页仍能单独纵向滚动。
- Chromium/WebKit 均为 macOS 浏览器模拟；实体 iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 未验证。本轮未查询新的 GitHub CI；未合并、未推送、未创建 PR、未部署或访问正式数据。

## 欢迎引导轻量收尾

- 复核发现横屏规则缩小了 `DormCompanion` 视觉尺寸，却仍保留内层按钮 48px 的常规下边距；改为横屏 8px，缩小后释放的空间留给当前步骤内容。
- 「跳过」与「继续」采用一致的轻按缩放/透明度反馈；减少动态效果时关闭形变并恢复不透明度。只作用于独立教程。
- `node scripts/check-dorm-wizard-browser.mjs` 和 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：完整隔离向导回归通过；新增实测「跳过」按压形变，以及横屏球球下边距后的教程截图。
- `npm run web:build`：`vue-tsc`、Vite 与 PWA 构建通过，保留既有 `GuestHome` 大 chunk 提示。`npm run spec:check`：OpenSpec 18/18、17 个变更/362 个登记文件范围检查、18 项范围门禁通过。Impeccable detector 返回 `[]`，`git diff --check` 通过。
- 新横屏截图：`data/startup-review/chromium-welcome-guide-landscape-after.png`。实体 iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 仍未验证；未查询新的 GitHub CI，未推送、PR、合并或发布。

## 本轮精简与说明（实现前）

- 仅修改 `WelcomeGuide.vue` 与新版创建向导规则主态，增加浏览器脚本检查；不改已有房间工作台、配置规则或服务端。
- Chromium 与 WebKit 隔离检查均通过：四页教程文案、三种节奏释义、390×844 默认规则／定时规则（含一个时间轮）／单项节奏设置均无需纵向滚动；窄屏、现有预览隔离、旧工作台与减少动态效果回归通过。
- 实体 iPhone、Android WebView、HarmonyOS ArkWeb 未验证前不得标为通过。

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

## 2026-10-24 保留新版宿舍任务级策略覆盖

- 评审复现：在规则页先给不同任务分别设为“按时间完成”和“只作提示”，再切换全局节奏；原 `chooseCycle()` 将所有任务的 `policy` 重置为 `inherit`，会无提示丢失这两项设置。
- 修复：全局节奏选择仍更新全局默认 `draft.policy` 和各任务轮换类型，但不再清空显式任务级 `policy`。显式覆盖仍随原草稿保存；旧宿舍设置路径未改。
- 浏览器回归新增先红后绿：在规则页分别设定地板硬性、厕所软性覆盖，切换全局轮次后重新进入单项编辑，检查两个原选择仍为 `aria-pressed=true`。原实现下 Chromium 断言按预期失败；修复后完整 `node scripts/check-dorm-wizard-browser.mjs`（Chromium）和 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`（WebKit）均通过，页面错误列表为 `[]`。
- 本节是本地桌面浏览器的移动视口模拟；不代表实体 iPhone Safari、Android WebView 或 HarmonyOS ArkWeb 真机验收。四项既存 `web:verify` 失败继续保留为单独阻塞；本轮没有重跑完整 `web:verify`、没有新的 GitHub CI 证据。
- 本轮只改新版向导的任务级策略覆盖及其隔离浏览器回归和 OpenSpec 记录；未改旧宿舍配置、生产数据、正式站点或产品流程之外的其他页面。

## 2026-10-24 教程入口文案与节奏说明减负

- `WelcomeGuide.vue`：四条说明改为真实入口和操作提示；将“提醒室友”页聚焦为球球留言及消息查看。四页数量、滑动、球球、页码和按钮布局保持不变。
- `DormWizard.vue`：为三种全局任务节奏及新版单项规则加入一行短说明，沿用原有规则 ID 与行为；把标题和释义紧凑纵向排布。
- `scripts/check-dorm-wizard-browser.mjs`：新增教程文案、节奏文案和 390×844 默认规则／定时规则单屏／单项节奏单屏断言，并生成 Chromium、WebKit 对照截图。WebKit 图像已人工检查：三种说明清楚可读，定时选项和时间轮完整显示，底部继续按钮可见；未改变现有房间设置工作台。
- `node scripts/check-dorm-wizard-browser.mjs` 与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：隔离流程全部断言通过，页面错误为空；覆盖 320/390/430 宽度、短屏安全滚动、完整预览隔离与旧工作台。
- `npm run web:build`、`npm run spec:check`、`git diff --check` 通过。构建仅提示项目已有的大页面 chunk；OpenSpec 18 项校验与变更范围门禁通过。Impeccable 自动检测结果为 `[]`。
- 新截图：`data/startup-review/webkit-wizard-rules-default.png`、`data/startup-review/webkit-wizard-rules-scheduled.png`、`data/startup-review/webkit-wizard-rules-per-task.png`、`data/startup-review/webkit-welcome-guide.png`，另有 Chromium 对照图。均为 macOS 浏览器移动视口截图，不是实体手机截图。
- 未重跑整套 `npm run web:verify`；交接评审记录的四项既有失败仍未解决，本轮不可视作全量回归通过。没有新的 GitHub CI 结果；iPhone Safari/PWA、Android WebView 和 HarmonyOS ArkWeb 未真机验证。
- 仅本地隔离分支与合成草稿；未提交/推送、未创建 PR、未合并、未部署或接触正式数据。

## 2026-10-24 欢迎引导留言路径说明校正

- 对照实际页面后，将第三页提示从泛化的“在消息里”明确为“点球球留话，回首页点消息看回复。”；Home 的消息入口实际链接到 `/messages`，教程没有虚构独立收件箱入口。只改教程文案和对应浏览器断言，不改流程、布局或业务逻辑。
- `node scripts/check-dorm-wizard-browser.mjs`（Chromium）与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`（WebKit）完整隔离流程通过；包含教程四页文案、创建向导、实时预览 API 隔离、任务工作台、320/390/430px 布局与减少动态效果，页面错误列表均为空。
- `npm run web:build`：Vue 类型检查、Vite 和 PWA 构建通过，保留既有 GuestHome 大 chunk 提示。`npm run spec:check`：18 项 OpenSpec 校验、17 个 active changes/362 个登记文件范围检查及 18 项范围门禁通过；Impeccable 检查为 `[]`；`git diff --check` 通过。
- 两种浏览器均为 macOS 移动视口模拟，不代表实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 验收。GitHub CI 未确认；未运行完整 `npm run web:verify`，此前记录的四项失败仍是独立阻塞。
- 业务修改提交为 `fb7a49a1220e12ba89d8b482f6799fcbd7a535a8`，已推送到 `codex/new-dorm-wizard-preview`；GitHub 对该 SHA 无 workflow run，Commit Status 为 `pending / total_count=0 / statuses=[]`。未创建 PR、未合并、未部署、未访问正式服务或修改正式数据。

## 2026-10-24 新宿舍名称首屏精简

- 新宿舍名称步骤移除重复的可见字段标签与辅助段落；输入框仍通过 aria-label="宿舍名称" 提供无障碍名称。把舍友加入时自行填写姓名的规则并入球球提示。必填校验、64 字上限、草稿逻辑与旧宿舍路径没有改动。
- node scripts/check-dorm-wizard-browser.mjs 与 DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs：完整隔离向导流程通过；新增断言确认单个可访问输入、无重复标签/说明、球球提示内容、必填校验与 64 字限制。既有草稿回填与步骤回退断言仍通过，页面错误列表均为 []。
- npm run web:build：Vue 类型检查、Vite 与 PWA 构建通过；保留既有 GuestHome 大 chunk 提示。npm run spec:check：OpenSpec 18/18、范围检查 17 个变更/362 个登记文件及 18 个门禁用例通过。Impeccable 对 DormWizard.vue 自动检测结果为 []；git diff --check 通过。
- Chromium/WebKit 修改前后对照图：data/startup-review/chromium-wizard-name-before.png → data/startup-review/chromium-wizard-name-after.png；data/startup-review/webkit-wizard-name-before.png → data/startup-review/webkit-wizard-name-after.png。截图来自 macOS 浏览器移动视口模拟，非实体手机测试。
- iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 未真机验证。仅本地合成向导草稿；未访问或改动正式宿舍数据，未推送、未创建 PR、未合并或部署。

## 2026-10-24 规则页球球提示去重
- 规则页提示由“选择适合宿舍的方式，之后也能修改”精简为“之后可调整”；三种选项文字、配置值和布局保持不变。修改前后 WebKit 截图位于 `data/startup-review/webkit-wizard-rules-tip-before.png` 与 `data/startup-review/webkit-wizard-rules-default.png`。
- Chromium 与 WebKit `scripts/check-dorm-wizard-browser.mjs`：完整隔离向导均通过；新增提示断言，规则选择、草稿、预览副作用、创建/引导路径继续通过，页面错误为 `[]`。
- `npm run web:build`、`npm run spec:check`、Impeccable 对 DormWizard/CreationProgress 检测（`[]`）和 `git diff --check` 均通过；构建保留项目既有 GuestHome 大 chunk 提示。
- 桌面 Chromium/WebKit 移动视口模拟，不等于实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 验收；未接触正式宿舍数据。

## 2026-10-24 创建进度回退监听生命周期
- 新增 `observeElementSize.mjs`，在 `ResizeObserver` 不可用时改用窗口 `resize` 并返回精确的反注册函数；`CreationProgress.vue` 在卸载时调用该清理函数。只改变尺寸监听生命周期，不改进度交互。
- 浏览器脚本在隔离环境模拟无 `ResizeObserver`，验证回退监听只添加一次、事件触发重测、卸载后移除同一监听且不再更新；另对真实进度控件覆盖 `pointercancel`、`lostpointercapture` 及拖动切到下一步再反向松手。首次试图全页移除浏览器 API 会使其他组件初始化失败，故最终采用独立回退助手的隔离测试；正式页面本身未替换浏览器 API。
- `node scripts/check-dorm-wizard-browser.mjs` 与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：全流程通过，均输出 `PASS []`；涵盖教程、五步向导、预览隔离、创建/首次引导、旧工作台及 320/390/430px 视口。
- `npm run web:build`、`npm run spec:check`、Impeccable 检测（`[]`）及 `git diff --check` 通过；构建仍有既有 GuestHome 大 chunk 提示。
- 桌面 Chromium/WebKit 模拟，不等于实体 iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 验收；未创建 PR、未合并、未部署、未访问或修改正式数据。

## 2026-10-24 欢迎引导文案去重
- 首屏说明改为“首页会显示今天的任务和负责人。”，日历页说明收敛为“设置里可以调整任务。”；教程页数、标题、顺序、导航、球球及行为不变。
- `scripts/check-dorm-wizard-browser.mjs` 精确断言四页说明文案，保持滑动同步、跳转、短屏与横屏可达性回归；修改前后截图为 `data/startup-review/webkit-welcome-guide-copy-before.png` 与 `data/startup-review/webkit-welcome-guide-copy-after.png`。
- 自动化为 macOS WebKit/Chromium 的移动视口模拟，非实体手机验收；未接触正式宿舍数据。

## 2026-10-24 新版通知权限说明收敛
- 新版宿舍通知设置抽屉现在同时提供用途说明和开启操作；删去额外的 `PermissionPrimer` 二次抽屉。调用系统授权仍只发生在用户明确点击开启后，拒绝状态继续显示原错误及重试入口。未改旧宿舍通知入口、订阅接口或权限业务语义。
- `scripts/check-dorm-wizard-browser.mjs` 在隔离环境替身 `Notification.requestPermission()`；WebKit 缺少部分 Web Push API 时仅补最小测试桩以覆盖支持分支，不会弹出真实系统权限框。检查打开设置请求数为 0；点击开启请求一次；模拟拒绝后错误和重试按钮仍可见，再次点击才发起第二次请求。两种浏览器引擎运行完整脚本，各 118 项断言均通过，结果文件 `data/startup-review/chromium-wizard-result.json`、`data/startup-review/webkit-wizard-result.json` 的 `errors` 均为空；当前抽屉截图分别保存在 `data/startup-review/chromium-notification-settings-explanation.png`、`data/startup-review/webkit-notification-settings-explanation.png`。
- `npm run web:build`（`vue-tsc`、Vite、PWA）通过；`npm run spec:validate` 18/18 通过；`node --check scripts/check-dorm-wizard-browser.mjs` 与 `git diff --check` 通过。构建有既有大 chunk 提示。全量 `npm run spec:check` 在范围扫描阶段被工作树里既有的未授权文件 `site/runtime/email-runtime.cjs` 阻止；该文件未编辑、未暂存、未提交，本轮其余 OpenSpec scope 将在干净提交树中复核。Impeccable detector 对既有 `ChoreBoard.vue:2869` 弹性曲线报 warning，与本次改动无关，未改其动画。
- Chromium/WebKit 是 macOS 桌面浏览器的隔离移动视口模拟，不代表实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 已验收。未使用真实通知订阅、未访问正式数据；未创建 PR、未合并、未部署。

## 2026-10-24 规则页按需显示定时任务选择
- 默认轮换和完成交接模式不显示仅供定时任务使用的任务切换胶囊；按时间安排且有多个可配置任务时，选择器通过已有 `wizard-panel` 过渡平滑出现。单个定时任务时直接显示该任务的时间设置，不显示无意义的单项选择。
- Chromium 与 WebKit 的 `scripts/check-dorm-wizard-browser.mjs` 全流程均通过（`errors=[]`）：覆盖默认模式隐藏、按时间安排显示、离场动画结束后移除、完成交接隐藏、回到定时模式后恢复同一任务与截止时间，以及 390×844 单屏布局。
- 同一套测试还覆盖 320/390/430px 宽度、短屏滚动、减少动态效果、预览组件及写入隔离；截图位于 `data/startup-review/chromium-wizard-rules-default.png`、`data/startup-review/chromium-wizard-rules-scheduled.png`、`data/startup-review/webkit-wizard-rules-default.png` 与 `data/startup-review/webkit-wizard-rules-scheduled.png`。
- `npm run web:build` 通过（Vue 类型检查、Vite 与 PWA 构建）；`npm run spec:validate` 18/18 通过；浏览器脚本语法检查与 `git diff --check` 通过。构建仍报告既有 `GuestHome` 大 chunk 提示。
- Chromium/WebKit 为 macOS 桌面引擎上的隔离移动视口模拟；未做 iPhone、Android 或 HarmonyOS 真机验收。未改规则/后端/数据，不创建 PR、不合并、不部署。

## 2026-10-24 校验提示随输入恢复
- 复现：空宿舍名提交后显示“先填写宿舍名称”；将输入改成有效名称时，旧提示仍显示，必须再次按“继续”才消失。
- 修复：`DormWizard.vue` 在本地错误存在期间随草稿编辑重算当前步骤校验；预览步骤使用完整 `draftErrors(draft)`，其他步骤复用 `issue()`。校验规则、草稿格式、创建 API 和旧宿舍流程未改。无效空白输入仍保持错误提示，输入有效名称后无需再次点击即可清除。
- `DORM_BROWSER=chromium node scripts/check-dorm-wizard-browser.mjs` 与 `DORM_BROWSER=webkit node scripts/check-dorm-wizard-browser.mjs`：完整隔离向导回归均通过，最终结果 `PASS []`；新增断言覆盖“无效值继续报错”和“修正后立即清除”。
- `npm run web:build` 通过（Vue 类型检查、Vite 与 PWA）；仍有既有 `GuestHome` chunk 大于 500 KB 的构建提示。`npm run spec:validate` 18/18 通过；浏览器脚本 `node --check` 与 `git diff --check` 通过。
- 当前主工作树的 `npm run spec:scope` 被既有、未触碰的 `site/runtime/email-runtime.cjs` 改动阻止；该 23 行工作区内容没有暂存或纳入本次修改。将在提交后的独立干净工作树中重新运行范围检查。
- 修改后移动视口截图：`data/startup-review/chromium-wizard-name-after.png`、`data/startup-review/webkit-wizard-name-after.png`。这是 macOS Chromium/WebKit 浏览器模拟，不是实体手机截图。iPhone Safari/PWA、Android WebView 和 HarmonyOS ArkWeb 未真机验收；未访问或修改正式宿舍数据。
- 本轮仅修改新版向导的本地错误提示状态、对应浏览器断言和 OpenSpec 记录；未创建 PR、未合并、未部署。
