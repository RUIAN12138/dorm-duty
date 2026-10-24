# ChatGPT → Codex · 新宿舍创建向导增量评审（2026-10-24）

- reviewed_code_sha: `6b7d6761daa80d8f285ca14e96c4ff51620bdbd0`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/6b7d6761daa80d8f285ca14e96c4ff51620bdbd0
- previous_reviewed_code_sha: `4e472f4d36199228ec407158e2b3a49ed7deeb99`
- assessment: 已通过 GitHub 连接器比较前后 commit，确认该分支 HEAD 与新 `code_sha` 一致，新增 1 个代码提交，涉及 20 个文件。已读取真实服务端和前端关键差异。上次 P0 的三种完成节奏、创建页第二页面用途、首次 v2 宿舍教程入口、预览副作用拦截确实有对应代码实现；**不是仅更新需求文档**。不过下面发现 1 项新的高优先级服务端权限问题，不能直接宣告完成验收。
- verified_sources: [真实 diff](https://github.com/RUIAN12138/dorm-duty/compare/4e472f4d36199228ec407158e2b3a49ed7deeb99...6b7d6761daa80d8f285ca14e96c4ff51620bdbd0)、[服务端任务实现](https://github.com/RUIAN12138/dorm-duty/blob/6b7d6761daa80d8f285ca14e96c4ff51620bdbd0/site/worker/chores.mjs)、[向导](https://github.com/RUIAN12138/dorm-duty/blob/6b7d6761daa80d8f285ca14e96c4ff51620bdbd0/frontend/src/components/onboarding/DormWizard.vue)、[页面分配](https://github.com/RUIAN12138/dorm-duty/blob/6b7d6761daa80d8f285ca14e96c4ff51620bdbd0/frontend/src/components/onboarding/TaskPageBoard.vue)。
- tests: Codex handoff **自述**隔离 SQLite 37 项、Chromium 与 WebKit 各 70 项、构建和 OpenSpec 通过；我核查了新增测试代码，但**没有独立执行这些测试或真机验收**。GitHub 对该 SHA 的 Commit Status 列表为空，关联 PR 工作流列表为空；不得声称 GitHub CI 已通过。
- platform_status: Web 代码及 Codex 的桌面浏览器回归可作初步证据；iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 实体设备均未验证。
- need_user_decision: 当前不需要用户额外选择；先按既有权限约束收敛实现，如产品语义含糊再提出明确选项。未经明确授权，不创建正式 PR、不合并 main、不部署、不改正式数据库。

## P0 · 修复 v2 跨成员打卡权限扩大（本轮新发现，优先处理）

**源码直接证据：**

- `site/worker/chores.mjs` 的 `completeOnce()` 使用 `if (task.assignee_id !== who.user_id && !v2) fail(403,...)`。只要属于**任意 schema v2 宿舍**，非负责人便不会被该守卫拒绝，无论该任务是 `self_round`、`scheduled` 还是 `completion`，无论该任务策略为 soft/hard。
- 同文件 `taskView()` 的 `can_complete` 判断为 `who.user_id===task.assignee_id || typeof category?.hardPolicy === "boolean"`。v2 设置的 `hardPolicy` 无论 true/false 均为 boolean，因此与宽泛的后端放行相互呼应，会让别人的待办也暴露可打卡态。
- 创建向导 `chooseCycle('round'|'completion')` 会设置 `draft.policy='soft'`，因此**软性新宿舍也会被服务端放开代打卡**。这不是 UI 文案问题，而是服务器写权限范围变化。现有设计说明的“硬性允许代做”不能等同于“全部 v2 模式均可代做”。

**要求：**

1. 将能否代打卡改成**与明确配置/业务权限一致**的服务端判断，不能仅根据 schema_version=2 放开。至少 soft / 自由轮次下，非当前负责人必须被拒绝；对按时间安排且确实允许代做的任务，按明确规则受控开放。
2. `taskView().can_complete` 必须使用与服务端相同的权限谓词，不能对任意 v2 任务都返回可打卡。
3. 新 `completion`（完成后交接）必须验证非负责人是否能代做及交接给谁，防止任意舍友跳过轮序。显示的负责人、真实完成者 `completed_by`、历史快照、撤销权限应一致。
4. 增加**真实隔离服务端测试**：两个不同成员分别尝试对 soft/self_round、soft/completion、scheduled/按政策允许代做、legacy 任务打卡；断言拒绝/允许状态、任务版本和轮序推进、历史完成者、撤销权限与通知副作用。不得仅对按钮隐藏做测试。
5. 修复必须限定在新配置权限关联代码；旧宿舍权限、任务、完成历史不变。

## P1 · 完善完整用户路径的行为和验证

1. **规则独立性：** `DormWizard.vue` 的 `chooseCycle()` 修改任务 rotation 的同时直接修改全局 `draft.policy`，但文档称“完成节奏与软/硬时间策略是独立配置”。请检查从“按时间安排”切换至“做完交给下一位”后，各任务时间策略与用户已做的单项覆盖是否被无提示清除；必要时明确耦合关系，避免配置被悄悄覆盖。优先局部修正，不新加页面/长表单。
2. **首次教程：** 检查从正式新宿舍首次进入、第二页或日历手动重看、跳过/完成、页面恢复与多次加载的真实路径，确保 `GUIDE_OPEN_KEY` 不造成教程卡住或重入；检查无效／遮挡聚光目标不会出现空框。现有代码新增 guard 属于改善，但真机和异常生命周期仍未证实。
3. **全屏预览：** 继续保留真实 `ChoreBoard` 等组件与草稿沙箱数据；对任务详情、消息、账号/设置、推送/提醒等不同入口施加服务层无副作用断言，防止仅由特定 UI 路径掩盖真实请求。底栏重排后退出、重进、提交正式配置三处顺序一致。
4. **精简动效：** 以用户最新偏好为准：最多五主步骤，每屏 1–2 个设置，单屏优先，任务多则卡片/局部切换；黑白粗进度条、较小玻璃滑块、按下弹性形变、吸附与同步切页；球球 Tips 实时变更。不要借修复权限回归时重设计其他页面。

## P2 · 交付证据和未完成事项

- 提供经脱敏且与当前提交 SHA 对应的截图或录屏证据（创建页单屏、进度条拖动的中间帧、时间滚轮、全屏真实组件预览、导航重排、第一次教程及聚光灯）；已有本地忽略目录不等于我可独立查看证据。严禁把真实姓名、邀请码、token 或私人宿舍数据提交到仓库。
- 绿色旧像素标记移除和中文圆润姓名字体是既有明确需求，但不能仅凭 CSS 字体栈推断所有设备都显示中文圆体；提供真实设备前后对比或标注未验证，不在本轮 P0 权限修复中顺手大改。
- 如继续只在开发分支 push 而不建 PR，可能没有 GitHub Actions CI；把“本地自动化通过 / GitHub CI 无运行 / 真机未验收”分别写清楚。

## 下一轮 Codex 交接与安全边界

- 先完成上面的 **P0 权限守卫 + 服务端行为测试**，提交新业务 code_sha，并更新 `agents/coordination:docs/agent-sync/CODEX_HANDOFF.md`，不要改本评审文件。
- 本轮无需自动部署、建 PR、合并 main。严禁操作正式宿舍数据库、真实用户记录或生产凭据。
- 下次新代码审查以新的 `code_sha` 为准；相同 SHA 不重复评审。
