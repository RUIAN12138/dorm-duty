## Information architecture
宿舍名称→任务→导航编排→完成规则→草稿预览→创建→邀请码。球球每步tips；独立产品引导由 `/guide` 提供；不用密码无需新设密码。
## State
同一draft对象管理任务/页面/导航，localStorage只存非敏感草稿；实际提交时原子保存新版配置。预览模拟操作不访问任务写API。
独立 `/guide` 教程逐页提供明确的“继续”，末页开始使用；教程页码、正文与主操作按滚动轨道当前最近页同步，胶囊只对内部标记做横向形变，触摸目标保持固定，不触发相邻页码重新排布。创建前置介绍不再重复讲解任务、轮换和预览。
创建进度滑块以pointerdown起点和pointerup终点作为手势边界事实；即使触屏系统合并最后一段pointermove，抬手落点仍应同步步骤，再吸附到最近有效步骤。纵向意图继续交回原生滚动。
新版任务设置工作台复用同一 `CreationProgress` 实现，依据创建/设置上下文提供不同的可访问名称；动态任务步骤仍可点按或拖动跳转，不显示数字刻度和额外进度文案。仅 schema v2 工作台使用该组件，legacy `ChoreSettings` 不变。
聚光引导在其模态宿主内用宿主本地坐标定位，并在视口、目标、引导头部/正文尺寸或步骤过渡变化后重新采样；异步测量以递增修订号丢弃过期结果。键盘与小屏仅使用视觉视口可见区计算，目标缺失时跳到下一个有效步骤；关闭时将焦点交还明确的真实触发控件，WebKit 未聚焦触摸按钮时使用该触发选择器回退。
## Compatibility
配置表version=2为显式边界，旧宿舍无记录仍走旧界面/规则。旧四栏管理能力为旧宿舍保留，不再作为新流程过渡。
## Scope
不改头像/标记资源和数据，指定任务成员展示删图标留姓名；局部Rounded系统字体栈无下载。
## Decisions
用户确认软性只提示，硬性按时间完成允许代做；保留原负责人，实际完成人另列，不改旧宿舍权限。步骤阻止误提交，最终统一校验。

## 2026-10-24 用户覆盖：极简向导与分组件动效
此前九字段 TaskEditor 不再使用。步骤以稳定主题 ID 管理，任务名称/说明、页面、模式、硬性时间、轮换分别编辑；条件步骤动态变化，保留草稿。新版设置先显示任务列表，再进入同一分主题编辑。球球保留实例；标题、控件、辅助操作分层入场。滑块单驱动跟手，释放选择最近有效步骤；模板/任务/导航调整用布局位移。
加入身份的必要关联文件 site/local/email-runtime.mjs：仅配置版本2且已验证邮箱可新建本人身份，原子绑定；禁止让同一邮箱在同宿舍重复创建，旧名单认领不变。创建者姓名复用当前已登录身份，无预填其他成员，无虚拟成员。
当前存储域只有四个稳定任务槽，预览明确最多四项；不伪称无限自定义。抬水沿用现有交接规则；新版 schema v2 非抬水任务仅开放已实现并测试的 `self_round`、`scheduled`、`completion` 三种模式，旧宿舍配置路径不开放新增模式。
本次仅隔离预览；不 PR、不合并、不发布、不写生产数据。

## 2026-10-24 ChatGPT P0 follow-up (implementation scope)
- The existing rules page keeps the five-stage wizard. Each task gets a compact three-way pacing choice; its selected mode is stored in the same draft, while the global preset remains a convenient default. Scheduled mode exposes execution and deadline wheel fields immediately in the rules stage.
- `completion` handoff is created only from an explicit schema-version-2 configuration. Runtime keeps at most one pending turn per task and advances it transactionally after the assigned member completes. Legacy category settings continue to reject non-water `completion`; no historical rows are migrated or rewritten.
- The page-arrangement stage exposes the existing `second_page_kind` selector in both workspace and new-room creation, so draft, preview navigation, and final configuration read the same value.
- First-use guide completion is scoped by room and member. Entry is deferred until authenticated room configuration has loaded; skip and finish return to the caller. Manual replay retains the source route. Legacy rooms do not auto-open it.
- Preview safety is enforced at handlers that can issue business requests, not only by hiding controls. Browser verification observes outgoing API requests while exercising task, reminder, push, account, and room actions in the real preview component tree.
- No production data is used. The tests create isolated rooms and synthetic preview fixtures only.

## 2026-10-24 补充：新建向导最多五个主页面

新宿舍创建流程固定为五个主页面：宿舍名称、任务、页面安排、规则、预览/确认。名称与说明在任务页中选中单项后编辑；第二页用途并入页面安排；软/硬模式、按任务时间与轮换并入规则页，同一时刻只展开一个任务的细项。条件时间控件仅在硬性模式下显示。不得把原来的十余个内部步骤继续展示为进度刻度。

创建向导的顶部进度使用大触控区域和黑白轨道，当前页由单个玻璃滑块表示。拖动时按当前最近有效页面实时更新内容、标题和球球 Tips，松手吸附至页面中心；跨入新页面时只尝试触发一次短触感反馈。此设计只应用于新建向导，旧宿舍设置入口保留既有步骤条。

## 2026-10-24 补充：创建向导页面编排
创建流程的页面编排步骤使用该步骤专属的紧凑顶部空间：减少球球区域与进度条之间的占用，并收紧标题上方/下方间距；只对创建流程生效，不影响工作台或旧宿舍。正文用两个等宽列呈现「值日页」和「第二页面」，任务以名称按钮展示；第二页面的「任务 / 催促」选择并入右列标题区。点任务名称将其移至另一列，长按后沿用 Pointer Events 拖动，目标列即时响应，Motion LayoutGroup 负责跨列布局补位。值日页最多四项；超限保留现有简短状态提示。球球 Tips 承担操作说明，正文不再显示长按提示或重复数量/方向图标。

默认 390×844 视口下标题、双列任务和步骤操作必须同时可见且正文无需滚动；320px 宽度仍维持双列且不横向溢出，任务项采用稳定行高而不缩小基础字号。屏幕高度极短或系统文字放大时允许安全纵向滚动，不裁掉内容或底部按钮。改变页面归属或第二页类型只更新同一个本地 draft 和实时预览，不写入任务记录；旧宿舍设置入口沿用原展示与交互分支。

## 2026-10-24 补充：教程与规则页减负
欢迎教程每页只保留一条短说明，并指出对应的实际操作入口；留言页说明从球球发出留言、回首页点消息入口查看回复。规则页的三种节奏保留现有主标题，附一行短释义；文案与选项在同一按钮中，使用紧凑纵向排列，不增加卡片数量或步骤。只改 `/guide` 与新版创建流程；常规 390×844 视口仍需容纳规则主态及一个已展开的时间轮，不缩小主标题、不改服务端语义。

## 2026-10-24 补充：创建入口直达首个可编辑步骤
新建宿舍不再挂载创建专用的三页 `WelcomeSlides`，入口直接渲染五步向导的宿舍名称页。产品介绍继续由独立 `/guide` 承担，新版宿舍首次进入的引导继续由既有路由逻辑触发，工作台聚光讲解保留手动入口。首帧即提供可完成的真实设置，避免在一个创建任务前重复解释任务、轮换和预览。

## Room-name step
宿舍名称步骤以大标题和单个输入框为主要内容；字段通过 aria-label 保留可访问名称，不再额外显示重复字段标签。舍友自行填写姓名的规则收敛到球球简短 Tips，避免首屏出现重复说明。姓名必填校验、最大长度、草稿持久化和后续创建流程保持不变。

## Rule-stage tip copy
仅将新建向导规则步骤的球球提示从重复当前选择动作的句子收紧为“之后可调整”。保留“这一选择可以修改”的事实；不改规则标题、三种节奏释义、任务级覆盖、布局、动效、验证逻辑或既有宿舍工作台。验证规则主态提示及三个节奏选择仍正常。

## Version-2 notification permission preflight
新版宿舍从 ChoreBoard 打开 ChorePushSettings 时，通知设置抽屉本身就是权限说明层：用途文案与开启按钮同屏，`enableMemberPush` 仍只在明确点击后调用 `Notification.requestPermission()`。移除 ChoreBoard 前置的第二个 PermissionPrimer 抽屉，不更改推送配置、订阅、错误恢复或旧宿舍入口。回滚时可恢复前置抽屉与 `pushPrimerAccepted` 状态；不需要数据迁移。

## Creation progress resize fallback
`CreationProgress.vue` 通过本地 `observeElementSize.mjs` 选择 `ResizeObserver` 或窗口 `resize` 回退，并保留返回的清理函数，在组件卸载时调用。浏览器回归直接使用无 `ResizeObserver` 的隔离环境验证回退监听的触发与清理；主页面继续覆盖真实创建进度控件的取消、丢失指针捕获和反向拖动。

## Welcome guide copy hierarchy
欢迎教程标题负责标明当前主题，正文只增加标题未提供的操作地点或有用补充。首屏正文不再复述“打开首页”；日历页标题已说明查看完成记录，正文仅提示设置里可以调整任务。四页结构、真实操作路径及球球内容保持不变。

## Validation feedback follows the draft
`DormWizard.vue` 的 `localError` 在用户编辑草稿后，根据当前步骤重新计算；有效输入立即清除已解决的错误，未解决的错误显示最新提示。预览/确认步骤使用 `draftErrors(draft)`，其它步骤继续复用现有 `issue()`。只改状态提示与 `check-dorm-wizard-browser.mjs` 的断言，不改表单校验、输入布局或业务 API。

## One-action live preview access
仅在新宿舍创建流程的四个可编辑步骤中，页脚「预览」直接调用现有 `openPreview()`，不先切换到第五个确认步骤；既有宿舍设置工作台仍沿用原先跳到预览步骤的行为。关闭全屏预览仍通过现有 `close` 事件恢复向导；草稿、步骤、滚动位置与现有正式页面组件保持原样。最终确认页自己的「打开实时预览」与创建操作不变。浏览器回归从规则步骤打开、关闭并重开，检查步骤/选择保留及预览无业务 API 写入。

## 2026-10-24 补充：教程入口名称与页面编排提示
欢迎引导使用正式导航中的「值日页」，留言说明提示从「设置」里的「室友消息」查看；不再使用未出现在底部导航中的「首页」名称。创建流程的页面编排 Tips 明确区分轻点移动任务和长按拖动。仅调整三处提示文案，并用浏览器断言对照正式导航及操作行为；流程、布局和业务状态保持不变。
