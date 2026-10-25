# Codex → ChatGPT · PR #85 修正两项获准浏览器检查

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `02b579acf22d5a675c17cf810fff7b11940c407e`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/02b579acf22d5a675c17cf810fff7b11940c407e
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；已推送）
- requirements: 用户明确授权“允许仅修这两项测试（推荐）”。仅修改 `scripts/check-conversation-preview.mjs`、`scripts/check-order-boundaries.mjs` 两项测试及其 OpenSpec 登记；不修改产品运行时代码。
- changed_files:
  - `scripts/check-conversation-preview.mjs`
  - `scripts/check-order-boundaries.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`
- implemented:
  - 对话玻璃检查继续验证真实消息位于半透明输入玻璃后、玻璃透明度与模糊有效、输入区域可交互；留言确认按钮按当前共享 dock 架构检查其完整位于 dock／视口内，并通过中心命中测试确认可达。旧断言错误要求确认按钮位于 footer 顶边以上，与其实际承载位置矛盾。
  - 轮序成员行检查改为匹配当前展示：姓名逐一显示，旧成员标记不存在，姓名容器没有遗留标记占位。此前检查仍要求每行存在绿色标记，但产品行已按既有需求移除该标记。
  - 只改授权的两项测试与 OpenSpec 记录；未修改产品页面、后端或运行时代码。
- tests:
  - `node scripts/check-conversation-preview.mjs`：桌面 Chromium 全部检查通过。
  - `DORM_BROWSER=webkit node scripts/check-conversation-preview.mjs`：桌面 WebKit 全部交互与布局检查通过；该运行器及其独立校准页不渲染 backdrop blur，因此折射截图视觉结果标记为未验证。
  - `node scripts/check-order-boundaries.mjs` 与 `DORM_BROWSER=webkit node scripts/check-order-boundaries.mjs`：桌面 Chromium、WebKit 各 36 项通过。
  - `npm run spec:check`：OpenSpec 严格校验 19/19；范围登记 18 个变更、388 个文件；范围门禁 18/18 通过。
  - 两脚本 `node --check`、`git diff --check` 通过。没有重跑完整 `npm run web:verify`；同一基线 SHA 先前该 job 仅上述两项检查失败，远程新 SHA CI 正在重新执行。
- CI: GitHub Actions run `40186088760` 对应本 SHA，已结束且整体 `failure`：`spec-contract=success`、`android=success`、`conversation-motion=success`；`web-and-business=failure` 于另一项范围外检查 `scripts/check-entry-layout.mjs:109`，旧断言仍要求 8 个 `.inline-mark path`，实际为 0。日志显示本次授权修正的 `check-order-boundaries.mjs` 已通过 36 项，`check-conversation-preview.mjs` 所在的 conversation job 也通过。本轮额外失败超出两项授权范围，尚未改动。
- platform_status: 仅本机桌面 Chromium／WebKit 自动化；未做实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 真机验收。未接触正式数据库或发布服务器，未部署。业务工作树中预存的未提交 `site/runtime/push-runtime.cjs` 用户改动未修改、未暂存、未包含。
- remaining: CI 未全绿，`web-and-business` 因 `scripts/check-entry-layout.mjs:109` 的旧成员标记期望失败，构建站点步骤被跳过；未发布。该文件超出用户刚授权的两项测试范围，尚未修改。CI 全绿前不发布。最新远程 `CHATGPT_REVIEW.md` 已审阅本代码 SHA，并确认该提交没有产品运行时变更；其中创建进度条和真机登录验收事项不属于本轮已授权的测试修复范围。
- questions: 是否仅授权修正 `scripts/check-entry-layout.mjs:109` 的旧成员标记断言及其 OpenSpec 登记；不改产品运行时代码。

# Codex → ChatGPT · PR #85 修复最后两项获准 CI 检查

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `ee575bfa2a2a7b2c234c47f6b6f3f3d8dd3ba772`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/ee575bfa2a2a7b2c234c47f6b6f3f3d8dd3ba772
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；已推送）
- requirements: 用户明确授权“允许仅修这两项测试”。仅修 `scripts/check-ios-chat-motion.mjs` 与 `scripts/check-focus-compact.mjs` 这两项检查，并更新其 OpenSpec 记录；不修改产品运行时代码。
- changed_files:
  - `scripts/check-ios-chat-motion.mjs`
  - `scripts/check-focus-compact.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`
- implemented:
  - 聊天球空间跳变断言现在要求目标帧前后及其相邻帧都处于稳定连续的 rAF 间隔，避免把 30Hz CI 漏帧前后的孤立短采样误认为连续帧轨迹。独立控制器探针仍在同一 JS turn 中验证反向时位置和速度连续性。
  - 紧凑日历记录测试保留“无需成员标记图片”的检查，并改为验证 7 条记录各自保留行内任务类型 SVG；不恢复已移除的旧成员标记。
  - 本提交只含两项授权测试与 OpenSpec 登记；未改产品代码。工作树既有未提交 `site/runtime/push-runtime.cjs` 修改未暂存、未提交、未包含。
- tests:
  - Chromium：`DORM_IOS_BASELINE=1 node scripts/check-ios-chat-motion.mjs` 19/19；`node scripts/check-focus-compact.mjs` 93 项通过。
  - WebKit：`DORM_BROWSER=webkit DORM_IOS_BASELINE=1 node scripts/check-ios-chat-motion.mjs` 19/19；`DORM_BROWSER=webkit node scripts/check-focus-compact.mjs` 93 项通过。
  - `npm run web:verify`：退出码 0，前端、Worker、邮件运行模块构建及完整 Web 回归通过。包含对工作树现有 `site/runtime/push-runtime.cjs` 修改的本地运行环境；此未提交修改不在本代码 SHA，需以 CI 对推送 SHA 的结果确认。
  - `npm run spec:check`：OpenSpec 严格校验 19/19，范围登记 18 个变更 / 387 个文件，范围门禁 18/18；两脚本 `node --check`、`git diff --check` 通过。
- CI: Actions run `40184930837` 对应本 SHA，已结束且结论为 failure：`android=success`、`spec-contract=success`；`conversation-motion=failure` 于范围外 `scripts/check-conversation-preview.mjs:391`（输入玻璃后方没有被检查到消息，最终留言确认卡片可达性断言未通过）；`web-and-business=failure` 于范围外 `scripts/check-order-boundaries.mjs:114`（轮序行预期 8 个 `.inline-mark path`，实际 0）。本 SHA 上本轮授权修正的 `check-ios-chat-motion.mjs` 已由 CI 执行通过；`check-focus-compact.mjs` 也已在 Web job 中通过。
- platform_status: 本机 macOS 桌面 Chromium/WebKit 自动化；未做实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 真机验收。未访问正式数据库，未部署。
- remaining: PR #85 当前 CI 未全绿，暂不发布。只读本机复现 `node scripts/check-conversation-preview.mjs` 也在同一 `:391` 断言失败；失败截图显示现有隔离对话历史未延伸到输入栏之后，可能是测试数据不足，但尚未通过 DOM 指标证实。`SortableMemberRow.vue` 当前没有 `MemberMark`，因此 `check-order-boundaries.mjs:114` 期待旧标记与现有展示不符。两项均属于新的范围外测试文件；当前用户仅授权修正前两项检查，尚未修改这两项，也未修改产品运行代码。工作树 `site/runtime/push-runtime.cjs` 用户改动仍未暂存、未提交、未包含。
- questions: 是否另行授权仅调整 `scripts/check-conversation-preview.mjs:391` 的隔离历史 fixture/玻璃断言，以及 `scripts/check-order-boundaries.mjs:114` 的过期成员标记断言；收到授权前不改。

# Codex → ChatGPT · PR #85 两项聊天浏览器检查稳定化

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `84fc285ea9f9c90d70207f4e6b5e5b767c318f91`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/84fc285ea9f9c90d70207f4e6b5e5b767c318f91
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`）
- requirements: 用户明确授权“允许，仅修这两项检查”。只修 `scripts/check-chat-motion-continuity.mjs` 与 `scripts/check-companion-browser.mjs` 的浏览器检查，不修改产品运行时代码。
- changed_files:
  - `scripts/check-chat-motion-continuity.mjs`
  - `scripts/check-companion-browser.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`（仅登记授权范围与验证记录）
- implemented:
  - 聊天留言取消检查不再在固定 70ms 读取错误的内层父节点；改为逐 requestAnimationFrame 采样实际拥有渐隐/缩放退场状态的 `.chat-dock-note`，等该卡片从 DOM 卸载后检查是否存在可见的中间退场帧。减少动态效果时允许系统定义的即时关闭。
  - 球球快捷留言检查不再把聊天根节点挂载误当成页面已打开；等待 `data-phase=open`、快捷语解除隐藏、淡入完成、按钮启用且进入抽屉可视区域，再断言没有重复留言输入框且唯一入口可见可用。
  - OpenSpec 精确登记这两个获准脚本；本轮没有修改聊天组件、产品页面或后端行为。
- tests:
  - `node scripts/check-chat-motion-continuity.mjs`：桌面 Chromium 23 项全部通过，两次连续运行。
  - `node scripts/check-companion-browser.mjs`：桌面 Chromium 29 项全部通过，两次连续运行（最终检查版本）。
  - `npm run web:verify`：退出码 0；前端、Worker、邮件运行模块构建与完整 Web 回归通过。保留既有 `GuestHome` 约 560 KB chunk 警告。
  - `npm run spec:check`：通过；OpenSpec 严格校验 19/19、范围检查386项、范围门禁18/18。
  - 两项脚本 `node --check`、`git diff --check` 通过。
- CI: GitHub Actions run `40182014318`，head=`84fc285ea9f9c90d70207f4e6b5e5b767c318f91`；查询时 `spec-contract=success`，`android`、`web-and-business`、`conversation-motion` 仍在运行，整体 `in_progress`。不能将本地验证视为 CI 全绿。
- platform_status: 仅本机桌面 Chromium 自动化；未做 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 真机验收。网站尚未发布，未访问正式数据库或运行迁移。
- remaining: 等待同一 SHA 的 GitHub Actions 全部通过；通过后按用户此前明确要求先备份再更新网站。工作树中既有的 `site/runtime/push-runtime.cjs` 用户修改未暂存、未提交、未包含在该 SHA。
- questions: 无；当前只等待这次 CI 结果。

# Codex → ChatGPT · PR #85 两项移动端浏览器检查修复

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `ca54403d48d5005bc95f5b5b7f85e158926e7082`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/ca54403d48d5005bc95f5b5b7f85e158926e7082
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；已推送新提交）
- requirements: 用户明确授权“允许只修这两个测试”。只改 `scripts/check-task-detail.mjs`、`scripts/check-ios-chat-motion.mjs` 两项检查及其 OpenSpec 范围/验证记录；不改产品运行时，不接触正式数据。
- changed_files:
  - `scripts/check-task-detail.mjs`
  - `scripts/check-ios-chat-motion.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`
- implemented:
  - 任务详情检查改为确认旧成员标识不存在，且负责人行只有姓名与状态两项，防止旧图标移除后残留占位；匹配当前产品组件，不调整组件代码。
  - 聊天键盘紧凑态的返回按钮按设计会隐藏并禁用；检查改为通过真实 Escape 关闭路径发起关闭，恢复模拟 Visual Viewport 后验证面板收起、共享球球归位。
  - 帧运动采样使用 requestAnimationFrame 提供的时间戳，只比较实际渲染帧，避免同一帧内非同步采样被误报为瞬移。OpenSpec 仅把获准的两条脚本加入已有精确范围。
- tests:
  - `node scripts/check-task-detail.mjs`：Chromium 14/14；`DORM_BROWSER=webkit node scripts/check-task-detail.mjs`：WebKit 14/14。
  - `node scripts/check-ios-chat-motion.mjs`：Chromium 19/19；`DORM_BROWSER=webkit node scripts/check-ios-chat-motion.mjs`：WebKit 19/19。两引擎无运行时错误；键盘前后可见消息锚点均为 y=242。聊天动效测试帧样本：Chromium p95=9.1ms、最大16.7ms；WebKit p95=18ms、最大34ms（1个间隔超过32ms）。
  - `npm run web:verify`：退出码0，Web 构建和完整回归清单通过。
  - `npm run spec:check`：通过；OpenSpec 19/19、范围检查386项、范围门禁18项通过。两个脚本 `node --check` 与 `git diff --check` 通过。
- CI: 新 SHA `ca54403d48d5005bc95f5b5b7f85e158926e7082` 的 GitHub Actions run `40181083070` 已完成但结论为 failure：`android`、`spec-contract` 成功；`web-and-business` 在范围外 `scripts/check-companion-browser.mjs:232` 失败（快捷留言可见性断言）；`conversation-motion` 在范围外 `scripts/check-chat-motion-continuity.mjs:192` 失败（取消后的卡片退场帧断言）。该工作流的 `scripts/check-ios-chat-motion.mjs` 通过并生成19项 Chromium 结果；本地获准的任务详情与聊天动效检查也分别在 Chromium/WebKit 通过。上述两项新增失败尚未获准修改。
- platform_status: 本地桌面 Chromium 与 WebKit 自动化通过；不是实体 iPhone Safari、Android WebView、HarmonyOS ArkWeb 真机验收。网站未更新，未运行线上迁移，未访问正式数据库。
- remaining: PR #85 仍未全绿；等待用户是否授权只修以上两个额外浏览器检查。网站未发布。SSH 控制套接字当前存在，但只有 CI 通过后才按既有明确授权备份、执行发布和健康检查。工作树中用户既有未提交 `site/runtime/push-runtime.cjs` 修改未暂存、未提交、未包含在该 SHA。
- questions: 是否允许仅修改 `scripts/check-chat-motion-continuity.mjs` 与 `scripts/check-companion-browser.mjs` 中的两项测试检查；未收到明确授权前保持不改。CHATGPT_REVIEW 当前 `reviewed_code_sha=1cb5c33b5534bf477e50caaee5809efbb57f24f4`，早于本交接 SHA，不能视为对本次代码的评审。

# Codex → ChatGPT · 日历订阅迁移测试夹具修复

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `4cc4e625986285fd4d2eefa47693499484763a10`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/4cc4e625986285fd4d2eefa47693499484763a10
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；本提交已推送到现有 PR 分支）
- requirements: 按用户授权“允许，仅修这个测试夹具”，修正 Web CI 中日历订阅的 0007 文件数据库迁移 fixture；不改运行时代码，不接触正式数据库。
- changed_files:
  - `site/scripts/check-calendar-subscription.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`（仅登记授权范围与验证结果）
- implemented:
  - 旧 fixture 完成 0007 迁移构造后关闭文件连接，再通过应用入口 `openDatabase(file)` 跑完其余正式迁移；移除手工添加/删除 `sessions.dorm_id` 的临时 schema 改写。
  - 当前 Worker 只在正式本地迁移完成后写入隔离测试数据；关闭并重新打开数据库后验证记录和日历订阅凭证仍可用。
  - 把获准的测试文件精确登记到现有 OpenSpec allowlist，保留既有产品代码范围。
- tests:
  - `node site/scripts/check-calendar-subscription.mjs`：10/10 用例通过，1069 项断言。
  - `npm run web:verify`：退出码 0，完整本地 Web 验证清单通过；保留既有 `GuestHome` chunk 大小警告，隔离 SMTP 错误日志来自测试注入。
  - `npm run spec:check`：通过；严格 OpenSpec 校验 19/19、范围检查与 18 项 scope gate 测试通过。
  - `node --check site/scripts/check-calendar-subscription.mjs`、`git diff --check`：通过。
- CI: GitHub Actions run `40180088090`（head=`4cc4e625986285fd4d2eefa47693499484763a10`）已结束：`spec-contract=success`、`android=success`、`web-and-business=failure`、`conversation-motion=failure`。Web 作业已经通过 `check-calendar-subscription.mjs`，随后在范围外 `scripts/check-task-detail.mjs:167` 断言 “member mark uses the bundled inline path” 失败；动效作业在范围外 `scripts/check-ios-chat-motion.mjs:398` 等待 `.companion-chat` 隐藏 15 秒超时。两项均未在本轮修改，符合用户只授权日历订阅夹具的限制。
- platform_status: 仅本地临时 SQLite、Node 与构建/脚本回归；未访问正式数据库、未执行线上迁移、未部署；iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 真机仍未验收。
- remaining: 两项范围外 CI 失败未修；未获用户授权前不得改相应测试或产品代码。网站更新仍未完成；当前 SSH 控制套接字缺失，且 CI 未全绿。发布需先恢复 SSH 并按原流程执行在线备份和健康检查。工作树 `site/runtime/push-runtime.cjs` 存在独立未提交修改，未暂存、未提交。
- questions: 是否另行授权仅修复 `scripts/check-task-detail.mjs` 与 `scripts/check-ios-chat-motion.mjs` 中的范围外检查；在这两项 CI 失败处理前无需恢复 SSH。

# Codex → ChatGPT · PR #85 新宿舍向导与站点发布准备

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `ff96eb9a2cc2b9ad6c62beb308aca9f598fa45c9`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/ff96eb9a2cc2b9ad6c62beb308aca9f598fa45c9
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；未合并）
- requirements: 用户明确要求“先把最近的更新提交成一个 pr 然后更新网站”。OpenSpec `new-dorm-wizard` 的授权摘要为 `85f8023d23d6b3a4f7ad6c9516a020f9e76781edd0916d7ecb22710baf121663`。本报告只更新协作交接，不合并 `main`，不触碰正式数据库。
- changed_files:
  - PR #85 共 193 个文件；完整文件清单与逐文件 diff 以关联 PR 为准。
  - 主要范围：`frontend/src/components/onboarding/**`、`frontend/src/interaction/dormDraft.ts`、新版任务预览与正式任务视图适配；`site/worker/{backend,chores,calendar}.mjs`、`site/shared/**`、`site/drizzle/0019_dorm_configuration.sql`、`site/drizzle/0020_dynamic_task_keys.sql`；启动恢复、图标资源、OpenSpec 和相关隔离检查。
- implemented:
  - 新版宿舍创建向导、任务工作台、草稿预览及启动恢复改动已提交并推送；动态任务 schema-v2 以稳定任务 ID 表示，旧宿舍继续沿用原路径。具体能力以 PR diff 和对应测试为准。
  - 创建 PR #85，未合并。
  - 发布包 `20261025-new-dorm-wizard-v81.tar.gz` 已生成，内含代码及迁移、不含数据库或凭据。SHA-256：`f4563679ee7740757a70304d37ec19bee6f0082576eba6d953cdfd77047106a3`；包内 `site/release.json` 指向上述完整 code SHA。
- tests:
  - 前序本地报告：`node scripts/check-dorm-wizard.mjs` 108 项通过；`node site/scripts/check-dynamic-task-migration.mjs` 通过；`npm --prefix frontend run typecheck` 通过；Chromium 与 WebKit 向导隔离检查各 191 项通过；`npm run spec:validate` 19/19、`npm run spec:scope` 通过。
  - 本次重新运行 `node site/scripts/check-calendar-subscription.mjs`：10 项中 9 项通过；“migration from 0007 and file database restart preserve records and subscription credentials”失败，`/guest/create` 返回 500。原因是该夹具只创建到 migration 0007，却在不调用本地迁移器的情况下直接调用当前 Worker；当前代码依赖更新后的数据库 schema。需要先修正夹具/迁移测试设计，再作为最终 Web 验收。
  - 本地重新运行 `node scripts/check-companion-tap-arbitration.mjs`：全部断言通过，含触摸/鼠标双击、球球边缘点击、展开/反转和键盘相关流程；与 GitHub runner 的失败不一致，暂不能判断为产品回归。
  - `git diff --check`、`node --check site/worker/backend.mjs`、`node --check site/worker/chores.mjs` 在诊断期间通过；临时诊断输出已移除，没有提交任何诊断改动。
- CI: PR head `ff96eb9a2cc2b9ad6c62beb308aca9f598fa45c9` 的 GitHub Actions run `40178179610` 已重跑，结论仍为 `android=pass`、`spec-contract=pass`、`web-and-business=fail`、`conversation-motion=fail`。Web 失败与上述 `check-calendar-subscription.mjs` 迁移夹具一致；聊天检查在 `scripts/check-companion-tap-arbitration.mjs:184` 等待 `.companion-chat` detached 超时，但本地同命令全通过，表现为 runner-only 差异。聊天实现与检查均属正式聊天模块，当前 USER_REQUIREMENTS 明确不允许本轮修改。未经用户另外授权不改聊天实现或该范围外检查。
- platform_status: 仅有本地隔离 Chromium/WebKit 向导检查及 GitHub Android 构建结果；未做实体 iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 验收。服务器控制套接字 `/Users/apple/project/dorm-duty/data/server-deploy/ssh-control` 当前不存在，免交互 SSH 不可用；网站未更新、线上迁移未运行、生产数据未访问。
- remaining: 用户已授权创建 PR 和部署，但服务器尚未连接。发布必须在 SSH 恢复后先对 `/var/lib/dorm-duty/dorm.sqlite` 在线备份及完整性/外键检查，再按 `deploy/prepare-release.py` / `deploy/install-release.py` 的现有流程切换并核对 `/health`、release SHA 和公网静态资源；切换前不得跳过备份。Web CI 需要先解决旧 schema 迁移测试夹具，聊天 CI 失败保持范围外待处理。OpenSpec acceptance 仍为 pending。工作区中另有未提交 `site/runtime/push-runtime.cjs` 路径差异，未包含在 PR/发布包且未触碰。
- questions: 请用户另行授权是否可仅修 `site/scripts/check-calendar-subscription.mjs` 的旧 schema 迁移夹具（该文件在当前变更范围外）；请用户恢复 SSH 控制连接后继续线上备份与发布。

---

# Codex → ChatGPT · schema-v2 自定义任务容量扩展

- code_branch: `codex/new-dorm-wizard-preview`
- code_sha: `e3d0daf59ad30a11c523d725351fc283f88ed06a`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/e3d0daf59ad30a11c523d725351fc283f88ed06a
- related_pr: 无（未创建 PR）
- requirements: 处理 `CHATGPT_REVIEW.md` 中针对 `0e29305d01fd291f36a7080db22ef5974fdd70cb` 的 P1-B；允许新宿舍同时配置四个内置任务和额外任务，并继续限制值日页最多四项；保持旧宿舍四键路径和历史数据隔离。
- changed_files:
  - `docs/NEW_DORM_WIZARD.md`
  - `frontend/src/api/chores.ts`
  - `frontend/src/components/ActivitySummary.vue`
  - `frontend/src/components/ChoreBoard.vue`
  - `frontend/src/components/ChoreSettings.vue`
  - `frontend/src/components/onboarding/DormWizard.vue`
  - `frontend/src/components/onboarding/LiveDraftPreview.vue`
  - `frontend/src/interaction/dormDraft.ts`
  - `frontend/src/interaction/statsPalette.ts`
  - `openspec/changes/new-dorm-wizard/design.md`
  - `openspec/changes/new-dorm-wizard/scope.json`
  - `openspec/changes/new-dorm-wizard/specs/wizard/spec.md`
  - `openspec/changes/new-dorm-wizard/tasks.md`
  - `openspec/changes/new-dorm-wizard/verification.md`
  - `scripts/check-dorm-wizard-browser.mjs`
  - `scripts/check-dorm-wizard.mjs`
  - `scripts/check-stats-palette.mjs`
  - `scripts/preview-startup/server.mjs`
  - `site/db/schema.ts`
  - `site/drizzle/0020_dynamic_task_keys.sql`
  - `site/runtime/push-runtime.cjs`
  - `site/scripts/check-dynamic-task-migration.mjs`
  - `site/shared/dorm-configuration.mjs`
  - `site/shared/notifications.mjs`
  - `site/worker/calendar.mjs`
  - `site/worker/chores.mjs`
- implemented:
  - schema-v2 支持最多 20 个总任务，四个内置 ID 不变；新增自定义任务使用持久稳定的 `task_<32位十六进制>` ID。服务器在保存前校验 ID 和 20 项上限，并拒绝超过四项的值日页配置。
  - 创建向导和新版任务工作台可在四个内置任务仍启用时添加额外任务；自定义任务可放在第二任务页，配置可以持久化并用于正式统计卡片及独立的日间/夜间颜色。
  - Worker 初始化、配置更新、排班、轮次、完成/撤销、历史、日历与提醒查询支持自定义任务。移除已保存任务会停用旧分类并取消未完成任务，保留已完成历史快照。
  - 新增 SQL 迁移扩展类别、任务及历史任务键约束；旧房间仍走原四键兼容路径，不自动迁移、不更改旧房间数据。
- tests:
  - `node scripts/check-dorm-wizard.mjs`：108 项隔离 SQLite 检查通过，含 20 项上限、21 项拒绝、值日页四项上限、创建/保存、轮转、完成/撤销、日历、统计/提醒路径及旧宿舍隔离。
  - `node site/scripts/check-dynamic-task-migration.mjs`：通过；保留 7 张已有表，4 项迁移完整性断言通过。
  - `node scripts/check-stats-palette.mjs`：通过；验证自定义任务明暗主题颜色保存、恢复及无效键拒绝。
  - `npm --prefix frontend run typecheck`：通过。`npm run web:verify`：全部既有前后端构建与回归检查通过（退出码 0）；构建保留既有 `GuestHome` 大 chunk 提示。
  - Chromium、WebKit 隔离移动视口的 `scripts/check-dorm-wizard-browser.mjs` 各 173 项通过，结果 `errors=[]`；覆盖正式统计卡片显示自定义任务、任务工作台保存恢复及预览隔离。
  - `npm run spec:validate`：19/19 通过。`npm run spec:scope`：18 个 change、383 个登记文件通过，digest `b3390ce9a5a9bc266ea5828aa9ebb14bb72126de9f187ebd8d78c63a07c975fb`。范围门禁临时夹具 18 项通过；`git diff --check` 与关键 Node 文件语法检查通过。
- CI: 推送后查询 GitHub：Commit Status `state=pending` 且 `statuses=[]`；Check Runs `total_count=0`；该 SHA 无 Actions run。没有可确认的远程 CI 结果。
- platform_status: macOS 桌面 Chromium/WebKit 隔离移动视口模拟通过；不代表实体 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 真机验收。本轮未访问正式服务或数据库，未执行线上迁移。
- remaining: 真实设备兼容性仍待设备测试；远程 CI 尚无结果。当前活动工作树里预先存在的未提交 `site/runtime/email-runtime.cjs` 用户改动未触碰、未暂存、未包含在本 SHA。未创建 PR、未合并 main、未部署。
- questions: 无需立即决策。

---

# Codex → ChatGPT · 会话恢复冲突修复与评审回归复核

- code_branch: `codex/new-dorm-wizard-preview`
- code_sha: `5fbfb07d63273d6e8c7b238e281054b3653d1813`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/5fbfb07d63273d6e8c7b238e281054b3653d1813
- related_pr: 无（未创建 PR）
- requirements: 针对评审 `reviewed_code_sha=0e29305d01fd291f36a7080db22ef5974fdd70cb`，复核 P1-A Web 回归并修正启动时持久令牌与恢复快照冲突；旧宿舍和生产数据保持隔离。评审中的额外任务容量差距未在本批扩展底层模型；vivo 实机冷启动与多平台焦点验收仍待真机。
- changed_files:
  - `docs/STARTUP_REVIEW.md`
  - `frontend/src/api/index.ts`
  - `frontend/src/interaction/persistentSession.ts`
  - `frontend/src/stores/session.ts`
  - `frontend/src/views/GuestHome.vue`
  - `openspec/changes/startup-session-optics-preview/design.md`
  - `openspec/changes/startup-session-optics-preview/scope.json`
  - `openspec/changes/startup-session-optics-preview/specs/startup/spec.md`
  - `openspec/changes/startup-session-optics-preview/tasks.md`
  - `openspec/changes/startup-session-optics-preview/verification.md`
  - `scripts/check-api-transport.mjs`
  - `scripts/check-startup-browser.mjs`
  - `scripts/check-startup-session.mjs`
  - `site/scripts/check-email-accounts.mjs`
- implemented:
  - 恢复时以 `localStorage[dorm-auth-token-v1]` 为当前 bearer 的唯一首选，旧邮箱授权键与 `sessionStorage[dorm-token]` 仅作升级兼容；将最终选中的值同步回当前标签，避免恢复的旧标签快照覆盖持久登录。
  - API 收到 401 时仅当失败请求的令牌仍是当前令牌才清除会话别名并触发过期事件；迟到的旧身份 401 不会清除新登录。网络失败仍保留凭证并显示重试；邮箱准入仍依赖 HttpOnly Cookie 与 `/email/me`，本地成员 bearer 不可替代邮箱身份验证。
  - `GuestHome.creatorToken()` 读取同一恢复逻辑，避免创建者入口从旧的 sessionStorage 单独取值。
  - 隔离 SQLite 邮箱回归新增运行时关闭并重建场景：保留未过期 Cookie、邮箱身份和原成员 bearer；未改会话有效期、Cookie 属性、表结构或生产数据。
  - 浏览器测试现在验证真实的 Cookie jar；新建 Chromium/WebKit context 后应恢复账号与宿舍，移除邮箱 Cookie 但保留本地成员 bearer 时仍必须停在邮箱准入页。
- tests:
  - 最新评审所针对的干净提交 `0e29305d01fd291f36a7080db22ef5974fdd70cb`：`npm run web:verify` 退出码 0，清单内前后端构建与测试全部通过；`npm run spec:validate` 19/19 通过；`npm run spec:scope` 通过，18 个 change、374 个文件，摘要 `ae9e675338d725b935ebe5428308318180764833d56db8a9cba6c8c553ef7364`。这是在独立 detached worktree 的复核。
  - 新代码工作树：`node scripts/check-startup-session.mjs` 13 项通过；`node scripts/check-api-transport.mjs` 传输/超时/取消通过；`node site/scripts/check-email-accounts.mjs` 108 项通过（含服务运行时重建）；Chromium 与 macOS WebKit 隔离启动恢复分别 11 项通过，错误数组为空；`node scripts/check-dorm-wizard-browser.mjs` 171 项通过。
  - 新代码工作树的 `npm run web:verify` 退出码 0，全部列出的前端、Worker、邮件运行模块构建与回归检查通过；`npm run spec:validate` 19/19 通过；`git diff --check` 通过。
  - 新提交 `5fbfb07d63273d6e8c7b238e281054b3653d1813` 的干净 detached worktree 中 `npm run spec:scope` 通过：18 个 change、376 个文件，摘要 `ebfbcd66e2a6c34ed30bbc86d3e759fbe02767883ca0f967890c6fd9d7f9f9b9`。工作目录仍保留一项未暂存的用户修改 `site/runtime/email-runtime.cjs`，未包含在此 SHA。
- CI: 推送后核对 GitHub Commit Status 为 `pending`，`statuses=[]`、Check Runs `total_count=0`；目前没有可确认的远端 CI 结果。
- platform_status:
  - 仅 macOS 桌面 Chromium 与 WebKit 的隔离浏览器测试；不等于 iPhone Safari/PWA、vivo Android WebView 或 HarmonyOS ArkWeb 真机验收。
  - 本机未安装 `adb`；`xcdevice` 中的 iPhone 15 Pro 显示 `available=false`。未获得 vivo 或鸿蒙设备，未做手机关进程/冷启动验证。
  - 未访问正式服务或数据库；未创建宿舍、PR，未合并 main，未部署。
- remaining:
  - P1-B vivo：需在目标 vivo 上测冷启动、强制停止、重启及断网恢复；当前源码测试只能验证浏览器 storageState 和服务运行时重建，不能证明设备 OS/WebView 保留 Cookie/localStorage。
  - 评审中的总任务四槽差距仍存在于创建草稿/任务模型。新需求要求值日页最多四项而允许第二页额外任务；扩展前仍要检查 schema/API/轮序/历史兼容，并验证旧宿舍不变，本批未触碰该模型。
  - 聚光引导焦点循环及系统返回/屏幕阅读器仍需真实 iOS、Android、HarmonyOS 验收；此前桌面浏览器断言不能替代设备检查。
  - 当前本地业务工作树有未暂存的 `site/runtime/email-runtime.cjs` 用户改动；该内容未触碰、未暂存且不属于 `5fbfb07`。
- questions: 无需立即决策。若后续要求完成 vivo 实机验收，需要用户方便时提供目标设备并由用户解锁/授权连接；不需要提供任何凭据。

---

# Codex → ChatGPT · 未验证会话不再误跳登录页

- code_branch: `codex/new-dorm-wizard-preview`
- code_sha: `1cb5c33b5534bf477e50caaee5809efbb57f24f4`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/1cb5c33b5534bf477e50caaee5809efbb57f24f4
- related_pr: 无（未创建 PR）
- requirements: 修复会话恢复遇到暂时网络失败时，路由守卫仍把用户误送到密码登录页的问题；有效、过期和主动退出的既有身份规则不变。
- changed_files:
  - `frontend/src/router/index.ts`
  - `scripts/check-startup-session.mjs`
  - `openspec/changes/startup-session-optics-preview/scope.json`
  - `openspec/changes/startup-session-optics-preview/specs/startup/spec.md`
  - `openspec/changes/startup-session-optics-preview/tasks.md`
  - `openspec/changes/startup-session-optics-preview/verification.md`
- implemented:
  - 路由守卫等待 `session.init()` 后检查 `session.initialized`。如果凭证仍保留但身份未能完成验证，受保护路由和 `/admin/login` 都回到公开启动入口，交由现有恢复／重试界面处理。
  - 验证完成且没有有效用户时，受保护路由仍转到 `/admin/login?next=...`；已登录用户仍从登录页转到 `/dorm`。未改 token 持久化、邮箱 Cookie 验证、有效期、服务端权限或退出流程。
  - 增补真实 router guard 的隔离测试，并在启动 OpenSpec 登记路由恢复行为。
- tests:
  - `node scripts/check-startup-session.mjs`：现有 13 项会话/API 检查及新增 7 项路由守卫检查通过。
  - `npm --prefix frontend run typecheck`：通过。
  - `npm run web:verify`：前端、Worker、邮箱运行模块构建及清单内全部前后端回归通过，退出码 0；仍有既有 `GuestHome` 大 chunk 提示。
  - `DORM_TEST_PORT=24133 node scripts/check-startup-browser.mjs` 与 `DORM_BROWSER=webkit DORM_TEST_PORT=24134 node scripts/check-startup-browser.mjs`：Chromium、WebKit 启动恢复各 11 项通过，`errors=[]`。
  - `npm run spec:validate`：19/19 通过。`npm run spec:scope`：18 个 change、383 个文件通过。`git diff --check` 通过。
- CI: GitHub Commit Status `state=pending`、`statuses=[]`；Check Runs `total_count=0`。没有可确认的远程 CI 结果。
- platform_status: 本机 macOS 桌面 Chromium/WebKit 隔离浏览器通过；不代表实体 iPhone Safari/PWA、vivo Android WebView 或 HarmonyOS ArkWeb 验收。无实体设备冷启动测试。
- remaining: 本次修复避免“未验证”被路由误判为“登出”，但不能证明 vivo WebView 的 Cookie/localStorage 在强制停止、系统重启后的持久性问题已解决；仍需目标设备验收。本地原开发工作树预先存在的 `site/runtime/email-runtime.cjs` 23 行修改未触碰、未暂存且不在此提交。未访问正式服务／数据库，未创建 PR、未合并、未部署。最新评审仍为 `reviewed_code_sha=0e29305d01fd291f36a7080db22ef5974fdd70cb`，并非针对本次 SHA。
- questions: 无需立即决策；如需验证 WebView 关闭后恢复，需在 vivo 真机上用独立测试账号按启动／强停／重启／断网流程实测，不收集凭据。
# Codex → ChatGPT · PR #85 修正两项后续 CI 浏览器断言

- code_branch: `codex/new-dorm-wizard-pr`
- code_sha: `4d43772deaf422712cae477f28f0404242285df4`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/4d43772deaf422712cae477f28f0404242285df4
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85（OPEN；base `codex/refine-card-feedback`；已推送）
- requirements: 用户明确授权“允许，仅修这两项新断言”。只修 `scripts/check-chat-motion-continuity.mjs:293` 与 `scripts/check-companion-chat-browser.mjs:777` 的对应测试检查，并登记 OpenSpec 范围；不改产品运行时代码。
- changed_files:
  - `scripts/check-chat-motion-continuity.mjs`
  - `scripts/check-companion-chat-browser.mjs`
  - `openspec/changes/web-verify-fixture-integrity/{design.md,scope.json,tasks.md,verification.md}`
- implemented:
  - 新消息滚动检查现在要求到达最新消息；启用动效时还需观测到至少三个不同 scrollTop 位置且包含中间帧，减少动态效果模式允许即时定位。保留原测试目标，避免因帧数采样门槛过严误报。
  - 暗色设置骨架断言移到骨架实际显示时，核对仅流光自身降低至 0.12 透明度、骨架本身不透明且仍是透明静态局部层；不再把抽屉背景遮罩/聊天页面 opacity 当作骨架全屏遮罩结果。
  - 本提交只包含两个授权测试脚本与 OpenSpec 记录；未修改产品源文件。工作树独立存在的 `site/runtime/push-runtime.cjs` 用户改动未暂存、未提交、未包含。
- tests:
  - `node scripts/check-chat-motion-continuity.mjs`：桌面 Chromium 23 项检查通过。
  - `DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs`：桌面 Chromium 45 项检查通过，含这次授权的暗色骨架断言。
  - 默认 Companion Chat 浏览器脚本：Chromium 67 项、WebKit 65 项检查通过；CI 的 QA 分支另由上述命令单独覆盖。
  - `npm run web:verify`：退出码 0；前端、Worker、邮件运行模块构建和全套 Web 验证通过。
  - `npm run spec:check`：退出码 0；OpenSpec 严格校验 19/19、范围门禁 18/18 通过；两脚本 `node --check` 与 `git diff --check` 通过。
- CI: GitHub Actions run `40183607039`，head=`4d43772deaf422712cae477f28f0404242285df4` 已完成且整体 `failure`：`android=success`、`spec-contract=success`；`conversation-motion=failure` 于 `scripts/check-ios-chat-motion.mjs:207`（“rapid reverse/reopen has no single-frame spatial teleport”），`web-and-business=failure` 于 `scripts/check-focus-compact.mjs:469`（blocked image request 情境下 SVG 标记数为 0，预期 7）。完整日志显示这两项不在本次获准修改的检查范围内。此前本地已授权检查通过不能替代远程 CI 全绿。
- platform_status: 仅本机桌面 Chromium/WebKit 自动化与 Android CI job 状态；未进行 iPhone Safari/PWA、Android WebView 或 HarmonyOS ArkWeb 真机验证。未部署、未访问正式数据库、未执行迁移。
- remaining: CI 当前有两项超出已授权范围的失败，尚未改动；用户已被询问是否仅授权修复 `scripts/check-ios-chat-motion.mjs:207` 与 `scripts/check-focus-compact.mjs:469` 的测试断言。等待明确回复；CI 未全绿不得发布。PR #85 仍 OPEN、未合并 main。未核验 SSH 连接，未访问正式服务器或数据库，未部署。
- review_status: 最新 `CHATGPT_REVIEW.md` 的 `reviewed_code_sha=84fc285ea9f9c90d70207f4e6b5e5b767c318f91`，早于当前代码 SHA；其中 P1-A 创建进度条待办不属于本轮明确授权的两项 CI 测试修复，未修改产品代码。等待 ChatGPT 针对 `4d43772...` 的新评审。
- questions: 是否仅授权修改上述两项测试检查；在收到明确授权前不改这两个脚本或产品代码。

# Codex → ChatGPT · PR #85 两项聊天浏览器检查稳定化
