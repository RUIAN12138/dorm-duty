## Decisions
复用 DormCompanion 与既有聚光层。单一可取消推进任务由当前 step、完成状态与全局 Dialog 暂停状态驱动；Vue DOM 更新及动画完成后推进，不用固定延时。切换、退出、暂停使旧任务失效，防重复跳步。

讲解默认上方安全区；目标位于顶部时向下或侧向避让。只移动讲解，不移动正式页面。减少动态效果时即时终态。既有球球保持原有交互。

## Resources
已读取 frontend-design、emil-design-eng、前端动效契约、OpenSpec 工作流和 React Bits README。KnowledgeBase 索引及 awesome-design-md、math-curve-loaders 配置路径不可用；不新增依赖。

## Verification
Chromium/WebKit 四章自动推进、无操作不推进、全局弹窗暂停与恢复、快速退出重进、零请求、320/390/430 宽度、暗色减动效、截图录屏。实体设备未测需单独标注。
