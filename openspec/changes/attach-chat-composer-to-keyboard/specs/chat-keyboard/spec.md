## ADDED Requirements
### Requirement: Keyboard-attached composer
聊天输入区 SHALL 以单一合帧VisualViewport布局状态跟随实际可视底边；键盘完全展开时间距8–12px，底部玻璃延伸至同一边缘，无额外固定时长bottom动画。
#### Scenario: Continuous keyboard and candidate bar
- **WHEN** 可视height/offsetTop随键盘与候选栏连续变化
- **THEN** 输入区与玻璃同步移动，最终10px间距，球球与顶部相对可视顶边保持稳定。
#### Scenario: Blur before keyboard dismissal completes
- **WHEN** 输入框先失焦而可视区域尚未恢复
- **THEN** 继续跟随实际键盘边缘，恢复后准确返回原布局，不提前跳回idle间距。
### Requirement: Preserve native history reading
键盘布局 SHALL 保留既有近底跟随与历史阅读锚点，不调用首次定位，不重播历史入场，不重复挂载聊天。
#### Scenario: Reader and follower
- **WHEN** 阅读历史或停在底部时键盘开合
- **THEN** 分别保留可见消息位置或最新消息可见，正常新回复行为不变。
### Requirement: Scoped fallback and evidence
实现 SHALL 保留原单击双击、共享球球、玻璃与草稿，合帧监听可清理；无VisualViewport及resize型WebView有fallback，模拟与真机验收分开记录。
#### Scenario: Missing device
- **WHEN** 无实体iPhone连接
- **THEN** 提供隔离预览与真实模拟结果，真机键盘验收保持待完成，不以测试通过代替验收。
