# ChatGPT → Codex · Web 回归夹具、聚光焦点与任务槽限制增量评审（2026-10-24）

- reviewed_code_sha: `0e29305d01fd291f36a7080db22ef5974fdd70cb`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- previous_reviewed_code_sha: `e0f7141897cc2f012e3647e96b6ce6ce7dc2a069`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/0e29305d01fd291f36a7080db22ef5974fdd70cb
- diff: https://github.com/RUIAN12138/dorm-duty/compare/e0f7141897cc2f012e3647e96b6ce6ce7dc2a069...0e29305d01fd291f36a7080db22ef5974fdd70cb
- assessment: **确认新业务代码 SHA 有效，且与远端开发分支 HEAD 相同。** 相对上轮增加两个提交（`8b491db583171fd3a6ca76b51b0245951fa1309f`、`0e29305d01fd291f36a7080db22ef5974fdd70cb`），共 17 个变更文件；其中产品运行时仅改 `DormWizard.vue`、`SpotlightTour.vue`，其余为五个测试夹具、浏览器断言及 OpenSpec。此前 5 项 `web:verify` 失败已有针对性修复；**Codex 报告完整套件退出码 0，但本轮未独立执行，GitHub CI 仍无结果**。聚光焦点隔离有可核查的实现与断言。**新发现需求差距：新建宿舍的总任务数实际被固定为 4，需求只规定值日页至多 4 项，第二任务页应能承载额外任务。** vivo 安卓冷启动重新登录仍未解决、未真机验证。
- review_method: GitHub 连接器读取 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、上一版 CHATGPT_REVIEW；验证交接 SHA、远端开发分支 HEAD、两次提交的真实 patches 与 compare 文件统计；检查 `SpotlightTour.vue`、`DormWizard.vue`、`dormDraft.ts`、`TaskPageBoard.vue`、`check-dorm-wizard-browser.mjs`、五个夹具补丁和旧库迁移测试实际断言；核查全部可检索 74 个 PR 的状态、6 个开放 PR 的评论/审核/线程/CI，main 及 #37/#38/#39/#40/#41/#46。**未独立执行 Node、浏览器、SQLite 测试，未连接真实设备或访问生产服务/数据库。**
- handoff_freshness: `code_branch=codex/new-dorm-wizard-preview`，`code_sha=0e29305d01fd291f36a7080db22ef5974fdd70cb` 为有效完整业务 SHA，等于远端分支 HEAD，不将协调文档提交算作代码提交。
- CI: 该 SHA 的 Commit Status `statuses=[]`、Check Runs `total_count=0`、PR-triggered workflow runs `[]`；无可确认远端 CI 通过记录。Codex 报告五个原失败脚本各自通过、迁移 11/11 用例及 192 项断言、`npm run web:verify` 退出码 0、Chromium/WebKit 向导专项各 171 项、`spec:validate` 19/19、干净 worktree 的 `spec:scope` 通过；均属 Codex 执行报告，不是本次独立运行证明。仍有 `GuestHome` >500KB 既有构建警告。
- PR/main: 全部可检索 74 PR：开放 #24/#80/#81/#82/#83/#84，其余 68 均 merged；本轮无新增 PR、合并、关闭、审核提交或审核线程。#24 仅 10 月 15 日旧评论，其他开放 PR 无评论；各 head Actions 依次为 action_required / success / success / failure / failure / failure，均为历史状态，**不代表当前业务 SHA 的 CI**。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`，未更新。
- issues: #37/#38/#39/#40/#41/#46 均仍 open，更新时间不晚于 2026-10-16；无新阻塞/状态变化。Android 真机身份/通知/返回验收仍对应 #39。
- platform_status: macOS Chromium/WebKit 的模拟测试不等于 iPhone Safari/PWA、vivo Android WebView 或 HarmonyOS ArkWeb 真机；真实邮箱 Cookie 持久化、设备级键盘/返回/通知与正式部署未验证。
- need_user_decision: 无需立即决策；“值日页至多四项”已在用户需求中明确，不应自行解释为“整个宿舍最多四项”。vivo 复现需要自愿提供脱敏设备型号、系统版本、APK 版本、退出方式和间隔；不得收集验证码、Cookie、Token、密码或宿舍真实数据。

## P0 · 数据隔离和旧宿舍兼容（未发现新增 P0）

- 本轮产品运行时代码未修改 Worker、数据库迁移、旧宿舍成员/轮序/权限；五项 Web 回归修复集中于测试夹具。旧库迁移测试不再通过新版 API 在旧 schema 上播种，而是直接在临时旧 SQLite 写入用户、宿舍、任务、会话、提醒、推送订阅及任务，再执行增量迁移；测试断言新增 `completed_by` 为 NULL、旧记录保持、外键和完整性正常。此处是**测试设计的真实改进**，不等于我已执行测试。
- **验收**：在隔离数据环境重跑旧宿舍成员身份、历史打卡、轮序、通知、撤销/代做与旧库迁移；全屏预览须继续复用正式组件但只绑定沙箱草稿，完成/撤销/催促/通知/导航重排后真实业务写请求和推送均为 0；禁止访问生产库。

## P1 · 下一轮重点与可执行验收

### P1-A · 五项完整 Web 回归旧失败已针对性处理，需可复现的独立证据

- 真实补丁：手势测试由 7px 改为 12px，越过现有 10px 起拖阈值；Emotion 测试 Vue stub 补 `watch`；两个 esbuild 夹具处理 CSS 导入；迁移测试改用旧 schema 原生 SQL 播种，保留升级前后历史比较与 `completed_by IS NULL` 断言。没有通过改运行时手势阈值、删业务断言来掩盖失败。
- **验收**：从已推送 SHA 的干净检出执行五项脚本与 `npm run web:verify`，保留完整日志、用例数、退出码及失败详情；如果 CI 配置允许，提供与该 SHA 绑定的 Actions 结果。正式发布前不把 Codex 的本地绿灯称为远端 CI 通过。旧库迁移测试要继续证明既有数据不变，不能用新库代替旧库。

### P1-B · 新发现：任务“总数固定四项”与用户需求不一致

- `frontend/src/interaction/dormDraft.ts` 将 `TaskKey` 固定为 `floor|toilet|sink|water`，初始仅四项；`DormWizard.vue` 的草稿恢复明确要求 `tasks.length<=4`，`custom()` 只能复用禁用槽位；本轮 `hasFreeTaskSlot` 在四项全启用时隐藏新增按钮并提示“移除一项后可添加自定义任务”。`TaskPageBoard.vue` 已**单独**限制值日页至多四项，表明“值日页四项”和“全宿舍四项”是不同约束。
- 用户需求是**值日页至多四项**，还允许将其他任务放第二任务页或催促页。当前 UI 不能在保留四项值日任务的同时创建第五项第二页任务。该限制是既存架构，本轮新增 UI 将其明确暴露；不是说本轮引入了底层四槽限制。
- **验收**：先检查后端 schema/任务键、API、历史/轮序与前端配置的扩容可行性；仅在用户明确批准对应开发范围后实现“值日页 4 项 + 第二页额外至少 1 项”，验证新增任务的创建、持久化、轮换、完成、撤销、日历、导航预览与旧宿舍完全不变。**不得仅增加前端按钮或改 `length<=4` 绕过服务端约束。** 未授权时保留为明确未满足需求，不擅自大改任务模型。

### P1-C · vivo 安卓 App 冷启动重登仍为真实用户阻塞，未在此 SHA 修复

- 本轮两个业务提交未修改 Android WebView、邮箱 Cookie、`persistentSession.ts`、`session.ts` 或 `GuestHome.bootEntry()`。交接明确本地 session/startup 另有未提交修改，不可视为已同步或验收。继续区分 WebView Cookie、localStorage token、服务器身份拒绝、启动网络失败及旧 APK 版本，不预设 vivo 系统清理为根因。
- **验收**：使用独立测试身份，在 vivo 目标机上分别执行普通退出、任务列表划掉、强制停止、手机重启、断网再恢复，每种 3 次；仅记录 Cookie/token 是否存在的布尔值、`/email/me` 与 `/email/enter` HTTP 状态、App/APK 版本及结果，不打印凭据。未过期且未主动登出应恢复原成员，临时网络失败可重试；主动登出后不能静默恢复。必须真机复测，不能把本地改动或模拟器通过当成修复。

### P1-D · 聚光引导焦点隔离已改进，需检查复杂模态和真机

- `SpotlightTour.vue` 新增宿主初始焦点、Tab/Shift+Tab 循环、Escape 关闭、祖先兄弟节点 inert 及原状态恢复、关闭后返回触发按钮；浏览器脚本确有对应断言。未发现立即可证实的焦点越界，但 `focusableElements()` 仅按 CSS 选择器列举控件，**未过滤隐藏、inert 或实际不可聚焦项**，嵌套弹层/动态按钮变化时仍可能错误跳焦；这属于需验证的边界风险。
- **验收**：在真实向导及任务工作台中依次验证 Tab/Shift+Tab、Esc/系统返回、快速关闭重开、步骤按钮动态出现/消失、屏幕阅读器与宿主已有 inert 状态；关闭后恢复正确触发点且不留下不可操作的页面。真实 iOS/Android/HarmonyOS 下再核对聚光位置 ≤8px、系统键盘与通知抽屉快速操作；模拟测试不能替代真机。

## P2 · 剩余体验、证据与范围

1. 本轮“满四槽时隐藏不可执行新增按钮”在现有固定槽位模型下比展示失败按钮更一致；但不能据此认定满足“额外任务”产品需求。待 P1-B 的数据模型方案确定后再设计简洁新增入口。
2. 球球跨页接续、任务切换、玻璃进度滑块按压与轻震、长按导航重排、中文姓名字体、旧绿色像素标识、Bottom Sheet 底部背景与 iOS 动效未在本轮 runtime diff 修改；保留既有专项验收要求，提供脱敏真机截图/录屏。
3. 仍未获得 Android vivo、iPhone Safari/PWA、HarmonyOS ArkWeb 真实设备验收；原生通知、真实邮箱认证和正式部署均不能宣称通过。

## 下一轮 Codex 交接

优先在 vivo 目标机定位并最小修复冷启动重登；其次取得完整 Web 回归的可复现独立/CI 证据、验证聚光焦点及真机交互；对“总任务四槽限制”先做兼容性评估，不经用户批准不扩大底层任务模型范围。沿用 `codex/new-dorm-wizard-preview`，只有新的实质业务代码提交并 push、更新 CODEX_HANDOFF 完整 SHA 后才触发下一次评审；不得因本评审、纯文档或重复 CI 循环。未经授权不创建/合并 PR、不部署、不接触正式数据库。
