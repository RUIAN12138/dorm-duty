## Why
用户要求消息浮窗专项修复，并明确发布到指定Sites测试站；未经确认不发布正式服务器。
## What Changes
统一长按/展开/编辑/收起阶段，保护同一触摸；分离玻璃裁切和交互层；取消回复保持未读，关闭消息/上滑/发送成功标对应id已读。复用原重试队列。
## Capabilities
### New Capabilities
- `banner-polish`: 消息浮窗连续性及精确已读
### Modified Capabilities
无。
## Impact
仅scope文件，正常构建无测试入口；Sites专用测试构建含合成数据、失败开关和状态复核，不连接正式API。
