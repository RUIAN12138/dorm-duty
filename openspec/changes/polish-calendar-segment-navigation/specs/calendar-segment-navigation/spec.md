## ADDED Requirements
### Requirement: Continuous segmented selection
日历模式切换器 SHALL 在横向意图确认后实时跟随指针，并同步选择最近选项。点击与键盘仍可使用，其他分段器不改变默认行为。
#### Scenario: Drag and release
- **WHEN** 手指在切换器内从日历拖向卡片并松开
- **THEN** 指示器经过连续位置、内容实时切换、松手弹簧吸附目标，无额外中间页面排队。
#### Scenario: Cancel vertical or out of bounds
- **WHEN** 手势以纵向为主或离开切换器上下24px
- **THEN** 不劫持滚动，恢复起始选择，合成点击不误切页。
### Requirement: Persistent views with complete motion
三个视图 SHALL 保留已访问实例、数据及状态，切换用一致的局部弹性入退场。
#### Scenario: Cached calendar return
- **WHEN** 从列表或卡片切回日历
- **THEN** 日历有260至340ms渐显、6至10px位移及0.97至0.99起始缩放，月份/选中不变、无重复骨架。
#### Scenario: Rapid reverse or reduced motion
- **WHEN** 用户快速反向切换或启用系统减动效
- **THEN** 无残影、无卡死，前者从当前姿态续接，后者直接终态，所有模式可用。
#### Scenario: Retained list and stats
- **WHEN** 列表与卡片离开后再次进入
- **THEN** 滚动、展开及当前卡片保留，隐藏卡片暂停自动播放，已加载数据不重复请求。
