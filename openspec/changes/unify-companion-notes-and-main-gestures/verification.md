# 验证记录（历史实现回填）

本变更在 OpenSpec 初始化前已经实现，不追认事前规范或产品验收。历史快照为 4e7fd2，详见 docs/CONVERSATION_INTERACTION_PREVIEW.md 与忽略目录 data/conversation-preview/acceptance-before-frost.json。

- 历史 Chromium/WebKit 各37项通过；Android15 WebView124 独立调试壳34项、OpenHarmony6.1.1.125 系统浏览器 ArkWeb 9项冒烟通过。
- 当前追加玻璃/涟漪后的 Chromium/WebKit 各41项（含本变更既有流程）通过。
- 本次没有重跑 Android/Harmony 模拟器，不将历史模拟器证据当作追加视觉调整的验收。
- 身份/留言/限流均使用内存隔离数据；AI 模拟，不发送真实邮箱/推送。实体设备、正式壳/原生桥和真实供应商投递未验收。
- 用户尚未验收；不建 PR、不部署，不读取或覆盖生产数据。

## PR CI兼容
旧CI的日历留言与球球检查仍断言独立留言输入框；本需求已明确统一聊天入口。仅更新这两个测试为聊天内对象/正文/确认流程，保留广播收件人、发送次数和原有日历/表情/设置断言，不恢复旧UI或删覆盖。
