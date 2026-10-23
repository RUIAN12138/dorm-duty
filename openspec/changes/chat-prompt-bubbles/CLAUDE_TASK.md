# 1. 背景
阅读本change全部规划、项目AGENTS、动效约定。用户要求单行随机快捷语、<=20 Unicode字素自然拆泡、新消息逐条显现。仅隔离测试，不正式PR/推送/合并/发布。本task已明确要求实现，不用openspec-propose规划暂停流程。
# 2. 当前仓库状态判断
独立分支codex/chat-prompt-bubbles基于b345652，运行代码干净，事前规划已写。CompanionChat数组items为前端暂态；后端/数据库保存原始turn，禁止修改。现有quickPrompts仅3条，wrap。send API返回多条messages按140ms循环，load flatMap。多个本地note/welcome/action也push assistant，均需统一展示投影。chatScroll已经尊重用户历史阅读，复用，别重写。ChatReplyText目前Array.from按2码点分span会拆坏emoji。
# 3. 本轮目标
保持现有外观与键盘/业务，仅单行问题采样和lossless显示层/queue。新回复150–250ms逐段，历史立即呈现不重播。
# 4. 修改范围
只能写frontend/src/components/CompanionChat.vue、ChatReplyText.vue、新frontend/src/interaction/chatQuickPrompts.ts、chatReplyText.ts、新frontend/src/composables/useChatReplyPresentation.ts。测试/文档由Codex负责。不得写其他源码/样式、锁文件或依赖。
# 5. 禁止事项
禁止子代理、commit/push/PR/deploy/生产访问、密钥、后端/schema/原生代码修改、布局重设计、移除旧动效、全局手势/滚动重写、新依赖。不要跑浏览器/Vite回归，避免与我的夹具冲突。可以typecheck/build。
# 6. 具体任务
A pure chatQuickPrompts：导出原有三条问题库，提供pickQuickPrompts(width,previous,random=Math.random)；<420选2否则3，有限shuffle并avoid上次有序组合，坏random不能死循环。CompanionChat用ref选择每次完整新入口show()一次，反向重开不更换；入口内稳定、滚动归左；我要留言首项保留现有状态机。CSS row44px nowrap/overflow-x auto/scrollbar hidden/buttons flex-shrink0 white-space nowrap不动原胶囊边框/玻璃/反馈；宽度上下行不跳，内层不截按压高光。
B pure chatReplyText：graphemes(text)原生Intl.Segmenter('zh',{granularity:'grapheme'})；本地无新依赖fallback保护emojiZWJ/flags/modifier/VS/combining。splitReplyText(text,limit20)：exact chunks.join('')===text不trim不normalize；短句保持，超长优先句号问叹后逗分顿，再Intl中文word短语边界，最后字素兜底。句尾引号/括号标点跟前，尽量避免单纯标点泡。支持splitReplyMessages(parts)保留已返回原文，并仅同一turn里重接未结束20码点硬切段，别将自然独立短句乱合并。不能恢复server已截掉原文，别动服务器。返回确定性段序号，历史和新返回一致。
C 建议useChatReplyPresentation(sourceItems)只管理展示，原始items/原始API仍完整（可给assistant UI item增加parts并按同一turn完整返回聚合，以免逐chunk重分段改变已显示泡）；返回displayedItems/flush/reset。投影id=原id+segment index且首段尽量保留原id。user整条立即，fresh=false历史全部立即；fresh assistant队列第一条立即/后150+字素*5ms最多250，保持原顺序、不重复。rawsource更改时可过滤seenID显示，用户新消息不被延迟；不要排队触发API。关闭/隐藏/减动效flush终态；清空/identity reset撤销旧timer和seen，不能晚到复活；dispose清理。loading隐藏历史仍旧，初始pin不受影响。段追加调用既有bottom()（isPinned已处理），不要scrollIntoView/强制pin。整组新回复只改变必要节点，不重播旧bubble动画。
D CompanionChat整合所有assistant来源（API/load/welcome/notes/act），只展示层拆分。API仍只发送一次，reminder/note动作仍只执行一次。使每组连续片段约6px、其他12px，保留原气泡motion；可以class follow-up margin-top:-6px（不动画margin）。历史源内容/草稿保持。正确处理close/reverse/clear/identity和快速新请求。ChatReplyText字素分span，保留原渐清参数不改别处。
# 7. 验收标准
输入完整示例应4自然短句；每泡<=20字素、所有字符往返一致，emoji/组合音标完整，无孤立可避免标点；每入口2/3不同有序组合、留言首位、单行可横滑、44px稳定；旧history不动画，源/存储不被篡改/重复；replyqueue1条条150–250，历史滚动不被抢；清空关闭身份取消/减动效正确；输入法紧凑和留言提醒原业务保留。
# 8. 完成后输出
修改文件、Unicode与排队策略/范围，实际typecheck/build命令结果，未验证项。不要写测试/文档，禁止正式操作。结果写stdout（父进程存data/chat-prompt-bubbles/claude.log）。
