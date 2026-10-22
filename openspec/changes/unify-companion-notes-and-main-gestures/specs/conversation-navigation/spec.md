## Purpose
为正式与游客宿舍现有界面提供单一对话留言流程，并让移动用户在不干扰任务操作、日期和消息手势的前提下，通过页面空白区域切换相邻主页面；所有发送继续复用既有权限和频率限制。
## ADDED Requirements
### Requirement: Confirmed conversational notes
系统 SHALL 区分球球单击聊天与双击表情；留言必须通过明确对象、正文、确认预览和用户确认发送，复用当前宿舍身份与频控。
#### Scenario: Ambiguous recipient
- **WHEN** 姓名不匹配或无法明确识别
- **THEN** 提供本宿舍成员及全体选项，不猜测收件人，不发送
#### Scenario: Repeated confirmation or failure
- **WHEN** 发送期间连续确认，或者请求失败
- **THEN** 同时最多一个发送请求，失败保留草稿且不自动重试
### Requirement: Blank area navigation
系统 SHALL 仅在主页面空白横向手势成立时切换相邻页面，沿用现有页面过渡与导航状态。
#### Scenario: Independent control gesture
- **WHEN** 从按钮、输入、日期、可滑卡片、弹窗或抽屉起手
- **THEN** 全局导航不抢占该操作；系统边缘返回和纵向滚动保持可用
