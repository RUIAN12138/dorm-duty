# 球球入口、聊天定位与外链精修

基线：6a1e47e；分支codex/fix-companion-tap-arbitration。用户本轮明确要求“这次做完直接提交 pr 部署网站”，操作授权只绑定本批次，产品和实机验收不追认，不合并main。

## 范围与审查

| Before | After | Why |
| --- | --- | --- |
| 首击立即发state，第二击只识别原位置 | 280ms内视觉预测可回程，确认后才请求；移动中的共享球也交回同一仲裁器 | 防止双击进入聊天及额外请求 |
| 历史可见后再平滑到末尾 | DOM完成后同步scrollTop定位，冷开/重开历史不重播 | 消除长历史从顶部飞到底部 |
| 弹出新窗失败无可靠检测，原生外链被拦截 | 空白页先断开opener/禁referrer后导航，失败可复制；原生系统URL能力 | 保留原页并让WebView外开 |
| 新文字整句立即显现 | 仅新增回复分组渐清，最多20组，约440ms内完成 | 节奏柔和但不拖慢长消息 |
| 聊天与设置层级接近 | 局部1–3%微色阶、暗色正文/标题独立校准 | 保留黑白布局与玻璃细节 |

现有日历/轮次/统计/时间滚轮已经使用tabular-nums，本轮仅补聊天提醒时间与任务详情时间，未重写相关页面。字体加载、键盘几何变化继续按近底/阅读锚点处理；初始化不用固定延迟定时器。

## 外链

用户澄清“本兮”指「项目源码 · GitHub」。三个URL保持：球球sam70361/aora-bot、本项目RUIAN12138/dorm-duty、同源vendor/emotion-ball/LICENSE.txt。普通Web新标签，Android专用安全消息listener执行ACTION_VIEW，Harmony私有消息端口openLink；通知的onmessage未被替换。旧安装包不具备新外链命令时提供复制，不降级至当前WebView加载。

AI仍用原有接口返回短句，本轮没有改为服务端SSE/token流。渐清作用于新到达的短句，不把历史假装重新生成。仅视觉调整，不改模型、提示词、权限、打卡、轮序或通知。

## 自动化与设备证据

详细日志位于data/tap-arbitration（忽略运行产物，不含用户宿舍数据）。新测试：check-companion-tap-arbitration.mjs、check-chat-entry-polish.mjs、check-external-url.mjs。浏览器实测与原生构建分开记录；桌面WebKit不能替代iPhone。Android模拟器Chrome首次设置页意味着只证明系统Intent转交，不能声称目标网页全部加载。鸿蒙unsigned HAP不能作为已签名真机包分发。

当前验证（2026-10-22）：Web构建/业务50项通过；Chromium/WebKit各24项点击手势与14项长历史/新文本测试；外链协议与桥隔离20项；原聊天连续性各23项、新物理动效各18项，完整聊天与连续模式、主题53项、版本提示12项通过。原物理速度采样首次在高负载下返回0而失败，同一未改控制器复跑通过，保留失败证据，不隐藏该结果。

Android APK含单元测试/lint构建通过，Harmony unsigned HAP编译通过。Android 15 WebView和HarmonyOS6.1.1 ArkWeb模拟器各5项隔离聊天检查通过（双击零请求、120条历史首帧、重开定位等），各3条系统浏览器外链转交并返回原页通过。Harmony仅在data中的独立测试副本启用调试，正式Index.ets未加入调试开关；测试后恢复普通HAP并停止本次启动的模拟器。iPhone实体输入法/触感未测；桌面WebKit不等于实体Safari，WebKit光学blur不作实机承诺。

隔离预览：http://127.0.0.1:8092/?start=1 ，演示AI、内存宿舍、无真实邮件或推送。PR与发布证据随后记录。
