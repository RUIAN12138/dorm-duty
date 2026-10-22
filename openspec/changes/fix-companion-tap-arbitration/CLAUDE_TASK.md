# Claude Code任务书（小范围实现，Codex独立回归）
## 1. 背景
最新用户要求单/双击互斥、聊天首帧即时底部定位、指定三个外链系统打开、指定局部视觉精修。保留原黑白布局。当前完整需求在本change的proposal/design/spec/tasks。必须先读项目AGENTS和动效契约末尾。
## 2. 当前仓库状态判断
目录/Users/apple/project/dorm-duty-interaction-preview，codex/fix-companion-tap-arbitration基于6a1e47e。OpenSpec由Codex预先创建，勿覆盖。已有v73已发布，此轮是新代码。data/tap-arbitration/baseline-*.jsonl真实触摸复现：原位置双击回程却已请求state，第二击追随移动球会保留聊天。现代码只以源位置36px判定，preview即load，480ms判定。后续测试Codex编写。
## 3. 本轮目标
完成小步源码实现后立即退出让Codex审查。不要改测试或文档/规范/依赖，不提交。不要派生代理或使用Task/Agent。
## 4. 修改范围
只允许：frontend/src/interaction/companionTap.ts,chatScroll.ts,openExternalUrl.ts(新),tokens.css；frontend/src/components/DormCompanion.vue,ChoreBoard.vue,CompanionChat.vue,CompanionChatComposer.vue,ConversationNoteFlow.vue,CompanionSettings.vue,ChoreMenu.vue,ChatReplyText.vue(新)；frontend/src/theme.css；native/android/app/src/main/java/cn/lundao/dorm/MainActivity.java；native/harmony/entry/src/main/ets/pages/Index.ets。
## 5. 禁止事项
不改全局主题切换实现/其他页动效/打卡/日历/导航/业务/API。不开PR/不push/不commit/不ssh/不部署/不操作真实数据。不读取.env/密钥/凭据。不重写聊天，不改变尺寸位置文字或URL，不增加第三方依赖。不伪造SSE流式接口，现API整组短句返回，只优化新增文字呈现。不要把未知“本兮”映射成其他链接；目前源码只发现CompanionSettings球球GitHub和license、ChoreMenu项目GitHub，没有本兮。若仍找不到明确报告。
## 6. 具体任务
A. tap仲裁：统一controller管理280ms双击窗口，第一击立即preview，中间允许second pointer-down保留到release。DormCompanion document capture在predictingChat时识别原点36px或当前.chat-ball .dorm-companion命中作为同一个球，后者映射至第一tap坐标，第二击不落给聊天球或返回键。合成click抑制用实际二击坐标且只抑制其click，避免pointerup后重新触发。长按380ms/18px取消、键盘/其他play意图保留。double转回现有play随机袋，不恢复文字。不要改engine、共享spring或CSS布局。判断要由controller结果决定，过期窗口不能拦截正常聊天点击。
B. 视觉preview与commit：DormCompanion新增chatPreview/chatCommit事件（原chat保留给长按/键盘和外部reply已确认入口），ChoreBoard chatCommitted控制prop传CompanionChat；preview open=falsecommit，单击确定后commit=true，rollback取消。chat UI立即弹簧展开，load/send/welcome等请求或留言流程只在committed后执行。可选prop默认true保护其他使用方。modal反向重开/close中断保持，不因晚到commit重新打开已关闭页。
C. 首帧history：CompanionChat show时historyReady=false，缓存items fresh=false，nextTick之后使用新chatScroll.positionInitial()同步instant flush，历史就绪前只在历史区域显示已有骨架，ball/input/玻璃先展开。冷load回执后nextTick即时定位再historyReady=true；每次重开都即时pin底部，缓存加载失败也展示保留历史与错误，不能永远隐藏。history初始定位期间observer保持instant，定位ready后新消息smooth。用nextTick/ResizeObserver/font ready而不是固定定时器。scrollTo behavior auto在CSSsmooth时会仍smooth，所以initial临时设scrollBehavior=auto并直接scrollTop，恢复；字体/键盘变化保留近底/阅读锚点。不要把整页等到API返回才弹出，防止和快响应冲突。
D. openExternalUrl：HTTPS协议/host/userinfo校验（拒绝非HTTPS），独立封装，只绑定现有CompanionSettings两链接与若用户所谓本兮未找到则不碰无关ChoreMenu项目链接。license相对原路径resolve到当前origin，不改地址。Web主动click同步window.open(...,_blank,noopener,noreferrer)，失败toast后提供复制按钮/确认操作，复制成功2.5s重复重计时；不要仅显示错误无复制。原生复用现安全消息port新增openExternal命令+url，Android在UI线程startActivity ACTION_VIEW CATEGORY_BROWSABLE，Harmony使用context.openLink HTTPS（错误返回、不得WebView回退）。nativePush.ts原封装不要改，用独立port? 避免覆写同一个onmessage破坏push：推荐现端口在JS openExternal监听addEventListener若原生端口不支持可用独立桥，或通过独立DormExternalUrl JS接口/port安全注入；不得不改nativePush.ts请先标记必要，停止该子项等Codex处理。不得全局改shouldOverride所有链接，范围只指定来源。
E. 局部视觉：聊天bubble/留言卡/设置抽屉约1-3%相对明度tokens，保留尺寸字体层级与现玻璃边缘。只在现设置容器添加局部class变量，不全局重写。暗色正文/标题/数字分别极微调前景与字重，不统一削细。input focus双层shadow保留focus-visible。新增ChatReplyText仅对fresh assistant文本逐字/小组blur(2px)->0+opacity错峰，最多约360-450ms队列，长回复分组或封顶延迟，历史instant，reducedmotion零动画；不要重排/重播整bubble。数字排版在日历、轮次、统计、倒计时具体已有selector仅font-variant-numeric:tabular-nums，不调整大小/色彩/动效。中文overflow-wrap/line-break避免孤字但不能word-break:keep-all导致溢出。保留原navigation弹簧和完成动画，不另加driver。
## 7. 验收标准
运行npm run typecheck --prefix frontend。自行审查src diff只有范围内容；不改测试绕过。UI frame=最新history不先顶后smooth；double无state请求，single有一次请求；原有长按/键盘及play保持。Native编译由Codex进一步做。不能称实机已通过。
## 8. 完成后输出
修改文件、架构与关键判断、实际命令结果、未完成事项、需Codex重点审查处。不要超过本轮scope，写完源码即结束，不持续跑全套长测试。

## 用户随后补充（已确认）
“本兮”就是设置里的「项目源码 · GitHub」，ChoreMenu repository-link要接同一openExternalUrl，不改现URL/文案/图标/位置。
