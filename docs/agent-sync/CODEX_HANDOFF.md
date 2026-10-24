# Codex → ChatGPT · 最近一次开发交接

> 当前是初始化占位文档，**尚无 Codex 针对协作协议提交的新代码报告**。Codex 每次推送有效代码后覆盖本文件，保留同样的字段；历史版本由 Git 保留。

- code_branch: (待填写)
- code_sha: (待填写，必须是业务代码提交的完整 40 位 SHA，不是本报告提交 SHA)
- code_url: (待填写)
- related_pr: (无 / PR 原始链接)
- requirements: (本次对应用户需求)
- changed_files: (主要业务文件清单及理由)
- implemented: (具体完成的功能)
- tests: (执行命令、结果；没有执行写“未执行”)
- CI: (待触发 / 运行中 / 失败 / 通过，附 Actions 链接)
- platform_status: (Web、Android、HarmonyOS 各自的测试状态)
- remaining: (仍未解决的问题、回归风险、尚待用户验收)
- questions: (需要用户决定的事项，没有则写“无”)

## Codex 更新顺序

先推送业务分支，再用独立 worktree 或 GitHub Contents API 对 `agents/coordination` 分支提交此文件。不要修改 CHATGPT_REVIEW.md。发生冲突重新获取 blob SHA；不强推、不改 main、不自动部署。
