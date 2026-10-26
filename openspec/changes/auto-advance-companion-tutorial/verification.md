# 本地验证 · 2026-10-26

- 基于 v83 `a732d214d45bda85355e7d7feee031eba3683d12`，当前独立分支 `codex/tutorial-auto-companion`。本轮新需求不复用 v83 发布授权。
- 复用 DormCompanion 在上方对话框讲解；移除继续按钮，27 个操作依据实际完成状态和必要动画收尾自动推进。全局弹窗暂停、步骤变化、退出及卸载会废弃旧推进任务。不存在等待固定毫秒后盲目跳步。
- 详情关闭步骤放行整张详情面板，便于阅读；顶部控件附近让位，其他页面位置不动。排除球球持续眨眼等无限动画及其内部样式噪声，避免阻塞推进/重复测量。
- `node scripts/check-guided-onboarding.mjs`：Chromium 50 项通过；`DORM_BROWSER=webkit ...`：桌面 WebKit 50 项通过。覆盖无继续按钮、球球讲解、无操作不推进、四章真实操作逐步推进、零 fetch/XHR、全局弹窗、退出清理、320/390/430 宽度、暗色减动效及三种屏幕正式布局。
- 证据 `data/auto-tutorial/{chromium,webkit}/`：`duty-step.png`、`note-confirm.png`、`practice.webm`、`results.json`；自动化真实操作录屏，不是实体 iPhone。
- 预览 http://127.0.0.1:8098/guide?practice=1 。类型/前端及 PWA 构建、22 项状态回归通过；OpenSpec 检查另行记录当前最终摘要。
- 尚未实体 iPhone/Android/HarmonyOS 测试或取得本轮产品验收；不推送、不开 PR、不合并、不发布。
