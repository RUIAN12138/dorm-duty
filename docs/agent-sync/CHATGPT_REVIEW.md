# ChatGPT → Codex · 新宿舍任务回执与抬水边界增量评审（2026-10-24）

- reviewed_code_sha: `251e950dca1421f34b7e3aa4bb6af1a461bc2791`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/251e950dca1421f34b7e3aa4bb6af1a461bc2791
- previous_reviewed_code_sha: `9e9512b632828e3a7d763ed3027fe14d01c154bf`
- assessment: **确认 1 个新的真实业务提交、4 个修改文件（其中服务端 3 行、测试 84 行，其余为专项文档）**；开发分支 HEAD 与完整 SHA 一致。上次 P1-A 的普通完成/撤销回执 `completed_by` 不一致已经按要求修正，新增服务端测试实际检查 PATCH 回执、SQLite 行和后续 GET；P1-C 新增硬/软抬水代做、提前额度和副作用检查。**本轮未发现新的 P0 越权证据**。但独立阅读 `undoOnce()` 发现**提前抬水额度撤回的特殊分支仍返回与数据库不一致的 task 状态**，新增测试没有覆盖该回执，属于需要继续处理的 P1；整套 Web 回归仍有四项既存失败，不能宣告验收通过。
- review_method: 通过 GitHub 连接器读取 `PROTOCOL.md`、`USER_REQUIREMENTS.md`、`CODEX_HANDOFF.md`、旧 `CHATGPT_REVIEW.md`；核对业务分支 HEAD、比较真实 diff、读取服务端完整相关函数及新增测试、核对真实预览/向导/教程相关源码，检查 main、全部可检索 PR 的开放/关闭状态、开放 PR 的审核提交/inline review thread/普通评论、重要 Issues 的评论、该业务 SHA 的 GitHub Commit Status 和关联 PR workflow。**属于独立静态代码和测试设计审查，不等于亲自执行测试或真机验收。**
- diff: https://github.com/RUIAN12138/dorm-duty/compare/9e9512b632828e3a7d763ed3027fe14d01c154bf...251e950dca1421f34b7e3aa4bb6af1a461bc2791
- sources: https://github.com/RUIAN12138/dorm-duty/blob/251e950dca1421f34b7e3aa4bb6af1a461bc2791/site/worker/chores.mjs ; https://github.com/RUIAN12138/dorm-duty/blob/251e950dca1421f34b7e3aa4bb6af1a461bc2791/scripts/check-dorm-wizard.mjs ; https://github.com/RUIAN12138/dorm-duty/blob/251e950dca1421f34b7e3aa4bb6af1a461bc2791/frontend/src/components/onboarding/DormWizard.vue ; https://github.com/RUIAN12138/dorm-duty/blob/251e950dca1421f34b7e3aa4bb6af1a461bc2791/frontend/src/components/onboarding/LiveDraftPreview.vue
- tests: Codex **报告** `node scripts/check-dorm-wizard.mjs` 88 项、`check-water-flex` 74 项、`check-water-reassign` 45 项、`check-undo` 73 项通过；`spec:validate` 18/18、`spec:scope` 通过，前端/Worker/邮件构建成功；我核对了新增断言确实存在，**未独立执行**。Codex 报告 `npm run web:verify` 仍有 4 项失败，并在 `6b7d676` 基线复现相同失败。不得声称全绿。
- CI: GitHub 对该 SHA 的 Commit Status `statuses=[]`，关联 PR workflow runs `[]`；无可确认的该业务提交 CI 通过证据。
- PR/Issues: 当前可检索 74 个 PR：开放 #24、#80–#84，其余 68 个关闭；开放 PR 的审核提交、inline review thread 均为空，#80–#84 普通评论为空，#24 仅有既有评论。未观察到相对上一评审的新 PR 开闭/审核进展。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`，本分支未合并；工具的关闭状态本身不证明每个历史 PR 均已合并。重要 Issues #37/#39/#40/#41/#46 仍开放，评论无本轮新增可确认事项。开放 PR 各自最新 head 的完整 CI 结果本轮未逐一取得，不能把本业务 SHA 的空 CI 结果套用到它们。
- platform_status: iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 均未真机验证；桌面浏览器模拟和本地测试不能代替真实设备。
- need_user_decision: 当前无需新产品决策。未经用户授权不创建/合并正式 PR、不部署、不触碰正式数据库；保持旧宿舍与正式页面原有设计不变。

## P0 · 安全与旧宿舍隔离（本轮未发现新的阻塞，继续守住边界）

1. `completeOnce()` 的 `canCompleteTask()` 服务端权限守卫仍在；本次改动只向成功回执补充 `completed_by`，未扩大代打卡权限。软性 v2/legacy 非负责人拒绝、硬性 v2 符合时间条件时允许代做、按原负责人推进轮序等已有断言继续保留。
2. 新增 `water` 软性代做 403 且数据库版本、队列、额度、提醒/推送无变化的对照断言；硬性代做按原计划负责人推进、代做者撤销的断言存在。**尚未独立执行，不能据此保证正式环境安全**。
3. 所有下一轮修复仍需只在隔离 SQLite/合成身份测试，禁止旧宿舍数据迁移/重置及生产写入。

## P1 · 必须处理或明确保留的代码问题

### P1-A · 提前抬水额度撤回 API 回执仍与数据库状态矛盾（本轮新发现）

**独立源码证据**：`site/worker/chores.mjs` 的 `undoOnce()` 中 `if (credit)` 分支，事务将 `chore_water_credits.status` 改为 `cancelled`，将 `chore_tasks.status` 改为 `cancelled` 且 `completed_at=null`；但返回 `taskView({ ...task, status: "pending", completed_at: null })`。该返回不仅报告 **pending 而数据库实际 cancelled**，还沿用 `task.completed_by`，导致撤回后的 API 回执可能继续显示实际完成人。普通撤销分支这轮已正确清空 `completed_by`，特殊 credit 分支未同步修正。

**测试缺口**：新 `scripts/check-dorm-wizard.mjs` 的 `hardWaterCreditUndo` 仅断言 HTTP ok、额度行 cancelled、正式计划队列不变、无新增提醒/推送；**没有断言撤回 API 回执的 `task.status/completed_by` 与实际 chore_tasks 行一致**。这是真实遗漏，不是要求重新实施已经修好的普通撤销。

**修改要求**：先明确额度撤回后的任务业务语义为 cancelled（不应假装重新成为计划待办），使 `PATCH /chores/tasks/:id/undo` 的 `task.status`、`completed_at`、`completed_by` 与数据库和随后读取的同一 task 一致；如需保留取消操作审计，使用现有审计记录而非返回不实的 pending。检查是否需要同时清理数据库 `completed_by`，确保不会改变历史统计/旧宿舍逻辑。只改特殊 credit 撤销相关代码和测试，不重构抬水业务。

**可执行验收**：创建隔离 v2 宿舍，成员 B 提前抬水形成 pending credit，B 撤回后逐项断言：credit 为 cancelled；对应 chore_tasks 行为 cancelled；PATCH 回执的 `id/status/completed_at/completed_by` 与该行及按 id 后续读取一致；当前计划负责人、下一任务、轮序、version、通知队列保持预期；A 不可撤回 B 的额度；再次撤回得到明确冲突；旧宿舍原行为不变。增加最小真实 API/SQLite 测试并绑定新 code_sha。

### P1-B · 四项 Web 回归仍为发布前阻塞

Codex 已报告在 `6b7d676` 基线复现相同四项失败，这支持“不是本次 3 行服务端补丁引入”，但**不代表可忽略**：

1. `check-screen-gesture-check.mjs` 的 `swipePose.opacity<1`；
2. `check-settings-save-lifecycle.mjs` 的 `memberNames.css` 夹具导入；
3. `check-navigation-components.mjs` 的同一 CSS 导入；
4. `check-scheduled-reminders.mjs` 旧迁移用例 `/guest/create` 返回 500，预期 201。

**验收**：在独立的明确授权范围内逐项给出失败复现、真实根因、最小修复、前后测试；完整 `npm run web:verify` 全绿才可标记通过。不能删断言或只靠构建成功冒充回归成功；若本轮不处理则持续标为发布阻塞。

### P1-C · 创建规则覆盖与预览/教程未验收项继续有效

- `DormWizard.vue` 的 `chooseCycle()` 仍将 `draft.policy` 重置为 hard/soft，并把每个任务 `task.policy='inherit'`；用户在单任务上先前设置的覆盖策略可能被无提示清除。**本 SHA 未修改该逻辑**，请以单任务覆盖→切换全局节奏→返回/预览/保存为最小复现，决定是保留明确的全局覆盖提示还是保留单项设置；不可无提示丢草稿。
- `LiveDraftPreview.vue` 仍实际挂载 `ChoreBoard`、`ChoreBottomNav`，并使用合成成员/任务数据；这是源码可确认的正式组件复用，但本轮未新增预览网络隔离测试。继续验证全屏、底栏拖拽后退出重进/保存一致、点击打卡/消息/推送/设置/账号入口不发生任何真实业务写入。
- 继续核查五步单屏、滑块按压/拖动/吸附、球球 Tips、值日页横向任务切换、iOS 时间滚轮、欢迎教程首次触发/跳过/重看/聚光目标缺失及连续动画；本轮服务端小补丁不能替代这些视觉/交互验收。优先测试已存在组件，禁止顺手大规模重设计。

## P2 · 验收证据、设备与性能

1. 提供与**新业务 SHA** 对应的脱敏屏幕录制/截图：五步向导单屏、滑块拖动中间帧、时间滚轮、真实组件全屏预览、导航重排、球球 Tips 与首次聚光教程。没有证据的视觉项标为未验证。
2. 移除旧绿色像素标识、中文姓名圆润字体、任务详情 Bottom Sheet 底部连续背景和“查看任务”材质问题仍按 USER_REQUIREMENTS 原要求局部处理；不可全局替换字体或重写正式页面。
3. 分别记录本地脚本、浏览器模拟、GitHub CI、iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 的真实验证状态。没有设备不写“已通过”；不上传真实成员、邀请码、Token、数据库或凭据。

## 下一轮 Codex 交接

1. 先最小修复 **P1-A 提前抬水 credit 撤回回执** 并补充对应 API/SQLite 断言；不要重复已经修好的普通完成/撤销回执。
2. 将 P1-B 四项先存失败保留为独立阻塞；除非获得相应范围授权，不借 P1-A 修改无关前端/旧宿舍代码。
3. 处理已明确且仍适用的 P1-C 用户体验问题时，保持局部小提交和验收证据；按 P0/P1/P2 顺序。
4. 仅 Codex 提交业务分支并更新 `agents/coordination:docs/agent-sync/CODEX_HANDOFF.md` 的新完整 `code_sha`。ChatGPT 下轮只评审**不同的新业务 SHA**。不创建/合并 PR、不部署、不触碰正式数据库、不改本评审文件。
