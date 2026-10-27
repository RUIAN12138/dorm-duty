# Verification
2026-10-27 独立开发分支。共享规则只提取原实现，正式规则没有放宽；预览成员仍合成负ID、无令牌，复用原ChoreBoard副作用拦截。

- `node --experimental-strip-types site/shared/draft-preview-rules.test.mjs`：2060项通过；旧/新宿舍、demo、本人/他人、已完成/取消、未来日期、执行时刻前/等于/后组合与提取前表达式逐一相同；预览模式/时间/轮次/日历/稳定ID/草稿不可变性。
- `node scripts/check-dorm-wizard.mjs`：108项通过，临时SQLite含硬性代做、软性禁止替他人、越权拒绝后副作用不变与自定义任务等。
- `node site/scripts/check-dynamic-task-migration.mjs`：7表旧行快照一致、4项检查通过。
- `node site/scripts/check-auth-boundaries.mjs`：89项通过；注入邮件，无真实投递。
- `npm run typecheck --prefix frontend`、`npm run build --prefix frontend -- --outDir ../data/draft-rules-dist`通过。已有大分块提示保留。
- `DORM_WIZARD_ORIGIN=http://127.0.0.1:8119 node scripts/check-preview-task-navigation.mjs` 与加 `DORM_BROWSER=webkit`：两引擎各40项通过；正式/预览真实组件位置2px内一致、切换/详情/零fetchXHR/零业务写入、旧宿舍临时数据不变。原脚本未改。数据预览规则改变，没有改布局。
- `npm run spec:check`通过；发布/PR摘要因新改动过期，本轮不刷新授权，不发布。

预览：http://127.0.0.1:8119/?preview=new-dorm 。证据在data/draft-preview-*.log与data/preview-task-navigation/{chromium,webkit}/。桌面引擎模拟移动视口，不是iPhone/Android/Harmony实体设备验收。仍未实现真实完成写入的预览演练：原预览按钮会提示不记录，此问题留后续专门沙箱服务实现，不能冒称预览全部真实可操作。
