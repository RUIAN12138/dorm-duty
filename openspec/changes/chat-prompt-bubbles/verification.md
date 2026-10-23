## Status
2026-10-23，本地实现与隔离浏览器回归完成；用户产品/实体设备验收仍 pending。初始预览阶段未执行正式操作；随后用户新原话「推送 PR 更新网站」授权当前内容创建审查 PR、推送开发分支及部署正式网站，不授权合并 main。分支 `codex/chat-prompt-bubbles`，实现基线 `b3456527c3e11ef1adad178b392c47cd7aa8431f`。正式部署不替换或恢复数据库。

已先提供八节 Claude 任务书并调用本地 CLI；CLI 返回 402 Insufficient Balance、未写代码。已向用户说明后在该精确范围内实现，记录在 `data/chat-prompt-bubbles/claude.log`。

## Independent preview
地址：http://127.0.0.1:8092/?start=1 。单击球球进入聊天；「我要留言」仍使用现有流程。服务使用隔离合成宿舍、隔离历史和模拟 AI，不发送邮箱、推送或真实室友留言。

预览入口由 `data/chat-prompt-bubbles/preview-server.mjs` 启动；可运行 `node data/chat-prompt-bubbles/check-preview.mjs` 复核。结果 `data/chat-prompt-bubbles/preview-check.json` 已通过：示例回复自然分为四段，快捷语单行、留言第一项。最终截图 `data/chat-prompt-bubbles/preview-chat.png` 已实际打开检查。原有布局、球球、上下玻璃和输入组件保持。

## Automated evidence
下列日志均在本工作树的 `data/chat-prompt-bubbles/`，浏览器夹具顺序运行，使用临时 SQLite 数据及真实 Vue 组件。AI 回复由测试路由提供，不代表真实模型、邮件或原生推送验收。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `node scripts/check-chat-prompt-bubbles.mjs` | 21 项通过 | `pure.log` |
| 新展示浏览器回归 Chromium / WebKit | 各 44 项通过 | `chromium-result.json`, `webkit-result.json`, 对应 `.log` |
| 既有紧凑布局 Chromium / WebKit | 各 42 项通过 | `compact-chromium.log`, `compact-webkit.log` |
| 既有聊天与业务 Chromium / WebKit | 60 / 58 项通过 | `chat-chromium.log`, `chat-webkit.log` |
| 既有初始定位/渐清 Chromium / WebKit | 均通过 | `entry-chromium.log`, `entry-webkit.log` |
| `npm run web:test-state` | 通过 | `state-regression.log` |
| Vue TypeScript 检查 | 通过 | `typecheck.log` |
| 前端隔离构建 | 通过，产物仅本地 `data/chat-prompt-bubbles/build/` | `build.log` |
| 修改文件 Prettier / `git diff --check` | 通过 | `format.log` 与最后差异检查 |
| `npm run spec:check` | 严格验证与 18 项 scope gate 回归通过 | `spec-final.log` |

覆盖 320/390/430/768px：单行固定 44px、横滑溢出、每次完整重入重新抽样、入口内稳定、留言在首位、横滚重置。纯测试另覆盖固定/非法随机源，避免循环或重复。

回复验证包括中文自然句、停顿、词边界、英文、URL、空白/换行、标点、ZWJ emoji、肤色、旗帜和组合字符；拼接严格等于原始返回字符串，每泡不超过 20 字素。用户长消息不拆分；历史即时显示、不重播；重新加载结果与 ID 一致。原始数据库回复不改，多个显示泡仍只有一条 assistant 业务记录；单次发送只有一次接口请求。清空、关闭、卸载与减少动态效果均检查队列释放/终态，避免旧回复复活。

新泡实际捕获到中间 opacity/transform 帧；队列配置延迟 150–250ms，浏览器观测间隔主要约 194–238ms，WebKit 一次约 270ms（渲染调度开销），不将配置时长宣传为硬实时保证。查看历史时不抢滚动；留言快捷语不调用 AI、不自动发送留言。键盘紧凑态通过模拟 visualViewport 回归，深浅色玻璃输入框仍可达。

## Scope, authorization and limitations
- 实际代码只在 CompanionChat、ChatReplyText、三个展示工具及针对性测试中变动，范围清单见 `scope.json`；未修改后端、chatViewport/chatLayout/chatScroll、球球入口、导航、玻璃、通知或原生端。
- 原始历史和业务操作仍由原控制器管理；仅展示层分段。服务端原有 `shortMessages` 的 20 码点/最多六段限制未变；不会声称恢复服务端从未返回的模型文字。
- 所测 Chromium/WebKit 实际提供原生 Intl.Segmenter。旧内核降级仅保护已覆盖的常见 emoji/组合序列，不宣称完整 Unicode UAX29 实现。
- `xcrun xcdevice list` 无可用实体 iPhone；adb、hdc 无设备。未进行 iPhone 中文/英文/表情实际输入法或 Android WebView、HarmonyOS ArkWeb 真机测试。用户此前选择先做隔离预览，本轮不重复要求连接。
- 初始预览阶段 PR/publish gate 均以 exit 1 拒绝，见 `gate-pr.log` / `gate-publish.log`。本轮最新用户指令授权交付完整的当前构建，因此全部在途 scope 的 PR、publish 动作授权分别绑定同一当前批次摘要；不修改 acceptance、不追认实体设备验收、不复用旧版本摘要。
- 只读检查发现上一轮 PR #82 的 CI run 39889161247 有两项既有聊天交互检查失败；完整失败记录保留在 `previous-v78-ci-failed.log`。本轮没有擅自修复其范围外断言或声称上一轮 CI 全绿。本轮以上本地结果与该旧 CI 分开记录。

## Rollback
只撤回本 change 相对实现基线的精确文件差异；不执行数据库还原，不碰其他工作树或线上数据。预览验收通过前维持 `acceptance.status = pending`。

## v79 delivery preparation
- 发布名称 `20261023-chat-prompt-bubbles-v79`；仅增加 ReleaseNotice 的三条本轮版本文案，既有弹窗结构和动效不改。
- v79 更新提示使用独立夹具在 Chromium / WebKit 各通过 13 项检查：版本及文案、可见中间帧、只确认当前版本、不重复弹出、更新失败重试、延后不立即重开、保护聚焦表单、窄屏与减少动态效果。证据 `data/chat-prompt-bubbles/publish/release-notice-*.log`。
- 服务器预检确认旧版 `20261023-banner-reply-v78`、服务 active、健康正常。先在线备份和保存完成记录摘要，再安装纯代码包；部署结果与公网核验完成后另记实测值。
- PR 基础分支为 `codex/liquid-glass-optics`（PR #82），仅展示本轮新增差异；不更新或合并既有 PR。
