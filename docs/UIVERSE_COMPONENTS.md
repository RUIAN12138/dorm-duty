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
