# Uber Eats 集成契约测试

本目录是跨实现层的稳定验收边界。测试按 `merchant`、`webhook`、`orders`、
`menu`、`operations` 五个能力域读取同一份 `acceptanceMatrix`，不引用 workflow
私有方法。后续拆分 service 或 workflow 时，不应改写契约来迁就实现。

每个场景固定七类结果：输入、API 状态码、数据库状态迁移、Uber 请求次数、
对外响应、幂等/并发结果和日志禁用字段。具体矩阵见 `contract-matrix.ts`。

## 迁移阶段验收

| 阶段       | API                                          | 数据库                               | Uber 请求               | 幂等                          | 日志                                |
| ---------- | -------------------------------------------- | ------------------------------------ | ----------------------- | ----------------------------- | ----------------------------------- |
| merchant   | OAuth 成功、过期、错会话及重复回调状态码固定 | state 只能 `ISSUED -> CONSUMED` 一次 | token exchange 最多一次 | 并发仅一个消费者成功          | 不含 code、state、session、token    |
| webhook    | 签名及错误分类状态码固定                     | inbox claim、终态与可重试态固定      | 路由本身不额外请求 Uber | eventId/内容哈希仅处理一次    | 不含签名、认证头及 payload 身份数据 |
| orders     | 导入及校验响应固定                           | 订单、明细、action/outbox 原子迁移   | 动作最多一次            | 通知与三类动作可重放、可并发  | 不含顾客、token、认证头             |
| menu       | dry-run、发布及超时响应固定                  | draft 不变且 publish 状态可审计      | dry-run 为零，上传一次  | 同版本不重复上传              | 不含 token、认证头                  |
| operations | 门店、同步、对账及工单响应固定               | snapshot/report/ticket 迁移固定      | 每次 claim 最多一次     | provision 和工单 claim 可重放 | 不含门店隐私、token、认证头         |

`fixtures/` 只保存虚构、最小化 payload。禁止加入真实顾客姓名、电话、邮箱、
地址、门店身份或任何 access/refresh token；契约测试会扫描常见敏感字段。
