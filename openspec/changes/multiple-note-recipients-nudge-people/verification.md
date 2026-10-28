# Verification

- 留言 API：隔离环境 35 项检查通过，包括收件人、权限、限流和已读。
- `npm run build --prefix frontend`：通过。
- `node scripts/check-chat-motion-continuity.mjs`：Chromium 通过。
- `frontend/src/components/nudge/NudgePane.browser.mjs`：Chromium 与 WebKit 通过，包括上下切人、横向任务切换、限流、预览隔离和减少动态效果。
- `frontend/src/components/onboarding/sandbox/Sandbox.browser.mjs`：Chromium 与 WebKit 通过，多人选取、预览无业务写入和数据库不变。
- 催促页任务详情复用抬水底部抽屉，提示轮换与状态反馈：Chromium、WebKit 操作检查通过。
- `npm run spec:check`：通过（移出测试产生的临时 HTML 后）。
- 上述为桌面浏览器及模拟移动视口；尚未验收实体 iPhone、Android WebView、HarmonyOS ArkWeb。未发布或访问生产数据库。
