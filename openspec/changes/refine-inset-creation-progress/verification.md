# Verification

用户验收pending；未PR、合并、部署或接触生产数据。继续既有开发分支 `codex/wizard-single-screen-polish`，实现基线bbbfcfadca98690585f3a3dffd906808a99fbb95。

## Product delta
仅CreationProgress.vue的creationMode：内部6×4短槽，当前槽轻微放大；附近坐标二次衰减吸引，不改原始指针选择阈值；创建弹簧使用可见精度收尾；拖动形变80ms接续。workspace原参数与CSS路径保留。输入框、标题、正文、footer和业务均未编辑。

## Executed
- 实施前用 `DORM_CAPTURE_BASELINE=1 node scripts/check-inset-creation-progress.mjs` 及 `DORM_BROWSER=webkit` 保存真实旧版截图/坐标。实施后同脚本两引擎各27项通过：真实页面按下/拖动/反向/取消/重按、缺失震动能力、320/390/430宽、暗色/减动效，消息和业务写入0、异常0。创建允许的启动/email/enter单独排除，不宣称整个启动无网络。
- `node scripts/check-wizard-single-screen.mjs` 与webkit各50项通过：五页、普通手机一屏、模拟安全区/键盘、二十项分页和草稿保持。日志data/inset-single-screen-{chromium,webkit}.log。
- `DORM_WIZARD_ORIGIN=http://127.0.0.1:8104 node scripts/check-dorm-wizard-browser.mjs` 与webkit各212项通过：原创建/实时预览/工作台、常驻玻璃与动态多步骤、拖动排序和隔离操作。没有修改这些既有测试。
- `npm run web:test-state` 22项通过。`npm run web:build` 类型、Vite/PWA通过；已有>500kB分块提示仍在。构建生成的site/runtime/push-runtime.cjs路径标签差异已恢复，不混入产品提交。
- `npm run spec:check` strict25/25与范围24changes/438files、18项门禁测试通过。验收pending，不填写接受摘要或发布授权。
- 本次桌面引擎采样松手至完全隐藏约451ms（Chromium）/441ms（WebKit），包含吸附和淡出；这是局部采样非真机性能结论。原始opacity/scale逐帧数组见results.json。

## Evidence
预览 http://127.0.0.1:8104/?preview=new-dorm 。用户原8102是较早预览服务，已将当前浏览器页转到8104并实际拖动确认标题/Tips联动，再返回名称页。
- data/inset-creation-progress/{chromium,webkit}/before-light.png、after-light.png、before-dark.png、after-dark.png、pressed-light.png、results.json。
- data/inset-creation-progress/webkit/comparison.png：真实修改前后完整页面，标题/输入框/球球区/底栏/进度宿主坐标精确一致。
- data/inset-creation-progress/progress-drag.mp4 / .webm：约9.52秒真实桌面WebKit操作，依次经过步骤、反向和暗色；不是iPhone录屏。
- 首次生成对比图时系统python无Pillow，未安装/改环境，改用Codex已捆绑Python成功生成。

## Limits
实体iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb均未测，不把桌面移动视口、模拟震动/键盘或录屏称为真机通过。无生产数据库操作。
当前CHATGPT_REVIEW仍针对旧1f7dee95fac6015721f1a255e12add34d290703f；上一代码bbbfcfa远端Web CI的聊天快捷语固定回复断言失败已单独报告。本轮未获该测试编辑授权，没有修改聊天产品/脚本来掩盖该失败；本轮最终远端CI单独报告。

## Website publication request
用户在本轮预览后明确“更新到网站”，授权将当前分支已完成内容构建为正常网站版本 `20261026-wizard-progress-v85`，不包含隔离预览服务器/模拟账号，不授权PR或main合并。产品验收仍pending、真机缺口仍保留；只在最终CI通过、正常包冒烟和服务器备份后安装。发布授权绑定当前全批次摘要，后续实现变化不得复用。SSH当前不可用，等待用户重建共享连接；目前尚未发布。
