# Verification

- 复现：正式页面实际为 `content-stage is-signed-in`，旧条件只接受 `app-stage`；修复前空白左滑仍停留在值日页，修复后进入催促页。
- Chromium 原生触摸模拟、WebKit 指针：空白区在值日、催促、日历间切换，底栏选中同步；纵向手势不切页，催促大字滑动不触发页面切换或业务请求，详情抽屉内横滑不触发切页。
- 既有催促全流程、实操教程 Chromium 回归及 TypeScript 检查通过；未做 iPhone、Android WebView 或 HarmonyOS ArkWeb 真机。
- 发布后远端校验：原有 72 条完成记录逐条摘要一致，迁移 0021 已应用，SQLite quick_check 正常；本修复尚未发布。
