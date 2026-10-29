# Verification
隔离 SQLite 与模拟上游模型：`node site/scripts/check-companion-ai.mjs` 通过 88 项，包含长文本、组合 emoji、超过 6 条、历史重载、重复请求、提醒、身份和限流；`node site/scripts/check-companion-facts.mjs` 通过 33 项；`node scripts/check-chat-prompt-bubbles.mjs` 通过 21 项，验证自然分段、字符簇及旧数据兼容。`npm run spec:check` 通过。真实模型、iPhone、Android、HarmonyOS 真机未验证；未访问正式数据。
