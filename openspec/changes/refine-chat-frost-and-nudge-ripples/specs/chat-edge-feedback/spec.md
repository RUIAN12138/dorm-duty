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

### Requirement: Edge weighted input glass
输入区 SHALL 保持内容真实透出并形成连续的上方过渡、核心输入与底部安全区玻璃；核心相对清晰，上方柔边与屏幕底边逐步加强模糊，不出现实色色块或硬边。
#### Scenario: Scroll behind all three zones
- **WHEN** 聊天记录从输入区上方滚动至输入框和安全区后方
- **THEN** 背景轮廓持续透出，边缘模糊强于核心，输入文字及发送按钮不受滤镜影响
#### Scenario: Keyboard and theme transition
- **WHEN** 键盘视口变化或深浅主题切换
- **THEN** 玻璃分布跟随实际输入高度与安全区保持连续，原位置与按压/入场反馈不变
#### Scenario: Transparency disabled
- **WHEN** 系统启用减少透明效果
- **THEN** 所有新增玻璃滤镜关闭，以可读实色兜底，不丢失输入与发送功能

### Requirement: Frequency driven ripple size
催促涟漪 SHALL 随点击密度由小到大、有上限地扩散；停顿后平滑衰减，实际通知继续遵守已有频控。
#### Scenario: Rapid burst and pause
- **WHEN** 用户快速连点再停顿
- **THEN** 每次涟漪范围递增至上限，后续停顿点击恢复较小范围，不能无限叠加或增加通知请求
#### Scenario: Reduced motion
- **WHEN** 用户启用减少动态效果
- **THEN** 清除装饰动画，催促功能继续可用
