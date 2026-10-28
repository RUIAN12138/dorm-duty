# Verification

- `node site/scripts/check-water-duty-preview.mjs`：隔离 SQLite 与草稿模型对比放在值日页、第二页及旧宿舍；3 位模拟成员的抬水交接、撤销及旧宿舍五表快照通过；球球个人任务上下文不重复计入抬水。
- `site/scripts/check-water-duty-browser.mjs`：Chromium、WebKit 真实 Vue 组件检查通过，正式组件和全屏预览均可切换到抬水任务，预览没有业务网络请求。
- 沙箱完整浏览器回归 Chromium、WebKit 通过；草稿沙箱 32 项、创建向导 108 项、动态任务迁移及球球事实检查通过。
- 前端构建和 `npm run spec:check` 通过。浏览器为模拟触摸；未验证实体 iPhone、Android WebView、HarmonyOS ArkWeb。未访问正式数据或部署。
