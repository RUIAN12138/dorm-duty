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
- `npm run spec:scope`：被工作树中独立的用户本地修改 `site/runtime/email-runtime.cjs` 阻断；该文件不属于本变更且未读取、修改、暂存或提交。本变更所需代码路径均在本变更的显式范围中。

限制：自动化夹具验证不等于 WebKit/iOS、Android WebView 或 HarmonyOS ArkWeb 真机验收；本变更没有运行时产品代码差异。
