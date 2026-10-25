## 实现与回归
- [x] 修复四个前端测试夹具的环境不匹配，保留原有断言意图。
- [x] 修复迁移用例的旧版 fixture 初始化，不改变迁移前后数据比较。
- [x] 修复日历订阅迁移夹具：先由 `openDatabase()` 完成 0007 到当前版本的升级，再使用当前 Worker 验证重启与订阅凭证持久性。
- [x] 按用户单独授权，修正 `check-task-detail.mjs` 的旧成员标记断言与 `check-ios-chat-motion.mjs` 的键盘紧凑态关闭操作；不改产品组件。
- [x] 按用户单独授权，修正聊天退场帧与快捷留言测试的异步状态检查；不改产品组件。
- [x] 按用户单独授权，修正聊天滚动路径与暗色骨架样式的 CI 断言；不改产品组件。
- [x] 按用户单独授权，修正 `check-ios-chat-motion.mjs` 的稳定帧率空间跳变断言与 `check-focus-compact.mjs` 的内联任务图标断言；不改产品代码。
- [x] 按用户单独授权，修正 `check-conversation-preview.mjs` 的确认按钮可达性断言与 `check-order-boundaries.mjs` 的旧成员标记断言；不改产品代码。
- [x] 按用户单独授权，修正 `check-entry-layout.mjs` 的旧成员标记断言；只验证成员姓名、名次与状态布局，不改产品代码。
- [x] 重跑五个目标脚本和完整 `npm run web:verify`，记录退出结果。
- [x] 记录未覆盖的平台与 CI 限制。

## 独立验收
- [ ] 等待用户审查当前变更；本变更不授权 PR、合并或部署。
