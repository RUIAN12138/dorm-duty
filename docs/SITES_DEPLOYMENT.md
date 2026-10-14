# Sites 托管发布记录

更新：2026-10-12（Asia/Shanghai）。

**本轮新版尚未发布；最后确认的发布记录为 2026-10-11 旧代理版本。** 黑白免账号入口及 Workers + D1 后端已完成本地验收；Sites 返回「Sites project not found」，当前账号站点列表为空，无法确认或更新现在的线上内容。恢复原账号 / 工作区后继续发布同一站点。最新步骤见 [CLOUDFLARE_DEPLOYMENT](CLOUDFLARE_DEPLOYMENT.md)。新版先创建 / 加入宿舍，六人默认项仅作主动选择的游客模式。

以下保留 2026-10-11 历史记录，不代表新版已部署。

当前固定入口：[轮到 · 宿舍值日](https://lundao-dorm-duty.dapper-eft-1618.chatgpt.site)

![Sites 手机入口二维码](evidence/sites-deploy/mobile-qr.png)

## 手机访问

使用 Safari 打开上面的地址。当前 Sites 访问范围为仅本人，首次打开可能需要登录与创建站点相同的 ChatGPT 账号；随后使用网站自己的账号注册 / 登录。原来本地验收环境的业务账号仍可使用，进入新域名后需要重新登录。网站入口权限与宿舍成员权限是两层独立控制。

需要主屏幕图标时，从新地址的 Safari 分享菜单添加到主屏幕。旧临时域名的图标不会自动指向新站点；通知订阅也不能跨域自动迁移。主屏幕安装、软键盘和锁屏推送仍需 iPhone 真机检查。

## 托管范围

| 模块                                     | 当前运行位置                    | Mac 停止后的状态                   |
| ---------------------------------------- | ------------------------------- | ---------------------------------- |
| Vue 网页、图标、Manifest、Service Worker | Sites / Cloudflare Workers      | 固定网站入口和静态页面仍由平台提供 |
| 同域 API 网关                            | Sites Worker                    | 仍存在，连接不到后端时返回错误     |
| FastAPI、SQLite、唯一提醒 worker         | 当前 Mac，经 HTTPS 临时隧道访问 | 登录、排班、打卡和提醒不能正常执行 |

该次发布完成的是固定前端托管和 API 代理，没有迁移 Python 后端和数据库。2026-10-12 已实现 Workers + D1 业务适配，保留原接口路径并移除上游代理，等待发布。Cloudflare 也提供 Python Workers / ASGI 支持，但不会自动迁移 SQLAlchemy 数据库和 APScheduler 常驻进程。

`API_ORIGIN` 由 Sites 原生运行时配置管理，不在托管 Manifest 中存放。代理只转发业务必要的请求头，不向后端转发 Sites 服务凭据、ChatGPT 身份信息或 Cookie。个人 API 使用 `no-store`；SW、Manifest、首页使用 `no-cache`，哈希资源使用长期缓存。当前上游仍是临时隧道，重建隧道后应更新该配置并重新部署现有站点版本。

## 已完成验证

- 24 个正式前端资源与原 Vue 构建逐字节一致；Worker 路由、方法、正文、请求头、重定向、缓存和错误处理共 167 项断言通过。
- 平台原生部署返回 `succeeded`，源码与部署包来自同一个已推送提交。发布信息见 [deployment.json](evidence/sites-deploy/deployment.json)。
- 真实 Sites 地址上，Chrome 模拟手机 390×844 验证了双用户注册、独立宿舍、邀请码加入、30 天排班、本人 UI 打卡、两个会话刷新同步、重复打卡 409、匿名业务接口 401 与 API 不缓存。
- HTTPS、Service Worker 注册及刷新后接管、standalone Manifest、私人 API 不在静态缓存中均通过。六个页面无横向溢出、无浏览器运行错误。

完整结果见 [hosted-smoke.json](evidence/sites-deploy/hosted-smoke.json)，截图见 [手机首页](evidence/sites-deploy/hosted-home-390.png)。测试仅使用新建的假数据宿舍，没有调整原有宿舍。当前使用 Sites 服务访问凭据完成平台私有访问边界内的核验；它不等于已经允许室友访问网站入口。

## 后续维护

托管源码位于 `site/`，站点身份保存在 `site/.openai/hosting.json`。更新时必须复用该 `project_id`，不要重复创建新站。构建方法见 [site/README.md](../site/README.md)，发布继续使用 Sites 的源码同步和部署工具；平台凭据只通过隐藏 stdin 使用，不写文件、日志或前端。

访问范围目前保持新站默认的仅本人。在明确需要开放室友访问后，再调整平台入口权限；账号登录、宿舍成员校验和管理员授权仍由 FastAPI 执行。当前 VAPID 尚未配置，站内通知沿用后端实现，系统推送与长期后台运行尚未完成验收。
