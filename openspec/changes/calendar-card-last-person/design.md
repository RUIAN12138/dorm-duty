# Design
activity 全历史投影按完成时间和 id 降序每个任务选择一条，返回既有 key、completed_at 和 assignee_name，沿用宿舍鉴权与修正、撤销过滤。预览使用草稿记录相同规则。ActivitySummary 负责卡片翻面、键盘与读屏语义及暂停轮播，SwipeCardDeck 保留既有跟手和阈值，将短拖恢复曲线调整为轻度弹性并防止拖动触发点击。支持减少动态效果。
