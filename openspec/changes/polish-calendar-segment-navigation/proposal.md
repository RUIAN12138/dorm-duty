## Why
用户要求日历/列表/卡片切换器连续跟手、实时选中，切回日历必须有完整入场。只调整该局部交互，不改变视觉或业务。
## What Changes
- 日历专用实时scrub模式，沿用ElasticSegments与selection弹簧。
- 方向锁定、纵向边界取消、松手吸附、抑制合成点击；快速跨项直接选择目标。
- 三视图按需首次挂载并保留，300ms淡入/8px位移/0.98弹性缩放，与离开态衔接；缓存不闪骨架。
- 隐藏卡片暂停自动切换，月份、选中、滚动和缓存保持。
## Capabilities
### New Capabilities
- `calendar-segment-navigation`: 日历模式手势及入场连续性。
## Impact
只修改scope.json列出的日历与分段器必要接线、测试文档。与聊天改动分开记录。仅隔离预览，禁止PR、合并、生产发布。iPhone未连接，真机不声称完成。
