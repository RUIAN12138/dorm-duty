# 验证记录

实现、精确范围、复现命令、真实通过数量与限制见 `docs/IOS_CHAT_MOTION_PREVIEW.md`。当前验收状态仍为 pending；tasks 中实机与用户验收保持未完成。

Codex 先提供八部分 Claude 任务书，Claude 在规定聊天源码范围实现；Codex 独立审查并去掉与全局按压重复的入口/发送缩放，补充逐通道弹簧静止精度、草稿历史不重播、事件释放保护及新验收。最终 DormCompanion 无差异，未改业务/API/依赖/其他页面。

新专项 Chromium/WebKit 各18项；既有连续性各23项、留言与光学检查44/41项、表情/聊天返回/设置45/44项；类型/构建、22项状态、28项对话状态、原按压手势检查通过。日历分段导航Chromium18项回归通过，源文件无本轮差异。

修复前基线保留在 `data/ios-chat-motion/baseline`，能复现返回途中点击无法在同一可见节点重新展开。开发阶段曾有双击未及时退场、WebKit返回点击与旧连续性失败，日志保留；最终结果独立记录，不以延长测试等待掩盖阈值问题。OpenSpec范围检查曾发现正在运行的旧测试临时HTML，待测试自清理后重新通过，没有扩大允许范围。

新专项记录实际反向轨迹、消息DOM、键盘锚点、原生smooth调用/scrollTop写次数及Performance Timeline。WebKit没有longtask能力，记unsupported，不能报零；键盘是visualViewport几何模拟，不是真实iOS输入法。

WebKit玻璃光学控制页校准仍不支持截图渲染，因此该项未验证，其他断言继续。当前adb/hdc没有在线设备/模拟器，无iPhone实机；没有追认旧安卓/鸿蒙模拟器为本轮通过。

预览8092仅内存假宿舍、演示AI，无邮件/推送/生产数据。PR门禁因缺用户验收继续拒绝；没有PR/推送/main合并/正式发布。
