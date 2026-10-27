# Verification
2026-10-27 开发预览，不PR、不合并、不发布，未访问生产数据库。

## 实现
- 第二页显示“催促”，内部water路径/ID及旧配置不迁移。原值日/日历页面未重新设计。
- NudgePane复用TaskTitle、createTaskSwipe、WaterNudge和交接动画；大字按水优先/现有任务顺序横滑，48px提交，纵向交还滚动，无tabs或明显切页按键，方向键可用。选中key在页间返回保留。
- 首次可见时球球解释“左右滑动大字，换个任务催促”；1100ms轻量单次位移最多28px，显露邻接字的一部分，用户按下即停止，不强行切换。减动效无位移。
- 原发送API、权限和一分钟限流未改。客户端发送/回执按任务ID与身份隔离，保留真实created_at及相对时间；多个任务分别可取消，不被抬水交接误取消。不会把迟到结果当另一任务已提醒。
- 原本人抬水完成、撤销、提前额度/交接、查看任务、临时安排保留；其他任务本人/已授权代做仍用既有CompletionAction和服务权限。多人任务优先呈现一名未完成室友，不群发。已完成和本人不出现催促入口。
- board只读增加nudge_tasks，旧workspace_tasks仍为空，旧宿舍配置不改；创建预览同样组装合成负ID，无请求。新手练习同步催促入口与最后“真实滑动大字”步骤，不另造按钮。

## 实际验证
- `node site/shared/nudge-task-board.test.mjs`：9项通过，临时SQLite。四类当前任务、旧configuration/workspace契约、未来日期排除、既有remind其他任务、重复429且只存一条、目标错误、跨宿舍、后续读取任务快照不变。
- `node site/scripts/check-water-nudge.mjs`：既有限流回归通过，含200并发点击、真实服务回执时间、429/重试、身份隔离和相对时间；未编辑原检查。
- `node scripts/check-dorm-wizard.mjs`：108项通过。`node --experimental-strip-types site/shared/draft-preview-rules.test.mjs`：2060项通过。
- `node frontend/src/components/nudge/NudgePane.browser.mjs`：Chromium25项通过；加 `DORM_BROWSER=webkit`：WebKit24项通过。包括实际大字位移中间帧和归位、无切换按钮、球球提示、真实滑动无发送、点击对应任务、迟到回执隔离、8连点仅一次API、纵向/取消、方向键、页间保留、抬水临时安排、320/390/430宽、暗色/减动效、真实组件草稿催促零写入、整套教程点击后自动推进。Chromium另用CDP touchStart/move/end验证真实浏览器触摸输入流；不是实体手机。
- 教程依次实际操作导航、详情/关闭、完成抬水、交接、催促、滑动大字，最终自动返回目录并标记已练习；浏览器异常0。真实催促测试仅一条隔离SQLite通知；预览/教程零写入，不宣称整套测试零请求。
- `npm run typecheck --prefix frontend`、`npm run build --prefix frontend -- --outDir ../data/nudge-dist`、22项 `web:test-state`、`spec:check`、`git diff --check`通过。已有bundle大小提示保留，无新依赖。

## 发现与修正
首次新测试因相对导入路径多一级而启动失败，修正测试路径；SQLite测试重复close导致进程退出失败，改为单一h.close后重测通过。位移检查先用固定70帧误把未结束动画当归位失败，改为等待真实有限动画finished再断言终态，不延长产品动画。类型检查发现handoffActive同名变量误用，已修正。截图发现姓名收缩竖排，组件局部给容器完整宽度后增加断言。实际触摸后测试匹配到正常退场旧标题，等待动画完成后验证单一标题；未删除标题过渡。教程截图现在等待真实讲解/光圈动画，避免展示过渡中空帧。

## 证据与限制
`data/task-nudges/{chromium,webkit}/` 包括 water.png、floor.png、dark-reduced.png、tutorial-swipe.png、results.json、实际操作webm；WebKit flow.mp4为原录屏转封装/编码，无伪造帧。`data/nudge-*.log`为原始结果。
预览 `http://127.0.0.1:8119/water?start=1`（临时SQLite、合成身份，无生产转发），创建 `/?preview=new-dorm`，教程 `/guide?practice=1`。
未执行远端CI；既有按第二页旧tabs/抬水文案编写的脚本没有擅自重写，不能宣称全仓库CI全绿。实体iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb、真实系统通知尚未验证。用户体验确认与正式操作仍待。

## 2026-10-27 交接优先级修复（待最终发布验收）
用户明确授权调整正式催促页和相关检查。`check-completion-experience.mjs` 将正常交接的稳定采样移到首次提示完成后，同时用独立临时宿舍真实按下操作验证提示过程中的中断、完成期间停留、回弹和只交接一次；未移除原有稳定性与反馈检查。Chromium、WebKit 各 196 项通过；NudgePane 独立浏览器回归两引擎通过；前端类型检查通过。桌面浏览器不是 iPhone、Android 或 HarmonyOS 真机。
