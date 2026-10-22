# 验证记录

- Chromium：41项通过；WebKit：41项通过（data/conversation-preview/*-checks.json）。
- 真实消息几何位于输入栏后方，输入蒙层半透明且有 backdrop blur，输入命中仍落在 textarea；末尾确认按钮能完整滚到输入栏上方。
- 涟漪在连续点击中实际中间帧扩大，强度有上限，停顿后衰减；通知限流未增加发送，减少动效清除装饰。
- 原聊天回归 Chromium60项、WebKit58项通过；含键盘 visualViewport 模拟、多行输入、收起/返回、浅深色玻璃和 safe-area 连续性。两引擎用例分支不同，数量不强行对齐。
- 类型检查与正式前端/PWA构建通过，输出仅到 data/conversation-preview/build；不等于部署。
- 已查看浅色透出与深色截图：data/conversation-preview/chromium-glass-underlay.png；docs/evidence/companion-chat/webkit-dark.png。
- 没有实体手机或本轮 Android/ArkWeb 验收，键盘信号模拟不等于实体输入法测试。AI/通知为隔离模拟，不发送正式消息。
- 用户尚未验收；保留任务中的验收与发布授权未勾选。初始两项补丁如实回填，需求六按更新规范后实施。

## 最新：边缘增强分区玻璃（本次结果覆盖前述光学结论）

- Chromium43项通过，含独立同条纹像素检查：输入核心对比约34.4，上方过渡约13.8，底边约3.9，边缘比核心更柔化。数据见 data/conversation-preview/chromium-blur-profile.json。临时条纹只存在测试页面，不进入产品。
- Chromium系统减少透明效果模拟通过，新增4层隐藏、基础与输入滤镜关闭，输入保留。
- WebKit41项功能/样式检查通过，但报告状态为 passed-with-limitations；像素光学未通过验收。独立最小HTML控制页的24px backdrop blur截图也未模糊（对比约119.3），故记录测试运行器限制，不能称Safari效果已通过。校准与失败原图在 webkit-blur-calibration.json / webkit-blur-optical-fixture.png。
- 原聊天回归 Chromium60项、WebKit58项重新通过，包括输入可读性、实际图层参数、safe-area几何、多行输入、键盘视口信号、收起与返回、浅深主题。截图WebKit缺失光学不因这些功能测试而被追认。
- 类型检查与前端/PWA构建通过；无实体设备或本轮Android/ArkWeb验收，原生Safari/iPhone光学留作明确未完成任务。
- 最新代码只改两个聊天组件与针对性测试、规范文档；WaterNudge、其他页面、AI/留言后端与生产数据无改动。

## v72发布准备
用户明确要求“部署到网站看看”，只记录部署供查看授权，非全平台验收。正式Node链路web:verify全项通过；新版提示弹窗Chromium12项通过。发布前在线备份dorm-20261022T025230Z.sqlite成功，67条既有完成记录摘要已留在服务器，安装后逐条核对。预期版本20261022-conversation-glass-v72；实际安装结果记录到忽略目录，不能仅凭发布包生成声称上线。

## v72实际安装完成（2026-10-22 北京时间10:56）

- 正式版本20261022-conversation-glass-v72，代码commit fddb122241e5009d6a4526f31a5b2811c3e48da9；发布包SHA256 f8983c5163bbbc80277d1832114c7b3d699463d29b8f75d1b2af9b4ee1b32e6c。
- 服务器安装成功，健康status=ok / runtime=node-server / storage=sqlite，数据库标识不变。前版/opt/dorm-duty/releases/20261022-mobile-gestures-chat-v71保留。
- 备份dorm-20261022T025230Z.sqlite已完成完整性与外键检查；67条旧完成记录逐条摘要一致，当前仍67条。无数据库覆盖或业务迁移。
- 公网142个静态资源与包内字节SHA256一致；根/抬水/日历页面均是本轮首页。新Chromium会话显示v72与当前变更说明，运行时错误0。未在正式站点进行打卡、留言发送或真实AI请求。
- 证据在忽略目录data/conversation-preview/release-v72-{deployment.log,public-verification.json,public-browser.json,public-page.png}。只有发布供查看已完成，用户产品验收和原生Safari/iPhone光学仍未完成。
- 没有推送、创建PR或合并main。当前文档提交只记发布结果，不重新打包或部署；内容摘要变化后旧发布授权不会自动授权下一份包。
