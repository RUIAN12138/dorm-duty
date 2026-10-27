# Why
用户补充“大字偏移需要拉伸和弹性动画，保持之前抬水页排版，催促导航图标也更换”。上一版新增一排任务/姓名改变了旧布局，本轮按原抬水锚点恢复。
# What Changes
恢复原提示语—大字负责人/本人任务—操作区布局、字号与独立锚点；保留大字横滑与无切换按钮。大字预示/拖拽/回位使用单一弹簧位移加微拉伸，减少动态直接静止；导航水滴改提醒铃铛。不改催促API、限流和任务数据。
# Capabilities
## New Capabilities
- `nudge-layout`: 原抬水排版与可中断弹性大字。
## Modified Capabilities
无后端变化。
# Impact
只改NudgePane、ChoreBoard水操作插槽、导航SVG与同目录测试。独立预览，不PR/合并/部署。
