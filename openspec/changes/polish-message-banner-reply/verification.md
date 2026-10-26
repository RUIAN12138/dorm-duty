# 消息浮窗专项修复验收记录

## 范围与根因
- ReminderBanner.vue：原长按3px取消阈值过严；触发长按后仍可能继承拖动/点击。改为10px意图锁定，长按后消费同一次手势，保留输入框原生选择操作。
- 回复输入框聚焦缩放进入裁切边界；为真实输入层保留8px水平空间，玻璃与交互内容分层，完整显示焦点边框。
- bannerReplyLayout.ts：变形后的尺寸参与键盘几何，内容变化重复启动定位动画；改用offsetHeight，内容resize直接跟随已有统一视口状态。
- ChoreBoard.vue：增加明确关闭消息的精确ID读回执；取消、遮罩、Esc、超时均不提交已读。沿用原持久重试队列，不改服务端业务规则。

## 自动化证据
- Chromium、桌面WebKit：各46项完整消息浮窗回归通过。使用隔离SQLite/API验证读回执，含发送失败、取消、关闭、重试、多消息、横屏、减动效。
- 专用预览：Chromium、WebKit各7项通过。模拟失败开关、草稿、取消、读回执失败与恢复；该预览后台是本地隔离模拟器，不是生产数据库。
- 状态机25项、留言API27项、应用内邮件17项回归通过；inbox与banner原有测试通过。
- 前后截图：data/message-banner/before.png、after.png；已人工查看输入边框、操作区域和单层背景虚化。

## 指定Sites测试发布
- project_id: appgprj_6acaee3055cc8191b7c6be7df7b5a66e
- Source commit: d2b370e60dbcddeb2d14795b4aad61b6a980ad60
- Version: appgprj_6acaee3055cc8191b7c6be7df7b5a66e~appgver_9d4d213d29048191bfce4e8c5588cbbf
- Deployment: appgdep_6adb80418d2c8191b315cc0351f3fe9a（succeeded）
- URL: https://lundao-dorm-duty.dapper-eft-1618.chatgpt.site
- 按本轮明确授权，仅更新指定Sites为测试版本，保留owner-private访问范围。合成数据、无生产API、无邮件推送、无正式账号。
- 与正式应用分开入口和构建；未修改IP正式服务器，未创建GitHub PR或合并main。

## 尚未验收
没有可用USB iPhone；Android WebView、HarmonyOS ArkWeb也未做实体设备测试。桌面WebKit和模拟VisualViewport不等于iPhone软键盘/输入法验收。真实设备键盘、光标选择、GPU流畅性及用户体验验收仍待完成，不能标为通过。

## 常规构建隔离
`npm run web:build`成功（含vue-tsc）；产物data/web-build-20261023154120020/frontend。扫描全部JS，四个测试入口/模拟数据标识均未进入常规构建。生成push-runtime仅包路径注释变化已核对并还原，未纳入修改范围。

## 本轮正式发布授权
用户在测试版交付后明确要求“更新到网站吧”，并随后建立SSH连接。仅授权把本轮消息浮窗修复与现有v80基线组成的正常应用构建发布至IP正式站点，不授权main合并、GitHub PR或无关后端分支。acceptance仍pending，实体设备验收仍未完成。发布前备份并保留原release回滚路径。
