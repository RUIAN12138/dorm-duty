# Verification

- 前端 build、`npm run spec:check` 通过。
- `node site/scripts/check-companion-facts.mjs`：26 项通过，独立 SQLite 和模拟模型，含认证身份、本轮名单、缺失数据、提醒操作边界。
- `node site/scripts/check-companion-ai.mjs`：79 项通过，模拟模型和隔离数据。
- 催促页面浏览器及沙箱教程 Chromium/WebKit 均通过；新增教程步骤通过实际滑动完成，预览不触发真实业务写入。
- 浏览器模拟不等于实体 iPhone、Android WebView 或 HarmonyOS ArkWeb 验收；未使用真实模型测试泛化问答。
