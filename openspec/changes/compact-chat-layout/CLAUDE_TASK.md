# 1. 背景
用户要求仅聊天布局修复，保留玻璃/表情/业务。当前分支codex/compact-chat-layout，基线be34b73，独立合成预览8092。读AGENTS/动效契约/OpenSpec本change全文件。最新键盘紧凑头部要求覆盖v76固定头部旧规则。
# 2. 当前仓库状态判断
工作区只有本change事前文档。data/compact-chat/baseline.json真实浏览器测到：闲置球球88px top48，历史padding-top192；留言由历史列表插入，footer突然110→66px；420px键盘时球球仍88，留言top130与头部重叠，消息区不足。单一chatViewport已存在，不重写为另一套监听。
# 3. 本轮目标
键盘连续布局不抽搐；按遮挡进度压缩头部到约70%、返回淡隐、名字缩小；留言和建议与输入统一容器自然可逆；每次进入快捷语展开，首项“我要留言”，原三项顺序保留；锚点稳定。
# 4. 修改范围
只准写frontend/src/components/CompanionChat.vue、CompanionChatComposer.vue、ConversationNoteFlow.vue、frontend/src/interaction/chatLayout.ts（可新建）、chatScroll.ts、chatViewport.ts。不要修改测试/其他文件/规范，本轮我独立写测试。无须把所有允许文件都改。不要新依赖。
# 5. 禁止事项
禁止子代理、git commit/push/PR/merge/deploy；禁止访问正式服务器/数据、密钥；禁止改球球手势、chatTravel算法、视觉配色/玻璃素材、后端原生配置、其他页面。不得删旧功能或把未跑验收写成通过。不要全文件重排样式，不用固定setTimeout等待键盘。
# 6. 具体任务
- 阅读现有chatViewport/chatScroll/chatTravel/ConversationNoteFlow/useConversationNotes；追查高度+RO+bottom重叠触发和readonly focus的浏览器滚动影响。
- 复用单一viewport状态，增加一个布局协调入口/纯推导状态，合帧viewport、footer、note、suggestion变更；根height/top跟随系统，不额外bottom过渡。header进度建议inset/180夹紧，平滑随真实系统帧，不在110px阈值骤切。正常88px，满键盘约61.6px，紧凑已有短屏不变大。chatTravel独占外ball transform，内层负责紧凑scale，测量返回须正确。低动态直接终态。
- 压缩头部/nameplate/frost/历史padding同步，返回内部按钮淡出且不可聚焦，避免与paintReveal抢opacity。键盘未动保留原布局。自适应方向/缩放与提前blur原测试语义保留。
- 面板和composer放共同footer/dock中，建议/留言单个可中断尺寸动画所有者，内容超高局部滚动，留至少可见历史和输入，短屏不可挡控件。不要AnimatePresence退出占位和Motion layout和CSS尺寸动画三套并行。内部修改对象/内容依然连续，数据不重建，确认/取消/失败/防重逻辑不改。
- 原quickPrompts只一份源，前置留言action（不是send普通AI），移除重复独立留言按钮。每次show重置“允许显示建议”状态；键盘压缩自然隐藏，收起在没有note工作流时恢复；点其他prompt可收起，不要每条消息重弹。
- Composer测高不能先改变可见textarea高度为26再复原；必要隐藏测量或保持同步无可见中间帧，读写合并；保留现有首次点击不强制弹键盘/草稿/IME保护。
- 锚点在layout动画每次尺寸变化时稳定，nearBottom跟随和历史不抢滚动；防多个bottom request与settle相互覆盖，保留entry instant及真正新消息smooth。不使用scrollIntoView。
- 运行frontend的类型/构建检查可以；不要并行启动Vite测试以免cache碰撞，正式自动测试我负责。
# 7. 验收标准
连续844→830→810→790→700→560→420→336，单一跟手根，footer外边10px；球球从88逐步缩到65–75%、顶部腾出消息空间，返回渐隐，恢复可逆。留言按start/choose/input/edit/cancel快速切换，不reset历史/滚动；键盘候选栏/早blur/重开/深浅/减动效稳定。每次进入有4条prompt第一我要留言且无AI副作用。所有测试使用合成数据。
# 8. 完成后输出
精确修改文件及原因，单一布局所有权与锚点策略，已运行命令和真实结果，未验证硬件/风险；不要自行提交。日志由外部保存data/compact-chat/claude.log。
