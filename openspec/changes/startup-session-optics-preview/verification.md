# 本地预览验收记录

独立分支codex/startup-session-optics-preview，基于2be03ba(v81)。未PR、未合并、未部署。

## 证据
- data/startup-review/chromium-startup-result.json、webkit-startup-result.json：真实GuestHome+隔离SQLite/模拟邮箱，各8项通过。
- startup-light、water-before/after截图；before由git archive HEAD中的v81原始源码运行拍摄，不是修后图伪装。
- check-startup-session.mjs：6项缓存恢复/清理/实际API网络与401检查，check-identity-races原竞态通过。
- web:build及vue-tsc通过；Android离线assembleDebug成功，仅编译，不等于实体vivo验收。
- 原前端状态回归21/22组通过：check-screen-gesture-check用7px移动断言横幅拖动，与v81的10px阈值不一致；本轮未改该组件/测试，不修无关代码。
- companion AI隔离模拟上游回归通过，未产生真实费用。
- WebGL独立校准两浏览器可用/空闲零帧/不支持回退CSS；当前仅JS派发耗时，不能作为GPU帧率实证。现有导航已含WebGL，未见明显收益，未默认采用。
- data/startup-review/nav-preview-result.json记录真实ChoreBottomNav独立切换实验，正常入口无实验import。
- adb无设备，xcdevice无可用iPhone；实体iPhone/vivo/HarmonyOS未验收。

## 可运行预览
node scripts/preview-startup/server.mjs -> http://127.0.0.1:8094/
实际原应用，临时SQLite/合成邮箱，不连接生产、真实邮件和AI。
光学实验：http://127.0.0.1:8094/src/experiments/index.html ，保留原导航组件，手动开关实验层。

详见docs/STARTUP_REVIEW.md；图标原资源docs/icon-backup-v81，现有球球形象许可没有扩展。

## 用户指定图标替换
按“图标改成这个”使用所附原图，只缩放导出11个PNG与5个自包含SVG兼容资源。尺寸检查192/512/180通过，已查看512预览，Android重新assembleDebug成功，OpenSpec检查通过。未改应用内球球，未部署。深浅模式保留用户原配色，不自动反色。

## 2026-10-24 · 冷启动令牌恢复冲突修复

- 根因：恢复逻辑优先读取 `sessionStorage`，旧标签页/恢复快照可能覆盖更新的持久令牌；另外旧请求的迟到 401 可能清理已经替换的新登录。现改为先取 `localStorage[dorm-auth-token-v1]`，再兼容邮箱管理令牌与旧 session 副本，并将选中的令牌同步回当前标签。401 仅在失败令牌仍是当前令牌时撤销本地副本并通知会话过期。
- 不修改服务端会话期限、不跳过 `/email/me` Cookie 验证，也不改变主动退出时同时撤销管理员与邮箱会话的既有流程。断网仍保留凭证并提供重试。
- `node scripts/check-startup-session.mjs`：13 项通过，包含持久令牌优先级、网络失败保留、替换令牌迟到 401、当前令牌 401 清理和不可用存储降级。
- Chromium 与 WebKit 桌面浏览器隔离冷启动检查均通过：登录验证期间不闪现入口、已登录直达面板、新建浏览器上下文恢复已选宿舍、登出/网络失败恢复、减动效主题。它模拟浏览器持久 storageState 重建，不等于 Android WebView 完全杀进程验证。
- 浏览器向导回归（Chromium、WebKit）均通过，新增满槽位自定义任务入口与释放稳定槽位复用测试；仅验证新版草稿，不写正式数据。
- `npm run web:build`、`npm run spec:validate`、脚本语法检查及 `git diff --check` 通过。`npm run spec:check` 的 scope 检查受工作区原有、未触碰的 `site/runtime/email-runtime.cjs` 修改阻止；该文件未暂存或纳入本轮。
- 本轮新增服务运行时重建场景后，`node site/scripts/check-email-accounts.mjs` 通过 108 项：同一隔离 SQLite 上关闭并重建邮箱服务后，未过期 Cookie 仍恢复原邮箱和已绑定宿舍，原成员令牌仍可访问宿舍数据；未发真实邮件。
- 复跑桌面浏览器检查：Chromium 与 WebKit 的启动恢复各 11 项通过，包括重建浏览器 context 后通过原 HttpOnly 邮箱 Cookie 恢复所选宿舍，以及 Cookie 缺失时保留成员本地 Bearer 但要求重新完成邮箱准入。向导与正式组件全屏预览回归在两引擎均 `PASS []`，包括五步创建、草稿隔离、成员身份和导航编排。
- `npm run web:verify` 全量验证退出码 0：前后端构建以及清单内前端、服务端、迁移和邮件检查全部通过。之前记录的五项失败属于较早一次检查结果，不再是当前结果；没有为清绿而删减断言或改变业务阈值。
- `npm run spec:validate`：19/19 通过。当前含未提交用户改动的工作树直接运行 `npm run spec:scope` 会报 `Out of scope: site/runtime/email-runtime.cjs`；该文件未由本轮触碰、暂存或提交。范围检查需在只包含本轮授权文件的干净工作树再次运行。
- 仍未在实体 vivo、iPhone 或 HarmonyOS 设备测试。当前预览服务使用隔离数据；未创建 PR、未推送、未合并或部署。

## 2026-10-24 · 临时会话恢复失败不再误导至登录页

- 根因：路由守卫等待 `session.init()` 后只检查 `session.user`。网络验证失败时，session 有意保留本地 bearer 并保持 `initialized=false`，守卫却仍把用户送往 `/admin/login`，把暂时无法验证表现成已登出。
- 修复：会话初始化未完成时，受保护页及登录页都返回公开启动入口；启动入口继续按既有流程显示恢复／重试。初始化完成且无有效用户时，受保护页面仍按原行为跳到登录页；邮箱准入检查和主动退出逻辑不变。
- `node scripts/check-startup-session.mjs`：原 13 项会话存储/API 检查通过；新增 7 项实际路由守卫隔离断言通过，覆盖公开入口、未完成恢复、已验证登出、已登录与邮箱验证网络错误。
- `npm --prefix frontend run typecheck`：通过。
- `npm run web:verify`：前端与 Worker 构建及完整列出的前后端回归脚本均通过，退出码 0；构建仍显示既有 `GuestHome` 超 500 KB 提示。
- `npm run spec:validate`：19/19 通过；`npm run spec:scope` 在去除临时 node_modules 符号链接并恢复测试生成文件后通过，18 个 change、383 个登记文件。
- Chromium 与 WebKit 桌面隔离启动浏览器各 11 项通过，错误数组为空；测试使用临时 SQLite、模拟邮箱和浏览器上下文，不等于 Android WebView、iPhone Safari/PWA 或 HarmonyOS ArkWeb 真机验证。
- 未访问正式服务或数据库，未创建宿舍、PR，未合并 main，未部署。原开发工作树中的 `site/runtime/email-runtime.cjs` 用户修改没有触碰。
