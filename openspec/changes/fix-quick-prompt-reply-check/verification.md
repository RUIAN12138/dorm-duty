# Verification
用户原话“允许，仅修这处断言并继续发布”。产品代码不改；仅目标采样快捷语回复等待按问题选择事实/模型文案，原用户消息数量及文本一致断言原样保留。
`DORM_CONTINUITY_QA=1 node scripts/check-companion-chat-browser.mjs` 与 `DORM_BROWSER=webkit` 已完整通过；原始日志data/v85-chat-check{,-webkit}.log，errors为空，均使用隔离夹具与合成身份/模型。没有声称实体设备通过。完整脚本检查点数量写交接报告。
正常v85包已通过7个路由/资源/health、更新说明关闭后真实教程自动推进、无fetch/XHR冒烟。额外使用非localhost测试域代理到本地正式包，仅合成邮箱发现接口，确认没有本地体验入口，创建进度5个6×4标记、松手前切页与松手隐藏通过，业务写入0。第一次该额外检查未等待首次更新说明完全出现，在后续点击被release-shade挡住；修改临时检查先等待并正常关闭更新说明后通过，没改产品。
待最终发布授权摘要、最终SHA的CI、重建正常包、在线备份与发布验证；产品验收pending，不授权PR/合并。
