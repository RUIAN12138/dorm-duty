# ChatGPT → Codex · 新宿舍通知说明、规则页与教程增量评审（2026-10-24）

- reviewed_code_sha: `b1c69f06e0154521bd7be87d85db11aa6a85e0f2`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/b1c69f06e0154521bd7be87d85db11aa6a85e0f2
- previous_reviewed_code_sha: `ba7c0ca9b9d5970568f956907d5415bd3109ff39`
- diff: https://github.com/RUIAN12138/dorm-duty/compare/ba7c0ca9b9d5970568f956907d5415bd3109ff39...b1c69f06e0154521bd7be87d85db11aa6a85e0f2
- assessment: **确认交接 SHA 为真实业务提交；相对上轮评审有 4 个代码提交、12 个变更文件。** 实际变化包括教程文案去重、新版通知权限说明合并、规则页非定时模式隐藏任务选择器、三张规则卡的最后一张居中，以及浏览器测试。**发现一项新的 P1 关闭动画生命周期风险**：新版通知抽屉随 `pushOpen=false` 被父组件 `v-if` 立即卸载，绕过 ElasticSheet 设计的退出动画和 `closed` 回调。未见新的服务端权限/旧宿舍数据写入 P0；完整 Web 回归旧四项仍未消除，不能宣布整体验收。
- review_method: 通过 GitHub 连接器读取 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、上一轮 CHATGPT_REVIEW，核对交接 SHA、分支和 4 个提交的真实 compare/diff；读取 ChoreBoard、ChorePushSettings、ElasticSheet、memberPush、DormWizard、dormDraft、LiveDraftPreview、CreationProgress、SpotlightTour、WelcomeGuide 与浏览器测试；核对全部 74 个 PR 的开闭/合并、6 个开放 PR 的评论/审核/线程及 CI、main 与重要 Issues。**这是独立静态源码和测试设计评审，未独立执行 Node、浏览器、CI 或真机测试。**
- handoff_freshness: 交接 `b1c69f06e0154521bd7be87d85db11aa6a85e0f2` 是开发分支上的真实祖先提交；检查时 `codex/new-dorm-wizard-preview` HEAD 已另前进 1 个提交至 `784dc8a51fb31fbed8fa9ccc7f24a6b9aaa7bd14`。**本轮 reviewed_code_sha 严格只到 b1c69f06；784dc8a 尚未评审，需 Codex 下次准确交接新完整 SHA。**
- CI: 交接 SHA 的 Commit Status `statuses=[]`、PR-triggered Actions `workflow_runs=[]`，无可确认 CI 通过记录。Codex 报告 Chromium/WebKit `scripts/check-dorm-wizard-browser.mjs` 均 `PASS []`、`npm run web:build` 通过、语法与 diff check 通过；本轮未运行完整 `npm run web:verify` 或 `npm run spec:check`。浏览器测试新增了权限请求桩、规则卡宽度与居中、节奏切换、草稿保留等断言；截图仅报告位于 Codex 本机、未上传仓库，不能据此宣称我已看到截图。
- PR/main: 可检索 74 个 PR 中开放 #24/#80/#81/#82/#83/#84，其余 68 个均已合并；没有新增合并/关闭。开放 PR 的审核提交与 review threads 均为 0；#80–#84 无评论，#24 仅 2026-10-15 的旧评论。对应最新 PR head 的 Actions 仍为 #24 action_required、#80/#81 success、#82/#83/#84 failure，未见新的结果。这些 CI 不是本次向导 SHA 的 CI。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: 重要 #37/#38/#39/#40/#41/#46 均仍 open，更新时间早于本轮，无新增状态或评论阻塞。
- platform_status: Codex 的 Chromium/WebKit 属于 macOS 桌面引擎移动视口模拟；真实邮箱认证、iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb、真实系统通知权限弹窗与正式部署均未验收。未触及生产服务或数据库。
- need_user_decision: 暂无必须由用户决定的新事项。未经用户授权不创建/合并 PR、不部署、不访问正式数据库；保持仅在原业务分支小范围修改。

## P0 · 数据、权限与预览隔离

1. **本轮未发现新的 P0。** 四个新提交没有修改服务端权限、数据库迁移或旧宿舍轮序。LiveDraftPreview 仍以 `ChoreBoard preview`、正式 ChoreBottomNav、负数合成成员/任务 ID 和本地草稿构造完整预览；ChoreBoard 的通知入口受 `!preview` 限制。仅凭本次静态检查不能证明所有预览副作用路径已安全。
2. **验收门禁**：隔离 SQLite/API 重跑新旧宿舍的完成、代做、撤销、历史、通知与成员身份测试；使用真实预览组件树和请求拦截记录，确认预览打卡、通知、设置、账号入口的真实业务写请求为 0；旧宿舍数据、历史和轮序不得自动迁移/重置。

## P1 · 本轮发现的真实代码风险及阻塞

### P1-A · 新版通知抽屉关闭时立即卸载，可能跳过退出动画和 closed 生命周期

- **证据**：`frontend/src/components/ChoreBoard.vue` 当前使用 `<ChorePushSettings v-if="!preview && (!board.configuration || pushOpen)" v-model="pushOpen" ... @closed="presentNewReminders" />`。v2 的 `board.configuration` 为真时，用户在抽屉关闭事件里将 `pushOpen` 置为 false，父级条件立即变 false 并卸载整个组件。
- `frontend/src/components/ElasticSheet.vue` 的正常关闭路径在 `watch(modelValue)` 中进入 `phase='closing'`、执行 `go(hiddenGoal(),'exit')`，完成后才 `emit('closed')`；`onBeforeUnmount` 则停止动画。由于父级先移除组件，v2 路径没有机会完成原有退场动画及 `closed` 事件。ChoreBoard 另有状态 watcher 会刷新提醒，但这不等价于抽屉退出动画完成后的 `@closed` 时机。**这是由源码直接推导的生命周期风险，尚未经浏览器关闭过程实测。**
- **建议**：保留 v2 通知抽屉实例直至 ElasticSheet 发出 `closed`，然后再按需卸载；可以增加单独的 `pushSheetMounted` 状态，由打开动作置 true、`@closed` 在仍关闭时置 false。不要为了修复直接永久挂载所有 v2 通知设置子组件或改变旧宿舍路径。
- **验收**：在 390×844 Chromium/WebKit 真实 ChoreBoard 路径中打开通知设置、点关闭/点遮罩/系统返回/快速重复开关；逐次断言 `data-phase` 从 open 进入 closing、完成后移除 DOM、`closed` 事件恰好一次、无悬挂弹层、提醒横幅不与退场重叠。旧宿舍通知抽屉、权限拒绝重试和预览无通知入口均回归。避免只等待 `push-settings` DOM 立刻 detached 来误判动画正常。

### P1-B · 完整 Web 回归仍有四项既存失败

- `check-screen-gesture-check.mjs` 的 `swipePose.opacity<1`；`check-settings-save-lifecycle.mjs` 与 `check-navigation-components.mjs` 的 `memberNames.css` 测试夹具导入；`check-scheduled-reminders.mjs` 的旧迁移 `/guest/create` 返回 500。
- **验收**：逐项保留最小复现与基线对照，修正真实问题或测试夹具后完整执行 `npm run web:verify`；输出原始失败日志、通过/失败数，不删除断言、不擅改范围外产品。若本轮不处理，继续标为发布阻塞而非“已通过”。

### P1-C · 通知权限测试是模拟，真实平台仍缺验证

- 真实 `ChorePushSettings` 确实先显示用途说明；`enableMemberPush` 仅由用户点击 `enable` 调用 `Notification.requestPermission()`。删除双重 PermissionPrimer 的方向合理，代码并未在打开设置时主动请求权限。
- 新浏览器测试在初始化脚本中替换 `Notification.requestPermission` 并为缺少 API 的 WebKit 添加 `PushManager`/serviceWorker 测试桩，能证明代码分支与错误反馈，但不能证明真实 iOS PWA、原生 Android/HarmonyOS 的系统权限行为、推送订阅成功或拒绝后的平台重试。
- **验收**：提供真实设备或受控真实浏览器环境的“首次打开→用户明确点击→系统权限→拒绝/允许→关闭重开→订阅状态”记录；未测试平台标记未验证。不能把测试桩通过称为真机权限通过。

## P2 · 本轮改进与范围约束

1. **规则页精简已在源码确认**：非定时模式隐藏仅用于编辑定时任务的选择器，切到 scheduled 且有多个任务才显示；`chooseCycle` 没有主动清除时间字段。新增浏览器断言覆盖切换后保留截止时间。三张规则卡的最后一张使用 `grid-column:1/-1` 与半宽 `max-width` 居中，10px gap 与当前两列布局相符；几何测试覆盖 320/390/430px。后续仅需补长中文名称、系统大字体、横屏与低高度场景，不能因为小屏去裁剪按钮。
2. **欢迎教程文案去重已确认**：仅改首屏与日历页的两句说明，未改变四页流程、路由或球球行为。继续验证首次出现/跳过/重看/返回和真实聚光目标缺失降级。
3. **共享通知组件文案影响旧宿舍**：`ChorePushSettings.vue` 的“开启后，值日和室友留言…”是无版本条件的全局文案变化，旧宿舍也会看到。虽然未改旧宿舍权限与数据，但与“只针对新版、旧宿舍保持原样”的范围声明并非完全一致。若必须严格保持旧版文案，可用配置版本条件仅在 v2 显示新版说明；不要顺带改旧宿舍 UI。
4. **持续视觉验收**：粗黑白进度轨道/小清透玻璃滑块、球球 Tips 和连续入场、正式任务横向切换、全屏预览导航拖拽、中文圆润姓名字体、旧绿色像素标识移除、Bottom Sheet 连续背景均需以真实截图/录屏核对。缺少上传证据时不称视觉验收完成。

## 下一轮 Codex 交接

优先修复 **P1-A 通知抽屉关闭生命周期** 并补真实组件关闭过程测试；继续处理四项既存 Web 回归或明确保持阻塞；检查旧宿舍共享文案范围；保留所有未验证设备与认证状态。完成新业务改动后，在原 `codex/new-dorm-wizard-preview` 分支提交、推送并由 Codex 更新 `CODEX_HANDOFF.md` 的完整 SHA。当前 HEAD `784dc8a51fb31fbed8fa9ccc7f24a6b9aaa7bd14` 尚不属于本次评审，不应当作已审核。ChatGPT 只审下一次有效交接的业务 SHA；不因纯文档变更循环，不创建/合并 PR、不部署、不接触正式数据库。
