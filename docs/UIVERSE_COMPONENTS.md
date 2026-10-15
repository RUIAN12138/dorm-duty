# Uiverse Galaxy 组件适配

本轮从 [uiverse-io/galaxy](https://github.com/uiverse-io/galaxy) 筛选 6 类组件，统一为当前黑白、圆角和手机触摸风格。读取的上游提交为 `adbd2adde0a299a3956ea288fb444ec01891ca41`。没有执行上游脚本或引入新的 npm 依赖。

| 来源与作者 | 当前落点 | 适配方式 |
| --- | --- | --- |
| [mrhyddenn / massive-newt-28](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/loaders/mrhyddenn_massive-newt-28.html) | `GalaxySpinner.vue`，打卡处理中与首次加载 | 缩为 15–24px 的单色环，固定占位；减少动态效果时停止旋转 |
| [Shoh2008 / perfect-mouse-3](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/Checkboxes/Shoh2008_perfect-mouse-3.html) | `GalaxyCheck.vue`，打卡成功状态 | 保留 SVG 勾选描边思路，去掉紫色和大范围波纹，服务器确认后出现 |
| [cssbuttons-io / calm-tiger-42](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/Buttons/cssbuttons-io_calm-tiger-42.html) | 邀请码 / 创建主按钮、提示「知道了」 | 保留容器内填充反馈，改为黑白和 200ms transform；不改变按钮尺寸，不依赖手机 hover |
| [JayRamoliya / loud-rattlesnake-53](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/Inputs/JayRamoliya_loud-rattlesnake-53.html) | 创建 / 加入表单 | 黑色焦点边框与轻阴影，边框宽度固定，避免输入框跳动 |
| [Pradeepsaranbishnoi / heavy-dragonfly-92](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/Radio-buttons/Pradeepsaranbishnoi_heavy-dragonfly-92.html) | 日历 / 列表分段滑块 | 保留独立 glider 层，采用单色轻阴影；继续使用 Reka Tabs 和现有可中断弹簧，不改成隐藏 radio |
| [nkhlrjrs / hungry-pig-21](https://github.com/uiverse-io/galaxy/blob/adbd2adde0a299a3956ea288fb444ec01891ca41/Buttons/nkhlrjrs_hungry-pig-21.html) | 菜单 ActionItem 箭头和图标 | 改为按压时箭头轻移 3px、图标轻压缩，箭头始终可见；不移动整行、不加载外部字体 |

公共适配样式位于 `frontend/src/interaction/galaxy.css`；上游 MIT 原文与版权声明保存在 `frontend/public/licenses/uiverse-galaxy.txt`，随网站构建发布。组件源码保留作者注释。实际复用部分已按移动端、键盘与减少动态效果调整；不会把未使用的库组件记成已实现。

## 同轮交互调整

- 创建者长按名字约 240ms，提起整行拖动；相邻成员弹簧让位，松手保留草稿，显式保存；普通成员权限不变。触屏隐藏小箭头但保留键盘操作入口。
- 底栏横向按住滑动时立即显示经过的页面。连续拖动只占一次历史记录；纵向意图取消，取消 / 失焦保留最后实际显示页，身份不改变。
- 顶部显示宿舍名；个人身份仍在菜单内。
- 打卡按钮固定 60px 高，轻压 1%，不再横向弹性拉伸；处理状态用环形指示，不改按钮文案高度。服务器确认后出现 8 个短暂单色粒子；失败、游客和撤销不庆祝。
- 同步状态只在持续 700ms 后出现，采用固定浮层，不插入顶部排版；离线保存语义不变。
- 抬水页标题和名字使用稳定位置，推进到下一人时只扩展下方操作区，避免整组内容重新垂直居中而上跳。
- 月历固定六行，只保留一份可操作日期网格；月份变化使用可中断 WAAPI，快速反向从当前姿态继续，避免离场网格叠加和行数引起的高度变化。
- 网页通过 `navigator.vibrate(12)` 请求轻触感；不支持震动的浏览器仅显示粒子，不使用隐蔽的系统控件模拟，不把请求成功等同于实体手机已震动。iOS Safari 不保证网页震动。

## 验收

覆盖名字长按时整行提起与相邻行让位、拖动取消、保存 / 409 草稿、底栏松手前切页和反向切换、浏览器历史、月份快速反向 / 高度稳定、打卡期间标题 / 顶部 / 滚动位置不变、粒子清理、键盘与减少动态效果，以及 320 / 390 / 430px 布局。浏览器测试不替代实体手机手感和帧率；发布结果见 SERVER_DEPLOYMENT.md。

## 轮次与连续滑动（v29）

保留上面的六类 Galaxy 适配。新增 `RoundProgress.vue` 使用圆头粗线进度环，按服务端 `completed_at / id` 的真实完成顺序播放计数与「+1」吸收；数字轻弹、圆环局部形变，已完成名单逐个从右侧进入。撤销会移除对应记录并退回进度。最后一人的本机成功回执保留满圈展示，关闭面板后回到后端已推进的新轮；不延迟或改写服务端轮次。名单不再兼任排序编辑器。

- 排列入口：顶部「轮序」可以切换地板、厕所、洗手池、抬水；创建者长按姓名拖动并保存。轮次面板另有「调整排列」。普通成员只读，可从轮序面板进入创建者身份恢复，不通过选择同名成员提升权限。
- `monthCarousel.ts`：真实前 / 当前 / 后三个日期面板，手指移动直接平移轨道，尚未松手时相邻月份已经可见。仅当前月可操作，其余两页 `inert`；后台同一次授权请求返回相邻月实际标记，避免将未加载的记录展示为空白。松手按距离与近期速度落位，支持中途反向、取消、失焦与纵向滚动。
- 触摸捕获由日期按钮交给滑轨时，忽略仍由滑轨持有触点的 `lostpointercapture`，避免把正常交接当作取消。
- 按住底栏切页：仅保留一个可操作页面，以可取消的 180ms WAAPI 平移 / 淡入显示新页；底栏指示继续跟手。新选择取消旧动画，不堆积旧页面。
- 日历列表：今天默认展开，历史日期默认折叠为日期 / 数量一行。展开后记录以 35ms 间隔向下出现，轻微弹性，快速反向可从当前位置收回；跨日将昨天折叠。折叠内容 `inert`，不能误触撤销。
- 打卡：粒子从按钮外缘扩散，白色描边保证在黑白表面均有对比；只在服务端成功回执出现，不移动页面。震动仍受设备支持限制。

参考：[React Bits CountUp](https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/TextAnimations/CountUp)、[ClickSpark](https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Animations/ClickSpark) 的计数 / 局部反馈思路，采用 Vue 与 WAAPI 独立实现；[Motion Reorder](https://motion.dev/docs/vue-reorder) 的排序布局基础。没有复制 React 运行代码或新增依赖。

新增 `scripts/check-round-calendar-motion.mjs` 验证真实时间排序、满圈 / 撤销、「+1」、逐项展开、跨日折叠、松手前相邻月份可见及姓名拖动；可通过 `DORM_BROWSER=webkit` 运行同一套 WebKit 检查。浏览器引擎验收仍不代表实体手机帧率或真实震动。

### 六组交互的实际落点

| 交互 | 使用位置 | 结果与边界 |
| --- | --- | --- |
| 收圆 / 画勾 / 粒子 | `CompletionAction.vue` + `completionFeedback.ts` | 按下立即收拢内部背景为 60px 圆形，服务器确认后描勾与粒子，再恢复胶囊；固定外部尺寸。失败恢复重试，撤销不庆祝 |
| 勾选联动 | 首页小进度环、轮次面板、`completion-linked` 背景 | 同一成功回执更新数字与进度，已完成背景轻微变灰；实际轮次不被动画延迟 |
| 叠卡展开 | 日历列表过去日期 | 日期一行下方两层卡片边缘，点击逐项展开，再点收回。今天默认展开 |
| 吸附与画线 | `RecordTimeline.vue` 日历列表与日期详情 | 多条记录的容器纵向居中吸附，停稳后旁边轨迹描线。首尾受滚动边界约束，避免多余空白 |
| 惯性滚轮 | `TimeWheel.vue` 任务设置截止时间 | 复用 Vant TimePicker 的惯性、越界阻尼与刻度落位，确认后更新原设置字段；键盘仍可编辑原时间输入 |
| 圆形扩散 | 底栏点击切页 | 从触点计算局部圆形裁切，280ms 展开。按住滑动使用 180ms 平移；快速再操作取消旧动画。减少动态效果与键盘不做装饰性扩散 |

Vant Picker 是项目原有依赖；读取其 `PickerColumn.mjs` 的 momentum、clamp、updateValueByIndex 实现后复用，没有另造时间选择算法或新增组件库。日期列表的展开 / 收起保持可中断，所有隐藏记录不能接收焦点或撤销点击。切页关闭非模态详情，后续菜单等待详情关闭，避免两个抽屉重叠。
