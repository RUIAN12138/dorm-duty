# OpenSpec 工作约束

本地锁定 CLI 1.14.3：`npm ci` 后使用 `npm run spec -- <命令>`，包装器仅为该进程关闭遥测，不改全局配置。
生成技能中的 `openspec ...` 命令在本项目改用 `npm run spec -- ...`，参数不变。
Codex 可选项目技能 openspec-propose / openspec-apply-change；Claude 使用 /opsx:propose /opsx:apply。新技能在客户端重新加载项目后可见。

1. 先读取 AGENTS.md、动效契约、现有相关规范和最新用户原话，识别覆盖关系。
2. 新建 change，先完成 proposal / design / delta specs / tasks；纯工具文档使用 skip_specs，不虚构产品要求。
3. scope.json 写主分支基线与精确路径；只有规范和生成集成使用窄目录前缀。多个在途变更使用同一基线；归档/开始新批次后一起更新基线，不把陈旧授权复用。
4. `npm run spec:check` 检查规范与全部已提交/暂存/工作区/未跟踪差异范围。正常检查不是验收。
5. 在 verification.md 写真实结果、证据路径、失败和未测试项；隔离预览供用户验证，不能复制生产数据。
6. `npm run spec:scope` 输出内容摘要。用户明确验收对应版本后，才可人工填 acceptance.status=accepted、userStatement=用户原话、acceptedDigest=该摘要。代码再改则摘要失效。
7. `npm run spec:gate -- --gate pr` 或 `--gate publish` 在缺验收时失败；通过也不执行任何外部操作，仍须对应的人类授权。待验收不得 archive 或同步为已发布产品行为。

OpenSpec 校验结构，范围脚本检查文件边界。它们不能证明视觉流畅、消息送达、无业务漏洞，也不能鉴别验收记录填写者或阻止绕过工具的命令。不得向用户承诺绝对防错。
本轮已有预览按事实回填，不伪装成事前 OpenSpec 流程。上一轮模拟器验证不等于本次毛玻璃/涟漪的模拟器验收。

基线规范：openspec/specs/change-governance/spec.md。运行时交互事实以动效契约和已验收记录为准；尚在 changes 下的产品要求没有自动成为 main 或正式产品事实。

用户明确要求“部署供查看”时，可在保持acceptance.pending的同时，记录publishAuthorization（action=deploy-for-review、userStatement原话、authorizedDigest当前摘要）。此记录只解锁相同内容的publish门禁，不能解锁PR或未来版本，发布仍需备份与冒烟。此例外来自本轮用户明确指令，不能由代理自行推断。

用户明确要求“提交PR”时，同理记录独立prAuthorization（action=create-for-review、userStatement原话、authorizedDigest当前摘要）。只解锁相同内容的pr门禁及创建PR所需的开发分支推送，不授权发布或main合并，不追认产品/实机验收。两类授权各自限定动作，任意实现或规范变化均使旧摘要失效；“继续”、测试通过、SSH连接成功不能生成这些授权。
