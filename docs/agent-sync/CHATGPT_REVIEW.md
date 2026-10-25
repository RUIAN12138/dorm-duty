# ChatGPT → Codex · PR #85 新宿舍进度条及回归增量评审（2026-10-25）

- reviewed_code_sha: `60bea9d021a09811ad86009ecf23c77cabbfd06c`
- reviewed_branch: `codex/new-dorm-wizard-pr`
- previous_reviewed_code_sha: `02b579acf22d5a675c17cf810fff7b11940c407e`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/60bea9d021a09811ad86009ecf23c77cabbfd06c
- diff: https://github.com/RUIAN12138/dorm-duty/compare/02b579acf22d5a675c17cf810fff7b11940c407e...60bea9d021a09811ad86009ecf23c77cabbfd06c
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85 （OPEN；base `codex/refine-card-feedback`；未合并、未上线）
- assessment: **交接 SHA 与远端分支 HEAD 一致；有新的真实产品代码。** 对比上一轮评审共新增 2 个业务分支提交、10 个文件变更：`bd260e3` 仅修正轮序浏览器测试及 OpenSpec，`60bea9d` 在 `CreationProgress.vue` 实现空闲隐藏玻璃滑块、最多五个纯形状节点、按压显现和释放后吸附隐藏，并新增浏览器断言。新效果在源码中真实存在，但不是设备验收；发现共享设置工作台的影响范围与两条可疑手势边界，需补测。旧宿舍安全隔离、沙箱预览零写入和 vivo 登录保持仍无新的独立证明。
- review_method: 使用 GitHub 连接器读取四份协调文档、远端分支和 main HEAD、真实 compare/两个提交 patch、`CreationProgress.vue`、`DormWizard.vue`、`LiveDraftPreview.vue`、向导及轮序测试脚本、相关 Actions 原始日志；检查全部 75 PR 的状态、7 个开放 PR 的评论/审核/线程和 head CI，核对重要 Issues。**未独立运行本地 Node、浏览器、SQLite/D1 或任何真机测试**。
- handoff_freshness: `CODEX_HANDOFF.md` 含完整有效的 `code_branch=codex/new-dorm-wizard-pr`、`code_sha=60bea9d021a09811ad86009ecf23c77cabbfd06c`；此 SHA 是当前业务分支和 PR #85 的 HEAD，区别于文档中的旧交接段落。仅因新的业务代码提交更新评审，不因纯文档/CI 重跑循环。
- CI: https://github.com/RUIAN12138/dorm-duty/actions/runs/40189358703 对应本 SHA；本次核查：`web-and-business=in_progress`、`conversation-motion=success`、`spec-contract=success`、`android=success`。**不能称为全绿**。此前 `bd260e3` 的 https://github.com/RUIAN12138/dorm-duty/actions/runs/40187105498 中 `web-and-business=failure`；原始 job 日志明确显示 `scripts/check-email-experience.mjs:412` 点击 `entry-back` 时被 `.wizard-guide` 头部拦截，不能未经复现就归因于过期测试。Codex 报告本机 Chromium/WebKit 创建向导通过、`check-entry-layout` 50 项及 typecheck/spec 校验通过；本 SHA 未提供独立的全套 `npm run web:verify` 与真机证明。
- PR/main: 75 PR，7 OPEN（#24、#80–#85），其余 68 merged；无新增 PR、合并、关闭、审核提交或新评论/线程。#85 的 HEAD 是本 SHA，仍 OPEN。#80/#81 head CI success，#82/#83/#84 仍 failure，#24 为既有 action_required。main 仍是 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: #37/#38/#39/#40/#41/#46 仍 OPEN，最后更新时间均停留在 2026-10-16；无新重要状态/评论。
- platform_status: 仅本地桌面 Chromium/WebKit 移动视口模拟的交接报告；实体 iPhone Safari/PWA、vivo Android WebView、HarmonyOS ArkWeb 均未验收。未访问正式数据库，未部署。
- need_user_decision: Codex 提出的 `.wizard-guide` 遮挡 `entry-back` 修复仍需用户对该**具体创建页 UI 修复**确认；不得为了让 CI 通过擅改范围外脚本或正式组件。若必须影响既有设置工作台，需先给出创建页局部隔离方案；不要默认扩大授权。

## P0 · 旧宿舍隔离与预览安全（持续未验收，非本轮新增缺陷）

1. 本轮 diff 不含 Worker、数据库、身份或旧宿舍运行时代码，不能据此宣称旧宿舍数据隔离已验证。新宿舍 schema-v2、成员认领、旧轮序/历史/提醒/通知和 0019/0020 迁移须在**独立临时 SQLite/D1** 做新旧数据快照、并发认领、反例权限、迁移/回滚及完整性验证；正式数据库不得连接。
2. `LiveDraftPreview.vue` 确实将正式 `ChoreBoard`、`ChoreBottomNav` 放在 `preview` 模式并传合成 `previewData`，但仅静态复用不等于所有操作零副作用。隔离环境分别尝试完成、撤销、催促、日历、导航重排、账户/通知入口；拦截网络请求，断言真实业务写请求、邮件/推送为零，且旧宿舍快照不变。

## P1 · 本轮可执行修改建议与验收

### P1-A · 进度条新实现：补齐边界和范围隔离

- 已确认：`CreationProgress.vue` 轨道 20px、五个 `.progress-node`、滑块 `opacity:0` 空闲隐藏、pointerdown 显现、拖动实时切页、settle 后隐藏。现有 `check-dorm-wizard-browser.mjs` 有合成 PointerEvent 及部分真实 mouse 路径的断言。不要重新设计已完成的五节点效果。
- **潜在手势缺陷 1（源码可见，尚未实测）**：`up()` 在“未进入 dragging 且纵向位移 >8px”的分支调用 `settle(props.modelValue)`，未传 `hide=true`，可能在未发出 click 的触摸释放后留下可见滑块。应与 `move()` 的纵向取消路径一致，确保 pointerup/cancel/lostcapture 最终隐藏。
- **潜在手势缺陷 2（源码可见，尚未实测）**：`select()` 先递增 `flightRevision`，而 `settle()` 在已有同目标 flight 时直接 return；旧 onComplete 因 revision 不符退出，可能使连续点按后 `thumbVisible` 一直为 true。需保证每次 select/settle 都有有效的结束隐藏路径。
- **范围风险**：`DormWizard.vue` 在 `workspace=true`（schema-v2 既有任务设置工作台）也复用 `CreationProgress`，且 workspace 步骤数可能超过五；当前最多五个节点按整个步骤长度均分，节点可能与实际步骤按钮不重合，且本轮改动也影响非新建流程。严格遵守 USER_REQUIREMENTS：仅对**新宿舍创建模式**启用新视觉/手势；通过创建页专属参数/局部封装隔离工作台，保持既有设置交互不变。若不可在允许范围内隔离，先报告依赖等待授权。
- 验收：在隔离浏览器使用**真实触摸/鼠标事件**（不仅手工 dispatchEvent），验证按压、单击当前节点、连续快速同节点点按、纵向滚动后抬手、拖动中断、pointercancel/lostcapture、跨页往返、resize、减少动态效果、键盘箭头/Home/End；每次释放最终 `opacity=0`，没有滑块残留或双触发，草稿和球球 Tips 正确。320/390/430px、暗色和小屏截图五节点清晰可见；新建五步的每个节点与对应命中目标对齐；设置工作台行为保持旧基线。

### P1-B · 新建入口返回按钮被遮挡（CI 证实的阻塞）

- 上一 SHA 的 GitHub 原始日志已记录 `entry-back` 点击被 `.wizard-guide` 拦截，不应只修改测试期望或强制点击。先在隔离浏览器以实际点击和 `elementFromPoint` 复现，确认布局层叠/触控区域与键盘、安全区关系。
- 仅在获准的**新宿舍创建向导局部**修正层级、布局或指针命中，保证返回按钮中心和边缘可点击，不遮挡球球/提示或引导功能；不改正式页面、通用导航、全局 CSS、旧宿舍或范围外测试夹具。
- 验收：320/390/430px、短屏、横屏、键盘弹出/收起、WebKit/Chromium 下实际点击 `entry-back` 能返回且不误触；保留原有草稿；同一业务 SHA 的 `check-email-experience.mjs` 和完整 `web:verify` 通过。若必须修改该范围外脚本，需用户另行授权。

### P1-C · CI、测试证据与旧问题

- 当前最新 CI 仍未全部完成。必须核对最终 `web-and-business` 结论与原始日志；不要以本地专项测试或 Android 构建成功替代远端全绿。若出现新失败，先判定真实产品缺陷还是夹具过时，且不绕过 `spec:gate`。
- `check-entry-layout.mjs` 的新断言验证八名成员姓名、名次和状态结构且旧绿色标记不存在；属于测试更新，**并未重新修改正式成员 UI**。需要避免把这次 CI 修正误称为新功能。
- 新规则页全宽卡片与直接操作单一 HH:MM 的既有实现继续保留；验证 23:59→00:00、非法输入、执行/截止分别保存、任务切换、草稿恢复、底部按钮可达。vivo 登录保持、iPhone Safari/PWA、HarmonyOS ArkWeb 真机仍未验证；目前只读记录，禁止擅改 Android 容器和正式登录页。

## P2 · 后续设计建议（正式页面继续冻结）

- 用户提出的六项动效：数据唤醒、模块自由拖拽、3D 卡片翻转、滑动高亮块、卡片空间展开、一键聚合，均保留需求；只允许在创建页专属组件/沙箱适配评估轻量错峰入场、局部高亮、预览布局拖拽。正式值日/聊天/球球/底栏/统计/全局动画暂缓。支持 `prefers-reduced-motion`、低端机降级、可中断手势。
- 旧绿色标记移除、中文略圆润姓名字体、正式 Bottom Sheet、独立新手教程等旧要求保留但本轮不授权修改。
- PR #85 仍是基于 `codex/refine-card-feedback` 的大规模历史改动；新创建组件测试通过不代表迁移安全、真实设备、已合并或已上线。

## 下一轮 Codex 交接

优先检查本 SHA 的最终 CI，记录返回按钮遮挡的可复现证据；在用户对具体修复授权和最新范围限制下，只改后端或**新宿舍创建页及其专属组件**，优先修复 P1-A 手势残留/工作台影响和 P1-B 命中遮挡，补充真实触控与隔离回归。若需要改既有设置工作台、范围外测试或正式 App 页面，先等待新授权。Codex 独占更新 `CODEX_HANDOFF.md` 的新完整业务 SHA；ChatGPT 仅审查新的有效交接 SHA，不因自己文档提交循环。不得推业务代码、建/合 PR、部署或触碰正式数据库。
