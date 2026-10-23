# 背景
用户只要求现有卡片的触点倾斜、按压下沉、成员拖动浮起；保留全部布局/业务/既有动效。
# 当前仓库状态判断
独立分支codex/refine-card-feedback基于e71f61d；v79已发布。当前只有本轮事前OpenSpec文件，不得改旧change授权。
# 本轮目标
严格按design.md和scope.json，复用现有v-tilt，不创建另一套全局按压；仅选定卡片。
# 修改范围
scope.json逐项文件；可新增cardFeedback.ts纯数学/生命周期控制器、两项测试，不许动main.ts或全局CSS。
# 禁止事项
禁止PR/push/merge/deploy/网络或生产数据操作，禁止子代理。禁止增加依赖、改变尺寸/布局/文本/入口或drag阈值。不得修改凭据或用户文件。不叠加已有transform/scale。
# 具体任务
阅读design和现有tilt/pressFeedback；实现只按下最大1.6deg、1.5px/0.992反馈；Pointer Events一次rect读取、move合帧，8px让出滚动/横滑，不capture/preventDefault。存取独立translate/rotate/scale，保留原transform及恢复原inline值；reduce/keyboard/hidden/blur/unmount清理。直接宿主加data-card-feedback/data-press-owned，让公共pressFeedback仅排除这些宿主。ChoreBoard仅两个task-title-button使用v-tilt；ChoreCalendar calendar-surface、ChoreRecordRow record-row、RecordTimeline records-heading、JoinedDorms button使用；嵌套独立操作不触发父反馈。SortableMemberRow内sort-card用已有held更新liftOnly:true，4px抬升/scale1，局部伪元素阴影透明度渐显，原Reorder和240ms不改。先只实现与纯测试，不启动浏览器，父流程将独立截图/浏览器验收；不要更改任务状态伪称完成。
# 验收标准
遵循原transform无覆盖、尺寸前后相同、同一元素scale单一驱动；release连续、滚动取消、禁用/减动效无运动、既有完成/侧滑/排序/月份不回归。typecheck与新纯测试通过，diff范围精确。
# 完成后需要输出
修改文件、测试命令及真实结果、风险/未验证设备。遇阻记录而非绕过，不提交Git。
