## Decisions
启动以真实邮箱与宿舍恢复完成为准，无最小时长；网络失败保留凭证并提供重试。普通会话统一持久缓存但始终服务端验证，不延长有效期；主动退出同时撤销及清理。恢复时持久令牌为 canonical source，旧标签页/恢复快照中的 sessionStorage 只能作为兼容回退；401 只允许撤销其发起时仍为当前的令牌，避免延迟失败清空新登录。抬水详情以专用prop落底，其他抽屉不变。曲线无许可证仅用数学公式独立实现；WebGL MIT仅隔离实验。

登录恢复的服务端回归复用现有 SQLite `email_sessions`、`email_grants` 与 `member_sessions`，只在隔离测试中重建邮箱运行时并复用原 Cookie；不改会话时长、Cookie 属性、表结构或身份权限。该验证覆盖应用服务重启，不替代 WebView/iOS 的本机 Cookie 存储验收。
## Resources
已读frontend-design、emil-design-eng、动效契约、React Bits Dock，上游两个仓库。awesome-design-md/KnowledgeBase/本地math-curve-loaders缺失。
## Risks
无vivo/iPhone/鸿蒙真机不得宣称通过；既有HttpOnly邮箱cookie失效不能靠本地令牌绕过。

## 2026-10-25 · Android 邮箱 Cookie 持久化
- 只在 `dorm_email_session` 被邮箱验证创建或邮箱退出清除后请求原生刷写；不改 `localStorage`、不把身份令牌交给原生、不通过客户端凭证绕过 `/email/me`。
- Web 与不支持 AndroidX WebMessageListener 的平台静默跳过桥接；Android 既有 `onPause()` 刷写继续保留。
- 原生监听只接收可信 HTTPS 主框架下的固定 `flushCookies` 命令，后台线程执行 `CookieManager.flush()`，只回传成功状态与随机请求 ID。
- 回滚只需移除新增桥接调用与监听；Cookie 格式、服务端会话表、有效期、退出和旧宿舍均保持原状。
- 当前没有 Android ADB/实体设备；成功与否仍由用户安装后的强停重启实测确认。若重启后仍丢登录，再按是否存在 Cookie 以及 `/email/me` 返回结果定位客户端存储或服务端会话拒绝，不采集凭证。
