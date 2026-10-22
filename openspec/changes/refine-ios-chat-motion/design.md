## Context
CompanionChat现有show/hide分开创建定时spring，读取当前transform但未携带速度；returnFlight每帧重复测量多次几何。chatScroll以自定义物理积分逐帧写scrollTop，与本轮“原生惯性”要求冲突。消息有基础方向入场，卡片已有稳定外壳与layout投影，草稿在父层，顶部四层6/10/18/26与底部玻璃已验证，不重做。
## Goals / Non-Goals
目标：位置/速度连续、反向可取消、原生滚动不争抢、近底部与锚点、发送链有来源感、长任务可见。非目标：Swift原生、改配色/布局/业务、增加语音、改日历、无关重构、发布。
## Decisions
1. 独立聊天控制器使用Motion持久MotionValue或等效物理spring，保存x/y/scale和阶段progress；新target从当前位置及速度开始。只在挂载/viewport变化/目标变化测量基准和端点，帧绘制只写transform/opacity；有明确取消/完成/卸载语义，旧动画不能回调关闭新页面。
2. 中途关闭可反向；返回中的共享球球可再点击重开，不能靠键盘或改业务开关才能恢复。单击/双击预测和表情状态继续，入口按压只在聊天意图内，不叠加其他页面控件动画。
3. 原生scrollTo(smooth)只用于非手势近底部追加，触摸/滚轮取消程序滚动并尊重用户位置。键盘与确认卡布局读取只在变化事件/ResizeObserver，不每帧读scrollHeight；读历史保留可见消息锚点，跟随者保底部距离，已发送草稿/重试规则不变。
4. 统一局部物理参数，按压90–150ms、消息180–260ms、卡片250–360ms、主体展开280–420ms、收起240–360ms作为目标，不伪造固定settle时间。按压/回复节奏短且不阻塞接口。
5. 确认卡继续layout projection；内部与邻消息协调，不销毁整个卡片，不动画height。保留原渐进背景模糊，不每帧改blur半径。reduced-motion/键盘/后台直接终态。
## References
Apple HIG Motion（https://developer.apple.com/design/human-interface-guidelines/motion），WWDC23 Animate with springs（https://developer.apple.com/videos/play/wwdc2023/10158/），本机React Bits AnimatedContent仅借鉴方向/清理语义；保留Vue/Motion/Reka，不新增React/GSAP。awesome-design-md/math-curve-loaders/知识库索引缺失。
## Risks / Validation
WebKit截图blur独立校准不支持；只记录光学未验，不弱化应用检查。iPhone实机未连接；Android此前预览壳ANR未定因，不能追认为通过。本轮记录独立测试和Performance Timeline，阈值只是本机，保留失败和局限。
## Rollback
本地commit44d41de可回退本轮精确文件；不涉及生产和数据库。Claude实现、Codex独立审查/验收，未经用户验收不PR/合并/部署。
