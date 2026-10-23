## Status and authorization
本change为事前规范后实现。用户原话「完成后更新 pr 和网站」授权本批次更新审查PR与部署供查看；不代表产品/实体设备验收，不授权合并main。正式操作前重新绑定当前内容摘要，不复用v77授权。v77紧凑聊天已另行发布，本轮为v78。

## Implementation review
- 400ms长按同一banner DOM，持久挂载的编辑区连续展开/反向收回；不再打开球球聊天。保留原flight、上滑阈值、光学层。
- 发送捕获token/invite/member/note/sender，真实HTTP成功才收起并请求原消息已读；本地pending锁防连点；失败保留草稿。发送进行中显示状态，暂时禁用重复提交和关闭，避免将未确认结果视为取消成功。
- scheduled/null/self/已移除sender不创建回复对象；广播来源留言仅回复其实际作者。沿用现有API的身份、宿舍隔离、1–120码点与冷却规则。
- 显式上滑/成功回复提交read；长按、失败、短滑、超时、遮罩、Escape不提交read。received送达确认保留原规则。
- 已读意图在请求前按宿舍/成员保存ID；仅服务端有效read_at才确认。网络/401/408/429/5xx暂态失败保留，恢复/轮询按退避重试；跨身份不串写，不存token或正文。
- 单个VisualViewport控制器驱动可视位置；首段/反向用现有settle弹簧，系统连续键盘帧直接跟随，避免二次追赶。正文16px避免iOS自动缩放；内侧焦点线避免裁边。
- 系统改为减动效时，未完成的位置动画直接到终态；背景滚动/焦点恢复均保持局部所有权。

## Automated evidence
所有业务测试均为内存SQLite、合成成员与模拟AI，不使用正式数据/真实邮件/真实推送。
- `node scripts/check-banner-quick-reply.mjs`: 25状态/身份竞态/失败/重试检查。
- `DORM_BROWSER=chromium|webkit node scripts/check-banner-reply-browser.mjs`: 各38专项检查，包括同一DOM与中间高度、失败草稿、六次点击一次请求、超时/取消不读、后台回执重试、后到消息隔离、模拟键盘/候选栏/视口偏移、横屏、深浅/减动效以及动画中途切换减动效。最新最终结果见data/banner-reply/*-final.log与*-result.json。
- `npm run web:test-state`: 22项全部通过。两个旧手势夹具仅适配新增布局依赖、带消息ID/原因事件与新增遮罩Transition；没有修改原产品手势阈值。
- `node site/scripts/check-roommate-notes.mjs`: 27条现有API检查通过（隔离/冷却/Unicode/权限/回执）。
- 原抽屉/消息检查：Chromium与WebKit各21项；紧凑聊天各42项；球球聊天Chromium60项/WebKit58项；主题/统计53项。原页面源码未调整。
- `npm --prefix frontend run typecheck`、精确改动文件Prettier、`git diff --check`及OpenSpec严格校验/范围/18项门禁检查通过。
- 图片已实际检查：data/banner-reply/chromium-keyboard-simulated.png、webkit-keyboard-simulated.png、*-reply-light.png、*-reply-dark.png。模拟视口截图不是系统键盘截图。

## Limits
- 当前adb无设备、hdc为空；Apple设备枚举仅Mac可用，无可操作iPhone。用户此前选择暂不连接，先预览。
- 未完成iPhone Safari中文/英文/表情/候选栏实体键盘、Android WebView、HarmonyOS ArkWeb本轮原生验收。长按后使用真实pointerup同步focus作为iOS策略；不能仅由桌面WebKit断言一定唤起iPhone键盘。
- 无真实室友消息/邮件/推送发送，跨设备验证为服务端重新请求获得read_at，不声称实体双设备验收。

## Delivery
本地回归和v78构建通过，隔离预览http://127.0.0.1:8092/?start=1 已启动（合成宿舍，模拟AI，不发邮件/推送）。接下来执行绑定当前内容的门禁、更新PR #82、代码包备份发布及只读线上核对。生产数据库禁止替换；备份/回滚/旧打卡逐条摘要校验必须保留。
