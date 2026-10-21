# v61 抬水队列与交互验收

本轮保留既有视觉，只修改用户指定的轮次面板、日历与列表、统计缓存、抬水临时安排、导航和球球提醒。

## 队列规则

- 当前负责人可暂时跳过，原因选填（至多 200 字），移到实际队尾；本轮仍需完成，不写完成记录。
- 非当前负责人可提前抬水，每人最多一笔待抵扣记录。当日写实际完成时间；未来轮到本人时抵扣，日历与统计不重复计数。
- 轮序保存仍按最近一次常规完成人在新顺序中找下一位；新下一位有提前抵扣时自动处理，再展示下一位。
- 同一版本并发操作只允许一笔成功。队列、完成、抵扣与交接事件在同一 CAS 事务内。
- 未抵扣的提前记录可撤销；常规打卡直接撤销会恢复关联队列和抵扣。后续已完成／已调整导致无法安全回退时返回明确冲突，保留历史修正入口。
- 跳过取消该旧任务尚未发送的推送／邮件提醒，不影响无关任务。

## 后端与迁移

`site/worker/water-flow.mjs` 集中处理队列持久化、预付抵扣及交接回执；权限与 HTTP 校验仍在现有 chores 路由。新增迁移 `0017_water_flexible_queue.sql`，只新增 flow、credits、skips 三表，不覆盖原始打卡、历史修正或邮箱账号。发布前备份，沿用版本化 release 与原子回滚流程。

球球提醒基于全宿舍各启用任务的最近有效完成时间，超过 120 小时才提醒；从未完成则参考任务开始日。只读刷新不消耗提前抵扣、不创建打卡。

## 验证入口

- `node site/scripts/check-water-flex.mjs`：隔离 SQLite，队尾、可选原因、提前记录、消费、撤销、并发、重排、外键。
- `node scripts/check-water-flex-motion.mjs`：真实 Vue / Chromium，中间帧、滚动反向、名单切换、320/390/430 宽、统计重进缓存、实际跳过／提前提交、老虎机抵扣与一次性回执。
- `DORM_BROWSER=webkit node scripts/check-water-flex-motion.mjs`：同一场景的 WebKit 渲染验收。
- 原有 `check-completion-experience`、`check-round-calendar-motion`、`check-live-calendar-notes`、`check-record-swipe`、`check-list-collapse-sync` 等继续保留，不能用新测试替代原有完成反馈。

浏览器自动化及隔离接口不等于 iPhone 真机触感、室友跨设备或推送收件验收；生产核对仅作只读检查。
