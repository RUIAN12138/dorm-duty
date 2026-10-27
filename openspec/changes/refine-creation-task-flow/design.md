# Design
保留已有黑白大字与留白、名称输入/进度条/底栏尺寸。模板四项分组仍可左右切换；模板点按只启停，独立“编辑任务”入口进入当前已启用任务编辑。自定义任务仍直接进入编辑。编辑状态才显示单行任务rail，所有多任务名称可横滑/键盘选择；当前项变动时仅滚动rail，不滚动整页。
新CreationTaskRail只供创建分支使用。44px目标、最多156px单项宽、长名称省略且aria-label完整，焦点可见；mounted/selection/watch在nextTick后使用rail自身scrollLeft计算必要滚动。原生横向惯性，不创建自定义逐帧滚动器。减少动态效果即时定位。
子面板以grid同格叠放，进入与退出沿同一小距离/透明度过渡，旧内容inert/aria-hidden，不使用mode=out-in制造空白；transition属性仅transform/opacity。面板变化不影响固定footer，必要小屏/大字体安全滚动不裁切。
代码精确范围在scope.json。先保存旧版多视口截图/几何，再以合成邮箱/临时SQLite验证5步与20任务、编辑/规则/时间/进度拖动/预览和workspace隔离。设备未测单列，不扩大修改到正式页面。可通过回退本提交撤回，无数据库迁移。
