# 轮到 · 安装版通知接入

2026-10-14：安卓 APK、鸿蒙未签名 HAP 和原生设备绑定接口已实现。当前未创建推送应用、未配置厂商通道、未在安卓或鸿蒙真机验收，不能声称后台/锁屏通知已接通。iPhone PWA 继续使用已验收的 Web Push。

## 客户端

- Android：Java + Android WebView + AndroidX WebKit，最低 Android 6。页面使用正式 HTTPS 地址；保存宿舍和室友选择；系统权限由原生申请。JPush 5.6.0 / JCore 5.5.7 固定版本。
- HarmonyOS：ArkTS + ArkWeb + `@jg/push` 1.4.2，最低 HarmonyOS 5。HarmonyOS 4 系列可另验收 Android APK；HarmonyOS 5 及以上使用 HAP。
- SDK 仅在主动开启通知后初始化；不开启通知仍可使用宿舍功能。鸿蒙不启用分群推送/数据洞察。当前 AppKey 为空，UI 明确显示未配置，不模拟系统通知成功。
- 安卓返回键通过受信任页面的 `DormNativeBack` 先关闭最上层抽屉，无弹层时再处理网页历史 / 退出；新版调试包构建和 lint 已通过，真机返回体验尚待验收。
- 原生桥只允许正式 HTTPS 站点的主文档，安卓使用 origin 限制的 WebMessageListener；鸿蒙将专用 MessagePort 交给主文档。客户端不包含 Master Secret，不忽略证书错误。

## 需要你完成的外部配置

1. 在[极光平台](https://www.jiguang.cn/)创建 `cn.lundao.dorm` 的 Android 和 HarmonyOS 应用。确认所选服务的资费；此仓库不会自动开通付费服务。
2. 在[华为开发者平台](https://developer.huawei.com/consumer/cn/)创建同名鸿蒙应用、启用 Push Kit、配置应用签名，并在极光控制台绑定鸿蒙厂商通道。使用 DevEco 的自动签名配置本机/真机的调试 Profile，生产分发另配置发布签名。禁止拿其他项目的证书或 Profile 冒用。
3. 安卓若要求关闭应用后也能收到，必须配置室友手机对应的小米、华为、vivo、OPPO、荣耀等厂商应用与插件，不能把极光在线通道当作全机型离线保障。当前 APK 集成极光基础通道；厂商插件需申请对应参数后按官方 SDK 指南集成和验收。
4. Android 公共 AppKey 用 Gradle 参数 `-PJPUSH_APPKEY=...` 注入；鸿蒙公共 AppKey 填入 `entry/src/main/ets/PushConfig.ets`。Master Secret 不进入 APK/HAP、前端或版本仓库。
5. 服务器只在 `/var/lib/dorm-duty/native-push.json` 读取安装版配置，文件模式 `600`、属主为运行服务账号。结构为 `{"android":{"appKey":"真实公开AppKey","masterSecret":"真实服务端密钥"},"harmony":{"appKey":"真实公开AppKey","masterSecret":"真实服务端密钥"}}`。不创建伪造凭据；没有这个文件时接口返回未配置。配置后重启 `dorm-duty.service`；原 VAPID 文件保留。

账号实名、平台条款确认和签名材料由你在官方页面完成。密码、Master Secret 和私钥无需发送到聊天。创建应用后可交由 Agent 继续集成公开应用标识及本机安全配置。

## 构建

Android 需要 JDK 17、Android SDK 35、Gradle 8.11：在 `android` 执行 `gradle :app:assembleDebug :app:lintDebug`。默认生成调试签名 APK，可安装验收界面，未配置推送应用。

HarmonyOS 需要 DevEco Studio 与 SDK 6.1.1：在 `harmony` 执行 `ohpm install --all`，再执行 `hvigorw --mode module -p product=default -p buildMode=debug assembleHap --no-daemon`。当前未配置签名，生成 `entry-default-unsigned.hap`，不能直接安装真机。DevEco 会负责配置签名，不通过代码生成假 Profile。

## 服务器接口与投递

- `GET /chores/native/config`：当前成员查询 Android/Harmony 是否配置。
- `POST /chores/native/subscribe`：平台、registration_id、device_id、device_secret；服务端只保存安装凭证的 SHA-256。只有持有设备凭证的安装实例可以重新绑定身份或轮换注册号。
- `POST /chores/native/unsubscribe` / `POST /chores/native/test`：必须验证成员与安装凭证；测试限制 60 秒一次。
- 复用站内提醒事务与持久化投递队列，按单个 Registration ID 发送；已读、完成、离开宿舍、关闭通知、切换身份后取消旧投递。重试、超时、失效设备与 Web Push 使用相同规则。
- 厂商接受消息不等于真机已收到。须验收两个成员互相提醒、锁屏、关闭应用、点击通知恢复当前身份以及重复催促不刷屏。

官方依据：[Android SDK](https://docs.jiguang.cn/jpush/quickstart/Android_quick)、[厂商通道](https://docs.jiguang.cn/jpush/client/Android/android_3rd_guide)、[HarmonyOS SDK](https://docs.jiguang.cn/jpush/client/HarmonyOS/hmos_guide)、[推送 API](https://docs.jiguang.cn/jpush/server/push/rest_api_v3_push)。
