# Verification
2026-10-27 开发预览，未创建PR、合并main、发布或接触生产数据库。

## 原版几何依据
使用已存在的50606e3正常构建 `data/draft-rules-dist` 在8122端口只读预览，不重绘或重新实现before。相同合成宿舍/身份/任务API夹具，与当前8119开发版本逐项对照。
`WaterLayout.browser.mjs` 在320×740、390×844、430×932、390×650对身份栏、页面、caption、title承载区、h2字区、actions、links、nav的x/y/宽/高及字号断言：Chromium160项、WebKit160项通过，几何误差小于0.1px、字号字符串一致。390×844时标题区x45/y297.5/300×104，h2字体70.2px，操作区y425.5，导航y764，均为旧原版真实值。

## 运动/交互
`node frontend/src/components/nudge/NudgePane.browser.mjs` Chromium29项通过；加 `DORM_BROWSER=webkit` WebKit28项通过。新增数值弹簧位移中间帧、scaleX>1/scaleY<1的轻量形变、终态归位，实际按住短拖形变/松手不切页不发请求、新铃铛path；保留原真实切任务、API对应、延迟结果隔离、8连点一次请求、纵滑/取消、方向键、返回保留、临时安排、深浅/减动效、创建预览无业务写入及完整动手教程。
弹性复用motion-v animate spring，stiffness380/damping23/mass.65，位移提示28px，scale最多1.035/0.975；不靠延长duration，停止旧flight并保持当前position，序号防旧完成回调复活。内层WaterNudge原点击形变/涟漪保留，不覆写其transform；滑动合成click在父捕获阶段阻断，避免出现“没发送却催促+1”的误反馈。WaterNudge自身源码最终无diff。邻接大字单独裁切，当前名字/涟漪不被overflow误裁。

## 其他验证
类型检查、Vite/PWA构建、严格OpenSpec/scope/18项门禁夹具、diff检查通过；既有check-water-nudge（200并发、回执、限流、重试等）与新只读board9项通过，未改后端或限流检查。未执行本SHA远端CI，不称全仓全绿。

## 调试与证据边界
初次几何采样只等WAAPI而漏掉Motion数值弹簧，误采到了位移中间态；新增真实data-motion状态后等待idle再比较，未给产品增加延时。短屏动作区初差2px，查明旧@max730选择器更高优先级，原gap18而非新组件16，修复后四视口两引擎逐项通过。切换过程中测试初匹配正常退场旧/新两个催促按钮，改为匹配非inert当前标题，不取消原TaskTitle过渡。长名称仅在>8或>16字符时局部缩放字号以保持标题区可容纳，不改普通字体或布局。
证据：`data/nudge-layout/{chromium,webkit}/{before,after}-尺寸.{png,json}`，`*-results.json`；`data/task-nudges/{chromium,webkit}/discovery-frames.json`、screenshots/results、实际webm，WebKit `elastic-preview.mp4`为原录屏前4秒转码。所有视频为桌面引擎，不是手机录屏。
仍未验收实体iPhone Safari/PWA、Android WebView、HarmonyOS ArkWeb和真实触摸帧率。下一组interactive-draft-sandbox目前仅设计登记，尚未实现，不计为已完成。
