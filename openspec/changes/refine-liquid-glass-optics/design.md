## Context
Vue3/Motion/Reka已有单一运动驱动。现导航WebGL采样自身标签纹理，不能宣称采样整页DOM。全屏玻璃/主题/任务/球球/键盘几何均非本轮范围。KnowledgeBase索引、awesome-design-md、math-curve-loaders缺失；读过React Bits GlassSurface与参考库index.tsx、shader-utils.ts、LICENSE。
## Decisions
| Before | After | Why |
| --- | --- | --- |
| 已有导航局部透镜 | 在原shader中轻量精修边缘曲率、高光，光学增强仅底栏显式启用 | 不连带修改外观设置共用控件 |
| 输入/消息背景单层 | 可复用装饰光学层，文字/按钮始终前景 | 透出背景但不扭曲输入文字 |
| 日历不透明滑块 | 仅scrub模式启用透明玻璃材质，原selection驱动不变 | 不改变其他分段器 |
| 一律高成本滤镜 | 支持探测/保守降级、减透明度/减动效/后台停用、尺寸预算 | Safari与低端设备优先可读与响应 |
不把CSS.supports解析成功当作SVG背景折射已实际渲染。没有足够渲染证据则只启用CSS清透玻璃层。所有光学层pointer-events:none，不截获手势；不创建持续idle rAF，不动画blur。尺寸/布局保持原样。MIT声明完整附带在源与可分发公开文件，不复制React代码。
## Non-Goals
不重写导航、消息队列、球球、聊天记录、键盘或原生壳，不新增依赖，不合并main。
## Risks / Trade-offs
Safari/ArkWeb背景SVG折射能力不一致，降级不能冒称完整支持。消息背景透出需轻柔模糊避免文字冲突。桌面帧间隔不能代表iPhone或低端安卓性能。
## Validation
隔离前后同条件截图、rAF区间/长任务指标、明暗、无WebGL/SVG、减动效/减透明度、按住拖动、原键盘98项及旧聊天/分段回归。真实设备缺席单列待验收。
## Rollback
只撤本change代码diff；前置键盘与单双击单独提交，不回退用户既有工作。发布前备份SQLite并逐条核对摘要，代码包不含数据库或密钥，失败原子回滚。

## 发布关联修改与审查
仅补充既有ReleaseNotice的v76文案，避免上线提示沿用旧批次说明；不修改提示的布局、时序或交互，精确路径已列入scope。
Codex审查后将动态高光由径向渐变坐标重绘改为已栅格化局部层的transform，消息跟随高光也合帧且受减动效/后台约束；暗色内侧亮边降强度。没有对前景文本加滤镜。高级SVG背景折射没有得到跨引擎像素证据，不启用；真实折射与色散限于已有局部WebGL采样，CSS表面不冒称扭曲整页DOM。参考仓库快照ac48eab18d1f7f444ae30002d240cae29c863a21（仅学习原理）。

CI暴露验证脚本在慢runner中构造了294.4ms的超时二击。必要关联修改仅check-companion-tap-arbitration.mjs：减少moving案例的无谓等待并断言真实事件时窗；保留65ms移动目标延迟、所有业务断言及产品280ms窗口。

check-companion-chat-browser.mjs必要验收更新：旧compact header断言与用户新键盘需求相反，替换为真实前后球体几何稳定+10px输入间距，不移除其它IME、草稿、回程检查。
