# ChatGPT → Codex · 新宿舍五次增量提交与教程交互评审（2026-10-24）

- reviewed_code_sha: `d7930a70583de86f41629ca231d0c7975eefaf6b`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/d7930a70583de86f41629ca231d0c7975eefaf6b
- previous_reviewed_code_sha: `251e950dca1421f34b7e3aa4bb6af1a461bc2791`
- assessment: **确认 5 个真实业务提交、累计 12 个改动文件，开发分支 HEAD 与交接 SHA 一致。** 本次不仅是末次“名称页精简”：期间还修复了上一轮 P1 提前抬水撤回回执不一致、改进五步进度条拖动/释放处理、移除重复创建欢迎幻灯片、完善独立教程短屏可达性与交互，并补充隔离测试。静态检查未发现本轮新增 P0 越权或旧宿舍迁移代码。**仍不能宣布正式验收**：完整 `web:verify` 的四项已知失败未在末次交接中复跑/消除，真实移动设备未验证，开发分支没有 CI 通过记录。
- diff: https://github.com/RUIAN12138/dorm-duty/compare/251e950dca1421f34b7e3aa4bb6af1a461bc2791...d7930a70583de86f41629ca231d0c7975eefaf6b
- review_method: 通过 GitHub 连接器读取协调分支 `PROTOCOL.md`、`USER_REQUIREMENTS.md`、`CODEX_HANDOFF.md`、上一 `CHATGPT_REVIEW.md`，核对开发分支 HEAD，读取真实累计 diff、末次 commit patch 和 `CreationProgress.vue`、`DormWizard.vue`、`WelcomeGuide.vue`、`LiveDraftPreview.vue`、`TaskPageBoard.vue`、`GuestHome.vue`、`site/worker/chores.mjs` 及相关浏览器/API 测试；核对 main、全部可检索 PR 的合并/关闭状态、开放 PR 审核/评论/CI 和重要 Issues。**独立静态审查，不代表本人运行本地测试、浏览器或真机。**
- tests: Codex 报告末次 Chromium 与 WebKit `check-dorm-wizard-browser.mjs`、`web:build`、`spec:check` 及 `diff --check` 通过；源码中确有首屏唯一输入、必填/64 字、滑块交互、短屏横屏四页可达与预览无真实写请求等断言。累计修改的 `check-dorm-wizard.mjs` 也新增提前抬水 credit 取消回执与 SQLite 行、重复撤回 409、正式队列及副作用检查。**未独立复跑，也没有对全部既存 Web 测试成功的证据。**
- CI: 新业务 SHA 的 Commit Status `statuses=[]`；PR-triggered workflow runs `[]`。不可把本地浏览器或构建结果称为 GitHub CI 通过。
- PR/main: 可检索 74 个 PR：开放 #24、#80、#81、#82、#83、#84；其他 68 个经逐个 PR metadata 确认历史已合并，无本轮新增合并/关闭。开放 PR 审核提交及 inline threads 均为 0，#80–#84 评论为 0，#24 仅旧评论。各 PR head 的最近可见 workflow 结果：#80/#81 success，#82/#83/#84 failure，#24 action_required；本轮没有新的审核或状态变化，**这些 CI 与当前向导业务 SHA 无关**。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: 重要 #37/#39/#40/#41/#46 均仍 open，评论仍为既有记录；#38 open，未发现新的重要状态变化。
- platform_status: macOS 桌面 Chromium/WebKit 的移动视口模拟不等于实体 iPhone Safari/PWA；Android WebView、HarmonyOS ArkWeb 均未真机验收。
- need_user_decision: 无新增必须决定事项。未经用户明确授权，不创建/合并 PR、不部署、不操作正式数据库；只维护隔离开发分支和协调分支各自职责文件。

## P0 · 安全与旧宿舍隔离（本轮无新发现；保留发布门禁）

1. **已核对** `undoOnce()` 提前抬水 credit 分支：数据库和即时回执现在一致设置 `status='cancelled'`、`completed_at=null`、`completed_by=null`；重复撤回有 409 防护。对应隔离 API/SQLite 测试确实新增，旧版回执矛盾不应继续作为未修复问题反复派发。
2. `completeOnce()` 的服务端授权 `canCompleteTask()`、代做 `canDelegateTask()` 和按原计划负责人轮换的既有守卫仍在。此次前端/教程修改没有发现触及旧宿舍配置迁移、成员身份或历史数据的差异。
3. **验收**：在隔离数据库运行 `node scripts/check-dorm-wizard.mjs` 及旧宿舍/抬水回归；断言 credit 撤回状态、实际完成人、版本/队列、拒绝越权无副作用。无运行证据不得宣布 P0 真正验证完成。

## P1 · 剩余真实阻塞与功能验收

### P1-A · 四项既存 Web 回归失败尚未清除

上一轮已记录并在更早代码基线复现：`check-screen-gesture-check.mjs` 的 opacity 断言、`check-settings-save-lifecycle.mjs` 和 `check-navigation-components.mjs` 的 `memberNames.css` 测试夹具导入、`check-scheduled-reminders.mjs` 的旧迁移 `/guest/create` 500。最新 handoff **明确没有重跑完整 `npm run web:verify`**；不能因浏览器专项和 build 成功而自动视为消除。

- **执行**：逐项定位并给出最小修复/独立问题记录；不要为了过测试删除断言或改无关正式 UI。只有全套 `npm run web:verify` 全绿，或用户明确接受记录在案的独立阻塞，才能推进正式 PR/部署评估。
- **验收**：保存原始命令、失败日志、根因、修复 diff、对照基线和完整重跑统计；不改变旧宿舍行为。

### P1-B · 新创建向导与正式教程的端到端路径

- 本轮真实改动：`CreationProgress.vue` 处理释放时最终指针采样、触摸点击防重复、44px+ 命中区/20px 轨道/36px 玻璃视觉滑块；`DormWizard.vue` 首屏只留大标题与带 `aria-label` 的一个输入框，舍友命名规则转入球球 Tips；`WelcomeSlides.vue` 被删除，独立 `/guide` 仍在；`WelcomeGuide.vue` 增加横屏短屏页内滚动与跳过按压反馈。对应测试代码存在。
- **继续核对**：从邮箱认证后新建→五步草稿→滑块拖动与中途跳转→规则校验→全屏预览→正式创建→首次教程→跳过/完成/手动重看，要求草稿、导航顺序和回程均正确；旧宿舍不得被自动引导或重置。
- **特别验证**：纵向滚动与横向翻页竞争、pointercancel/lostpointercapture、按住再快速反向释放、键盘弹起和 320×568 / 568×320 / 844×390、暗色/减少动态效果。页面切换后球球 Tips 与当前步骤一致；不得因滑块跳步绕过最终服务端校验。
- **预览隔离**：`LiveDraftPreview.vue` 仍挂载正式 `ChoreBoard` 与 `ChoreBottomNav` 等组件、使用合成草稿；需继续用真实组件树拦截业务请求并核对任务详情/日历/导航长按重排/消息/提醒/账号等入口，无真实写入、无通知，退出后草稿一致。现有源码和浏览器断言只是部分证据，不能称真实设备已验收。
- **验收**：每条路径提供可重跑的 Chromium/WebKit 浏览器脚本与对应提交 SHA，记录断言数、失败数、网络写请求数及可公开的脱敏关键帧；不要只引用本地忽略目录中的截图文件名。

## P2 · 交互细节和设备证据

1. `CreationProgress.vue` 在 `ResizeObserver` 不可用时添加 `window.resize` 监听，但卸载时只断开 observer，未移除 fallback 监听；建议保存 resize 回调并在 `onBeforeUnmount` 对称移除，避免反复进入向导后的旧监听残留。添加模拟无 ResizeObserver 的挂载/卸载回归。此项为静态发现的低优先级生命周期风险，不应扩大重构。
2. 新的欢迎页横屏 CSS 使用 `!important` 缩小球球容器；在真机安全区、系统大字体与软键盘场景确认内容没有裁切、固定操作按钮不会遮挡。若有缺口，仅局部修正。
3. 旧绿色像素标识与中文圆润字体、Bottom Sheet 底部背景连续性、“查看任务”材质、创建完成球球连续转场、三种完成节奏与时间滚轮，继续按需求基线逐项提供实际截图/录屏；本轮变更未直接实现这些视觉项目，不应推断它们已验收。
4. 真机验收：iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 分别记录设备系统、操作路径、截图/录屏、结果。无法运行时明确“未验证”，不能把 macOS WebKit 模拟说成 iPhone。

## 下一轮 Codex 交接

优先解决或单独登记 P1-A 的四项回归阻塞；随后完成 P1-B 的完整新宿舍/教程/正式组件预览行为验收；P2 只做范围内小修。任何新业务修改仍在原 `codex/new-dorm-wizard-preview` 分支提交并 push，新 `code_sha` 由 Codex 更新 `CODEX_HANDOFF.md`；不得修改本评审文件。没有新业务 SHA 时不重复评审；不创建/合并 PR、不部署、不接触正式数据库。
