## 1. 背景
用户详细键盘需求在proposal/spec。当前聊天fit切compact会移动球球，gap突变，失焦提前回落；关闭还有单独viewport监听。只做本轮键盘相关。
## 2. 当前仓库状态判断
branch codex/chat-keyboard-viewport，HEAD039b73a。已有未提交DormCompanion.vue与check-companion-tap-arbitration.mjs为上一轮双击修复，禁止触碰。新change已建且scope已通过。主代码Vue3/Motion/Reka。
## 3. 本轮目标
输入框实际外缘距键盘10px、与玻璃跟随真实可视视口、无额外bottom动画、顶部稳定、保留reader锚点/近底跟随。
## 4. 修改范围
frontend/src/components/CompanionChat.vue，必要时frontend/src/interaction/chatScroll.ts；新增frontend/src/interaction/chatViewport.ts；新增scripts/check-chat-keyboard-viewport.mjs。不得改其他文件。Composer现有两次触摸进入编辑与IME保护保留，不改视觉或交互。若必须扩大先报告。
## 5. 禁止事项
禁止密钥/.env/生产/业务/主题/表情/单双击/其他页面修改。禁止提交推送PR发布。禁止启动子代理。禁止固定延迟掩盖布局、不重复挂载、不新增依赖、不靠viewportresize另加固定时长transition。不要修改OpenSpec及任务书。使用frontend/node_modules的可执行文件避免npx临时下载。
## 6. 具体任务
先读AGENTS/动效契约与本change。做小型键盘viewport状态纯函数或控制器以便测试：height/offsetTop/scale +焦点+baseline/宽度处理，单一rAF合帧。keyboard失焦后仍保留直到实际恢复，不把pinch/地址栏/硬件键盘当软键盘。compact仅进入时的屏幕条件，键盘不能改变球球/名字/toolbar/上玻璃的位置尺寸。保持无键盘原footer-gap，随真实遮挡量连续收敛到10px（可CSS变量--chat-keyboard-inset配max(10px,calc(idleGap-inset)))，禁止再叠加安全区导致34px gap。root实际可视height/offsetTop、footer/玻璃/历史都用同一状态。浏览器只有离散viewport事件时直接跟随，不伪造固定延时。fit只在present时做DOM；正常keyboard不chatTravel.measure每帧，必要时仅opening/closing重新测量，保留回程但高频更新只一个调度（现有trackReturnOnViewport/awaitKeyboardReturn需协调不要重复几何刷新）。scroll状态用historyScroll.isPinned而非布局变化后rawdistance；reader capture/restore所有必要布局；避免初次positionInitial影响；footerRO先读尺寸后写、沿用同一pinned语义，不重复无效写。清理事件和rAF。
新增真实浏览器测试（两个引擎DORM_BROWSER）模拟visualViewport多阶段height/offsetTop resize+scroll，断言每阶段真实composer外缘距viewport.bottom连续且最终10px，ball/nameplate/toptoolbar相对可视顶边稳定。覆盖blur先于恢复、候选栏涨落、阅读历史锚点、近底最新消息、原布局复原、短屏、safearea模拟、缺visualViewport/resize型WebView、scale变化。记录具体几何值而非仅class。模拟不是实体键盘。单次合帧多事件不要多次layout更新。保留初始滚动/草稿/单双击相关旧回归。
## 7. 验收标准
新增测试两引擎通过；旧check-ios-chat-motion及check-chat-motion-continuity相关测试、check-chat-entry-polish与双击回归通过；build/typecheck/限定文件prettier/scope检查通过。不可为旧断言改产品行为；若旧测试假定keyboard压缩顶部，需要按本轮明确需求更新但本轮未授权修改旧脚本，先报告。不要伪造真机。
## 8. 完成后输出
尽快给出精确diff、真实测试结果和局限；不擅自跑无关全量后端测试。Codex独立审查/复测。只允许当前四个代码/测试路径。
