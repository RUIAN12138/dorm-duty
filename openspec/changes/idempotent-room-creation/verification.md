# Verification

- `node site/scripts/check-room-creation-idempotency.mjs`：隔离 SQLite 中 5 个并发请求只创建一个宿舍；相同请求重放、内容冲突、不同账号、撤销权限、会话过期和敏感信息不落库均通过。
- `node site/scripts/check-room-creation-restart.mjs`：隔离文件数据库执行正式迁移，旧宿舍七表快照不变；进程数据库重开后同一请求恢复到同一宿舍。
- `node scripts/check-dorm-wizard.mjs`：108 项通过；`node site/scripts/check-dynamic-task-migration.mjs`：4 项检查、7 表保留；云后端测试 1316 项断言通过。
- `npm run build`（frontend）通过；构建提示向导代码块超过 500 kB。
- 浏览器端真实断线重试、Cloudflare D1 实际并发以及实体设备仍未验收；未访问正式数据库、未发布。
- 若设备禁止本地存储，请求标识只能在当前页面内复用，页面关闭后不能保证避免重复创建。
