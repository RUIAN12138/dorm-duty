# 面试讲解与代码证据

## 1. 为什么预览需要数据服务层？

预览不只是展示截图，还能切换页面和操作任务。只隐藏按钮容易漏掉触发路径；因此复用真实页面组件，并注入本地数据服务，让预览读写模拟状态。重点讲依赖注入、接口边界和副作用隔离，不要宣称已证明所有未来新增接口都被隔离。

证据：`frontend/src/components/onboarding/LiveDraftPreview.vue`、`frontend/src/interaction/localBoardService.ts`、`frontend/src/components/onboarding/sandbox/`。

## 2. 创建请求超时后如何安全重试？

请求可能已经在服务端成功而客户端未收到响应。新版创建携带请求标识和预期邮箱；服务端检查账号和请求内容，重复请求复用已有结果，参数冲突返回错误。关联测试还覆盖不同账号、并发重试以及撤销会话。边界：本地 SQLite 测试不能证明其他数据库或分布式部署具备同等并发保证。

证据：`frontend/src/views/GuestHome.vue`、`site/worker/backend.mjs`、`site/scripts/check-room-creation-idempotency.mjs`。

## 3. 球球为什么有时分不清人？怎么改进？

对话历史或模型生成不能作为身份和任务的权威来源。先根据认证上下文确定当前成员，再读取当前任务和轮次；已知事实型问题使用业务数据直接回答；缺失的数据要明确提示，避免把未知当作空。模型路径仍可能出错，需要持续补充测试。

证据：`scripts/companion-ai.mjs`、`site/scripts/check-companion-facts.mjs`。现有测试使用模拟模型，不可表述成真实模型准确率。

## 4. 如何验证多成员权限？

服务端在操作时验证身份和任务权限，测试应覆盖本人、其他成员、不同宿舍及无权操作，并检查数据未被改变。前端隐藏入口仅改善体验，不是安全边界。面试时只讲自己实际看过、运行过的测试和代码路径。

证据：`site/worker/chores.mjs`、`site/scripts/check-auth-boundaries.mjs`、`site/scripts/check-cloud-backend.mjs`。

## 5. 如何兼顾移动交互与可靠性？

以创建向导为例，浏览器回归检查步骤导航、拖拽、草稿和预览状态；模拟浏览器覆盖并不等同于真实键盘与设备验收。遇到设备差异要保留复现环境、录屏、版本及已知限制。

证据：`scripts/check-dorm-wizard-browser.mjs` 和 [验证清单](verification.md)。
