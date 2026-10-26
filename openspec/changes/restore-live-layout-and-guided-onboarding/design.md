## Context

现有 WelcomeGuide 是四页说明；SpotlightTour 是说明性模态层，背景 inert，不能用来教学真实点击。本轮保留创建向导的独立聚光灯，增加操作式教程，避免改变其模态语义。

## Decisions

1. 先用合成数据复现布局；恢复组件固有布局时仅调整 ScreenStage 的正式页面承载方式，不改任务按钮、导航材质、字体或业务。
2. 教程采用专属练习环境，复用 ChoreBoard、ChoreCalendar、CompanionChat、ConversationNoteFlow。通过显式注入的内存适配器处理完成、撤销、催促、留言及已读；无适配器时现有正式代码路径不变。
3. 引导层只放行当前目标与教程控制器，依据真实可见状态确认操作成功，失败不推进。章节可重练、跳过；返回保持原路由和身份。
4. 复用现有 motion tokens、完成动画和共享球球过渡。聚光区域随目标、滚动和视口变化更新，减少动态效果时直接终态。
5. 预览、测试与真实设备证据分别报告。新功能不自动发布，也不复用 v82 发布授权。

## Resources

已读取 FRONTEND_MOTION_CONTRACT、OpenSpec 工作流、frontend-design、emil-design-eng，以及本机 React Bits README。全局指定的 KnowledgeBase、awesome-design-md、math-curve-loaders 路径当前缺失；本轮复用项目现有 Vue/Motion 组件，不复制 React 组件或引入加载动画依赖。

## Risks / Rollback

注入只允许在 preview=true 的教程作用域生效；普通草稿预览继续禁止写入。布局承载层与教程入口分离，均可局部回退。测试拦截所有 fetch/XHR，检查步骤动作结果、目标命中、焦点、窄屏、明暗、减动效和退出后清理。
