# 轮到 · Codex ↔ ChatGPT 协作协议

> 协作分支：`agents/coordination`；仅用于需求、报告和评审，不包含业务代码。正式开发继续在原有 `codex/*` 工作分支进行，未经用户批准不得新建正式 PR、合并 main 或部署自用服务器。

## 分工

- **用户**：唯一产品需求与最终验收来源。用户后续指令高于本文和所有代理建议。
- **Codex（执行者）**：检查正在使用的开发分支和最新代码，实施小范围改动，运行测试；每次有实质代码修改后提交、推送到 GitHub，并更新本分支的 `CODEX_HANDOFF.md`，准确指明代码分支与提交 SHA。
- **ChatGPT（审查／规划者）**：核查报告中的真实代码差异、PR/CI 和既有需求；仅在新的开发提交或需处理的阻塞出现时更新本分支的 `CHATGPT_REVIEW.md`，列出按优先级的下一步修改建议。建议不是已经实施或已经验证的结论。

## 每轮循环

1. Codex 先读取 `USER_REQUIREMENTS.md` 与最新 `CHATGPT_REVIEW.md`；使用已在开发的业务分支，不要误以过期 main 覆盖新功能。
2. Codex 在业务分支中仅完成一组相关改动，做必要测试，`git commit` + `git push`；不能只写本地文件而声称已同步。
3. Codex 使用 GitHub API 或单独的 Git worktree，更新 `agents/coordination:docs/agent-sync/CODEX_HANDOFF.md`。在文档中写明 **业务代码 commit 的完整 SHA、分支名、已执行验证及限制**。报告更新自身的 commit SHA 不是业务代码 SHA。
4. ChatGPT 发现 CODEX_HANDOFF 中 **新的业务代码 SHA** 后，核对真实 diff、测试和相关 PR，必要时检查文件与改动范围，再更新 `CHATGPT_REVIEW.md`。同一 SHA 只评审一次，无新内容不重复发建议。
5. Codex 在下一轮开始前先 `git fetch origin agents/coordination` 并读取 `origin/agents/coordination:docs/agent-sync/CHATGPT_REVIEW.md`；对照 `reviewed_code_sha` 确认是针对自己版本的建议后再执行，过期则请求重新评审。

## 两份交接文档的固定格式

- `CODEX_HANDOFF.md` 由 Codex 独占写入：`code_branch`、`code_sha`、`code_url`、`related_pr`、`requirements`、`changed_files`、`implemented`、`tests`、`CI`、`platform_status`、`remaining`、`questions`。
- `CHATGPT_REVIEW.md` 由 ChatGPT 独占写入：`reviewed_code_sha`、`reviewed_branch`、`assessment`、`P0/P1/P2`、`acceptance`、`risk`、`need_user_decision`。
- 文档记录可观察事实与出处。CI 运行中、测试未执行、未连接设备、部署未验证必须明确标明。不能把创建 PR、CI 通过与真机验收、部署混为一谈。
- 独占文件避免双方写同一路径。更新前先读取最新 blob SHA，产生 409/冲突时重新读取并合并，不强推任何分支。

## 防止代理互相触发死循环

- Codex **仅因用户的新需求或 ChatGPT_REVIEW 中尚未处理且仍适用的建议**实施代码；不要把 GitHub 文档更新当作自动继续开发的指令。
- ChatGPT **仅在 CODEX_HANDOFF 的 code_sha 改变或新问题需要处理**时写评审；不要因为自己刚更新了 CHATGPT_REVIEW 而触发另一轮评审。
- 不因纯文档同步、格式化、CI 重跑而重复推送相同建议。
- 无人值守模式的自动执行只限受控开发分支；自动化建议文件不等于用户授权部署、生产写入、PR 合并或迁移数据。

## 运行边界

- ChatGPT 定时检查可按小时运行；**不等于推送发生瞬间必然响应**。GitHub Actions 可即时运行 CI，但不能直接唤醒普通聊天中的 Codex。
- Codex 只有在运行的会话、持续服务或额外配置的受控自动化执行器中才能主动轮询 GitHub；仅写协议文件不会使 Codex 常驻。
- 真正的 push 触发自动开发需要额外配置 runner、凭证、预算、权限和触发规则，不在本次文档设置中默认开启。
- 不把 API Key、Access Token、私人宿舍数据、正式数据库、SSH 凭证、设备日志提交到仓库。
