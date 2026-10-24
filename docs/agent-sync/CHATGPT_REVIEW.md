# ChatGPT → Codex · 聚光定位、通知抽屉与 vivo Android 会话恢复评审（2026-10-24）

- reviewed_code_sha: `e0f7141897cc2f012e3647e96b6ce6ce7dc2a069`
- reviewed_branch: `codex/new-dorm-wizard-preview`
- code_url: https://github.com/RUIAN12138/dorm-duty/commit/e0f7141897cc2f012e3647e96b6ce6ce7dc2a069
- previous_reviewed_code_sha: `10a820e0cf5a6274964113ce2a0086fc3bbea5b3`
- diff: https://github.com/RUIAN12138/dorm-duty/compare/10a820e0cf5a6274964113ce2a0086fc3bbea5b3...e0f7141897cc2f012e3647e96b6ce6ce7dc2a069
- assessment: **有效新业务提交，已独立检查真实 diff。** 开发分支 HEAD 与 handoff 完整 SHA 一致；相对上轮仅前进 1 个业务提交、12 个变更文件。新版任务设置改为复用 `CreationProgress` 无数字玻璃进度；`SpotlightTour` 加入相对模态宿主的缩放坐标换算、visualViewport/ResizeObserver/transitionend 更新与明确的焦点返回；浏览器回归新增通知抽屉各关闭路径及聚光目标几何检查。未见本轮修改旧宿舍后端权限、SQLite、成员与轮序。**不能把新增测试代码等同于独立测试通过。** 本轮 `web:verify` 报告有 **5 个**失败（上轮 4 个，新增 `check-emotion-integration.mjs` 的 Vue stub 缺 `watch`）；Android vivo App 退出后重登是用户新增真实反馈，尚未定位根因。
- review_method: GitHub 连接器读取最新 PROTOCOL、USER_REQUIREMENTS、CODEX_HANDOFF、CHATGPT_REVIEW；核实业务分支 HEAD、提交父 SHA、compare 的 12 文件真实 patches；查看 `SpotlightTour.vue`、`DormWizard.vue`、`CreationProgress.vue`、`ChoreBoard.vue` 和两份新增浏览器测试的实际断言。额外核查 `native/android/.../MainActivity.java`、`frontend/src/interaction/persistentSession.ts`、`frontend/src/stores/session.ts`、`frontend/src/views/GuestHome.vue`、`frontend/src/api/email.ts`、`site/local/email-runtime.mjs` 的登录恢复链。核对全部 74 PR 的状态、六个开放 PR 的 review submissions、review threads、普通评论与 head Actions；检查 main 与重要 Issues。**未在本环境独立运行 Node/Playwright、CI 或真机测试，未访问生产服务/数据库。**
- handoff_freshness: `code_branch=codex/new-dorm-wizard-preview`，`code_sha=e0f7141897cc2f012e3647e96b6ce6ce7dc2a069` 均有效，且与远端分支 HEAD 相同；文档提交不是业务代码。
- CI: 当前业务 SHA 的 Commit Status `statuses=[]`、Check Runs 0、PR-triggered workflow runs 0；**没有可确认的 GitHub CI 通过记录**。Codex 自述 Chromium/WebKit 向导专项各 158 项、聊天专项 67/65 项、构建及 spec 检查通过，均未独立复跑。Codex 明确报告完整 `npm run web:verify` 退出码 1、五项失败，不能宣布全绿。
- PR/main: 共 74 PR，开放 #24/#80/#81/#82/#83/#84，历史 68 个均 merged、无仅关闭未合并；开放 PR 无 review submission、review thread 或新增评论（#24 仅 2026-10-15 旧评论）；head Actions 分别 #24 action_required、#80/#81 success、#82/#83/#84 failure，均非本业务 SHA 的 CI。main HEAD `25056ed6c28f2c46f3cef957e8828a1226b7c667` 未变。不能把开放 PR 当作已合并或已上线。
- issues: #37/#38/#39/#40/#41/#46 仍 open，更新时间不晚于 2026-10-16；无新增状态或评论。Android 真机验收仍对应 #39。
- platform_status: 桌面 Chromium/WebKit 的模拟视口/模拟键盘及桥接返回不等于 iPhone Safari/PWA、Android WebView（尤其 vivo 机型）、HarmonyOS ArkWeb 真机验收；真实邮箱认证、Cookie 持久化、系统键盘与通知、部署均未在本轮验证。
- need_user_decision: 暂无必须立即决定的产品范围；vivo 问题若需复现，可由用户/舍友在自愿前提下提供 **设备型号、系统版本、APK 版本、退出方式、重登间隔和脱敏现象**，不要收集账号密码、验证码、Cookie、Token 或正式宿舍数据。

## P0 · 旧宿舍隔离与预览安全

- 本次 diff 不涉及后端鉴权、数据库迁移、旧宿舍任务或成员模型；未见新 P0。此前的全屏预览仍应保持正式组件复用 + 沙箱草稿，不把本轮专项 UI 检查当作真实数据写入零副作用证明。
- **验收**：在隔离数据环境回归旧宿舍身份/轮序/历史/通知不变；对正式组件全屏预览拦截网络，完成、撤销、催促、通知与导航重排后，真实业务写请求和真实推送均为 0；仅保存沙箱草稿。

## P1 · 下一步建议与验收

### P1-A · 完整 Web 回归 5 项失败，新增测试夹具问题需独立分诊

- Codex 这轮实际报告：`check-screen-gesture-check.mjs` 的 7px/10px 不匹配；`check-emotion-integration.mjs` Vue stub 缺 `watch`（上轮未报告的新失败）；`check-settings-save-lifecycle.mjs` 与 `check-navigation-components.mjs` 的 `memberNames.css` 解析失败；`check-scheduled-reminders.mjs` 的旧 `/guest/create` 500（期望 201）。其中夹具报错不能未经核查就认定为产品故障；旧 API 500 需区分测试契约、迁移与真实回归。
- **验收**：在隔离环境重跑 `npm run web:verify`，保留五项原始失败日志和最小复现，逐项判定是夹具还是产品问题；仅经授权小范围修复，不删断言、不放宽阈值掩盖问题；最终完整套件退出码 0 并提供日志/CI 链接，或者明确剩余阻塞。

### P1-B · vivo Android App 退出后需要重新登录：用户真实反馈，根因未证实

- **独立源码事实**：Android `MainActivity` 使用固定 HTTPS Origin、`setDomStorageEnabled(true)` 和 CookieManager，并在 `onPause` flush Cookie；`persistentSession.ts` 保存/恢复本地 token；但 `GuestHome.bootEntry()` 仍首先调用 `refreshEmailAccount()`，通过 `/email/me` 的 HttpOnly Cookie 恢复邮箱账号，再调用 `/email/enter` 进入宿舍。服务端邮件会话 Cookie 及对应记录默认 30 天。**仅有 localStorage token 并不能证明邮箱会话 Cookie 仍有效**；WebView 数据清理、Cookie 丢失、身份被服务器拒绝、网络失败被 UI 表现为重登，或设备安装版本落后，均待分辨。不要把“vivo 会清理”当作已查明原因。
- **排查/验收**：先确认舍友 APK 版本与部署页面版本；使用独立测试邮箱和测试宿舍，在 vivo 真机执行正常返回退出、任务管理器划掉、系统强制停止、重启手机、断网后恢复，每种场景重复 3 次并记录间隔。分别记录启动时 **Cookie 是否存在（只记录布尔值）**、本地 token 是否存在（布尔值）、`/email/me` 与 `/email/enter` 的 HTTP 状态、是否因临时网络错误进入重登 UI、是否触发显式 logout；禁止输出 Cookie/token 内容。会话未过期且未主动退出时，应在冷启动恢复原成员身份且不再输入邮箱验证码；网络暂时失败应可重试而不误清凭据；主动退出后不得静默恢复。必要时只在开发分支做最小修复，旧宿舍数据不迁移、不重置。
- **风险**：不能通过延长无上限 token 有效期、明文日志或跳过服务端验证“解决”重登；保持安全退出与 30 天会话策略。Android 模拟器通过不等于 vivo 真机通过。

### P1-C · 聚光引导与通知关闭专项已有更强断言，但仍需实机与交互覆盖

- `SpotlightTour.vue` 使用 host rect/offsetWidth 比例换算，监听 visualViewport 与目标尺寸，针对缩放宿主、320/390/430/横屏、模拟键盘、前后步骤、缺失目标和焦点返回有实际测试断言；这是针对上一轮坐标风险的**可核查源码改进**，不是运行实测结论。通知子页测试现在覆盖返回上一层、系统返回、显式关闭、遮罩和重开，仍未断言快速连点/关闭回调恰好一次或 vivo/iOS 真实返回手势。
- **验收**：Chromium/WebKit 专项独立复跑并保存结果；再在真实 iOS Safari、Android WebView、HarmonyOS ArkWeb 观察聚光框各边误差 ≤8px、说明卡始终可见可点、键盘/横竖屏/快速切换不漂移，通知抽屉完成退出后无残留遮罩、无重复关闭或误触。

## P2 · 可访问性、任务与动画残余

1. `SpotlightTour` 标记 `role=dialog aria-modal=true`，但源码未见显式焦点圈定或初始聚焦；新增“模拟键盘”测试甚至主动聚焦背景任务输入框。需补 Tab/Shift+Tab、Esc、屏幕阅读器测试，确保模态引导期间背景不可误操作，结束后焦点回到正确的触发按钮；不要因为遮罩视觉正确就宣称键盘可访问性完成。
2. 新版任务设置复用 `CreationProgress`，并提供“任务配置进度”可访问名称；继续验证真实触控滑块、轻震降级、球球 Tips 随步骤变化及任务切换不会丢草稿，旧宿舍设置页未变化。
3. 全屏正式组件预览的长按导航重排、iOS 玻璃色散/回弹、球球跨页连续入场、中文姓名字体、旧绿色像素标识和 Bottom Sheet 底部延伸，仍需脱敏真机截图/录屏；本轮 diff 未直接解决这些事项。

## 下一轮 Codex 交接

按优先级先复现并定位用户反馈的 vivo 冷启动重登，处理完整 Web 回归 5 项失败，再补聚光/通知真机验收；仅在授权范围做小步改动。继续使用原 `codex/new-dorm-wizard-preview` 分支，提交并 push 新业务 SHA 后由 Codex 更新 `CODEX_HANDOFF.md`；ChatGPT 不修改该文件，不因本次评审提交、纯文档更新或重复 CI 结果循环评审。未经用户批准不得创建/合并 PR、部署或访问正式数据库。
