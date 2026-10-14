# 协作开发

两人共用 `lihao505/dorm-duty` 仓库，各自使用自己的 GitHub 账号和任务分支，通过 PR 互相审查。开始修改前，在 Issues 里选择「问题反馈」或「开发任务 / 功能需求」，指定负责人，约定验收标准。

## 第一次加入

仓库所有者在 Settings → Collaborators 中邀请另一位开发者；接受邀请后再推送分支。另一位开发者首次下载：

```bash
git clone https://github.com/lihao505/dorm-duty.git
cd dorm-duty
```

仓库是公开的；公开 Issues、PR 和附件同样不能包含真实宿舍数据或凭据。测试使用各自本地的演示 / 测试宿舍。

## 本地启动

使用 Node.js 22.13 或更新版本，推荐 22.23。项目根目录执行 `./scripts/local.sh`，默认访问 `http://127.0.0.1:8081/`。首次启动安装锁定依赖并构建网站，数据库保存在忽略的 `data/` 目录。

实时修改页面时保留本地后台，运行 `DORM_API_ORIGIN=http://127.0.0.1:8081 npm --prefix frontend run dev`。

上面的 shell 启动方式适用于 macOS / Linux。Windows 可以在 PowerShell 安装 Node.js 22.13 或更新版本，依次执行下面的命令；这是通用 Node 启动方式，Windows 实机启动尚待验收：

```powershell
npm ci --prefix frontend
npm ci --prefix site
npm run build --prefix frontend
node site/scripts/embed-frontend.mjs
node scripts/local-server.mjs
```

另开 PowerShell 终端做前端实时开发：

```powershell
$env:DORM_API_ORIGIN = "http://127.0.0.1:8081"
npm --prefix frontend run dev
```

当前线上业务使用 `site/worker/` 的 Node / Worker 共用实现；`backend/` 是保留的 FastAPI 账号版。改当前自由轮次和抬水规则时，先查看 `site/worker/chores.mjs`，不要只改旧 Python 后台。

## 提交与检查

每项修改使用独立分支，通过 Pull Request 描述问题、改动和实际验证情况。避免把构建通过写成真机通知已验收。

工作区没有未提交修改时，从最新 main 开始一项任务：

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/calendar-polish
```

分支名使用 `codex/` 前缀并描述任务，两位开发者分别使用不同分支。避免同时大范围改动同一文件；接口变化先在对应 Issue / PR 中约定字段、权限和兼容方式。

完成修改后先运行相关检查，查看 `git diff`，只暂存本任务的文件，再提交并推送当前分支。网页前端任务示例：

```bash
git status
git diff
git add frontend/src
git diff --cached
git commit -m "改进日历完成记录展示"
git push -u origin codex/calendar-polish
```

如果修改了其他目录，也要检查并暂存相关文件。GitHub 创建 PR 时，base 选择 main，填写自动出现的 PR 模板；用 `Closes #编号` 关联任务。另一位开发者检查差异和本地运行结果，问题解决后批准，使用 Squash and merge 合并。

`main` 的协作目标是：必须经 PR、至少一位其他开发者批准、`web-and-business` 与 `android` 检查通过、解决审查讨论、禁止强推和删除。自动检查通过不能替代人工审查。仓库所有者也应遵守这些规则；刚加入协作前只有一个账号时，需要先邀请第二位开发者才能满足互相批准。

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

## 同步与解决冲突

合并后，双方在工作区干净时更新本地 main：

```bash
git switch main
git pull --ff-only origin main
```

正在开发的分支需要吸收 main 改动时，先提交自己的修改，继续留在任务分支：

```bash
git fetch origin
git merge origin/main
```

有冲突时与另一位开发者确认业务意图，编辑冲突文件、暂存并完成合并，再执行相关检查。无法确定如何保留逻辑时，用 `git merge --abort` 返回合并前状态，讨论后再处理。不要用强制推送覆盖对方历史。

## 验收与发布

PR 合并和正式发布是两个独立步骤。当前 Actions 只检查代码，不自动发布网站。两人指定一位发布负责人，发布前确认目标提交 SHA、检查结果、数据库迁移和回退版本；完成后在 PR / 发布记录中填写线上版本与验收结果。另一位开发者无需获取服务器 root 密码或推送私钥即可完成本地开发。

- 修改手机交互时，验证 320 / 390 像素布局、普通点击、返回 / 取消及刷新后的成员身份。
- 打卡确认与任务同步必须分开：服务器确认保存后，同步失败不等于打卡失败；不要因为 GET 失败再次提交已完成的任务。
- 保留地板 / 厕所独立自由轮次、抬水按完成推进的规则与已完成历史。
- 数据库、真实凭据、签名私钥、设备日志和生产数据不提交。数据库迁移新增文件，禁止重写已应用迁移。
- 正式发布使用独立版本、在线备份、历史校验、健康检查和资源校验，见 [部署说明](docs/SERVER_DEPLOYMENT.md)。
