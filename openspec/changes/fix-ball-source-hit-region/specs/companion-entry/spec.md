## ADDED Requirements
### Requirement: Whole source ball remains a double-tap target
球球 SHALL 在既有280ms窗口内将原球体实际可点击矩形作为有效第二击区域，即使第一击与第二击相距超过36px，也只互动一次且逆向关闭预测聊天，不发聊天请求。
#### Scenario: Opposite edges within original ball
- **WHEN** 两次触摸落在原52px球体相反边缘且第二次down在窗口内
- **THEN** 仅触发随机表情，聊天回程，无延迟重开或聊天API请求。
#### Scenario: Expired or unrelated second press
- **WHEN** 二击超时或位置既不在源球也不在现有移动容差内
- **THEN** 不截获正常聊天操作，既有单击与长按行为保持。
#### Scenario: Drag interrupts second tap
- **WHEN** 第二次触摸移动超过既有拖动阈值或被取消
- **THEN** 不把该拖动作为表情双击，保持取消路径。
