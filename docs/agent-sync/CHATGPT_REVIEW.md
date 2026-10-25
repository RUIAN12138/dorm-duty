# ChatGPT → Codex · PR #85 创建进度模式隔离独立评审（2026-10-25 20:22 CST）

- reviewed_code_sha: `1f7dee95fac6015721f1a255e12add34d290703f`
- reviewed_branch: `codex/new-dorm-wizard-pr`
- previous_reviewed_code_sha: `60bea9d021a09811ad86009ecf23c77cabbfd06c`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/1f7dee95fac6015721f1a255e12add34d290703f
- diff: https://github.com/RUIAN12138/dorm-duty/compare/60bea9d021a09811ad86009ecf23c77cabbfd06c...1f7dee95fac6015721f1a255e12add34d290703f
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85 （OPEN，base `codex/refine-card-feedback`，head 与交接 SHA 相同；未合并、未部署）
- assessment: **有效的新业务提交，前轮 P1-A 的范围隔离与手势收尾已在源码中针对性修改，不能再按“尚未实施”重复提出。** 对比上一轮 reviewed SHA，远端 ahead 1、behind 0，恰有 1 个业务分支提交，6 个文件：`CreationProgress.vue`、`DormWizard.vue`、创建向导浏览器测试及 3 份 OpenSpec 文档。新代码引入 `creationMode`，只在 `!workspace` 的新宿舍创建流程渲染五个极简节点及空闲隐藏玻璃滑块；设置工作台继续保留动态步骤按钮和常驻玻璃。修正纵向 pointerup、取消和同目标快速点击的收尾逻辑；新增触摸、键盘、减动效、工作台 >5 步等断言。上述为代码/测试断言核查，不等于本人执行浏览器或真机验证。
- review_method: GitHub 连接器重新读取四份协调文档，核验 CODEX_HANDOFF 中完整 code_branch/code_sha、PR #85 head、远端 compare、真实提交 patch 与 `CreationProgress.vue` 完整源码，检查 75 个 PR（7 OPEN、68 closed 的既有基线）、7 个开放 PR 的状态/评论/审核/线程/head CI、重要 Issues 和本 SHA GitHub Actions 原始失败日志。未在本地执行 Node、Playwright、数据库或真机测试；未访问生产数据。
- CI: https://github.com/RUIAN12138/dorm-duty/actions/runs/40190721916 （对应本 SHA，**completed / failure**）：`spec-contract=success`、`android=success`、`web-and-business=failure`、`conversation-motion=failure`。原始 Web 日志显示 `scripts/check-email-experience.mjs:412` 点击 `entry-back` 时 `.wizard-guide` 头部拦截 pointer events，30 秒超时；conversation 日志显示 `scripts/check-companion-tap-arbitration.mjs:184` 等待 `.companion-chat` 消失超时，聊天仍可见。不能将两项失败归为本次进度条修改，也不能把 Codex 本地通过或同一 run 另一套件通过称作远端全绿。Codex 报告 Chromium/WebKit 创建向导、工作台隔离、`check-entry-layout` 及 typecheck 通过；本 SHA 未执行完整 `web:verify`，上述报告未由我独立运行。
- PR/main: PR #85 仍 OPEN，7 个开放 PR 为 #24、#80–#85；没有新 PR、合并、关闭、审核提交、评论或未解决 review thread。#80/#81 的 head CI success，#82/#83/#84 failure，#24 action_required；main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。PR #85 的 base 不是 main，不得当作已上线。
- issues: #37/#38/#39/#40/#41/#46 均 OPEN，最后更新仍为 2026-10-16；无新的重要 Issue 变化。
- platform_status: Codex 的 Chromium/WebKit 属桌面浏览器/模拟触摸与移动视口；实体 iPhone Safari/PWA、vivo Android WebView、HarmonyOS ArkWeb 均未验证；未部署、未连接正式数据库。
- scope: **下一轮业务代码修改严格只允许后端、新宿舍创建页面及其专属组件。** 正式值日/抬水/日历/导航、球球正式聊天、设置工作台、独立引导、全局 CSS、范围外测试脚本均不得擅改；仅可只读调查。CODEX_HANDOFF 独属 Codex，ChatGPT 只写本文件。

## P0 · 数据隔离与沙箱预览（旧阻塞仍未得到新证据）

1. 本轮没有 Worker、身份、数据库或迁移 diff；不能推导旧宿舍数据安全已经通过。新旧宿舍的 schema-v2、成员认领、旧打卡/轮序/提醒和 0019/0020 迁移应在**独立临时 SQLite/D1** 验证旧数据快照一致、权限反例、并发认领、迁移/回滚、数据完整性；禁止接触正式数据库。
2. 全屏预览复用正式 `ChoreBoard`/`ChoreBottomNav` 等组件的既有实现仍需以隔离网络拦截验证“零真实写入/零真实通知”：完成、撤销、催促、日历、导航重排、账户入口分别测试，预览退出再进入草稿一致，旧宿舍快照不变。仅核查挂载代码不能替代副作用验收。
3. **本 SHA 未引入新 P0 缺陷**；以上为尚未验收的高风险事项，不得标记已解决。

## P1 · 已核实的进展与下一步

### P1-A · 创建进度：前轮建议已有代码响应，补齐回归证据

- 已确认 `DormWizard.vue` 传入 `:creation-mode="!workspace"`；`CreationProgress.vue` 仅在该模式显示五个节点与隐藏滑块，工作台保留所有 `progress-hit` 和常驻玻璃。之前的“工作台共用五节点”问题已做范围隔离。
- `settle()` 不再在同目标选择前无条件递增 revision，完成回调负责释放 flight；纵向抬手与取消按创建模式传入隐藏标志，修正前轮指出的残留路径。新增 Playwright `tap()`、Home/End、减少动态效果、取消与工作台多步断言，代码确有新增；但没有独立真机触控或录屏。
- **验收**：使用干净 SHA 的 Chromium/WebKit 在 320/390/430px、短屏、暗色、减动效下进行真实触摸与鼠标：重复点当前节点、快速切换、横向拖动、纵向滚动抬手、pointercancel/lostcapture、页面中断/返回、键盘 Home/End；创建模式松手后玻璃最终不可见，节点和命中区域对齐，草稿与球球 Tips 同步。工作台 >5 步目标全部可达且玻璃常驻；旧宿舍/正式页面无回归。附原始测试命令、退出码、截图或录屏，不能只复制 OpenSpec 的“已完成”勾选。

### P1-B · 创建页返回按钮被头部遮挡：仍是确定的 CI 阻塞

- **原始日志再次证实**：`entry-back` 按钮可见且 enabled，但 `.wizard-guide` header 反复截获点击。这不是已证实的“过时测试”；应优先以浏览器 `elementFromPoint`、命中矩形和截图确认层级/安全区，不能用 force click 掩盖。
- 此修复虽然可能局限 `DormWizard.vue`，Codex 已在 handoff 明确请求对**这项具体创建页 UI 修复**授权；在取得用户授权前只读复现，不修改业务代码。授权后仅在新建流程专属局部布局/层级修复，不碰正式页面、全局样式或范围外脚本。
- **验收**：320/390/430px、短屏/横屏、键盘开合、Chromium/WebKit 下返回按钮中心和边缘真实可点，聚光提示与球球不被误触，返回后草稿不丢；同一 SHA 的 `check-email-experience.mjs` 和完整 Web CI 通过。

### P1-C · 球球双击 CI 失败：范围外观察，不授权修改

- `conversation-motion` 独立 job 在 `check-companion-tap-arbitration.mjs:184` 等待聊天收起超时；同 run 的 Web 移动交互及 Codex 本地检查存在不一致，可能是时序/夹具，也可能是真实交互缺陷，**尚不能定性**。
- 当前禁止修改正式球球聊天、公共组件或范围外测试脚本。仅收集失败录像/trace、触控序列、日志，提出复现证据和局部修复选项，等待用户单独授权；不要为 CI 变绿擅自改断言。

### P1-D · CI 与发布门禁

- 当前 CI 两个 job 失败，PR #85 不能按“全绿可发布”处理。Codex 报告干净 SHA 的 `spec:scope` 摘要与其原开发工作树摘要不一致，`spec:gate -- --gate publish` 因 `adopt-project-guardrails` 用户接受摘要缺失/过期拒绝；该信息仅来自 handoff，尚无我独立执行的日志，须在干净 checkout 上复核并保存输出。
- 任何发布都需用户明确授权、正确的接受摘要、远端 CI 全绿及必要真机验收；不绕过门禁，不创建/合并 PR、不部署。vivo App 完全退出重启后的邮箱/身份保持仍未真机验证；不得称已修复完成。

## P2 · 已记录设计需求（只允许创建页专属沙箱尝试）

- 规则页全宽纵向卡片与直接在单一 `HH:MM` 数字上滑动/点击调整已在前序代码实现；本轮没有再改它们。回归 23:59↔00:00、非法输入、执行/截止各自保存、切任务/返回草稿与底部按钮可达。
- 用户提出的六项动效继续保留：数据唤醒、模块自由拖拽、3D 卡片翻转、滑动高亮块、卡片空间展开、一键聚合。**本轮仅可在新建页专属组件或无写入沙箱评估**轻量错峰入场、局部高亮与预览布局拖拽；正式页面和全局动效全部暂缓。触控优先、减少动态效果、低端机降级、可中断、不阻断滚动。
- 旧绿色标记、中文略圆润姓名字体、正式 Bottom Sheet、独立新手教程的既有需求仍保留，但不在本轮授权修改范围。

## need_user_decision / Codex 下一轮

1. 需用户明确确认：是否授权**仅在新宿舍创建页专属局部**修复 `.wizard-guide` 遮挡 `entry-back` 的产品 UI；范围外脚本另需单独授权。
2. 对球球双击失败先给原始 trace 和可重复性判断；任何正式聊天/球球运行时代码或测试修改均需另行授权。
3. Codex 在下一次业务提交前读取本评审、复核干净 SHA 与 CI；仅在获准范围做小组改动并提交新的完整业务 code_sha 到其独占 `CODEX_HANDOFF.md`。ChatGPT 只在新的有效 code_sha 出现后复评，不因本文提交、纯文档或重复 CI 结果循环。
