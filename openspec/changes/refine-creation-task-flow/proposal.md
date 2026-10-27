# Why
用户最新要求“现在重点优化宿舍创建页面”。本批聚焦新版向导的信息重复、多任务单屏与子面板切换，不修改旧宿舍或正式页面。
# What Changes
分离任务选择与任务名称编辑；选择页不重复列出同名胶囊，编辑及单项规则使用固定单行任务切换条。选择/编辑与规则子面板采用稳定网格占位的短过渡，离场内容不可操作；保持当前五步、标题字号、宿舍名称输入框与进度条。
# Capabilities
## New Capabilities
- `creation-task-flow`: 单屏任务选择与连续子面板编辑。
## Modified Capabilities
无服务端业务规则变化。
# Impact
仅DormWizard.vue创建分支、新专属CreationTaskRail及专项浏览器检查。保持workspace模式、草稿数据结构、任务ID、创建API和模拟预览。只提交开发分支与交接；不PR/合并/部署，待用户验收。
