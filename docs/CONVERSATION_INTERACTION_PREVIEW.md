# 球球留言与主页面手势：隔离预览

本轮从 `main@25056ed`（v71）建立独立工作树 `/Users/apple/project/dorm-duty-interaction-preview`，分支 `codex/conversation-interaction-preview`。本轮仅供验收，**未创建 PR、未推送分支、未合并 main、未部署正式网站、未读取或写入生产数据库**。用户明确验收前，不执行上述正式操作。

## 预览方式

在此工作树执行 `node scripts/preview-conversation.mjs`，默认端口 8092。电脑打开 `http://127.0.0.1:8092/`；同网络手机使用终端输出的实际 LAN 地址。不要使用生产入口验收本轮变化。

页面先说明隔离范围，再进入“隔离预览宿舍”；默认身份“体验者”，室友为张三、李四、王五。`?as=1`、`?as=2`、`?as=3` 可体验其他人工身份。启动时创建新的内存 SQLite；退出进程即丢弃数据。每次重新启动都用新的预览宿舍，不复制真实邮箱、密钥、会话、宿舍记录。邮件、推送、账号路径关闭，AI 使用本地演示回复。留言和催促仍经过原后端 API 与真实权限/频控代码，只写入隔离数据库。

预览沿用正式前端的样式加载顺序、动效代币、按压反馈及 Vant 组件注册。验收服务器是固定快照，关闭文件自动重载，修改源码后需重启；避免其他测试生成临时页面时打断手机会话。此预览不提供真实 AI、邮件和系统通知投递验收。

## 修改内容与边界

- 球球单击延迟判定后打开聊天；双击只播放原随机表情。第二次按下在双击窗口内即保留判定，避免嵌入式浏览器慢帧把双击拆成两次单击。保留长按快捷聊天、键盘操作和原表情引擎。
- 聊天中常驻“我要留言”快捷操作；键盘显示时让出空间。自然语言由本地确定性状态机识别，精确匹配当前宿舍成员，不猜姓名。支持单人、全体、对象选择、内容编辑、取消、确认预览、发送和失败保留。只有确认按钮可以发出留言；发送状态同步上锁。没有新增第三方 AI 或聊天服务。
- 沿用 `/chores/notes`，不改后端权限、宿舍隔离、120 字限制、发送冷却和群发规则。客户端不自动重试发送；服务端拒绝和结果未确认均保留草稿，须用户再次确认。并发确认防重不代表传输中断后的端到端 exactly-once 保证。
- 不再挂载独立 `CompanionNotes` 留言编辑器。消息收件箱继续保留；消息横幅长按回复进入统一聊天并预选实际发送者。
- 抬水页仅根据可用高度调整原主内容的锚点、间距和标题尺寸，不新增装饰，不修改值日、日历版式。短屏、常规屏、高屏分别验证。
- 催促用 700ms 指数衰减的点击能量控制局部形变和涟漪，强度封顶 1、同时最多 6 组反馈。新反馈从当前形变继续，不无限叠加。服务端及客户端原通知限流不变；减动效/后台清除装饰反馈。
- 空白区域左右滑动沿原路由与过渡切相邻主页面。24px 系统边缘留给 Safari 返回；横向 8px 且大于纵向 1.2 倍才锁定，通常需 56px 或满足带速度的投影阈值才提交。竖向移动、输入、按钮、任务选择、日历、统计卡、记录滑动、轮序与抽屉不交给全局导航。两个完成/催促控件只观察移动来拦截误点击，不捕获其独立手势。首尾不越界。

## 关键文件

- `frontend/src/interaction/conversationNotes.ts`：留言状态机，意图、对象校验、确认与失败状态。
- `frontend/src/composables/useConversationNotes.ts`：现有 API 发送、同步防重、身份变更隔离。
- `frontend/src/components/ConversationNoteFlow.vue`：对象选择和消息预览卡。
- `CompanionChat.vue`、`DormCompanion.vue`、`ChoreBoard.vue`：复用聊天/表情/主页面承载。
- `frontend/src/interaction/tapEnergy.ts`、`WaterNudge.vue`：频率与有界动效。
- `frontend/src/screen.css`：仅抬水密度规则。
- `scripts/lib/conversation-preview.mjs`：隔离数据与演示 AI，生产构建不导入。

保留原黑白极简视觉、玻璃导航、主题切换、完成与撤销反馈、圆环、抬水交接老虎机、日历和列表动画。没有修改正式 API、账号、邮箱、推送、轮序或数据库迁移。

## 验证命令

```sh
npm run typecheck --prefix frontend
npm run web:test-state
node scripts/check-conversation-state.mjs
node scripts/check-conversation-preview.mjs
DORM_BROWSER=webkit node scripts/check-conversation-preview.mjs
DORM_ANDROID_WEBVIEW=1 node scripts/check-conversation-preview.mjs
node site/scripts/check-roommate-notes.mjs
node site/scripts/check-companion-ai.mjs
node scripts/check-completion-experience.mjs
node scripts/check-water-flex-motion.mjs
node scripts/check-list-collapse-sync.mjs
node scripts/check-companion-chat-browser.mjs
DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs
node scripts/check-sheet-banner-polish.mjs
npm run build --prefix frontend -- --outDir ../data/conversation-preview/build --emptyOutDir
```

测试报告、截图与构建位于忽略目录 `data/conversation-preview/`，不进入生产源码包。最终执行结果及平台边界在该目录的 `acceptance.json` 记录。

## 人工验收

1. 单击球球进聊天；双击仅互动。确认连续表情和返回交接仍自然。
2. “我要留言”→选张三→输入→修改对象/内容→取消，均不发送；重新确认发送后切换另一隔离身份查看收件箱。
3. 输入“我要给所有舍友留言”，检查全体确认卡；快速连续确认只发送一次。未知姓名必须重新选择。
4. 只从空白处横滑切页；日期、列表滑动、输入框、催促名字、任务按钮和抽屉不切页。纵滑仍保留原滚动/弹性。
5. 快速催促只有局部增强，没有新增通知轰炸；开启系统减动效后保持功能可用。
6. 在自己的 iOS/Android/HarmonyOS 实体设备复核键盘、系统边缘返回、触控手感。这些不能由桌面 WebKit 或模拟器替代。

模拟器说明：Android 自动化使用独立调试壳 `cn.lundao.preview` 中的 Android 15 WebView 124，只加载隔离页面；不替换正式 App，不接原生推送。同步连点、失败重试通过 DOM 明确触发确认处理；高频点击专用项在该浏览器内按 32ms 定时派发点击，避开模拟器逐次 RPC 的延迟；切页仍走浏览器触摸事件。鸿蒙使用系统浏览器的实际 ArkWeb 引擎进行 UI 冒烟，不等于正式 ArkWeb 壳、原生桥或实体设备验收。

## 追加预览：底部毛玻璃与涟漪

聊天底部镜像顶部的五层渐进虚化，输入条后方补柔边毛玻璃，保留输入框位置、大小与原入场。涟漪从小范围起始，快速连点逐步扩大，上限不超过4.8倍，停顿后衰减；不改变实际通知限流。
本次重新执行浏览器检查，不沿用前一轮模拟器报告作为新效果的验证。OpenSpec 状态与范围见 openspec/changes/refine-chat-frost-and-nudge-ripples，用户验收仍待完成。

### 输入区真实透出层级（需求六）

消息滚动层延伸到悬浮输入栏和安全区后方；输入胶囊为42%表面色叠加18px模糊，承载面板为28%表面色叠加20px模糊。原气泡玻璃变量、字体、圆角、位置和发送反馈不变。动态测量输入区高度，末条消息和确认操作可完整滚到输入栏上方；向上查看历史时可看到模糊轮廓。输入区毛玻璃沿原入场运动，键盘视口变化与深浅主题保持同样层级；减少透明效果时实色兜底。

浏览器键盘验收使用 visualViewport 信号模拟，不等于 iPhone/Android 实体输入法验收。
