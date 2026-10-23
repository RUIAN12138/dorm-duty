## Scope and status
2026-10-23，独立分支 codex/compact-chat-layout，基于 be34b73。只修改聊天及直接依赖、定向回归与本change文档。生产仍v76，本轮无推送/PR/合并/部署或生产数据操作。用户选择「暂时不连接，先做隔离预览」，实体验收继续pending。

## Observed baseline
隔离浏览器实测 data/compact-chat/baseline.json：普通头部球球88px/top48，历史padding-top192px；开始留言时footer高度110→66px，留言在history内插入；420px可视高度时球球仍88px，留言top130，进入头部占位范围。新增检查在旧实现失败于“cached history also shows note-first prompts”，日志red-baseline.log。这里只证明浏览器布局冲突，不能声称已捕获实体iOS抽搐的全部原因。

## Implementation review
- 保留唯一chatViewport控制器；chatLayout纯推导同一个遮挡进度，球球88→61.6px，头部48→16px，名称/返回/历史padding同步。原短屏已紧凑时不扩大球球。
- Footer共享dock承载留言、快捷语、composer，单一高度过渡，内容局部滚动；移除重复Motion layout/退出占位。取消冻结旧内容直到真实transitionend；未用固定超时释放。
- 提示保留单一原配置，留言action固定第一，普通prompt点击沿用send；keyboard隐藏时不重新创建提示数据。
- textarea用隐藏镜像测高，尾部零宽字符保留末行换行高度；不把可见输入临时压成26px。
- 独立审查补回留言收起opacity/局部transform反馈，修复旧continuity回归暴露的丢失淡出。不放宽原断言。

## Current verification
最终源代码冻结后，定向结果位于 data/compact-chat/：

| 检查 | Chromium | WebKit | 证据 |
| --- | --- | --- | --- |
| 新增紧凑布局/快捷语/留言反向/失败重试防重/减动效中断 | 42项通过 | 42项通过 | review-check-chat-compact-layout-*.log、*-result.json |
| 现有聊天连续性/卡片复用/平滑跟随/历史中断/320–430px | 23项通过 | 23项通过 | review-check-chat-motion-continuity-*.log |
| 键盘视口/早blur/候选栏/安全区/缩放/无接口回退 | 98项通过 | 98项通过 | final-check-chat-keyboard-viewport-*.log |
| 单/双击/长按/拖动/延迟click仲裁 | 52项通过 | 52项通过 | check-companion-tap-arbitration-*.log |
| 缓存历史瞬时定位/离线重开/不重播历史 | 14项通过 | 14项通过 | check-chat-entry-polish-*.log |
| 现有完整聊天/输入/IME/玻璃/关闭/草稿 | 60项通过 | 58项通过 | review-check-companion-chat-browser-*.log |

- 留言状态机28项通过，note-state.log。
- 最终前端typecheck/build通过，build-final.log；改动文件格式检查通过，format-delivery.log。
- OpenSpec严格规范/精确范围/18项门禁自测通过，spec-final.log；最终文档更新后再复核。
- PR门禁仍拒绝缺失/陈旧验收，pr-gate-final.log；未伪造用户验收、未创建或推送PR。
- 390×844测试：球球88→61.6px，历史上部留白192→110px；同一阅读锚点始终294px；完整键盘时输入框外边距10px。数据见chromium-result.json、webkit-result.json。
- 新增留言失败保留内容、六次同步确认只产生一次请求，并实际查询隔离数据库核对发送人及收件人。
- 最终隔离预览已重启8092，preview-status.json验证in-memory/simulated AI/email=false/push=false；preview-ready.png、preview-note.png已逐张查看。预览不等同生产。

## Failures preserved and corrected
- 旧实现新增检查首次失败于有历史时没有note-first快捷语，red-baseline.log。
- 原continuity检查发现取消时缺少淡出中间帧；补回单一局部opacity/transform反馈，原断言保持、重跑23项通过。
- 一次完整聊天回归期间仍有源码审查修改，聊天被卸载而超时；此结果不算通过，已冻结源码重跑，见final-check-companion-chat-browser-chromium.log与review同名日志。
- 新增“减动效中途切换”检查捕获清理函数反复触发布局；已增加leavingNote非空守卫，当前双引擎42项含该检查通过。最后一次WebKit完整聊天58项、Chromium60项均通过。
- 最小视口留言卡片此前被外壳硬截断，改为卡片自身限高并局部滚动，保留圆角/边框；当前截图和直接点击测试已复核。

## Evidence boundaries
- 桌面Chromium/WebKit通过synthetic VisualViewport事件测布局，不等于实体iOS系统键盘、候选栏和Safari compositor验证。
- 本轮iPhone discovery devices=[]，用户选择先隔离预览；中文/英文/emoji/候选栏真机未验收。
- 本轮adb devices和hdc list targets均为空；尚无Android WebView/ArkWeb本轮原生键盘结论。前一轮原生问题记录不当作本轮通过证据。
- 隔离预览内存新宿舍/模拟AI，邮件与push关闭，无真实宿舍数据。

## References checked
MDN VisualViewport：https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
MDN scrollIntoView：https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
不调用scrollIntoView或自动聚焦来修复键盘；继承既有首次点击不唤键盘、IME保护和瞬时入场定位。

## Publication preparation
用户在完成隔离预览后明确「更新到网站」，本轮仅上线既有聊天紧凑布局和对应v77版本说明。发布前数据库在线备份、历史行哈希、安装失败自动回退；快捷回复新功能不包含在v77中。
