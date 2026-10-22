# 聊天连续动效与日历分段导航隔离预览

本轮基线：`4b91529`（v72已发布记录）；开发分支：`codex/chat-motion-continuity`。本轮没有创建PR、推送、合并main或发布生产。v72“部署到网站看看”的授权已经履行，不适用于本轮。

## 预览

- 本机：http://127.0.0.1:8092/?start=1
- 日历：http://127.0.0.1:8092/calendar?start=1
- 同一局域网：http://172.20.10.2:8092/ （网卡地址可能变化，以`data/conversation-preview/server.json`为准）。
- 全新内存数据库、四个假成员、AI演示回复；邮件/系统推送关闭，账号与SMTP路径阻断。此预览不连接生产数据、真实AI或凭据。重启会重建假记录。
- 启动：`node scripts/preview-conversation.mjs`。源文件更新后重新启动；这个预览刻意冻结HMR，防止验收途中被其他测试重载。

## 本轮实现

### 球球聊天

- 首击立即开始420ms共享位置转场，无需等待480ms双击判定。二次点击原位置会撤销该次展开，沿当前姿态返回后只进行表情互动；长按、键盘、连续角色状态保留。
- 部件以较短间隔协调入场，最后一项约在420ms内到位；关闭维持原有来源坐标跟踪及键盘回落等待。
- 新消息按用户/助手方向以240ms轻弹性进入，连续回复维持短间隔。单一滚动驱动平滑追随追加内容，手动触摸/滚轮立即中断；翻阅旧消息时迟到的回复不抢位置。
- 关闭聊天保留未发送草稿；再次打开不自动聚焦键盘。温启动已有记录保留，刷新服务状态不覆盖成骨架；更换身份清空对应草稿和缓存。
- 留言卡外壳不随步骤销毁；内部交叉过渡与320ms布局投影，发送中锁定确认。取消/成功有退出过程，保留既有API、防重、收件人校验和失败重试规则。
- 历史区域延伸至顶部玻璃后方，原静止布局锚点通过等值padding保留。四个独立遮罩层使用6/10/18/26px背景模糊，越靠近屏幕顶边越柔和；前景球球、返回和名字清晰。底部已验收的玻璃参数保持。
- 减动效直接绘制终态；减少透明度使用原有实底降级。

### 日历 / 列表 / 卡片

- 日历专用`ElasticSegments.scrub`，其他使用者保留松手提交语义；尺寸、位置、字号、配色不改。第三项按本轮要求标为“卡片”，内部stats数据接口保持。
- 横向意图锁定后指示器实时跟手，并即时联动视图。松手沿现有selection弹簧吸附；纵向意图不劫持滚动，滑出上下24px恢复起点，500ms屏蔽合成点击。快速跨到第三项不排队播放第二项。
- 修复触摸隐式捕获从按钮转交给轨道时被`lostpointercapture`误取消的问题；轨道仍持有同一pointer时忽略交接事件。
- 三个视图首访后保留DOM，内容槽内唯一Motion驱动300ms弹性进入、180ms退出，8px/0.98起始姿态；快速反向从当前姿态续接，结束只剩一个可见面板。
- 保留月份、日期状态、列表滚动/展开及卡片当前项；已缓存日历不重复骨架。隐藏卡片暂停自动播放；统计首访pending请求和缓存保留，不因scrub经过就取消重取。

## 验收路径

1. 单击球球，观察立即响应、各部件逐步出现；关闭再双击原球球，只有互动且自然返回。
2. 写草稿但不发送，返回再打开，草稿仍在且键盘不会自动弹出。
3. “我要留言”→对象→内容→确认；改内容、改对象时观察卡片外壳连续；快速点击确认只发一条。隔离数据可放心试。
4. 连续聊天后上滑读历史，后续回复不把视图强行拉回底部；上下玻璃可见内容轮廓。
5. 进入日历，按住切换器拖向列表/卡片，松手前检查内容已变化；直接跨项、拖出区域取消、快速反向。
6. 列表滚动/展开后切走再回、卡片切到某项后切走再回、切月后往返，状态应保留；列表侧滑、月份滑动、卡片横滑和主导航继续各自处理手势。

## 自动化与证据

命令与机器可读报告见下表，实际最新计数以JSON为准，不把旧发布证据混入本轮。

|命令|范围|证据（项目内）|
|---|---|---|
|`node scripts/check-chat-motion-continuity.mjs`|真实聊天中间帧、首击时延、稳定卡片DOM、滚动轨迹、草稿、双击取消、320/390/430、减动效|`data/chat-motion-continuity/chromium-result.json`|
|`DORM_BROWSER=webkit node scripts/check-chat-motion-continuity.mjs`|同上，WebKit桌面引擎|`data/chat-motion-continuity/webkit-result.json`|
|`node scripts/check-calendar-segment-navigation.mjs`|分段器指针/触摸、入退场、缓存、取消、跨项、反向、减动效|`data/chat-motion-continuity/chromium-calendar-result.json`|
|`DORM_BROWSER=webkit node scripts/check-calendar-segment-navigation.mjs`|WebKit指针与模式状态测试|`data/chat-motion-continuity/webkit-calendar-result.json`|
|`DORM_ARKWEB=1 node scripts/check-calendar-segment-navigation.mjs`|鸿蒙模拟器实际ArkWeb及CDP触摸事件；9227须转发当前browser调试socket|`data/chat-motion-continuity/arkweb-calendar-result.json`|
|`DORM_ANDROID_WEBVIEW=1 node scripts/check-calendar-segment-navigation.mjs`|Android独立调试壳`cn.lundao.preview`中的WebView|`data/chat-motion-continuity/calendar-android.log`|
|`node scripts/check-conversation-preview.mjs`|既有留言API/防重/重试/手势/光学玻璃等回归|`data/chat-motion-continuity/conversation-chromium.log`|
|`DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs`|连续表情、共享回程、键盘视口模拟、原有设置/手势回归|`data/chat-motion-continuity/chat-regression-chromium.log`|

本轮已通过：聊天专项 Chromium 23 / WebKit 23；日历专项 Chromium 18 / WebKit 16；鸿蒙 ArkWeb日历16项（包含真实引擎的CDP触摸）。原有连续表情/回程/设置/手势回归 Chromium45 / WebKit44；留言与玻璃/页面手势回归 Chromium44。首次响应分别67ms和43ms，主要展开362.1ms和320ms；均为本机测量，不保证所有设备相同。类型检查、生产构建、OpenSpec严格规范/范围和14项门禁回归均通过。完整PR门禁仍明确拒绝，未绕过。

### 必须区分的限制

- 用户明确选择“暂时不连接，先做隔离预览”。没有iPhone实机、没有实体安卓/鸿蒙，也未验证正式原生壳或推送桥。
- WebKit截图器在独立最小HTML中也不渲染backdrop-filter。光学测试先校准；若校准可渲染而应用失败仍失败，只有校准本身失败才记录光学未验证。Chromium真实条纹下采样已证明顶部边缘对比度更低、中间更清晰，不只检查CSS属性。
- 桌面键盘几何使用visualViewport模拟，不等于实体输入法。鸿蒙完整聊天自动流程在输入法之后的快捷按钮稳定性检查未完成；不能把其日历通过称为完整聊天通过。
- Android初次运行出现预览调试Activity ANR及调试连接超时；保留失败日志，冷启动重测通过前六项（跟手、松手、列表实例/滚动、缓存）后，在后续按钮稳定性等待超时；仍未完成完整验收，不推断原因或通过。独立测试壳不会替换`cn.lundao.dorm`。
- 触摸用实际浏览器协议派发touch事件；不是实体手指手感或显示帧率认证。性能数值只代表本机测试条件。

## 修改与审批边界

两个OpenSpec变更分别记录聊天与日历：`polish-chat-motion-continuity`、`polish-calendar-segment-navigation`。`npm run spec:check`核对完整批次路径和摘要；PR/发布门禁仍保持未验收。测试通过不是用户验收，不能据此执行正式操作。
