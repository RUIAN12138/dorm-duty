# 启动、持久会话及局部光学实验

本轮基线为v81（2be03ba），分支codex/startup-session-optics-preview。仅本地预览；没有PR、main合并、服务器发布。实体设备未验收。

## 已核对的实现

| Before | After | Why |
| --- | --- | --- |
| GuestHome入口先渲染，再异步读邮箱与宿舍 | 初始化/验证中/已登录/未登录/恢复失败；完成前不挂入口 | 消除错误身份页面闪现 |
| 普通登录只写sessionStorage，邮箱管理token有localStorage恢复 | 同一服务端token持久化与验证路径，退出及401同步清理 | 进程重建后可恢复，且不延长服务器有效期 |
| 抬水任务非模态面板距底部导航74px | 该详情专用edgeToEdge，模态底部面板 | 背景延伸安全区，不改其他抽屉 |
| 查看任务继承通用按压/阴影 | 局部文字按钮，只有透明度与缩放反馈 | 保持位置与问号功能 |

Android MainActivity已启用JavaScript/DOM Storage，未见clearCache、clearHistory、removeAllCookies或启动清理；原实现没有显式CookieManager.flush；本轮在onPause调用flush，同源Cookie启用，不开启第三方Cookie、不延长服务端会话。仅凭源码不能证明vivo系统未回收数据，也不能证明邮箱HttpOnly会话在实际机型的进程退出后持久化。网页恢复仍必须先通过/email/me，不能以本地token绕过邮箱门。

## AI限制：文档与代码

代码scripts/companion-ai.mjs：每宿舍成员聊天8次/分钟、旧识别4次/分钟、提醒操作20次/分钟；上游最多4并发，12秒超时；输入1000字符；模型最近12条上下文，数据库每身份保留100条；最多20条活动提醒，未来30天，提案30分钟，15秒扫描。限流Map在内存中，重启清空，超过4096键会整体清空；没有每日消费金额/token预算或持久化限流。这是现有风险，不在本轮擅改。

上游错误1113返回额度不足503；429返回忙碌，其余非成功通常502，不自动更换付费模型。未发现独立月度消费上限、自动额度告警；不读取API Key、不探测收费请求，第三方实际余额/账单未知。文档中长按550ms、短按留言及语音入口描述已落后于当前单击聊天/双击互动/文字输入实现。每条20字符、最多6条为服务端模型清洗限制，展示层还做自然分句；不能把文档当部署配置证明。

部署配置本轮未读取私密文件、未连生产机核对AI进程配置；只能确认源码默认硅基流动Qwen/Qwen2.5-7B-Instruct及允许列表，不能宣称当前线上余额和运行配置已验证。未修改AI权限、额度或业务代码。

## 资源与许可

- Paidax01/math-curve-loaders：读main.js的Lissajous Drift公式；当前仓库树未发现明确许可证，不复制实现。startupOrbit为独立sin(3t+phase)/sin(2t+phase)轨迹，四粒子、无Canvas、后台暂停、减动效静止、真实恢复完成即退出。
- 球球图标由现有EmotionBall引擎导出blob/02，保留实际轮廓与眼形；原资源备份docs/icon-backup-v81。现有vendor许可证/NOTICE限定角色形象个人技术学习研究、禁止商业；新增导出不扩大许可。
- Oliverrr2424/webgl-apple-liquid-glass为MIT，实验vendor保留LICENSE。WebGL不能读取网页像素，auto模式自行重绘DOM，无法完整复现伪元素、SVG、滤镜及输入控件。应用大量球球SVG、玻璃伪层、动态消息，直接auto代价和还原偏差需评估。
- 实验只导入低层renderer，一个上下文、静态背景、事件请求帧、空闲零持续循环；不是全站采用。正常入口不导入实验。

## 未验证项

vivo实体机杀进程/重启，iPhone Safari/PWA中文英文表情键盘、主屏图标缓存，Harmony ArkWeb进程与图标、低端机GPU与耗电均未验收。浏览器存储重建/桌面WebKit不替代原生进程和触摸性能。不能宣称跨平台通过。

## 当前测试结果
- Chromium/桌面WebKit完整首页：各8项通过（验证期隐藏登录、已登录、未登录、网络失败/恢复、暗色减动效、落底抽屉、无运行异常）。使用模拟邮箱状态与隔离内存数据库。
- 6项普通会话存储重建检查、原身份竞态检查通过；尚非vivo进程退出测试。
- Android assembleDebug离线构建成功；网页类型检查、正式构建成功。
- 独立光学校准实验：Chromium/WebKit均可创建WebGL，一秒空闲额外绘制0帧，模拟无WebGL返回CSS。20组事件派发耗时约0.3ms/1ms，仅JS派发成本，不是GPU帧耗时或手机FPS。
- 正常应用的LiquidNavGlass本来已有WebGL上下文、背景采样和contextlost处理；新渲染器尚无明显优于现有实现的实证，且校准纹理不能代替真实DOM。本轮不正式采用、不增强消息浮窗/输入框，避免堆叠上下文。

上游实验JS共266,210字节源码，仅独立入口使用。原有导航不改。当前adb无连接设备、xcdevice无可用iPhone，无法进行本轮实体手机测试。iOS主屏图标受安装缓存和平台限制，提供深浅/单色资源不等于iOS会按主题自动替换已安装图标。

## 回归中的既有失败
全站前端状态22组中21组通过；check-screen-gesture-check的横幅7px拖动断言与v81的10px长按容差冲突。本轮未改ReminderBanner或旧测试，未通过改无关代码消除失败。当前源码/测试均与本轮基线一致，不能宣称全套全绿。AI隔离模拟上游回归通过，无真实模型费用。

深色启动层实际计算背景rgb(21,21,21)，保留截图startup-dark.png。实际原导航开关截图nav-existing.png/nav-experiment.png；校准条纹下新实验出现可见色散且未证明优于原方案，不默认采用。

## 用户最新图标覆盖
用户提供1254×1254图片并指定“图标改成这个”，覆盖先前由引擎导出的图标方案。使用docs/icon-source/user-selected.png原图，只缩放导出，不重画、不反色、不裁切。深浅模式使用同一原图；移除不适用于整幅位图的Safari mask-icon声明，避免显示成实心方块。应用内球球及启动球球形象不变。此前导出资源另备份于docs/icon-backup-v81/before-user-selected，原v81备份仍保留。

## 2026-10-24 · 持久会话恢复冲突复核

- 普通 bearer token 仍为服务端签发的原值，恢复过程不延长 7 天服务端有效期。持久副本 `dorm-auth-token-v1` 为 canonical source，`sessionStorage` 仅作当前标签的兼容镜像；旧标签的迟到 401 不能删除已替换的新 token。
- 邮箱成员准入仍通过 HttpOnly `dorm_email_session` 和 `/email/me` 服务端验证。本地 bearer token 不构成邮箱会话替代，也不会自动重新进入邮箱身份。
- 新增隔离服务重建回归：邮箱运行时关闭后以同一测试 SQLite 重建，原 Cookie 继续得到相同账号与舍友身份，原成员 Bearer 仍可访问宿舍数据；没有重签 Cookie 或延长过期时间。此为 Node 服务进程边界测试，不是 iOS/Android WebView 实机重启验收。
- 会话单元测试 13 项通过；Chromium 和 macOS WebKit 的隔离移动视口启动回归各 11 项通过，含重新创建新浏览器 context 后恢复持久 storageState，以及没有邮箱 Cookie 时不能用成员 Bearer 绕过准入。该过程不模拟 Android WebView 原生数据目录及 OS 杀进程，不替代实体 vivo 完全退出重启验收。
- `npm run web:verify` 全量验证退出码 0；`npm run spec:validate` 19/19 通过。当前工作树的 `npm run spec:scope` 单独被本轮开始前已有、未触碰的 `site/runtime/email-runtime.cjs` 修改拒绝；该文件未暂存、未提交。
