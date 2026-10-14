# 免费 Pages 入口

> 2026-10-14 更新：正式服务已迁至 [HTTPS IP 入口](https://8.148.190.114/dorm-duty/)。旧 Workers 与 Pages 生产入口已改为迁移跳转，旧业务接口返回 410，不再写原 D1。下文是此前 Cloudflare 阶段的历史记录，不能作为当前正式发布状态。服务器验证及维护见 [SERVER_DEPLOYMENT](SERVER_DEPLOYMENT.md)。


目标是提供可用的免费公网入口，并验收真实浏览器、手机 Wi-Fi 与蜂窝网络；不承诺任何公网服务在所有地区和任何时刻必定连接成功。

目前 `workers.dev` 已部署且限定解析的 HTTPS 服务检查正常，但用户电脑和手机普通网络访问失败。因此准备同账号 Pages 第二入口，实际连通性仍需发布后验证，不能仅凭更换后缀判定已修复。

## 部署包

在 `site/` 运行 `npm run pages:build`，会生成只包含公开前端资源和同一 Worker 的 `pages-dist/`。原 `wrangler.json` 与 Workers 发布保持独立，Pages 源配置是 `wrangler.pages.json`，构建复制到 `.wrangler/pages-release/wrangler.json` 并在该目录发布；Pages 不接受自定义 `--config` 路径。

- 项目名：`lundao-dorm-duty-2968530971`，真实域名以创建结果为准；准备状态不代表域名已注册。
- D1：复用 `lundao-dorm-duty-db`，不新建、重置或导入本地数据。
- `_worker.js` 与已部署 Worker 字节一致，处理同源 API、三个 SPA 深链接与 Service Worker。
- `_routes.json` 仅让 `/assets/*`、`/marks/*`、`/icons/*` 绕过 Worker；任务 API 不会回到 `workers.dev` 或本机。
- 公开资产不占用额外的 Functions 调用；实际免费额度以 Cloudflare 账号和当前产品限制为准。
- 不读取或上传本地 SQLite、账号凭据、手机数据。

构建与编译：

```sh
npm run pages:build
node scripts/check-worker.mjs
npx --yes wrangler@4.149.0 pages functions build --build-output-directory pages-dist --outdir .wrangler/pages-check --compatibility-date 2026-10-12
```

## 发布权限

当前 Workers OAuth 凭据未包含 `pages:write`，Pages 项目列表请求返回 Cloudflare API 10000 授权错误。Pages 发布需账号本人在官方授权页补上这一权限，保留现有账号读取、Workers 与 D1 权限。具体一次性设备代码只在本次授权流程中显示，不写入项目文档。

授权后先查当前账号的项目列表，重用同名项目或创建明确的新项目；生产分支为 `main`。再运行 `npm run pages:deploy`。只在命令返回真实 URL 后记录发布结果，不将预计 URL 当成已部署。

## 发布后的验收

1. 正常浏览器网络打开首页和 `/health`，而非只有缓存界面。
2. 验证 `/water`、`/calendar`、前端资源、SW 和同源 API 与构建一致。
3. 用独立假数据宿舍验收创建、加入、自定义、打卡、抬水轮换、提醒与日历，保存证据。
4. 手机 Wi-Fi 与蜂窝网络分别打开新标签页、获取最新任务、完成一次测试操作；记录网络和结果，不用固定 IP 请求代替用户实际访问。
5. 新域名与旧域名的浏览器身份存储独立。已有成员需要用邀请码重新选择，创建者的原设备管理凭据不会自动跨域复制；不得声称新入口自动恢复原管理员身份。

官方参考：[Pages Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)、[Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)、[Wrangler 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。
