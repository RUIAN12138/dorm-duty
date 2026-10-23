## Why
用户要求仅优化球球聊天键盘联动、输入定位、底部渐进玻璃与必要滚动协调。当前fit在键盘高度改变后切compact，球球/标题/历史上内边距突变；footer-gap在58px以上与safe-area/12px之间突变，失焦先于键盘收起时会提前恢复。已有双击修复作为前置未提交改动保留，不修改其内容。本轮用户明确先预览和真机验收，禁止未确认PR/合并/发布。
## What Changes
- 单一合帧VisualViewport布局状态，以height/offsetTop和焦点/历史键盘状态识别遮挡；输入框与玻璃连续跟随，最终间距10px，键盘收起恢复原布局。
- 键盘不触发顶部紧凑布局；短屏在进入前决定自身布局，不改正常页面设计。
- 最新消息保持底部，读历史保留可见锚点，不重新初始化、不新增固定延迟掩盖布局。
- 回归多段键盘高度/候选栏/失焦回落/缺VisualViewport/resize型WebView、主题与原聊天动效。
## Capabilities
### New Capabilities
- `chat-keyboard`: 聊天输入区与可视键盘边缘的连续协调。
## Impact
仅CompanionChat、必要chatScroll协作、新局部viewport helper与测试，精确范围见scope。无业务、后端、主题或其他页面变更。
