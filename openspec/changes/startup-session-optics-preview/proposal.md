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
