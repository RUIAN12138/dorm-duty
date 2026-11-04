# Verification — 2026-11-03

仅本地隔离验收，用户验收仍 pending，未发布。

- `node site/scripts/check-water-nudge.mjs`：39 项通过，含200次并发单请求、429与成功回执区分、冷却持久化、失败重试、旧成功回执不能掩盖后续限流。
- `node frontend/src/components/nudge/ActionFeedback.browser.mjs` 及 `DORM_BROWSER=webkit`：Chromium/WebKit 各17项通过，空记录CTA与上一月已知记录、按压中间帧、等待/成功/503/429/409、反复点击冷却、已学手势不重复演示、320/390/430宽度、暗色/减动效和键盘入口。mock503使用既有接口错误格式兜底文案，原位置及球球均明确失败。
- 既有 `NudgePane.browser.mjs`，`DORM_WIZARD_ORIGIN=http://127.0.0.1:8123`：Chromium 42项，WebKit 40项通过。两项差异为Chromium专用真实touch事件注入（非实体触摸）。覆盖原手势/抽屉/预览/教程；未修改此测试。
- `npm --prefix frontend run build`：类型/Vite/PWA构建通过。
- `npm run spec:check`：48份规范和18项临时范围门禁测试通过；`git diff --check`通过。
- 测试前遇到本机缺少Playwright WebKit/FFmpeg，安装官方构建后重跑通过；首轮新CTA暴露正式路由未接通，修复后重跑。新测试曾等待折叠记录中的隐藏姓名及使用不正确的错误文案预期，修正测试操作/预期后重跑，没有绕过点击或删除业务断言。

## Evidence
本地 `data/frontend-polish/{chromium,webkit}/` 含 empty-after.png、press-midpoint.png、nudge-success.png、nudge-limited.png、empty-dark-reduced.png、results.json、原始webm。`before-empty.png` 来自853e7ab独立基线运行，已等待过渡完成。`data/task-nudges/{chromium,webkit}/results.json` 为既有回归结果。截图全为合成身份，没有正式数据。

预览 `http://127.0.0.1:8123/calendar?start=1`；本地8122服务使用createHarness内存SQLite和合成成员，没有真实推送服务/模型。教程及草稿预览保持原隔离实现。

## Boundaries
- 没有实体iPhone Safari/PWA、Android WebView或HarmonyOS ArkWeb验收；桌面WebKit不是iPhone真机。
- 未修复/声称修复先前iOS软键盘引起导航位移。本轮不改变键盘/导航/页面布局。
- 未改留言状态机，它已有等待回执及失败保留草稿；本轮具体回执修复仅催促。未增批量发送接口。
- 当前仅运行相关回归，不宣称全仓CI通过。
- 本地Claude Code探测返回402，未执行编辑；Codex完成这组小范围修改和审查。

## 2026-11-03 发布检查修复
用户明确授权仅修两项测试。check-recency 查询补录所属月份，跨月记录负ID、修正与撤回42项通过。check-ios-chat-motion 保留实例与动效断言，补齐多选后的继续操作，并用单次Playwright真实鼠标点击移动目标，避免先读坐标再跨协议点击的陈旧坐标。Chromium全部通过；WebKit结果后补。npm run spec:check通过。产品代码无变化，真机未测。

追加验证：check-ios-chat-motion Chromium/WebKit全项通过；check-live-calendar-notes 的唯一业务操作改为全选→继续后，Chromium/WebKit各17项通过，保持数据库断言。check-companion-tap-arbitration未改代码，本地原样通过，CI额外请求失败未定性，继续观察重跑。

## 2026-11-04 授权的两个测试

- check-companion-tap-arbitration Chromium 与 WebKit 完整通过：保留真实触摸/鼠标、280ms窗口检查、聊天不打开、零请求和表情断言；边缘双击实测约 50–72ms，未覆盖接近窗口上限的有效双击。初次 Chromium 并发运行出现约 500–750ms 的无效输入，缩短中心等待并单独运行后通过，原失败保留在本地日志。
- check-interaction-foundation Chromium 完整通过；帧边界反向采样同一面板，高 633px，差 31.53px、采样 8.6ms，保留原 20% 阈值和输入连续性断言。未改产品代码。
- spec:check 的48项规范和18项范围检查通过；执行时应避免并行测试产生的临时夹具进入范围扫描。远端 CI 与实体设备仍需分别核验。
