# 1. 背景
严格读取AGENTS、动效契约、本change proposal/design/spec/tasks/scope；用户当前需求为消息弹窗长按直接快捷回复和已读语义，最新「完成后更新 pr 和网站」授权通过测试后正式操作，但你只做实现不提交。v77紧凑聊天已发布，勿修改聊天/手势/其他布局。
# 2. 当前仓库状态判断
分支codex/banner-quick-reply，基于382bcf8，干净运行源码+本change事前文档。ReminderBanner现有550ms长按emit reply，ChoreBoard关闭banner打开聊天；已有POST /chores/notes和PATCH /chores/reminders/:id/read/received。received是送达而不是已读，不能改原通知/邮件策略。useReminderInbox已有确认后回写，但失败只有提示、全局busy可吞操作。useReminderBanner排队/去重/settled。
# 3. 本轮目标
400ms同一卡片展开回复；真实键盘联动、模糊遮罩和背景滚动锁；固定真实发送者；成功回执后收起并读原id；失败草稿/未读保持；手动阈值上滑读，超时/短滑/遮罩/取消不读；读失败可重试且其他设备服务器状态可同步。
# 4. 修改范围
仅可写frontend/src/components/ReminderBanner.vue、ChoreBoard.vue、frontend/src/composables/useReminderBanner.ts、useReminderInbox.ts、useBannerQuickReply.ts（可新建）、frontend/src/interaction/bannerReplyLayout.ts（可新建）。不得写测试/文档/ReleaseNotice（由我负责）。不要新依赖。复用既有VisualViewport控制器或相同纯合帧方案，但不修改chatViewport/chatTravel/聊天页面。
# 5. 禁止事项
禁止子代理、commit/push/PR/merge/deploy、正式服务器/数据/邮件推送、密钥、.env。禁止大改ChoreBoard（只局部消息接线）/其他页面；不改通知规则、限流/广播规则、不新增AI后端、不用scrollIntoView或固定超时假装键盘同步。不移除现有flight/swipe/玻璃光学/球球交互。
# 6. 具体任务
A. 新useBannerQuickReply（推荐）：状态idle/editing/sending/failed；open(note)捕获原id、当前token/invite/member和合法sender；必须验证sender_id为本宿舍非本人有效成员、scheduled/null/已移出成员不可回复。广播note有有效sender可仅回复发送者，不能群发。draft/error/busy响应式。send复用POST /chores/notes，payload target_member_id+text（1–120码点），同步sending锁防重复。HTTP成功才events.sent(originalId)和markRead，失败保留草稿。发送后无二次确认（发送按钮本身明确主动动作）。旧身份/关闭重开旧成功不能关闭新面板或读新消息；可仍安全读原id仅当前身份同一时。输入法composing按Enter不发送。身份/卸载清理回调。
B. ReminderBanner保持note.id keyed section和同一.card DOM。长按400ms（3px移动取消保持原阈值或适当容差）进入reply edit，不导航chat；emit reply可改带id。保留capture手势，长按后的真实pointerup同步focus已挂载textarea（timer内nextTick先尝试focus，iOS限制要有真实松手补聚焦），防合成click触发详情。不要在longTimer内cancelGesture丢失pointerup。输入/发送区域不触发上滑/长按；header区域可按原阈值手动上滑关闭并读原id。系统消息长按只提示不支持、保持未读，不偷偷进入chat或创建收件人。
C. props/事件清晰连接父级reply state/draft/busy/error；可把reply controller由父级拥有或异步submit函数，避免Vue emit不能await的陷阱。发送状态可视，成功回执后才消失，失败显示重试不改read。幕布点击/escape取消只收回reply、保持未读；如果直接收整张banner也不read。原始click打开详情按原规则。
D. 同一卡片椭圆→圆角面板连续增高，轻微边缘伸展和输入渐显；单一可逆高度/layout驱动，不重挂整个卡片。展开背景用半透明模糊遮罩，锁背景滚动并恢复原样式和scrollY（考虑其他modal锁，别清除别人锁）。FocusScope/键盘焦点可达，返回恢复焦点。低动态/低透明降级。viewport.resize/scroll用一个rAF合帧，实际top/height来自VisualViewport，不双重补偿。键盘出现时面板位于其上方约10px，可跟手自然移动、可视区域内不越界；idle长按向下延展原位置，键盘中必要时移至底边。背景页面位置不变，无其他页面布局改动。RO测量/尺寸状态单一所有者，避免无限nextTick。
E. 自动6.5秒超时在reply active/sending期间暂停，取消后按原逻辑恢复。展开期间新消息不能替换当前note；队列held ID或等效锁；源active note被其他设备读后不要读别人的消息/新发送目标。所有dismiss/open/reply/send回调携带固定id，绝不在await后读取当前active.value当原消息。
F. useReminderInbox扩展pending banner read intent队列（只存id+invite/member身份键，不存token/私密内容）。read(id,true)全局busy也不能吞意图；成功后才receipt/read_at更新，失败保留可重试。提供retryPending，由ChoreBoard成功轮询后/online/focus等合理触发；不要无限立即重试，不要读队列失败busywatch形成风暴。可持久化localStorage当前身份id列表以跨刷新重试；退出/身份变化停止旧token请求，换身份不可串读。原read(id,false)消息详情规则保持，原测试公共接口兼容。对已确认重复read返回true而不发HTTP。只接受服务端非空合法read_at，不能伪造客户端时间当确认。server GET board每次有reminders可把跨设备read_at带回，保持reconcile单调。
G. Parent local wiring替换replyBannerMessage不再openChat，原chatNoteRequest别的入口继续保留。quick-reply sending不可用全局busy把自身bannerblocked掉。读失败提示“已读状态稍后同步”等真实状态。received接口只作为原送达确认不动。自动timeout只dismiss无read，主动swipe id读；快捷回复完成读原id；遮罩取消不读。所有流程epoch隔离。
H. 可运行frontend typecheck/build和formatter，但不要启动浏览器/Vite并发回归；我单独编写/运行测试。别运行旧browser用例后为通过去恢复旧长按跳chat逻辑，那个断言已被新需求覆盖。
# 7. 验收标准
同一卡片DOM和noteid长按400ms展开、完整中间帧、松手焦点输入、键盘10px、背景scrollY稳定；发送失败保持输入和未读，成功一次HTTP后读原id；6次点击最多1send；读失败pending且恢复能提交；超时/取消/短滑不读，主动阈值上滑读；连续消息与身份/关闭重开竞态不串，scheduled不可回复；明暗/横竖屏/减动效；不破坏已有chat、banner flight/sheet。
# 8. 完成后输出
修改文件、事件契约/状态所有权、已读队列触发与存储边界、键盘focus策略、实际运行命令结果、未验证项。不要创建PR/提交；日志外部保存data/banner-reply/claude.log。
