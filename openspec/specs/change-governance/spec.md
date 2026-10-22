# Change Governance

## Purpose
用可审查的需求、明确修改边界、分层验证证据和独立的用户验收记录约束轮到项目的开发过程，防止需求扩张、交互回归以及将本地测试通过误认成生产发布授权。

## Requirements
### Requirement: Scope preservation
开发者 MUST 在修改前回查当前需求、项目约定和已验收交互，写明目标、非目标及文件范围；不得以关联优化为由改动未授权功能。
#### Scenario: New request overrides one earlier behavior
- **WHEN** 用户明确更改某个入口或效果
- **THEN** 仅对应旧行为被覆盖，其余已有配色、布局和交互仍被保留
#### Scenario: A change needs another subsystem
- **WHEN** 实现需要修改范围清单外的业务、身份、数据或通知逻辑
- **THEN** 先说明必要性并取得授权，再更新规范和范围

### Requirement: Acceptance is separate from implementation
开发者 MUST 区分实现、自动测试、模拟器、实体设备、用户验收与正式操作授权。未验收的隔离预览默认不得创建正式 PR、推送或合并 main；用户明确要求提交当前版本PR时，可使用独立、绑定当前摘要的PR授权，仅推送开发分支并创建PR，不代表产品验收或main合并授权。发布同样须取得独立、绑定当前版本的人类授权，不能由测试通过推断。
#### Scenario: Tests pass but user has not accepted
- **WHEN** 所有自动测试通过但没有用户明确验收当前版本的记录
- **THEN** 状态仍为待用户验收，没有独立PR授权时PR门禁失败；没有独立发布授权时发布门禁同样失败，正式站点和数据保持不变
#### Scenario: Evidence has a limited platform
- **WHEN** 只做了桌面 WebKit 或模拟器测试
- **THEN** 报告明确标明范围，不能称为实体手机通知、输入法或帧率验收

### Requirement: Interaction evidence
交互动效修改 MUST 验证真实页面的中间状态、反向或中断、失败恢复和减少动态效果，不能仅凭构建成功或最终文案宣称完成。
#### Scenario: An animation is removed to pass a check
- **WHEN** 测试要求的中间帧消失而最终文案正确
- **THEN** 验收仍失败，保留原功能并修复连续性

### Requirement: Explicit publication for review
用户明确要求部署供查看时，发布门禁 SHALL 仅允许绑定当前差异摘要的发布授权，不将其当作完整产品验收或PR/推送/main合并授权。
#### Scenario: Publish current preview without declaring device acceptance
- **WHEN** 用户明确要求“部署到网站看看”且记录对应版本的发布授权
- **THEN** 可备份并发布当前版本，验收仍pending，未完成的原生Safari/iPhone测试明确保留，PR门禁继续关闭
#### Scenario: Content changes after authorization
- **WHEN** 发布授权记录的内容摘要与当前差异不一致
- **THEN** 发布门禁拒绝，不自动复用旧指令发布其他内容

### Requirement: Explicit pull request for review
用户明确要求提交当前版本PR时，PR门禁 SHALL 只允许绑定当前差异摘要的prAuthorization，不将其当作产品验收、生产发布或main合并授权。
#### Scenario: Submit current preview for review
- **WHEN** 用户明确要求“提交 pr”，记录非空用户原话和匹配当前摘要的create-for-review授权
- **THEN** 可推送当前开发分支并创建正式PR，验收仍pending，没有独立发布授权时不得发布，不得自行合并main
#### Scenario: Content or action differs
- **WHEN** 摘要不符、用户原话为空，或只有另一种操作的授权
- **THEN** 当前操作门禁仍拒绝，不能复用旧授权
