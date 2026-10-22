## Purpose
让球球聊天在移动端的点击、消息发送、留言编辑和角色回程之间维持可感知的连续性，保留现有黑白玻璃风格与输入操作，在不改宿舍业务、消息权限或生产数据的前提下改善响应和阅读体验。
## ADDED Requirements
### Requirement: Immediate reversible launch
聊天入口 SHALL 在首个有效点击后立即产生视觉响应并启动本地展开，不等待接口；双击仍只产生表情互动，预测展开可原路取消。
#### Scenario: First tap with slow history
- **WHEN** 用户单击且历史接口很慢
- **THEN** 本地界面先响应并展开，接口异步载入；目标100ms内响应、300–450ms主要展开，测量范围明确记录
#### Scenario: Second tap during prediction
- **WHEN** 用户在双击窗口内再次点击来源位置
- **THEN** 取消预测展开并回程，触发表情互动，不重复打开聊天或误触新返回按钮
### Requirement: Continuous conversation changes
消息 SHALL 按发送方向以短交错弹性入场；留言确认保持同一容器，修改对象/内容不销毁整个卡片，成功/取消有退出过渡。
#### Scenario: Change recipient and content
- **WHEN** 用户反复修改收件人或正文
- **THEN** 卡片容器身份保持，内容交叉过渡且布局连续；发送防重、失败草稿保留与原权限不变
#### Scenario: New messages while reading history
- **WHEN** 用户在底部接收连续消息或已向上阅读
- **THEN** 底部平滑跟随并合并滚动，向上阅读时不被拉走；触摸能中断自动滚动
### Requirement: Spatial continuity and retained draft
聊天收展 SHALL 保留球球表情和空间连续性、草稿和历史，沿原路径弹性回程，不能在结束前卸载或瞬移。
#### Scenario: Close with keyboard and draft
- **WHEN** 用户在键盘展开且尚有未发送文字时退出再打开
- **THEN** 球球连续回到实际来源，草稿和已有历史保留，重新打开不自动弹键盘
### Requirement: Progressive top glass
聊天记录 SHALL 实际滚入顶部玻璃后方，靠近顶边逐渐更模糊，球球/返回/名字保持清晰；顶部与底部色调和梯度相容。
#### Scenario: Scroll and viewport change
- **WHEN** 用户滚动聊天、开合键盘或切换主题
- **THEN** 玻璃连续且无矩形硬边，首条消息初始位置与前景锚点保留，输入仍清晰可用
#### Scenario: Accessibility and verification
- **WHEN** 系统减少动态或透明效果，或者测试引擎无法截图滤镜
- **THEN** 相应降级保持功能，无法验证的光学/真机项目单独标明，不宣称通过
