# 后端架构现状与 Android 接入整改方案

**历史调查快照：2026-10-15，不作为当前运行与身份契约。**

2026-10-17 整合说明：以下正文保留原作者调查与建议，未标注完成的条目也不等于当前仍缺失。后续协作请先以 [Web 架构优化方案](WEB_ARCHITECTURE_REFACTOR.md)、[邮箱准入审计](AUTH_RELEASE_AUDIT.md) 及实际回归为准。

- 正式链路为 Node + SQLite + 邮箱网关；旧 Worker 的网络变量不能提供网关能力，旧 Cloudflare 入口已按审计记录停用。
- 邮箱验证码注册/登录、邮箱成员绑定、解绑、会话撤销及限流已实现。
- 独立创建者设备会话已撤销；邮箱会话固定 30 天，派生授权不超过邮箱登录有效期，`/auth/me` 不续期。
- 成员需先验证邮箱，再凭邀请码与完整姓名绑定尚未被其他邮箱认领的身份；不是仅凭邀请码任意切换成员。
- 数据库迁移已超过文中 `0009`；以 `site/drizzle/` 和迁移校验为准，不据本文重建或覆盖数据库。
- `/api/v1`、OpenAPI、领域拆分和通知任务接口统一属于后续计划，应先记录现有契约再逐步迁移，不阻塞现有 WebView 客户端维护。

下文是上述更正前的历史内容。

## 1. 结论

当前线上主后端不是 `backend/` 下的 FastAPI，而是 `site/worker/` 下的 JavaScript Worker 业务代码，通过 Node.js 22 和 SQLite 运行。FastAPI 只属于历史实现，现有文档对此描述不一致。

后端已经具备可继续演进的基础：SQLite 事务、版本号 CAS、推送 outbox、迁移校验、在线备份和 systemd 隔离都已落地。因此不建议重写后端，也不建议拆微服务。目标应是把当前实现整理为“模块化单体 + 契约优先 API”，保留现有业务语义和部署方式。

在完整 Android 原生开发前，至少应完成以下前置工作：

1. 固化 Android 所需接口的 OpenAPI 3.1 契约。
2. 提供带版本的 `/api/v1` 路径，并保留旧路径兼容窗口。
3. 统一错误码、幂等、并发冲突和请求追踪语义。
4. 将成员会话改造成可识别设备、可吊销、可轮换的移动端会话。
5. 为任务历史、提醒和同步提供分页或增量接口，避免长期依赖完整看板快照。
6. 拆分 `backend.mjs` 和 `chores.mjs`，让 HTTP、业务规则和 SQL 可以独立测试。

Android 第一阶段应复用现有业务规则，只替换客户端形态。不要同时重写客户端、身份体系、排班规则和数据库模型。

## 2. 调查范围

本次主要检查：

- `site/worker/backend.mjs`
- `site/worker/chores.mjs`
- `site/worker/calendar.mjs`
- `site/db/schema.ts`
- `site/local/`
- `site/scripts/check-*.mjs`
- `scripts/local-server.mjs`
- `scripts/push-runtime.mjs`
- `deploy/`
- `frontend/src/api/`
- `native/android/`
- `.github/workflows/checks.yml`
- 现有产品、部署和验收文档

## 3. 仓库现状

| 目录              | 当前职责                                          | 判断                       |
| ----------------- | ------------------------------------------------- | -------------------------- |
| `frontend/`       | Vue 3、TypeScript、Vite、Vant Web/PWA             | 当前主要业务客户端         |
| `site/`           | 正式后端、数据库结构、迁移、Worker 构建和业务检查 | 当前后端事实来源           |
| `backend/`        | 旧 FastAPI 账号版和对应测试                       | 历史代码，不代表线上行为   |
| `native/android/` | Java Activity + WebView + JPush 桥接              | Web 壳，不是独立原生客户端 |
| `native/harmony/` | HarmonyOS Web 壳                                  | 非本次重点                 |
| `scripts/`        | Node 本地服务器、推送运行时和交互检查             | 生产运行链路组成部分       |
| `deploy/`         | systemd、Nginx、备份和发布脚本                    | 当前服务器部署资产         |
| `docs/`           | 规格、进度、部署和验收记录                        | 部分内容已与生产事实偏离   |

### 3.1 当前生产链路

```text
Android WebView / Web / PWA
          |
       HTTPS
          |
        Nginx
          |
Node 22 scripts/local-server.mjs
          |
生成的 site/worker/index.js
          |
backend.mjs + chores.mjs + calendar.mjs
          |
   SQLite + 推送运行时
```

同一套 Worker 业务实现还可以部署到 Cloudflare Worker + D1，但当前服务器生产事实是 Node.js + SQLite + systemd，不是 FastAPI，也不是 D1。

### 3.2 运行与部署

- 生产文档记录的运行时为 Node `22.23.2`，CI 固定 Node `22.23.0`。
- 本地 SQLite 使用 WAL、外键约束和 `busy_timeout=5000`。
- 迁移逐文件计算 SHA-256，已应用迁移被修改时会拒绝继续启动。
- systemd 使用 `DynamicUser`、`NoNewPrivileges`、`ProtectSystem=strict` 等隔离项。
- 数据库备份包含 SQLite 在线备份、完整性检查和外键检查。
- 推送采用事务 outbox、租约、重试和失效订阅处理。

这些机制应继续保留，不应在 Android 改造期间替换数据库或部署平台。

## 4. 后端代码结构

### 4.1 当前结构

核心业务集中在三个文件：

| 文件                       |       规模 | 同时承担的职责                                        |
| -------------------------- | ---------: | ----------------------------------------------------- |
| `site/worker/backend.mjs`  | 约 1864 行 | 路由、账号认证、宿舍管理、旧排班、SQL、响应序列化     |
| `site/worker/chores.mjs`   | 约 1849 行 | 成员认证、任务状态机、轮次、提醒、推送、SQL、错误处理 |
| `site/worker/calendar.mjs` |  约 285 行 | 日历令牌、ICS 生成和响应                              |

路由主要通过 `if`、路径字符串和正则手写分派。身份提取、输入校验、业务判断、SQL 和 HTTP 响应高度耦合，导致以下问题：

- 修改接口时容易同时影响路由、事务和业务状态机。
- 业务规则只能通过完整请求链路测试，单元测试成本高。
- SQLite 与 D1 的兼容细节渗透到业务逻辑。
- 无法从代码稳定生成 Android DTO 和客户端。
- 文件继续增长后，评审和回归定位成本会明显上升。

### 4.2 当前测试

- `site/scripts/check-*.mjs` 约 21 个，总代码约 6670 行。
- 测试覆盖并发完成、轮次、提醒、推送、日历、撤销和迁移兼容等关键行为。
- 测试属于自制行为检查脚本，没有统一测试框架、测试分层和根目录 `npm test` 入口。
- `backend/tests/` 验证的是旧 FastAPI，不应作为当前生产后端的质量依据。
- CI 串行执行构建和大量脚本，但本地缺少与 CI 一致的运行时和依赖预检入口。

测试资产本身有价值，整改时应先保留为黑盒回归测试，再逐步增加领域单元测试、仓储集成测试和 OpenAPI 契约测试。

## 5. 数据架构

### 5.1 当前模型

`site/db/schema.ts` 约有 19 张表，迁移目前到 `0009_washbasin_categories.sql`。数据库同时保留两套业务体系：

- 旧账号/排班体系：账号 session、`duty_tasks`、`notifications`、`push_subscriptions` 等。
- 新成员/卫生任务体系：`member_sessions`、`chore_tasks`、`chore_reminders`、`chore_push_*` 等。

这不是单纯的表名问题，而是双身份、双任务、双通知和双推送生命周期同时存在。继续无边界扩展会让权限判断、数据迁移和 Android 接口长期复杂化。

### 5.2 已有并发保障

当前并发处理是后端较成熟的部分：

- 宿舍设置和 chores 使用版本号 CAS。
- `mutation_key` 防止 D1 batch 在竞争失败后继续执行后续语句。
- 任务完成和撤销使用条件更新及有限重试。
- 提醒记录与推送 outbox 在同一事务提交。
- 提醒和测试推送存在 60 秒业务冷却。

Android API 必须保留这些语义，并把冲突明确映射为稳定错误码，例如 `stale_version`、`already_completed`、`cooldown_active`，不能只返回中文字符串。

## 6. 身份与安全边界

### 6.1 当前两类会话

| 会话              | 用途                            |        有效期 | 主要风险                                 |
| ----------------- | ------------------------------- | ------------: | ---------------------------------------- |
| `sessions`        | 账号登录、创建设备和管理员能力  | 7 天或 365 天 | 创建设备会话可长期持有管理员权限         |
| `member_sessions` | 通过邀请码选择成员后访问 chores |        365 天 | 无刷新、设备管理、最近使用和主动吊销能力 |

令牌本身为 256 位随机值，数据库只保存 SHA-256 摘要，这一点应保留。

### 6.2 必须明确的产品安全边界

当前规则是“知道宿舍邀请码即可选择该宿舍任意成员”。这是一种低摩擦的宿舍内信任模型，不是强身份认证。

Android 产品和接口文档必须明确：

- 邀请码泄露后，第三方可能冒用成员身份。
- 管理员能力与普通成员能力必须严格分离。
- 若未来涉及敏感数据、付费或高风险操作，必须增加二次认证或成员绑定流程。

### 6.3 当前缺口

- 创建宿舍、邀请码查询、身份领取和账号登录没有基础设施级 IP/设备限流。
- 365 天 token 不支持设备列表、远程退出、轮换和异常使用审计。
- Nginx 配置缺少统一请求 ID、API 限流和结构化访问日志策略。
- 错误响应没有可用于联查的 `request_id`。
- Android 正式版若继续持有长期 bearer token，需要使用 Android Keystore 保护本地凭据。

## 7. API 现状

### 7.1 当前主要接口

新 chores 体系主要包括：

- `POST /chores/claim`
- `GET /chores/board`
- `PATCH /chores/settings`
- `PATCH /chores/marker`
- `PATCH /chores/tasks/{id}/complete`
- `PATCH /chores/tasks/{id}/undo`
- `POST /chores/remind`
- `PATCH /chores/reminders/{id}/read`
- `/chores/push/*`
- `/chores/native/*`
- `/chores/reminder-plan`
- `/chores/calendar-subscription`
- `GET|HEAD /chores/calendar/{token}.ics`

旧账号体系仍公开 `/auth/*`、`/dorms/*`、`/duties/*`、`/notifications` 和 `/push/*`。

### 7.2 契约问题

当前没有真实可用的 OpenAPI。`docs/SPEC.md` 仍描述 FastAPI 的 `/docs` 和 `/openapi.json`，但当前 Node 后端没有这些能力。

请求和响应类型主要存在于前端 TypeScript 中，属于手工维护的事实契约：

- 服务端、Web 和未来 Android DTO 容易漂移。
- 前端 `ApiError` 主要保留状态码和 message，服务端 `detail.code` 没有被完整利用。
- 无 API 版本、废弃和兼容策略。
- 无契约 diff 或 schema 漂移检查。
- 无法稳定生成 Kotlin DTO、Retrofit 接口和 Mock Server。

### 7.3 移动端不友好的行为

- `/chores/board` 返回大聚合快照，适合当前小规模 Web，但不适合长期离线缓存、后台同步和 Widget。
- 写接口依赖 CAS，但没有统一 `Idempotency-Key`。移动网络超时后重试可能产生不确定结果。
- 历史和提醒缺少统一游标分页。
- 没有 `ETag`、`If-None-Match` 或明确的同步游标。
- 错误没有 `request_id`、`retryable` 和建议重试时间。
- 当前 URL 无 `/api/v1` 前缀，未来演进只能继续兼容所有旧行为。

## 8. Android 现状

当前 `native/android/` 不是原生业务客户端：

- Java `Activity` 承载 Android WebView。
- 固定加载 `https://8.148.190.114/dorm-duty/`。
- 身份和业务状态仍保存在网页 `localStorage` / `sessionStorage`。
- 原生层主要负责 WebView、返回键、JPush 初始化和 `/chores/native/*` 设备绑定。
- 没有 Retrofit/OkHttp、Repository、Room、DataStore 和 Compose 业务界面。
- 没有离线缓存、增量同步和原生凭据管理。

正式原生客户端不应继续硬编码裸 IP。应提供稳定域名，并通过构建配置区分开发、测试和生产环境。

## 9. 问题优先级

### P0：开始 Android 业务开发前必须解决

1. 生产后端事实与文档不一致，FastAPI 容易误导开发。
2. 无 OpenAPI 和 `/api/v1`，Android 只能人工抄写 Web 类型。
3. 移动端会话不可吊销、不可轮换，长期 token 风险不可控。
4. 写接口缺少统一幂等语义，移动网络重试不安全。
5. 错误码虽已存在一部分，但客户端没有稳定消费契约。
6. Node 最低版本未在 package `engines`、版本文件和启动预检中统一声明。

### P1：Android MVP 联调前解决

1. 拆分 HTTP、认证、应用用例、领域规则和 SQL。
2. 增加增量同步、分页和缓存验证机制。
3. 建立请求 ID、结构化日志、存活/就绪检查和基础指标。
4. 增加 IP/设备限流及安全审计记录。
5. 将自制检查脚本纳入统一测试入口，并增加契约测试。

### P2：MVP 稳定后收敛

1. 迁移或下线旧账号/排班 API。
2. 收敛双通知和双推送模型。
3. 清理旧 FastAPI 代码或移入明确的归档目录。
4. 根据真实数据量决定是否进一步拆分读模型，不提前拆微服务。

## 10. 目标架构

目标保持单进程、单数据库和单部署单元：

```text
Nginx
  |
Node API 进程
  |
HTTP Adapter / Router
  |
Application Use Cases
  |
Domain Services
  |
Repository Ports
  |
SQLite Repository ---- Push Outbox Worker
```

推荐目录边界：

```text
site/server/
  http/             路由、中间件、错误映射、OpenAPI 适配
  auth/             会话签发、校验、轮换、吊销
  chores/
    application/    完成、撤销、提醒、设置等用例
    domain/         轮次、排班、权限和状态转换规则
    repository/     仓储接口与 SQLite/D1 实现
    http/           chores DTO 和路由
  notifications/   站内提醒和 outbox 调度
  calendar/         订阅令牌和 ICS 输出
  platform/         数据库、日志、时钟、ID、配置
```

边界规则：

- HTTP 层只负责解析、鉴权入口、调用用例和响应映射。
- 应用层定义事务边界，不直接拼接 HTTP 响应。
- 领域层不依赖 Request、Response、SQLite 或 D1。
- Repository 负责 SQL、行映射和数据库兼容差异。
- 时间、随机 ID 和推送发送都通过可替换接口注入，便于测试。
- 先按业务切片逐步迁移，不一次性搬空旧文件。

## 11. Android 所需 API 契约

### 11.1 版本与兼容

- 新接口统一使用 `/api/v1`。
- 旧路径暂时转发到同一应用用例，不复制业务逻辑。
- 破坏性修改只能进入新版本；兼容字段只增不删。
- 响应增加 `Deprecation`、`Sunset` 或内部等价告警机制。
- 旧路径至少覆盖一个 Android 稳定版本的迁移窗口后再下线。

### 11.2 统一错误结构

建议统一为：

```json
{
  "error": {
    "code": "stale_version",
    "message": "任务已变化，请刷新后重试",
    "request_id": "req_...",
    "retryable": false,
    "details": {}
  }
}
```

Android 只依据 `code` 决定交互，`message` 用于展示或兜底，`request_id` 用于线上联查。

### 11.3 会话接口

建议至少提供：

- 领取成员身份并登记设备。
- 短期 access token + 可轮换 refresh token。
- 查询当前会话与权限。
- 查询和吊销设备会话。
- 当前设备退出。
- 管理员恢复流程与普通成员会话完全分离。

服务端存储 refresh token 摘要、设备 ID、设备名称、创建时间、最近使用时间、过期时间和吊销时间。设备 ID 只是会话管理标识，不能替代认证因子。

### 11.4 读模型与同步

Android MVP 可以保留 `/board` 首屏聚合接口，但需增加：

- 顶层 `version` 或 `sync_cursor`。
- `ETag` 和条件请求。
- 服务端时间 `server_time`。
- 明确的最大历史范围。
- 提醒和完成记录使用游标分页。
- 后续提供 `GET /api/v1/sync?cursor=...` 返回变更集合和新游标。

Room 保存规范化数据，Repository 负责合并同步结果。不要让 Compose 页面直接依赖网络 DTO。

### 11.5 写入、并发与幂等

- 所有创建型命令支持 `Idempotency-Key`。
- 完成、撤销和设置更新继续使用服务端版本号 CAS。
- 服务端保存幂等键、请求摘要、结果状态和过期时间。
- 同一幂等键携带不同请求体时返回明确冲突。
- 冲突返回最新资源版本，减少 Android 再次请求成本。
- 对可重试的 429、503 返回 `Retry-After`。

### 11.6 推送

- 原生推送绑定进入 `/api/v1/devices/{id}/push-token`，不再使用 WebView 专用命名。
- 推送 payload 只携带资源 ID、事件类型和最小展示信息。
- App 收到推送后通过同步接口获取权威状态。
- 更新 token、注销设备和无效 token 清理必须幂等。
- 推送失败不能回滚业务事务，继续使用 outbox。

## 12. 分阶段整改

### 阶段 0：冻结基线

交付物：

- 明确 Node 最低版本，增加 `.nvmrc` 或等价版本文件、`engines` 和启动预检。
- 提供根目录统一命令：安装、构建、测试、启动和数据库检查。
- 将当前行为脚本纳入统一测试入口。
- 标记 FastAPI 为历史实现，修正文档中的 `/docs` 和 `/openapi.json` 描述。
- 保存当前 API 响应样例和关键数据库基线。

验收：新环境按一份文档即可复现 CI；运行时版本不符合时在启动前明确失败。

### 阶段 1：契约优先

交付物：

- `openapi.yaml`，先覆盖 Android MVP 所需接口。
- `/api/v1` 路由和旧路径兼容适配层。
- 统一错误、鉴权、请求 ID 和参数校验。
- CI 增加 OpenAPI lint、破坏性变更检查和 Kotlin 客户端生成检查。

验收：Android 项目不手写接口路径和响应 DTO；Web 与 Android 契约来自同一份规范。

### 阶段 2：模块化单体

按风险从低到高迁移：

1. 日历和只读查询。
2. 提醒读取与标记已读。
3. 推送设备绑定和 outbox。
4. 设置和成员标记。
5. 任务完成、撤销、轮次和成员变更。

每迁移一个用例，旧路由和 `/api/v1` 同时调用新用例，并用现有黑盒测试证明行为不变。

验收：核心领域规则可脱离 HTTP 和真实数据库单测；SQL 只存在于 repository 层。

### 阶段 3：移动端能力

交付物：

- 设备会话、refresh token 轮换和远程吊销。
- `Idempotency-Key`。
- 游标分页、`ETag` 和增量同步。
- 原生推送设备 API。
- 稳定域名和开发/测试/生产环境配置。

验收：断网、超时、重复提交、token 过期和多设备登录都有确定行为。

### 阶段 4：可观测性与安全

交付物：

- JSON 结构化日志和全链路 `request_id`。
- `/health/live` 与 `/health/ready`。
- 请求耗时、错误率、SQLite busy、outbox 堆积和推送失败指标。
- Nginx/API 限流、敏感字段脱敏和安全响应头。
- 会话创建、吊销和管理员操作审计。

验收：一次 Android 报错能通过 `request_id` 定位到具体请求、错误码和数据库事务结果。

### 阶段 5：Android 原生 MVP

建议客户端分层：

```text
Compose UI
  -> ViewModel
  -> Use Case
  -> Repository
  -> Retrofit API + Room + DataStore/Keystore
```

首版范围建议只包含：

- 邀请码进入和成员选择。
- 今日任务与任务完成/撤销。
- 提醒列表和标记已读。
- 基础设置、推送开关和设备退出。
- 离线只读、网络恢复同步和冲突提示。

日历订阅、高级历史筛选和管理员复杂配置可后置，避免首版同时复制所有 Web 能力。

## 13. 兼容、发布与回退

### 13.1 兼容原则

- 新旧路由共用应用用例和事务，不维护两套业务实现。
- 数据库只做向前兼容的增量迁移，先加字段/表，再切流量，最后清理旧结构。
- Android 发布后，在确认活跃版本完成升级前不删除旧字段和旧接口。
- OpenAPI 的破坏性变更必须由 CI 阻断。

### 13.2 灰度顺序

1. 上线新表和兼容代码，但不启用新客户端。
2. Web 内部切到 `/api/v1`，验证业务等价。
3. Android 测试环境联调。
4. Android 小范围发布，观察错误率、冲突率和 outbox 堆积。
5. 扩大发布后再开始旧接口下线计时。

### 13.3 回退方法

- 应用版本通过现有独立版本目录和原子切换回退。
- 新迁移在兼容窗口内只新增，不删除，旧应用仍可读取。
- 切换前继续执行 SQLite 在线备份、完整性和外键检查。
- 新 API 出现问题时只关闭 `/api/v1` 新能力或切回旧路由适配，不回滚已提交的业务数据。

## 14. 验收标准

后端具备 Android 开发条件时，应满足：

- [ ] 生产后端说明明确为 Node.js + SQLite，FastAPI 已标记历史。
- [ ] Node 最低版本和依赖安装流程可自动校验。
- [ ] Android MVP 接口全部进入 OpenAPI 3.1。
- [ ] `/api/v1` 可用，旧接口有明确兼容和下线计划。
- [ ] Kotlin DTO 和 Retrofit 接口可由契约生成。
- [ ] 错误码、请求 ID、CAS 冲突和幂等规则稳定。
- [ ] access/refresh token 支持轮换、吊销和设备管理。
- [ ] 首屏快照支持缓存验证，历史和提醒支持游标分页。
- [ ] 至少具备可继续演进的增量同步游标。
- [ ] 业务脚本、契约测试和核心领域单测进入统一 CI。
- [ ] 关键请求具备结构化日志、健康检查和基础指标。
- [ ] 稳定域名、TLS 和多环境配置已准备完成。

## 15. 建议立即执行的任务

按依赖顺序建立后续任务：

1. 修正文档和运行时约束，建立统一 `verify` 命令。
2. 提取当前 Android MVP 所需接口和 DTO，编写第一版 OpenAPI。
3. 统一错误结构并让 Web 客户端保留 `detail.code`。
4. 增加 `/api/v1` 兼容路由和契约测试。
5. 设计设备会话、refresh token 和吊销表迁移。
6. 为写命令增加幂等记录和冲突响应。
7. 从日历、提醒读取开始拆分模块，再处理任务状态机。
8. 增加分页、`ETag` 和同步游标。
9. 完成结构化日志、限流、健康检查和监控。
10. 后端验收通过后创建 Compose 原生项目骨架。

## 16. 本次验证记录

验证环境：Windows，本机 Node `v22.15.0`；通过 `npx` 补充使用 CI 固定的 Node `v22.23.0`。

- `npm ci`：`frontend/` 和 `site/` 均成功。
- `npm run build --prefix frontend`：成功，TypeScript 检查和 Vite 生产构建通过。
- 本机 Node `v22.15.0` 运行数据库检查失败，首个共同根因为该版本的 `node:sqlite` Statement 不支持项目使用的 `columns()`。
- Node `v22.23.0` 下 `check-cloud-backend.mjs` 通过 1094 条断言。
- Node `v22.23.0` 下 `check-chores.mjs` 通过 790 条断言。
- Node `v22.23.0` 下 `check-rounds.mjs` 通过 186 条断言。
- Node `v22.23.0` 下 `check-calendar-subscription.mjs` 通过 1070 条断言。
- Node `v22.23.0` 下 `check-worker.mjs` 通过 693 条断言。
- Node `v22.23.0` 下 `check-member-push.mjs` 10 组中 9 组通过；唯一失败是 Windows 文件权限模型将请求的 `0600` 报告为 `0666`，测试包含 POSIX 平台假设，并在比较重启前后文件内容之前中止。推送加密、幂等、租约和重试检查已通过。

核心行为在与 CI 一致的 Node 版本下未发现业务回归。验证同时证明仓库依赖较新的 Node 22 小版本，但未在 `package.json` 或本地统一入口中显式阻止旧版本运行；部分检查也未处理 Windows 与 POSIX 文件权限差异。整改阶段 0 应消除这两类环境差异。
