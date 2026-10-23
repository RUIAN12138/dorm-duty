## Design
保留Vue3、既有LiquidGlassSurface、bannerFlight/bannerMotion、黑白椭圆与玻璃边缘。读取frontend-design/emil-design-eng、项目动效契约，参考已有React Bits GlassSurface分层、AnimatedContent清理模式；不引入React/GSAP。awesome-design-md/math-curve-loaders/KnowledgeBase索引路径缺失，不宣称已读取。

| Before | After | Why |
| --- | --- | --- |
| 长按550ms关闭banner再开聊天 | 长按400ms在同一个banner中展开表单 | 空间连续且不干扰球球 |
| dismiss读取当前active id | 每个手势/回复固定原始消息和身份 | 连续来信不误读其他消息 |
| 读失败只toast，消息已不再展示 | 已读意图进入身份隔离重试队列，成功才修改read_at | 网络恢复不丢读回执 |
| banner无键盘编辑布局 | 独立复用同类VisualViewport合帧控制、背景锁滚动 | 根页面不做键盘高度补偿 |

## Ownership and state
回复状态机idle/editing/sending/error，目标为当前消息实际sender_id且仍为本宿舍其他成员；scheduled/null/self/无效sender不创建目标。广播fan-out个人留言有有效sender可回复该sender，不扩大到全体。发送/回执固定token+invite+member+noteid。连点不重复提交；旧请求不关闭新消息/污染新身份。成功HTTP回执后才关闭并请求原id已读；失败保持未读和草稿。

同一banner卡片不换key、不关闭重开，展开高度唯一所有者，内容opacity/transform入场；关闭可逆，不叠加布局驱动。400ms计时仅用于长按识别，触摸移动取消；输入/按钮不被滑动劫持。原上滑跟手/阈值/回弹保留，事件带消息id与原因。展开期间暂停自动消失和队列替换；背景点击取消编辑保持未读，不把escape当主动上滑。输入法弹出以visualViewport.height/offsetTop为唯一几何、resize/scroll合帧，焦点preventScroll，无scrollIntoView/键盘固定等待。iOS异步focus受限制时在真实pointerup继续聚焦，并明确测试边界。

背景遮罩只用于展开态，透明模糊、阻止滚动穿透，恢复原scrollY及已有body样式；焦点有返回路径。按系统减动效/减透明降级；不修改已有全局样式/聊天键盘控制器。后台/身份切换停止旧手势/编辑，保留正确回执重试隔离。

## Read policy
长按=不读；失败=不读；成功回复=读原消息；主动阈值上滑=读原消息；阈值不足回弹=不读；超时=不读；遮罩/取消编辑=不读；消息详情沿用已有规则。received接口只是送达确认，不能混淆read_at。读失败不乐观改已读，重试按本身份/网络恢复/轮询，避免全局busy吞掉回执；退出/解绑后不得用旧token继续请求。

## Verification
隔离真实SQLite/API校验发送者/宿舍/限流/单次请求、读写失败和第二设备轮询。Chromium/WebKit逐帧检查同一DOM、中间高度/形变、上滑返回/中断、连续来信、键盘/方向/深浅/减动效、滚动位置。iPhone未连接，用户此前选择先预览；原生模拟器可用再测，未运行不得标通过。回滚当前change精确diff，v77保留。

## Necessary test-fixture adaptation
新增布局控制器使两个旧纯内存手势夹具误加载浏览器/Motion依赖。仅扩展check-screen-gesture-check/check-navigation-components的精确范围：布局/滚动控制器在无DOM夹具中替身化，由真实浏览器专项负责几何验收；断言新增固定消息id和swipe原因，不改旧手势阈值。无生产页面范围扩大。
