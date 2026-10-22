# 2026-10-22 本轮验证

## 实施与审查
先建立OpenSpec和精确路径，再由Claude Code按8节任务书实现，Codex独立审查并补齐。Claude在调试阶段被中断，未把未完成输出当作验收；随后Codex修复了初始布局时钟、真实弹窗拦截识别、第三个已澄清链接、原生合成click排序及历史提示复开等关联问题。未改业务后端、原模型、密钥或生产数据。

## 复现与修复证据
- baseline-chromium/webkit.jsonl：双击移动中的球球未取消聊天，源位置取消前已请求state。
- baseline-entry.log：120条历史首次可见未贴底。
- android-chat-trace.json：真实WebView记录两次pointerup先于第一次click，旧click主驱动会漏判。改为pointerup主仲裁，click去重，键盘保留。
- 新专项：Chromium/WebKit各24项手势、14项历史/新回复；外链协议/桥20项，UI外链各9项（保留URL、opener断开、原页状态、拦截后复制、重复复制2.5秒）。
- Android15真实WebView模拟器、HarmonyOS6.1.1 ArkWeb模拟器各5项隔离聊天通过；三个系统外链各端3项通过，原WebView URL不变。所有聊天请求通过CDP转至新内存宿舍，AI模拟；没有向正式宿舍提交打卡/留言。
- 鸿蒙只在data/harmony-entry-qa独立副本开启调试，正式Index无调试开关；检查后重新安装普通HAP并停止两个本轮启动的模拟器。

## 构建与回归
Web构建与业务50项；状态/手势单元；类型检查；原聊天连续性各23项，物理动效各18项；完整聊天、连续模式、主题53项、版本提示12项；Android unit/lint/APK，Harmony unsigned HAP均通过。日志data/tap-arbitration。旧物理探测在模拟器并发高负载下首次获取了0速度而失败，同一未修改控制器复测通过；保留旧失败证据，不称所有首次执行都成功。GitHub CI会重新执行本轮新增专项。

## 边界
- 实体iPhone Safari软键盘/触感、Android/Harmony实体机未验收；模拟器和桌面引擎不等于实机。
- WebKit截图的模糊光学验证受引擎截图限制；不把computed style当作真实iPhone光学验收。
- Android Chrome模拟器处首次设置，证明ACTION_VIEW转交和返回，未声称目标网页内容加载完成；Harmony系统浏览器转交与返回通过。
- AI仍为原整组短句返回，仅新增内容分组渐清，没有虚构SSE/token流。

## 正式动作授权
用户原话：“这次做完直接提交 pr 部署网站”。后续按同一批次摘要分别执行pr/publish门禁，允许本轮开发分支推送/PR和代码发布，不授权main合并、不追认产品验收。发布前在线备份，保留旧release，只替换代码，不覆盖SQLite和私密配置。最终PR/公网健康/资源/历史核对由data/release-chat-v74记录；未执行前不勾选发布任务。

## v74 正式发布（北京时间2026-10-22 16:16）

PR #81：https://github.com/RUIAN12138/dorm-duty/pull/81 ，基线为#80开发分支，未合并main。运行版本20261022-companion-entry-v74，代码提交36f72c85c248a04d6fe2fa5535229d708679d947。线上入口https://8.148.190.114/dorm-duty/ 。

在线备份/opt/dorm-duty/backups/dorm-20261022T081233Z.sqlite；67条完成记录发布前后逐条哈希一致，数据库标识未变。公网142个静态资源与发布包逐字节一致，值日/抬水/日历路由和v74一次性版本提示通过，未发送正式聊天、打卡或留言。旧release20261022-chat-motion-v73保留，可只回退代码。证据data/release-chat-v74/（部署、健康、公开资源、无登录浏览器与历史核对）。

后续补充提交仅测试、文档/授权记录，不改变已部署的运行代码；publish授权和门禁证据保留部署时摘要，pr授权更新为含本记录的最终摘要。GitHub CI仍在执行，完成后更新PR说明。

CI专项校准：旧性能脚本监听click，被新pointerup仲裁正确消费合成click后，计时未启动；改为真实pointerup采样，保留100ms响应与500ms主动画目标。离线刷新测试明确abort请求，避免route.fulfill在离线模式仍成功的假验收。仅测试改动，不改已部署运行代码。

## v75移动边缘修复（准备发布）
CI的移动目标二击失败后，本地以“取坐标后延迟65ms”复现：第二down约205ms到达仍属合法双击，但目标已移开，命中历史区域。仅在第二down用当前球体矩形加36px容差补命中（一次读几何），不延长280ms窗；事件记录保存在data/tap-arbitration/edge-before.json。v74其余功能不改，v75将只追加这一运行修复与相应版本提示识别。

## 最终发布：v75（北京时间2026-10-22 16:34）

线上https://8.148.190.114/dorm-duty/ 已为20261022-companion-entry-v75，运行提交34e5695102cb353868bd73bc3564673a4247707a。备份dorm-20261022T083413Z.sqlite；67条完成记录逐条哈希一致、数据库ID未变；142个公网资源逐字节一致，三个路由及v75一次性提示通过无登录只读冒烟。v74/v73目录保留。

新增65ms坐标送达延迟的移动目标回归，在Chromium/WebKit各24项手势检查通过；没有放宽280ms窗。此前模拟器覆盖pointerup仲裁、长历史定位和系统外链；最后矩形边缘容差为标准DOM几何分支，另由两个桌面引擎验证，不冒称完成实体设备测试。源码不含调试开关。

后续补充提交只记录本次发布与PR授权，不改变运行代码。PR #81将同步本批次全部提交，main不合并；GitHub最终提交CI继续检查，结果更新PR说明。证据目录data/release-chat-v75。
