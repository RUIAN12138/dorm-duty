# 本地验证（2026-11-04）

- 隔离 SQLite：`node site/scripts/check-recency.mjs` 56 项通过，包括全历史人员、补录、修正、删除、相同时间按有效历史 ID 倒序、跨宿舍拒绝。旧任务及轮序未更动。
- 基于 `check-dorm-wizard.mjs` 的隔离临时副本，在既有硬性模式授权代做断言后增加 activity 返回实际代做者姓名的断言；109 项通过，临时副本不保留。
- `node scripts/check-calendar-card-flip.mjs` 与 `DORM_BROWSER=webkit node scripts/check-calendar-card-flip.mjs`：分别 19、18 项通过，真实日历入口；包括最近姓名/完整时间与屏幕阅读器标签、旧响应缺姓名兜底、无记录、键盘翻转、短拖中间位置和回位、不误翻面、后续点击翻面、长拖切换、320/390/430、减少动态效果和无浏览器异常。Chromium 另通过 CDP 触摸短拖，主要手势检查使用鼠标；非实体手机。
- 前端 `npm --prefix frontend run build` 通过。OpenSpec 严格验证 49 项通过；移除工作区临时依赖软链接后单独运行范围检查。`git diff --check` 通过。

未经用户验收，未发布、未合并；iPhone Safari、Android WebView 和 HarmonyOS ArkWeb 未实机测试。浏览器测试产生的记录均为隔离模拟。
