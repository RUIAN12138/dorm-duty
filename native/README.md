# 轮到 · 安装版通知接入

2026-10-16：网页已到 v40r1，Android AppKey 已由项目所有者提供。服务器只读核对仍缺原生推送配置，厂商插件未接入，adb 暂无连接设备。本轮增加服务器私密配置工具与固定 release 签名接入，均不等于真实通知或发布包已交付。最小发布路径和 Issues 见 [Android 发布清单](../docs/ANDROID_RELEASE.md)。

2026-10-14 历史记录：安卓 APK、鸿蒙未签名 HAP 和原生设备绑定接口已实现。当时尚未创建推送应用、未配置厂商通道、未在安卓或鸿蒙真机验收。iPhone PWA 继续使用已验收的 Web Push。

2026-10-15：1.2.0 本地体验版补齐主页面连接失败 / 20 秒超时后的重试入口，保留原有身份和目标页面；子资源错误不替换整个界面。鸿蒙返回键改为先关闭网页最上层抽屉，安卓增加 Android 15 系统栏避让。网页收到鸿蒙迟到的原生桥后重新检测通知能力，通知面板的旧请求不覆盖新身份状态。两端构建通过，安卓单元测试 / lint 与桥接检查通过；真实手机 UI 和后台通知仍未验收。

安装工程已使用远程 Vue 页面。日常页面修改部署网站即可，不要求重装 APK / HAP；页面内发现 PWA 新版时确认「更新页面」。原生 SDK、桥和桌面卡片变化需要更新安装包。完整进度、原生提醒 / 卡片 / 替干等后续验收见 [App 演进清单](../docs/APP_ROADMAP.md)。

2026-10-15 模拟器推进：鸿蒙 6.1.1 专用模拟器已实际安装 HAP，打开正式 HTTPS 站点并完成游客选人、值日 / 抬水 / 日历切换、关闭重启后身份保留，以及系统返回先关闭菜单。未签名 HAP 只在该模拟器安装成功，不能据此分发给真机。Android 已按开发者提供的公开 AppKey 从构建参数重新打包，未把该 Key 写入源码；正式服务器检查结果为原生推送配置文件不存在。安装包与系统通知送达分别验收。

## 客户端

- Android：Java + Android WebView + AndroidX WebKit，最低 Android 6。页面使用正式 HTTPS 地址；保存宿舍和室友选择；系统权限由原生申请。JPush 5.6.0 / JCore 5.5.7 固定版本。
- HarmonyOS：ArkTS + ArkWeb + `@jg/push` 1.4.2，最低 HarmonyOS 5。HarmonyOS 4 系列可另验收 Android APK；HarmonyOS 5 及以上使用 HAP。
- SDK 仅在主动开启通知后初始化；不开启通知仍可使用宿舍功能。鸿蒙不启用分群推送/数据洞察。鸿蒙公共 AppKey 已接入；安卓源码默认不配置 AppKey，本机体验包通过构建参数注入。服务端缺少配套配置时仍显示未配置，不模拟系统通知成功。
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

macOS 本机可直接使用统一入口，脚本使用已安装的工具链，避免误用系统 JDK 26 或依赖未保存的 `local.properties`：

```bash
# 可选：把自己安卓应用的公开 AppKey 作为本次命令的环境变量传入。
# 不传时仍可构建界面体验包，原生通知会显示未配置。
DORM_JPUSH_APPKEY=<你的公开AppKey> bash native/build-preview.sh android
bash native/build-preview.sh harmony
```

输出目录为被 Git 忽略的 `data/native-preview/`。可通过 `DORM_JAVA_HOME`、`ANDROID_HOME`、`DORM_DEVECO_HOME` 指定其他安装位置。此脚本只构建和复制本机包，不安装、不上传，也不配置服务器密钥。Android 使用调试签名；Harmony 输出未签名 HAP，真机仍需本应用签名。

Android 需要 JDK 17 或兼容版本、Android SDK 35、Gradle Wrapper 8.11：在 `android` 执行 `./gradlew --no-daemon :app:testDebugUnitTest :app:assembleDebug :app:lintDebug`。默认生成调试签名 APK，可安装验收界面，未配置推送应用。输出在 `app/build/outputs/apk/debug/app-debug.apk`；本机本轮用 Android Studio 的 JDK 21 构建，GitHub CI 用 JDK 17。GitHub Actions 成功后保留 `lundao-android-preview` APK 附件 14 天；这是调试体验包，不含发布签名。

GitHub 临时 runner 的调试签名可能随构建变化，这些附件不作为连续覆盖升级的正式分发渠道。给室友长期使用前，应配置本项目固定的发布签名；版本升级需保持同一签名。APK / HAP 当前连接正式 HTTPS 站点，新网页修复在正式服务器发布前只可在本地验证。

HarmonyOS 需要 DevEco Studio 与 SDK 6.1.1：在 `harmony` 执行 `ohpm install --all`，再执行 `hvigorw --mode module -p product=default -p buildMode=debug assembleHap --no-daemon`。当前未配置签名，生成 `entry-default-unsigned.hap`，不能直接安装真机。DevEco 会负责配置签名，不通过代码生成假 Profile。

## 1.2.1 Android 推送注册修复

Android 15 专用模拟器复现 1.2.0 注册超时：JCore 明确报告缺少自定义 JCommonService。1.2.1 补充内部独立进程服务、SDK 发现 action 和接收器 action，并在 CI 检查实际合并 Manifest。已覆盖安装并保留验收宿舍身份，用户主动开启通知后成功注册；服务端测试发送返回 401，设备未显示通知。密钥配对和真实送达继续在 [#37](https://github.com/RUIAN12138/dorm-duty/issues/37) 跟踪，不能按“已注册”宣布通知可用。HarmonyOS 版本本轮不变。

## 设备验收

1. Android 安装调试 APK；HarmonyOS 先为 `cn.lundao.dorm` 配置本应用调试签名，再安装。重装 / 换设备时管理者用已保存的恢复码取回权限，不导入其他应用的签名。
2. 正常创建 / 加入、选人、值日与抬水打卡；完全关闭再打开，确认身份仍保留。
3. 打开任务详情、菜单或系统通知抽屉后按系统返回，先关闭最上层；无抽屉时按网页历史返回，入口页才退出。连续按返回不重复处理。
4. 网络断开后冷启动，或让主页面连接失败，检查「暂时连接不上 / 重新连接」；恢复网络点击后回到原任务页面，身份不被清除。图片等子资源失败不应覆盖整个页面。
5. Android 15 检查顶部系统栏、底部手势区、邀请码 / 恢复码输入键盘和横屏。当前 SDK 没有注册推送应用时应显示未配置，不能显示已成功开启。
6. 完成真实推送配置后，再测开启 / 拒绝 / 系统设置关闭 / 重新开启；换人后绑定新身份；锁屏、关闭应用和点击通知都用新消息验收。构建、队列接受或界面 toast 不能代替真实通知。

## 服务器接口与投递

- `GET /chores/native/config`：当前成员查询 Android/Harmony 是否配置。
- `POST /chores/native/subscribe`：平台、registration_id、device_id、device_secret；服务端只保存安装凭证的 SHA-256。只有持有设备凭证的安装实例可以重新绑定身份或轮换注册号。
- `POST /chores/native/unsubscribe` / `POST /chores/native/test`：必须验证成员与安装凭证；测试限制 60 秒一次。
- 复用站内提醒事务与持久化投递队列，按单个 Registration ID 发送；已读、完成、离开宿舍、关闭通知、切换身份后取消旧投递。重试、超时、失效设备与 Web Push 使用相同规则。
- 厂商接受消息不等于真机已收到。须验收两个成员互相提醒、锁屏、关闭应用、点击通知恢复当前身份以及重复催促不刷屏。

官方依据：[Android SDK](https://docs.jiguang.cn/jpush/quickstart/Android_quick)、[厂商通道](https://docs.jiguang.cn/jpush/client/Android/android_3rd_guide)、[HarmonyOS SDK](https://docs.jiguang.cn/jpush/client/HarmonyOS/hmos_guide)、[推送 API](https://docs.jiguang.cn/jpush/server/push/rest_api_v3_push)。
