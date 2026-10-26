## ADDED Requirements

### Requirement: Authenticated facts
球球 MUST 使用每次认证身份和任务快照回答明确的身份/本人任务/抬水人问题。
#### Scenario: Incorrect old assistant history
- **WHEN** 当前用户询问身份或任务，旧聊天存在他人称谓
- **THEN** 回答仍指向当前认证成员及当前状态，不把自主轮次当每日固定分工
#### Scenario: Task changes
- **WHEN** 完成、撤销或抬水交接后再问
- **THEN** 读取新快照，不复用旧问答的安排；提醒仍需既有确认

### Requirement: Stable page return and spacing
身份栏 SHALL 略下移，任务主体独立小幅上移；聊天退出 MUST 恢复背景滚动锚点。
#### Scenario: Keyboard shifts document
- **WHEN** 输入焦点改变了背景滚动后关闭聊天
- **THEN** 在锁释放后恢复原滚动位置，重开和退出不会应用过期恢复
