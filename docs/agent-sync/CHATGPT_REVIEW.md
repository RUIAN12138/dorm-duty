# ChatGPT → Codex · 新宿舍创建、球球接续与聚光引导增量评审（2026-10-24）

- reviewed_code_sha: `10a820e0cf5a6274964113ce2a0086fc3bbea5b3`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/10a820e0cf5a6274964113ce2a0086fc3bbea5b3
- previous_reviewed_code_sha: `b1c69f06e0154521bd7be87d85db11aa6a85e0f2`
- diff: https://github.com/RUIAN12138/dorm-duty/compare/b1c69f06e0154521bd7be87d85db11aa6a85e0f2...10a820e0cf5a6274964113ce2a0086fc3bbea5b3
- assessment: **确认新的完整业务 SHA 有效，且与开发分支 HEAD 完全一致。** 自上一轮评审起 9 个提交（含一次仅登记范围的文档提交），共 14 个文件发生变化；实际功能改动包括 v2 通知抽屉退出生命周期修复、创建校验提示同步、创建成功后球球位置接续、首次教程等待球球入场、一键进入正式组件全屏预览、教程入口术语、聚光引导在模态工作台内可操作及减少动态效果。**未发现新的服务端权限或旧宿舍数据写入 P0。** 仍有四项完整 Web 回归的既存失败未消除；聚光定位、通知完整退出与真机行为还缺端到端证据，不能宣布发布验收。
- review_method: 使用 GitHub 连接器读取 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、上一版 CHATGPT_REVIEW；核对完整提交、开发分支 HEAD、9 个提交的真实 compare patches；独立查看 ChoreBoard、ChorePushSettings、ElasticSheet、DormWizard、TaskWorkspace、SpotlightTour、LiveDraftPreview、ChoreBottomNav、DormCompanion、companion.ts、WelcomeGuide 与浏览器测试的实际实现。核对全仓库 74 个 PR 的 open/closed/merged 分组、6 个开放 PR 的状态、讨论/审核/线程及 head Actions，main 和重要 Issues。**本轮是独立源码与测试设计审查；没有在本环境执行 Node、浏览器或真机测试。**
- handoff_freshness: CODEX_HANDOFF 的 `code_branch=codex/new-dorm-wizard-preview`、`code_sha=10a820e0cf5a6274964113ce2a0086fc3bbea5b3` 有效；与该分支 HEAD 相同；不将本协调分支提交或测试重跑当作业务代码更新。
- CI: 业务 SHA 的 Commit Status `statuses=[]`、PR-triggered Actions `workflow_runs=[]`，无可确认的 GitHub CI 通过记录。Codex 报告 macOS Chromium/WebKit 的 `scripts/check-dorm-wizard-browser.mjs` 各 142 项、`npm run web:build`、`npm run spec:validate`（18/18）及语法/diff 检查通过；本轮未独立复跑，且**未执行完整 `npm run web:verify`**。旧 `GuestHome` 大 chunk 警告仍在。
- PR/main: 可检索 PR 共 74 个：开放 #24/#80/#81/#82/#83/#84，另 68 个均为 merged（未发现仅关闭未合并）；六个开放 PR 均无 review submission 或 review thread；#24 仅 2026-10-15 旧评论，#80–#84 无新评论。其各自 head 的 Actions 仍分别为 #24 action_required、#80/#81 success、#82/#83/#84 failure；这些**不是本业务 SHA 的 CI**。main HEAD 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`；没有新 PR、合并或关闭。
- issues: #37/#38/#39/#40/#41/#46 均 open，最后更新时间仍为 2026-10-16；无新评论/状态阻塞。
- platform_status: 仅有 Codex 报告的桌面 Chromium/WebKit 移动视口模拟；真实邮箱认证、iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb、真实通知权限与正式部署均未验收。未访问正式服务或数据库。
- need_user_decision: 暂无必须由用户决定的新事项。未经用户授权不创建/合并 PR、不部署、不访问正式数据库。

## P0 · 数据与权限边界（本轮未发现新 P0）

1. 此范围未修改 Worker 权限、SQLite 迁移或旧宿舍轮序；`TaskWorkspace` 的真实设置 PATCH 仍与 `LiveDraftPreview` 分离。预览使用正式 `ChoreBoard preview`、正式底栏和沙箱草稿/合成任务数据；本轮新增前四步一键打开预览，未新建另一套假页面。
2. **验收门禁**：在隔离 API/SQLite 重跑新旧宿舍本人完成、代做、撤销、轮序、历史、身份、提醒用例；使用实际正式组件预览树和网络拦截，逐项操作完成/撤销/催促/通知/账号/导航重排，断言真实业务写请求、推送发送均为 0，旧宿舍记录与轮序不变。源码静态观察不等于副作用零风险已获独立验证。

## P1 · 下一轮优先处理的阻塞与可执行验收

### P1-A · 完整 Web 回归的四项旧失败仍阻塞整体验收

- 既有失败：`check-screen-gesture-check.mjs` 的 `swipePose.opacity<1`、`check-settings-save-lifecycle.mjs` 与 `check-navigation-components.mjs` 的 `memberNames.css` 测试夹具导入、`check-scheduled-reminders.mjs` 的旧迁移 `/guest/create` 500（预期 201）。
- 本轮交接未报告重新执行 `npm run web:verify`，不可把向导专项 142 项或构建通过称作全站回归全绿。
- **验收**：先复现四项、保留旧基线对照；区分夹具与产品缺陷，最小范围修复后执行完整 `npm run web:verify`，记录全部通过/失败项及原始日志；若未经授权不能修范围外代码，则继续明确阻塞，不删断言或扩大容差掩盖问题。

### P1-B · 通知抽屉关闭生命周期已修复源码缺口，需补全路径验证

- `ChoreBoard.vue` 已引入 `pushSheetMounted`，打开时挂载，`@closed` 后且 `pushOpen=false` 才卸载；对应先前评审的 v2 立即卸载风险在实现上已得到修复。新 `check-companion-chat-browser.mjs` 使用隔离 v2 board 测试“系统通知”设置子页水平退出后再卸载，能支持部分路径，但不是所有弹层退出行为的证明。
- **验收**：在真实 `ChoreBoard` 的 v2 和旧宿舍分别测试“返回上一层、关闭抽屉、遮罩、系统返回、快速重开”；断言 closing 阶段可见、退出完成后卸载、`closed` 恰好一次、无悬挂遮罩与重复提醒；在预览模式中无真实通知入口/写请求。优先补测试，若无失败不重构共享弹层。

### P1-C · 聚光灯从 Teleport 移入模态树后，必须验证真实目标几何与键盘可用性

- 最新 `SpotlightTour.vue` 移除了 `Teleport to=body`，改在 `DormWizard/TaskWorkspace` 的模态内容树中呈现；源码确实增加 `prefers-reduced-motion` 对光区过渡及按钮缩放的降级。浏览器新增断言覆盖实际点击“使用引导”→“跳过”→继续编辑，以及 CSS transition 属性；**未断言聚光框与真实目标重合**，也未覆盖连续下一步/上一步、目标缺失或键盘焦点。
- `TaskWorkspace` 的 `.workspace-overlay` 有入场 transform 动画，`SpotlightTour.position()` 用视口 `getBoundingClientRect()`，`.tour` 是子树内 fixed；在动画中、缩放/键盘视口变化时存在潜在坐标系/层叠上下文风险（静态风险，未证实出现偏移）。
- **验收**：在 320/390/430 宽、短屏、横屏、打开键盘、系统减少动态效果及标准模式下，实际依次点击“下一步/上一步/跳过”，逐步比较 `.tour-light` 与目标的矩形位置误差（建议各边 ≤8px），确认按钮可点、背景不可误触、焦点返回合理；快速打开/关闭时不闪屏。若复现偏移，再最小修正坐标或容器层级，避免直接恢复原来被模态层拦截的 Teleport。

## P2 · 新增体验改进与残余风险

1. **创建与预览**：`DormWizard` 现在前四个编辑步骤可直接打开现有 `LiveDraftPreview`；源码没有新增独立假 UI，退出事件保持当前步骤。浏览器断言覆盖名称页、规则页返回和草稿保留，但请补任务/页面安排两步、长按导航重排、通知与账号入口副作用拦截的完整记录。
2. **球球连续入场**：`captureCompanionHandoff(source)` 现在支持从创建向导真实球球取几何位置；`ChoreBoard.load()` 等待 `companionEntering` 复位再弹首次教程。源代码包含 6 秒超时兜底，避免永久等待；但需验证快速重复 load、网络延迟、球球关闭、减少动态效果、页面中断时不会卡住首次引导或出现两次引导。浏览器新增 WAAPI 位置与完成断言，但不是手机实测。
3. **提示和教程**：修复校验提示在合法输入后残留，欢迎页使用“值日页/设置”真实入口名称，欢迎球球只关闭粒子等重效果而不改变创建页原特效；与现有黑白极简要求一致。仍需提供脱敏真实截图/录屏确认视觉一致性、中文圆润姓名字体、旧绿色像素标识、Bottom Sheet 底部背景及玻璃滑块。
4. **旧宿舍共享文案**：上一轮提到 `ChorePushSettings.vue` 的通知说明是无版本条件共享文案，本轮未修改；如果严格要求旧宿舍视觉文案完全不变，需在相关产品范围获得用户明确授权后做版本条件处理，不得顺手大改旧页面。
5. **设备与可访问性**：桌面 WebKit 不等于 iPhone Safari；继续标明 iPhone PWA、Android WebView、HarmonyOS ArkWeb、真实邮箱和通知系统弹窗均未验证。聚光灯需验证屏幕阅读器、Esc/返回和焦点管理。

## 下一轮 Codex 交接

先解决或准确保留 P1-A 四项 Web 回归阻塞；补 P1-B 通知完整退出与 P1-C 聚光目标几何/键盘验证，再小范围处理真实复现问题。保持原 `codex/new-dorm-wizard-preview` 开发分支，完成实质业务代码提交并 push 后，仅由 Codex 更新 `CODEX_HANDOFF.md` 的完整新 SHA；ChatGPT 只评审下一次有效新业务 SHA。不要因本评审文档更新或重复 CI 结果形成循环。未经用户授权不创建/合并 PR、不部署、不接触正式数据库。
