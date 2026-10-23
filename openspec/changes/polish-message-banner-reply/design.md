## Context
已有400ms长按、VisualViewport、LiquidGlassSurface、useReminderInbox持久重试，不重写业务API。
## Decisions
手势idle/pressing/expanding/replying/collapsing明确，长按触发后同pointer后续move/up不关闭、不合成点击。拖动意图阈值提高至10px。回复内容持续挂载，以网格受控高度连续展开，交互层留完整padding；玻璃单独裁切。使用未变形offsetHeight布局，内容resize跟随时不反复重启spring。明确关闭消息发dismiss(close)，取消/遮罩/Esc保持未读。背景单一6px模糊层。
## Boundaries
不改球球/日历/轮次/主题/通知规则。ChoreBoard只加close原因的读回执。独立Sites静态预览复用实际Vue组件，fetch模拟仅位于独立测试入口，常规Vite入口不导入。
## Before / After
| Before | After | Why |
| --- | --- | --- |
| 3px取消长按、触发后仍拖动 | 10px意图锁定、长按后消耗同手势 | 减少误触退出 |
| 变形尺寸反复重启定位 | 原始布局高度、内容变化直接跟随 | 键盘与面板连续 |
| 取消与关闭语义不清 | 单列关闭消息并同步对应id | 不误标新消息 |
## Risks
桌面WebKit不等于iPhone键盘；无真机不宣称通过。Sites使用隔离合成数据、保留已有访问策略。
