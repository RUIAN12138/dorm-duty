# 验证记录 · 2026-10-26

## 基线与范围

- 基于 `8a6d63640cc406b160fc92c96e22f95ba162e3b6`；独立工作树 `/private/tmp/dorm-duty-guided-tutorial-20261026`，分支 `codex/restore-layout-guided-tutorial`。
- 用户要求恢复正式组件排版，以及把说明式教程改为真实控件操作式教程。v81 与 v82 的 ScreenStage、screen.css、main.ts 相同；未将问题虚构为 v82 新增 viewport 逻辑或简单回退发布号。
- 正式组件原有尺寸被 `.app-stage` 下的容器尺寸覆盖改变。新增仅供已进入正式页面的内容承载模式，退出这些尺寸覆盖；创建向导继续使用原有固定屏幕容器。未改任务按钮、导航材质、身份、轮序、历史和通知接口。
- 保留原有完成/撤销、抬水交接与球球聊天。正文中的“恢复”指恢复现有组件固有排版；用户对其与原体验的视觉一致性仍待验收。

## 教程

- 四章共 27 个操作步骤：值日 8、抬水 5、日历 5、留言 9。真实操作结果成立后才可继续。
- 直接复用 ChoreBoard、ChoreCalendar、CompanionChat、留言状态机和完成控件。练习适配器使用负数合成身份、空 token 和专用 invite；只有在 preview 与显式注入匹配时才启用。普通预览仍不可打卡；正式路径无注入，沿用既有服务。
- 详情/聊天属于 Reka 模态层。教程控制器随当前活动 dialog 一起挂载，避免教程按钮被当作外部点击、误关抽屉。操作结果聚光转向真实详情和确认卡片，便于阅读。
- 每次章节重练重置内存数据。关闭/完成清理聚光层及 portal；无真实 AI、邮件或通知。

## 已执行

- `node scripts/check-guided-onboarding.mjs`：Chromium 47 项通过；完整四章、真实完成动画中间状态、零 fetch/XHR、320/390/430px 命中、暗色/减动效、退出清理，以及 320×568、390×844、430×932 正式组件宽度/导航检查。
- `DORM_BROWSER=webkit node scripts/check-guided-onboarding.mjs`：桌面 WebKit 移动视口同 47 项通过。它不是实体 iPhone Safari/PWA。
- `DORM_WIZARD_ORIGIN=http://127.0.0.1:8098 npx --yes node@22 scripts/check-dorm-wizard-browser.mjs`：整套 Chromium 回归退出码 0；包含创建、实时预览零请求、真实组件复用、导航编排、旧/新配置、设置工作台、欢迎页与新练习入口及原有聚光灯键盘/焦点检查。只更新欢迎页完成后的新流程期望，保留业务及隔离断言。
- `node scripts/check-screen-gesture-check.mjs`：真实组件处理器检查通过，覆盖按住、中断、视口噪声、回弹和浮窗手势；这是内存逻辑测试，不是触屏设备证明。
- `npm --prefix frontend run build`：类型检查、Vite 与 PWA 构建通过；已有 DormWizard 大 chunk 警告仍存在，本轮未进行无关拆包。
- OpenSpec strict validate：20 passed / 0 failed；范围检查通过。`git diff --check` 通过。

## 本地证据

- 预览 `http://127.0.0.1:8098/`；直接练习 `http://127.0.0.1:8098/guide?practice=1`。仅本机可用，不指向正式站。
- `data/layout-restore/{before,after}-{duty,water}.png`：同一合成数据、390×844；before 由未修改的已发布代码在独立本地端口 8100 运行，after 端口 8098；不是正式宿舍截图。
- `data/guided-onboarding/{chromium,webkit}/`：目录、实际任务聚光、完成中间帧、确认卡片、暗色减动效、各宽度正式组件布局与 results.json。
- `data/guided-onboarding/{chromium,webkit}/practice.webm`：本次自动化实际操作录屏；测试代码等待动画完成和几何稳定帧后截图，不用固定延时掩盖产品问题。
- 截图/视频与合成 SQLite 位于忽略的 data 目录；不提交运行数据库或私人数据。

## 仍未验证与交付边界

- 未连接实体 iPhone，主屏幕独立运行、中文/英文/emoji 键盘与真实 safe area 待验收；Android WebView、HarmonyOS ArkWeb 真机未测。
- 用户对恢复排版的最终视觉认可未取得。未迁移/读取正式数据库，未更新服务器。
- 当前 AGENTS.md 对未验收预览要求不推送；因此仅保留独立本地分支，不创建 PR、不合并、不推送或部署，不复用上一批 v82 授权。
