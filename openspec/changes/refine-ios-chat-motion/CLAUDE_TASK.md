# Claude Code执行任务书：iOS质感聊天动效（只做本地）

## 1. 背景
用户最新要求Native质感：Direct Manipulation / Spatial Continuity / Interruptible Motion / Spring-Based Motion；只优化球球聊天及入口。之前44d41de已有聊天基础/玻璃/日历预览，不得回退或改其他页面。不要只调长时间或叠加特效。
## 2. 当前仓库状态判断
工作目录/Users/apple/project/dorm-duty-interaction-preview，分支codex/ios-chat-motion，基线44d41de。新OpenSpec文件是Codex创建的，勿覆盖。不访问原始主检出dorm-duty或服务器。无运行时依赖新增。默认Claude模型和配置保持。
## 3. 本轮目标
实现tasks.md第1节的三项，只改下列源码。测试与文档、OpenSpec进度由Codex独立执行。重点真正的反向位置/速度连续及原生滚动，不需要重写整页。
## 4. 修改范围
仅允许：frontend/src/components/CompanionChat.vue、CompanionChatComposer.vue、ConversationNoteFlow.vue、DormCompanion.vue；frontend/src/interaction/chatMotion.ts、chatScroll.ts、chatTravel.ts（可新建）；必要时新建frontend/src/components/ChatMessageBubble.vue。不可改ChoreBoard/Calendar/任何其他页/全局motion.ts/manifest/依赖/密钥/配置。先读取AGENTS.md、docs/FRONTEND_MOTION_CONTRACT.md最后一节及本change所有规范。
## 5. 禁止事项
不运行git commit/push/PR/ssh/scp/部署；不修改API、数据库、身份或发送逻辑，不读任何.env/凭据/私密配置；不得使用Task/Agent/派生代理。不得改变外观尺寸、字体、位置、配色、渐进玻璃的blur/mask参数、语音或业务。不删除已有长按、双击、返回手势、草稿、历史、表情连续、失败重试、IME保护。不能动测试以掩盖失败。只用现有Motion/Vue/Reka。
## 6. 具体任务
A. chatTravel.ts（或等价小型局部控制器）：使用持久MotionValue+Motion物理spring stiffness/damping/mass，三个可见几何通道x/y/width（或正确的transform+速度）及opacity阶段；反向时读取并传入当前速度，不能只读当前transform然后重置速度。取消应结清旧Promise为cancelled，旧回调不关闭新UI。销毁/隐藏/减动效收尾。测量仅在mount、viewport/端点变化，不要每帧多次getBoundingClientRect（现returnFlight就是问题）。可以缓存基准几何、把全局视觉中心映射为transform。键盘收起期间只在visualViewport事件更新端点/基准，以保持回程与实际源球一致。
B. CompanionChat接入：首次press后立即响应，不等API；已有预测性双击取消逻辑保留。show/hide可反向；关闭中仍可见的.chat-ball允许点击重新展开（只在closing时截获，open时互动仍交给DormCompanion）。背景与4层顶部玻璃、toolbar/nameplate/history/footer协调，入场短交错重叠，回程同一路径；不要关闭中重复销毁重建球球。phase与motionEpoch防迟到。键盘回落完成才交还源球，别冻结表情。保留草稿和原DOM缓存。
C. chatScroll替换自定义积分器：使用浏览器scrollTo({behavior:'smooth'})进行近底部的程序跟随，不接管用户惯性；touch/wheel中断smooth（原地scrollTo auto）并暂停跟随，scroll事件更新nearBottom。追加/卡片变高/键盘变化在rAF或nextTick合并，不每帧读scrollHeight。支持capture/restore可见消息锚点或等价逻辑，读取历史时布局变化不跳。现有pin/request/scroll/interrupt/stop调用要兼容，避免send强制pin把正在读历史的人拉下去。错误/取消保留业务。
D. chatMotion统一局部物理参数（不要改全局）：按压90-150ms、消息180-260ms、卡片250-360ms、主体展开280-420ms/退出240-360ms作为主要可见目标，弹簧尾部时间如实说明。确保stiffness/damping/mass或等效参数统一管理。入口按钮只能在chat意图使用轻微按压反馈，不叠加其他按钮既有运动；发送按压与回弹，用户bubble来自输入区附近，回复方向稍区别；不重播已有历史气泡，layout projection不要与另一transform驱动争抢。同样布局用transform/opacity，不动画width/height/top/left；textarea原本自适应高度是布局保持而非动画，不要改成单行。
E. 卡片已有稳定motion.section和AnimatePresence内层，保留外壳与防重/失败；必要时补上相邻列表布局投影以连贯衔接，但不破坏原生滚动或文字可读。

## 7. 验收标准
npm run typecheck --prefix frontend通过；只改规定源码。说明如何保留当前速度、如何取消旧完成回调、为何不劫持原生滚动、几何读取次数。说明实际执行与未执行项，不声称实机/全平台通过。
Codex之后会跑Chromium/WebKit中间帧、反向/重开、草稿、双击、卡片/发送/失败、原生滚动中断、键盘视口模拟、玻璃与其他页回归、长任务/帧时间。
## 8. 完成后需要输出
只在最终回复汇总：修改文件和要点；测试命令及真实结果；已知风险/未验证；需要Codex重点审查的地方。不要提交、发布、再派代理或请求用户验收。代码写完即退出，由Codex接手。
