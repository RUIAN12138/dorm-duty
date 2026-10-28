# Verification

- `node site/scripts/check-optional-task-draft.mjs`：隔离 SQLite 中创建停用未命名任务、读取任务页、保存、拒绝空名启用及填写名称后启用均通过；旧宿舍的宿舍、设置、分类、任务与提醒表快照不变。
- `node scripts/check-dorm-wizard.mjs`：108 项隔离检查通过，包括配置与权限。
- `node site/scripts/check-dynamic-task-migration.mjs`：4 项检查、7 表保留通过。
- `node site/scripts/check-cloud-backend.mjs`：通过；`npm run spec:check`：通过。
- 尚未执行实体设备或真实宿舍验收；未访问或修改生产数据库、未部署。
