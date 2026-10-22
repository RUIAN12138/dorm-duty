## ADDED Requirements
### Requirement: Interruptible spatial motion
聊天转场 SHALL 保持可见角色的位置与速度连续，允许未完成时反向或重定向，保留表情状态和草稿。
#### Scenario: Reverse and reopen mid-flight
- **WHEN** 展开中关闭，或收起中点击仍可见的共享球球重开
- **THEN** 从当前姿态和速度继续，旧完成回调不关闭新状态，没有重新挂载闪烁或固定起点跳转。
#### Scenario: Keyboard return and reduced motion
- **WHEN** 软键盘回落、视口变化或系统减动效切换
- **THEN** 端点跟随实际布局并保持当前视觉，减动效直接终态，未发送草稿与聊天记录保留。
### Requirement: Native scrolling and stable anchors
聊天历史 SHALL 使用浏览器原生滚动，不用自定义逐帧物理积分替代原生惯性。
#### Scenario: New messages near bottom
- **WHEN** 用户接近底部且没有手动滚动，新消息、卡片或键盘布局变化
- **THEN** 平滑跟随并保持底部锚点，输入框与消息连续，已存在的气泡不重播。
#### Scenario: Reading and touch interruption
- **WHEN** 用户阅读历史或触摸/滚轮中断程序滚动
- **THEN** 不抢位置，布局变化保持可见消息锚点，不在每个动画帧重复测量布局。
### Requirement: Coordinated message and card feedback
发送按钮、消息、留言确认卡 SHALL 使用统一的局部物理参数，保留真实发送状态、防重、失败重试和身份隔离。
#### Scenario: Send edit cancel and failure
- **WHEN** 用户发送、修改留言、取消、成功或失败
- **THEN** 按钮有克制反馈，气泡有方向/来源感，确认卡容器持续且自然展开/退出，失败保留可重试内容，不能重复发送。
### Requirement: Observable scoped performance
本轮 SHALL 保留顶部/底部渐进玻璃和其他页面，记录Performance Timeline与实际中间帧，不把桌面引擎结果称为iPhone真机体验。
#### Scenario: Isolated validation
- **WHEN** 构建与自动化完成
- **THEN** 提供隔离预览及失败/未验证记录，不创建正式PR、不合并、不发布。
