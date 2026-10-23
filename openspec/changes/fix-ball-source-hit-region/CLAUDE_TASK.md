## 1. 背景
用户报告v75双击仍进入聊天，已复现同一原球内相反边缘二击漏判。
## 2. 当前仓库状态判断
独立分支codex/fix-ball-double-tap-followup，基于039b73a；此前工作区干净。本change尚待验收，不复用旧授权。
## 3. 本轮目标
仅修复原球体有效二击命中范围，不延长280ms窗口，不重写聊天。
## 4. 修改范围
frontend/src/components/DormCompanion.vue、scripts/check-companion-tap-arbitration.mjs。需要变更其他代码先报告。
## 5. 禁止事项
不改布局/配色/表情袋/后端/键盘/长按/共享弹簧；不修改私密文件；不git提交或推送、不PR、不部署。不启动其他代理。不修改本任务及scope。
## 6. 具体任务
读取AGENTS和本change。predictiveDown现有逻辑只保留tapPoint36px与移动球矩形+36px，遗漏原tapOrigin实际矩形。第二击若在源球实际矩形应mapped tapPoint，同样复用tapGesture.press的窗口判定。保持外部区域不截获与合成click去重。新增真实浏览器触摸和鼠标回归：首击中心(-22,+12)，130ms后二击(+22,-12)；还应覆盖反方向、迟到窗口和外部区域不吞操作。不可仅用dispatchEvent或放宽断言来通过。处理最小必要关联问题并说明。
## 7. 验收标准
修复前新边缘测试失败，修复后两引擎通过；聊天关闭、零聊天请求、随机表情改变。中心/移动/单击/长按/拖动/键盘/合成click/减动效保留。npm run spec:check通过。不要虚构真机结果。
## 8. 完成后输出
精确diff原因、命令和真实结果、未测项。Codex随后独立审查与复测。输出保持简短。
