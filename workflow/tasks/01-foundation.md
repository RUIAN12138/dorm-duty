# 第一轮：基础框架与真实登录

## 1. 背景

用户需要 iPhone Safari 可访问的宿舍值日网页，技术栈固定 Vue 3 + FastAPI。本轮先交付能启动、能真实注册登录的基础，再开展核心业务。必须先读上级 AGENTS、项目 README、SPEC、ROADMAP 与 ACCEPTANCE。

## 2. 当前仓库状态判断

任务书生成时项目只有文档，无应用代码；上级 Git 工作区存在其他项目未提交改动。执行前重新检查 `git status` 和本目录文件，保护新增变动。推荐的全局流水线模板缺失，本文件按八段规范直接编写。

## 3. 本轮目标

创建前后端工程、六张表的初始迁移、真实注册登录和六页路由。登录后未入宿舍显示明确引导；业务页面可用真实空状态，不造假排班。完成进度 01–03 的本地可验证部分。

## 4. 修改范围

仅 `dorm-duty/frontend/`、`backend/`、项目内启动辅助文件及相关文档。目录参照用户方案，前端 api/components/views/stores/router，后端 models/schemas/routers/services/core、alembic、tests。

## 5. 禁止事项

不改其他项目、根 .gitignore、已有 .env、凭据或账号文件；不使用 React / uni-app、不制作移动安装包、不自动部署、不嵌套初始化 Git、不提交工作区其他改动。不用 mock 登录替代数据库，不把示例同学写入正式初始数据，不提前宣称手机验收通过。

## 6. 具体任务

1. 检查可用 Node、Python 与包管理器，确定并记录兼容版本。创建 Vue 3 + TS + Vite、Vant 4、Pinia、Vue Router 项目，提交依赖锁文件；配置 typecheck/build，沿用项目已有 lint 约定。
2. 创建 FastAPI 服务与 `/health`；SQLAlchemy 2 管理会话，Alembic 初始迁移包含 SPEC 六表、索引和约束，启用 SQLite 外键。数据库、虚拟环境、构建产物在本项目 ignore 中处理。
3. 实现 register/login/me、password hash 与 Bearer JWT，服务端输入验证及统一错误处理。密钥通过环境传入；仅添加无真实密钥的 `.env.example`，不要创建 / 修改真实 .env。缺少密钥时给出启动配置错误，README 写明如何由用户配置。
4. API 客户端统一处理 Authorization、超时、401 和错误文案；Pinia 管理身份与 sessionStorage 恢复。有效 JWT 刷新后用 `/auth/me` 校验；退出登录清理身份。
5. 完成 Login.vue 的注册 / 登录切换与真实请求；Dorm/Home/Schedule/History/Profile 六页路由，四项底部导航，路由守卫、未入宿舍引导；暂未实现功能有明确空状态，不放无效操作按钮。
6. 按 SPEC 视觉规范实现手机布局、安全区与输入。Vite 代理 auth、dorms、duties、notifications、push、health 到后端，并保留后续 PWA 接入空间。
7. 更新 README：安装、迁移、配置、两个服务启动、访问地址、检查命令；明确从零启动顺序及当前实现范围。

## 7. 验收标准

- 前端 `npm ci`（或已记录的等效锁文件安装）、`npm run typecheck`、`npm run build` 成功；已有 lint 成功。
- 后端空临时库 `alembic upgrade head` 成功，health 200，真实 register/login/me；重复账号 409、错误密码 / 无效 token 401，密码不明文。
- 加入数据库重启后账号存在；刷新保留本标签页有效登录，退出后无法进入受保护页面。
- 移动宽度浏览器检查登录与导航，截图 / 证据记录；没有浏览器执行条件时标待验证，不勾选渲染通过。
- 编写有意义的鉴权与迁移测试；业务功能未实现仍明确标注。

## 8. 完成后 Claude Code 需要输出什么

修改文件列表、依赖版本、启动命令、验证命令与真实结果、已实现 / 未实现功能、截图位置、失败项及最小后续建议。更新 ROADMAP 证据；输出仅本项目 diff 摘要，等待 Codex 审查后进入第二轮。不要自行跳到推送与部署。
