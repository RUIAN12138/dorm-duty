## Decisions
复用 Vue3、Motion、Reka 与现有 chatViewport/chatScroll。正常状态尺寸与玻璃保留。VisualViewport.height/offsetTop 为唯一几何来源；window.resize只作现有缺接口回退，不加键盘计时器。头部压缩进度来自同一遮挡量，不在110px布尔阈值突然切换。chatTravel仍独占共享元素transform，紧凑形变只作用内层且来源可测。

| Before | After | Why |
| --- | --- | --- |
| 头部只按入口短屏判定，不随键盘压缩 | 同一视口状态连续压缩到约70%，同步腾出消息空间 | 最新需求覆盖旧固定头部规则 |
| 留言位于历史列表，入口按钮突然移除 | 留言/建议/输入框共享稳定容器，统一尺寸变化与锚点恢复 | 减少独立布局驱动 |
| 快捷语只在无历史时出现且留言独立 | 每次进入展开，留言固定第一项、原三项复用 | 有历史仍可直接开始留言 |
| textarea测高先归26px再恢复，并发follow | 测量不改变可见编辑框几何，布局合帧协调 | 排查焦点/高度/滚动冲突，避免二次位移 |

头部/名字/返回/历史上边距同步使用单一进度，不叠加固定bottom过渡。面板可使用可中断单一高度投影或grid轨道，只有一处拥有容器尺寸，内部不重复layout投影。内容过高时面板局部滚动，消息和输入仍可达。历史阅读锚点、初始瞬时定位、底部新消息平滑跟随语义保留。输入焦点不自动触发初始定位。减少动效直接终态。

## References
读取frontend-design、emil-design-eng、iPhone setup；React Bits AnimatedContent仅借鉴一次入场/清理，不引入React/GSAP。awesome-design-md、math-curve-loaders、KnowledgeBase路径不存在。核对MDN VisualViewport和scrollIntoView文档：不使用scrollIntoView改变祖先滚动。

## Verification and Rollback
隔离合成数据，记录连续视口帧、头部尺寸/间距、滚动锚点、快捷语和留言各状态/反向中断、明暗/减动效。浏览器模拟与实体iPhone/原生WebView分开。iPhone尚未连接，不伪造验收。回滚本change精确diff，不回退v76玻璃或双击修复。
