# 轮到 · 宿舍值日管理系统

**本地与源码新增（尚未上线）：** 已加入创建者恢复码，换设备后可凭邀请码和恢复码取回管理权限，见 [使用说明](docs/CREATOR_RECOVERY.md)。安装版 1.2.0 增加连接失败重试、鸿蒙抽屉优先返回、安卓系统栏避让及通知桥就绪 / 换人请求保护；使用与构建见 [安装版说明](native/README.md)。完整的通知、替干、请假、水票、桌面卡片和部署目标见 [App 演进清单](docs/APP_ROADMAP.md)。本轮按用户要求只更新本地与 GitHub，正式服务器继续使用下方已发布版本。仓库暂按单人 PR + 自动检查流程开发，不要求第二人批准。

**GitHub 进度快照（2026-10-15）：** 最新部署为 `20261014-invite-gate-v17`。网站、持久化后台和 iOS PWA 通知已交付；安卓与鸿蒙安装版工程已有，原生推送应用配置、厂商通道、鸿蒙签名及真机通知验收仍待完成。完整状态见 [当前进度](docs/PROGRESS.md)。下方包含此前迭代记录，涉及旧部署的描述请以当前进度为准。

两人协作请先阅读 [CONTRIBUTING](CONTRIBUTING.md)，在 [Issues](https://github.com/lihao505/dorm-duty/issues/new/choose) 选择问题或开发任务模板，各自使用任务分支，通过 PR 互相审查。PR 自动提供验收与发布交接模板。GitHub Actions 在 main 提交和 PR 上自动构建网页、检查业务 / 通知规则及安卓安装版；合并后由发布负责人单独验收与发布。

**正式公网入口已迁到现有服务器：** [打开轮到](https://8.148.190.114/dorm-duty/)。前端、业务接口和 SQLite 数据库全部在 `8.148.190.114` 运行，不依赖本地 Mac、临时隧道或 Cloudflare 免费域名。无需账号密码，先创建宿舍或凭邀请码加入，再选择成员；默认六人宿舍只在主动选择游客体验后出现。

**系统通知已上线：** 正式成员从「… → 系统通知」开启、测试和关闭这台设备。服务器发送加密 Web Push，iPhone 用户已确认收到真实系统通知。iPhone 需 iOS 16.4+ 添加主屏幕并主动授权；安卓和鸿蒙按实际浏览器能力自动检测，网页业务共用，不能保证所有默认浏览器均可后台推送。平台接收与验证见 [系统通知证据](docs/evidence/system-push/README.md)。

**最新规则更新（2026-10-14）：** 地板、厕所默认各自使用自由轮次，每人本轮主动做一次，全员完成这一项后自动开启下一轮；抬水继续按顺序，实际抬完才打卡。不再给默认值日、抬水显示每日截止与逾期。首页可切换地板 / 厕所，显示「本轮已完成」和本轮进度，点进度查看成员。此前提醒自动弹出、日历类型标记与完成列表继续保留。已发布服务器，刷新后如出现更新提示，请点「更新页面」。验证见 [自由轮次证据](docs/evidence/voluntary-rounds/README.md)。

界面保留黑白大字布局：值日、抬水、完成日历各占一个页面。创建者可自定义三类内容、启用状态和抬水顺序，也可把地板 / 厕所切换为按日排班并配置时间；成员可以完成本人任务、提醒室友，服务器记录完成时间并在日历显示各自标记。

**自由轮次发布验证：** 新逻辑隔离 SQLite 8 组 / 178 项通过，并在服务器 Node 22 重跑通过；按日排班等既有三类任务回归 12 组 / 751 项、原接口 16 组 / 1,017 项通过。真实公网六人并发与独立轮次 142 项通过，应用重启后 102 项恢复检查通过；发布前 21 条已完成记录逐条哈希校验未变。当前 11 个主要静态资源与正式构建字节一致，桌面浏览器 320×640 与 390×844 手机尺寸布局通过。本轮新规则尚未在实体 iPhone 上重新验收。

**此前首次服务器发布验证：** 有效 IP HTTPS 证书、普通 Tabbit 与内置浏览器访问、真实服务器 API 8 组 / 329 项检查、服务重启保留 16 条完成记录与任务设置均通过。证书自动续期和每日数据库备份已启用，证书模拟续期与重载检查通过。用户已在手机 Safari 确认能正常打开并看到任务，见 [手机反馈](docs/evidence/server/phone-access.json)。Wi-Fi / 蜂窝网络未分别记录，主屏幕与锁屏通知未验收。

原 Cloudflare D1 已备份、校验并迁入服务器；切换前后导出 SHA-256 一致。旧 Workers 与 Pages **生产入口**已改为网页跳转，业务 API 返回迁移提示，不再写 D1。原 D1 和历史发布版本保留用于回退；禁止继续向旧预览部署写业务数据，回退之前应先迁回服务器最新数据。

发布和维护见 [服务器部署说明](docs/SERVER_DEPLOYMENT.md)，[真实服务器 API 证据](docs/evidence/server/2026-10-14T03-46-43-200Z_mv7kiyyo_471a09d8/api.json)，[服务、证书及备份状态](docs/evidence/server/service-status.json)。原 Cloudflare 访问失败及历次发布证据继续保留为历史。

**本地版本继续保留。** 双击 [启动.command](启动.command) 或运行 `./scripts/local.sh`，访问 [本地网页](http://127.0.0.1:8081/)。本地数据库 `data/dorm-local.db` 与正式服务器数据独立，不自动同步或上传；见 [本地使用说明](docs/LOCAL_USAGE.md)。原 FastAPI 实现保留为参考，当前正式服务复用 Worker 业务代码并使用文件 SQLite。

## 新版免账号入口

1. 首访先选「创建宿舍」或「加入宿舍」。创建时填写宿舍名称、自己的名字和室友名字，选择自己的像素标记；加入时输入邀请码，再选择自己及未被占用的标记。
2. 创建者在当前设备保存管理员令牌，无需账号密码。正式宿舍成员确认身份后领取独立成员令牌，可以完成本人任务、提醒室友和更换自己的标记；该令牌不授予管理权限。
3. 「值日」`/` 默认显示本人的地板 / 厕所独立轮次任务和进度，本轮做过不可重复；全员完成这一项后自动重开。若创建者选择按日排班，则显示今天或最近未来的任务。「抬水」`/water` 显示当前负责人及顺序，负责人点击「我已抬水」后自动交给下一位。「日历」`/calendar` 按上海时区实际完成日期留下成员标记，点击日期查看记录。底部导航切换页面，直接打开或刷新对应路径保留页面及身份。
4. 创建者从「…」菜单打开「任务设置」，分别自定义三类内容及启用状态。地板 / 厕所可以选择自由轮次或按日排班；后者可设截止、开始日期、星期、连续天数和顺序。抬水只显示实际所需的内容及人员顺序。切换方式会重建未完成任务，完成记录保留；按日排班的规则调整从明天起生效。「宿舍成员管理」次级入口打开原成员管理页面。
5. 所有正式成员可在值日或抬水页的次级入口选择一位室友及其未完成任务发送站内提醒；同一发送人、接收人、任务一分钟内只能提醒一次。三页共用「… → 室友消息」入口，未读数显示在「…」上，新的未读提醒会直接弹出抽屉并可标记已读；页面打开时约每 10 秒刷新，也可手动刷新。
6. 「先用游客模式体验」是独立六人只读示例，保持游客标记，不能自动作为正式宿舍恢复。

这是宿舍熟人之间的信任式选人入口：知道邀请码的人可以选择已有名字，不提供强身份验证。成员令牌仅能为其绑定成员完成任务；在另一设备选择创建者的名字，也只获得成员权限。创建者凭据保存在当前浏览器，清除网站数据会丢失这台设备的管理权限；原账号入口保留在 `/admin/login`，旧 `/login` 转到新版首页。

三类任务、权限和接口见 [CHORES](docs/CHORES.md)，100 个原创像素标记见 [MEMBER_MARKS](docs/MEMBER_MARKS.md)。站内提醒继续保留，系统通知已通过服务器 VAPID / Web Push 接入，iPhone 用户已确认接收；定时日排班提醒未接入当前免账号入口。安卓/鸿蒙安装版已加入原生设备绑定与极光投递框架，但推送平台应用、厂商配置、签名和真机通知仍待完成，见 [安装版接入说明](native/README.md)。iOS 原生安装与 TestFlight 的费用、有效期和后端关系见 [IOS_DISTRIBUTION](docs/IOS_DISTRIBUTION.md)。

新版验证命令（项目根目录；业务验收均使用独立测试数据库）：

```bash
node site/scripts/check-cloud-backend.mjs
node site/scripts/check-chores.mjs
node site/scripts/check-rounds.mjs
node site/scripts/check-worker.mjs
node scripts/verify-local-persistence.mjs
node scripts/verify-chores.mjs
```

本地运行使用 Node.js、文件 SQLite 和 D1 API 适配器，直接复用托管 Worker 业务代码；这些本地检查不能代替上面的真实云端验收。三类任务后端 12 组 / 677 项断言与原接口回归 16 组 / 1,017 项断言已通过。此前三页分离的 Chrome 导航 11 组及持久化恢复 7 组证据保留为历史。2026-10-13 大字版在真实 Chromium 浏览器验收三种手机尺寸、六周日历、快速关抽屉后打卡、抬水轮换、提醒收发和设置入口；详见 [本轮 UI 证据](docs/evidence/ui-focus/README.md)。本轮前端与 Service Worker 类型、构建、格式及最终 Worker 677 项检查通过；128 个嵌入资源共 637,874 字节。新的界面已部署 Cloudflare；原 8081 进程继续保留此前运行版本，重新启动本地服务会加载新构建。状态与证据见 [本地使用说明](docs/LOCAL_USAGE.md)。两台实体手机、iPhone 主屏幕与锁屏通知仍待验收。

## 在这台 Mac 上使用

双击 [启动.command](启动.command)。如果服务已在运行，会直接打开网页；终端保持开启，按 Ctrl+C 停止本次启动的服务。

也可以在终端运行：

```bash
cd /Users/apple/project/dorm-duty
./scripts/local.sh
```

- 网页与业务 API：[http://127.0.0.1:8081](http://127.0.0.1:8081)
- 状态检查：[http://127.0.0.1:8081/health](http://127.0.0.1:8081/health)，应显示 `runtime: node-worker-local`、`storage: sqlite`、`persistent: true`。
- 数据文件：`data/dorm-local.db`，首次启动自动迁移，仅初始化一个游客示例，不插入正式测试宿舍。

需要 Node.js 22.13 或更新版本和 npm；本机已安装依赖。一键启动会构建前端并嵌入 Worker，启动同源网页与 API；再次启动会复用同一个数据文件的既有服务。普通局域网 HTTP 可验收业务，iPhone 主屏幕 PWA / 系统通知需要后续 HTTPS 环境。

创建者的管理凭据保存在当前浏览器。电脑 `127.0.0.1` 和手机 / 电脑局域网 IP 属于不同站点来源，浏览器也不同；管理权限不会随邀请码迁移。如果主要用手机管理，请在手机上的同一地址创建宿舍。其他设备用邀请码选择成员，确认标记后完成本人任务和接收站内提醒。

需要即时修改 Vue 页面时，先启动上面的持久服务，再在另一终端运行：

```bash
cd /Users/apple/project/dorm-duty/frontend
DORM_API_ORIGIN=http://127.0.0.1:8081 npm run dev
```

Vite 默认的 API 目标 `8000` 对应原 FastAPI；新增 `/chores` 接口需要指向 `8081` 的 Worker 服务。

## 原 FastAPI 开发版

以下说明仅用于维护原 Python 后端，不是新版默认启动方式。运行 `./scripts/dev.sh` 启动 FastAPI（8000）、提醒进程和 Vite（5173）；需要单独安装 Python / uv 依赖。生产构建预览使用 4173。

原浏览器 QA 服务使用 `data/qa.db`，其中全是自动化创建的测试账号；账号名见 `docs/evidence/browser-smoke.json`，测试密码统一为 `DutyDemo123!`，不用于生产。默认 `./scripts/dev.sh` 使用独立的 `data/dorm.db`。这两个数据库均未自动导入新版 `data/dorm-local.db`，也不会被新版启动脚本覆盖。

首次换到其他开发环境，推荐 Node.js 22+、Python 3.11+、uv：

```bash
./scripts/setup.sh
./scripts/dev.sh
```

`setup.sh` 创建项目内虚拟环境并按锁文件安装依赖。启动脚本先执行 Alembic 迁移，再启动 FastAPI、唯一提醒 worker 和 Vite。未手工提供 JWT_SECRET 时，脚本只在进程环境中生成临时密钥，**不写 .env 或密钥文件**；重启后需要重新登录，服务器数据会保留。

## 原账号版使用顺序

1. 注册账号，创建宿舍；创建者为管理员。
2. 复制邀请码分享给室友，室友注册并加入。
3. 在“宿舍管理”设置值日顺序、起始日期、卫生任务和截止时间。
4. 在“排班”生成 / 补齐未来 30 天，也可调整今天或未来某一天。
5. 本人点击首页“完成值日打卡”；其他成员刷新可看到同一完成时间。
6. 消息入口查看站内提醒；“我的”修改昵称、配置通知、进入宿舍或退出登录。

iPhone 和电脑在同一局域网时，可以使用电脑实际 IP 与 5173 端口进行业务调试。主屏幕 PWA / 系统通知需要 HTTPS 环境，不能用普通局域网 HTTP 代替验收。没有配置系统推送时，“我的”显示暂未开通，站内提醒可继续使用。

## 原 FastAPI 业务与提醒规则

- 所有排班、日期、截止与完成时间以服务器为准，业务时区 Asia/Shanghai。
- 重复生成只补缺失日期；显式重排只改未来未完成任务，保留今天与历史。
- 成员加入 / 退出会调整未来未完成排班；今天未完成的执行人必须先完成或由管理员调整后才能退出。
- 只能给本人今天或过去的任务打卡，不能代打卡；逾期允许补打卡，并标记实际完成时间。
- 管理员先转移管理权限才能退出；一人同时只能属于一个宿舍。
- 提醒时间：前一天 21:00、当天 08:00、未完成时当天 19:00；最近 60 分钟补查，已完成和失效接收人不再发送后续提醒。
- Web Push 每设备首次失败后最多重试 3 次，超出提醒一小时窗口停止投递；accepted 仅代表推送提供商接受，不代表手机已收到。

完整 API 与边界见 [SPEC](docs/SPEC.md)。

## 检查与浏览器验证

```bash
./scripts/check.sh
```

这会运行后端 Ruff 与 pytest、前端类型检查、自定义 SW 类型检查和生产构建。前端格式检查：

```bash
cd frontend
npm run format:check
```

浏览器业务测试必须针对独立 QA 数据库，避免把测试账号插入自己的正式宿舍数据库：

```bash
# 项目根目录启动独立测试服务；不要与已有同端口服务同时启动。
DATABASE_URL=sqlite:////Users/apple/project/dorm-duty/data/qa.db ./scripts/dev.sh
# 另一终端
cd frontend
npm run test:e2e
npm run preview
# 再开一个终端，在 frontend 目录
npm run test:pwa
```

浏览器脚本默认调用 macOS Google Chrome，可通过 `BROWSER_EXECUTABLE` 指定其他平台的 Chrome 可执行文件。PWA 检查读取最近一次业务测试创建的 QA 账号。浏览器脚本会写截图和 JSON 证据到 `docs/evidence/`。

## 技术与目录

```text
dorm-duty/
├── frontend/            Vue 3 / TS / Vite / Vant / Pinia / Router
│   ├── src/views/       登录、宿舍、首页、排班、历史、我的、消息
│   ├── src/api/         HTTP、类型、网络状态、通知订阅
│   ├── src/sw.ts        自定义 Service Worker
│   └── e2e/             真实浏览器业务与生产 PWA 检查
├── backend/
│   ├── app/             models / schemas / routers / services / core
│   ├── app/scheduler.py 唯一独立提醒进程
│   ├── alembic/         冻结的六表初始迁移
│   └── tests/           隔离临时数据库中的业务、权限、并发和提醒测试
├── site/
│   ├── worker/          托管 Worker 业务与已嵌入的前端资源
│   ├── local/           文件 SQLite 的 D1 适配器、事务迁移与游客初始化
│   └── drizzle/         不可改写的数据库迁移
├── scripts/             local.sh / local-server.mjs、本地重启验收、原开发脚本
├── docs/                规格、进度、验收、部署与验证证据
├── workflow/tasks/      原始四轮开发任务书，保留用于维护
└── docker-compose.yml   migrate / api / worker / web
```

安装锁文件为 `frontend/package-lock.json`、`backend/requirements.lock` 与 `requirements-dev.lock`。开发测试实际使用 Node 26.4.0、Python 3.11.13；容器配置采用 Node 22 / Python 3.12，但本机无 Docker，容器运行尚未验证。

## 部署与通知配置

当前 IP 服务器部署见 [SERVER_DEPLOYMENT](docs/SERVER_DEPLOYMENT.md)，系统推送配置由独立应用 StateDirectory 首次生成并持久保存，无需把私钥填到聊天或源码。以下是原 FastAPI 部署方式：见 [DEPLOYMENT](docs/DEPLOYMENT.md)。配置变量示例在 `.env.example`，实际凭据由用户或部署平台通过环境注入。首次使用必须迁移，SQLite 文件或容器卷必须持久化；API 不启动调度器，提醒 worker 只启动一个。

可由用户执行以下命令生成 VAPID 值（仅显示在其终端，不保存文件）：

```bash
backend/.venv/bin/python scripts/vapid_keys.py
```

## 已读取参考与工作区边界

本轮沿用工作区 AGENTS、已整理的 SPEC 和 frontend-design；本地 React Bits 仅作为交互参考，未引入 React。指定的 awesome-design-md、math-curve-loaders、统一 KnowledgeBase 索引和全局流水线模板在此前检查中缺失，未作为已读取资料。

本轮新增与修改均在 `dorm-duty/` 内，未改其他项目、根 .gitignore、既有 .env 或凭据文件。`site/` 是此前通过 Sites 官方工具打开的托管源码仓库，继续复用原站点身份。

官方参考：[WebKit 的 iOS 主屏幕 Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)、[Vite PWA injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest)、[APScheduler 3.x 多进程限制](https://apscheduler.readthedocs.io/en/3.x/faq.html)。

## 前端优化与自定义排班（2026-10-11）

保留 Vue 3 / Vant 和业务管理路由。2026-10-12 新首页根据用户最新要求采用黑白极简布局，值日、抬水和日历各有独立路由，底部三项导航切换；成员像素标记仅带轻微绿色荧光，不增加持续循环动效。原管理组件保留可访问性与减少动态效果设置。

管理员在「我的 → 宿舍管理」可设置每周值日日期、每人连续负责天数、7 至 90 天范围、星期任务模板与休息日期，并在保存前查看服务端预览。「排班」支持单日人员 / 内容 / 时间编辑和临时添加任务。

三类任务的当前规则见 [CHORES](docs/CHORES.md)；原账号版的任务模板、休息日及单日编辑说明继续保留在 [CUSTOMIZATION](docs/CUSTOMIZATION.md)。两套任务数据独立，旧接口和历史记录仍保留。

## 大字简洁版（2026-10-13）

值日与抬水主区域仅显示一句标题、一个大任务名、一个主要操作。点任务名查看内容和时间；多人任务用简洁选项切换。没有今日任务则显示最近未来任务。任务设置、消息、刷新与抬水顺序移入「…」菜单；日历直接显示月份网格，点日期展开记录。加入与创建流程保留。

页面切换与底部选中块连续滑动，按钮有按压回弹，任务切换轻淡入淡出，详情用手势抽屉展开。减少动态效果与键盘操作时关闭非必要动效。验收截图、尺寸指标和验证边界见 [UI 证据](docs/evidence/ui-focus/README.md)。

## 2026-10-14 身份保留与催促更新

顶部只展示成员名字和一个「…」操作菜单。选人、加入其他宿舍、创建宿舍和更换标记统一收进菜单，明确选择加入其他宿舍才打开邀请码。打开或取消切换不清除宿舍/成员；错误邀请码不会覆盖原身份；通知地址缺少邀请码也会恢复已保存的选择。页面更新保留当前身份，联网失败可重试。底部导航支持按住后滑动到目标页，松手切换；移出导航后取消。抬水详情从屏幕底部展开。

抬水页点室友名字即可提醒当前轮到的人，连续敲击有回弹、波纹和浮字。同一发送者对同一任务每 60 秒最多一条真实提醒；游客模式只有体验反馈。测试与验收依据见 [本轮证据](docs/evidence/native-notifications/README.md)。
