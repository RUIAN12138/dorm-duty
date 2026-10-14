# 业务与 API 规格 V1.0

本文件保留用户原方案的产品范围。原方案未明确的部分以下列“首版默认规则”落地；后续可以调整，但实现与测试必须一致。本文是开发契约；2026-10-10 已完成本地实现，外部部署与真机验收状态见 VERIFICATION.md。

## 1. 产品范围与页面

| 页面 | 主要行为 | 必须包含的状态 |
| --- | --- | --- |
| 登录 / 注册 | 账号、密码、昵称；登录后恢复本人信息 | 校验错误、提交中、账号冲突、鉴权过期 |
| 宿舍管理 | 创建、邀请码加入、成员名单、管理员设置、退出 | 尚未加入、无效邀请码、成员变更冲突 |
| 首页 | 今日人员、卫生任务、截止时间、完成操作、近期排班 | 尚未排班、轮到自己、轮到别人、已完成、已逾期 |
| 排班 | 周 / 月视图、日期详情、管理员生成与调整 | 无排班、加载失败、人员调整冲突 |
| 历史 | 按日期、成员、状态查询；显示真实完成时间 | 空记录、待完成、已完成、逾期未完成、逾期完成 |
| 我的 | 昵称、通知入口、宿舍入口、退出登录 | 未授权、已授权、不支持、离线、鉴权过期 |

底部导航：首页、排班、记录、我的。宿舍管理从首页宿舍名和“我的”进入；消息列表从首页消息入口进入，可用独立路由或页面内列表。所有页面需要加载、空、错误与重试状态。

移动端以 375–430 px 为主，覆盖 320、375、390、430、768 px 宽度；桌面居中展示、内容最大宽度约 640 px。采用暖白 `#F7F7F2`、深绿 `#215D46`、橙色 `#B96716`，正文深色；状态同时有文字，不能只靠颜色。首页今日值日卡片显著大于近期列表，主按钮高度至少 44 px。字体优先系统中文字体，输入字号至少 16 px。处理 `viewport-fit=cover`、`env(safe-area-inset-bottom)`、动态视口及软键盘遮挡。不要用隐藏横向 overflow 掩盖布局错误。

Vant 负责表单、按钮、单元格、日历、弹层和反馈。列表可采用 150–200 ms 的淡入或状态过渡；遵循 `prefers-reduced-motion`。不引入装饰性 WebGL 背景、持续动效或 React 运行时。

## 2. 身份与宿舍权限

- 用户账号唯一，密码只存哈希，昵称可以修改。首次注册不自动创建宿舍。
- 首版每人同时只能属于一个有效宿舍；重复加入同一宿舍返回当前宿舍，不产生重复成员。加入其他宿舍返回 409，必须先退出。
- 创建者为管理员；任何用户可以创建自己的宿舍，但服务端强制一次创建与成员关联在同一事务完成。
- 用户身份由服务器鉴权获得，不接受客户端传入的 `user_id` 作为操作者。每次宿舍查询、写入、打卡和通知读取都校验当前有效成员关系。
- 管理员可改宿舍名、轮换顺序、排班配置、指定日期人员、移除成员、转移管理员和更新邀请码。普通成员只能读取所属宿舍、完成本人任务、修改本人信息和退出。
- 管理员不能直接退出或移除自己；先转移权限。最后一名管理员退出返回 409，首版不实现宿舍删除。
- 退出或移除将成员设为不活跃，保留成员、任务与完成记录。不得级联删除历史。
- 若成员承担今天的未完成任务，退出 / 移除返回 409：先完成，或由管理员显式调整今天人员后退出。今天任务不因未来自动重排而隐式换人。
- 昵称和宿舍示例仅用于独立开发种子数据，正式数据库初始为空，种子脚本必须明确目标与用途。

首版认证默认采用 JWT Bearer：令牌有效期 24 小时，浏览器使用 sessionStorage，刷新后调用 `/auth/me` 恢复身份；关闭页面后的长期登录暂不保证。Pinia 不作为业务数据源。401 清除令牌和内存状态并跳登录；退出登录清除本地身份。后续原生端沿用 Bearer 接口。若要实现长期自动登录，另行增加安全的刷新令牌与撤销机制，不临时扩大本轮范围。

## 3. 时间、排班与成员变更

业务时区固定 `Asia/Shanghai`，业务日期用 `YYYY-MM-DD`；瞬时时间存为 UTC，接口输出带时区的 ISO 8601。后端统一计算 `today`、`deadline_at`、`server_time`，不得依赖手机时钟判断权限、逾期或排班。SQLite 写入 / 读取时间必须显式按 UTC 处理，不能假设其自动保留时区。

管理员配置：轮换成员 ID 列表、锚点日期、截止时间（默认 22:00）、任务文字（默认“扫地、拖地、倒垃圾”）。有效成员必须完整出现且恰好一次，拒绝外宿舍用户、退出成员、重复 ID 和空列表。

生成范围默认连续 30 天，首版支持 1–90 天，所有生成日期必须处于今天到今天后第 89 天之间。日期相对锚点的天数对成员数取模，索引 0 对应锚点当天。同一宿舍同一日期只能有一条任务；重复生成只补缺失日期，返回新增和跳过数量，不重置已有任务。配置保存与显式“重排未来”区分开，界面说明生效日期。

首版默认：成员加入、退出、管理员改轮换配置后，从**明天开始重排**，结束日期取“今天后第 30 天”与“已有未来未完成任务的最晚日期”中较晚者。从新顺序第一人重新开始，默认新的锚点为明天；管理员显式传入起始日期时尊重该锚点。只更新或补齐范围内未完成任务，今天、过去与已完成任务保留。因此成员退出后，不会在更远的已有未来排班中继续被安排。成员事务、配置与重排原子提交，失败全部回滚；响应返回实际影响日期和数量。非轮换配置保存不自动重排，管理员可以显式选择更新未来未完成任务。

管理员可调整今天和未来的未完成任务；不能编辑过去日期或已完成任务。手工调整标记 `is_override=true`，重复生成保留它；显式重排会替换重排范围内未来未完成的手工安排，操作前说明影响。多人同时生成、改顺序、调整 / 打卡时，通过宿舍排班版本号 `expected_version` 检测过时编辑，并由事务内版本更新、数据库唯一约束与条件更新保证一致性；冲突返回 409，界面刷新后重试。

## 4. 打卡与历史状态

任务数据库基础状态为 `pending` / `completed`；`overdue` 是后端根据时间计算的展示状态，避免依赖定时进程改变权限。

- 只允许今天或过去的本人任务打卡；不能提前完成未来任务。
- 逾期后允许补打卡，保存 `completed_at`，后端返回 `is_late=true`；历史区分“逾期完成”和“逾期未完成”。
- 普通成员和管理员都不能替别人打卡。管理员换人也不能修改已完成记录。
- 以数据库条件更新实现 `pending → completed`，更新条件包含任务 ID、当前执行人和状态；重复 / 并发打卡最多成功一次，另一请求返回 409，不覆盖原完成时间。
- 完成前查询并再次验证成员关系和执行人。跨宿舍对象返回 404，不暴露他人记录；本宿舍权限不足返回 403。
- 前端点击后显示加载，成功后重新拉取首页 / 历史；失去网络不能显示成功，首次打卡不做离线队列。
- 历史记录使用任务创建 / 调整时的任务文字和执行人昵称快照。昵称修改、退出或未来重排不得改写过去内容。

## 5. 六张主要表及约束

| 表 | 必要字段 / 约束 |
| --- | --- |
| `users` | id、username 唯一、password_hash、nickname、current_dorm_id 可空、push_enabled、created_at |
| `dormitories` | id、name、invite_code 唯一、admin_user_id、rotation_order JSON、rotation_start_date、deadline_time、task_text、schedule_version |
| `dorm_members` | id、dorm_id、user_id、role、sort_order、is_active、joined_at、left_at；(dorm_id,user_id) 唯一 |
| `duty_tasks` | id、dorm_id、duty_date、assignee_id、assignee_name_snapshot、task_text、deadline_at、status、completed_at、is_override；(dorm_id,duty_date) 唯一 |
| `notifications` | id、user_id、dorm_id、task_id、reminder_kind、scheduled_at、created_at、read_at、title、body、dedupe_key 唯一、is_cancelled、delivery_state JSON |
| `push_subscriptions` | id、user_id、endpoint 唯一、p256dh、auth、created_at、updated_at、is_active |

JSON 字段用于少量配置及首版发送状态；发送规模增长后可拆成第七张投递表，不能为维持六表而省略设备发送状态。数据库启用 SQLite 外键；FK、唯一约束和迁移都要真实生效。角色与 admin_user_id 的修改在同一事务校验，不能出现两个管理员或无有效管理员。users.current_dorm_id 与有效成员关系同事务更新，加入采用条件写入防止并发进入两个宿舍。

## 6. API 契约

业务路径原样保留，以便后续客户端复用。生产同源代理下仍使用这些路径；FastAPI 保留 `/docs`、`/openapi.json`、`/health`。统一错误结构：`{"detail":{"code":"...","message":"..."}}`，校验失败也规范化；状态码区分 401 / 403 / 404 / 409 / 422。

| 方法与路径 | 请求 / 返回要点 | 权限 |
| --- | --- | --- |
| POST `/auth/register` | username、password、nickname → 用户；创建成功 201 | 公共 |
| POST `/auth/login` | username、password → access_token、token_type、expires_in | 公共 |
| GET `/auth/me` | 本人 id、昵称、current_dorm_id、push_enabled | 登录 |
| PATCH `/auth/me` | nickname、push_enabled 白名单字段 | 本人 |
| POST `/dorms` | name → 宿舍、邀请码、成员 | 登录且未加入 |
| POST `/dorms/join` | invite_code → 当前宿舍 | 登录 |
| GET `/dorms/current` | 宿舍、角色、成员、配置、版本；未加入返回 null | 登录 |
| PATCH `/dorms/current` | 名称 / 任务 / 顺序 / 锚点 / 截止时间、expected_version；显式指定是否重排 | 管理员 |
| POST `/dorms/current/leave` | 退出，返回结果与重排摘要 | 当前成员 |
| DELETE `/dorms/current/members/{user_id}` | 移除、expected_version | 管理员 |
| POST `/dorms/current/transfer-admin` | user_id、expected_version | 管理员 |
| POST `/dorms/current/invite-code/rotate` | 更新邀请码 | 管理员 |
| POST `/duties/generate` | start_date、days=30、expected_version；补缺模式 | 管理员 |
| POST `/duties/regenerate` | start_date、days、expected_version；只处理未来未完成 | 管理员 |
| GET `/duties` | start_date、end_date、status、assignee_id、page、page_size | 当前成员 |
| GET `/duties/today` | 今日任务或 null、server_time、today、近期排班 | 当前成员 |
| PATCH `/duties/{id}` | assignee_id、expected_version；调整今天 / 未来未完成 | 管理员 |
| PATCH `/duties/{id}/complete` | 无客户端完成时间，返回服务器任务记录 | 本人当前成员 |
| GET `/notifications` | 分页、unread_only；返回 items、total、unread_count | 本人 |
| PATCH `/notifications/{id}/read` | 幂等已读 | 本人 |
| GET `/push/public-key` | VAPID 公钥；未配置返回明确不可用状态 | 登录 |
| POST `/push/subscribe` | endpoint、keys.p256dh、keys.auth；验证 HTTPS 订阅和设备归属 | 本人 |
| POST `/push/unsubscribe` | endpoint；仅取消本人设备，幂等 | 本人 |
| POST `/push/test` | 发送给本人设备；频率限制 | 本人 |

列表上限 page_size=100；排班日期范围最长 90 天。列表返回 `items,total,page,page_size`。管理员编辑返回 `schedule_version` 和影响日期 / 数量。历史查询复用 `/duties`；快照、UTC 时间、display_status、is_late 由服务器返回。前端不得伪造任务或永久用 mock 替代 API。

## 7. 站内提醒与推送

时间按宿舍业务时区：前一天 21:00、当天 08:00、当天 19:00。每次扫描先确认任务未完成、执行人仍是有效成员、任务版本 / 接收人仍有效；完成或换人后取消尚未投递的旧通知，不删除已读历史消息。

单独提醒进程每分钟扫描数据库，服务启动时扫描；扫描窗口为最近 60 分钟，数据库唯一 `dedupe_key=(task_id,user_id,reminder_kind)` 保证同一站内提醒不重复。超过窗口的定时提醒不补发，首页依然展示任务与逾期状态。提醒窗口和限制要写入部署说明，并有可注入时钟的测试。

站内消息与 Push 是同一提醒事件的两个投递渠道。站内落库后，独立 worker 使用持久投递状态重试 Push：每设备保留 pending / accepted / failed、attempts、next_retry_at，首次发送失败后最多 3 次重试，提醒窗口一小时后停止过时投递；重试前重新检查任务状态与成员关系。Push 提供商接受只记为 accepted，不能记为“手机已收到”。网络超时可能产生重复设备推送，使用稳定 notification tag 合并显示，并明确首版不承诺端到端 exactly-once。

APScheduler 选择并锁定兼容 3.x 依赖，Web API 不内嵌调度；部署只运行一个提醒 worker。滚动补齐未来 30 天缺失排班也由该进程执行，复用后端生成服务，不能重置已有记录。

PWA 用 `injectManifest`，Manifest 包含 id、name、short_name、start_url、scope、display=standalone、theme_color、background_color、192/512 图标与独立 maskable 图标，提供 apple-touch-icon。缓存仅覆盖应用静态资源；认证、宿舍、任务、消息 API 使用网络，不缓存私人响应。离线显示提示，不声称打卡成功。

Service Worker 处理 `push` 和 `notificationclick`，只打开 / 聚焦同源任务页面；登录过期先登录再恢复安全路由。用户主动点击“开启通知”才请求权限，能力检测覆盖 Notification、serviceWorker、PushManager 和主屏幕模式；拒绝授权后给出设置说明，不重复弹窗。iPhone 在 HTTPS 主屏幕模式下验证。参见 [WebKit 官方说明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)。

设备订阅注销：退出登录时先在服务器取消本设备归属，再执行浏览器 unsubscribe，清除本地登录态；离线无法撤销时明确显示提示。共享设备切换账号，订阅不能在未验证归属时直接转给新用户；取消旧订阅并建立新订阅。离开宿舍即停止该宿舍未来提醒。410 / 404 推送 endpoint 失效则停用，不泄露 endpoint 或密钥到日志。VAPID 私钥仅由服务环境配置，不能放前端、仓库或任务书。

## 8. 部署与验收边界

本地开发 Vite 将上述 API 路径代理到 FastAPI；不要将 API 地址写死为 localhost 给手机使用。生产采用同源 HTTPS 反向代理，SPA 深链接回退到 index.html，API / docs / health 优先转发后端。iPhone 访问电脑局域网 HTTP 只用于业务调试，不能据此验收 PWA Push。

SQLite 数据文件持久化，API 与唯一 worker 使用同一数据库；限制写事务长度并处理冲突。PostgreSQL 使用环境配置和 Alembic 迁移，不把“可配置 URL”等同于迁移已验证。数据库备份、迁移和恢复步骤独立记录。

必须分别记录：类型检查 / 构建、数据库与接口测试、浏览器渲染、两个独立客户端同步、iPhone Safari、主屏幕安装、锁屏真实 Push、服务重启恢复。没有证据的项目标“待验证”。
