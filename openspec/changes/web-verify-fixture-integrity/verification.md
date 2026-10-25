# 验证记录

实施前的独立复现：

- `check-screen-gesture-check.mjs` 因测试只移动 7px、组件有效拖动阈值为 10px 而失败。
- `check-emotion-integration.mjs` 的 Vue stub 缺少源码导入的 `watch`。
- `check-settings-save-lifecycle.mjs` 与 `check-navigation-components.mjs` 的 esbuild stub 未处理成员姓名 CSS 副作用导入。
- `check-scheduled-reminders.mjs` 在真实旧版迁移脚本中，用当前 API 播种时缺少 `dorm_configurations`，对应 `/guest/create` 返回 500；该表属于后续迁移，数据播种兼容表必须在升级前删除。

修改后的测试结果：

- 五个目标脚本分别通过：`check-screen-gesture-check.mjs`、`check-emotion-integration.mjs`、`check-settings-save-lifecycle.mjs`、`check-navigation-components.mjs`、`check-scheduled-reminders.mjs`。
- `check-scheduled-reminders.mjs`：11/11 用例、192 项断言通过。旧版库由 SQL 直接播种，之后执行完整剩余迁移；旧任务、用户/宿舍、会话、提醒及推送任务记录保持一致，新增任务字段为 `NULL`，外键、WAL 与 SQLite 完整性检查通过。
- `npm run web:verify`：退出码 0；前端、Worker、邮件运行模块构建通过，完整 Web 验证清单全部通过。构建保留既有 GuestHome 大于 500KB 的 chunk 提示；测试输出的 SMTP 失败事件来自隔离注入场景，不代表真实邮件已发送。
- `npm run spec:validate`：19/19 通过。
- `git diff --check`：通过。
- 后续用户授权的日历订阅迁移夹具修复单独登记在 `scope.json`，不包含运行时代码或正式数据库操作。

## 用户授权的日历订阅迁移夹具修复

- `node site/scripts/check-calendar-subscription.mjs`：10/10 用例、1069 项断言通过。迁移用例先构造旧版 0007 数据库，再关闭并通过正式 `openDatabase()` 跑完剩余迁移，然后才调用当前 Worker；关闭并重开文件数据库后验证既有记录与订阅凭证持久性。
- `npm run web:verify`：退出码 0，前端、Worker、运行模块构建与完整 Web 验证清单全部通过；保留既有 `GuestHome` 大 chunk 警告。隔离 SMTP 错误事件为注入测试输出，不代表真实邮件投递。
- `npm run spec:validate`：19/19 通过。
- `npm run spec:check`：通过；包含 OpenSpec 严格校验、当前批次范围检查及 18 项范围门禁测试。

限制：自动化夹具验证不等于 WebKit/iOS、Android WebView 或 HarmonyOS ArkWeb 真机验收；本变更没有运行时产品代码差异。

## 用户另行授权的两个浏览器检查

- `scripts/check-task-detail.mjs`：断言详情不渲染旧成员标记，且负责人行只包含姓名与任务状态，避免旧图标移除后留下空位；没有修改产品展示代码。
- `scripts/check-ios-chat-motion.mjs`：键盘紧凑布局中返回按钮有意隐藏且不可交互，检查改用真实 Escape 关闭路径；之后恢复模拟的 Visual Viewport，验证面板完成收起及共享球球返回。
- Chromium：任务详情 14/14；聊天动效 19/19，通过且无运行时错误。
- WebKit：任务详情 14/14；聊天动效 19/19，通过且无运行时错误。聊天历史锚点模拟键盘前后均为 y=242；Chromium 帧间隔 p95=9.1ms、最大16.7ms，WebKit p95=18ms、最大34ms，WebKit 有1个采样间隔超过32ms。
- `npm run web:verify`：退出码0，完整 Web 构建和回归清单通过。
- `npm run spec:check`：通过；严格 OpenSpec 19/19、范围登记386项文件以及18项范围门禁检查通过。
- `node --check scripts/check-task-detail.mjs`、`node --check scripts/check-ios-chat-motion.mjs`、`git diff --check`：通过。

限制：以上是桌面 Chromium/WebKit 自动化模拟，不等于 iPhone、Android WebView 或 HarmonyOS ArkWeb 真机验收；没有修改运行时产品代码。

## 用户授权的两项 CI 时序检查

- `check-chat-motion-continuity.mjs`：退场采样改为逐帧观察实际承担退场状态的 `.chat-dock-note`，并等待卡片卸载；减少动态效果时按系统设置允许无动画关闭。
- `check-companion-browser.mjs`：单击球球后等待聊天进入 `open`、快捷语可见且留言操作已启用，再断言统一留言入口存在且没有重复输入框。
- 两项脚本在桌面 Chromium 上各连续通过两次：聊天连续性 23 项检查；Companion 浏览器检查 29 项检查。
- `npm run web:verify`：退出码 0，前端、Worker、邮件运行模块构建及完整 Web 回归清单通过。
- `npm run spec:check`：退出码 0，OpenSpec 严格校验 19/19、范围门禁 18/18 通过。
- `node --check`（两项脚本）、`git diff --check`：通过。

限制：自动化运行使用本机 Node v26.4.0 与 Chromium；未验证 CI Node v22 运行结果前，不声称其环境已通过。未连接 iPhone、Android 或 HarmonyOS 真机。本轮没有修改任何运行时产品代码。
