## ADDED Requirements

### Requirement: Automatic verified progression
教程 SHALL 在真实操作成功及必要动效收尾后自动进入下一步，不再要求继续按钮。
#### Scenario: Successful operation
- **WHEN** 当前目标操作成功
- **THEN** 自动且仅推进一步，下一目标和讲解同步更新
#### Scenario: Waiting or interrupted operation
- **WHEN** 未操作、操作失败、全局弹窗出现或退出章节
- **THEN** 不误推进；暂停结束后仅恢复当前有效步骤

### Requirement: Companion narration
球球 MUST 在上方以简短对话框讲解当前操作并避让目标。
#### Scenario: Target near top
- **WHEN** 目标接近顶部讲解区域
- **THEN** 讲解自然让位，真实目标仍可点击，球球保留轻量表情反馈
