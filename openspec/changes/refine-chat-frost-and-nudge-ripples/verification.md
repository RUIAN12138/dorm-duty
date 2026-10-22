# 验证记录

- Chromium：41项通过；WebKit：41项通过（data/conversation-preview/*-checks.json）。
- 真实消息几何位于输入栏后方，输入蒙层半透明且有 backdrop blur，输入命中仍落在 textarea；末尾确认按钮能完整滚到输入栏上方。
- 涟漪在连续点击中实际中间帧扩大，强度有上限，停顿后衰减；通知限流未增加发送，减少动效清除装饰。
- 原聊天回归 Chromium60项、WebKit58项通过；含键盘 visualViewport 模拟、多行输入、收起/返回、浅深色玻璃和 safe-area 连续性。两引擎用例分支不同，数量不强行对齐。
- 类型检查与正式前端/PWA构建通过，输出仅到 data/conversation-preview/build；不等于部署。
- 已查看浅色透出与深色截图：data/conversation-preview/chromium-glass-underlay.png；docs/evidence/companion-chat/webkit-dark.png。
- 没有实体手机或本轮 Android/ArkWeb 验收，键盘信号模拟不等于实体输入法测试。AI/通知为隔离模拟，不发送正式消息。
- 用户尚未验收；保留任务中的验收与发布授权未勾选。初始两项补丁如实回填，需求六按更新规范后实施。
