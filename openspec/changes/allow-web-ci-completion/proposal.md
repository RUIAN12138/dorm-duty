# Why
用户明确授权“允许，仅调整 Web CI 时限”。最终SHA的Web任务在15分钟总时限处取消，浏览器安装占用较多时间，已执行检查通过但不能代表整轮通过。
# What Changes
仅将checks.yml中web-and-business的timeout-minutes由15改为25。保留所有测试、等待、断言、依赖和其余任务时限。
# Capabilities
## New Capabilities
- `web-ci-budget`: 保留完整校验的受控Web CI预算。
## Modified Capabilities
无产品行为变化。
# Impact
仅CI配置和本OpenSpec；不新增依赖，不改UI、后端或数据库。用户已授权继续网站发布，不授权PR或main合并。
