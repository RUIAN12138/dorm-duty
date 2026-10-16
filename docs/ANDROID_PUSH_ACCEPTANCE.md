# Android 基础推送验收记录

验收日期：2026-10-16，北京时间。客户端代码基线 `8fe460c`，Android 1.2.1（versionCode 3），包名 `cn.lundao.dorm`。本页记录专用模拟器的实际观察，不代表厂商真机验收。

## 环境与范围

- 设备：专用 AVD `DormDuty_API35`，Android 15 / API 35，arm64。
- WebView：`com.google.android.webview` 124.0.6367.219。
- 安装：本机 debug 签名，覆盖安装，未清除应用数据。
- 站点：正式 HTTPS 服务，网页 v40r1；独立验收宿舍 `AndroidPushQA1016`、测试成员 `PushQA`。
- 通知权限：通过 Android 系统界面授权，包管理器确认 POST_NOTIFICATIONS 已授予。
- AppKey 从构建参数注入，并同步 Actions 变量 `DORM_ANDROID_JPUSH_APPKEY`；Master Secret 仅在服务器私有配置中。

## 实际结果

| 检查 | 操作与观察 | 结果 |
| --- | --- | --- |
| 应用与平台配对 | 所有者为匹配 AppKey 的极光应用启用 Android，包名与客户端一致；新设备注册信息保存到测试成员，极光设备查询返回 HTTP 200 | 通过 |
| 服务端接受 | 只向测试成员发送一条新测试通知；任务于 09:53:18 UTC 转为 accepted，attempts=1，队列 last_status=201 | 通过；该 201 为服务端投递适配器记录，不代表设备回执 |
| 系统通知显示 | 发送后按 Home 将 App 置于后台，展开 Android 通知栏，实际看到标题“轮到 · 测试通知”及包含 PushQA、抬水提醒的完整正文 | 通过 |
| 点击通知 | 点击该系统通知，App 返回验收宿舍的值日首页，没有邀请码或重新选人步骤 | 通过；仅覆盖测试通知的首页路由 |
| 重启身份 | 强制停止 App 后手动重新启动，仍显示验收宿舍与值日页面 | 通过；没有测试强制停止期间收通知 |
| 数据保留 | 配置切换前在线备份，更新后核对 560 条任务及历史表摘要，62 条已完成任务保持一致 | 通过 |

本轮没有向真实室友发送消息，没有提交值日或抬水打卡，没有重放旧的失败推送。保留两张本地截图：`docs/evidence/native-push/android-121-notification-visible.png` 和 `android-121-restarted-identity.png`；该证据目录被 Git 忽略，不含设备注册信息、邀请码、会话或密钥，不随公共文档上传。

## 原失败原因与修复

1. 1.2.0 未注册自定义 JCommonService，SDK 无法注册设备；PR #43 补齐组件与合并 Manifest 检查。
2. 旧 Android AppKey 与已保存 Master Secret 不配对，服务端返回 401。替换为匹配 AppKey 后，原有设备不属于该应用，校验返回 1011。
3. 匹配的极光应用最初只有非 Android 平台，Android SDK 返回注册错误 1009。所有者启用 Android 后重新注册成功；服务端备份、配置切换及重启后，新测试完成送达。

试验期间未启用 Android 的候选包没有分发。当前本机验收包已替换为与服务器匹配的包，SHA-256：

```text
76aa90ee7a8bdf9c063579c873636947ee85df71f10e8ce9a35679675a6bdd05
```

## 仍待验收

- 两位成员在实际手机上互相提醒、去重与关闭通知。
- 抬水提醒指向抬水页，而非测试通知的首页路由。
- 小米、华为 Android、vivo 等厂商通道参数、兼容插件，以及真机锁屏、划走最近任务后的送达。
- 系统强制停止、断网与恢复分别验证；不能将本页的后台在线测试扩展为这些场景。
- 固定 release 签名、实际手机覆盖升级、软键盘、返回手势、横屏与系统栏。
- HarmonyOS 服务端配置、真实系统通知与本应用签名。

对应任务：[#37](https://github.com/RUIAN12138/dorm-duty/issues/37)、[#38](https://github.com/RUIAN12138/dorm-duty/issues/38)、[#39](https://github.com/RUIAN12138/dorm-duty/issues/39)、[#40](https://github.com/RUIAN12138/dorm-duty/issues/40)。本轮不关闭这些尚有验收项的 Issue。
