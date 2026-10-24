# ChatGPT → Codex · 登录冷启动、动态任务扩容与规则页体验评审（2026-10-24）

- reviewed_code_sha: `1cb5c33b5534bf477e50caaee5809efbb57f24f4`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- previous_reviewed_code_sha: `0e29305d01fd291f36a7080db22ef5974fdd70cb`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/1cb5c33b5534bf477e50caaee5809efbb57f24f4
- diff: https://github.com/RUIAN12138/dorm-duty/compare/0e29305d01fd291f36a7080db22ef5974fdd70cb...1cb5c33b5534bf477e50caaee5809efbb57f24f4
- assessment: **确认有效的新业务交接 SHA，且等于远端开发分支 HEAD。** 相对上一轮共新增 3 个业务提交（`5fbfb07d63273d6e8c7b238e281054b3653d1813`、`e3d0daf59ad30a11c523d725351fc283f88ed06a`、`1cb5c33b5534bf477e50caaee5809efbb57f24f4`），41 个文件变更。实际改动：持久会话优先级和旧请求 401 竞态保护、未验证会话的路由恢复、新版宿舍最多 20 个稳定任务 ID 与对应数据库约束/Worker/前端/日历/提醒/统计。**旧宿舍隔离与新增任务链路有实质实现和隔离测试，但跨表 SQL 迁移仍是发布高风险项；本轮未发现可确证的 P0 权限绕过。** vivo 重新登录问题获得针对性源码修复但未有目标手机冷启动证据，不能标记为已解决。用户新反馈的规则页排版与“直接在时间数字上调整、取消双重时间控件”仍未实施，纳入本轮 P1。
- review_method: 使用 GitHub 连接器读取 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、上一版 CHATGPT_REVIEW；核对开发分支 HEAD、完整 SHA 和 3 个提交的真实 diff、41 个文件统计；独立检查 `persistentSession.ts`、`session.ts`、`api/index.ts`、`router/index.ts`、`GuestHome.vue`、`dormDraft.ts`、`DormWizard.vue`、`TimeWheelSetting.vue`、`TaskPageBoard.vue`、`LiveDraftPreview.vue`、`site/worker/chores.mjs`、`site/shared/dorm-configuration.mjs`、`site/shared/notifications.mjs`、`site/drizzle/0020_dynamic_task_keys.sql` 和迁移/浏览器/启动测试。核对全部 74 个 PR 的开放、合并、关闭状态，六个开放 PR 的审核提交/线程/评论/最新 head Checks，main 和六个重要 Issues。**本轮未独立执行 Node、SQLite、浏览器或真机测试；Codex 的本地通过不能当作独立复跑或 CI。**
- handoff_freshness: CODEX_HANDOFF 含 3 段完整业务 SHA；其中 `1cb5c33b5534bf477e50caaee5809efbb57f24f4` 是最新开发分支 HEAD，`e3d0daf59ad30a11c523d725351fc283f88ed06a` 是其直接祖先，`5fbfb07d63273d6e8c7b238e281054b3653d1813` 为更早祖先。三次提交合并审查一次，不把协调文档或重复 CI 当新代码。
- CI: 新业务 HEAD 的 Commit Status 为 pending、`statuses=[]`，Check Runs=0；无可确认的远端 CI 通过记录。Codex 报告 `npm run web:verify` 退出码 0、`spec:validate` 19/19、`spec:scope`、前端类型检查；新任务隔离 SQLite 108 项、迁移 7 张表及外键/完整性检查、Chromium/WebKit 向导各 173 项；会话 13 项加路由 7 项、浏览器恢复各 11 项。以上均为 Codex 报告与可查测试代码，不是本轮独立执行。既有 GuestHome >500 KB chunk 警告未消除。
- PR/main: 全部 74 个 PR 中开放 #24/#80/#81/#82/#83/#84，68 个已合并，无仅关闭未合并；没有新增 PR、审核提交、审核线程、合并或关闭。#24 仅 2026-10-15 旧评论，其他开放 PR 无评论。六个 PR 最新 head Checks：#24 无运行；#80/#81 各 4 项成功；#82/#83/#84 均为 spec-contract/android 成功、web-and-business/conversation-motion 失败，仍是 2026-10-22/23 既有状态，**不是新业务 HEAD 的 CI**。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: #37/#38/#39/#40/#41/#46 均 open，最后更新时间不晚于 2026-10-16，无新增评论或状态变化；Android 设备身份/返回/通知仍与 #39 相关。
- platform_status: 仅 Codex 报告的 macOS Chromium/WebKit 与隔离 SQLite；vivo Android WebView、iPhone Safari/PWA、HarmonyOS ArkWeb、真实邮箱 Cookie 持久化、通知权限、设备级动效及线上迁移均未验收。未访问正式服务或数据库。
- need_user_decision: 暂无新决定。用户已明确要求规则页布局与时间交互优化，应直接作为下一轮受控开发建议；涉及数据库迁移与正式发布仍须另行获得用户授权。

## P0 · 旧宿舍与权限（未确认新增 P0，保持发布门禁）

1. `site/worker/chores.mjs` 的 legacy 初始化、四键配置路径仍按无 schema-v2 的宿舍区分；新版配置入口检查 `dorm_configurations.schema_version=2`，新类别操作绑定 `room.id`。新 `0020_dynamic_task_keys.sql` 重建 `chore_categories`、`chore_tasks`、`chore_history_entries` 三张表，并恢复索引；隔离测试确实构造旧任务、历史、提醒、水票、跳过和审计记录并做快照、`foreign_key_check` 与 `integrity_check`。这是测试设计证据，**不能由此推断真实 D1 上线迁移安全**。
2. **验收门禁**：仅用脱敏的隔离数据库/临时 D1，在迁移前后核对旧宿舍成员、历史、任务 ID、轮序、提醒、索引、外键及数量/摘要一致；验证失败时事务回滚，迁移重复执行策略清晰。不得在正式数据库验证或擅自部署。沙箱全屏预览需拦截全部真实写入和推送，并验证正式组件复用、任务切换/导航重排与旧宿舍数据零变化。

## P1 · 下一轮优先级与可执行验收

### P1-A · vivo 安卓 App 退出后重新登录：已有源码修正，仍未真机定位闭环

- `persistentSession.ts` 现在优先持久 `localStorage[dorm-auth-token-v1]`，再回退旧邮箱授权和 sessionStorage，并同步标签快照；`api/index.ts` 仅在 401 对应**当前** bearer 时清理别名，旧请求迟到的 401 不应清除新会话；`session.ts` 网络失败时保留 token；`router/index.ts` 新增 `!session.initialized -> /`，不再把未验证状态直接导向密码登录。源码确有修复，隔离测试覆盖路由与 Cookie jar，但**未证明 vivo WebView 的 Cookie/localStorage 在进程退出后仍存在**。
- **验收**：同一测试身份与明确 APK 版本，在目标 vivo 分别执行普通退出、后台划掉、系统强制停止、手机重启、断网冷启动再联网，各至少 3 次；记录本地 token/Cookie **是否存在**、`/email/me` 和恢复接口状态码、启动路由、是否恢复原成员（绝不记录凭据原文）。未过期且未主动登出应保持登录；短暂断网只显示恢复/重试，主动登出不得静默恢复；如果 APK 仍是旧版本，须明确版本差异。不要将浏览器模拟通过宣布为设备修复。

### P1-B · 用户新增反馈：任务规则页排版重做（仅新版向导）

- 实际 `DormWizard.vue` 的规则区使用双列网格，第三个选项单独居中且仅半宽；在小屏造成断裂与挤压。用户截图确认任务切换、三规则卡、执行/截止、时间滚轮层级混乱；与“每页一个核心问题、极简留白”的现行需求不符。
- **建议**：仅对新宿舍创建/新版工作台相应规则页作最小布局调整：任务胶囊横向滚动且选中态清晰；三种规则改统一全宽、等高纵向卡片（标题+一句解释）；只有“按时间安排”才出现紧凑的执行/截止切换和时间输入；保留球球、玻璃进度滑块、草稿/任务切换、正式页样式，不改旧宿舍或后端。
- **验收**：320/390/430 CSS px、短屏及大字体真实浏览器截图；无横向溢出、文字裁切、第三卡孤立、底部按钮不可触达；快速切换不同任务/规则/前后步骤后值不丢失，iOS 减少动态效果与键盘弹出时可操作。

### P1-C · 用户新增反馈：在时间数字本体直接调整，取消两套时间显示

- `TimeWheelSetting.vue` 现有模板同时渲染 `<strong>{{modelValue}}</strong>` 和独立 `<TimePicker>`，源码证实重复的时间显示/选择；本次 3 个业务提交未修改此组件。
- **建议**：改为单一可交互 `HH:MM` 数字控件：在小时数字上滑动调整 00–23、分钟数字上滑动调整 00–59；点击相应数字可精确输入，提供触控回弹/轻震的可降级反馈及键盘/屏幕阅读器等价操作。不要另保留一套下方滚轮；执行与截止使用同一个可复用组件，但分别绑定 `execution_time`、`deadline`，沿用已有“执行早于截止”校验。避免只把重复数字隐藏而留下两个控件。
- **验收**：单指滑动、点击输入、跨 23/00 和 59/00 边界、非法输入、键盘/辅助技术、不同任务切换及草稿恢复均有断言；最终只出现一套时间数字；320/390/430 宽度不溢出，常规手机主操作不被挤出屏幕。

### P1-D · schema-v2 自定义任务已扩展，迁移与极限配置需要发布前专项验证

- `dormDraft.ts` 为自定义任务生成 `task_<32 hex>` 稳定键，`validateDormConfiguration` 对总数 20 与值日页最多 4 项做服务端验证；`site/worker/chores.mjs` 已涉及新增/退役、轮转、完成撤销、日历与提醒；`TaskPageBoard.vue` 也在前端阻止第 5 项进入值日页。上一轮“总任务只能四项”需求缺口已在代码层面处理，**不是已发布或已验收**。
- **主要风险**：`0020_dynamic_task_keys.sql` 跨三张含外键表重建，现有检查基于本地 SQLite，不等于真实 D1 迁移语义；动态任务数量增大后，紧凑任务选择、第二页和统计/日历在 5、10、20 项情况下可能出现触控/性能/布局退化（尚非已复现缺陷）。
- **验收**：临时 D1/脱敏旧数据副本验证迁移、完整性、索引、回滚与保留历史；独立测试 4 内置 + 1 自定义、20 项上限、21 项拒绝、值日页第 5 项拒绝、删除后历史可读及待办取消、跨宿舍无串读；正式 `ChoreBoard`、全屏 `LiveDraftPreview` 和第二任务页用 5/10/20 项验证导航、统计、日历和无真实写入；正式数据库不得触碰。

### P1-E · Web 全量回归本地报告通过，缺独立 CI 和真机证据

- 本轮三次交接均报告 `web:verify` 退出码 0，已查看相关会话与任务测试设计；新 SHA 的 GitHub Check Runs=0，不能宣称 CI 全绿。
- **验收**：对最终业务 SHA 执行独立、可复现的完整 Web 回归并保留命令/退出码/日志；需要时通过受控 CI 为同一 SHA 提供检查记录。再分别进行 iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 的滑块、球球、任务切换、时间交互、聚光引导、键盘/返回和通知弹层真机验收。未经用户授权不创建 PR、合并或部署。

## P2 · 维护性与剩余体验

1. `site/runtime/push-runtime.cjs` 的生成文件 diff 出现本地绝对目录的模块标记噪声；建议确认构建产物的可复现性、是否需要纳入本次提交及路径归一化，避免无关大 diff；不要为此顺手更改业务功能。
2. 中文姓名圆润字体、旧绿色像素标识移除、Bottom Sheet 底部背景、Liquid Glass 滑块/触觉反馈、球球跨页接续与 iOS 动效仍应沿用先前验收清单；本轮无对应真机通过证据。
3. 屏幕阅读器/系统返回、复杂模态的聚光焦点循环及旧宿舍共享组件视觉回归继续保留，不能用桌面 WebKit 代替 iPhone Safari。

## 下一轮 Codex 交接

按 P1-A vivo 冷启动证据、P1-B/C 用户明确提出的规则页布局和单体时间交互、P1-D 动态任务迁移与极限配置、P1-E 独立 CI/真机证据依次处理；只在已授权的受控业务分支实施小范围改动。特别是 P1-B/C 不得顺手重做其他创建页、旧宿舍或数据模型。提交并推送新的业务代码 SHA 后由 Codex 独占更新 `CODEX_HANDOFF.md`；ChatGPT 仅在下一次有效新业务 SHA 评审，不因本评审文档、纯文档或重复 CI 形成循环。未经授权不创建/合并 PR、不部署、不访问正式数据库。
