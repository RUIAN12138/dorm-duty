## 修复前复现
2026-10-22，修改前运行 `node data/tap-followup/probe-edges.mjs`：Chromium和WebKit均显示 `header double chat 1`，即误开聊天。两次坐标分别为原52px球中心(-22,+12)与(+22,-12)，间隔130ms；均在原按钮内，相距约50px。中心双击对照为 `chat 0`。

## 代码与审查
运行时代码仅 `frontend/src/components/DormCompanion.vue`：第二次按下额外检查原球实际矩形，命中则映射为首击逻辑原点；不扩大280ms时间窗，不新增等待，不改变表情袋或共享弹簧。保留原点36px小漂移及移动球边界36px容差，继续调用同一控制器检查有效窗口。没有后端、配色、布局或生产数据变更。

## 本轮验证
- 独立修复后复跑原复现脚本：Chromium `chat 0`、WebKit `chat 0`，原球随机表情变化。输出 `data/tap-followup/edges-after.log`。
- 点击仲裁浏览器回归：Chromium、WebKit各48项，包含相反方向的原球边缘真实触摸/鼠标、中心、移动球、超时与无关位置、单击、长按、拖动、键盘、连续双击、减少动态效果和延迟合成click。Codex审查后加强无关区域负例，确认pointerdown实际到达聊天组件，再次执行两种引擎，均48项通过、零异常；最终日志 `data/tap-followup/final-{chromium,webkit}.log`，结果 `data/tap-arbitration/{chromium,webkit}-gesture.json`。
- 旧聊天空间连续性回归WebKit通过，含中间帧、回程、草稿、玻璃、消息和输入布局；日志 `data/tap-followup/motion-webkit.log`。
- 单元检查通过：`node scripts/check-companion-preview-check.mjs`，日志 `data/tap-followup/unit.log`。
- 类型与构建通过：`npm run build --prefix frontend`，日志 `data/tap-followup/build.log`；限定文件Prettier及 `git diff --check`通过。
- OpenSpec校验与范围报告另见 `data/tap-followup/spec-final.log`。

## 验证过程中的测试修正
新增“超时后点击返回”的首轮断言错误地比较打开前与关闭后表情，受到既有AI初始化和共享状态交接影响而失败。仅将该断言改为返回前后早期观察，并另外明确检查聊天真正关闭、只一次历史请求；未为该断言修改产品代码。失败记录保留在 `data/tap-arbitration/chromium-gesture-failure.json`，不隐去失败。

## 隔离预览与限制
`http://127.0.0.1:8092/?start=1` 使用新建内存宿舍、模拟AI、不发邮箱或推送，不复制生产数据。实际iPhone Safari、Android WebView、HarmonyOS ArkWeb本轮未测试；浏览器触摸模拟不能作为实体设备验收。用户尚未验证本轮结果。正式站只读确认仍为v75，本轮不创建PR、不推送、不合并、不发布。
