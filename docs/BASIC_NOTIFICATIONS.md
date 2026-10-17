# 基础通知交付范围

最新路线：增加 [邮箱验证码账号与 SMTP 邮件提醒](EMAIL_ACCOUNTS.md) 作为不依赖轮到 App 在线的提醒通道；极光保留在线补充，不继续厂商接入。SMTP 测试邮件和页面验证码绑定已由用户确认；业务催促、定时邮件的真实收件仍单独验收。Android 和 HarmonyOS 基础通道均已在专用模拟器实际显示完整通知并点击恢复，真机后台矩阵仍未完成，记录见 #37 / #39。

2026-10-16 用户选择：Android、HarmonyOS 先使用极光基础通道，不接厂商通道，不要求申请企业厂商账号。iPhone 继续使用已验收的 PWA Web Push。本轮不引入自建长连接、常驻前台服务、ntfy 或强制后台保活。

## 实现

- 服务端仍使用现有单设备队列、设备凭据、幂等、失败重试和过期取消。原生消息显式指定 `options.third_party_channel` 的 `distribution: jpush`；Android 组合通道同时指定 `distribution_fcm: jpush`，HarmonyOS 仅设置官方支持的 `hmos.distribution`。不自动转厂商或 FCM。
- Android 1.2.1 保留 JPush / JCore 基础 SDK 与内部服务，用户主动开启后注册设备；基础测试通知已在 Android 15 模拟器收到，详情见 [安卓验收记录](ANDROID_PUSH_ACCEPTANCE.md)。本轮没有修改 Android 原生代码。
- HarmonyOS 1.2.1 在 AbilityStage 配置 SDK、渠道、权限申请方式、回调和后台连接选项；配置阶段不启动推送连接。用户主动开启或恢复已开启状态后，才初始化 SDK。
- HarmonyOS 使用 SDK 自身基础长连接，`setBackgroundEnable(true)` 只阻止 SDK 在退后台时主动断线，不申请长时后台任务、不绕过系统挂起或终止。回到前台时恢复已同意的连接。
- 鸿蒙注册等待有 20 秒上限，初始化并发合并，失败可重试；基础通道通知点击回调和 Want 入口共用受限路由与消息去重，不记录注册信息、令牌或通知正文。
- 关闭通知、设备身份隔离及原 Web Push 配置保留。服务端“接受”与设备“显示”分别记录，测试提示不宣称已送达。

## 验收与使用边界

1. 安装当前平台包，进入正式宿舍，选择自己，再在系统通知设置中主动开启并授权。游客模式不注册设备。
2. 测试标题与正文、点击目标页，以及重启后的宿舍身份；另测前台、按 Home、锁屏、划走最近任务、强制停止和断网恢复，逐项记录。
3. App 进程/连接在线时，以真实收到系统通知为验收点；不把构建、订阅成功或服务端接受代替设备显示。
4. 不承诺进程被终止、用户强制停止、系统限制后台、设备断网时即时送达。重新打开 App 后同步站内消息，推送本身还受保存时限约束。
5. Android 调试包不能代替固定 release 签名与升级验收；HarmonyOS 未签名 HAP 只用于允许该安装方式的专用模拟器，真机需要本应用签名和分发配置。

本轮回归：鸿蒙生命周期/注册/路由隔离检查 16 项；原生设备绑定与定向投递检查 50 项；Web Push 队列/加密/权限回归 156 项；调度器重启检查 18 项；鸿蒙 6.1.1 本地构建与模拟器安装通过。鸿蒙真实服务端注册和设备送达结果继续在 [#37](https://github.com/RUIAN12138/dorm-duty/issues/37)、设备场景在 [#39](https://github.com/RUIAN12138/dorm-duty/issues/39) 更新，不预先标为完成。

厂商通道 [#38](https://github.com/RUIAN12138/dorm-duty/issues/38) 移出当前交付范围，后续仅在用户改变路线时继续。原有厂商调查资料保留作历史参考，不作为这一版的上线条件。

参考：[极光下发策略](https://docs.jiguang.cn/jpush/practice/push_strategy)、[鸿蒙 SDK API](https://docs.jiguang.cn/jpush/client/HarmonyOS/hmos_api)。
