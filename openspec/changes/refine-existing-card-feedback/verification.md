## Status and workflow
2026-10-23，独立分支 `codex/refine-card-feedback`，基于 `e71f61d2cfaec1e67dd758e80f10363e196a6ac6`。初始阶段仅本地修改、隔离预览与自动测试，未执行正式操作。用户随后明确「更新到网站 提交 pr」，授权当前批次审查PR、开发分支推送及部署；不授权main合并，产品/实体设备验收仍pending。正式发布仅代码切换，不替换或恢复数据库。
先读项目动效契约、frontend-design、emil-design-eng与本地TiltedCard/AnimatedContent参考；事前写八节CLAUDE_TASK并尝试CLI，返回402 Insufficient Balance且未修改代码，记录 `data/card-feedback/claude.log`。已向用户说明后在同一精确范围实现并独立复核。

## Change list and before/after
| Before | After | Why |
| --- | --- | --- |
| 现有tilt指令无当前组件调用，通用按压约0.96 | 相同指令入口，局部1.6°上限、1.5px下沉、0.992目标缩放 | 保持黑白风格与尺寸，仅增强触感 |
| 宿舍卡本地active缩放与通用反馈可能叠加 | 移除该卡重复缩放，公共控制器仅排除带所有权标记的直接宿主 | 同一scale单一驱动 |
| 记录与月份各自横滑 | 小幅触点跟随，移动超过8px释放；无preventDefault或capture | 原有滑动/纵滚优先 |
| 成员已有240ms长按/Reorder | 仍用原held，内层4px上浮与局部阴影opacity | 不新增识别器、不改顺序/权限 |

运行时文件仅：`interactions/tilt.ts`、`interaction/cardFeedback.ts`、`interaction/pressFeedback.ts`及 `ChoreBoard/ChoreCalendar/ChoreRecordRow/RecordTimeline/JoinedDorms/SortableMemberRow.vue`。ChoreBoard只多两处标题指令绑定，其他接入点均为现有表面；不将完成按钮或其祖先整体倾斜。SortableMemberRow保留原外层Reorder缩放/位移，内层无额外scale增幅。未修改Swiper、月份、完成、催促、交接、聊天、玻璃、全局样式、依赖或服务端。

指令只在一次pointerdown读一次rect，move缓存坐标并RAF合帧。原transform不改，独立translate/rotate/scale恢复原值；已有独立属性所有者不抢占。release保留速度，视觉剩余小于0.005度/0.02px且速度充分收敛后恢复原内联状态，不使用固定收起定时器。滚动、pointercancel、blur、keyboard、reduce、hidden、unmount均释放。

## Before implementation evidence
修改运行代码前，Chromium/WebKit各在320/390/430px记录值日标题、抬水标题、日历表面的几何/排版，共每引擎9处。原基线脚本用同名width保存元素宽度，后为已知循环的视口宽度另加viewportWidth字段，原几何数据未改；脚本同步修正。基线 `data/card-feedback/*-baseline.json`，修改前截图 `*-before-duty.png`、`*-before-water.png`、`*-before-calendar.png`。
修改后相同视口的位置/宽高差异均<0.5px，fontSize/lineHeight/padding/borderRadius完全一致；截图 `*-after-*.png`。实际查看前后值日截图、成员悬浮截图与最终预览按压截图；不把静态截图当作动效证明，中间状态另有断言。

## Verification
证据目录 `data/card-feedback/`；所有接口/数据操作只在内存合成宿舍。无真实AI、邮件或推送。

| 命令或检查 | Chromium | WebKit | 证据 |
| --- | --- | --- | --- |
| `node scripts/check-card-feedback.mjs` | 13项纯数学/所有权检查 | 同一纯测试 | `pure-final.log` |
| `DORM_BROWSER=<engine> node scripts/check-card-feedback-browser.mjs` | 47项 | 47项 | `*-result.json`, `*.log` |
| `node scripts/check-record-swipe.mjs` | 27项 | 27项 | `*-check-record-swipe.log` |
| `node scripts/check-order-boundaries.mjs` | 30项 | 30项 | `*-check-order-boundaries.log` |
| `node scripts/check-completion-experience.mjs` | 193项 | 193项 | `*-check-completion-experience.log` |
| `npm run web:test-state` | 22项通过 | 不属于引擎测试 | `state.log` |
| Vue typecheck / 隔离build / 精确Prettier / diff检查 | 通过 | 不属于设备验收 | `typecheck-final.log`, `build.log`, `format.log` |
| OpenSpec严格校验、范围、18项门禁自测 | 通过 | 不代表用户验收 | `spec-final.log` |

47项包括九处原样几何、值日/抬水按压及取消、月份空白按压后让位真实切月、原transform字面保留、一次rect/无move测量、多个回弹中间位置、快速反复操作、原个体属性不被覆盖、禁用、纵滚取消、记录侧滑后撤销/修正可达、修正原事件、真实长按Reorder变更顺序、内层上浮与阴影、松手恢复、深浅/减动效/键盘切换/blur/unmount。全程无应用运行错误。
Chromium在快速全页夹具导航时有1条Vite开发HMR `WebSocket closed without opened.`；核对堆栈只来自 `/@vite/client`，单独保存在developmentTransportWarnings，应用错误仍为0。WebKit该项为0。不隐藏其他错误，也不把本地开发连接诊断当作已发布运行时错误。
既有回归保留原侧滑权限/显式操作、真实竖向触摸滚动、轮序边界/底部成员/页脚、完成/撤销/失败/粒子与局部圆环等检查；不改旧测试来消除失败。未测实体GPU帧率，不宣称无真机性能回退。

## Preview and delivery boundaries
预览 http://127.0.0.1:8092/?start=1 ，抬水本人视角 http://127.0.0.1:8092/water?start=1&as=1 。当前PID记录在 `data/card-feedback/preview-server.json`，使用内存宿舍和模拟AI、不发邮件/推送。旧本地预览元数据先保存至 `previous-preview-server.json`，再只停止已确认的旧预览进程。`check-preview.mjs`实际访问并确认新指令挂载、按压可见及隔离状态，`preview-check.json`通过。截图在既有入场结束后采集，不误用页面入场帧充当卡片反馈。
本机xcrun没有可用实体iPhone，adb devices无设备，hdc为Empty；没有操作实体Safari输入法、Android WebView或HarmonyOS ArkWeb。遵循用户既有先预览选择，不重复要求连接设备。
初始预览阶段PR/publish门禁均拒绝，原拒绝日志保留。最新用户指令「更新到网站 提交 pr」分别绑定当前批次PR、publish摘要；全部在途scope记录本次动作授权，acceptance仍pending，不追认用户验收或真机结论，不复用v79旧摘要。

## v80 delivery preparation
本次发布仅追加ReleaseNotice的v80三条更新说明，不改弹窗尺寸、布局、交互；版本名 `20261023-card-feedback-v80`。PR以 `codex/chat-prompt-bubbles`（#83）为base，只展示本轮差异，不合并任何分支。
复核发现新浏览器测试依赖本机data中的修改前基线，新clone会缺少这些未提交证据；已只修正测试可复现性：可通过DORM_CARD_BASELINE_DIR提供基线，没有原始文件时仅检查视口边界并明确记录originalGeometryCompared=false，不能冒充前后对比。DORM_CARD_EVIDENCE_DIR可单独保存复现证据。运行卡片实现未再改动。
部署前确认服务器仍是v79、健康active；先SQLite在线备份并保存完成记录摘要，再校验上传包、原子安装与只读公网冒烟。结果完成后补充真实路径与记录数。
