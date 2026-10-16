# Android 最小可用发布路径

2026-10-16 核对基线：main `bd0c463`，网页已发布 `v40r1`。Android 1.2.1 修复缺失的 JCommonService 子类注册，并新增合并 Manifest 检查。Android 15 专用模拟器已覆盖安装、保留正式验收宿舍身份、授权通知并成功注册设备。测试通知仍被极光以 HTTP 401 拒绝，设备没有收到；固定签名与厂商真机验收仍未完成。

## 阻塞与任务

| 工作 | 当前状态 | 验收入口 |
| --- | --- | --- |
| 服务端极光配置 | Android 配置已私密写入、权限 600、服务账号可读并重启；发送返回 401，设备查询返回 401 / 7004，需核对同一应用的密钥配对；HarmonyOS 尚未配置 | [#37](https://github.com/RUIAN12138/dorm-duty/issues/37) |
| 厂商离线通道 | 基础 SDK 已有，小米 / 华为 Android / vivo 插件和平台配置待做 | [#38](https://github.com/RUIAN12138/dorm-duty/issues/38) |
| 真机验收 | Android 15 模拟器已安装、恢复身份并注册推送；通知显示 / 点击跳转尚未通过，模拟器不能代替厂商锁屏验收 | [#39](https://github.com/RUIAN12138/dorm-duty/issues/39) |
| 固定签名与覆盖升级 | Gradle 接入与未配置拦截已实现；用户私钥与实际覆盖升级待验收 | [#40](https://github.com/RUIAN12138/dorm-duty/issues/40) |
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

本轮使用独立验收宿舍和测试成员，没有向真实室友发送消息或修改值日记录。1.2.0 的设备注册超时被日志定位为缺少 JCommonService；1.2.1 补齐后成功绑定一台 Android 设备。首次测试的队列结果为 `failed / HTTP 401`，只读设备查询为 `401 / 7004`。按[极光设备管理文档](https://docs.jiguang.cn/jpush/server/push/rest_api_v3_device)，需核对 AppKey 与 Master Secret；配置文件可读或格式通过不等于平台鉴权通过。用户在服务器私密修正后重启，再发送一条新测试，不重放旧的失败任务。

CI 在 debug 构建后检查实际合并 Manifest 的自定义服务、内部可见性、独立进程、SDK 发现 action、接收器和通知权限。本机含公开 AppKey 的体验包额外执行 `--require-app-key` 检查；这些静态检查与实际送达证据分别记录。

## 前端与其他 PR

`--ui-ease-out`、`--ui-press-time`、`--ui-press-small` 已定义于 `frontend/src/interaction/tokens.css`。网页已有 v40r1 的圆环、+1、任务反馈和日历同步收起回归，不能按旧 v26 清单重新替换。剩余前端审计以用户最新的 [交互约定](FRONTEND_MOTION_CONTRACT.md) 为准。

PR #24 并非空改动，包含 `.gitignore` 和一份后端架构文档。它不属于原生推送阻塞项，需单独审查，不能因“空 PR”描述直接合并或关闭。
