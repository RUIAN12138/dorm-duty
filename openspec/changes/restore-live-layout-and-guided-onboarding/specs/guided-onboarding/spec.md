## ADDED Requirements

### Requirement: Action-based tutorial
教程 SHALL 高亮真实组件中的当前操作，等待对应操作及状态成功后才推进，而不是仅点击下一步浏览说明。
#### Scenario: Complete and undo a practice task
- **WHEN** 用户在练习中点击完成，再次点击已完成
- **THEN** 真实完成控件依次执行完成与撤销反馈，练习日历相应更新，正式宿舍记录不变
#### Scenario: Learn conversation notes
- **WHEN** 用户选择我要留言、收件人、内容并确认
- **THEN** 使用现有留言状态机，确认前不发送，成功后在练习中展示结果，不向任何真实成员发送消息
#### Scenario: Skip or leave a lesson
- **WHEN** 用户跳过章节、返回或结束教程
- **THEN** 控制器移除事件与遮罩，恢复原页面和焦点，不改变身份或正式数据

### Requirement: Isolated effects
教程 MUST 在数据服务层隔离练习副作用，不以只隐藏按钮代替隔离。
#### Scenario: Exercise all actions
- **WHEN** 用户完成、撤销、催促、留言、查看记录或标记已读
- **THEN** 所有响应由练习内存适配器提供，不发生业务 fetch/XHR、通知或 AI 调用
#### Scenario: Regular preview without tutorial adapter
- **WHEN** 用户在创建向导的普通预览中操作
- **THEN** 原有零业务请求限制和提示继续生效，不能访问教程的可变状态

### Requirement: Original production layout
正式页面 SHALL 使用原组件的尺寸、排列和导航布局，不因固定屏幕容器和额外安全区重复压缩。
#### Scenario: Standalone and browser viewports
- **WHEN** 使用普通手机、短屏、横屏及主屏幕模式的可用视口
- **THEN** 原有标题、任务切换、完成按钮及轮次完整显示，导航靠近底部安全区，原有业务与动画保持不变
