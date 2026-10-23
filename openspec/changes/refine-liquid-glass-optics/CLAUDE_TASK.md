# 1. 背景
用户指定rdev/liquid-glass-react参考，四个局部玻璃材质精修，Vue3不加React，完整保留当前交互。先读本change、AGENTS与动效契约。参考源码在data/liquid-glass/reference/{index.tsx,shader-utils.ts,LICENSE}；原理学习但不用库React代码。
# 2. 仓库状态
当前codex/liquid-glass-optics，HEAD039b73a，已有键盘/单双击未提交diff必须保持。原代码快照data/liquid-glass/baseline；不要修改这些备份。CLAUDE本地执行，Codex独立审查测试。禁止启动子代理。
# 3. 本轮目标
清透、边缘轻微折射/色散/高光，四目标布局不变、键盘原逻辑不变。必须是真实局部效果，不能用彩虹线冒充折射。复用原GLSL导航光学，不重写shader架构。
# 4. 修改范围
仅scope.json中的代码路径，除scripts/check-liquid-glass-optics.mjs由Codex写测试不可动；不要改OpenSpec。允许新LiquidGlassSurface.vue、interaction/glassOptics.ts、公有MIT文件，6个已有组件/模块。不得改CompanionChat.vue、chatViewport、chatScroll、DormCompanion、全局theme/glass.css、业务或其他页面。LiquidNavGlass被AppearanceSettings共用，新增可选optical参数由ChoreBottomNav显式启用，默认旧行为以免越界。ElasticSegments仅scrub=true即日历启用新材质，其他使用保持原样。
# 5. 禁止事项
不提交/推送/PR/发布、不改密钥/生产/原生/依赖/排版字号/尺寸/主题/导航事件/完成动画。不增加idle无限RAF/动态blur/整屏filter，不对前景文本filter，不增加与现有transform冲突的驱动。不做ua字符串冒充能力检测；CSS.supports仅代表语法，不能单凭它就声称SVG背景已渲染。能力不确定安全降级。不修改其他人workingdiff，不全局格式化。
# 6. 具体任务
实现可复用纯装饰Vue光学层与能力函数：pointer-events:none；保守能力渐进增强（优先实际可证据的CSS/WebGL路径），CSS降级保留透明玻璃/高光，prefers-reduced-transparency实底，reduce-motion不追踪动态高光，后台取消RAF与清理。可使用SVG filter渐进增强但无像素级支持证明不能默认启用不稳定背景滤镜。只需光学原则不必复制实现。局部响应可通过现有容器pointer事件的被动监听更新高光CSS变量，rAF合帧且仅交互期间运行；不重算布局每帧，可缓存pointerdown尺寸，释放复原。避免拦截/改动父手势。所有前景清晰，装饰层不能覆盖焦点与发送按钮。
导航：optical显式opt-in，原按住放大/边界/背景标签扭曲与spring不变，边缘SDF曲率/细RGB偏移与方向高光微调，色散上限<1.5px不彩虹描边；只用原压力/速度数据，不添第二弹簧。不要改glassGeometry的既有尺寸轨道。帽沿柔和约1px。
输入框：保持原minheight58、padding、borderRadius30、两次触摸编辑/IMEguard/resize不变；在背景增加可复用光学层，透明填充约24%-30%，blur固定6-8px，双层轻阴影/焦点微调不大光晕。保留已有输入press驱动。
消息：保持原60高/32radius/flight/swipe/hold/timers/业务，背景从实底改为局部清透玻璃，但避免下层文字竞争（低alpha+固定适度blur）。轻微边缘高光从swipe现有偏移派生，不另外驱动transform。
日历scrub：原selection.transform唯一位置来源与follow/highdamping保持，只改滑块透明度与装饰层；指标不能盖文字。
把reference/LICENSE原文复制到frontend/public/licenses/liquid-glass-react-MIT.txt，在光学源注释注明来源与仅原理适配、分发许可证路径；不冒称原仓库全部MIT可涵盖第三方来源。
# 7. 验收标准
typecheck/build、限定文件prettier通过，原键盘98两引擎/原玻璃/日历scrub相关回归不破坏。Codex负责独立截图/性能测试与真实限制。不要自行放宽测试。性能如无设备不能声称native已验收。
# 8. 完成后输出
精确文件、材质层级/降级策略、运行过的检查与局限、无关diff不变。不要运行耗时无关后端/原生全量测试。先完成小步代码并尽快反馈结果。
