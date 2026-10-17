# Web 端架构优化实施方案

更新时间：2026-10-17

## 1. 目标与边界

目标：不改变现有业务规则和生产部署方式，将 Web 前后端整理为职责清晰、契约稳定、可逐步迁移的模块化单体。

本轮范围：`frontend/`、`site/`、`scripts/local-server.mjs`、`deploy/`、Web 测试与文档。

本轮不做：

- 不修改 `native/android/` 和 `native/harmony/`
- 不重写后端，不拆微服务
- 不更换 SQLite、Node.js 或部署平台
- 不改变值日、抬水、邮箱准入和提醒规则

目标链路：

```text
Vue Web -> HTTP API -> Node 模块化单体 -> 领域服务 -> SQLite Repository -> 通知 Outbox
```

## 2. 实施原则

1. 先兼容、后切换、再删除，不一次性重构。
2. 业务规则只保留一份，新旧路由共用同一领域服务。
3. 数据库迁移只新增，不修改已上线迁移。
4. 每一步独立提交、验证和回退。
5. 行为等价优先，目录整洁不能以业务回归为代价。

## 3. 第一步：固定正式运行链路，隔离历史代码

### 目标

消除“多套后端都能运行”的误解，明确唯一生产入口。

### 具体实现

1. 固定正式链路：

   ```text
   frontend -> scripts/local-server.mjs -> site/worker -> SQLite
   ```

2. 将 `backend/` 标记为历史只读实现：
   - 保留源码和历史测试，不再新增功能。
   - README、部署文档和启动脚本统一声明禁止生产使用。
   - Docker Compose 继续要求显式启用 `legacy` profile。

3. 禁用旧发布入口：
   - Cloudflare Pages/Worker 发布命令只返回“已停用”提示。
   - 正式发布只允许 `deploy/prepare-release.py` 和 `deploy/install-release.py`。

4. 增加根级统一命令：
   - `web:dev`：启动当前 Node/SQLite 本地链路。
   - `web:build`：构建前端并生成服务端入口。
   - `web:verify`：执行核心业务、邮件和前端检查。
   - `web:release`：只生成发布包，不自动上线。

5. 启动时输出并校验运行模式、数据库路径、Web Base、Node 版本；不输出凭据。

### 产物

- 唯一运行与发布说明
- 根级统一命令
- 历史后端和旧部署入口的明确隔离

### 验收

- 新开发者只看根 README 即可启动正确服务。
- CI、本地和生产使用同一业务入口。
- 默认命令不会误启动 FastAPI 或发布旧 Cloudflare 版本。

## 4. 第二步：整理 API 契约和错误模型

### 目标

让前端只依赖稳定接口，不依赖后端内部实现和临时字段。

### 具体实现

1. 建立 `docs/API_CONTRACT.md`，记录每个接口的方法、路径、权限、请求字段、响应字段、错误码、幂等和并发规则。

2. 统一成功响应：

   ```json
   { "data": {}, "request_id": "..." }
   ```

3. 统一失败响应：

   ```json
   {
     "error": {
       "code": "stale_version",
       "message": "数据已变化，请刷新后重试",
       "details": null
     },
     "request_id": "..."
   }
   ```

4. 固定错误分类：
   - `validation_error`：参数错误，422
   - `unauthorized`：未登录或会话失效，401
   - `forbidden`：无权限，403
   - `not_found`：资源不存在，404
   - `conflict` / `stale_version`：状态冲突，409
   - `rate_limited`：请求过频，429
   - `dependency_unavailable`：SMTP/推送暂不可用，503
   - `server_error`：未预期错误，500

5. 服务入口生成 `request_id`，贯穿日志和响应；前端错误对象保留该值。
6. 前端只保留一个 HTTP Client，统一超时、JSON 解析、错误转换、网络状态和会话失效处理。
7. 迁移期间兼容旧 `{ detail: { code, message } }`；页面切换完成后再删除旧格式。

### 产物

- API 契约文档
- 后端统一 `ApiError` 和响应函数
- 前端统一 `ApiClient`、`ApiError` 类型
- 关键接口契约测试

### 验收

- 页面不通过中文错误文案判断业务分支。
- 相同错误在所有模块返回相同结构和状态码。
- 任一线上错误可通过 `request_id` 定位服务端日志。

## 5. 第三步：拆分 `site/worker` 业务领域

### 目标

将路由、业务规则、SQL 和通知触发解耦，同时保持单进程、单数据库部署。

### 目标结构

```text
site/server/
├── http/                 路由、鉴权入口、响应转换
├── auth/                 邮箱会话、成员会话、权限
├── dorm/                 宿舍、成员、创建者恢复
├── chores/               值日、轮次、抬水、完成与撤销
├── calendar/             历史、日历、订阅
├── reminders/            催促、定时提醒
├── notifications/        通知任务与渠道适配
├── repositories/         SQLite 查询与写入
└── shared/               时间、校验、错误、事务工具
```

### 具体实现

1. 先提取错误、响应、参数校验、鉴权上下文和事务工具。
2. 按低风险到高风险迁移：日历与只读历史 → 邮箱账号与设置 → 宿舍与成员 → 提醒 → 值日、轮次和抬水状态机。
3. 每个领域采用固定调用方向：

   ```text
   Route -> Service -> Repository -> SQLite
   ```

4. Route 只解析请求、调用 Service、转换响应。
5. Service 负责权限、业务规则、事务边界和领域结果。
6. Repository 只负责 SQL 和数据映射，不返回 HTTP Response。
7. 旧 `backend.mjs`、`chores.mjs` 暂时作为适配层，逐接口转发到新 Service；迁移完成后再删除旧实现。
8. 领域测试直接测试 Service，接口测试只验证契约和鉴权。

### 产物

- 模块化后端目录
- 可独立测试的领域 Service
- 集中的 SQLite Repository
- 逐接口兼容适配层

### 验收

- HTTP Route 中不出现大段 SQL 和业务状态机。
- Repository 不依赖 Request、Response 或前端字段。
- 新旧接口对同一输入产生等价结果。
- 核心值日和抬水回归全部通过。

## 6. 第四步：整理前端 API、Store 和页面职责

### 目标

让页面只负责展示和交互，业务状态与网络细节集中管理。

### 目标结构

```text
frontend/src/
├── api/                  HTTP Client、DTO、各领域接口
├── stores/               跨页面状态与业务动作
├── composables/          页面复用流程和生命周期
├── views/                路由页面
├── components/           展示与局部交互组件
└── domain/               前端领域模型和映射
```

### 具体实现

1. 将 `api()`、`choreRequest()`、游客请求和邮箱请求统一到一个底层 Client。
2. API 层只负责请求、DTO 类型和响应解析，不操作页面状态。
3. Store 负责跨页面状态、缓存、刷新、业务动作和并发保护。
4. Composable 负责轮询、前后台恢复、取消请求、表单流程和临时页面状态。
5. View 只组合 Store 与组件，不直接保存业务令牌，不拼接接口路径。
6. Component 通过 props/emits 工作；只有明确需要时才访问 Store。
7. 统一页面状态：`idle/loading/ready/empty/error/submitting`。
8. 分别建模邮箱会话、宿舍成员会话、创建者权限，不靠散落 token 推断身份。
9. 后端 DTO 与 UI Model 分离；日期、状态文案和排序由 mapper 转换。
10. 按页面逐个迁移，不一次性重写全部组件和动效。

### 建议 Store

- `sessionStore`：邮箱和成员身份
- `dormStore`：宿舍与成员
- `choreStore`：任务、完成、撤销、轮次、抬水
- `notificationStore`：站内提醒与设置
- `calendarStore`：月份数据与历史

### 产物

- 单一 HTTP Client
- 清晰的 API、Store、Composable、View 边界
- 统一加载、错误和重试状态
- DTO 到 UI Model 的显式映射

### 验收

- View 和 Component 不再直接调用 `fetch`。
- 同一业务数据只有一个权威 Store。
- 会话过期、断网恢复和重复提交由统一逻辑处理。
- 现有交互、动效和窄屏布局保持不变。

## 7. 第五步：统一通知队列和数据库事务边界

### 目标

业务写入与外部发送解耦，统一邮件、站内消息、Web Push 等通知渠道。

### 具体实现

1. 业务事务只做两件事：更新业务状态，并在同一事务写入通知事件或 Outbox 任务。
2. HTTP 请求不直接等待 SMTP、Web Push 或其他外部服务。
3. 建立统一任务模型：

   ```text
   notification_jobs
   - id
   - channel
   - event_type
   - recipient_id
   - payload
   - idempotency_key
   - status
   - attempts
   - next_attempt_at
   - lease_until
   - created_at
   - accepted_at
   ```

4. 统一状态：`pending`、`sending`、`accepted`、`cancelled`、`failed`。
5. 统一幂等、租约、重试退避、失效取消、速率限制和清理策略。
6. 渠道适配器只负责发送：`in_app`、`email`、`web_push`；其他渠道后续接入。
7. 投递前重新检查成员关系、任务状态、提醒开关、计划版本和有效期。
8. 先让邮件和现有 Push 共用任务接口，再评估是否合并物理数据表；不为形式统一强迁稳定数据。
9. 增加队列指标：待发送数、最老任务时间、失败数、最近成功时间。

### 事务边界

```text
BEGIN
  更新业务状态
  写入 notification_jobs
COMMIT

后台 Worker
  领取任务
  复核状态
  调用渠道适配器
  更新投递结果
```

### 产物

- 统一通知任务接口
- 渠道适配器
- 明确的业务事务和投递事务
- 队列检查与恢复脚本

### 验收

- 邮件或推送故障不阻塞值日完成等核心操作。
- 相同业务事件不会重复创建有效通知。
- 任务完成、成员退出或关闭提醒后，旧任务会被取消。
- 服务重启后未完成任务可继续处理。

## 8. 推荐改造顺序

```text
1. 固定运行链路
2. 统一契约和错误
3. 按领域拆后端
4. 按页面整理前端
5. 统一通知 Outbox
```

后端拆分和前端整理均采用纵向迁移：一次只迁移一个领域或页面，保留兼容层，验证通过后再继续。

## 9. 总体验收标准

- [ ] 生产入口、部署方式和历史代码边界唯一明确。
- [ ] API 错误结构、错误码和 `request_id` 统一。
- [ ] Route、Service、Repository 职责分离。
- [ ] 前端无重复 HTTP Client，页面不直接处理网络细节。
- [ ] 核心业务写入与外部通知发送解耦。
- [ ] 现有业务、邮箱准入、提醒和交互动效无回归。
- [ ] 每个阶段可独立发布和回退。

## 10. 完成后的目标状态

```text
frontend
  View / Component
        -> Store / Composable
        -> API Client

server
  Route
        -> Domain Service
        -> Repository
        -> SQLite
        -> Notification Outbox
```

该结构保持当前简单部署的优势，同时为后续其他客户端接入提供稳定、可测试的 Web API。
