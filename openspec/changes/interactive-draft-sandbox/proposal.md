# Why
持续目标要求预览与真实界面一致、操作高效，完善架构且不PR/发布。当前复用正式UI，但打卡/撤销仅toast，不能检验创建规则操作结果。
# What Changes
建立仅内存的创建预览服务，复用正式组件和原回执动画接线；允许按原规则演练完成、撤销、轮次/交接、日历、催促及留言，不发送通知或调用AI。公共注入接口明确服务种类，教程保留原行为。任务规则变化重建沙箱，单纯导航排序/退出重入保留操作状态。
# Capabilities
## New Capabilities
- `draft-sandbox`: 有规则校验与回执的本地预览服务。
## Modified Capabilities
无正式API权限或数据库变化。
# Impact
限创建专属沙箱、LiveDraftPreview、明确本地服务接口、tutorialPractice注入别名和ChoreBoard必要分流。无UI重设计、无新依赖、无生产数据库、无PR/部署。沙箱模拟不等于服务端实现验收。
