## Purpose
在保留原有黑白视觉和聊天输入布局的基础上，让聊天底部与顶部具有一致、无硬边的渐进毛玻璃衔接，并让用户感知连续催促点击的强弱变化，同时不增加通知发送频率或影响输入操作。
## ADDED Requirements
### Requirement: Bottom chat frost
聊天底部 SHALL 具备与顶部一致的渐进毛玻璃效果，平滑衔接输入区域且不阻挡编辑或发送。
#### Scenario: Input and viewport changes
- **WHEN** 用户打开聊天、编辑文字或视口高度变化
- **THEN** 底部毛玻璃跟随现有聊天区域，保留输入栏位置与操作，记录可滚动到无遮挡区域；消息真实延伸至输入层和安全区后方并轻微模糊透出
#### Scenario: Reduced transparency
- **WHEN** 系统要求降低透明效果
- **THEN** 底部使用实色兜底，保留所有输入和返回功能

#### Scenario: Theme and keyboard continuity
- **WHEN** 切换浅深主题、聊天滚动或者键盘压缩视口
- **THEN** 输入层和安全区保持同一半透明毛玻璃，文字与发送图标清晰，不能切为纯色遮罩

### Requirement: Frequency driven ripple size
催促涟漪 SHALL 随点击密度由小到大、有上限地扩散；停顿后平滑衰减，实际通知继续遵守已有频控。
#### Scenario: Rapid burst and pause
- **WHEN** 用户快速连点再停顿
- **THEN** 每次涟漪范围递增至上限，后续停顿点击恢复较小范围，不能无限叠加或增加通知请求
#### Scenario: Reduced motion
- **WHEN** 用户启用减少动态效果
- **THEN** 清除装饰动画，催促功能继续可用
