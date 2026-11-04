# 本地验证（2026-11-04）

- 隔离 SQLite：`node site/scripts/check-recency.mjs` 56 项通过，包括全历史人员、补录、修正、删除、相同时间按有效历史 ID 倒序、跨宿舍拒绝。旧任务及轮序未更动。
- 基于 `check-dorm-wizard.mjs` 的隔离临时副本，在既有硬性模式授权代做断言后增加 activity 返回实际代做者姓名的断言；109 项通过，临时副本不保留。
- `node scripts/check-calendar-card-flip.mjs` 与 `DORM_BROWSER=webkit node scripts/check-calendar-card-flip.mjs`：分别 19、18 项通过，真实日历入口；包括最近姓名/完整时间与屏幕阅读器标签、旧响应缺姓名兜底、无记录、键盘翻转、短拖中间位置和回位、不误翻面、后续点击翻面、长拖切换、320/390/430、减少动态效果和无浏览器异常。Chromium 另通过 CDP 触摸短拖，主要手势检查使用鼠标；非实体手机。
- 前端 `npm --prefix frontend run build` 通过。OpenSpec 严格验证 49 项通过；移除工作区临时依赖软链接后单独运行范围检查。`git diff --check` 通过。

未经用户验收，未发布、未合并；iPhone Safari、Android WebView 和 HarmonyOS ArkWeb 未实机测试。浏览器测试产生的记录均为隔离模拟。

## 抽出翻面与荧光边缘（2026-11-04）

- `node scripts/check-calendar-card-flip.mjs`、`DORM_BROWSER=webkit node scripts/check-calendar-card-flip.mjs` 分别 25、24 项通过，新增检查抽出先于翻转、真实中间旋转帧、边缘光淡入、快速反向位置连续、暗色边缘和减动效无抽出位移；保留先前姓名时间、键盘和拖动断言。Chromium 一次采样因帧间隔过长未取到中间旋转帧而失败，后续重新运行取得完整中间帧并通过，不能据此宣称所有设备均流畅。
- 浅色、深色浏览器截图位于隔离工作区 `data/calendar-card-motion/`。不是实机图片；真实 iPhone Safari、Android WebView、HarmonyOS ArkWeb 暂未验证。

## 2026-11-04 整卡材质翻面修正
用户指出原效果仅像内容翻转。去除 ActivitySummary 专属卡堆静态外壳，把边框、阴影及荧光轮廓归入正反面。Tabbit 实际点按和拖动发现右抽出裁切，改为向上18px/景深8px抽出、8px弱光晕。
- Chromium 27 / WebKit 26项通过，包含完整卡面投影宽度中间帧、静态壳透明、快速反向、短拖恢复、长拖换卡、320/390/430宽、深浅色与减少动态效果。
- 实际 Tabbit 390×844 操作：打开卡片、翻回、短拖30px、长拖165px、再次翻面；检查截图，并暂停一次反转的中间帧后恢复播放。截图 data/calendar-card-motion/whole-card-back.png 和 whole-card-intermediate.png 为浏览器实际画面，不是真机或录屏。
- 前端构建通过；OpenSpec严格校验49项、范围校验和18项门禁测试通过。最初缺少独立worktree根依赖，临时复用已安装依赖执行校验后移除链接；没有增加依赖。
- 实体 iPhone Safari、Android WebView、HarmonyOS ArkWeb未测试；本轮不部署、不创建PR、不修改正式数据。

## 列表展开细条修正
CompactRecordList 的原生滚动条从 thin 改为隐藏，并提供 WebKit 伪元素规则。保留 auto 滚动、尺寸、锚点与原回弹。既有 check-list-collapse-sync 原样运行：Chromium 14项、WebKit 14项通过。用户尚未确认所指细条是否该滚动条；未将这项推断写为用户验收。
