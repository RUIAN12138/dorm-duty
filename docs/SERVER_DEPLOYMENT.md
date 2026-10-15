# 服务器 IP 入口

用户已授权将 `8.148.190.114` 作为正式入口，明确不使用现有域名。正式地址为 [https://8.148.190.114/dorm-duty/](https://8.148.190.114/dorm-duty/)。2026-10-14 已上线，普通浏览器与真实 API 验证通过；用户已确认手机 Safari 能正常打开并看到任务，具体网络类型未记录。

## 最新发布（2026-10-15，v30）

正式版本 `20261015-fluid-rings-v30`，于 2026-10-15 15:21:43 UTC（北京时间 23:21:43）上线。运行目录 `/opt/dorm-duty/releases/20261015-fluid-rings-v30`；Worker SHA-256：`751d15890ef75fb0ceda4852d66f6c8b42af9467c829319aa641ffccfca3f189`。

修改包括：浮点连续圆环 / 滚动数字、仅圆环层的局部形变、独立渐入的完整已完成人员名单、首页小环仅本机完成播放增加反馈、收圆后画勾 / 粒子、有缩放和角度的真实记录叠卡、轮序卡片渐入及正式成员 order-only 保存接口。无数据库结构或凭据变更。

发布前在线备份 `dorm-20261015T152143Z.sqlite`，切换后 59 条既有完成记录逐条摘要一致；服务健康正常，28 个公网页面 / JS / CSS / Manifest / SW 与本轮构建逐字节一致。前版 `20261015-round-motion-v29` 保留。证据：忽略目录 `docs/evidence/round-calendar/deployment-v30.log` 和 `public-assets-v30.json`。

验证：79 项 Chromium 交互基础、33 项 Chromium / 32 项 WebKit 轮环日历检查、29 条双身份业务流程（包括正式成员保存轮序、撤销、持久化服务重启）、120 项轮序权限与历史、186 项轮次及 73 项撤销检查。实体 iPhone 未连接可用，未把浏览器触摸模拟算作真机帧率或震动验收。

## 历史发布（2026-10-15，v29）

正式版本 `20261015-round-motion-v29`，代码 PR #23（main `11da2d4`），于 2026-10-15 14:32:25 UTC 上线。保留黑白大字风格，轮次展示改为真实完成时间排序的已完成名单，圆头进度环逐个吸收「+1」并联动数字；轮序入口可选择四类任务，创建者拖动保存，普通成员只读并可进入管理身份恢复。

月历使用三个连续月份面板，拖动中能看到相邻日期及实际标记；修复触点捕获交接误取消和短拖叠加旧动画导致误切月。六组交互分别落在打卡收圆描勾 / 粒子、首页进度与浅色背景联动、历史日期叠卡、记录吸附后描线、截止时间惯性滚轮、页签点击圆形扩散；按住底栏切换仍带可取消的 180ms 平移。列表今天展开、历史折叠，跨日收起昨天。减少动态效果、键盘与错误 / 撤销分支保留。具体组件与来源见 [交互说明](UIVERSE_COMPONENTS.md)。

发布前在线备份 `dorm-20261015T143225Z.sqlite`，切换后 59 条既有完成记录逐条摘要一致。Worker SHA-256：`315b88494247c12c3925a513c849b95f12f9d0ca85cfda7d857e9fc5930d031b`。前版 `20261015-direct-touch-v28` 保留；没有数据库迁移、凭据变更或 Nginx 修改。

验证：79 项 Chromium 交互基础检查，24 项 Chromium / 23 项 WebKit 的轮次、日历、姓名拖动、叠卡吸附和时间轮检查，28 条完整双身份业务检查（含持久化重启及打卡期间布局稳定），65 项排序权限与历史检查、73 项撤销检查；PR #23 的网页业务与安卓必需 CI 均通过。Chromium 额外通过原生浏览器触摸事件的惯性减速 / 刻度吸附检查；WebKit 的记录吸附使用程序滚动，不能将它视为手机手指操作验收。

公网 28 个页面 / JS / CSS / Manifest / SW 与最终构建字节一致，健康正常；内置浏览器应用 PWA 更新后，确认三个真实月份面板、仅当前月可操作、新首页进度及身份保留。证据在忽略目录 `docs/evidence/round-calendar/`、`docs/evidence/interaction-foundation/` 和 `docs/evidence/ui-focus/regression/`。本轮没有实体手机帧率、实际震动或原生安装包更新验收。

## 历史发布（2026-10-15，v28）

正式版本为 `20261015-direct-touch-v28`，代码见 PR #22。顶部显示宿舍名，创建者长按名字提起整行并拖动排列；底栏按住经过标签即时显示对应页，连续经过的页面合并为一个历史步骤。打卡按钮固定 60px，反馈为轻压、加载环、成功勾选和局部粒子；同步状态延迟浮现，不插入顶部排版。抬水标题位置固定。月历固定六行、单网格可中断转场，避免跨月高度跳动与离场层叠。

适配 Uiverse Galaxy 六类组件：加载环、勾选描边、按钮填充、输入焦点、分段滑块、菜单箭头；许可原文随网站提供，作者与上游提交见 [组件说明](UIVERSE_COMPONENTS.md)。无新增 npm 依赖，未更改数据库结构、业务轮次、成员权限或通知凭据。

发布前在线备份 `dorm-20261015T133058Z.sqlite`，切换后 59 条原有完成记录逐条摘要一致。Worker SHA-256：`2aa72671f5938d062796e0b4f38d521413737b54fe75875f6153f81a17ec2acc`。前一版本 `20261015-gesture-calendar-v27` 保留。

28 个公网页面 / JS / CSS / Manifest / SW 与最终构建字节一致，MIT 许可文本也逐字一致，健康正常。75 项 Chromium 组件检查、28 项手势检查、完整双身份持久化业务流程及两项 GitHub 必需检查通过。业务流程含值日 / 抬水逐帧布局稳定、撤销、排序、权限、慢响应 / 409 草稿和重启恢复。证据在忽略目录 `docs/evidence/direct-touch/`、`docs/evidence/interaction-foundation/` 和 `docs/evidence/ui-focus/regression/`。实体设备触摸手感 / 帧率及网页实际震动独立验收。

## 历史发布（2026-10-15，v27）

正式版本为 `20261015-gesture-calendar-v27`，代码见 PR #21。日期区支持触摸左右滑月，纵向保留页面滚动，密集标记约束在格内，日期详情按实际完成时间倒序。底栏 / 分段复用水平意图判断，失焦取消预览；修复浏览器隐式捕获转交引起的滑动误取消。抽屉使用最近移动判断速度，反向重置、停住不沿用旧速度。保留黑白大字与暗色无虚化提示。

发布前在线备份 `dorm-20261015T122935Z.sqlite`，切换后 59 条既有完成记录逐条摘要一致。Worker SHA-256：`33c2f4d9a02d8f1892911bd19a5369284599b41a33ee059f0dfee9fd1cbc2774`。前一目录 `20261015-tactile-dim-v26` 保留；未更改数据库结构、业务轮次、权限、通知凭据或 Nginx。

最终 28 个公网页面 / JS / CSS / Manifest / SW 与构建字节一致，健康检查正常。28 项手势 / 速度检查、64 项实际 Chromium 组件检查和最终构建双身份持久化流程通过，含触摸事件、取消、反向和 320 / 390 / 430px 布局；两项 GitHub 必需检查通过。证据在忽略目录 `docs/evidence/gesture-polish/`、`docs/evidence/interaction-foundation/`、`docs/evidence/ui-focus/regression/`。实体三端触摸手感与帧率独立验收。设计参考与具体行为见 [移动交互优化](REFERENCE_POLISH.md)。

## 历史发布（2026-10-15，v26）

正式版本为 `20261015-tactile-dim-v26`，代码见 PR #20。完成按钮再次点击恢复、轮次成员拖动排列、日历对齐与居中入口已上线；提示弹窗标题居中、无关闭图标、半透明暗色背景、不虚化，弹窗略低于屏幕中心，点空白或「知道了」收起。抬水保留原大名字与留白。Worker SHA-256：`91c2479bbca6dc384ab2ff7bd39410ff7d4647abbf9249f2ef84ff8f6443dc80`。

发布前在线备份 `dorm-20261015T115104Z.sqlite` 并校验完整性 / 外键，切换后 59 条既有完成记录逐条摘要一致。未改数据库结构、通知凭据或 Nginx；前一目录 `20261015-tactile-focus-v25` 保留。最终提示弹窗为纯白面板、22% 暗色背景，无虚化，中心位于屏幕高度的 56%。

最终 28 个页面 / JS / CSS / Manifest / SW 与构建字节一致。后端与 v24 相同，v24 的独立公网宿舍验收为 9 组 / 386 项，包含本人恢复与抬水回退；没有为最终 CSS 微调再次写入测试宿舍。证据：`docs/evidence/ui-focus/public-assets-v26.json`、`deployment-v26.json`、`docs/evidence/server/2026-10-15T11-29-46-556Z_mv9gibek_8e16354e/api.json`。本地完整浏览器流程、触摸模拟与真机边界见 [按钮与布局](TACTILE_UI.md)。

## 历史发布（2026-10-15，v21）

正式版本为 `20261015-usability-v21`，对应 PR #18。新增已加入宿舍卡片、本人打卡撤销、顶部独立轮序、分组菜单；任务标题立即更新，抬水只读详情为非模态底部面板。Worker SHA-256：`5b6e779f4e3b9f96ef66c55f4ef9e7a9def9e565ecb4c158ed20c8725a514166`。

发布前在线备份 `dorm-20261015T100524Z.sqlite` 并核对完整性 / 外键；原子切换后 48 条既有完成记录逐条摘要一致。未改变数据库结构、通知凭据或 Nginx，旧版本 v20 目录保留。

公网 28 个页面 / JS / CSS / Manifest / SW 与正式构建字节一致，9 组 / 386 项独立宿舍 API 检查通过，包含本人撤销、越权 / 匿名拒绝、再完成重开、抬水回退与后续完成保护。正式浏览器更新后确认独立轮序与新菜单显示。证据：`docs/evidence/ui-focus/deployment-v21.json`、`public-assets-v21.json`，API 报告在 `docs/evidence/server/2026-10-15T10-06-14-283Z_mv9divwr_83961918/api.json`。本地与真机验证边界见 [可用性改进](USABILITY_POLISH.md)。

回退到 v20 会失去撤销接口和新查询规则；若已使用跨轮次撤销，旧程序对 cancelled 后续轮次的统计语义不同。应优先修复前进；确需回退时先暂停写入、备份当前最新数据库并核对轮次，不能用旧备份覆盖新记录。

## 历史发布（2026-10-15，v20）

正式版本为 `20261015-interaction-foundation-v20`。本轮升级 Motion / Reka 交互基础，保持原黑白大字 UI。Worker SHA-256：`03220355316151b9e3088bfea77beabb0f216fb38a75a40fa5269bf5a2047d6f`。

发布前在线备份 `/opt/dorm-duty/backups/dorm-20261015T080537Z.sqlite` 并校验完整性与外键。原子切换后服务健康正常，44 条既有完成记录逐条摘要一致；未更改数据库结构及通知凭据。旧目录 `20261015-mobile-motion-v19` 保留用于回退。

公网全部 JS / CSS（含新的共享模块）、首页 / 两页路由、Manifest 与 SW 共 27 个资源逐字节一致；独立验收宿舍 API 8 组 / 337 项通过。本地 37 项移动视口组件检查及两身份业务流程通过，覆盖慢响应和版本冲突保留草稿。证据：`docs/evidence/interaction-foundation/`、`docs/evidence/ui-focus/regression/`、`docs/evidence/server/2026-10-15T08-06-05-616Z_mv998do0_809af00e/api.json`。实体三端触摸与帧率仍需单独验收。

## 历史发布（2026-10-15，v18）

正式版本为 `20261015-washbasin-web-v18`，对应 PR #13。Worker SHA-256：`49a271bfdd83678bbfa526abb276a78658f4a044f4eed74c68b42affd6a644f0`。洗手池独立轮次、创建者自定义、定时提醒与日历订阅已加入；抬水轮序拖动、三页标题滑动和页面动效同时上线。修复自由轮次改按日排班后首页重复显示旧完成任务的问题。

发布前通过 SQLite 在线备份创建 `dorm-20261015T054858Z.sqlite`，同时由既有脚本保存通知配置的私有备份。归档校验成功后，使用 Python 3.11 安装到独立版本目录并原子切换；服务运行 Node 22.23.2。`0000` 至 `0009` 共 10 条迁移已应用，数据库完整性为 `ok`，外键错误 0；40 条既有完成记录逐条摘要一致。没有重启整台服务器。

公网 API：8 组 / 337 项通过，只在独立验收宿舍写入；12 个主要资源与正式构建字节一致。Chrome 390px 触屏模拟在正式 HTTPS 入口完成游客洗手池、三页切换和刷新身份检查，浏览器错误为 0。证据位于 `docs/evidence/server/2026-10-15T05-50-01-014Z_mv94ddti_4ec9f083/` 与 `docs/evidence/ui-focus/regression/`，不代表实体 iPhone / Android / HarmonyOS 本轮通知与手势验收。

旧版本 `/opt/dorm-duty/releases/20261014-invite-gate-v17` 保留用于代码回退；数据库使用独立持久化路径。下面保留历史发布的检查范围与维护说明。

## 历史发布（V6）

2026-10-14 V6 发布 `20261014-system-push-v6`：系统通知订阅、加密发送、测试与停用已接入，iPhone 用户已确认收到通知。该版本同时保留自由轮次：地板、厕所分别使用自由轮次；每人一次，全员完成该项后自动重开。抬水按实际完成驱动顺序轮换，不显示每日截止。创建者可以保留自由轮次或切换按日排班。提醒自动弹出、日历类型图标和列表继续保留。

此次在备份后应用新增迁移 `0002_unknown_galactus.sql`，未修改既有迁移。旧的未完成地板 / 厕所日排班取消，已有完成历史逐条校验不变，自由轮次从第 1 轮开始；抬水当前人和序号保留。详见 [自由轮次验收](evidence/voluntary-rounds/README.md)。

浏览器缓存旧版本时，刷新并点击「有新版本可用 → 更新页面」。不要清除网站数据，否则会丢失当前设备身份与创建者管理凭据。

## 历史进度（v17）

2026-10-14 最新版本为 `20261014-invite-gate-v17`，bundle SHA-256 `ec852973aaab795c9c313137ae527f1a960d0a5d39efb0e1c92371766eef4bb4`。新设备不再把地址中的邀请码当成加入操作，旧分享链接先显示空邀请码框，正确输入后才加载成员；创建 / 加入 / 底部导航使用无邀请码地址。默认查询仅允许演示宿舍。浏览器验证已加入设备导航、刷新保留身份。12 个公网资源与构建一致，40 条既有完成记录逐条校验保留。此前 iOS 声明式通知正文发布后用户已确认完整显示；此前抬水底部转场和打卡同步保留。入口证据见 `evidence/invite-gate/README.md`，通知证据见 `evidence/push-content/README.md`。

- 顶部名字不可点击，右上角只有一个「…」；从菜单明确选择加入其他宿舍才打开邀请码，取消或刷新仍保留原成员。
- 抬水页点名字催促：按压回弹、波纹和浮字；实际提醒合并为同一发送者/任务 60 秒一次。游客动画不发送消息。
- 新增 `0004_native_push.sql`，只扩展设备元数据；发布前后 39 条完成记录一致。新增原生设备绑定和定向投递接口。
- Android APK 和鸿蒙未签名 HAP 已构建，尚无推送平台应用、厂商通道配置和鸿蒙签名，也未在安卓/鸿蒙真机验收。详细步骤见 [安装版通知接入](../native/README.md)。
- 服务器 Python 默认是 3.6.8，部署、在线备份及记录验证必须显式使用 `/usr/bin/python3.11`。备份服务已经使用该版本。
- 原 iPhone Web Push 验收和历史版本说明保留在下方。

- Node 22 与持久化 SQLite 后台已经安装在独立目录；systemd 管理 `dorm-duty.service`，监听 `127.0.0.1:8086`。
- D1 已导出私有备份，并通过表结构、完整性、外键检查后迁入服务器。切换前、切换后再次导出，均与初始备份字节一致。原 D1 保留，正式写入统一到服务器 SQLite。
- 前端已构建为 `/dorm-duty/` 前缀，路由、API、图标、Manifest 和 Service Worker 使用同一前缀。
- IP HTTPS 已上线，证书自动续期、每日数据库备份均已启用并成功运行；Certbot 模拟续期及 deploy hook 平滑重载通过。
- 现有 Nginx 不处于 `nginx.service` 的活动状态，不能使用 `systemctl reload nginx`。已确认现有 master 与 `/usr/local/nginx/sbin/nginx` 配置一致，使用 Nginx 自身的 `-s reload` 成功加载；不启动第二个 Nginx，也不停止现有网站。

## 发布与回滚边界

业务文件：`/opt/dorm-duty/releases/20261015-fluid-rings-v30`，`/opt/dorm-duty/current` 指向该版本。持久化数据库：`/var/lib/dorm-duty/dorm.sqlite`，不会随源码更新重建。

IP 虚拟主机配置：`deploy/nginx-ip.conf`，安装到 `/opt/dorm-duty/nginx-ip.conf`。首次证书验证先使用 `deploy/nginx-ip-acme.conf`，仅开放 ACME 验证文件，其余 IP HTTP 请求返回 503。

原 Nginx 配置修改前复制为服务器私有备份。只将旧虚拟主机的 IP 别名移到独立虚拟主机，保留原域名及全部原网站接口。先执行 `nginx -t`，失败则恢复备份，验证成功后平滑重载。

Certbot 使用独立 Python 虚拟环境和 `/opt/dorm-duty/letsencrypt` 配置目录，不读取或修改现有域名证书。IP 证书使用 Let's Encrypt `shortlived`，有效期六天；续期 timer 每天检查两次，续期后执行 Nginx 配置检查及平滑重载。必须验收真实生产证书以及 staging `renew --dry-run`，不能把测试证书安装到公网。

数据库每日通过 SQLite backup API 在线备份，包含已提交的 WAL 数据，备份需通过完整性与外键检查。备份仅保存在服务器私有目录 `/opt/dorm-duty/backups`，不提交仓库。目前脚本不自动删除备份；后续应依据磁盘使用及恢复需要制定保留策略。

## 验收

`node scripts/verify-server.mjs https://8.148.190.114 data/rounds-release-v5/site/worker/index.js` 会创建独立测试宿舍，通过标准 TLS 校验检查同源资源、创建、成员权限、自定义、提醒、本人打卡、抬水并发轮换、日历和刷新；输出脱敏证据到 `docs/evidence/server/`。

实际服务重启后，16 条完成记录与任务设置的摘要保持一致；独立验收宿舍完成地板、厕所与两轮抬水。真实公网检查 8 组 / 329 项通过。原域名首页返回 200，Tabbit 与内置浏览器无证书警告，三页和刷新恢复成员正常。未重启整台共享服务器，不能把应用重启验证视为整机恢复验收。现有 Nginx 开机单元已启用。

用户已通过手机 Safari 确认入口和任务正常，证据为 `docs/evidence/server/phone-access.json`。Wi-Fi 与蜂窝网络未分别记录；主屏幕安装和系统 Push 本轮未验收。

证据：`docs/evidence/server/service-status.json`、`deployment.json`、`cloud-cutover.json` 和 `2026-10-14T03-46-43-200Z_mv7kiyyo_471a09d8/api.json`。

## 自由轮次发布校验

- `node site/scripts/check-rounds.mjs`：使用独立内存 SQLite 验证轮次、并发、成员变化、模式切换及历史迁移。服务器 Node 22 同样通过。
- `node scripts/verify-rounds.mjs https://8.148.190.114`：创建独立六人验收宿舍，验证实际公网并发和任务完成；仅测试宿舍有写入。
- `node scripts/verify-rounds.mjs https://8.148.190.114 verify`：读取本机私有测试夹具，检查应用重启后轮次、抬水序号和历史恢复；不写业务数据。
- `node scripts/verify-public-assets.mjs https://8.148.190.114`：只读验证当前主页面、JS/CSS、Manifest 和 SW 字节一致。

V5 bundle SHA-256 为 `81c9907d9917ed08c4798d6c7cfb3210b05f9fca8c6a6e1abaa22c167dfb707c`。完整新功能、原三类接口和原管理 API 检查分别见本轮证据目录；应用重启不等于整机重启、实体手机新版本或锁屏通知验收。

## 迁移与回退

原 Cloudflare Workers 和 Pages 的生产入口已部署 `deploy/cloudflare-moved.mjs`：网页 302 到 IP 地址，旧 API 所有方法返回 410 与新入口提示；新的 SW 替换旧导航缓存。数据仍保留在原 D1，迁移后不向旧生产 API 写入。历史 Pages 预览部署保留作回退资料，不应继续访问或写入旧预览版；预览并未删除或宣称完全关闭。

创建者的设备凭据不会自动从旧域名复制到 IP 来源。已有成员可用原邀请码重新选择自己；原管理员的恢复需其原设备凭据，不能仅选同名成员就授予管理权限。新宿舍应在正式 IP 地址创建。

Nginx 原配置备份：`/opt/dorm-duty/nginx-before-ip-20261014T034545Z.conf`。IP 虚拟主机独立，原域名证书与代理位置保留。原 Worker 版本 `8d6871d2-f117-4fdd-ab4f-42674763c14c`、Pages 部署 `6dbfb721-dff5-4cef-95b9-02382c648467` 保留；回退前先冻结写入、备份并迁回服务器最新记录，不能直接启用旧 D1 造成历史丢失。

当前服务维护通过 SSH 进行。检查 `systemctl status dorm-duty`；修改宿舍代码后先构建并校验独立版本，备份数据库，原子切换 `/opt/dorm-duty/current`，再重启 `dorm-duty`。修改 Nginx 后先 `nginx -t` 再 `nginx -s reload`，不要在已有实例运行时启动第二个 Nginx。

官方 IP 证书配置参考：[Let's Encrypt：Certbot 的 IP 与六天证书](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)。

### 本轮回退注意

V4 和 V5 的后端与迁移相同，V5 只修正小屏容器高度，可以在这两版之间回退源码。若回退 V3，旧程序并不理解自由轮次：不能仅交换符号链接并认为业务规则已回退；应先冻结写入，备份当前最新数据，再明确未完成任务的转换方案。保留新增完成历史，不恢复旧数据库覆盖新打卡。

## 系统通知维护（V6）

新增迁移 `0003_grey_jimmy_woo.sql`，独立保存 `chore_push_subscriptions`、`chore_push_jobs`，不更改任务完成历史。站内消息和设备发送队列原子入库，队列在 Node 服务内每两秒处理；关闭服务不会丢已提交任务，重启会恢复。5 次有界发送与退避，超 24 小时取消；推送提供商 accepted 仅表示接受，不表示手机收到。

打包运行模块 `site/runtime/push-runtime.cjs` 由 `node site/scripts/build-push-runtime.mjs` 构建，构建依赖锁定 `web-push@3.6.7`；Node 运行不用联网安装 npm。代码发布包必须包含该模块和全部迁移。模块由 `scripts/local-server.mjs` 加载；只有 `DORM_DEPLOYMENT=server` 启用推送，原本地 HTTP 服务保持站内模式。

VAPID 仅首次生成在 `/var/lib/dorm-duty/webpush-vapid.json`，0600，不写源码，不与原应用凭据共用。备份脚本同步保存 0600 的 `.vapid.json`；恢复业务数据库须同时恢复匹配通知密钥。不能重新生成已有密钥来解决浏览器兼容问题，否则已有设备订阅失效。

V6 bundle SHA-256 `d73d64215de074ff1b91a526a2c554d2e4d21dbbf811e5b51b9b47a0a6eebec8`。最新同源资源只读检查：

```bash
node scripts/verify-public-assets.mjs https://8.148.190.114 docs/evidence/system-push/public-assets.json
node site/scripts/check-member-push.mjs
```

[系统推送证据](evidence/system-push/README.md)包含 Node 22 8 组 / 119 项、公网权限与配置、重启公钥保持、原 38 条完成记录逐条不变，以及用户明确确认的 iPhone 实际接收。安卓 / 鸿蒙实体接收、锁屏与点击导航单独验收。V5 的资源路径和 bundle 摘要在前文保留为该版本的历史证据。回退 V5 会停止新推送，已提交数据和密钥仍保留；不要恢复旧数据库覆盖新打卡。
