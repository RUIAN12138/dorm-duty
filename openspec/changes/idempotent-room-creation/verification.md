# Verification

- `node site/scripts/check-room-creation-idempotency.mjs`：隔离 SQLite 中 5 个并发请求只创建一个宿舍；相同请求重放、内容冲突、不同账号、撤销权限、会话过期和敏感信息不落库均通过。
- `node site/scripts/check-room-creation-restart.mjs`：隔离文件数据库执行正式迁移，旧宿舍七表快照不变；进程数据库重开后同一请求恢复到同一宿舍。
- `node scripts/check-dorm-wizard.mjs`：108 项通过；`node site/scripts/check-dynamic-task-migration.mjs`：4 项检查、7 表保留；云后端测试 1316 项断言通过。
- `npm run build`（frontend）通过；构建提示向导代码块超过 500 kB。
- `scripts/check-creation-retry-browser.mjs`：Chromium 和 WebKit 中以实际向导提交，模拟服务端已创建但网络响应丢失；用户重试使用同一请求标识并取得邀请码，隔离数据库中仅生成一个宿舍。
- 多份草稿交错时确认其中一份不会清除其他待确认请求。
- `DORM_RELOAD=1` 下 Chromium 和 WebKit 验证响应丢失后刷新，登录会话恢复到已创建的宿舍，无第二次创建；此验证没有证明所有未提交草稿的刷新恢复。
- 完整向导浏览器测试在自定义任务分页断言处失败；旧断言查找已不存在的 `.creation-task-picks` 元素，等待面板退场结束仍失败。独立测试确认当前 UI 可新增第五个任务、分页查看且原四项保留；尚未完成全量回归。
- Cloudflare D1 实际并发以及实体设备仍未验收；未访问正式数据库、未发布。
- 若设备禁止本地存储，请求标识只能在当前页面内复用，页面关闭后不能保证避免重复创建。
- 向导保持打开时切换邮箱：Chromium 和 WebKit 分别验证服务端会话变化与客户端状态先变化两种路径；均提示重开向导、重复点击不创建宿舍、原账号草稿保留，新账号重开不会读取原草稿。
- 不同邮箱正常切换后再重开向导：Chromium 和 WebKit 测试草稿隔离、回切恢复通过。
