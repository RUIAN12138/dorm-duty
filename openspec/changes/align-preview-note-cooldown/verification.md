# Verification

- `DORM_PARITY_MEMBERS=2 node frontend/src/components/onboarding/sandbox/backendParity.test.mjs`：隔离两人场景，真实后端和预览均在 14 秒时拒绝、15 秒时接受再次留言；10 项对照通过。
- 一人对照 10 项、纯预览沙箱 32 项通过。催促冷却未修改。
- 使用隔离 SQLite 与模拟邮箱，没有访问生产数据；未验证真实设备。
