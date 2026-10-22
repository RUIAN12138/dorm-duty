## Context
ElasticSegments目前仅在up提交；ChoreCalendar的TabsContent默认卸载，view watcher只对日历/列表调用旧reveal，没有统一退出。
## Goals / Non-Goals
目标：跟手实时视图、缓存DOM与300ms完整过渡。非目标：改变尺寸、字体、颜色、月份轮播、列表单元格和统计卡手势。
## Decisions
1. ElasticSegments新增可选scrub开关，仅日历启用。拖动复用selection.track，中心阈值后同步model；松手selection.move；纵向意图或越出上下24px恢复来源；500ms防合成点击。
2. 视图forceMount且首次访问后保留。绝对定位在原flex内容槽中，非当前inert且隐藏；唯一Motion驱动transform/opacity，180ms退出/300ms弹性进入，快速切换中止旧驱动，以当前姿态续接。
3. 保留选中日期和当前月份；列表组件不销毁，原滚动DOM保留。统计数据首访请求维持单一pending，隐藏时暂停卡片自动播放（active可选prop默认保持旧行为）。
4. 复用现有Motion依赖和spring。reduced-motion直接终态，页面隐藏中断安全清理。无后端写入。
## Risks / Trade-offs
缓存最多三视图，增加有限DOM；隐藏视图不响应交互。必须验证祖先路由与内部横向手势独立。自动化不替代iPhone真机。
## Rollback
仅回退scope列出文件与新增测试；不操作数据库或生产。
