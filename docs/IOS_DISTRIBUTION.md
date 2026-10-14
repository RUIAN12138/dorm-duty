# iOS 安装与 TestFlight

iOS 原生分发资料核查日期：2026-10-12；系统 Web Push 更新日期：2026-10-14。当前前后端已在正式服务器运行，已接入 Web Push，用户已确认 iPhone 收到系统通知；尚未生成、签名或上传原生 iOS 安装包。

## 能否通过 TestFlight 安装

可以。后续可将现有 Vue 界面和业务接口接入 iOS 客户端，在 Xcode 构建签名，再上传 App Store Connect，通过 TestFlight 邀请室友安装测试。TestFlight 是测试分发渠道，开发者仍需 Apple Developer Program 会员，通常每年 99 美元；费用按地区以本币显示。因此它不能实现「不用支付开发者年费的长期安装」。

每个上传的 TestFlight 构建最多测试 90 天，到期后不能继续打开该构建，需要提供新构建。给室友作为外部测试者分发时，首个构建需通过 TestFlight 测试审核；官方支持最多 10,000 位外部测试者。

| 方式                                  | Apple 开发者年费            | 适合本项目的用途                                    |
| ------------------------------------- | --------------------------- | --------------------------------------------------- |
| HTTPS 网页 / 添加到主屏幕的 PWA       | 不需要                      | 先供宿舍稳定使用，继续复用现有前后端                |
| TestFlight iOS 测试版                 | 需要会员，通常 99 美元 / 年 | 以后测试真正的 iOS 客户端，需要维护测试构建         |
| 免费 Apple 账号 + Xcode Personal Team | 不需要                      | 自己连接设备做开发测试，签名 7 天到期，设备数量受限 |

免费 Personal Team 的 App ID 和设备注册 7 天到期，最多注册 3 台设备，每台最多安装 3 个应用；签名到期需重新构建安装。它适合个人调试，不作为宿舍成员的日常分发方案。

## 与服务器的关系

TestFlight 只负责 iOS 安装与测试分发，不托管宿舍数据库、排班或成员间的提醒。多人仍需连接同一个可用后端。当前正式后端运行在 `8.148.190.114` 服务器，HTTPS 地址为 <https://8.148.190.114/dorm-duty/>，不依赖 Mac 或同一 Wi-Fi。网页和后续客户端共同复用业务接口。

当前「提醒某位室友」同时保存站内消息并为已开启的设备发送系统 Web Push。iPhone 需 iOS 16.4 或更新版本：在 Safari 分享菜单添加到主屏幕，从桌面图标打开，加入正式宿舍、选自己，进入「… → 系统通知」开启并允许。较新 iOS 添加界面若有「作为网页 App 打开」，需开启。用户已回复测试结果「已收到系统通知」，见 [手机反馈](evidence/system-push/iphone-feedback.json)。该反馈未单独报告锁屏状态、点击导航及长期投递，不扩大为这些验收均通过。

这条 PWA 路线无需加入 Apple Developer Program，也不需要 TestFlight。系统通知功能依赖浏览器和系统权限；安卓及鸿蒙复用网站，但不能由 iPhone 接收结果推断它们的后台推送均通过。[WebKit 官方说明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)、[Apple 添加主屏幕说明](https://support.apple.com/en-eg/guide/iphone/iphea86e5236/ios)。

## 苹果官方来源

- [Apple Developer Program 注册与费用](https://developer.apple.com/programs/enroll/)
- [TestFlight 分发、外部测试和首个构建审核](https://developer.apple.com/testflight/)
- [TestFlight 测试者说明与 90 天有效期](https://testflight.apple.com/)
- [免费开发账号、Personal Team 与 7 天签名限制](https://developer.apple.com/help/account/access/developer-account-overview/)
