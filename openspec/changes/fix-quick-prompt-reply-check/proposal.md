# Why
用户明确授权“允许，仅修这处断言并继续发布”。聊天CI在快捷语随机抽到当前任务时错误等待模拟模型回复；认证事实路径合法，产品不改。
# What Changes
仅修check-companion-chat-browser.mjs原1649快捷语回复等待：按选中问题验证合成当前身份事实回复或模拟模型回复，保留原一次点击只发送一次的断言。不改其他检查点。
# Capabilities
## New Capabilities
- `quick-prompt-check`: 隔离聊天快捷语双回复路径验收。
## Modified Capabilities
无产品行为变化。
# Impact
只改一处测试及本OpenSpec记录。当前网站发布已授权，待最终CI和备份，不授权PR/合并。
