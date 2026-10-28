# Verification

- `site/scripts/check-water-duty-browser.mjs`：Chromium/WebKit 隔离真实 Vue 界面中，值日页抬水完成、刷新后撤销；预览完成和撤销均通过，预览无业务网络请求。
- `site/scripts/check-water-duty-preview.mjs`：隔离 SQLite 中三位成员交接、本人撤销、下一位完成后拒绝旧撤销、旧宿舍五表快照均通过。
- 草稿沙箱 32 项、创建向导 108 项、球球事实、完整沙箱浏览器 Chromium/WebKit、前端构建及 spec:check 通过。
- 未访问生产数据库或部署；实体 iPhone、Android 和 HarmonyOS 尚未验收。
