# Design
复用 NudgePane 现有球球提示、learned 标志、单一 spring 和 currentStatus 区域；已学会后不再播放横向 discovery 动画。根据当前任务状态提供准确提示，不增常驻按钮。催促请求成功后显示对象和任务；429 不当作成功，409 提醒安排已变化并沿用刷新，网络失败保留原任务。预览/游客必须明确未真实发送。
CompactRecordList 通过可选空状态 slot 接收 ChoreCalendar 的轻量操作；ChoreCalendar 依据已加载的上一月记录决定是否显示查看上月，向 ChoreBoard 发出 tasks 事件走现有 section-change 导航。不请求额外数据、不假定所有历史不存在。按钮最小44px触区、轻微按压、减少动态效果兼容。姓名长文本自然换行，不改变主视觉尺寸。
新增就近隔离浏览器回归，使用 createHarness 临时 SQLite，覆盖真实接口回执和失败、旧通知限流、空状态导航、窄屏、暗色和减少动态效果。只更新直接对应的 check-water-nudge 限流返回值断言，增加旧成功回执不能掩盖新限流和重载测试；其他既有测试只运行不修改。不新增依赖。

关联修复：waterNudge.ts 原先将429吞并成recent，本轮区分limited与recent，保留60秒冷却；冷却内无成功回执时不声称成功。
