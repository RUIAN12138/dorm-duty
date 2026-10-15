# 移动交互与日历优化

本轮沿用黑白、大字、留白及原有圆角，不增加首页统计、评分或常驻功能解释。提示弹窗继续采用暗色无虚化背景、略低于中央的位置。业务轮次、成员权限与通知均未改动。

## 参考取舍

- [zackha/habit](https://github.com/zackha/habit)：借鉴克制的信息层级和组件组织，继续使用现有 Vue 工程，不迁移 Nuxt。
- [mpvue-calendar](https://github.com/Hzy0913/mpvue-calendar)：借鉴移动端滑月思路，在既有日历日期区域增加横向手势，保留箭头与键盘入口。
- [concrete.css](https://github.com/louismerlin/concrete.css)：借鉴样式一致性的思路，整理现有颜色、圆角和按压节奏，保留本项目圆角与页面外观。
- [any-touch](https://github.com/any86/any-touch)：参考手势识别与业务分离的思路，本轮不增加依赖。只抽取已有水平意图、松手速度和阻尼规则，Motion / Reka 的职责不变。
- 本地 React Bits Dock / ClickSpark：参考连续运动与点击反馈的分工，没有引入 React、Canvas 特效或上游代码。

本轮为自行实现，没有复制上述项目的代码或素材。未接入热力图、每日连续打卡、积分、XP、小部件或离线提交；自由轮次和按需抬水不以每日打卡评分。

## 修改与验收

| 改进前 | 改进后 | 验收重点 |
| --- | --- | --- |
| 底栏以总位移判断拖动，纵向轻移也进入横拖 | 共用水平意图判断，纵向取消，失焦清理预览 | 修复前已复现断言失败；修复后纵移不横拖、不切页 |
| 分段与标题各自维护方向阈值 | 复用方向判断，取消时抑制拖动产生的点击 | 滚动、取消、键盘操作仍可用 |
| 抽屉以最后一个移动事件判断速度 | 取最近约 100ms 移动，反向重新采样，停住超过 80ms 不保留旧速度 | 短拉回弹、下拉后反向回弹、原关闭与嵌套逻辑 |
| 日历仅箭头切月 | 日期区左右滑月，纵向保留滚动 | 短滑、取消、加载中不切月；滑月不打开日期 |
| 密集日期数量可能挤出格子 | 数量标记约束在格内，两类任务仍有个人标记 | 320 / 390 / 430px 无横向溢出、标记不越界 |
| 日期详情顺序依赖接口传入顺序 | 与列表一样按完成时间倒序，按日期建立索引 | 最新记录在前，原数组和完成记录不变 |
| 按钮反馈节奏分散 | 小按钮 0.96 倍，80ms 按下 / 160ms 恢复，主按钮继续轻微形变 | 减少动态效果和键盘操作维持已有规则 |

验证命令：

```sh
node site/scripts/check-task-swipe.mjs
node scripts/check-interaction-foundation.mjs
npm run build --prefix frontend
node site/scripts/embed-frontend.mjs
node scripts/verify-chores.mjs
DORM_WEB_BASE=/dorm-duty/ npm run build --prefix frontend -- --outDir dist-server
```

本地证据保存于忽略目录 `docs/evidence/interaction-foundation/` 和 `docs/evidence/ui-focus/regression/`。Chromium 手机视口与触摸事件检查不替代实体 iPhone / Android / HarmonyOS 触摸手感或帧率验收。正式发布状态见 `SERVER_DEPLOYMENT.md`。
