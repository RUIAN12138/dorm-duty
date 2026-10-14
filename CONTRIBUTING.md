# 协作开发

## 本地启动

使用 Node.js 22.13 或更新版本，推荐 22.23。项目根目录执行 `./scripts/local.sh`，默认访问 `http://127.0.0.1:8081/`。首次启动安装锁定依赖并构建网站，数据库保存在忽略的 `data/` 目录。

实时修改页面时保留本地后台，运行 `DORM_API_ORIGIN=http://127.0.0.1:8081 npm --prefix frontend run dev`。

当前线上业务使用 `site/worker/` 的 Node / Worker 共用实现；`backend/` 是保留的 FastAPI 账号版。改当前自由轮次和抬水规则时，先查看 `site/worker/chores.mjs`，不要只改旧 Python 后台。

## 提交与检查

每项修改使用独立分支，通过 Pull Request 描述问题、改动和实际验证情况。避免把构建通过写成真机通知已验收。

每次 push 到 main、打开或更新 PR，GitHub Actions 自动运行前端构建、业务与通知检查以及安卓调试包构建 / lint。工作流不发布网站，不使用生产凭据，不构建未配置签名的鸿蒙分发包。

本地对应命令：

```bash
npm ci --prefix frontend
npm ci --prefix site
npm run build --prefix frontend
node site/scripts/embed-frontend.mjs
node site/scripts/check-worker.mjs
node site/scripts/check-rounds.mjs
node site/scripts/check-member-push.mjs
node site/scripts/check-native-push.mjs
node site/scripts/check-water-nudge.mjs
node site/scripts/check-completion.mjs
node site/scripts/check-native-back.mjs
```

完整业务回归另运行 `node site/scripts/check-cloud-backend.mjs` 和 `node site/scripts/check-chores.mjs`。安卓 / 鸿蒙工程与构建条件见 [native/README.md](native/README.md)。

## 验收与发布

- 修改手机交互时，验证 320 / 390 像素布局、普通点击、返回 / 取消及刷新后的成员身份。
- 打卡确认与任务同步必须分开：服务器确认保存后，同步失败不等于打卡失败；不要因为 GET 失败再次提交已完成的任务。
- 保留地板 / 厕所独立自由轮次、抬水按完成推进的规则与已完成历史。
- 数据库、真实凭据、签名私钥、设备日志和生产数据不提交。数据库迁移新增文件，禁止重写已应用迁移。
- 正式发布使用独立版本、在线备份、历史校验、健康检查和资源校验，见 [部署说明](docs/SERVER_DEPLOYMENT.md)。
