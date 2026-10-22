# 验证记录

## 范围与环境

分支 `codex/chat-keyboard-viewport`，实现基线 `039b73ab42c19277d739185c9666f6a0831515ae`。仅修改聊天键盘布局、必要滚动协调、新增回归及本 change 文档；没有修改原生壳、服务端或生产数据。前置双击修复保持原样，其 diff 与 `data/chat-keyboard/pre-existing.patch` 的 SHA-256 均为 `0c44ca21c1e7fc8ba60e346d5d263c3e97cbaa3dddde7973dfda59d31a99a3ba`。

## 实现与独立审查

按 `CLAUDE_TASK.md` 经 Claude 本地实现，再由 Codex 审查差异、复现和修正。没有把构建结果当作真机验收。

- 一个合帧的 Visual Viewport 状态统一驱动聊天根容器、输入框间距和底部玻璃；有真实视口缩小时连续收敛至 10px 外缘间距，无新增固定时长 bottom 动画。
- 顶部紧凑布局只按进入时屏高决定，避免键盘展开时球球突然缩小、改位。
- 历史阅读锚点和接近底部的跟随意图保持独立，不在聚焦时重播首次定位。
- 审查补齐：键盘只缩小 40px 就提前失焦时继续跟踪；带键盘关闭后重开主动应用最新视口快照；最后一个恢复事件后再核对一帧；取消空列表 0→0 的无意义 smooth 请求。

## 自动回归

两个引擎分别执行，最终结果：

| 检查 | Chromium | WebKit |
| --- | --- | --- |
| `check-chat-keyboard-viewport.mjs` | 98 项通过 | 98 项通过 |
| `check-companion-tap-arbitration.mjs` | 48 项通过 | 48 项通过 |
| `check-ios-chat-motion.mjs` | 18 项通过 | 18 项通过 |
| `check-chat-motion-continuity.mjs` | 23 项通过 | 23 项通过 |
| `check-chat-entry-polish.mjs` | 14 项通过 | 14 项通过 |

键盘测试模拟 Visual Viewport 变化，覆盖候选栏高度变化、offsetTop、安全区、早/晚失焦、阅读历史、短屏、无 Visual Viewport 回退、缩放、事件合帧、关闭再重开和草稿。它不产生真实手机输入法。

日志：`data/chat-keyboard/keyboard-final-{chromium,webkit}.log`、`check-*-{chromium,webkit}.log`、`entry-final-{chromium,webkit}.log`；详细结果 `data/chat-keyboard-viewport/{chromium,webkit}-result.json`。

独立几何探针原先观测到间距从 58px 跳到 12px，球球顶边从 48px 变为 18px；修正后间距连续收敛到 10px，球球顶边保持 48px。关闭恢复再打开时根容器和可视高度都为 844px。探针证据在 `data/chat-keyboard/{before-geometry,after-geometry}.json` 和 `probe-final.log`。

保留失败证据：浏览器与两个重型模拟器同时运行时，实际两次点击间隔超过 300ms，旧双击测试失败；停止本轮启动的模拟器后分别重跑通过，未放宽手势窗口。另一次旧入场回归发现 0→0 的多余 smooth 调用，修复后两个引擎各 14 项通过。原始日志和时间戳在 `data/chat-keyboard/overload-failures/`、`diagnose-entry.log`。

## 真实运行与未完成验收

- **iPhone Safari：未验收。** 本轮设备发现为空，用户明确选择“暂时不连接，先做隔离预览”。中文、英文、表情、第三方输入法候选栏仍需真机。
- **Android WebView 模拟器：键盘验收未通过。** 实际软键盘已出现且输入框聚焦，但 WebView 报告的 visualViewport/innerHeight 未缩小，输入框仍被键盘遮挡；修改前也可复现。原生窗口/IME 几何需要单独定位，本轮没有越界改壳。
- **HarmonyOS ArkWeb 模拟器：键盘验收未完成。** 输入框已聚焦，但没有唤起软键盘，无法验证真实键盘贴合。

原生运行的应用域名请求全部拦截到本地新建隔离数据，不发送真实邮件、推送或留言。证据 `data/chat-keyboard/{9227,9228}-failure.{json,png}`、`native-9227-final.log`、`native-9228-final.log`、`android-diagnostic.png`。本轮启动的模拟器已关闭；鸿蒙已恢复正常调试安装包。

## 交付边界

本机预览 `http://127.0.0.1:8092/?start=1`，模拟 AI、内存隔离数据，邮件/推送关闭。局域网地址以 `data/conversation-preview/server.json` 为准。

用户验收仍 pending；未提交正式 PR、推送、合并 main 或部署正式站点。

## 最终静态检查与预览

`npm run typecheck --prefix frontend`、`npm run build --prefix frontend`、四个代码/测试文件的 Prettier 检查、`npm run spec:check`（含 18 个范围门禁测试）、`node scripts/check-companion-preview-check.mjs` 和 `git diff --check` 均通过。日志为 `data/chat-keyboard/{build-delivery,spec-delivery,unit-delivery}.log`。

最新源码已重新启动隔离预览并在应用内浏览器打开，聊天正常加载、输入框可用；最终截图 `data/chat-keyboard/preview-delivery.png`。本机截图没有真实手机软键盘。当前可用局域网地址 `http://192.168.2.60:8092/?start=1`，网络变化后应重读 server.json。
