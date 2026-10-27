# Verification

2026-10-27：独立开发分支与本地隔离预览。用户要求继续完善创建/教程，本批不创建或更新PR、不合并、不部署、不连接正式数据库。验收状态仍pending。

## 本批实现与范围

- 新增纯内存草稿沙箱和Vue适配服务，复用正式ChoreBoard/CompletionAction/ChoreCalendar/CompanionChat/导航，不复制页面UI。教程原服务通过同一能力接口接入，原四节解说与自动推进机制不重写。
- 只在preview且invite/member/token严格匹配本地能力时使用模拟服务；正式网络分支不变。模拟打卡与撤销更新任务、轮次和日历；completion模式生成负ID下一位；禁止跨越已完成后续轮次撤销。完成权限继续使用shared/dorm-configuration规则。
- 退出/重进和导航拖动保留演练；任务/规则/身份变化重置沙箱，页面排序只回写创建草稿。模拟业务记录不落盘；草稿配置仍沿用原本本地保存逻辑。
- 催促与留言仅模拟，明确显示未发送真实通知。聊天使用本地回复，不接真实AI。共用组件仅增加本地能力接入及准确提示，没有修改正式布局/颜色/业务API。

## 已执行

- `node --experimental-strip-types frontend/src/components/onboarding/sandbox/draftSandbox.test.mjs`：32项，校验真实/伪造/不存在ID、身份/轮换、软硬权限、任务/轮次/日历一致、重复完成/撤销、交接和回退、后续完成拒绝回退、催促冷却、留言对象与冷却、精确已读、snapshot副本隔离、导航排序保留状态。
- `node --experimental-strip-types frontend/src/components/onboarding/sandbox/backendParity.test.mjs`：6项。冻结合成日期，临时SQLite真实API与负ID沙箱对照初态、self_round完成/撤销、completion交接/撤销；旧宿舍任务快照不变。仅单成员/两任务的受控对照，不是全部排班功能等价证明。
- `node --experimental-strip-types site/shared/draft-preview-rules.test.mjs`：2060项shared权限/预览数据检查通过。
- `Sandbox.browser.mjs`：桌面Chromium、桌面WebKit在390×844各23项。真实完成按钮→轮次→日历→撤销；重入保留；真实长按导航拖动写回草稿且不重置历史；抬水交接/催促/撤销；球球聊天→对象→内容→确认→模拟发送。随后走完四节教程所有真实点击/拖动，自动推进，无额外“下一步”。预览与教程阶段业务请求均0；全量临时数据库逐表快照相同；pageerror为0。
- 既有`NudgePane.browser.mjs` Chromium29项回归通过，含320/390/430px、深色/减少动态效果、真实合成后端限流、预览和教程隔离。未编辑该旧检查。
- 类型检查、Vite/PWA构建、OpenSpec严格校验、scope与18项门禁夹具通过。前期构建发现欢迎消息缺request_id已修复；修改运行时代码期间一次WebKit流程被Vite热更新重置，冻结源码后完整重跑23项通过。
- 证据在`data/draft-sandbox/{chromium,webkit}/`：results.json、完成日历和教程截图、Playwright原始webm。均合成数据与桌面移动视口，非实体iPhone截图/录屏；数据目录不提交。

## 仍需验证/不支持

- 沙箱只演示当前日期操作，不是完整的跨天排班器；抬水补偿/跳过等高级例外继续受预览保护，不声称已模拟全部服务端业务。日期变化或配置变化会重新生成演练。
- 聊天不运行真实AI；不据此评估AI身份理解或生产通知投递。
- iPhone Safari/PWA中文/英文/表情软键盘、Android WebView、HarmonyOS ArkWeb实体设备、触摸帧率与真实Haptic均未验收。桌面WebKit不能代替上述设备。
- 当前精确新SHA的远端完整CI尚待触发/查询，不能沿用v85全绿。用户视觉/手感验收待完成；不更新任何发布授权摘要，不PR/合并/部署。
