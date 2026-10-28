# Verification

- `node frontend/src/components/onboarding/sandbox/backendParity.test.mjs`：一位模拟成员，四种任务的真实 API 与沙箱初始状态、完成、撤销对照，10 项通过。
- `DORM_PARITY_MEMBERS=2 node frontend/src/components/onboarding/sandbox/backendParity.test.mjs`：模拟邮箱验证加入第二名成员，比较当前负责人、本人完成与撤销、软性任务拒绝代做，9 项通过。
- 均使用隔离 SQLite、模拟邮箱，无真实宿舍数据；以上不是设备或线上服务验收。
