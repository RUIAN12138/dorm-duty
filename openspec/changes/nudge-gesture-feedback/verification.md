# Verification

- `npm run build --prefix frontend`：通过。
- `npm run spec:check`：通过。
- `DORM_BROWSER=chromium node frontend/src/components/nudge/NudgePane.browser.mjs`：通过。
- `DORM_BROWSER=webkit node frontend/src/components/nudge/NudgePane.browser.mjs`：通过。
- 覆盖大字区 touch-action、单人球球提示、横向任务与纵向人员切换、收起提示、原有提醒限流和减少动态效果；桌面模拟不等于实体手机触摸及回弹验收。
- 实体 iPhone、Android WebView 和 HarmonyOS ArkWeb 未验收。

- 注入服务端 503：Chromium 与 WebKit 均显示球球非弹窗失败提示，并可重试；仅为隔离模拟。
