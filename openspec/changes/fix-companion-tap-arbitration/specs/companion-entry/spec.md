## ADDED Requirements
### Requirement: Exclusive optimistic tap arbitration
球球 SHALL 首击立即预测展开，280ms窗口内第二击只触发表情并逆向恢复，不发起聊天请求；兼容当前位置与源位置轻微漂移。
#### Scenario: Double during travel
- **WHEN** 用户在展开期间双击原球区域或移动中的共享球球
- **THEN** 单击被取消，仅一次随机表情，无聊天残留或重复请求。
#### Scenario: Single and interruption
- **WHEN** 用户单击、长按、移动取消或键盘激活
- **THEN** 单击视觉立即反馈且确认后读取；其余手势保持既有功能并不重复处理合成点击。
### Requirement: Initial history positioning
聊天 SHALL 每次打开在历史显示前即时定位底部，缓存历史不重播动画，不使用smooth或固定延迟掩盖初始定位。
#### Scenario: Long cached history
- **WHEN** 长历史关闭后重开或冷加载完成
- **THEN** 首个可见历史帧为最新消息；随后新消息仅在近底部平滑跟随，阅读历史不跳动。
### Requirement: Safe external navigation
指定外链 SHALL 保留原URL和样式，只允许HTTPS；Web新标签、安装端系统浏览器打开，失败提供复制。
#### Scenario: Unsupported or failed native open
- **WHEN** 用户主动点击且原生打开失败
- **THEN** 不在当前WebView加载，显示可复制原链接的操作。
### Requirement: Scoped visual continuity
指定气泡、确认卡与设置 SHALL 保持现有布局，以微色阶、暗色文字补偿及新增文字渐清改善层级，动态数字用等宽数字；减少动态效果不运行渐清。
#### Scenario: New and historical replies
- **WHEN** 新回复出现或历史重开
- **THEN** 仅新增回复渐清、长文本动画有界；历史直接显示，保留原有消息和业务动效。

### Requirement: Moving target touch tolerance
共享球 SHALL 在第二击仍处于280ms窗口时，对当前可见球体边界提供36px触摸容差，允许坐标采样到输入送达间的运动偏移，且不扩大到整个聊天区域。
#### Scenario: Sampled point falls just behind the moving ball
- **WHEN** 第二击在有效窗口内到达，坐标比当前球体边缘略偏后但仍在36px内
- **THEN** 仍逆向回程并只播放表情，不读取聊天；超出窗口或容差不拦截普通聊天操作。
