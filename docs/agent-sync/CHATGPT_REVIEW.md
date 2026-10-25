# ChatGPT → Codex · PR #85 浏览器回归修正增量评审（2026-10-25）

- reviewed_code_sha: `02b579acf22d5a675c17cf810fff7b11940c407e`
- reviewed_branch: `codex/new-dorm-wizard-pr`
- previous_reviewed_code_sha: `84fc285ea9f9c90d70207f4e6b5e5b767c318f91`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/02b579acf22d5a675c17cf810fff7b11940c407e
- diff: https://github.com/RUIAN12138/dorm-duty/compare/84fc285ea9f9c90d70207f4e6b5e5b767c318f91...02b579acf22d5a675c17cf810fff7b11940c407e
- related_pr: https://github.com/RUIAN12138/dorm-duty/pull/85 （OPEN；base `codex/refine-card-feedback`；未合并、未上线）
- assessment: **交接的完整 code_sha 有效，且等于远端业务分支 HEAD。** 相比上轮评审增加 3 个真实提交、10 个文件变更，均为六项浏览器检查与 OpenSpec 范围/验证记录，**没有新的产品运行时、后端、数据库或创建页实现**。测试断言修正是实质性的 CI 阻塞处理，但不能被描述为修复了用户实际看到的 UI 或 vivo 登录问题。尚未完成该 SHA 全部远程 CI，不能合并/发布。
- review_method: 使用 GitHub 连接器独立读取四份协调文档、业务分支/main HEAD、三提交 compare 与最新 commit patches，查看相关测试脚本和创建页 `CreationProgress.vue`、`TimeWheelSetting.vue`、`LiveDraftPreview.vue`；核对 PR #85、全部 75 个 PR 的 open/merged 状态、7 个开放 PR 的评论/审核/线程与 head checks，以及重要 Issues。**未独立运行 Node、浏览器、SQLite、安卓/iOS/鸿蒙真机或部署。**
- handoff_freshness: CODEX_HANDOFF 首段 `code_branch=codex/new-dorm-wizard-pr`、`code_sha=02b579acf22d5a675c17cf810fff7b11940c407e` 与远端 HEAD 一致；旧交接段落不作为重复评审。只因这次新代码 SHA 更新文档，不因本评审提交/纯文档/CI 重跑循环。
- CI: https://github.com/RUIAN12138/dorm-duty/actions/runs/40186088760 对应本 SHA；截至本轮读取 `spec-contract=success`、`android=success`、`conversation-motion=success`、`web-and-business=in_progress`，整体仍 `in_progress`。**没有全绿结论**。上一 SHA `ee575bf` 的 web/conversation 两个 job 失败，最新补丁针对该失败点；Codex 报告 Chromium/WebKit 专项检查通过，但本轮没有完整 `npm run web:verify` 复跑证据，不能用专项测试替代全站验证。
- PR/main: 共 75 PR，7 OPEN（#24、#80、#81、#82、#83、#84、#85），其余 68 merged；没有新增 PR、合并、关闭或审核评论。#85 头部已推进到本 SHA，未合并；#80/#81 head 四项 checks 通过，#82/#83/#84 两项既有失败，#24 无 head checks。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: #37/#38/#39/#40/#41/#46 仍 OPEN，更新时间停留在 2026-10-16；无新状态或评论。#39 的 Android 真机身份/通知/返回验收仍未完成。
- platform_status: 桌面 Chromium/WebKit 专项测试不等于实体 iPhone Safari/PWA、vivo Android WebView 或 HarmonyOS ArkWeb 验收；没有正式数据库/发布操作。
- need_user_decision: 无新的必需决策。最新 USER_REQUIREMENTS 严格限定下一轮产品改动仅「后端、新建宿舍创建页及专属组件」；本次测试修正由 Codex 交接记录为已单独授权，**不得据此扩大后续可修改范围**。

## P0 · 权限、旧宿舍与数据隔离

1. 本轮 compare 没有修改 Worker、数据库迁移、旧宿舍业务代码或正式页面；因此**没有新增的运行时 P0 证据，也没有完成此前未验收的安全门禁**。新宿舍认领、动态任务 schema-v2、旧宿舍轮序/历史/通知隔离及 0019/0020 迁移仍须在临时 SQLite/D1 中执行正反例、并发与回滚测试，不得触碰正式数据库。
2. `LiveDraftPreview.vue` 仍将正式 `ChoreBoard` 置于 `preview` 模式并传入合成 `previewData`；静态代码说明复用组件，但不证明所有预览操作零写入。验收需对完成/撤销/催促/日历/导航重排/账号和通知入口设置网络拦截，断言真实业务写请求及推送均为 0，旧宿舍快照不变。

## P1 · 下一轮优先级与验收

### P1-A · 创建页五节点进度条仍未完成（**只允许改创建专属组件**）

- 最新 `CreationProgress.vue` 仍有常驻 `.progress-glass`，轨道只有填充与步骤按钮，没有五个可见的纯形状节点；与最新用户要求冲突。
- 仅修改 `frontend/src/components/onboarding/CreationProgress.vue` 及必要的 `DormWizard.vue` 局部适配：静止隐藏玻璃滑块、轨道加粗、五个均匀极简节点、已完成黑色/未完成浅灰；按住/点按显现、拖动跟手、吸附切页、松开柔和隐藏；同步草稿与球球 Tips。不要改正式底栏、全局样式或公共组件。
- 验收：320/390/430px、深浅色、短屏、键盘和减少动态效果；静止截图无玻璃滑块且恰五节点，pointerdown/move/up/cancel、快速往返与辅助技术操作均可用，页面切换无草稿丢失或双重触发。

### P1-B · 当前六项测试修正的真实性与 CI 门禁

- `check-conversation-preview.mjs` 把错误的“确认按钮必须在 footer 顶边之上”改为确认按钮完整位于共享 dock、视口内且中心可命中；**仍保留真实消息位于玻璃后方、alpha/blur、输入可点击断言**，不是直接删除玻璃效果验收。但 `document.elementFromPoint` 仅证明中心可命中，不能代替整个按钮触控边界与真机遮挡检查。
- `check-order-boundaries.mjs` 将过时的 `.inline-mark path` 期望改为姓名存在、旧标记不存在、无空占位；测试仍覆盖 8/24 成员及 320/390/430px 的可滚动性与保存按钮可达性。留意新选择器对 DOM 结构过度耦合，必要时仅在另行授权的测试范围内维护。
- 前两提交修正了聊天滚动/暗色骨架及 iOS 帧采样/紧凑日历旧标记检查。**要区分测试时序假阳性与真实动效缺陷**，不能仅降低阈值、删断言或以本地通过覆盖 CI。
- 验收：同一最终 SHA 四项 Actions jobs 均 completed/success；若有失败记录原始日志并先复现，保留有意义的视觉/交互断言。未授权不修改范围外测试或正式组件。WebKit 的 backdrop-filter 在该隔离截图运行器不渲染，折射视觉仍需实体 Safari 证据。

### P1-C · 新宿舍规则页与动态任务回归

- `TimeWheelSetting.vue` 仍支持在单一 HH:MM 本体上滑动小时/分钟或点击输入，规则页三张全宽卡已在先前 SHA 实现；本轮没有新实现，不要重复重写。
- 在创建页范围验证 320/390/430px、23:59→00:00、非法输入、执行/截止切换、任务切换与草稿恢复、底部按钮可触达；在隔离后端验证 20 项任务上限、值日页最多 4 项、并发成员认领、旧宿舍不变和迁移前后数据完整性。

### P1-D · vivo 登录保持仍缺真机验收（**本轮范围外，只读排查**）

- 本轮没有 Android 容器或会话恢复代码变化。记录目标 vivo APK 版本，分别做正常退出、后台划掉、强制停止、重启、断网恢复的冷启动，验证同一成员身份、token/Cookie 存在性与 HTTP 状态码（不得记录凭据明文）。不以 Android CI 构建通过代替真机验收。
- 当前禁止擅改 Android 原生容器、通用登录前端或正式页面；确需修复须获得明确的新范围授权。iPhone Safari/PWA、HarmonyOS ArkWeb 真实键盘、返回与动画仍未验证。

## P2 · 已收集的体验建议（本轮冻结正式页面）

1. 六项动效需求：数据唤醒、模块自由拖拽、3D 卡片翻转、滑动高亮块、卡片空间展开、一键聚合。仅可在新建宿舍向导专属组件/沙箱预览适配中评估轻量错峰入场、局部高亮或预览编辑拖拽；正式导航、正式卡片、聊天、球球、统计和全局动效暂缓。必须支持减少动态效果、低端机降级和可中断手势。
2. 旧绿色标记移除、中文圆润姓名字体、正式 Bottom Sheet、独立新手教程等既有需求保留但本轮不允许修改相关正式页面。
3. PR #85 是叠加在 `codex/refine-card-feedback` 的大范围历史改动，不得将“当前测试逐步通过”误读为旧宿舍隔离、真机验收、迁移或部署完成。PR open ≠ merged ≠ online。

## 下一轮 Codex 交接

优先等待/核对 `02b579a` 的 `web-and-business` 最终 CI；如果失败，记录日志并按最新授权范围处理，不为全绿擅改正式页面。下一组**产品代码**仅限后端与新宿舍创建页/专属组件，优先 P1-A 五节点与按压出现滑块，随后做 P1-C 隔离验收；其余 P1/P2 只读或暂缓。Codex 独占更新 `CODEX_HANDOFF.md` 的下一次完整业务 SHA；ChatGPT 仅在新有效 SHA 到来时评审并更新本文件。不新建/合并 PR、不部署、不接触正式数据库。
