# Verification

2026-11-05 本地隔离回归，未使用生产数据或真实邮件。

- 自动提醒：`check-scheduled-reminders.mjs` 13个场景、248项断言通过，包含第一／第二自主轮次不创建系统提醒、旧排队通知取消、混合模式只提醒按时间安排任务、主动催促；同时直接调用服务器实际加载的 CJS 调度及投递。`check-email-delivery.mjs` 29项通过，覆盖旧的自觉任务邮件取消、混合任务过滤、按时间安排邮件与自觉任务手动催促。`check-undo.mjs` 73项通过。
- 关联隔离回归：轮次 187 项、邮箱账号 108 项、站内与邮件 17 项、催促 39 项、原生推送 50 项、成员推送均通过。邮箱失败日志来自测试主动注入故障。
- 手势：正式 content-stage 中 Chromium CDP 触摸和 WebKit 指针回归通过；额外验证列表容器空白切页、方向锁定、底栏状态、催促大字及抽屉不被劫持。复现修复前触摸 pointercancel，修复后轨迹完整达到 pointerup。
- 全局滚动条：390×844 Tabbit 浏览器使用13条隔离记录，滚轮和模拟触控使列表 scrollTop 大于0，同时 scrollbar-width 和 WebKit scrollbar 均为 none。保留纵向滚动。
- `check-list-collapse-sync.mjs` Chromium/WebKit各14项通过；卡片 WebKit 26项通过；聊天预览 Chromium 通过、WebKit通过且毛玻璃截图能力受限；前端状态 22 项、构建与规范／范围检查通过。
- `check-focus-compact.mjs` 在 Chromium 鼠标与模拟触摸各通过 93 项；日历整卡翻转 Chromium 27 项、WebKit 26 项通过。原有四张卡片数量、标题及布局断言未放宽，定位器限定卡片正面。
- 桌面浏览器/模拟触摸不是 iPhone Safari、Android WebView 或 HarmonyOS ArkWeb 真机验证；尚未部署。
