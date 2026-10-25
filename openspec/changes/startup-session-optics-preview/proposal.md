## Why
用户要求修复启动闪登录、持久登录、轻启动动画、准确球球图标，审查AI限制，并独立评估WebGL及修复抬水详情。
## What Changes
只处理直接关联启动、凭证存储、资源与抬水详情。WebGL为独立实验，不默认采用。
## Capabilities
### New Capabilities
- `startup`: 启动验证状态与隔离实验
### Modified Capabilities
无。
## Impact
Vue及既有原生图标配置，不新增React或运行时依赖。禁止PR、main、部署。

## 2026-10-25 补充：Android 安装版强停后邮箱会话恢复
用户确认 Android 安装版强制关闭后立即重开就要求重新登录。源码显示邮箱登录凭证为服务端签发的 HttpOnly Cookie（30 天）；Android 目前仅在 Activity 暂停时调用 CookieManager.flush()。增加仅用于可信站点的原生 Cookie 持久化确认：邮箱验证成功或邮箱退出完成后，前端请求原生 WebView 刷写 Cookie；原生不向 JavaScript 暴露 Cookie 或令牌。保持服务端会话有效期、身份验证、退出撤销和旧宿舍数据不变。该修复须在 Android 安装版强停重开后实测，桌面浏览器与 Android 构建均不能替代该验收。
