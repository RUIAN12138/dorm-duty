# ChatGPT → Codex · 新宿舍创建与权限增量评审（2026-10-24）

- reviewed_code_sha: `9e9512b632828e3a7d763ed3027fe14d01c154bf`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/9e9512b632828e3a7d763ed3027fe14d01c154bf
- previous_reviewed_code_sha: `6b7d6761daa80d8f285ca14e96c4ff51620bdbd0`
- assessment: **新业务提交已确认，上一轮 P0“任意 v2 宿舍允许跨成员代打卡”已在源码中按配置收紧；本轮未确认新的 P0 权限绕过。** 但存在可复现的“打卡/撤销 API 回执字段与持久化状态不一致”的 P1 代码缺口，且 Codex 报告的完整 Web 回归有 4 项失败，不能宣布整体验收完成。
- diff: https://github.com/RUIAN12138/dorm-duty/compare/6b7d6761daa80d8f285ca14e96c4ff51620bdbd0...9e9512b632828e3a7d763ed3027fe14d01c154bf （确认 1 个业务 commit、2 个文件，非纯文档）
- sources: https://github.com/RUIAN12138/dorm-duty/blob/9e9512b632828e3a7d763ed3027fe14d01c154bf/site/worker/chores.mjs ; https://github.com/RUIAN12138/dorm-duty/blob/9e9512b632828e3a7d763ed3027fe14d01c154bf/scripts/check-dorm-wizard.mjs
- review_method: 通过 GitHub 连接器读取 CODEX_HANDOFF、协议与 USER_REQUIREMENTS，验证 SHA 与开发分支 HEAD 完全一致；独立查看真实 diff、完整服务端相关实现和新增测试断言，核对 main/PR/CI。**本次是静态代码与测试设计审查，未独立执行本地脚本、浏览器或真机测试。**
- CI: 该业务 SHA 的 GitHub Commit Status 为空，未找到关联的 PR-triggered Actions workflow；不能称“CI 通过”。`main` 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`，未合并本开发分支。
- PR/Issues: 已检查仓库 74 个可检索 PR 的状态：开放 #24、#80–#84，其余 68 个为历史已合并 PR；#80/#81 的最新 head 关联 Actions 成功，#82/#83/#84 失败；近期 5 个 PR 无新评论、审核或 review thread。重要 Issues #37/#39/#40/#41/#46 无本轮新增状态变化。以上 PR 状态**不代表**本新宿舍开发分支已合并/部署。
- tests: Codex handoff 报告 `node scripts/check-dorm-wizard.mjs` 64 项隔离 SQLite 检查通过；实际测试文件中存在软性三节奏拒绝、硬性三节奏代做、真实完成人、撤销和旧宿舍副作用断言；我没有独立复跑。Codex 同时明确报告 `npm run web:verify` 有 4 项失败，不能将构建成功代替整套测试全绿。
- platform_status: iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 本轮均未实体设备验证；桌面 Chromium/WebKit 与模拟视口不能代替真机。
- need_user_decision: 暂无。保持仅修新宿舍与新手教程及明确提出的局部视觉问题，不擅自扩大范围；任何正式 PR/合并/部署/正式数据库操作仍需用户授权。

## P0 · 上轮安全问题复核结果（已在代码中修正，仍需运行验证）

1. `canDelegateTask()` 现在要求 `category.version2===true && category.hardPolicy===true`；`canCompleteTask()` 统一用于 `taskView().can_complete` 与 `completeOnce()` 的写入前权限校验。软性任务、旧宿舍的非负责人会被拒绝，硬性新版任务需达到执行时间；不再按 schema v2 无条件放行。
2. `workspace_tasks` 删除了旧的无条件 `can_complete` 覆盖；完成历史用 `COALESCE(completed_by,assignee_id)` 归属实际完成人，撤销查询和 Mutation CAS 使用实际完成人；`planCompletionTurn()` 仍按原计划负责人的 `assignee_id` 推进，未直接按代做者跳轮序。
3. 新增测试覆盖两成员拒绝不改变版本/任务/提醒/推送，以及硬性代做、撤销和轮序；此处只确认**实现和断言存在**，不宣称独立运行成功。

## P1 · 下一步应处理的真实问题与验收条件

**P1-A · 完成/撤销 API 回执与数据库不一致（本轮独立发现）。**

- `completeOnce()` 数据库更新写入 `completed_by: who.user_id`，但构造响应 `const finished={...task,status:'completed',completed_at,...}` 时**没有设置 `completed_by`**；随后 `taskView(finished)` 返回 `completed_by: null`（或旧值），与实际数据库和下一次 GET 不一致。尤其在新版硬性任务由室友代做时，客户端即时状态可能缺失实际完成人。
- `undoOnce()` 的回执使用 `{...task,status:'pending',completed_at:null}`，没有清除 `completed_by`，而数据库的常规撤销已清除；撤销后即时响应仍可能保留旧完成人。
- **验收**：在真实隔离 API 中分别完成“本人完成→撤销”和“他人代做→代做者撤销”，逐次断言 PATCH 回执 `completed_by`、`status`、`assignee_id` 与数据库和紧随其后的 GET 完全一致；计划负责人身份始终不被代做覆盖；旧宿舍完成/撤销字段不回归。仅改相关回执构造与测试，不重构整个页面。

**P1-B · 完整 Web 回归仍有 4 项失败，逐项归因，不借修复权限改动无关产品。**

- Codex 报告失败：`check-screen-gesture-check.mjs` 的透明度断言、`check-settings-save-lifecycle.mjs` 和 `check-navigation-components.mjs` 的 `memberNames.css` 打包夹具错误、`site/scripts/check-scheduled-reminders.mjs` 的旧迁移夹具创建返回 500。它们**尚未经我复跑**；不能仅凭“改动文件无关”认定不会影响发布。
- **验收**：分别提供最小复现命令、原始错误与是否在上一代码 SHA 也失败的对照；修复测试夹具或真实缺陷后，重跑完整 `npm run web:verify` 并明确通过/失败数量。若确属旧问题且本轮不授权修改，保留独立阻塞记录，不宣称全绿。

**P1-C · 补齐边界与交互测试。**

- 新的统一授权谓词覆盖包括 `water` 在内的任务，但本次新增的跨成员测试集中在 `floor`。针对新版硬性/软性抬水、提前抬水积分与撤销交接，增加至少一组不改正式数据的隔离用例；验证允许/拒绝、轮序、credit 和提醒不出现非预期变化。若既有独立水务测试已覆盖，提供与本 SHA 绑定的执行结果即可。
- 前一轮未完事项继续有效：创建向导完成节奏与时间策略是否意外联动、首次教程一次性打开/跳过/手动重看与异常聚光目标、全屏正式组件预览的写入/推送/账号入口隔离、导航拖拽后保存一致性。**验收**：使用真实正式组件树的沙箱草稿测试并检查网络/存储无真实业务写入，不能用另画的预览页面替代。

## P2 · 视觉和设备交付证据

- 按 USER_REQUIREMENTS 核对最多五主步骤、每屏 1–2 个设置、黑白粗进度轨道与轻玻璃小滑块的按压/拖动/吸附、球球 Tips 联动、三种节奏与仅按时间安排出现的 iOS 时间滚轮、正式值日页复用、导航长按重排、首次引导聚光灯和可中断动效。
- 对旧绿色像素标识移除与中文圆润姓名字体提供脱敏前后截图；对 Bottom Sheet 底部连续背景和“查看任务”无假玻璃凹陷给出可见证据。旧宿舍任务、成员、历史、页面和通知不可迁移/重置。
- 真机未测项必须继续标为未验证；如无设备，只报告浏览器模拟与代码检查结果，不把桌面 WebKit 等同于 iPhone Safari。
- 证据文件不得包含邀请码、真实成员、token、正式数据库或凭据。

## 下一轮 Codex 交接

优先处理 P1-A 的 API 回执一致性和隔离测试；P1-B 四项回归失败逐项定位；P1-C 补充抬水边界和已明确的新宿舍/教程路径。完成相关**业务代码**修改后，在原 `codex/new-dorm-wizard-preview` 分支提交并 push 新完整 SHA，仅由 Codex 更新 `CODEX_HANDOFF.md`。ChatGPT 下次只评审新的业务 SHA。未经授权不创建/合并 PR、不部署、不接触正式数据库；不修改 Codex 独占交接文件。
