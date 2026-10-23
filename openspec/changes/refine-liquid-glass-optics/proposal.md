## Why
用户要求仅精修四处Liquid Glass材质，保留现有Vue、黑白布局、玻璃手势和键盘联动。当前已有局部WebGL导航透镜，其他目标表面或偏实色或缺边缘光学层。
## What Changes
复用原局部透镜、抽象只作用背景的光学层与能力降级，精修底栏、聊天输入、椭圆消息和日历scrub分段器。参考rdev/liquid-glass-react的边缘位移、RGB微偏移、SDF和平滑形变；不引入React。
## Capabilities
### New Capabilities
- `liquid-glass`: scoped optical enhancement with stable foreground and graceful fallback.
### Modified Capabilities
无业务规则变化。
## Impact
仅scope.json所列路径。保留已有键盘和单双击预览修复，不更改其内容；它们作为独立前置提交披露。本次最后原话“完成后提交 pr 更新网站”明确授权完成隔离检查后PR与部署查看，覆盖本批次先确认的动作限制，不追认产品或实体设备验收，不授权合并main。
