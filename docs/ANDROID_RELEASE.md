# Android 最小可用发布路径

2026-10-16 核对基线：main `8fe460c`，网页已发布 `v40r1`。Android 1.2.1 已在 Android 15 专用模拟器完成注册、系统测试通知标题和正文显示、点击返回正确宿舍，以及强制停止后手动启动保留身份。服务端 AppKey、客户端与 CI 构建变量已同步；固定发布签名、厂商通道和真机验收仍未完成。具体观察见 [安卓推送验收记录](ANDROID_PUSH_ACCEPTANCE.md)。

## 阻塞与任务

| 工作 | 当前状态 | 验收入口 |
| --- | --- | --- |
| 服务端极光配置 | Android 配置已匹配并重启，设备查询 200；测试任务 accepted、模拟器实际显示正文；两位成员互发仍待验收，HarmonyOS 服务端仍未配置 | [#37](https://github.com/RUIAN12138/dorm-duty/issues/37) |
| 厂商离线通道 | 基础 SDK 已有，小米 / 华为 Android / vivo 插件和平台配置待做 | [#38](https://github.com/RUIAN12138/dorm-duty/issues/38) |
| 真机验收 | Android 15 模拟器通知标题 / 正文 / 点击恢复宿舍已通过；实际机型、锁屏、后台限制及通知任务路由待验收 | [#39](https://github.com/RUIAN12138/dorm-duty/issues/39) |
| 固定签名与覆盖升级 | Gradle 接入与未配置拦截已实现；本机 debug 覆盖安装保留身份；固定发布私钥、release 签名与覆盖升级待验收 | [#40](https://github.com/RUIAN12138/dorm-duty/issues/40) |
| 本地提醒补充 | 即时催促以推送为主，本地只补已知时间的提醒；实现待做 | [#41](https://github.com/RUIAN12138/dorm-duty/issues/41) |

## 1. 在服务器终端填写极光配置

脚本只在交互终端读取隐藏输入。Master Secret 不作为命令参数、不经聊天、不打印到日志。先在线备份数据库和已有推送配置，再用服务账号作为属主；工具采用私有临时文件、锁和原子替换，保留另一平台配置。已有配置文件为符号链接、权限过宽或格式无效时拒绝覆盖。systemd 的 StateDirectory 目录链接会先解析到实际目录。

在服务器部署脚本后执行（公开 AppKey 由项目所有者提供）：

```bash
python3.11 /opt/dorm-duty/incoming/configure-native-push.py android --app-key <公开Android-AppKey> --owner dorm-duty
python3.11 /opt/dorm-duty/incoming/configure-native-push.py --check
systemctl restart dorm-duty
systemctl is-active dorm-duty
```

工具提示输入两遍 Master Secret；输出只包含配置状态。`--check` 不验证平台密钥是否真实有效，重启成功也不代表设备收到推送。必须继续安装客户端、取得真实 registration_id 并发新测试通知。HarmonyOS 后续用相同命令将平台改为 `harmony`，输入该平台自己的应用配置。

## 2. 厂商通道

维持 JPush / JCore 固定版本，申请厂商参数后按[极光厂商指南](https://docs.jiguang.cn/jpush/client/Android/android_3rd_guide)接入兼容插件并核对合并 Manifest。华为 Android 应用与现有 HarmonyOS 应用分别创建和配置。厂商插件接入、控制台通道配置、真机后台送达是三个独立验收点；目前都不标为完成。

不得把模拟器在线收到极光消息当作小米、华为、vivo 锁屏或关闭应用后的送达证据。划走最近任务、系统强制停止和断网分别记录，不混用“杀 App”描述。

## 3. 固定发布签名

项目所有者使用 Android Studio 的 Generate Signed Bundle / APK 或 keytool，在仓库外创建本应用固定 keystore，私密保管密码并独立备份；本轮不会自动创建或修改用户的私钥。应用升级必须保持签名身份，详见 [Android 官方签名文档](https://developer.android.com/studio/publish/app-signing)。

在仓库外创建一个权限为 `600` 的本机 properties 文件，例如 `$HOME/.config/dorm-duty/android-release.properties`，内容模板如下；不要提交真实文件：

```properties
storeFile=/仓库之外的绝对路径/lundao-release.jks
storePassword=在本机私密填写
keyAlias=项目所有者创建的别名
keyPassword=在本机私密填写
```

构建时只传配置文件路径和公开 AppKey，不把密码放在命令行：

```bash
cd native/android
DORM_ANDROID_SIGNING_PROPERTIES="$HOME/.config/dorm-duty/android-release.properties" \
./gradlew --no-daemon :app:checkReleaseReadiness :app:assembleRelease -PJPUSH_APPKEY=<公开Android-AppKey>
```

未设置签名配置时仍可执行 debug 构建、lint 和单元测试；输出 release 包的任务会在执行前明确拒绝。配置文件或 keystore 放在仓库内同样拒绝。成功签名后核对 APK 包名、versionCode 和签名 SHA-256，下一版递增 versionCode 并用同一证书覆盖安装，检查宿舍身份保留。当前 CI 不存放发布私钥，只验证 debug 与缺少签名时的拒绝行为。

CI 通过仓库 Actions 变量 `DORM_ANDROID_JPUSH_APPKEY` 注入公开 Android AppKey，源码保持空默认值。变量为空时仍能构建界面体验包，但不能开启原生推送；配置变量后，CI 体验包才包含相应应用标识。Master Secret 和签名密码不能放在这个变量中。临时 runner 的调试签名问题仍然存在，因此这些包用于验收，不用于长期覆盖升级。

## 4. 设备证据

按 Issue #39 记录机型 / 系统 / WebView / 包名 / 签名指纹，以及身份恢复、通知正文与跳转、返回、输入键盘、系统栏、横屏和网络恢复。每条通知记录“服务器接受 / 设备显示 / 点击后目标页”三个结果。没有设备观察时标“待验收”，不能用编译通过替代。

本轮使用独立验收宿舍和测试成员，没有向真实室友发送消息或修改值日记录。1.2.0 缺少 JCommonService 导致注册超时；1.2.1 补齐后注册成功，但旧 AppKey 与已保存密钥不配对，发送返回 401。所有者提供匹配的 AppKey 后，SDK 又明确报告该应用未启用 Android（1009）；所有者添加 Android 平台后，重新注册和设备查询成功。服务器备份、切换到匹配 AppKey 并重启后，新测试任务于 2026-10-16 09:53:18 UTC 被接受，模拟器实际显示完整正文，点击返回验收宿舍。旧失败任务保留原状态，没有重放。

本次验证的是测试通知指向首页的跳转，不代替两位成员互发、抬水提醒指向抬水页或厂商后台送达。原有 62 条完成记录与历史表摘要在配置更新前后一致。

CI 在 debug 构建后检查实际合并 Manifest 的自定义服务、内部可见性、独立进程、SDK 发现 action、接收器和通知权限。本机含公开 AppKey 的体验包额外执行 `--require-app-key` 检查；这些静态检查与实际送达证据分别记录。

## 前端与其他 PR

`--ui-ease-out`、`--ui-press-time`、`--ui-press-small` 已定义于 `frontend/src/interaction/tokens.css`。网页已有 v40r1 的圆环、+1、任务反馈和日历同步收起回归，不能按旧 v26 清单重新替换。剩余前端审计以用户最新的 [交互约定](FRONTEND_MOTION_CONTRACT.md) 为准。

PR #24 并非空改动，包含 `.gitignore` 和一份后端架构文档。它不属于原生推送阻塞项，需单独审查，不能因“空 PR”描述直接合并或关闭。
