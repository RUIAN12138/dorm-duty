# 验证记录 · 2026-10-26

## 实现与边界
产品仅修改六个组件：CreationProgress、LiveDraftPreview、NewTaskPane、TaskSelector、ChoreBoard、ScreenStage。正式值日选择器原样提取，根类、按钮结构、尺寸、完成勾选和按压保留，第二页使用同一组件。旧宿舍业务、权限、任务/记录数据结构、后端及全局CSS不变。

用户最新要求覆盖上一版本的“完全无节点”：最终为五条轨道内部短刻线，不恢复大白圆、数字或刻度尺。预览使用正式content-stage模式及guest-page容器、安全区/导航留白；仅指定自己的滚动根，页面导航局部回顶与正式router一致。

## 实际结果

- `node scripts/check-preview-task-navigation.mjs`：Chromium 40项通过。
- 同命令 `DORM_BROWSER=webkit`：桌面WebKit 40项通过。
- `DORM_WIZARD_ORIGIN=http://127.0.0.1:8104 node scripts/check-dorm-wizard-browser.mjs`：Chromium / WebKit 各212项通过。
- `node scripts/check-wizard-single-screen.mjs`：Chromium / WebKit 各50项通过。
- `node scripts/check-completion-experience.mjs`：Chromium / WebKit 各193项通过。首轮并行运行曾在Chromium鼓励气泡中间帧采样失败，未改产品反馈或该断言，重跑后通过，保留为时序敏感记录；不能由此宣称真机稳定帧率。
- `node scripts/web-command.mjs test-state`：22项通过；类型/Vite/PWA构建通过，保留既有大分块提示。
- OpenSpec strict、范围和diff检查通过。

新专项使用临时SQLite正式API生成动态配置宿舍与独立旧宿舍；邮箱身份全部为测试注入。正式页与预览身份栏/任务栏x、y、宽高在2px内一致（本次水页任务栏实际完全相同：x28、y177.5、宽334、高44）；标题字号、选择按钮字号与圆角一致。

覆盖点按切换、标题横滑、快速中断/反向选择、真实TaskTitle透明度与位移中间帧、返回保留选中项、单任务无选择器、真实详情抽屉、320/390/430px、暗色减动效。预览交互fetch/XHR=0、业务写入=0、异常=0；隔离数据库所有含dorm_id的旧宿舍行逐字节一致。

Chromium用真实mouse.wheel验证预览本地原生滚动不被整屏弹性劫持。移动WebKit的Playwright不支持mouse.wheel：改为明确标注的程序滚动位置/合成WheelEvent处理器检查，只证明事件未被取消；不冒充原生触摸或真机滚动验证。首次测试误把允许的局部横向溢出判作失败，现检查本地overflow-x:auto及页面不越界，没有删减功能以通过测试。

## 证据与预览

- 本机预览 `http://127.0.0.1:8104/?preview=new-dorm`。
- `data/preview-task-navigation/{chromium,webkit}/{live-duty,preview-duty,live-water,preview-water,dark-water}.png` 与 results.json；全流程 navigation.webm。
- `data/preview-task-navigation/flow.mp4` / flow.webm：真实Vue页面录屏（桌面WebKit，含进度拖动、全屏预览、多任务第二页切换）。初次录制在最后一步仍查找已隐藏的footer预览按钮而超时，改用该页实际“打开实时预览”入口重录，未修改产品入口。
- `data/wizard-single-screen/{chromium,webkit}/step-2.png`：短刻线进度。
- 日志 `data/preview-task-*.log`，完整完成反馈证据由原检查写入其既有忽略目录。

实体iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb本轮均未验收。用户视觉验收pending，无PR、main合并、正式部署或生产数据库访问。
