# Verification

- Chromium 和 WebKit：单任务多名待完成成员时球球提示上下滑；切换不产生通知请求；学会后刷新不重复提示。完整催促页面回归 Chromium 42 项、WebKit 40 项通过，涵盖切换、失败提示、手势冲突和练习隔离。
- `node site/scripts/check-companion-facts.mjs`：29 项身份、权限、最新安排、抬水交接、缺失数据与状态检查通过；模拟模型 1 次，隔离 SQLite，无生产访问。`node site/scripts/check-companion-ai.mjs`：79 项既有检查通过。
- `scripts/check-guided-onboarding.mjs`：Chromium 和 WebKit 各 53 项，四章完成、撤销、催促、切换任务/负责人、留言确认和日历步骤均通过实际操作自动推进；练习没有 fetch/XHR。320/390/430px、深色与减少动态效果检查通过。修正已有脚本遗漏的两个催促步骤及多选收件人确认，并为正式组件布局使用隔离 SQLite 测试数据。
- 前端构建及 `npm run spec:check` 通过。旧版完整创建向导测试仍在自定义任务旧选择器处失败，与本次教程验证分别报告。
- 浏览器引擎模拟不等于实体 iPhone Safari、Android WebView 或 HarmonyOS ArkWeb 真机；尚未连接真实模型或生产数据库，未部署。
- 补充“我还有什么没做”场景：完成地板后，不再将其列入未完成清单；保留其他待完成任务，支持句尾语气词，抬水数据缺失时明确无法确认。隔离真实任务完成 API 后提问与纯事实测试共 33 项通过；原 AI 79 项、抬水预览及 spec:check 回归通过。
