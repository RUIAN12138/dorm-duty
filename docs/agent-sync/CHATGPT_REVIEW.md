# ChatGPT → Codex · 创建进度尺寸监听与规则页提示增量评审（2026-10-24）

- reviewed_code_sha: `ba7c0ca9b9d5970568f956907d5415bd3109ff39`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/ba7c0ca9b9d5970568f956907d5415bd3109ff39
- previous_reviewed_code_sha: `d7930a70583de86f41629ca231d0c7975eefaf6b`
- assessment: **确认交接 SHA 是真实业务提交，较上一评审 d7930a7 前进 1 个提交、修改 10 个文件，其中实际产品代码为 CreationProgress.vue、DormWizard.vue、新增 observeElementSize.mjs/.d.mts，浏览器测试有真实新增断言。** 上次 P2 尺寸回退监听未清理的问题在源码中已修复；规则页球球提示缩短。此次未改服务端/数据库，未发现新 P0。**但完整 Web 回归仍有四项失败、没有该 SHA 的 GitHub CI 成功证据、真机未验证，不可宣布发布验收。**
- diff: https://github.com/RUIAN12138/dorm-duty/compare/d7930a70583de86f41629ca231d0c7975eefaf6b...ba7c0ca9b9d5970568f956907d5415bd3109ff39
- review_method: GitHub 连接器读取 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、前一 CHATGPT_REVIEW，核对真实提交和 diff，读取 CreationProgress.vue、observeElementSize.mjs、DormWizard.vue、LiveDraftPreview.vue、TaskPageBoard.vue、WelcomeGuide.vue 和浏览器测试相关段落；查询 main、全部 74 个 PR 的合并/关闭、6 个开放 PR 的审核/评论/线程及其 CI、重要 Issues。**独立静态审查，不等于我独立运行浏览器、Node、CI 或真机测试。**
- handoff_freshness: 审查时 `codex/new-dorm-wizard-preview` HEAD 已前进至 `914f748462b0cd7161e23b63afad9e38669279d9`（在本次交接 SHA 之后另有 1 个真实业务提交，修改 WelcomeGuide.vue、浏览器断言和 OpenSpec）。**本评审严格仅绑定 handoff 的 ba7c0ca9b9d5970568f956907d5415bd3109ff39；914f748 未纳入本次 reviewed_code_sha，需 Codex 在下次 CODEX_HANDOFF 中更新完整 SHA 后单独评审，不应误以已审核最新 HEAD。**
- CI: `ba7c0ca9b9d5970568f956907d5415bd3109ff39` 的 GitHub Commit Status `statuses=[]`，PR-triggered Actions workflow runs `[]`；不得报告 CI 已通过。
- tests: Codex 报告 Chromium/WebKit 的 `scripts/check-dorm-wizard-browser.mjs` 均 `PASS []`，`web:build`、`spec:check` 和 diff check 通过；测试源码确实增加缺失 ResizeObserver 时的注册/触发/清理、进度条 pointercancel/lostpointercapture/反向释放、规则页提示断言。**回退监听测试直接调用 helper 并使用合成 environment，不等于真实 CreationProgress.vue 在无 ResizeObserver 的浏览器中挂载/卸载集成测试；未独立复跑。** Codex 明确 `npm run web:verify` 仍失败四项。
- PR/main: 全部可检索 74 个 PR：开放 #24、#80、#81、#82、#83、#84，其他 68 个已合并，均无本轮新增关闭/合并。开放 PR 审核提交、inline review threads 为 0，#80–#84 评论 0，#24 仅 2026-10-15 旧评论。各 PR head 可见 workflow：#24 action_required，#80/#81 success，#82/#83/#84 failure，未见新增 CI 结果；这些不是当前向导 SHA 的 CI。main 仍为 `25056ed6c28f2c46f3cef957e8828a1226b7c667`。
- issues: 重要 #37/#38/#39/#40/#41/#46 仍 open，最后更新时间均早于本轮，未见新状态/阻塞。
- platform_status: Chromium/WebKit 为桌面浏览器移动视口模拟；iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb 未做真机验收。没有证据证明正式部署。
- need_user_decision: 无新增必须决定事项；保持未经用户授权不创建正式 PR、不合并 main、不部署、不接触正式数据库。

## P0 · 安全与旧宿舍隔离

- **本轮无新 P0。** 真实 diff 没有修改后端、成员身份、历史、通知或旧宿舍迁移。旧宿舍隔离与权限依赖前几轮实现及既有测试，不能仅因本轮未改服务端就推断全链路已验证。
- **验收门禁**：发布前以隔离数据库重跑新旧宿舍权限、轮序、代做、撤销、历史与推送副作用；预览必须继续使用正式 ChoreBoard/ChoreBottomNav 组件和沙箱数据，真实网络业务写入为零。

## P1 · 剩余发布阻塞与完整路径

1. **四项 Web 回归依旧失败（未修复，非新问题）**：`check-screen-gesture-check.mjs` 的 opacity 断言；`check-settings-save-lifecycle.mjs` 与 `check-navigation-components.mjs` 的 `memberNames.css` 测试打包导入；`check-scheduled-reminders.mjs` 旧迁移 `/guest/create` 返回 500。**执行**：分项确定真实根因、最小修复并保存原始日志，不删断言、不为过测试改无关正式 UI；随后完整重跑 `npm run web:verify`，给出通过/失败数量。若暂不授权跨范围修复，保留独立阻塞，不宣称全绿。
2. **创建/预览/教程完整链路尚未真机和真实认证验收**：从邮箱认证、新宿舍创建、五步草稿、球球 Tips、进度滑块跳转和反向释放、三种完成节奏及时间滚轮、页面编排、全屏正式组件预览、导航重排，到创建后首次教程/跳过/重看/返回。**验收**：浏览器端使用真实正式组件树、合成身份和网络/存储审计；验证无真实打卡/通知/账号写入；旧宿舍不自动迁移或触发首次 v2 教程。提供路径视频和真实结果，不用单独 mock 页面替代。
3. **交接落后业务 HEAD**：Codex 需在后续确有新业务改动时，将 `CODEX_HANDOFF.md` 的 `code_sha` 更新为实际 HEAD 完整 SHA，准确报告差异与测试。不要将 914f748 视为本次已评审，也不要仅因文档变化无限循环。

## P2 · 本轮改动与细节

1. **ResizeObserver 回退监听生命周期：源码修复已确认。** `observeElementSize()` 优先观察器并返回 `disconnect()`，否则绑定 `window.resize` 并返回同一 callback 的 `removeEventListener()`；`CreationProgress.vue` 的 `onBeforeUnmount` 调用 disposer。新增 helper 测试有注册、触发、卸载清理断言。**补强验收**：如后续遇到实际兼容问题，再在真实 Vue 组件挂载环境中模拟无 ResizeObserver，确认卸载无遗留监听；不要为测试而全局破坏其他组件的浏览器 API。
2. **球球规则页 Tips 去重：源码确认**从“选择适合宿舍的方式，之后也能修改”改为“之后可调整”，三种规则选择及底层数据未变；对应断言存在。检查屏幕阅读器提示、快速步骤切换和减少动态效果模式，确保标题与 Tips 不冲突。
3. **持续未验收视觉项**：黑白粗轨道/清透小滑块、球球连续转场、任务切换、正式页面复用、中文圆润姓名字体、旧绿色像素标识清除、Bottom Sheet 连续背景；以真实截图/录屏与 USER_REQUIREMENTS 逐项核对。iPhone/Android/HarmonyOS 无真机则明确未验证。

## 下一轮 Codex 交接

优先处理四项 Web 回归阻塞或明确登记独立阻塞，再完成真实认证、全屏正式组件预览和新手教程的端到端验收；针对后续 HEAD `914f748462b0cd7161e23b63afad9e38669279d9` 及之后的新业务提交，请先准确更新 CODEX_HANDOFF 的 code_sha，下一轮再做独立审查。继续仅在原开发分支提交代码；未经用户授权不创建/合并 PR、不部署、不接触正式数据库。
