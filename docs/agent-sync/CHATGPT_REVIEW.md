# ChatGPT → Codex · 新版创建页与 PR #85 独立评审（2026-10-25）

- reviewed_code_sha: `84fc285ea9f9c90d70207f4e6b5e5b767c318f91`
- reviewed_branch: `codex/new-dorm-wizard-pr`
- previous_reviewed_code_sha: `1cb5c33b5534bf477e50caaee5809efbb57f24f4`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/84fc285ea9f9c90d70207f4e6b5e5b767c318f91
- diff: https://github.com/RUIAN12138/dorm-duty/compare/1cb5c33b5534bf477e50caaee5809efbb57f24f4...84fc285ea9f9c90d70207f4e6b5e5b767c318f91
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85 （OPEN；base `codex/refine-card-feedback`；未合并 main、未发布）
- assessment: **确认 CODEX_HANDOFF 首段提供有效完整业务 SHA，且与远端开发分支 HEAD 相同。** 相对上一评审为 5 个提交（`e6f95ac`、`ff96eb9`、`4cc4e62`、`ca54403`、`84fc285`），33 个文件变更。规则页三张全宽卡片和单一 HH:MM 可直接拖动/点击输入已在真实源码中实现；同步生成的邮箱 runtime 加入 v2 新成员认领分支；其余主要为 OpenSpec 登记和浏览器测试修正。**新发现两项阻塞：最新用户要求的「进度条静止隐藏玻璃滑块＋五个无文字节点」尚未实现；本 SHA 的远程 GitHub Actions 已完成但 2/4 jobs 失败，不能合并或声称全绿。** 未发现可确认的新 P0 越权，但旧宿舍数据与迁移仍需隔离验证。
- review_method: GitHub 连接器独立读取四份协调文档，确认分支 HEAD、compare 5 commits 的真实 diff、逐文件 patches；检查 `DormWizard.vue`、`CreationProgress.vue`、`TimeWheelSetting.vue`、`SpotlightTour.vue`、`LiveDraftPreview.vue`、`check-dorm-wizard-browser.mjs`、`check-chat-motion-continuity.mjs`、`check-companion-browser.mjs`、`check-companion-chat-browser.mjs`、`check-dynamic-task-migration.mjs` 及 `site/runtime/email-runtime.cjs` 认领差异；读取 PR #85、全部 75 个 PR 的状态、7 个开放 PR 的评论/审核/线程、所有开放 PR 的 head Checks、GitHub Actions run 40182014318 的两个失败 job 原始日志、main 和重要 Issues。**本轮没有独立执行 Node、浏览器、SQLite、真机或部署。**
- handoff_freshness: 最新 `CODEX_HANDOFF.md` 首段 code_branch=`codex/new-dorm-wizard-pr`、code_sha=`84fc285ea9f9c90d70207f4e6b5e5b767c318f91`；分支 HEAD 一致。旧交接段落不作为新的重复评审；不因本评审提交、纯文档变化或 CI 重跑触发下一轮。
- CI: https://github.com/RUIAN12138/dorm-duty/actions/runs/40182014318 对应**同一 SHA**，于 2026-10-25 09:51 UTC 左右完成，最终 **failure**：`android=success`、`spec-contract=success`、`web-and-business=failure`、`conversation-motion=failure`。从原始 job logs 确认：
  - `conversation-motion` 在 `scripts/check-chat-motion-continuity.mjs:293` 的「新消息应经过多个 scrollTop 位置而非跳到末尾」断言失败（本次改动只修了同脚本另一处退场帧断言；不能据此断言运行时已坏或该断言必错）。
  - `web-and-business` 在 `scripts/check-companion-chat-browser.mjs:777` 的「settings skeleton dark styling never dims the rest of the application」断言失败；这是未在最新 SHA 修改的测试/行为，需区分环境时序与实际全局 opacity 异常。
  - Codex 报告本机 Node v26 / Chromium `web:verify` 退出码 0、目标脚本连续通过；CI 为 Node v22.23.0。**本地通过与远程失败同时如实记录，不得用本地结果覆盖 CI。**
- PR/main: 75 个 PR 中 7 个 OPEN（#24、#80–#85），68 个 merged，无仅关闭未合并；#85 是本轮新增 PR，尚无评论、review submission、review thread，且未合并。#80/#81 的 4 个 head checks 成功，#82/#83/#84 的 `web-and-business`、`conversation-motion` 仍失败（旧阻塞）；其余开放 PR 没有新增评论/审核/合并/关闭。main HEAD 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: #37/#38/#39/#40/#41/#46 均 OPEN，最后更新仍为 2026-10-16，无新增状态或评论；#39 Android 真机身份/返回/通知验收仍待办。
- platform_status: 新 SHA 只有 Codex 本地 Chromium/WebKit 或 CI 桌面浏览器/Android 构建证据；**没有 vivo Android WebView 冷启动、iPhone Safari/PWA、HarmonyOS ArkWeb 真机通过记录**。未访问正式数据库，未执行发布迁移。
- need_user_decision: **CI 失败涉及本轮新授权范围外的 `scripts/check-companion-chat-browser.mjs`，以及 `check-chat-motion-continuity.mjs` 中未获本次明确授权的另一项断言。** 当前最新 `USER_REQUIREMENTS.md` 严格只允许「后端、新宿舍创建页及专属组件」的下一轮业务改动；除 Codex 交接中已单独授权的具体测试修正外，不得自行扩展测试/正式页面范围。若确需修上述两处，先请求用户新的、限定文件和断言的授权。PR #85 现有 198 个变更文件包含较多范围外历史代码，不能把该 PR 的存在当作授权继续修改正式组件。

## P0 · 数据、权限与发布门禁

1. 代码增量没有改写旧宿舍业务页面或旧宿舍轮序；`LiveDraftPreview.vue` 仍使用正式 `ChoreBoard preview` 和草稿/合成数据；源码级隔离存在，但没有本轮独立运行的网络副作用断言。`ff96eb9` 让生成的 `site/runtime/email-runtime.cjs` 与已有 v2 新宿舍认领源码同步：按邀请码限定 schema_version=2、校验邮箱身份 `who` 与十分钟验证期、查重名和 12 人上限、事务写成员与邮箱绑定。**这是真实可执行的后端变更，不能仅当作无害构建文件。**
2. 仅用临时/脱敏 SQLite 或临时 D1 对新建宿舍认领做并发同名、重复认领、过期邮箱、跨宿舍身份、旧宿舍不变的负例；同时核查迁移 0020 前后旧任务/历史/提醒/索引/外键/轮序与回滚。全屏预览逐项验证完成/撤销/催促/导航重排/日历等交互**真实写入和通知为 0**。正式数据库不得触碰；未授权不得合并/部署。

## P1 · 下一轮允许范围内的修改建议及验收

### P1-A · 最新用户进度条需求尚未实现（优先，**只改创建页专属组件**）

- **源码事实**：`frontend/src/components/onboarding/CreationProgress.vue` 的 `.progress-glass` 始终渲染且无默认隐藏状态；轨道仅有填充 `<i>`，按钮命中区为透明，**没有五个可见的极简节点**。与 2026-10-25 `USER_REQUIREMENTS.md` 最新要求冲突。
- **建议允许范围**：仅 `CreationProgress.vue` 与必要的创建向导局部适配。默认只显示较粗的轨道、按当前步骤完成/未完成分色、五个均匀的纯形状节点（无数字/图标/文字）；按下轨道或节点时滑块从当前位置弹性出现，拖动时跟手/吸附，释放或取消后柔和隐藏。保留对屏幕阅读器可用但视觉隐藏的步骤名称；不要改通用导航、正式 App 或全局样式。
- **验收**：320/390/430 CSS px、短屏、深浅色、减少动态效果；静止截图玻璃滑块不可见、节点恰为五个且均匀分布；触摸按下、拖过多节点、点击跳转、pointercancel、失焦/返回、键盘操作后页面与球球 Tips 同步且草稿不丢；释放后滑块隐藏，未出现误切页/重复触发。可使用创建页已有可运行的隔离验证，**若必须修改范围外测试文件先单独请求授权**。

### P1-B · 规则页与直接 HH:MM 已实施，继续做局部回归而非重复重写

- `DormWizard.vue` 已将三规则卡改为等宽全行排列，`TimeWheelSetting.vue` 不再使用第二套 Vant picker，小时/分钟各自可拖动、点击输入和方向键调节；不同执行/截止字段通过 v-model 分别绑定。不要再把此需求列为未实现。
- **验收**：320/390/430 宽和短屏/大字号，卡片等宽、无溢出、底部按钮可触达；跨 23/00、59/00、非法输入、触摸中断、输入焦点/键盘关闭、任务切换、草稿恢复、执行早于截止校验；时间区域只出现一套 HH:MM。浏览器测试在本机通过不等于手机实测。仅修复复现于创建专属页面/组件的问题。

### P1-C · v2 新建成员与动态任务的后端隔离验收

- `site/runtime/email-runtime.cjs` 新增 v2 认领实际分支，需验证与服务端源码、生成包一致；`0020_dynamic_task_keys.sql` 的旧表重建仍是发布前风险。
- **验收**：独立测试 4+1、20 项上限/21 拒绝、值日页第 5 项拒绝、删除后历史可读、旧宿舍快照不变；v2 邮箱绑定的重复请求幂等、并发同名竞争与事务回滚、跨宿舍拒绝；仅隔离 DB，不能对正式 DB 运行迁移或“验收”。

## P1 · 本轮发现但**禁止未经授权修改**的阻塞

### P1-D · PR #85 远程 CI 两项失败，不能合并/发布

- CI 原始证据： https://github.com/RUIAN12138/dorm-duty/actions/runs/40182014318/job/121134851743 与 https://github.com/RUIAN12138/dorm-duty/actions/runs/40182014318/job/121134851722 。
- `check-chat-motion-continuity.mjs:293` 仍要求发送新消息时出现至少 7 个不同四舍五入的 scrollTop 位置；应先用现有证据判断消息内容是否真正使 scrollHeight 增长、采样是否跨越动画帧、是否发生真实跳变。**不得通过删断言或任意降阈值制造绿灯。**
- `check-companion-chat-browser.mjs:777` 检查根元素 opacity 为 1；CI 日志证实断言失败，原因未证实。应先只读排查截图、CSS 与运行日志，区分真实页面变暗、计时器/过渡时序或 fixture 污染。
- **验收门禁**：获用户明确限定范围授权后才可改范围外测试/组件；同一最终 SHA 的 4 个 CI jobs 全部成功，保留原始日志和可复现用例；不将 PR open/CI android success 视为上线。未经授权只记录阻塞，不执行范围外修复。

### P1-E · vivo 安卓 App 冷启动登录保持与三端真机

- 既有源码已改持久 token 优先级、401 竞态与网络失败路由；本轮没有新的目标 vivo APK 实测。需记录 APK 版本，按正常关闭、后台划掉、强制停止、重启、断网再恢复各至少三次；只记录 token/Cookie 存在与否、接口状态码、是否恢复同一成员，不记录凭据原文。
- **当前禁止改 Android 原生容器、通用登录前端或正式页面**；可只读诊断，若需修复范围外代码必须另行获得授权。iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 真实键盘、返回、球球、滑块、预览仍未验证。

## P2 · 体验建议保留但遵守最新范围

1. 用户提出的「数据唤醒、模块自由拖拽、3D 悬浮翻转、滑动高亮块、卡片空间展开、一键聚合」六项作为**待办需求**保留。当前仅允许在**新宿舍创建向导专属组件/沙箱预览适配**内评估轻量错峰入场、局部高亮或预览编辑拖拽；通用导航、正式卡片、正式统计看板、聊天/球球正式页和全局动画**全部暂缓，不能指示 Codex 实施**。优先保证减少动态效果、低端机降级、手势不冲突。
2. 旧绿色任务标识、中文圆润成员字体、正式 Bottom Sheet、独立教程及正式页面动效需求未撤销但本轮冻结；需要改正式组件时先请用户放宽范围。
3. PR #85 变更面较大（198 文件），叠在 #84 的开发分支上；合并前需复核堆叠依赖、文件树差异、迁移与测试证据。**PR 已创建 ≠ 已合并 ≠ 已上线**。

## 下一轮 Codex 交接

优先在**仅允许的后端和新宿舍创建页/专属组件**内处理 P1-A（进度轨道五节点、按压出现玻璃滑块）和 P1-B/C 的确证缺陷与隔离验收；其他全部只读检查或暂缓。当前 PR #85 CI 两项失败需用户对范围外测试修复作新的明确授权，未经授权不擅自修改。Codex 下次提交真实业务改动并 push 后，独占更新 `CODEX_HANDOFF.md` 的新完整 code_sha；ChatGPT 仅在下一次有效新业务 SHA 评审并只更新 `CHATGPT_REVIEW.md`。不新建/合并 PR、不部署、不访问正式数据库。
