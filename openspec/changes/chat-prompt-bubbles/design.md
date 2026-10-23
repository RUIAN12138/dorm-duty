## Decisions
保留Vue3/Motion/当前玻璃、胶囊、输入区和键盘布局；仅聊天展示层修改。已读frontend-design、emil-design-eng及动效契约，React Bits AnimatedContent参考稳定身份/清理，不引入React或GSAP。KnowledgeBase、awesome-design-md、math-curve-loaders目录缺失。外部技术参考MDN Intl.Segmenter（https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter）与Unicode UAX29（https://unicode.org/reports/tr29/）。

| Before | After | Why |
| --- | --- | --- |
| 固定三条且flex-wrap | 固定单行44px/nowrap/原生横滚，入口随机2/3条 | 不换行、不挤动输入区域 |
| 每个返回字符串直接成为气泡 | 确定性纯文本投影，至多20字素 | 保留原文、emoji和组合字符 |
| 多处追加和固定pause | 一个展示队列只管新鲜assistant片段 | 不重复业务，不让历史重播，不抢历史阅读 |

## Prompt selection
问题库只迁移现有「今天做什么？」「怎么改轮序？」「帮我设提醒」，不新建问题内容。宽度<420px选2条，其余选3条；充分shuffle、与上次有序组合比较并有限回避重复，避免坏随机源死循环。每次完整重入重新选择，动画中反向重开维持当前选择；本次入口中不自动替换，横滚条隐藏。宽度变化不在用户按住时洗牌，下一次入口适配新宽度。

## Text projection and ownership
API返回与数据库不改，UI原始消息仍保留完整文本/parts。Unicode字素用Intl.Segmenter；旧内核缺失时仅局部轻量回退保护常见emoji/ZWJ/肤色/旗帜/组合音标，不宣称完整UAX29实现。所测Chrome/WebKit应实际确认Segmenter可用。
优先完整句，其次逗号/分号/顿号；过长句子再按中文分词/短语边界，最后字素安全兜底。每段<=20字素且join严格等于原始文本（含空格、换行、标点），不trim、不规范化、不加省略。句尾引号/括号、标点尽量跟随所属句；不制造可避免的纯标点泡。
服务端已有shortMessages每段20码点/最多6条，保持不变。若一个API回复已被连续20码点硬切，可仅在同一回复内重接未结束的段后自然分段；保留自然短句边界，不跨不同turn/用户消息重组，不声称恢复服务端从未返回的文字。
投影ID基于原消息id+段序号，历史重新加载确定一致；仅assistant分段，用户文本不改。ChatReplyText的文字渐清也按字素分组，避免跨span拆坏emoji。
展示队列过滤投影ID显示；用户消息立即显示，历史fresh=false立即显示不重播。只对新鲜assistant逐段入场，150+字素数*5ms（上限250ms），沿用原bubble motion；连续同组间距约6px，其余12px。新片段出现仍通过已有bottom/historyScroll.isPinned走native smooth；用户阅读历史不强制滚动。关闭/隐藏/减动效应直接完成展示，清空/身份切换彻底取消旧队列，不能补出旧消息。所有留言/提醒业务仍在原控制器执行一次。

## Scope and verification
2026-10-23 交付阶段最新用户原话「推送 PR 更新网站」授权当前内容的 PR 与部署，不等于实体设备验收或 main 合并；v79 的 ReleaseNotice 只增加本轮发布文案，作为必要发布范围追加到 scope.json，不改变其他 UI。当前批次全部在途 scope 的动作授权绑定同一个现行摘要，不修改 acceptance.pending。

只修改CompanionChat、ChatReplyText、新纯工具/展示composable和对应旧测试夹具。不得修改ChoreBoard、chatViewport/chatLayout/chatScroll、导航、玻璃、后端、通知、schema或密钥。先纯测试 Unicode/原文往返/自然断句/随机/队列，真实Vue Chromium+WebKit窄屏/横滑/新回复中间帧/历史/阅读滚动/重入/清空/留言/提醒一次执行/键盘模拟/深浅/减动效，并回归已有聊天与紧凑布局。原生和实体设备未测试明确记录。回滚仅本change精确diff。
