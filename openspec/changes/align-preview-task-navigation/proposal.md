# Why
用户最新要求能辨认进度节点，但不恢复大白圆；预览与正式页效果一致；抬水/第二页有多个任务时像值日页切换。
# What Changes
创建轨道加入短刻线；预览补齐正式页布局容器与相同ScreenStage模式；抽取值日页现有任务选择器供第二页复用，第二页一次展示一项，沿用任务权限与完成/催促接口。
# Capabilities
## New Capabilities
- `preview-task-navigation`: 预览容器一致与第二页任务切换。
## Modified Capabilities
无业务规则/数据结构改变。
# Impact
现有Vue组件和Motion/TaskTitle/taskSwipe；无新增依赖、不修改旧宿舍配置、不生产写入、不PR/部署。用户本轮直接授权相应正式共用展示组件的必要局部调整，覆盖旧代理建议中的前端只读范围，未扩大至其他正式模块。
