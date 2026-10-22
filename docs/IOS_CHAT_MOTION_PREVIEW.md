# 球球聊天物理动效：本地隔离预览

本轮开发基线 `44d41de`，分支 `codex/ios-chat-motion`。本记录对应 OpenSpec `refine-ios-chat-motion`，不代表用户已经验收。下文为隔离验收阶段的记录，当时没有创建PR、推送、合并或部署。用户之后明确要求“部署到网站”“并且提交 pr”，对应动作另行记录于该change的verification.md，不能将其解释为实机验收或main合并授权。

## 打开预览

- 本机：<http://127.0.0.1:8092/?start=1>
- 当前同一局域网：<http://192.168.2.60:8092/?start=1>，网卡变化后以 `data/conversation-preview/server.json` 为准。忽略其中的代理虚拟网卡地址。
- 启动命令：`node scripts/preview-conversation.mjs`。源文件改变后重新启动；预览冻结 HMR，验收时不会被后台测试重载。
- 内存数据库、四个假成员、演示 AI 回复；邮件与推送关闭，账号及 SMTP 路径阻断。重启会清掉假数据。不访问真实 AI 凭据，也不代理正式服务器。
- 手机上通过局域网 HTTP 查看不等于正式 HTTPS/PWA、推送或原生壳验收。

## 本轮实际调整

### 共享球球

`chatTravel.ts` 保留 x / y / scale / reveal 四个 MotionValue。开关、反向及端点变化时先读取当前位置和速度，停止旧弹簧后把速度交给新的物理弹簧。旧完成回调用独立运行编号隔离，不能收掉后来重开的界面。返回中的球球仍可再次点击展开，整个中途反向保持同一个可见节点。

只在挂载、端点改变、视口事件发生时测量几何；逐帧绘制只写 transform / opacity。本轮反向加重开测试，两引擎各记录 12 次球球相关矩形读取，没有逐帧重复测量。按像素位移、比例、透明度分别设置静止阈值，避免视觉已到位后仍等待不可见尾段才交还焦点。

背景、玻璃层及四组前景内容由同一个可反向的 reveal 阶段协调，短间隔重叠进入。已有全局按钮按压驱动继续负责入口和发送按钮，没有叠加第二套缩放。输入承载区改用同组局部弹簧，首次触摸准备编辑、后续主动触摸唤起键盘的规则不变。

键盘收起时用 visualViewport 事件更新返回端点；视口恢复后才交回主页面球球。仍有有界等待兜底，必须在真实 iPhone 输入法上继续验收。

### 消息、卡片与滚动

- 新用户消息从输入区域方向进入，回复从助手侧进入；连续回复沿用既有短交错。已有历史气泡与温启动记录不重播入场。
- 留言确认卡沿用稳定外壳、内部内容过渡和布局投影，统一使用本轮局部物理参数。发送防重、失败重试、收件人校验、宿舍隔离和 API 没有改变。
- 正常滚动与惯性由浏览器负责。近底部追加调用原生 `scrollTo({behavior:'smooth'})`，不再运行自定义逐帧 scrollTop 物理积分器；触摸或滚轮会中断程序跟随。
- 阅读旧消息时发送、迟到回复、键盘及卡片布局变化不强制拉到底部；保存可见消息的内容锚点，布局提交后恢复对应屏幕位置。
- 草稿保留；等待回复仍可编辑；中文输入法确认保护、已有长按/双击/聊天返回手势、表情状态与 tips 保留。

### 保持原样的部分

本轮只改 5 个聊天源码文件：CompanionChat、CompanionChatComposer、chatMotion、chatScroll，以及新增的 chatTravel。DormCompanion 最终没有源码差异。未改其他页面、日历分段导航、玻璃导航、主题切换、完成反馈、抬水规则、后端、依赖或凭据。

上下渐进玻璃继续使用上轮参数与纵向遮罩，没有改配色、字号、布局、模糊强度或逐帧重算 blur。减少动态效果时直接显示终态，减少透明度继续沿用原有降级。

## 如何验收

1. 单击球球，观察立即按压反馈、球球移动及背景/消息/输入区协调进入。双击原球球只互动，不留下聊天界面。
2. 展开途中点返回；收起途中点击正在返回的球球。确认从当前位置续接，输入区不会被旧回调突然隐藏。
3. 输入但不发送，关闭再打开：草稿仍在，键盘不应自动弹出。连续操作几次检查表情没有冻结或重置。
4. “我要留言”→选择张三→输入内容→修改对象/内容→取消；再试确认发送和演示失败重试。卡片外壳应持续，退出后结果消息自然接上。
5. 发送几条消息后向上看历史，再发送或等待回复：阅读位置不应被拉走。回到底部后，新的回复应平滑跟随。
6. 使用真实手机键盘输入、切中文候选、收起键盘、带键盘返回聊天：检查输入区、消息锚点与球球回程。这部分自动化只有几何模拟，仍待实机。
7. 滚动到顶部和底部观察原有玻璃透出；返回、名字、输入文字、发送图标应清晰。系统减动效下仍能完成所有操作。

## 自动化结果与证据

这些均为本轮重新运行结果，不引用旧版本通过数代替当前验收。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 新物理聊天专项 | Chromium 18 / WebKit 18 通过 | `data/ios-chat-motion/{chromium,webkit}-result.json` |
| 原聊天连续性、中间帧、320/390/430px、减动效 | Chromium 23 / WebKit 23 通过 | `data/chat-motion-continuity/{chromium,webkit}-result.json` |
| 原留言 API、防重、失败重试、页面手势、玻璃回归 | Chromium 44 / WebKit 41 通过 | `data/conversation-preview/{chromium,webkit}-checks.json` |
| 原表情、聊天返回、键盘模拟及设置抽屉回归 | Chromium 45 / WebKit 44 通过 | `data/ios-chat-motion/legacy-{chromium,webkit}.log` |
| 原日历分段导航保留 | Chromium 18 通过 | `data/ios-chat-motion/calendar-chromium.log` |
| 通用前端状态 / 对话状态机 | 22 项 / 28 项通过 | `data/ios-chat-motion/{state,conversation-state}.log` |
| 既有按压、单/双击及手势状态 | 通过 | `data/ios-chat-motion/interaction-state.log` |
| 类型检查与生产构建 | 通过 | `data/ios-chat-motion/build.log` |
| OpenSpec 严格规范、范围、14 项门禁回归 | 通过；正式 PR 门禁仍拒绝 | `data/ios-chat-motion/{spec-check,pr-gate}.log` |

入口连续性脚本测到首击可见响应 Chromium 26.9ms、WebKit 36ms；主要分组件进入分别 383.5ms / 406ms。它们是本机测试条件下的测量，不是所有设备的时延保证。截帧还验证反向后先延续原方向速度、再自然回转，没有把反向简单重置成静止开始。

Performance Timeline、实际 rAF 间隔及长任务能力记录在新专项 JSON 的 `metrics.performance`。性能测量单独进行，不在该段逐帧读取元素矩形；WebGL 在测试中关闭以稳定角色渲染，不能把该数值称为完整生产 WebGL 性能。最终采样数值以 JSON 为准。WebKit 不支持 longtask 类型，明确记为 unsupported / null，不能解释成“零长任务”。本次 Chromium 259 个间隔，P95 9.3ms、最大 25.1ms；WebKit 135 个间隔，P95 19ms、最大 50ms，记录到 1 个超过 32ms 的间隔，因此不宣称全程零掉帧。

截图：`data/ios-chat-motion/{chromium,webkit}-{open,confirmation,final}.png`。失败及调试日志保留在同一目录；最终成功报告与失败快照分开。

复现：

```sh
node scripts/check-ios-chat-motion.mjs
DORM_BROWSER=webkit node scripts/check-ios-chat-motion.mjs
node scripts/check-chat-motion-continuity.mjs
DORM_BROWSER=webkit node scripts/check-chat-motion-continuity.mjs
node scripts/check-conversation-preview.mjs
DORM_BROWSER=webkit node scripts/check-conversation-preview.mjs
DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs
DORM_BROWSER=webkit DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs
npm run web:test-state
node scripts/check-conversation-state.mjs
node scripts/check-companion-preview-check.mjs
npm run build --prefix frontend
npm run spec:check
node scripts/check-change-scope.mjs --gate pr # 预期拒绝：尚未验收
```

## 尚未验证与限制

- 用户已选择暂不连接 iPhone；没有做 Safari 实体输入法、系统原生返回、真实触摸手感与 PWA 生命周期验收。
- 本轮查询 adb / hdc 均无在线模拟器，ArkWeb 调试端口未开启；没有将旧模拟器结果冒充本轮 Android WebView 或 HarmonyOS ArkWeb 通过。正式原生壳与推送也未测。
- 桌面 WebKit 截图器在独立最小玻璃控制页也不渲染 backdrop-filter。回归先校准，校准不能渲染时记录光学未验证；Chromium 的实际模糊采样及所有几何、透出、层级检查继续执行。不是把未验证算作通过。
- 当前用演示回复，未对真实模型的网络时延、服务异常或通知送达作结论。
- 这是基于 Vue / Motion 的浏览器实现，参考 Apple HIG Motion 与 WWDC23 Animate with springs，不能声称已经等同原生 iOS 手感。正式操作仍等待用户明确验收与相应授权。
